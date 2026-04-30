import assert from "node:assert/strict";
import { it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import {
  BrowserControlAcquireInput,
  BrowserApprovalGetInput,
  BrowserApprovalListInput,
  BrowserApprovalListResult,
  BrowserApprovalRespondInput,
  BrowserApprovalResult,
  BrowserControlHumanInputInput,
  BrowserControlObserveFreshInput,
  BrowserControlPauseInput,
  BrowserControlLeaseResult,
  BrowserControlReleaseInput,
  BrowserControlSessionInput,
  BrowserControlStatusResult,
  BrowserControlTakeInput,
  BrowserPolicyDecision,
  BrowserAssertion,
  BrowserWorkflowStartInput,
  BrowserWorkflowRun,
  DevServerInstance,
  EvidenceBundle,
  EvidenceBundleCreateInput,
  EvidenceBundleGetInput,
  EvidenceArtifactKind,
  LaunchConfigFile,
  PreviewDetectResult,
  PreviewStartResult,
  PreviewTarget,
  PreviewTargetListResult,
  ReviewerDecision,
  ReviewerDecisionCreateInput,
  ReviewerDecisionGetInput,
  ReviewerDecisionListInput,
  ReviewerReworkStartInput,
  ReviewerReworkStartResult,
  ReviewerActionPacket,
  ReviewerGateResult,
  ReviewerUserVisibleSummary,
} from "./browserOrchestration";

const ISO = "2026-04-27T00:00:00.000Z";

const decodeEvidenceBundle = Schema.decodeUnknownEffect(EvidenceBundle);
const decodeEvidenceArtifactKind = Schema.decodeUnknownEffect(EvidenceArtifactKind);
const decodeReviewerDecision = Schema.decodeUnknownEffect(ReviewerDecision);
const decodeReviewerGateResult = Schema.decodeUnknownEffect(ReviewerGateResult);
const decodeEvidenceBundleCreateInput = Schema.decodeUnknownEffect(EvidenceBundleCreateInput);
const decodeEvidenceBundleGetInput = Schema.decodeUnknownEffect(EvidenceBundleGetInput);
const decodeReviewerDecisionCreateInput = Schema.decodeUnknownEffect(ReviewerDecisionCreateInput);
const decodeReviewerDecisionGetInput = Schema.decodeUnknownEffect(ReviewerDecisionGetInput);
const decodeReviewerDecisionListInput = Schema.decodeUnknownEffect(ReviewerDecisionListInput);
const decodeReviewerReworkStartInput = Schema.decodeUnknownEffect(ReviewerReworkStartInput);
const decodeReviewerReworkStartResult = Schema.decodeUnknownEffect(ReviewerReworkStartResult);
const decodeReviewerActionPacket = Schema.decodeUnknownEffect(ReviewerActionPacket);
const decodeReviewerUserVisibleSummary = Schema.decodeUnknownEffect(ReviewerUserVisibleSummary);
const decodePreviewTarget = Schema.decodeUnknownEffect(PreviewTarget);
const decodeBrowserPolicyDecision = Schema.decodeUnknownEffect(BrowserPolicyDecision);
const decodeBrowserAssertion = Schema.decodeUnknownEffect(BrowserAssertion);
const decodeBrowserWorkflowStartInput = Schema.decodeUnknownEffect(BrowserWorkflowStartInput);
const decodeBrowserWorkflowRun = Schema.decodeUnknownEffect(BrowserWorkflowRun);
const decodeBrowserControlAcquireInput = Schema.decodeUnknownEffect(BrowserControlAcquireInput);
const decodeBrowserControlReleaseInput = Schema.decodeUnknownEffect(BrowserControlReleaseInput);
const decodeBrowserControlLeaseResult = Schema.decodeUnknownEffect(BrowserControlLeaseResult);
const decodeBrowserControlSessionInput = Schema.decodeUnknownEffect(BrowserControlSessionInput);
const decodeBrowserControlTakeInput = Schema.decodeUnknownEffect(BrowserControlTakeInput);
const decodeBrowserControlPauseInput = Schema.decodeUnknownEffect(BrowserControlPauseInput);
const decodeBrowserControlObserveFreshInput = Schema.decodeUnknownEffect(
  BrowserControlObserveFreshInput,
);
const decodeBrowserControlStatusResult = Schema.decodeUnknownEffect(BrowserControlStatusResult);
const decodeBrowserControlHumanInputInput = Schema.decodeUnknownEffect(
  BrowserControlHumanInputInput,
);
const decodeBrowserApprovalGetInput = Schema.decodeUnknownEffect(BrowserApprovalGetInput);
const decodeBrowserApprovalListInput = Schema.decodeUnknownEffect(BrowserApprovalListInput);
const decodeBrowserApprovalRespondInput = Schema.decodeUnknownEffect(BrowserApprovalRespondInput);
const decodeBrowserApprovalResult = Schema.decodeUnknownEffect(BrowserApprovalResult);
const decodeBrowserApprovalListResult = Schema.decodeUnknownEffect(BrowserApprovalListResult);
const decodeLaunchConfigFile = Schema.decodeUnknownEffect(LaunchConfigFile);
const decodeDevServerInstance = Schema.decodeUnknownEffect(DevServerInstance);
const decodePreviewDetectResult = Schema.decodeUnknownEffect(PreviewDetectResult);
const decodePreviewStartResult = Schema.decodeUnknownEffect(PreviewStartResult);
const decodePreviewTargetListResult = Schema.decodeUnknownEffect(PreviewTargetListResult);

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

it.effect("decodes browser-dom-snapshot evidence artifact kind", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeEvidenceArtifactKind("browser-dom-snapshot");
    assert.equal(parsed, "browser-dom-snapshot");
  }),
);

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
      preview: {
        readinessEvidenceRef: "artifact-health",
        serverLogRefs: ["artifact-server-log"],
        healthEvidenceRefs: ["artifact-health"],
      },
      browser: {
        observationRefs: ["artifact-observation"],
        screenshotArtifactRefs: ["artifact-shot"],
        consoleSummaryRefs: [],
        networkSummaryRefs: [],
        pageErrorRefs: [],
        unknownRefs: ["observation-opaque"],
      },
      workflow: {
        workflowRunRef: "workflow-1",
        assertionResultRefs: ["artifact-assertion"],
        statusEventRefs: ["artifact-status"],
        unknownRefs: ["mystery-ref"],
      },
      createdAt: ISO,
    });

    assert.strictEqual(parsed.id, "bundle-1");
    assert.strictEqual(parsed.codeState.diffArtifactRef, "artifact-diff");
    assert.deepStrictEqual(parsed.browser?.screenshotArtifactRefs, ["artifact-shot"]);
    assert.deepStrictEqual(parsed.browser?.unknownRefs, ["observation-opaque"]);
    assert.deepStrictEqual(parsed.workflow?.unknownRefs, ["mystery-ref"]);
  }),
);

