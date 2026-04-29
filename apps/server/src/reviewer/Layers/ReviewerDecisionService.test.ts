import { assert, it } from "@effect/vitest";
import {
  BROWSER_ORCHESTRATION_SCHEMA_VERSION,
  BrowserAnnotationId,
  BrowserSessionId,
  EvidenceArtifactId,
  EvidenceBundleId,
  PreviewTargetId,
  ReviewerDecisionId,
  TaskSpecId,
  AcceptanceCriteriaId,
  AcceptanceCriterionId,
  PermissionPolicyId,
  WorkflowRunId,
  type BrowserObservation,
  type BrowserWorkflowRun,
  type PreviewTarget,
} from "@orchestrate/contracts";
import { Effect, Layer, Option } from "effect";

import { BrowserRuntimeService } from "../../browserRuntime/Services/BrowserRuntimeService.ts";
import { BrowserWorkflowManager } from "../../browserWorkflow/Services/BrowserWorkflowManager.ts";
import { BrowserWorkflowManagerLive } from "../../browserWorkflow/Layers/BrowserWorkflowManager.ts";
import { BrowserAnnotationRepositoryLive } from "../../persistence/Layers/BrowserAnnotations.ts";
import { BrowserAnnotationRepository } from "../../persistence/Services/BrowserAnnotations.ts";
import { BrowserOrchestrationEvidenceRepositoryLive } from "../../persistence/Layers/BrowserOrchestrationEvidence.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import {
  BrowserOrchestrationEvidenceRepository,
  type BrowserOrchestrationEvidenceRepositoryShape,
} from "../../persistence/Services/BrowserOrchestrationEvidence.ts";
import { ReviewerDecisionService } from "../Services/ReviewerDecisionService.ts";
import { ReviewerDecisionServiceLive } from "./ReviewerDecisionService.ts";

const previewTarget: PreviewTarget = {
  id: PreviewTargetId.makeUnsafe("preview-target-reviewer"),
  version: 1,
  sessionId: "reviewer-session",
  kind: "local-dev-server",
  canonicalUrl: "http://127.0.0.1:5173/",
  baseUrl: "http://127.0.0.1:5173/",
  initialRoute: "/",
  allowedOrigins: ["http://127.0.0.1:5173"],
  deniedOrigins: [],
  authMode: "none",
  permissionTier: "isolated-local-preview",
  viewports: [
    {
      id: "desktop",
      label: "Desktop",
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
    },
  ],
  readinessEvidenceRef: EvidenceArtifactId.makeUnsafe("health-reviewer"),
  serverLogRefs: [EvidenceArtifactId.makeUnsafe("server-log-reviewer")],
  createdAt: "2026-04-28T00:00:00.000Z",
};

function seedArtifact(
  repository: BrowserOrchestrationEvidenceRepositoryShape,
  artifactId: EvidenceArtifactId,
  kind = "browser-screenshot" as const,
) {
  return Effect.gen(function* () {
    yield* repository.writeEvidenceArtifact({
      artifactId,
      schemaVersion: BROWSER_ORCHESTRATION_SCHEMA_VERSION,
      kind,
      sha256: "fixture",
      byteSize: 7,
      contentType: "application/json",
      storageUri: `sqlite://evidence_artifact_contents/${artifactId}`,
      sensitivity: "workspace-internal",
      access: "safe-for-user-report",
      redactedArtifactId: null,
      supersededByArtifactId: null,
      metadataJson: null,
      createdAt: "2026-04-28T00:00:00.000Z",
    });
    yield* repository.writeEvidenceArtifactContent({
      artifactId,
      contentText: "fixture",
      createdAt: "2026-04-28T00:00:00.000Z",
    });
  });
}

const seedReviewerScreenshotArtifacts = (repository: BrowserOrchestrationEvidenceRepositoryShape) =>
  Effect.all([
    seedArtifact(repository, EvidenceArtifactId.makeUnsafe("screenshot-reviewer")),
    seedArtifact(repository, EvidenceArtifactId.makeUnsafe("screenshot-reviewer-resize")),
    seedArtifact(repository, EvidenceArtifactId.makeUnsafe("screenshot-reviewer-navigate")),
  ]);

function makeObservation(input: {
  readonly sessionId?: BrowserSessionId;
  readonly url?: string;
  readonly consoleError?: boolean;
  readonly screenshotRef?: EvidenceArtifactId;
}): BrowserObservation {
  const sessionId = input.sessionId ?? BrowserSessionId.makeUnsafe("browser-session-reviewer");
  const screenshotRef = input.screenshotRef ?? EvidenceArtifactId.makeUnsafe("screenshot-reviewer");
  return {
    sessionId,
    url: input.url ?? "http://127.0.0.1:5173/",
    title: "Reviewer fixture",
    readyState: "complete",
    textSummary: "Reviewer fixture page",
    screenshotDataUrl: "data:image/png;base64,reviewer",
    screenshotArtifactRef: screenshotRef,
    evidenceRefs: [screenshotRef],
    consoleErrors: input.consoleError ? [{ level: "error", text: "boom" }] : [],
    networkErrors: [],
    targets: [],
    runtimeKind: "playwright-headless",
    surfaceMode: "headless-validation-mirror",
    isUserVisibleSurface: false,
    runtimeTruth: {
      runtimeKind: "playwright-headless",
      surfaceMode: "headless-validation-mirror",
      isUserVisibleSurface: false,
      browserSessionId: sessionId,
      previewTargetId: previewTarget.id,
      screenshotArtifactRef: screenshotRef,
      evidenceRefs: [screenshotRef],
      observedUrl: input.url ?? "http://127.0.0.1:5173/",
      urlAgreement: "unknown",
    },
    observedAt: "2026-04-28T00:00:00.000Z",
  };
}

