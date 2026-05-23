/**
 * ModelRegistryService - Service interface for model capability profiles and selection.
 *
 * Maintains a registry of model capability profiles and provides candidate
 * matching and worker model binding resolution based on required capabilities
 * and model policies.
 *
 * @module ModelRegistryService
 */
import { ServiceMap } from "effect";
import type { Effect } from "effect";
import type {
  OrchestratorCapabilityProfile,
  OrchestratorModelCandidate,
  OrchestratorModelPolicy,
  OrchestratorWorkerModelBinding,
  OrchestratorWorkerId,
  RequiredCapability,
} from "@orchestrate/contracts";

export interface ModelRegistryShape {
  /** Return all known capability profiles. */
  readonly getProfiles: () => Effect.Effect<ReadonlyArray<OrchestratorCapabilityProfile>>;

  /** Filter and rank profiles that satisfy every required capability. */
  readonly findCandidates: (
    required: ReadonlyArray<RequiredCapability>,
  ) => Effect.Effect<ReadonlyArray<OrchestratorModelCandidate>>;

  /** Select the best model for a worker based on policy, returning a binding. */
  readonly resolveBinding: (
    workerId: OrchestratorWorkerId,
    policy: OrchestratorModelPolicy,
  ) => Effect.Effect<OrchestratorWorkerModelBinding>;
}

/**
 * ModelRegistryService - Service tag for model registry access.
 *
 * @example
 * ```ts
 * const program = Effect.gen(function* () {
 *   const registry = yield* ModelRegistryService
 *   const candidates = yield* registry.findCandidates(["code-edit", "planning"])
 * })
 * ```
 */
export class ModelRegistryService extends ServiceMap.Service<
  ModelRegistryService,
  ModelRegistryShape
>()("t3/orchestration/Services/ModelRegistry/ModelRegistryService") {}
