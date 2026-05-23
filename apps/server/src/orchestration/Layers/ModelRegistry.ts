/**
 * ModelRegistryLive - Layer implementation for ModelRegistryService.
 *
 * Maintains a static registry of model capability profiles and provides
 * candidate matching, ranking, and worker model binding resolution.
 *
 * @module ModelRegistryLive
 */
import type {
  OrchestratorCapabilityProfile,
  OrchestratorModelCandidate,
  OrchestratorWorkerModelBinding,
} from "@orchestrate/contracts";
import { Effect, Layer } from "effect";

import { ModelRegistryService, type ModelRegistryShape } from "../Services/ModelRegistry.ts";

// ---------------------------------------------------------------------------
// Static capability profiles
// ---------------------------------------------------------------------------

const CAPABILITY_PROFILES: ReadonlyArray<OrchestratorCapabilityProfile> = [
  {
    provider: "codex",
    model: "o3-pro",
    supports: ["code-edit", "planning", "integration", "large-context"],
    costTier: "high",
    latencyTier: "medium",
  },
  {
    provider: "codex",
    model: "gpt-4.1",
    supports: ["code-edit", "fast-response", "test-execution"],
    costTier: "medium",
    latencyTier: "low",
  },
  {
    provider: "claudeAgent",
    model: "claude-opus-4-6",
    supports: ["code-edit", "structured-review", "planning", "large-context", "browser-use"],
    costTier: "high",
    latencyTier: "medium",
  },
  {
    provider: "claudeAgent",
    model: "claude-sonnet-4-6",
    supports: ["code-edit", "fast-response", "test-execution", "repo-inspection"],
    costTier: "medium",
    latencyTier: "low",
  },
  {
    provider: "claudeAgent",
    model: "claude-haiku-4-5",
    supports: ["fast-response", "low-cost", "repo-inspection"],
    costTier: "low",
    latencyTier: "low",
  },
];

// ---------------------------------------------------------------------------
// Cost/latency tier weights for ranking
// ---------------------------------------------------------------------------

const COST_WEIGHT: Record<string, number> = { low: 3, medium: 2, high: 1 };
const LATENCY_WEIGHT: Record<string, number> = { low: 3, medium: 2, high: 1 };
const now = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const makeModelRegistry = Effect.succeed(
  (() => {
    const getProfiles: ModelRegistryShape["getProfiles"] = () =>
      Effect.succeed(CAPABILITY_PROFILES);

    const findCandidates: ModelRegistryShape["findCandidates"] = (required) =>
      Effect.succeed(
        CAPABILITY_PROFILES.filter((profile) =>
          required.every((cap) => profile.supports.includes(cap)),
        )
          .map(
            (profile): OrchestratorModelCandidate => ({
              provider: profile.provider,
              model: profile.model,
              weight:
                (COST_WEIGHT[profile.costTier] ?? 1) + (LATENCY_WEIGHT[profile.latencyTier] ?? 1),
              reason: `Matched ${required.length} required capabilities`,
            }),
          )
          .toSorted((a, b) => b.weight - a.weight),
      );

    const resolveBinding: ModelRegistryShape["resolveBinding"] = (workerId, policy) =>
      Effect.gen(function* () {
        // Try preferred models first, filtered by required capabilities
        const preferred = policy.preferredModels
          .filter((candidate) => {
            const profile = CAPABILITY_PROFILES.find(
              (p) => p.provider === candidate.provider && p.model === candidate.model,
            );
            if (!profile) return false;
            return policy.requiredCapabilities.every((cap) => profile.supports.includes(cap));
          })
          .toSorted((a, b) => b.weight - a.weight);

        if (preferred.length > 0) {
          const top = preferred[0]!;
          return {
            workerId,
            provider: top.provider,
            model: top.model,
            selectedAt: now(),
            selectedBy: "root-policy",
            selectionReason: `Preferred model matched ${policy.requiredCapabilities.length} required capabilities`,
            inheritedFromTaskPolicy: true,
          } satisfies OrchestratorWorkerModelBinding;
        }

        // Fall back to fallback models from policy
        const fallbacks = (policy.fallbackModels ?? [])
          .filter((candidate) => {
            const profile = CAPABILITY_PROFILES.find(
              (p) => p.provider === candidate.provider && p.model === candidate.model,
            );
            if (!profile) return false;
            return policy.requiredCapabilities.every((cap) => profile.supports.includes(cap));
          })
          .toSorted((a, b) => b.weight - a.weight);

        if (fallbacks.length > 0) {
          const top = fallbacks[0]!;
          return {
            workerId,
            provider: top.provider,
            model: top.model,
            selectedAt: now(),
            selectedBy: "root-policy",
            selectionReason: `Fallback model matched ${policy.requiredCapabilities.length} required capabilities`,
            inheritedFromTaskPolicy: true,
          } satisfies OrchestratorWorkerModelBinding;
        }

        // Fall back to registry-wide candidate search
        const candidates = yield* findCandidates(policy.requiredCapabilities);
        if (candidates.length > 0) {
          const top = candidates[0]!;
          return {
            workerId,
            provider: top.provider,
            model: top.model,
            selectedAt: now(),
            selectedBy: "root-policy",
            selectionReason: `Registry fallback: ${top.reason}`,
            inheritedFromTaskPolicy: false,
          } satisfies OrchestratorWorkerModelBinding;
        }

        // Absolute fallback: default to claude-sonnet-4-6
        return {
          workerId,
          provider: "claudeAgent",
          model: "claude-sonnet-4-6",
          selectedAt: now(),
          selectedBy: "root-policy",
          selectionReason: "No candidates matched; defaulting to claude-sonnet-4-6",
          inheritedFromTaskPolicy: false,
        } satisfies OrchestratorWorkerModelBinding;
      });

    return { getProfiles, findCandidates, resolveBinding } satisfies ModelRegistryShape;
  })(),
);

export const ModelRegistryLive = Layer.effect(ModelRegistryService, makeModelRegistry);