function makeBrowserRuntimeLayer(options: { readonly consoleError?: boolean } = {}) {
  const sessionId = BrowserSessionId.makeUnsafe("browser-session-reviewer");
  return Layer.succeed(BrowserRuntimeService, {
    openSession: () =>
      Effect.succeed({
        sessionId,
        observation: makeObservation({ sessionId }),
        runtimeTruth: makeObservation({ sessionId }).runtimeTruth,
        evidenceRefs: [EvidenceArtifactId.makeUnsafe("open-evidence-reviewer")],
      }),
    act: (input) =>
      Effect.succeed({
        observation: makeObservation({
          sessionId: input.sessionId,
          url: input.action.kind === "navigate" ? input.action.url : "http://127.0.0.1:5173/",
          consoleError: options.consoleError,
          screenshotRef: EvidenceArtifactId.makeUnsafe(`screenshot-reviewer-${input.action.kind}`),
        }),
        runtimeTruth: makeObservation({ sessionId: input.sessionId }).runtimeTruth,
        evidenceRefs: [EvidenceArtifactId.makeUnsafe(`evidence-reviewer-${input.action.kind}`)],
      }),
    closeSession: () => Effect.void,
  });
}

function makeLayer(options: { readonly consoleError?: boolean } = {}) {
  const evidenceRepositoryLayer = BrowserOrchestrationEvidenceRepositoryLive.pipe(
    Layer.provide(SqlitePersistenceMemory),
  );
  const annotationRepositoryLayer = BrowserAnnotationRepositoryLive.pipe(
    Layer.provide(SqlitePersistenceMemory),
  );
  const workflowLayer = BrowserWorkflowManagerLive.pipe(
    Layer.provide(makeBrowserRuntimeLayer(options)),
    Layer.provide(evidenceRepositoryLayer),
  );
  return it.layer(
    Layer.mergeAll(
      ReviewerDecisionServiceLive.pipe(
        Layer.provideMerge(workflowLayer),
        Layer.provide(annotationRepositoryLayer),
        Layer.provide(evidenceRepositoryLayer),
      ),
      evidenceRepositoryLayer,
      annotationRepositoryLayer,
    ),
  );
}

function makeNoBrowserWorkflow(status: "failed" | "completed"): BrowserWorkflowRun {
  const workflowRunId = WorkflowRunId.makeUnsafe(`workflow-no-browser-${status}`);
  return {
    id: workflowRunId,
    sessionId: "reviewer-session",
    previewTargetId: previewTarget.id,
    taskSpecId: TaskSpecId.makeUnsafe(`task-no-browser-${status}`),
    acceptanceCriteriaId: AcceptanceCriteriaId.makeUnsafe(`criteria-no-browser-${status}`),
    permissionPolicyId: PermissionPolicyId.makeUnsafe(`policy-no-browser-${status}`),
    status,
    routes: ["/"],
    viewports: previewTarget.viewports,
    retryBudget: 0,
    createdAt: "2026-04-28T00:00:00.000Z",
    updatedAt: "2026-04-28T00:00:01.000Z",
    purpose: "initial-preview",
    routePlan: [{ route: "/" }],
    viewportPlan: previewTarget.viewports,
    assertions: [{ id: "screenshot", type: "screenshot-captured" }],
    maxAttempts: 1,
    attempt: 1,
    evidenceRefs: [],
    observationRefs: [],
    screenshotArtifactRefs: [],
    assertionResults: [],
    startedAt: "2026-04-28T00:00:00.000Z",
    completedAt: "2026-04-28T00:00:01.000Z",
    ...(status === "failed"
      ? {
          error: {
            code: "browser-workflow-failed",
            message: "Workflow failed before opening a browser session.",
          },
        }
      : {}),
  };
}

function makeClassifiedRefsWorkflow(
  purpose: BrowserWorkflowRun["purpose"] = "initial-preview",
): BrowserWorkflowRun {
  const workflowRunId = WorkflowRunId.makeUnsafe("workflow-classified-refs");
  const sessionId = BrowserSessionId.makeUnsafe("browser-session-classified-refs");
  const screenshotRef = EvidenceArtifactId.makeUnsafe("screenshot-classified-refs");
  return {
    id: workflowRunId,
    sessionId: "reviewer-session",
    previewTargetId: previewTarget.id,
    taskSpecId: TaskSpecId.makeUnsafe("task-classified-refs"),
    acceptanceCriteriaId: AcceptanceCriteriaId.makeUnsafe("criteria-classified-refs"),
    permissionPolicyId: PermissionPolicyId.makeUnsafe("policy-classified-refs"),
    browserSessionId: sessionId,
    status: "completed",
    routes: ["/"],
    viewports: previewTarget.viewports,
    retryBudget: 0,
    createdAt: "2026-04-28T00:00:00.000Z",
    updatedAt: "2026-04-28T00:00:01.000Z",
    purpose,
    routePlan: [{ route: "/" }],
    viewportPlan: previewTarget.viewports,
    assertions: [{ id: "screenshot", type: "screenshot-captured" }],
    maxAttempts: 1,
    attempt: 1,
    evidenceRefs: [EvidenceArtifactId.makeUnsafe("mystery-workflow-ref")],
    observationRefs: [EvidenceArtifactId.makeUnsafe("observation-classified-refs")],
    screenshotArtifactRefs: [screenshotRef],
    assertionResults: [],
    startedAt: "2026-04-28T00:00:00.000Z",
    completedAt: "2026-04-28T00:00:01.000Z",
  };
}