it.effect("decodes EvidenceBundle without browserSessionId for pre-browser failures", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeEvidenceBundle({
      id: "bundle-no-browser",
      sessionId: "session-1",
      workflowRunId: "workflow-1",
      previewTargetId: "target-1",
      taskSpecId: "task-spec-1",
      acceptanceCriteriaId: "criteria-1",
      permissionPolicyId: "policy-1",
      codeState,
      artifactRefs: ["artifact-status"],
      eventRefs: ["event-1"],
      preview: {
        serverLogRefs: [],
        healthEvidenceRefs: [],
      },
      workflow: {
        workflowRunRef: "workflow-1",
        assertionResultRefs: [],
        statusEventRefs: ["artifact-status"],
      },
      createdAt: ISO,
    });

    assert.strictEqual(parsed.browserSessionId, undefined);
    assert.strictEqual(parsed.browser, undefined);
    assert.strictEqual(parsed.workflow?.workflowRunRef, "workflow-1");
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
        purpose: "browser-smoke",
        outcome: "accepted",
        confidence: "high",
        gates: [],
        criteria: [
          {
            criterionId: "criterion-1",
            status: "pass",
            evidenceRefs: ["artifact-shot"],
            reason: "Verified by screenshot.",
          },
        ],
        criterionResults: [],
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
        purpose: "browser-smoke",
        outcome: "accepted",
        confidence: "high",
        gates: [
          {
            name: "evidence-bundle-exists",
            status: "pass",
            message: "Evidence exists.",
            evidenceRefs: ["artifact-shot"],
          },
        ],
        criteria: [
          {
            criterionId: "criterion-1",
            status: "pass",
            evidenceRefs: [],
            reason: "Missing evidence should fail.",
          },
        ],
        criterionResults: [
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

it.effect("rejects ReviewerDecision without required audit fields", () =>
  Effect.gen(function* () {
    const baseDecision = {
      id: "decision-1",
      sessionId: "session-1",
      workflowRunId: "workflow-1",
      evidenceBundleId: "bundle-1",
      purpose: "browser-smoke",
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
      criterionResults: [
        {
          criterionId: "criterion-1",
          status: "pass",
          evidenceRefs: ["artifact-shot"],
          reason: "Verified by screenshot.",
        },
      ],
      findings: [],
      gates: [],
      unresolvedCriteria: [],
      userVisibleSummaryRef: "artifact-summary",
      createdAt: ISO,
    };

    const { gates: _gates, ...decisionWithoutGates } = baseDecision;
    const { criterionResults: _criterionResults, ...decisionWithoutCriterionResults } =
      baseDecision;
    const withoutGates = yield* Effect.exit(decodeReviewerDecision(decisionWithoutGates));
    const withoutCriterionResults = yield* Effect.exit(
      decodeReviewerDecision(decisionWithoutCriterionResults),
    );

    assert.strictEqual(withoutGates._tag, "Failure");
    assert.strictEqual(withoutCriterionResults._tag, "Failure");
  }),
);

it.effect("decodes reviewer action packets and user-visible summaries", () =>
  Effect.gen(function* () {
    const actionPacket = yield* decodeReviewerActionPacket({
      id: "action-packet-1",
      decisionId: "decision-1",
      kind: "needs-human-review",
      reason: "Code state was not captured.",
      blockingFindings: [],
      relevantEvidenceRefs: ["artifact-shot"],
      relevantGateNames: ["evidence-not-stale", "criteria-evaluated"],
      relevantCriterionIds: ["criterion-1"],
      focusedRoutes: ["/"],
      focusedViewports: [viewport],
      recommendedNextActions: ["Review evidence manually."],
      createdAt: ISO,
    });
    assert.strictEqual(actionPacket.kind, "needs-human-review");

    const summary = yield* decodeReviewerUserVisibleSummary({
      decisionId: "decision-1",
      outcome: "needs-human-review",
      confidence: "medium",
      purpose: "code-change",
      checked: {
        routes: ["/"],
        viewports: [viewport],
        previewTargetId: "target-1",
        workflowRunId: "workflow-1",
      },
      gates: [
        {
          name: "criteria-evaluated",
          status: "warn",
          message: "No task-specific criteria were supplied.",
          evidenceRefs: ["artifact-shot"],
        },
      ],
      findings: [],
      criterionResults: [
        {
          criterionId: "criterion-1",
          status: "pass",
          evidenceRefs: ["artifact-shot"],
          reason: "Verified by screenshot.",
        },
      ],
      evidence: {
        screenshotArtifactRefs: ["artifact-shot"],
        observationRefs: ["observation-1"],
        workflowRunRef: "workflow-1",
        evidenceBundleId: "bundle-1",
      },
      actionPacket,
      createdAt: ISO,
    });
    assert.strictEqual(summary.purpose, "code-change");
    assert.strictEqual(summary.actionPacket?.kind, "needs-human-review");
  }),
);

it.effect("decodes reviewer hard gate results and review API inputs", () =>
  Effect.gen(function* () {
    const gate = yield* decodeReviewerGateResult({
      name: "screenshot-evidence-resolves",
      status: "pass",
      message: "Screenshot ref resolved.",
      evidenceRefs: ["artifact-shot"],
    });
    assert.strictEqual(gate.name, "screenshot-evidence-resolves");

    const bundleCreate = yield* decodeEvidenceBundleCreateInput({
      workflowRunId: "workflow-1",
      codeState,
    });
    assert.strictEqual(bundleCreate.workflowRunId, "workflow-1");

    const bundleGet = yield* decodeEvidenceBundleGetInput({
      evidenceBundleId: "bundle-1",
    });
    assert.strictEqual(bundleGet.evidenceBundleId, "bundle-1");

    const decisionCreate = yield* decodeReviewerDecisionCreateInput({
      evidenceBundleId: "bundle-1",
      workflowRunId: "workflow-1",
      requiredRoutes: ["/"],
      requiredViewports: [viewport],
      finalCodeState: codeState,
      purpose: "code-change",
    });
    assert.strictEqual(decisionCreate.evidenceBundleId, "bundle-1");
    assert.strictEqual(decisionCreate.purpose, "code-change");

    const decisionGet = yield* decodeReviewerDecisionGetInput({
      decisionId: "decision-1",
    });
    assert.strictEqual(decisionGet.decisionId, "decision-1");

    const decisionList = yield* decodeReviewerDecisionListInput({
      sessionId: "session-1",
      workflowRunId: "workflow-1",
    });
    assert.strictEqual(decisionList.sessionId, "session-1");
    assert.strictEqual(decisionList.workflowRunId, "workflow-1");

    const reworkStart = yield* decodeReviewerReworkStartInput({
      decisionId: "decision-1",
      annotationIds: ["annotation-1"],
      instruction: "Address the browser comment.",
      mode: "draft-task",
    });
    assert.strictEqual(reworkStart.decisionId, "decision-1");
    assert.deepStrictEqual(reworkStart.annotationIds, ["annotation-1"]);

    const reworkResult = yield* decodeReviewerReworkStartResult({
      reworkTaskId: "rework-task-1",
      threadId: "thread-1",
      parentDecisionId: "decision-1",
      annotationTargets: [
        {
          annotationId: "annotation-1",
          browserSessionId: "browser-session-1",
          previewTargetId: "target-1",
          workflowRunId: "workflow-1",
          url: "http://localhost:5173/settings",
          route: "/settings",
          target: {
            kind: "element",
            geometry: {
              coordinateSpace: "css-pixels",
              rect: { x: 10, y: 20, width: 30, height: 40 },
              point: { x: 25, y: 40 },
              viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
              scroll: { x: 0, y: 0 },
            },
          },
          comment: "Move the save button down.",
          cropArtifactRef: "artifact-crop",
          domSnippetArtifactRef: "artifact-dom",
          styleSummaryArtifactRef: "artifact-style",
          beforeScreenshotArtifactRef: "artifact-before-shot",
          beforeDomArtifactRef: "artifact-before-dom",
          afterScreenshotArtifactRef: "artifact-after-shot",
          afterDomArtifactRef: "artifact-after-dom",
          artifactRefs: [
            "artifact-crop",
            "artifact-dom",
            "artifact-style",
            "artifact-before-shot",
            "artifact-before-dom",
            "artifact-after-shot",
            "artifact-after-dom",
          ],
        },
      ],
      evidenceRefs: ["artifact-crop", "artifact-dom", "artifact-style"],
      status: "drafted",
      instruction: "Address the browser comment.",
    });
    assert.strictEqual(reworkResult.annotationTargets[0]?.route, "/settings");
    assert.deepStrictEqual(reworkResult.evidenceRefs, [
      "artifact-crop",
      "artifact-dom",
      "artifact-style",
    ]);
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
        state: "human-control",
        acquiredAt: ISO,
        reason: "user-takeover",
        lastSnapshotBeforeAcquireRef: "artifact-before",
        requiredSnapshotAfterRelease: true,
        lastObservationRef: "artifact-before",
      },
    });
    assert.strictEqual(result.lease.requiredSnapshotAfterRelease, true);
  }),
);

