import assert from "node:assert/strict";
import { it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import {
  BrowserPolicyDecision,
  EvidenceBundle,
  PreviewTarget,
  ReviewerDecision,
} from "./browserOrchestration";

const ISO = "2026-04-27T00:00:00.000Z";

const decodeEvidenceBundle = Schema.decodeUnknownEffect(EvidenceBundle);
const decodeReviewerDecision = Schema.decodeUnknownEffect(ReviewerDecision);
const decodePreviewTarget = Schema.decodeUnknownEffect(PreviewTarget);
const decodeBrowserPolicyDecision = Schema.decodeUnknownEffect(BrowserPolicyDecision);

const viewport = {
  id: "desktop",
  label: "Desktop",
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
};

const codeState = {
  repoRoot: "/tmp/orchestrate",
  baseSha: "base-sha",
  headSha: "head-sha",
  dirtyHash: "dirty-hash",
  changedFiles: ["apps/web/src/App.tsx"],
  diffArtifactRef: "artifact-diff",
  capturedAt: ISO,
};

it.effect("decodes EvidenceBundle with required CodeStateRef", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeEvidenceBundle({
      id: "bundle-1",
      sessionId: "session-1",
      workflowRunId: "workflow-1",
      previewTargetId: "target-1",
      taskSpecId: "task-spec-1",
      acceptanceCriteriaId: "criteria-1",
      permissionPolicyId: "policy-1",
      browserSessionId: "browser-session-1",
      codeState,
      artifactRefs: ["artifact-shot"],
      eventRefs: ["event-1"],
      createdAt: ISO,
    });

    assert.strictEqual(parsed.id, "bundle-1");
    assert.strictEqual(parsed.codeState.diffArtifactRef, "artifact-diff");
  }),
);

it.effect("rejects EvidenceBundle without CodeStateRef", () =>
  Effect.gen(function* () {
    const result = yield* Effect.exit(
      decodeEvidenceBundle({
        id: "bundle-1",
        sessionId: "session-1",
        workflowRunId: "workflow-1",
        previewTargetId: "target-1",
        taskSpecId: "task-spec-1",
        acceptanceCriteriaId: "criteria-1",
        permissionPolicyId: "policy-1",
        browserSessionId: "browser-session-1",
        artifactRefs: ["artifact-shot"],
        eventRefs: ["event-1"],
        createdAt: ISO,
      }),
    );

    assert.strictEqual(result._tag, "Failure");
  }),
);

it.effect("rejects ReviewerDecision without EvidenceBundle reference", () =>
  Effect.gen(function* () {
    const result = yield* Effect.exit(
      decodeReviewerDecision({
        id: "decision-1",
        sessionId: "session-1",
        workflowRunId: "workflow-1",
        outcome: "accepted",
        confidence: "high",
        criteria: [
          {
            criterionId: "criterion-1",
            status: "pass",
            evidenceRefs: ["artifact-shot"],
            reason: "Verified by screenshot.",
          },
        ],
        findings: [],
        unresolvedCriteria: [],
        userVisibleSummaryRef: "artifact-summary",
        createdAt: ISO,
      }),
    );

    assert.strictEqual(result._tag, "Failure");
  }),
);

it.effect("rejects evidence-backed criterion results without evidence refs", () =>
  Effect.gen(function* () {
    const result = yield* Effect.exit(
      decodeReviewerDecision({
        id: "decision-1",
        sessionId: "session-1",
        workflowRunId: "workflow-1",
        evidenceBundleId: "bundle-1",
        outcome: "accepted",
        confidence: "high",
        criteria: [
          {
            criterionId: "criterion-1",
            status: "pass",
            evidenceRefs: [],
            reason: "Missing evidence should fail.",
          },
        ],
        findings: [],
        unresolvedCriteria: [],
        userVisibleSummaryRef: "artifact-summary",
        createdAt: ISO,
      }),
    );

    assert.strictEqual(result._tag, "Failure");
  }),
);

it.effect("decodes PreviewTarget with immutable version and readiness evidence", () =>
  Effect.gen(function* () {
    const parsed = yield* decodePreviewTarget({
      id: "target-1",
      version: 1,
      sessionId: "session-1",
      kind: "local-dev-server",
      canonicalUrl: "http://localhost:5173/",
      baseUrl: "http://localhost:5173",
      initialRoute: "/",
      devServerInstanceId: "server-1",
      launchConfigId: "web",
      allowedOrigins: ["http://localhost:5173"],
      deniedOrigins: [],
      authMode: "none",
      permissionTier: "isolated-local-preview",
      viewports: [viewport],
      readinessEvidenceRef: "artifact-health",
      serverLogRefs: ["artifact-logs"],
      createdAt: ISO,
    });

    assert.strictEqual(parsed.version, 1);
    assert.strictEqual(parsed.readinessEvidenceRef, "artifact-health");
  }),
);

it.effect("decodes BrowserPolicyDecision requiring approval", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeBrowserPolicyDecision({
      outcome: "requires-approval",
      approvalKind: "external-navigation",
      reason: "Target origin is outside the preview policy.",
    });

    assert.strictEqual(parsed.outcome, "requires-approval");
  }),
);