function makeScreenshotRefsWorkflow(): BrowserWorkflowRun {
  const workflowRunId = WorkflowRunId.makeUnsafe("workflow-screenshot-refs");
  const sessionId = BrowserSessionId.makeUnsafe("browser-session-screenshot-refs");
  const screenshotRef = EvidenceArtifactId.makeUnsafe("screenshot-resolves");
  const missingScreenshotRef = EvidenceArtifactId.makeUnsafe("screenshot-missing");
  return {
    id: workflowRunId,
    sessionId: "reviewer-session",
    previewTargetId: previewTarget.id,
    taskSpecId: TaskSpecId.makeUnsafe("task-screenshot-refs"),
    acceptanceCriteriaId: AcceptanceCriteriaId.makeUnsafe("criteria-screenshot-refs"),
    permissionPolicyId: PermissionPolicyId.makeUnsafe("policy-screenshot-refs"),
    browserSessionId: sessionId,
    status: "completed",
    routes: ["/"],
    viewports: previewTarget.viewports,
    retryBudget: 0,
    createdAt: "2026-04-28T00:00:00.000Z",
    updatedAt: "2026-04-28T00:00:01.000Z",
    purpose: "initial-preview",
    routePlan: [{ route: "/" }],
    viewportPlan: previewTarget.viewports,
    assertions: [{ id: "screenshot", type: "screenshot-captured" }],
    maxAttempts: 1,
    attempt: 1,
    evidenceRefs: [],
    observationRefs: [EvidenceArtifactId.makeUnsafe("observation-screenshot-refs")],
    screenshotArtifactRefs: [screenshotRef, missingScreenshotRef],
    assertionResults: [
      {
        assertion: { id: "screenshot", type: "screenshot-captured" },
        assertionId: "screenshot",
        status: "pass",
        evidenceRefs: [screenshotRef, missingScreenshotRef],
        message: "Screenshot captured.",
        checkedAt: "2026-04-28T00:00:01.000Z",
      },
    ],
    startedAt: "2026-04-28T00:00:00.000Z",
    completedAt: "2026-04-28T00:00:01.000Z",
  };
}

function makeReviewerOnlyLayer(workflow: BrowserWorkflowRun) {
  const evidenceRepositoryLayer = BrowserOrchestrationEvidenceRepositoryLive.pipe(
    Layer.provide(SqlitePersistenceMemory),
  );
  const annotationRepositoryLayer = BrowserAnnotationRepositoryLive.pipe(
    Layer.provide(SqlitePersistenceMemory),
  );
  const workflowLayer = Layer.succeed(BrowserWorkflowManager, {
    start: () => Effect.succeed({ workflow }),
    status: () => Effect.succeed({ workflow }),
    get: () => Effect.succeed({ workflow }),
    cancel: () => Effect.succeed({ workflow }),
    list: () => Effect.succeed({ workflows: [workflow] }),
  });
  return it.layer(
    Layer.mergeAll(
      ReviewerDecisionServiceLive.pipe(
        Layer.provideMerge(workflowLayer),
        Layer.provide(annotationRepositoryLayer),
        Layer.provide(evidenceRepositoryLayer),
      ),
      evidenceRepositoryLayer,
      annotationRepositoryLayer,
    ),
  );
}