it.effect("decodes browser control status and co-control action contracts", () =>
  Effect.gen(function* () {
    const session = yield* decodeBrowserControlSessionInput({
      browserSessionId: "browser-session-1",
    });
    assert.strictEqual(session.browserSessionId, "browser-session-1");

    const take = yield* decodeBrowserControlTakeInput({
      browserSessionId: "browser-session-1",
      reason: "human-input",
    });
    assert.strictEqual(take.reason, "human-input");

    const pause = yield* decodeBrowserControlPauseInput({
      browserSessionId: "browser-session-1",
      reason: "manual-pause",
    });
    assert.strictEqual(pause.reason, "manual-pause");

    const observeFresh = yield* decodeBrowserControlObserveFreshInput({
      browserSessionId: "browser-session-1",
    });
    assert.strictEqual(observeFresh.browserSessionId, "browser-session-1");
    assert.strictEqual(observeFresh.observationRef, undefined);

    const status = yield* decodeBrowserControlStatusResult({ lease: null });
    assert.strictEqual(status.lease, null);

    const humanInput = yield* decodeBrowserControlHumanInputInput({
      browserSessionId: "browser-session-1",
      kind: "keyboard",
      url: "http://127.0.0.1:5173/",
      occurredAt: ISO,
    });
    assert.strictEqual(humanInput.kind, "keyboard");
  }),
);

