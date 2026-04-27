import assert from "node:assert/strict";
import { it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import {
  BrowserControlAcquireInput,
  BrowserControlLeaseResult,
  BrowserControlReleaseInput,
  BrowserPolicyDecision,
  BrowserAssertion,
  BrowserWorkflowRun,
  DevServerInstance,
  EvidenceBundle,
  LaunchConfigFile,
  PreviewTarget,
  ReviewerDecision,
} from "./browserOrchestration";

const ISO = "2026-04-27T00:00:00.000Z";

const decodeEvidenceBundle = Schema.decodeUnknownEffect(EvidenceBundle);
const decodeReviewerDecision = Schema.decodeUnknownEffect(ReviewerDecision);
const decodePreviewTarget = Schema.decodeUnknownEffect(PreviewTarget);
const decodeBrowserPolicyDecision = Schema.decodeUnknownEffect(BrowserPolicyDecision);
const decodeBrowserAssertion = Schema.decodeUnknownEffect(BrowserAssertion);
const decodeBrowserWorkflowRun = Schema.decodeUnknownEffect(BrowserWorkflowRun);
const decodeBrowserControlAcquireInput = Schema.decodeUnknownEffect(BrowserControlAcquireInput);
const decodeBrowserControlReleaseInput = Schema.decodeUnknownEffect(BrowserControlReleaseInput);
const decodeBrowserControlLeaseResult = Schema.decodeUnknownEffect(BrowserControlLeaseResult);
const decodeLaunchConfigFile = Schema.decodeUnknownEffect(LaunchConfigFile);
const decodeDevServerInstance = Schema.decodeUnknownEffect(DevServerInstance);

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

it.effect("decodes browser control lease acquire and release contracts", () =>
  Effect.gen(function* () {
    const acquire = yield* decodeBrowserControlAcquireInput({
      browserSessionId: "browser-session-1",
      requestedBy: "human",
      reason: "user-takeover",
      lastSnapshotBeforeAcquireRef: "artifact-before",
    });
    assert.strictEqual(acquire.requestedBy, "human");

    const release = yield* decodeBrowserControlReleaseInput({
      browserSessionId: "browser-session-1",
      leaseId: "lease-1",
      snapshotAfterReleaseRef: "artifact-after",
    });
    assert.strictEqual(release.leaseId, "lease-1");

    const result = yield* decodeBrowserControlLeaseResult({
      lease: {
        id: "lease-1",
        browserSessionId: "browser-session-1",
        holder: "human",
        mode: "exclusive",
        acquiredAt: ISO,
        reason: "user-takeover",
        lastSnapshotBeforeAcquireRef: "artifact-before",
        requiredSnapshotAfterRelease: true,
      },
    });
    assert.strictEqual(result.lease.requiredSnapshotAfterRelease, true);
  }),
);

it.effect("decodes browser workflow assertions and workflow runs", () =>
  Effect.gen(function* () {
    const assertion = yield* decodeBrowserAssertion({
      type: "text-visible",
      text: "Sign in",
    });
    assert.strictEqual(assertion.type, "text-visible");

    const workflow = yield* decodeBrowserWorkflowRun({
      id: "workflow-1",
      sessionId: "session-1",
      previewTargetId: "target-1",
      taskSpecId: "task-spec-1",
      acceptanceCriteriaId: "criteria-1",
      permissionPolicyId: "policy-1",
      browserSessionId: "browser-session-1",
      status: "completed",
      routes: ["/"],
      viewports: [viewport],
      retryBudget: 1,
      createdAt: ISO,
      updatedAt: ISO,
      evidenceBundleId: "bundle-1",
    });

    assert.strictEqual(workflow.status, "completed");
    assert.strictEqual(workflow.routes[0], "/");
  }),
);

it.effect("decodes launch configs and dev server instances", () =>
  Effect.gen(function* () {
    const launch = yield* decodeLaunchConfigFile({
      version: "1.0",
      configurations: [
        {
          id: "web",
          name: "Web",
          cwd: ".",
          runtimeExecutable: "bun",
          runtimeArgs: ["run", "dev:web"],
          port: 5734,
          autoPort: true,
          defaultRoute: "/",
          healthCheck: {
            path: "/",
            timeoutMs: 30_000,
            expectedStatus: [200, 304],
          },
          autoVerify: true,
          tags: ["web"],
        },
      ],
    });

    assert.strictEqual(launch.configurations[0]?.id, "web");

    const instance = yield* decodeDevServerInstance({
      id: "server-1",
      sessionId: "session-1",
      launchConfigId: "web",
      status: "healthy",
      pid: 123,
      cwd: "/tmp/orchestrate",
      command: ["bun", "run", "dev:web"],
      assignedPort: 5734,
      baseUrl: "http://127.0.0.1:5734",
      startedAt: ISO,
      lastHealthCheckAt: ISO,
      logStreamRef: "artifact-logs",
      recentErrorRefs: [],
    });

    assert.strictEqual(instance.status, "healthy");
  }),
);