makeLayer()("ReviewerDecisionServiceLive accepted path", (it) => {
  it.effect("creates an evidence bundle and accepted reviewer decision from a workflow", () =>
    Effect.gen(function* () {
      const workflows = yield* BrowserWorkflowManager;
      const reviewer = yield* ReviewerDecisionService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;
      yield* seedReviewerScreenshotArtifacts(repository);

      const workflowResult = yield* workflows.start({
        sessionId: "reviewer-session",
        previewTarget,
        assertions: [
          { id: "screenshot", type: "screenshot-captured" },
          { id: "console", type: "no-console-errors" },
        ],
      });
      const bundleResult = yield* reviewer.createEvidenceBundle({
        workflowRunId: workflowResult.workflow.id,
      });
      const persistedBundleRow = yield* repository.getEvidenceBundle({
        bundleId: bundleResult.evidenceBundle.id,
      });
      assert.ok(Option.isSome(persistedBundleRow));
      assert.ok(Option.getOrThrow(persistedBundleRow).bundleSnapshotJson?.includes("browser"));
      const decisionResult = yield* reviewer.createDecision({
        evidenceBundleId: bundleResult.evidenceBundle.id,
      });

      assert.strictEqual(decisionResult.decision.outcome, "accepted");
      assert.strictEqual(decisionResult.decision.purpose, "browser-smoke");
      assert.strictEqual(decisionResult.decision.actionPacket, undefined);
      assert.ok(decisionResult.decision.gates?.some((gate) => gate.name === "assertions-passed"));
      assert.ok(decisionResult.decision.userVisibleSummaryRef);
      const summaryArtifact = yield* repository.getEvidenceArtifact({
        artifactId: decisionResult.decision.userVisibleSummaryRef,
      });
      assert.strictEqual(Option.getOrThrow(summaryArtifact).kind, "reviewer-user-visible-summary");
      const summaryContent = yield* repository.getEvidenceArtifactContent({
        artifactId: decisionResult.decision.userVisibleSummaryRef,
      });
      assert.ok(Option.isSome(summaryContent));
      const summary = JSON.parse(Option.getOrThrow(summaryContent).contentText) as {
        readonly gates?: readonly unknown[];
        readonly criterionResults?: readonly unknown[];
        readonly evidence?: { readonly evidenceBundleId?: string };
      };
      assert.ok(summary.gates?.length);
      assert.ok(summary.criterionResults?.length);
      assert.strictEqual(summary.evidence?.evidenceBundleId, bundleResult.evidenceBundle.id);

      const fetched = yield* reviewer.getDecision({ decisionId: decisionResult.decision.id });
      assert.strictEqual(fetched.decision?.id, decisionResult.decision.id);

      yield* repository.createReviewerDecision({
        decisionId: ReviewerDecisionId.makeUnsafe("decision-uncached-reviewer"),
        sessionId: "reviewer-session",
        workflowRunId: workflowResult.workflow.id,
        evidenceBundleId: bundleResult.evidenceBundle.id,
        purpose: "browser-smoke",
        outcome: "accepted",
        confidence: "high",
        gatesJson: JSON.stringify(decisionResult.decision.gates ?? []),
        criteriaJson: JSON.stringify(decisionResult.decision.criteria),
        findingsJson: JSON.stringify([]),
        unresolvedCriteriaJson: JSON.stringify([]),
        reworkPacketJson: null,
        actionPacketJson: null,
        userVisibleSummaryRef: decisionResult.decision.userVisibleSummaryRef,
        createdAt: "2026-04-28T00:00:01.000Z",
      });
      yield* repository.createEvidenceBundle({
        bundleId: EvidenceBundleId.makeUnsafe("evidence-bundle-other-session"),
        sessionId: "other-reviewer-session",
        workflowRunId: workflowResult.workflow.id,
        previewTargetId: previewTarget.id,
        taskSpecId: workflowResult.workflow.taskSpecId,
        acceptanceCriteriaId: workflowResult.workflow.acceptanceCriteriaId,
        permissionPolicyId: workflowResult.workflow.permissionPolicyId,
        browserSessionId: BrowserSessionId.makeUnsafe("browser-session-other-reviewer"),
        codeStateJson: JSON.stringify(bundleResult.evidenceBundle.codeState),
        artifactRefsJson: JSON.stringify(bundleResult.evidenceBundle.artifactRefs),
        eventRefsJson: JSON.stringify([]),
        bundleSnapshotJson: JSON.stringify({
          ...bundleResult.evidenceBundle,
          id: "evidence-bundle-other-session",
          sessionId: "other-reviewer-session",
          browserSessionId: "browser-session-other-reviewer",
        }),
        createdAt: "2026-04-28T00:00:02.000Z",
      });
      yield* repository.createReviewerDecision({
        decisionId: ReviewerDecisionId.makeUnsafe("decision-other-reviewer"),
        sessionId: "other-reviewer-session",
        workflowRunId: workflowResult.workflow.id,
        evidenceBundleId: EvidenceBundleId.makeUnsafe("evidence-bundle-other-session"),
        purpose: "browser-smoke",
        outcome: "accepted",
        confidence: "high",
        gatesJson: JSON.stringify(decisionResult.decision.gates ?? []),
        criteriaJson: JSON.stringify(decisionResult.decision.criteria),
        findingsJson: JSON.stringify([]),
        unresolvedCriteriaJson: JSON.stringify([]),
        reworkPacketJson: null,
        actionPacketJson: null,
        userVisibleSummaryRef: decisionResult.decision.userVisibleSummaryRef,
        createdAt: "2026-04-28T00:00:03.000Z",
      });
      const fetchedUncachedBundle = yield* reviewer.getEvidenceBundle({
        evidenceBundleId: EvidenceBundleId.makeUnsafe("evidence-bundle-other-session"),
      });
      assert.ok(fetchedUncachedBundle.evidenceBundle?.preview);
      assert.ok(fetchedUncachedBundle.evidenceBundle?.browser);
      assert.ok(fetchedUncachedBundle.evidenceBundle?.workflow);
      yield* repository.createEvidenceBundle({
        bundleId: EvidenceBundleId.makeUnsafe("evidence-bundle-legacy"),
        sessionId: "legacy-reviewer-session",
        workflowRunId: workflowResult.workflow.id,
        previewTargetId: previewTarget.id,
        taskSpecId: workflowResult.workflow.taskSpecId,
        acceptanceCriteriaId: workflowResult.workflow.acceptanceCriteriaId,
        permissionPolicyId: workflowResult.workflow.permissionPolicyId,
        browserSessionId: BrowserSessionId.makeUnsafe("browser-session-legacy-reviewer"),
        codeStateJson: JSON.stringify(bundleResult.evidenceBundle.codeState),
        artifactRefsJson: JSON.stringify(bundleResult.evidenceBundle.artifactRefs),
        eventRefsJson: JSON.stringify([]),
        bundleSnapshotJson: null,
        createdAt: "2026-04-28T00:00:04.000Z",
      });
      const legacyBundle = yield* reviewer.getEvidenceBundle({
        evidenceBundleId: EvidenceBundleId.makeUnsafe("evidence-bundle-legacy"),
      });
      assert.strictEqual(legacyBundle.evidenceBundle?.id, "evidence-bundle-legacy");
      assert.strictEqual(legacyBundle.evidenceBundle?.browser, undefined);

      const listed = yield* reviewer.listDecisions({ sessionId: "reviewer-session" });
      const listedIds = new Set(listed.decisions.map((decision) => String(decision.id)));
      assert.ok(listedIds.has(String(decisionResult.decision.id)));
      assert.ok(listedIds.has("decision-uncached-reviewer"));
      assert.ok(!listedIds.has("decision-other-reviewer"));
      const durableDecision = listed.decisions.find(
        (decision) => decision.id === decisionResult.decision.id,
      );
      assert.ok(durableDecision?.gates?.some((gate) => gate.name === "assertions-passed"));
      assert.ok(durableDecision?.criterionResults?.length);
      assert.strictEqual(durableDecision?.purpose, "browser-smoke");
      assert.strictEqual(
        durableDecision?.userVisibleSummaryRef,
        decisionResult.decision.userVisibleSummaryRef,
      );

      const listedByWorkflow = yield* reviewer.listDecisions({
        workflowRunId: workflowResult.workflow.id,
      });
      assert.ok(
        new Set(listedByWorkflow.decisions.map((decision) => String(decision.id))).has(
          "decision-other-reviewer",
        ),
      );

      const unfiltered = yield* Effect.exit(reviewer.listDecisions({}));
      assert.strictEqual(unfiltered._tag, "Failure");
    }),
  );

  it.effect("blocks accepted decisions when attached browser annotations are unresolved", () =>
    Effect.gen(function* () {
      const workflows = yield* BrowserWorkflowManager;
      const reviewer = yield* ReviewerDecisionService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;
      const annotations = yield* BrowserAnnotationRepository;
      yield* seedReviewerScreenshotArtifacts(repository);

      const workflowResult = yield* workflows.start({
        sessionId: "reviewer-session",
        previewTarget,
        assertions: [{ id: "screenshot", type: "screenshot-captured" }],
      });
      const browserSessionId =
        workflowResult.workflow.browserSessionId ?? "browser-session-reviewer";

      yield* annotations.insert({
        annotationId: BrowserAnnotationId.makeUnsafe("browser-annotation-open"),
        threadId: "reviewer-session",
        sessionId: browserSessionId,
        status: "open",
        annotationJson: JSON.stringify({
          id: "browser-annotation-open",
          threadId: "reviewer-session",
          sessionId: browserSessionId,
          browserSessionId,
          url: "http://127.0.0.1:5173/",
          comment: "Move the save button down",
          kind: "point",
          x: 0.5,
          y: 0.5,
          status: "open",
          artifactRefs: ["browser-comment-open"],
          cropArtifactRef: "browser-comment-crop-open",
          domSnippetArtifactRef: "browser-comment-dom-open",
          styleSummaryArtifactRef: "browser-comment-style-open",
          target: {
            kind: "element",
            geometry: {
              coordinateSpace: "css-pixels",
              rect: { x: 10, y: 20, width: 30, height: 40 },
              point: { x: 25, y: 40 },
              viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
              scroll: { x: 0, y: 0 },
            },
          },
          createdAt: "2026-04-28T00:00:00.000Z",
        }),
        targetJson: null,
        geometryContextJson: null,
        createdAt: "2026-04-28T00:00:00.000Z",
        updatedAt: "2026-04-28T00:00:00.000Z",
        resolvedAt: null,
        reopenedAt: null,
      });

      const bundleResult = yield* reviewer.createEvidenceBundle({
        workflowRunId: workflowResult.workflow.id,
      });
      const decisionResult = yield* reviewer.createDecision({
        evidenceBundleId: bundleResult.evidenceBundle.id,
      });

      assert.strictEqual(
        decisionResult.evidenceBundle.annotations?.unresolvedAnnotationRefs[0],
        "browser-annotation-open",
      );
      assert.strictEqual(decisionResult.decision.outcome, "rework-required");
      assert.strictEqual(
        decisionResult.decision.reworkPacket?.annotationTargets?.[0]?.annotationId,
        "browser-annotation-open",
      );
      assert.ok(
        decisionResult.decision.actionPacket?.recommendedNextActions.some((action) =>
          action.includes("browser-annotation-open"),
        ),
      );
      assert.ok(
        decisionResult.decision.gates.some(
          (gate) => gate.name === "comments-addressed" && gate.status === "fail",
        ),
      );

      const decisionRework = yield* reviewer.startRework({
        decisionId: decisionResult.decision.id,
      });
      assert.strictEqual(decisionRework.parentDecisionId, decisionResult.decision.id);
      assert.strictEqual(decisionRework.status, "drafted");
      assert.strictEqual(
        decisionRework.annotationTargets[0]?.annotationId,
        "browser-annotation-open",
      );
      assert.strictEqual(
        decisionRework.annotationTargets[0]?.domSnippetArtifactRef,
        "browser-comment-dom-open",
      );
      assert.strictEqual(
        decisionRework.annotationTargets[0]?.styleSummaryArtifactRef,
        "browser-comment-style-open",
      );
      assert.ok(decisionRework.instruction.includes("Move the save button down"));
      assert.ok(decisionRework.instruction.includes("geometry evidence"));
      assert.ok(decisionRework.evidenceRefs.includes("browser-comment-crop-open"));

      const explicitAnnotationRework = yield* reviewer.startRework({
        annotationIds: ["browser-annotation-open"],
      });
      assert.strictEqual(
        explicitAnnotationRework.annotationTargets[0]?.annotationId,
        "browser-annotation-open",
      );
      assert.ok(explicitAnnotationRework.instruction.includes("Move the save button down"));
    }),
  );

  it.effect("auto-includes annotation evidence by workflow and preview target", () =>
    Effect.gen(function* () {
      const workflows = yield* BrowserWorkflowManager;
      const reviewer = yield* ReviewerDecisionService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;
      const annotations = yield* BrowserAnnotationRepository;
      yield* seedReviewerScreenshotArtifacts(repository);

      const workflowResult = yield* workflows.start({
        sessionId: "reviewer-session-auto-annotations",
        previewTarget,
        assertions: [{ id: "screenshot", type: "screenshot-captured" }],
      });

      const insertAnnotation = (
        id: string,
        status: "open" | "resolved" | "reopened",
        extra: Record<string, unknown>,
      ) =>
        annotations.insert({
          annotationId: BrowserAnnotationId.makeUnsafe(id),
          threadId: "reviewer-session-auto-annotations",
          sessionId: null,
          status,
          annotationJson: JSON.stringify({
            id,
            threadId: "reviewer-session-auto-annotations",
            url: "http://127.0.0.1:5173/",
            comment: id,
            kind: "point",
            x: 0.5,
            y: 0.5,
            status,
            artifactRefs: [`browser-comment-${id}`],
            createdAt: "2026-04-28T00:00:00.000Z",
            ...extra,
          }),
          targetJson: null,
          geometryContextJson: null,
          createdAt: "2026-04-28T00:00:00.000Z",
          updatedAt: "2026-04-28T00:00:00.000Z",
          resolvedAt: status === "resolved" ? "2026-04-28T00:00:00.000Z" : null,
          reopenedAt: status === "reopened" ? "2026-04-28T00:00:00.000Z" : null,
        });

      yield* insertAnnotation("browser-annotation-workflow", "open", {
        workflowRunId: workflowResult.workflow.id,
      });
      yield* insertAnnotation("browser-annotation-preview", "reopened", {
        previewTargetId: previewTarget.id,
      });
      yield* insertAnnotation("browser-annotation-resolved", "resolved", {
        previewTargetId: previewTarget.id,
      });

      const bundleResult = yield* reviewer.createEvidenceBundle({
        workflowRunId: workflowResult.workflow.id,
      });

      assert.deepStrictEqual(
        new Set(bundleResult.evidenceBundle.annotations?.unresolvedAnnotationRefs ?? []),
        new Set(["browser-annotation-workflow", "browser-annotation-preview"]),
      );
      assert.ok(
        bundleResult.evidenceBundle.annotations?.annotationRefs.includes(
          "browser-annotation-resolved",
        ),
      );
    }),
  );
});