it.effect("decodes browser approval workflow contracts", () =>
  Effect.gen(function* () {
    const approval = {
      id: "browser-approval-1",
      browserSessionId: "browser-session-1",
      action: { kind: "navigate", url: "https://example.com/" },
      actionHash: "action-hash-1",
      reason: "External navigation requires approval.",
      risk: "external-navigation",
      observedUrl: "http://127.0.0.1:5173/",
      origin: "http://127.0.0.1:5173",
      status: "pending",
      evidenceRefs: ["artifact-policy"],
      createdAt: ISO,
      updatedAt: ISO,
    };

    const get = yield* decodeBrowserApprovalGetInput({ approvalId: "browser-approval-1" });
    assert.strictEqual(get.approvalId, "browser-approval-1");

    const list = yield* decodeBrowserApprovalListInput({
      browserSessionId: "browser-session-1",
      status: "pending",
    });
    assert.strictEqual(list.status, "pending");

    const response = yield* decodeBrowserApprovalRespondInput({
      approvalId: "browser-approval-1",
      decision: "approved",
      reason: "Allowed for this preview check.",
    });
    assert.strictEqual(response.decision, "approved");

    const result = yield* decodeBrowserApprovalResult({ approval });
    assert.strictEqual(result.approval.risk, "external-navigation");

    const listResult = yield* decodeBrowserApprovalListResult({ approvals: [approval] });
    assert.strictEqual(listResult.approvals.length, 1);
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

it.effect("decodes browser workflow start inputs with route plans and assertion ids", () =>
  Effect.gen(function* () {
    const target = yield* decodePreviewTarget({
      id: "target-1",
      version: 1,
      sessionId: "session-1",
      kind: "local-dev-server",
      canonicalUrl: "http://127.0.0.1:5173/",
      baseUrl: "http://127.0.0.1:5173/",
      initialRoute: "/",
      allowedOrigins: ["http://127.0.0.1:5173"],
      deniedOrigins: [],
      authMode: "none",
      permissionTier: "isolated-local-preview",
      viewports: [viewport],
      readinessEvidenceRef: "artifact-ready",
      serverLogRefs: ["artifact-log"],
      createdAt: ISO,
    });

    const input = yield* decodeBrowserWorkflowStartInput({
      sessionId: "session-1",
      previewTarget: target,
      preferredRuntimeKind: "electron-visible",
      controlMode: "observe-only-current-page",
      purpose: "post-edit-verification",
      routePlan: [{ route: "/", label: "home" }],
      viewportPlan: [viewport],
      assertions: [
        { id: "url", type: "url-matches", pattern: "127.0.0.1" },
        { id: "screenshot", type: "screenshot-captured", label: "home" },
      ],
      maxAttempts: 1,
    });

    assert.strictEqual(input.purpose, "post-edit-verification");
    assert.strictEqual(input.preferredRuntimeKind, "electron-visible");
    assert.strictEqual(input.controlMode, "observe-only-current-page");
    assert.strictEqual(input.assertions?.[0]?.id, "url");
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

it.effect("decodes preview API results", () =>
  Effect.gen(function* () {
    const config = {
      id: "web",
      name: "Web",
      cwd: ".",
      runtimeExecutable: "bun",
      runtimeArgs: ["run", "dev:web"],
      autoPort: true,
      defaultRoute: "/",
      healthCheck: {
        path: "/",
        timeoutMs: 30_000,
        expectedStatus: [200, 304],
      },
      autoVerify: true,
    };
    const instance = {
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
    };
    const target = {
      id: "target-1",
      version: 1,
      sessionId: "session-1",
      kind: "local-dev-server",
      canonicalUrl: "http://127.0.0.1:5734/",
      baseUrl: "http://127.0.0.1:5734",
      initialRoute: "/",
      devServerInstanceId: "server-1",
      launchConfigId: "web",
      allowedOrigins: ["http://127.0.0.1:5734"],
      deniedOrigins: [],
      authMode: "none",
      permissionTier: "isolated-local-preview",
      viewports: [viewport],
      readinessEvidenceRef: "artifact-health",
      serverLogRefs: ["artifact-logs"],
      createdAt: ISO,
    };

    const detect = yield* decodePreviewDetectResult({
      status: "detected",
      configs: [config],
    });
    assert.strictEqual(detect.configs[0]?.id, "web");

    const start = yield* decodePreviewStartResult({
      status: "started",
      instance,
      previewTarget: target,
    });
    assert.strictEqual(start.previewTarget?.readinessEvidenceRef, "artifact-health");

    const targets = yield* decodePreviewTargetListResult({ targets: [target] });
    assert.strictEqual(targets.targets[0]?.id, "target-1");
  }),
);
