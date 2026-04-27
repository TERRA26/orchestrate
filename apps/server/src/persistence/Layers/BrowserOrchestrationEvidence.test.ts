import {
  AcceptanceCriteriaId,
  BROWSER_ORCHESTRATION_SCHEMA_VERSION,
  BrowserSessionId,
  EvidenceArtifactId,
  EvidenceBundleId,
  PermissionPolicyId,
  PreviewTargetId,
  ReviewerDecisionId,
  SessionEventId,
  TaskSpecId,
  WorkflowRunId,
} from "@orchestrate/contracts";
import { assert, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";

import { BrowserOrchestrationEvidenceRepository } from "../Services/BrowserOrchestrationEvidence.ts";
import { BrowserOrchestrationEvidenceRepositoryLive } from "./BrowserOrchestrationEvidence.ts";
import { SqlitePersistenceMemory } from "./Sqlite.ts";

const layer = it.layer(
  BrowserOrchestrationEvidenceRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
);

const now = "2026-04-27T00:00:00.000Z";
const later = "2026-04-27T00:00:01.000Z";

layer("BrowserOrchestrationEvidenceRepository", (it) => {
  it.effect("writes and reads evidence artifacts", () =>
    Effect.gen(function* () {
      const repo = yield* BrowserOrchestrationEvidenceRepository;

      yield* repo.writeEvidenceArtifact({
        artifactId: EvidenceArtifactId.makeUnsafe("artifact-screenshot"),
        schemaVersion: BROWSER_ORCHESTRATION_SCHEMA_VERSION,
        kind: "screenshot",
        sha256: "sha256-shot",
        byteSize: 42,
        contentType: "image/png",
        storageUri: "file:///tmp/shot.png",
        sensitivity: "workspace-internal",
        access: "safe-for-user-report",
        redactedArtifactId: null,
        supersededByArtifactId: null,
        metadataJson: JSON.stringify({ label: "desktop" }),
        createdAt: now,
      });

      const result = yield* repo.getEvidenceArtifact({
        artifactId: EvidenceArtifactId.makeUnsafe("artifact-screenshot"),
      });
      assert.ok(Option.isSome(result));
      const persisted = Option.getOrThrow(result);
      assert.strictEqual(persisted.kind, "screenshot");
      assert.strictEqual(persisted.metadataJson, JSON.stringify({ label: "desktop" }));
    }),
  );

  it.effect("appends session events and reads them in timeline order", () =>
    Effect.gen(function* () {
      const repo = yield* BrowserOrchestrationEvidenceRepository;

      yield* repo.appendSessionEvent({
        eventId: SessionEventId.makeUnsafe("event-2"),
        sessionId: "session-timeline",
        workflowRunId: WorkflowRunId.makeUnsafe("workflow-timeline"),
        type: "BrowserSnapshotCaptured",
        actor: "agent",
        artifactRefsJson: JSON.stringify(["artifact-shot"]),
        payloadJson: JSON.stringify({ snapshotId: "snapshot-1" }),
        occurredAt: later,
      });
      yield* repo.appendSessionEvent({
        eventId: SessionEventId.makeUnsafe("event-1"),
        sessionId: "session-timeline",
        workflowRunId: WorkflowRunId.makeUnsafe("workflow-timeline"),
        type: "BrowserSessionCreated",
        actor: "system",
        artifactRefsJson: JSON.stringify([]),
        payloadJson: JSON.stringify({ browserSessionId: "browser-session-1" }),
        occurredAt: now,
      });

      const events = yield* repo.getSessionEvents({ sessionId: "session-timeline" });
      assert.strictEqual(events.length, 2);
      assert.strictEqual(events[0]?.eventId, "event-1");
      assert.strictEqual(events[1]?.eventId, "event-2");
    }),
  );

  it.effect("creates evidence bundles with code state and reviewer decisions", () =>
    Effect.gen(function* () {
      const repo = yield* BrowserOrchestrationEvidenceRepository;

      yield* repo.createEvidenceBundle({
        bundleId: EvidenceBundleId.makeUnsafe("bundle-1"),
        sessionId: "session-review",
        workflowRunId: WorkflowRunId.makeUnsafe("workflow-review"),
        previewTargetId: PreviewTargetId.makeUnsafe("target-1"),
        taskSpecId: TaskSpecId.makeUnsafe("task-spec-1"),
        acceptanceCriteriaId: AcceptanceCriteriaId.makeUnsafe("criteria-1"),
        permissionPolicyId: PermissionPolicyId.makeUnsafe("policy-1"),
        browserSessionId: BrowserSessionId.makeUnsafe("browser-session-1"),
        codeStateJson: JSON.stringify({
          repoRoot: "/tmp/orchestrate",
          headSha: "head",
          dirtyHash: "dirty",
          changedFiles: ["apps/web/src/App.tsx"],
          diffArtifactRef: "artifact-diff",
          capturedAt: now,
        }),
        artifactRefsJson: JSON.stringify(["artifact-shot", "artifact-diff"]),
        eventRefsJson: JSON.stringify(["event-1"]),
        createdAt: now,
      });

      const bundle = yield* repo.getEvidenceBundle({
        bundleId: EvidenceBundleId.makeUnsafe("bundle-1"),
      });
      assert.ok(Option.isSome(bundle));
      assert.ok(Option.getOrThrow(bundle).codeStateJson.includes("dirtyHash"));

      yield* repo.createReviewerDecision({
        decisionId: ReviewerDecisionId.makeUnsafe("decision-1"),
        sessionId: "session-review",
        workflowRunId: WorkflowRunId.makeUnsafe("workflow-review"),
        evidenceBundleId: EvidenceBundleId.makeUnsafe("bundle-1"),
        outcome: "accepted",
        confidence: "high",
        criteriaJson: JSON.stringify([
          {
            criterionId: "criterion-1",
            status: "pass",
            evidenceRefs: ["artifact-shot"],
            reason: "Screenshot captured.",
          },
        ]),
        findingsJson: JSON.stringify([]),
        unresolvedCriteriaJson: JSON.stringify([]),
        reworkPacketJson: null,
        userVisibleSummaryRef: EvidenceArtifactId.makeUnsafe("artifact-summary"),
        createdAt: later,
      });

      const decision = yield* repo.getReviewerDecision({
        decisionId: ReviewerDecisionId.makeUnsafe("decision-1"),
      });
      assert.ok(Option.isSome(decision));
      assert.strictEqual(Option.getOrThrow(decision).evidenceBundleId, "bundle-1");
    }),
  );

  it.effect("rejects reviewer decisions without an existing evidence bundle", () =>
    Effect.gen(function* () {
      const repo = yield* BrowserOrchestrationEvidenceRepository;

      const result = yield* Effect.exit(
        repo.createReviewerDecision({
          decisionId: ReviewerDecisionId.makeUnsafe("decision-missing-bundle"),
          sessionId: "session-review",
          workflowRunId: WorkflowRunId.makeUnsafe("workflow-review"),
          evidenceBundleId: EvidenceBundleId.makeUnsafe("bundle-missing"),
          outcome: "accepted",
          confidence: "high",
          criteriaJson: JSON.stringify([]),
          findingsJson: JSON.stringify([]),
          unresolvedCriteriaJson: JSON.stringify([]),
          reworkPacketJson: null,
          userVisibleSummaryRef: EvidenceArtifactId.makeUnsafe("artifact-summary"),
          createdAt: later,
        }),
      );

      assert.strictEqual(result._tag, "Failure");
    }),
  );
});