makeLayer({ consoleError: true })("ReviewerDecisionServiceLive rework path", (it) => {
  it.effect("creates rework-required decisions with findings for failed assertions", () =>
    Effect.gen(function* () {
      const workflows = yield* BrowserWorkflowManager;
      const reviewer = yield* ReviewerDecisionService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;
      yield* seedReviewerScreenshotArtifacts(repository);

      const workflowResult = yield* workflows.start({
        sessionId: "reviewer-session",
        previewTarget,
        assertions: [
          { id: "screenshot", type: "screenshot-captured" },
          { id: "console", type: "no-console-errors" },
        ],
      });
      const bundleResult = yield* reviewer.createEvidenceBundle({
        workflowRunId: workflowResult.workflow.id,
      });
      const decisionResult = yield* reviewer.createDecision({
        evidenceBundleId: bundleResult.evidenceBundle.id,
      });

      assert.strictEqual(decisionResult.decision.outcome, "rework-required");
      assert.ok(decisionResult.decision.findings.length > 0);
      assert.ok(decisionResult.decision.reworkPacket);
      assert.strictEqual(decisionResult.decision.actionPacket?.kind, "rework");
      assert.ok(decisionResult.decision.actionPacket.recommendedNextActions.length > 0);
      assert.deepStrictEqual(
        decisionResult.decision.actionPacket.focusedRoutes,
        decisionResult.decision.reworkPacket.focusedRoutes,
      );
      assert.deepStrictEqual(
        decisionResult.decision.actionPacket.focusedViewports,
        decisionResult.decision.reworkPacket.focusedViewports,
      );
      assert.deepStrictEqual(
        decisionResult.decision.actionPacket.relevantEvidenceRefs,
        decisionResult.decision.reworkPacket.relevantEvidenceRefs,
      );
      assert.ok(
        decisionResult.decision.gates?.some(
          (gate) => gate.name === "no-console-errors" && gate.status === "fail",
        ),
      );
    }),
  );
});

makeReviewerOnlyLayer(makeClassifiedRefsWorkflow())(
  "ReviewerDecisionServiceLive classified refs",
  (it) => {
    it.effect("keeps observation and unknown refs out of top-level artifact refs", () =>
      Effect.gen(function* () {
        const reviewer = yield* ReviewerDecisionService;
        const repository = yield* BrowserOrchestrationEvidenceRepository;
        const workflow = makeClassifiedRefsWorkflow();
        yield* seedArtifact(
          repository,
          EvidenceArtifactId.makeUnsafe("screenshot-classified-refs"),
        );

        const bundleResult = yield* reviewer.createEvidenceBundle({
          workflowRunId: workflow.id,
        });
        const bundle = bundleResult.evidenceBundle;

        assert.ok(
          bundle.artifactRefs.includes(EvidenceArtifactId.makeUnsafe("screenshot-classified-refs")),
        );
        assert.ok(
          !bundle.artifactRefs.includes(
            EvidenceArtifactId.makeUnsafe("observation-classified-refs"),
          ),
        );
        assert.ok(
          !bundle.artifactRefs.includes(EvidenceArtifactId.makeUnsafe("mystery-workflow-ref")),
        );
        assert.ok(
          bundle.browser?.observationRefs.includes(
            EvidenceArtifactId.makeUnsafe("observation-classified-refs"),
          ),
        );
        assert.ok(
          bundle.browser?.screenshotArtifactRefs.includes(
            EvidenceArtifactId.makeUnsafe("screenshot-classified-refs"),
          ),
        );
        assert.ok(!(bundle.browser?.unknownRefs ?? []).includes("observation-classified-refs"));
        assert.ok(bundle.workflow?.unknownRefs?.includes("mystery-workflow-ref"));
        assert.strictEqual(bundle.codeState.captureStatus, "unknown");
        assert.strictEqual(bundle.codeState.diffArtifactRef, undefined);

        const persistedBundleRow = yield* repository.getEvidenceBundle({
          bundleId: bundle.id,
        });
        assert.ok(Option.isSome(persistedBundleRow));
        assert.ok(
          Option.getOrThrow(persistedBundleRow).bundleSnapshotJson?.includes("unknownRefs"),
        );
      }),
    );
  },
);

makeReviewerOnlyLayer(makeScreenshotRefsWorkflow())(
  "ReviewerDecisionServiceLive screenshot gate integrity",
  (it) => {
    it.effect("fails screenshot gate when any required screenshot artifact is missing", () =>
      Effect.gen(function* () {
        const reviewer = yield* ReviewerDecisionService;
        const repository = yield* BrowserOrchestrationEvidenceRepository;
        const workflow = makeScreenshotRefsWorkflow();
        yield* seedArtifact(repository, EvidenceArtifactId.makeUnsafe("screenshot-resolves"));

        const bundleResult = yield* reviewer.createEvidenceBundle({
          workflowRunId: workflow.id,
        });
        assert.ok(bundleResult.evidenceBundle.artifactRefs.includes("screenshot-resolves"));
        assert.ok(!bundleResult.evidenceBundle.artifactRefs.includes("screenshot-missing"));
        assert.ok(bundleResult.evidenceBundle.browser?.unknownRefs?.includes("screenshot-missing"));

        const decisionResult = yield* reviewer.createDecision({
          evidenceBundleId: bundleResult.evidenceBundle.id,
        });

        assert.strictEqual(decisionResult.decision.outcome, "inconclusive");
        assert.strictEqual(decisionResult.decision.actionPacket?.kind, "inconclusive");
        assert.ok(
          decisionResult.decision.gates.some(
            (gate) => gate.name === "screenshot-evidence-resolves" && gate.status === "fail",
          ),
        );
      }),
    );
  },
);

makeReviewerOnlyLayer(makeClassifiedRefsWorkflow())(
  "ReviewerDecisionServiceLive code freshness gate",
  (it) => {
    it.effect("fails freshness comparison when bundle code state is unknown", () =>
      Effect.gen(function* () {
        const reviewer = yield* ReviewerDecisionService;
        const repository = yield* BrowserOrchestrationEvidenceRepository;
        const workflow = makeClassifiedRefsWorkflow();
        yield* seedArtifact(
          repository,
          EvidenceArtifactId.makeUnsafe("screenshot-classified-refs"),
        );

        const bundleResult = yield* reviewer.createEvidenceBundle({
          workflowRunId: workflow.id,
        });
        const decisionResult = yield* reviewer.createDecision({
          evidenceBundleId: bundleResult.evidenceBundle.id,
          finalCodeState: {
            captureStatus: "captured",
            repoRoot: "/tmp/orchestrate",
            headSha: "final-head",
            dirtyHash: "final-dirty",
            changedFiles: ["apps/web/src/App.tsx"],
            diffArtifactRef: EvidenceArtifactId.makeUnsafe("artifact-final-diff"),
            capturedAt: "2026-04-28T00:00:02.000Z",
          },
        });

        assert.ok(
          decisionResult.decision.gates.some(
            (gate) => gate.name === "evidence-not-stale" && gate.status === "fail",
          ),
        );
        assert.notStrictEqual(decisionResult.decision.outcome, "accepted");
      }),
    );

    it.effect("requires human review for code-change decisions with unknown code state", () =>
      Effect.gen(function* () {
        const reviewer = yield* ReviewerDecisionService;
        const repository = yield* BrowserOrchestrationEvidenceRepository;
        const workflow = makeClassifiedRefsWorkflow();
        yield* seedArtifact(
          repository,
          EvidenceArtifactId.makeUnsafe("screenshot-classified-refs"),
        );

        const bundleResult = yield* reviewer.createEvidenceBundle({
          workflowRunId: workflow.id,
        });
        const decisionResult = yield* reviewer.createDecision({
          evidenceBundleId: bundleResult.evidenceBundle.id,
          purpose: "code-change",
        });

        assert.strictEqual(decisionResult.decision.outcome, "needs-human-review");
        assert.strictEqual(decisionResult.decision.actionPacket?.kind, "needs-human-review");
        assert.ok(
          decisionResult.decision.gates.some(
            (gate) => gate.name === "criteria-evaluated" && gate.status === "warn",
          ),
        );
        assert.ok(
          decisionResult.decision.gates.some(
            (gate) => gate.name === "evidence-not-stale" && gate.status === "warn",
          ),
        );

        const fetched = yield* reviewer.getDecision({ decisionId: decisionResult.decision.id });
        assert.strictEqual(fetched.decision?.actionPacket?.kind, "needs-human-review");
        const listed = yield* reviewer.listDecisions({ sessionId: workflow.sessionId });
        const listedDecision = listed.decisions.find(
          (decision) => decision.id === decisionResult.decision.id,
        );
        assert.strictEqual(listedDecision?.actionPacket?.kind, "needs-human-review");
      }),
    );

    it.effect("allows caller-supplied purpose to make initial preview review stricter", () =>
      Effect.gen(function* () {
        const reviewer = yield* ReviewerDecisionService;
        const repository = yield* BrowserOrchestrationEvidenceRepository;
        const workflow = makeClassifiedRefsWorkflow("initial-preview");
        yield* seedArtifact(
          repository,
          EvidenceArtifactId.makeUnsafe("screenshot-classified-refs"),
        );

        const bundleResult = yield* reviewer.createEvidenceBundle({
          workflowRunId: workflow.id,
        });
        const decisionResult = yield* reviewer.createDecision({
          evidenceBundleId: bundleResult.evidenceBundle.id,
          purpose: "code-change",
        });

        assert.strictEqual(decisionResult.decision.purpose, "code-change");
        assert.strictEqual(decisionResult.decision.outcome, "needs-human-review");
      }),
    );

    it.effect("does not count synthetic criteria as task-specific criteria", () =>
      Effect.gen(function* () {
        const reviewer = yield* ReviewerDecisionService;
        const repository = yield* BrowserOrchestrationEvidenceRepository;
        const workflow = makeClassifiedRefsWorkflow("post-edit-verification");
        yield* seedArtifact(
          repository,
          EvidenceArtifactId.makeUnsafe("screenshot-classified-refs"),
        );

        const capturedCodeState = {
          captureStatus: "captured" as const,
          repoRoot: "/tmp/orchestrate",
          headSha: "head",
          dirtyHash: "dirty",
          changedFiles: [],
          capturedAt: "2026-04-28T00:00:01.000Z",
        };
        const bundleResult = yield* reviewer.createEvidenceBundle({
          workflowRunId: workflow.id,
          codeState: capturedCodeState,
        });
        const decisionResult = yield* reviewer.createDecision({
          evidenceBundleId: bundleResult.evidenceBundle.id,
          purpose: "code-change",
          finalCodeState: capturedCodeState,
          criteria: [
            {
              criterionId: AcceptanceCriterionId.makeUnsafe(
                "criterion-browser-workflow-hard-gates",
              ),
              status: "pass",
              evidenceRefs: [EvidenceArtifactId.makeUnsafe("screenshot-classified-refs")],
              reason: "Browser hard gates passed.",
            },
          ],
        });

        assert.strictEqual(decisionResult.decision.outcome, "needs-human-review");
        assert.ok(
          decisionResult.decision.gates.some(
            (gate) => gate.name === "criteria-evaluated" && gate.status === "warn",
          ),
        );
      }),
    );

    it.effect("accepts code-change decisions with explicit criteria and matching code state", () =>
      Effect.gen(function* () {
        const reviewer = yield* ReviewerDecisionService;
        const repository = yield* BrowserOrchestrationEvidenceRepository;
        const workflow = makeClassifiedRefsWorkflow();
        yield* seedArtifact(
          repository,
          EvidenceArtifactId.makeUnsafe("screenshot-classified-refs"),
        );
        yield* seedArtifact(
          repository,
          EvidenceArtifactId.makeUnsafe("artifact-code-diff"),
          "diff",
        );
        const capturedCodeState = {
          captureStatus: "captured" as const,
          repoRoot: "/tmp/orchestrate",
          headSha: "head",
          dirtyHash: "dirty",
          changedFiles: ["apps/web/src/App.tsx"],
          diffArtifactRef: EvidenceArtifactId.makeUnsafe("artifact-code-diff"),
          capturedAt: "2026-04-28T00:00:01.000Z",
        };

        const bundleResult = yield* reviewer.createEvidenceBundle({
          workflowRunId: workflow.id,
          codeState: capturedCodeState,
        });
        const decisionResult = yield* reviewer.createDecision({
          evidenceBundleId: bundleResult.evidenceBundle.id,
          purpose: "code-change",
          finalCodeState: capturedCodeState,
          criteria: [
            {
              criterionId: AcceptanceCriterionId.makeUnsafe("criterion-task-specific"),
              status: "pass",
              evidenceRefs: [EvidenceArtifactId.makeUnsafe("screenshot-classified-refs")],
              reason: "Task-specific behavior was verified.",
            },
          ],
        });

        assert.strictEqual(decisionResult.decision.outcome, "accepted");
        assert.strictEqual(decisionResult.decision.actionPacket, undefined);
        assert.ok(
          decisionResult.decision.gates.some(
            (gate) => gate.name === "criteria-evaluated" && gate.status === "pass",
          ),
        );
        assert.ok(
          decisionResult.decision.gates.some(
            (gate) => gate.name === "evidence-not-stale" && gate.status === "pass",
          ),
        );
      }),
    );
  },
);

makeReviewerOnlyLayer(makeClassifiedRefsWorkflow("post-edit-verification"))(
  "ReviewerDecisionServiceLive purpose downgrade guard",
  (it) => {
    it.effect("prevents caller-supplied purpose from downgrading workflow risk", () =>
      Effect.gen(function* () {
        const reviewer = yield* ReviewerDecisionService;
        const repository = yield* BrowserOrchestrationEvidenceRepository;
        const workflow = makeClassifiedRefsWorkflow("post-edit-verification");
        yield* seedArtifact(
          repository,
          EvidenceArtifactId.makeUnsafe("screenshot-classified-refs"),
        );

        const bundleResult = yield* reviewer.createEvidenceBundle({
          workflowRunId: workflow.id,
        });
        const decisionResult = yield* reviewer.createDecision({
          evidenceBundleId: bundleResult.evidenceBundle.id,
          purpose: "browser-smoke",
        });

        assert.strictEqual(decisionResult.decision.purpose, "post-edit-verification");
        assert.strictEqual(decisionResult.decision.outcome, "needs-human-review");
        assert.strictEqual(decisionResult.decision.actionPacket?.kind, "needs-human-review");
      }),
    );
  },
);

makeReviewerOnlyLayer(makeNoBrowserWorkflow("failed"))(
  "ReviewerDecisionServiceLive no-browser failed workflow",
  (it) => {
    it.effect("creates a blocked decision without inventing a browser session", () =>
      Effect.gen(function* () {
        const reviewer = yield* ReviewerDecisionService;
        const repository = yield* BrowserOrchestrationEvidenceRepository;
        const workflow = makeNoBrowserWorkflow("failed");

        const bundleResult = yield* reviewer.createEvidenceBundle({
          workflowRunId: workflow.id,
        });
        assert.strictEqual(bundleResult.evidenceBundle.browserSessionId, undefined);
        assert.strictEqual(bundleResult.evidenceBundle.browser, undefined);
        assert.ok(bundleResult.evidenceBundle.workflow);

        const persistedBundleRow = yield* repository.getEvidenceBundle({
          bundleId: bundleResult.evidenceBundle.id,
        });
        assert.ok(Option.isSome(persistedBundleRow));
        assert.strictEqual(Option.getOrThrow(persistedBundleRow).browserSessionId, null);
        assert.ok(Option.getOrThrow(persistedBundleRow).bundleSnapshotJson);

        const fetchedBundle = yield* reviewer.getEvidenceBundle({
          evidenceBundleId: bundleResult.evidenceBundle.id,
        });
        assert.strictEqual(fetchedBundle.evidenceBundle?.browserSessionId, undefined);
        assert.strictEqual(fetchedBundle.evidenceBundle?.browser, undefined);

        const decisionResult = yield* reviewer.createDecision({
          evidenceBundleId: bundleResult.evidenceBundle.id,
        });
        assert.strictEqual(decisionResult.decision.outcome, "blocked");
        assert.strictEqual(decisionResult.decision.actionPacket?.kind, "blocked");
        assert.ok(decisionResult.decision.actionPacket?.recommendedNextActions.length);
        assert.ok(decisionResult.decision.userVisibleSummaryRef);
        assert.ok(
          decisionResult.decision.gates?.some(
            (gate) =>
              gate.name === "screenshot-evidence-resolves" && gate.status === "not-applicable",
          ),
        );
        assert.ok(
          decisionResult.decision.gates?.some(
            (gate) => gate.name === "workflow-completed" && gate.status === "fail",
          ),
        );

        const listed = yield* reviewer.listDecisions({ sessionId: workflow.sessionId });
        assert.ok(listed.decisions.some((decision) => decision.id === decisionResult.decision.id));
      }),
    );
  },
);

makeReviewerOnlyLayer(makeNoBrowserWorkflow("completed"))(
  "ReviewerDecisionServiceLive no-browser completed workflow",
  (it) => {
    it.effect(
      "creates an inconclusive decision for completed workflow without browser evidence",
      () =>
        Effect.gen(function* () {
          const reviewer = yield* ReviewerDecisionService;
          const workflow = makeNoBrowserWorkflow("completed");

          const bundleResult = yield* reviewer.createEvidenceBundle({
            workflowRunId: workflow.id,
          });
          const decisionResult = yield* reviewer.createDecision({
            evidenceBundleId: bundleResult.evidenceBundle.id,
          });

          assert.strictEqual(bundleResult.evidenceBundle.browserSessionId, undefined);
          assert.strictEqual(decisionResult.decision.outcome, "inconclusive");
          assert.strictEqual(decisionResult.decision.actionPacket?.kind, "inconclusive");
          assert.ok(decisionResult.decision.actionPacket?.recommendedNextActions.length);
          assert.ok(decisionResult.decision.userVisibleSummaryRef);
          assert.ok(
            decisionResult.decision.gates?.some(
              (gate) => gate.name === "screenshot-evidence-resolves" && gate.status === "fail",
            ),
          );
        }),
    );
  },
);
