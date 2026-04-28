import { createHash, randomUUID } from "node:crypto";

import {
  AcceptanceCriterionId,
  BROWSER_ORCHESTRATION_SCHEMA_VERSION,
  type BrowserAssertionResult,
  type BrowserWorkflowRun,
  type CodeStateRef,
  EvidenceArtifactId,
  type EvidenceArtifactKind,
  EvidenceBundleId,
  type EvidenceBundle,
  type PreviewViewport,
  type ReviewerDecision,
  ReviewerDecisionId,
  type ReviewerDecisionListInput,
  type ReviewerFinding,
  type ReviewerGateResult,
  type ReviewerOutcome,
  ReworkPacketId,
  SessionEventId,
  type AcceptanceCriterionResult,
} from "@orchestrate/contracts";
import { Effect, Layer, Option } from "effect";

import { BrowserWorkflowManager } from "../../browserWorkflow/Services/BrowserWorkflowManager.ts";
import { BrowserOrchestrationEvidenceRepository } from "../../persistence/Services/BrowserOrchestrationEvidence.ts";
import type {
  EvidenceBundleRow,
  ReviewerDecisionRow,
} from "../../persistence/Services/BrowserOrchestrationEvidence.ts";
import {
  ReviewerDecisionService,
  type ReviewerDecisionServiceShape,
} from "../Services/ReviewerDecisionService.ts";

function now() {
  return new Date().toISOString();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function artifactId(kind: EvidenceArtifactKind, seed: string): EvidenceArtifactId {
  return EvidenceArtifactId.makeUnsafe(`${kind}-${sha256(seed).slice(0, 24)}`);
}

function eventId(): SessionEventId {
  return SessionEventId.makeUnsafe(`reviewer-event-${randomUUID()}`);
}

function errorFromUnknown(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

function uniqueRefs(refs: ReadonlyArray<EvidenceArtifactId | string>): EvidenceArtifactId[] {
  return [...new Set(refs.map(String))].map((ref) => EvidenceArtifactId.makeUnsafe(ref));
}

function assertionKey(result: BrowserAssertionResult): string {
  return result.assertionId ?? result.assertion.id ?? result.assertion.type;
}

function viewportKey(viewport: PreviewViewport): string {
  return `${viewport.width}x${viewport.height}@${viewport.deviceScaleFactor ?? 1}`;
}

function includesAll<T>(actual: ReadonlyArray<T>, required: ReadonlyArray<T>): boolean {
  const actualSet = new Set(actual);
  return required.every((item) => actualSet.has(item));
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function evidenceBundleFromRow(row: EvidenceBundleRow): EvidenceBundle {
  return {
    id: row.bundleId,
    sessionId: row.sessionId,
    workflowRunId: row.workflowRunId,
    previewTargetId: row.previewTargetId,
    taskSpecId: row.taskSpecId,
    acceptanceCriteriaId: row.acceptanceCriteriaId,
    permissionPolicyId: row.permissionPolicyId,
    browserSessionId: row.browserSessionId,
    codeState: parseJson<CodeStateRef>(row.codeStateJson, {
      repoRoot: process.cwd(),
      dirtyHash: "unknown",
      changedFiles: [],
      diffArtifactRef: EvidenceArtifactId.makeUnsafe("artifact-missing-code-state"),
      capturedAt: row.createdAt,
    }),
    artifactRefs: parseJson<EvidenceArtifactId[]>(row.artifactRefsJson, []),
    eventRefs: parseJson<SessionEventId[]>(row.eventRefsJson, []),
    createdAt: row.createdAt,
  };
}

function reviewerDecisionFromRow(row: ReviewerDecisionRow): ReviewerDecision {
  const reworkPacket = row.reworkPacketJson
    ? { reworkPacket: parseJson(row.reworkPacketJson, undefined) }
    : {};
  return {
    id: row.decisionId,
    sessionId: row.sessionId,
    workflowRunId: row.workflowRunId,
    evidenceBundleId: row.evidenceBundleId,
    outcome: row.outcome,
    confidence: row.confidence,
    criteria: parseJson(row.criteriaJson, []),
    criterionResults: parseJson(row.criteriaJson, []),
    findings: parseJson(row.findingsJson, []),
    unresolvedCriteria: parseJson(row.unresolvedCriteriaJson, []),
    ...reworkPacket,
    userVisibleSummaryRef: row.userVisibleSummaryRef,
    createdAt: row.createdAt,
  };
}

function defaultCodeState(diffArtifactRef: EvidenceArtifactId, capturedAt: string): CodeStateRef {
  return {
    repoRoot: process.cwd(),
    dirtyHash: "not-captured",
    changedFiles: [],
    diffArtifactRef,
    capturedAt,
  };
}

function makeSyntheticCriterionResult(input: {
  readonly status: AcceptanceCriterionResult["status"];
  readonly evidenceRefs: ReadonlyArray<EvidenceArtifactId>;
  readonly reason: string;
}): AcceptanceCriterionResult {
  return {
    criterionId: AcceptanceCriterionId.makeUnsafe("criterion-browser-workflow-hard-gates"),
    status: input.status,
    evidenceRefs: [...input.evidenceRefs],
    reason: input.reason,
  };
}

function failedAssertionResults(workflow: BrowserWorkflowRun): BrowserAssertionResult[] {
  return (workflow.assertionResults ?? []).filter((result) =>
    ["fail", "blocked", "inconclusive", "not-run", "not-evaluated"].includes(result.status),
  );
}

function assertionResultsFor(
  workflow: BrowserWorkflowRun,
  type: BrowserAssertionResult["assertion"]["type"],
): BrowserAssertionResult[] {
  return (workflow.assertionResults ?? []).filter((result) => result.assertion.type === type);
}

function gate(
  input: Pick<ReviewerGateResult, "name" | "status" | "message"> & {
    readonly evidenceRefs?: ReadonlyArray<EvidenceArtifactId>;
  },
): ReviewerGateResult {
  return {
    name: input.name,
    status: input.status,
    message: input.message,
    evidenceRefs: [...(input.evidenceRefs ?? [])],
  };
}

function buildHardGates(input: {
  readonly workflow: BrowserWorkflowRun;
  readonly evidenceBundle: EvidenceBundle;
  readonly screenshotArtifactsResolve: boolean;
  readonly requiredRoutes: ReadonlyArray<string>;
  readonly requiredViewports: ReadonlyArray<PreviewViewport>;
  readonly finalCodeState?: CodeStateRef | undefined;
  readonly finalCodeMutationCompletedAt?: string | undefined;
}): ReviewerGateResult[] {
  const { workflow, evidenceBundle } = input;
  const evidenceRefs = evidenceBundle.artifactRefs;
  const failedAssertions = failedAssertionResults(workflow);
  const pageErrorResults = assertionResultsFor(workflow, "no-page-errors");
  const consoleResults = assertionResultsFor(workflow, "no-console-errors");
  const networkResults = assertionResultsFor(workflow, "no-network-failures");
  const requiredRoutes = input.requiredRoutes.length ? input.requiredRoutes : workflow.routes;
  const requiredViewports = input.requiredViewports.length
    ? input.requiredViewports
    : workflow.viewports;
  const routesChecked = includesAll(workflow.routes, requiredRoutes);
  const viewportsChecked = includesAll(
    workflow.viewports.map(viewportKey),
    requiredViewports.map(viewportKey),
  );
  const evidenceStale =
    input.finalCodeState &&
    (input.finalCodeState.headSha !== evidenceBundle.codeState.headSha ||
      input.finalCodeState.dirtyHash !== evidenceBundle.codeState.dirtyHash ||
      (input.finalCodeMutationCompletedAt
        ? Date.parse(evidenceBundle.createdAt) <= Date.parse(input.finalCodeMutationCompletedAt)
        : false));

  return [
    gate({
      name: "evidence-bundle-exists",
      status: "pass",
      message: "Evidence bundle exists.",
      evidenceRefs,
    }),
    gate({
      name: "workflow-completed",
      status: workflow.status === "completed" ? "pass" : "fail",
      message:
        workflow.status === "completed"
          ? "Browser workflow completed."
          : `Browser workflow is ${workflow.status}.`,
      evidenceRefs,
    }),
    gate({
      name: "preview-target-opened",
      status: workflow.browserSessionId ? "pass" : "fail",
      message: workflow.browserSessionId
        ? "Preview target opened in a browser session."
        : "Preview target was not opened in a browser session.",
      evidenceRefs,
    }),
    gate({
      name: "dev-server-healthy",
      status:
        evidenceBundle.preview?.readinessEvidenceRef ||
        evidenceBundle.preview?.healthEvidenceRefs.length
          ? "pass"
          : "not-applicable",
      message:
        evidenceBundle.preview?.readinessEvidenceRef ||
        evidenceBundle.preview?.healthEvidenceRefs.length
          ? "Preview readiness evidence is present."
          : "No dev-server health gate applies to this workflow evidence bundle.",
      evidenceRefs: uniqueRefs([
        ...(evidenceBundle.preview?.healthEvidenceRefs ?? []),
        ...(evidenceBundle.preview?.readinessEvidenceRef
          ? [evidenceBundle.preview.readinessEvidenceRef]
          : []),
      ]),
    }),
    gate({
      name: "required-routes-checked",
      status: routesChecked ? "pass" : "fail",
      message: routesChecked
        ? "Required routes were checked."
        : "One or more required routes were not checked.",
      evidenceRefs,
    }),
    gate({
      name: "required-viewports-checked",
      status: viewportsChecked ? "pass" : "fail",
      message: viewportsChecked
        ? "Required viewports were checked."
        : "One or more required viewports were not checked.",
      evidenceRefs,
    }),
    gate({
      name: "screenshot-evidence-resolves",
      status: input.screenshotArtifactsResolve ? "pass" : "fail",
      message: input.screenshotArtifactsResolve
        ? "Screenshot artifact refs resolve."
        : "No screenshot artifact ref resolved through durable evidence.",
      evidenceRefs: workflow.screenshotArtifactRefs ?? evidenceRefs,
    }),
    gate({
      name: "no-page-errors",
      status: pageErrorResults.length
        ? pageErrorResults.some((result) => result.status === "fail")
          ? "fail"
          : "pass"
        : "not-applicable",
      message: pageErrorResults.some((result) => result.status === "fail")
        ? "Page error assertion failed."
        : pageErrorResults.length
          ? "No page errors assertion passed."
          : "No page-error assertion was required.",
      evidenceRefs: uniqueRefs(pageErrorResults.flatMap((result) => result.evidenceRefs)),
    }),
    gate({
      name: "no-console-errors",
      status: consoleResults.length
        ? consoleResults.some((result) => result.status === "fail")
          ? "fail"
          : "pass"
        : "not-applicable",
      message: consoleResults.some((result) => result.status === "fail")
        ? "Console error assertion failed."
        : consoleResults.length
          ? "No console errors assertion passed."
          : "No console-error assertion was required.",
      evidenceRefs: uniqueRefs(consoleResults.flatMap((result) => result.evidenceRefs)),
    }),
    gate({
      name: "no-network-failures",
      status: networkResults.length
        ? networkResults.some((result) => result.status === "fail")
          ? "fail"
          : "pass"
        : "not-applicable",
      message: networkResults.some((result) => result.status === "fail")
        ? "Network failure assertion failed."
        : networkResults.length
          ? "No network failures assertion passed."
          : "No network-failure assertion was required.",
      evidenceRefs: uniqueRefs(networkResults.flatMap((result) => result.evidenceRefs)),
    }),
    gate({
      name: "assertions-passed",
      status: failedAssertions.length === 0 ? "pass" : "fail",
      message:
        failedAssertions.length === 0
          ? "All workflow assertions passed."
          : `${failedAssertions.length} workflow assertion(s) failed or were inconclusive.`,
      evidenceRefs: uniqueRefs(failedAssertions.flatMap((result) => result.evidenceRefs)),
    }),
    gate({
      name: "evidence-not-stale",
      status: input.finalCodeState ? (evidenceStale ? "fail" : "pass") : "not-applicable",
      message: input.finalCodeState
        ? evidenceStale
          ? "Evidence is stale relative to the final code state."
          : "Evidence code state matches the final review state."
        : "No final code state was supplied for freshness comparison.",
      evidenceRefs,
    }),
  ];
}

function buildFindings(input: {
  readonly workflow: BrowserWorkflowRun;
  readonly evidenceBundle: EvidenceBundle;
  readonly gates: ReadonlyArray<ReviewerGateResult>;
}): ReviewerFinding[] {
  const gateFindings = input.gates
    .filter((item) => item.status === "fail")
    .map(
      (item): ReviewerFinding => ({
        id: `finding-${item.name}`,
        severity:
          item.name === "workflow-completed" ||
          item.name === "preview-target-opened" ||
          item.name === "screenshot-evidence-resolves"
            ? "blocker"
            : "major",
        title: item.name,
        description: item.message,
        evidenceRefs: item.evidenceRefs.length
          ? item.evidenceRefs
          : input.evidenceBundle.artifactRefs,
        suggestedAction: suggestedActionForGate(item.name),
      }),
    );
  const assertionFindings = failedAssertionResults(input.workflow).map(
    (result): ReviewerFinding => ({
      id: `finding-assertion-${assertionKey(result)}`,
      severity: "major",
      title: `Assertion failed: ${result.assertion.type}`,
      description: result.message,
      evidenceRefs: result.evidenceRefs.length
        ? result.evidenceRefs
        : input.evidenceBundle.artifactRefs,
      suggestedAction: "Fix the failing assertion and rerun browser.workflow.start.",
    }),
  );
  return [...gateFindings, ...assertionFindings];
}

function suggestedActionForGate(gateName: ReviewerGateResult["name"]): string {
  switch (gateName) {
    case "evidence-not-stale":
      return "Rerun browser verification after final code changes.";
    case "required-routes-checked":
      return "Rerun the workflow with the missing required routes.";
    case "required-viewports-checked":
      return "Rerun the workflow with the missing required viewports.";
    case "screenshot-evidence-resolves":
      return "Capture a fresh screenshot artifact and rerun review.";
    default:
      return "Fix the failing review gate and rerun browser verification.";
  }
}

function chooseOutcome(input: {
  readonly workflow: BrowserWorkflowRun;
  readonly gates: ReadonlyArray<ReviewerGateResult>;
  readonly criteria: ReadonlyArray<AcceptanceCriterionResult>;
}): ReviewerOutcome {
  const failed = input.gates.filter((item) => item.status === "fail");
  if (input.workflow.status === "failed" && !(input.workflow.observationRefs?.length ?? 0)) {
    return "blocked";
  }
  if (failed.some((item) => item.name === "screenshot-evidence-resolves")) {
    return "inconclusive";
  }
  if (failed.length > 0) {
    return "rework-required";
  }
  if (
    input.criteria.some(
      (criterion) => criterion.status === "fail" || criterion.status === "not-evaluated",
    )
  ) {
    return "rework-required";
  }
  return input.gates.some((item) => item.status === "warn") ? "accepted-with-notes" : "accepted";
}

function formatSummary(input: {
  readonly decision: Omit<ReviewerDecision, "userVisibleSummaryRef">;
  readonly workflow: BrowserWorkflowRun;
  readonly gates: ReadonlyArray<ReviewerGateResult>;
  readonly evidenceBundle: EvidenceBundle;
}) {
  const failed = input.gates.filter((item) => item.status === "fail");
  const routes = input.workflow.routes.join(", ");
  const viewports = input.workflow.viewports.map(viewportKey).join(", ");
  return [
    `Decision: ${input.decision.outcome}`,
    "",
    "Workflow:",
    `- Workflow run: ${input.workflow.id}`,
    `- Preview target: ${input.workflow.previewTargetId}`,
    `- Routes checked: ${routes}`,
    `- Viewports checked: ${viewports}`,
    "",
    "Evidence:",
    `- Evidence bundle: ${input.evidenceBundle.id}`,
    `- Screenshots: ${(input.workflow.screenshotArtifactRefs ?? []).join(", ") || "none"}`,
    `- Observations: ${(input.workflow.observationRefs ?? []).join(", ") || "none"}`,
    "",
    "Gates:",
    ...input.gates.map((item) => `- ${item.name}: ${item.status} (${item.message})`),
    "",
    failed.length
      ? `Next action: ${failed[0]?.message ?? "Fix failing gates and rerun."}`
      : "Next action: Accept or inspect evidence.",
  ].join("\n");
}

export const ReviewerDecisionServiceLive = Layer.effect(
  ReviewerDecisionService,
  Effect.gen(function* () {
    const repository = yield* BrowserOrchestrationEvidenceRepository;
    const workflows = yield* BrowserWorkflowManager;
    const evidenceBundles = new Map<string, EvidenceBundle>();
    const decisions = new Map<string, ReviewerDecision>();

    const writeArtifact = (
      sessionId: string,
      kind: EvidenceArtifactKind,
      content: string,
      contentType: string,
      metadata: Record<string, unknown> = {},
    ) =>
      Effect.gen(function* () {
        const createdAt = now();
        const ref = artifactId(kind, `${sessionId}:${kind}:${content}:${createdAt}`);
        yield* repository.writeEvidenceArtifact({
          artifactId: ref,
          schemaVersion: BROWSER_ORCHESTRATION_SCHEMA_VERSION,
          kind,
          sha256: sha256(content),
          byteSize: Buffer.byteLength(content),
          contentType,
          storageUri: `sqlite://evidence_artifact_contents/${ref}`,
          sensitivity: "workspace-internal",
          access: "safe-for-user-report",
          redactedArtifactId: null,
          supersededByArtifactId: null,
          metadataJson: JSON.stringify(metadata),
          createdAt,
        });
        yield* repository.writeEvidenceArtifactContent({
          artifactId: ref,
          contentText: content,
          createdAt,
        });
        return ref;
      });

    const appendEvent = (
      sessionId: string,
      workflowRunId: BrowserWorkflowRun["id"],
      type: "EvidenceBundleCreated" | "ReviewerDecisionCreated",
      artifactRefs: ReadonlyArray<EvidenceArtifactId>,
      payload: unknown,
    ) =>
      repository.appendSessionEvent({
        eventId: eventId(),
        sessionId,
        workflowRunId,
        type,
        actor: "reviewer",
        artifactRefsJson: JSON.stringify(artifactRefs),
        payloadJson: JSON.stringify(payload),
        occurredAt: now(),
      });

    const getWorkflowOrFail = (workflowRunId: BrowserWorkflowRun["id"]) =>
      workflows
        .get({ workflowRunId })
        .pipe(
          Effect.flatMap((result) =>
            result.workflow
              ? Effect.succeed(result.workflow)
              : Effect.fail(new Error(`Browser workflow not found: ${workflowRunId}`)),
          ),
        );

    const artifactKind = (ref: EvidenceArtifactId) =>
      repository
        .getEvidenceArtifact({ artifactId: ref })
        .pipe(Effect.map((artifact) => (Option.isSome(artifact) ? artifact.value.kind : null)));

    const classifyRefs = (refs: ReadonlyArray<EvidenceArtifactId>) =>
      Effect.gen(function* () {
        const assertionResultRefs: EvidenceArtifactId[] = [];
        const statusEventRefs: EvidenceArtifactId[] = [];
        const consoleSummaryRefs: EvidenceArtifactId[] = [];
        const networkSummaryRefs: EvidenceArtifactId[] = [];
        const pageErrorRefs: EvidenceArtifactId[] = [];
        const healthEvidenceRefs: EvidenceArtifactId[] = [];
        const serverLogRefs: EvidenceArtifactId[] = [];
        let readinessEvidenceRef: EvidenceArtifactId | undefined;
        for (const ref of refs) {
          const kind = yield* artifactKind(ref);
          switch (kind) {
            case "browser-workflow-assertion-result":
              assertionResultRefs.push(ref);
              break;
            case "browser-workflow-status-changed":
            case "browser-workflow-created":
            case "browser-workflow-completed":
            case "browser-workflow-failed":
            case "browser-workflow-cancelled":
              statusEventRefs.push(ref);
              break;
            case "browser-console-summary":
            case "console-log":
              consoleSummaryRefs.push(ref);
              break;
            case "browser-network-summary":
            case "network-log":
              networkSummaryRefs.push(ref);
              break;
            case "browser-page-error-summary":
            case "page-error-log":
              pageErrorRefs.push(ref);
              break;
            case "dev-server-health-check":
              healthEvidenceRefs.push(ref);
              readinessEvidenceRef = readinessEvidenceRef ?? ref;
              break;
            case "dev-server-stdout":
            case "dev-server-stderr":
            case "server-log":
              serverLogRefs.push(ref);
              break;
          }
        }
        return {
          assertionResultRefs,
          statusEventRefs,
          consoleSummaryRefs,
          networkSummaryRefs,
          pageErrorRefs,
          healthEvidenceRefs,
          serverLogRefs,
          readinessEvidenceRef,
        };
      });

    const createEvidenceBundle: ReviewerDecisionServiceShape["createEvidenceBundle"] = (input) =>
      Effect.gen(function* () {
        const workflow = yield* getWorkflowOrFail(input.workflowRunId);
        if (!workflow.browserSessionId) {
          return yield* Effect.fail(
            new Error(`Workflow has no browser session: ${input.workflowRunId}`),
          );
        }
        const createdAt = now();
        const bundleId = EvidenceBundleId.makeUnsafe(`evidence-bundle-${randomUUID()}`);
        const diffArtifactRef =
          input.codeState?.diffArtifactRef ??
          (yield* writeArtifact(
            workflow.sessionId,
            "diff",
            JSON.stringify({
              workflowRunId: workflow.id,
              note: "No code diff was supplied for this deterministic browser review bundle.",
            }),
            "application/json",
            { workflowRunId: workflow.id, generatedBy: "ReviewerDecisionService" },
          ));
        const artifactRefs = uniqueRefs([
          ...(workflow.evidenceRefs ?? []),
          ...(workflow.observationRefs ?? []),
          ...(workflow.screenshotArtifactRefs ?? []),
          diffArtifactRef,
        ]);
        const classified = yield* classifyRefs(artifactRefs);
        const codeState = input.codeState ?? defaultCodeState(diffArtifactRef, createdAt);
        const bundle: EvidenceBundle = {
          id: bundleId,
          sessionId: workflow.sessionId,
          workflowRunId: workflow.id,
          previewTargetId: workflow.previewTargetId,
          taskSpecId: workflow.taskSpecId,
          acceptanceCriteriaId: workflow.acceptanceCriteriaId,
          permissionPolicyId: workflow.permissionPolicyId,
          browserSessionId: workflow.browserSessionId,
          codeState,
          artifactRefs,
          eventRefs: [],
          preview: {
            serverLogRefs: classified.serverLogRefs,
            healthEvidenceRefs: classified.healthEvidenceRefs,
            ...(classified.readinessEvidenceRef
              ? { readinessEvidenceRef: classified.readinessEvidenceRef }
              : {}),
          },
          browser: {
            observationRefs: workflow.observationRefs ?? [],
            screenshotArtifactRefs: workflow.screenshotArtifactRefs ?? [],
            consoleSummaryRefs: classified.consoleSummaryRefs,
            networkSummaryRefs: classified.networkSummaryRefs,
            pageErrorRefs: classified.pageErrorRefs,
          },
          workflow: {
            workflowRunRef: workflow.id,
            assertionResultRefs: classified.assertionResultRefs,
            statusEventRefs: classified.statusEventRefs,
          },
          createdAt,
        };
        yield* repository.createEvidenceBundle({
          bundleId: bundle.id,
          sessionId: bundle.sessionId,
          workflowRunId: bundle.workflowRunId,
          previewTargetId: bundle.previewTargetId,
          taskSpecId: bundle.taskSpecId,
          acceptanceCriteriaId: bundle.acceptanceCriteriaId,
          permissionPolicyId: bundle.permissionPolicyId,
          browserSessionId: bundle.browserSessionId,
          codeStateJson: JSON.stringify(bundle.codeState),
          artifactRefsJson: JSON.stringify(bundle.artifactRefs),
          eventRefsJson: JSON.stringify(bundle.eventRefs),
          createdAt: bundle.createdAt,
        });
        yield* appendEvent(workflow.sessionId, workflow.id, "EvidenceBundleCreated", artifactRefs, {
          evidenceBundleId: bundle.id,
          workflowRunId: workflow.id,
        });
        evidenceBundles.set(String(bundle.id), bundle);
        return { evidenceBundle: bundle };
      }).pipe(Effect.mapError(errorFromUnknown));

    const getEvidenceBundle: ReviewerDecisionServiceShape["getEvidenceBundle"] = (input) =>
      Effect.gen(function* () {
        const cached = evidenceBundles.get(String(input.evidenceBundleId));
        if (cached) return { evidenceBundle: cached };
        const row = yield* repository.getEvidenceBundle({ bundleId: input.evidenceBundleId });
        return {
          evidenceBundle: Option.isSome(row) ? evidenceBundleFromRow(row.value) : undefined,
        };
      }).pipe(Effect.mapError(errorFromUnknown));

    const loadEvidenceBundleOrFail = (bundleId: EvidenceBundleId) =>
      getEvidenceBundle({ evidenceBundleId: bundleId }).pipe(
        Effect.flatMap((result) =>
          result.evidenceBundle
            ? Effect.succeed(result.evidenceBundle)
            : Effect.fail(new Error(`Evidence bundle not found: ${bundleId}`)),
        ),
      );

    const screenshotsResolve = (workflow: BrowserWorkflowRun) =>
      Effect.gen(function* () {
        const refs = workflow.screenshotArtifactRefs ?? [];
        if (!refs.length) return false;
        for (const ref of refs) {
          const artifact = yield* repository.getEvidenceArtifact({ artifactId: ref });
          if (Option.isSome(artifact)) return true;
        }
        return false;
      });

    const createDecision: ReviewerDecisionServiceShape["createDecision"] = (input) =>
      Effect.gen(function* () {
        const bundle = yield* loadEvidenceBundleOrFail(input.evidenceBundleId);
        const workflow = yield* getWorkflowOrFail(input.workflowRunId ?? bundle.workflowRunId);
        const screenshotArtifactsResolve = yield* screenshotsResolve(workflow);
        const gates = buildHardGates({
          workflow,
          evidenceBundle: bundle,
          screenshotArtifactsResolve,
          requiredRoutes: input.requiredRoutes ?? workflow.routes,
          requiredViewports: input.requiredViewports ?? workflow.viewports,
          finalCodeState: input.finalCodeState,
          finalCodeMutationCompletedAt: input.finalCodeMutationCompletedAt,
        });
        const findings = buildFindings({ workflow, evidenceBundle: bundle, gates });
        const defaultCriterionStatus =
          gates.every((item) => item.status !== "fail") &&
          failedAssertionResults(workflow).length === 0
            ? "pass"
            : "fail";
        const suppliedCriteria = input.criteria?.length
          ? input.criteria
          : [
              makeSyntheticCriterionResult({
                status: defaultCriterionStatus,
                evidenceRefs: bundle.artifactRefs,
                reason:
                  defaultCriterionStatus === "pass"
                    ? "Deterministic browser workflow gates passed."
                    : "One or more deterministic browser workflow gates failed.",
              }),
            ];
        const suppliedCriterionIds = new Set(
          suppliedCriteria.map((criterion) => criterion.criterionId),
        );
        const missingRequiredCriteria = (input.requiredCriterionIds ?? []).filter(
          (criterionId) => !suppliedCriterionIds.has(criterionId),
        );
        const criteria = [
          ...suppliedCriteria,
          ...missingRequiredCriteria.map(
            (criterionId): AcceptanceCriterionResult => ({
              criterionId,
              status: "not-evaluated",
              evidenceRefs: bundle.artifactRefs,
              reason: "Required acceptance criterion was not evaluated by this review.",
            }),
          ),
        ];
        const unresolvedCriteria = criteria
          .filter(
            (criterion) => criterion.status === "fail" || criterion.status === "not-evaluated",
          )
          .map((criterion) => criterion.criterionId);
        const outcome = chooseOutcome({ workflow, gates, criteria });
        const decisionId = ReviewerDecisionId.makeUnsafe(`reviewer-decision-${randomUUID()}`);
        const reworkPacket =
          outcome === "rework-required"
            ? {
                id: ReworkPacketId.makeUnsafe(`rework-packet-${randomUUID()}`),
                decisionId,
                reason:
                  findings[0]?.description ??
                  "Deterministic browser review gates require focused rework.",
                blockingFindings: findings.filter((finding) => finding.severity !== "note"),
                focusedRoutes: input.requiredRoutes?.length
                  ? input.requiredRoutes
                  : workflow.routes,
                focusedViewports: input.requiredViewports?.length
                  ? input.requiredViewports
                  : workflow.viewports,
                relevantEvidenceRefs: bundle.artifactRefs,
                relevantCommentRefs: [],
                relevantDiffRefs: [bundle.codeState.diffArtifactRef],
                recommendedNextActions: findings.length
                  ? findings.map((finding) => finding.suggestedAction ?? finding.title)
                  : ["Fix failing workflow assertions and rerun browser.workflow.start."],
                maxReworkAttemptsRemaining:
                  input.maxReworkAttemptsRemaining ?? workflow.retryBudget,
              }
            : undefined;
        const decisionBase = {
          id: decisionId,
          sessionId: bundle.sessionId,
          workflowRunId: workflow.id,
          evidenceBundleId: bundle.id,
          outcome,
          confidence:
            outcome === "accepted" ? "high" : outcome === "inconclusive" ? "low" : "medium",
          gates,
          criteria,
          criterionResults: criteria,
          findings,
          unresolvedCriteria,
          ...(reworkPacket ? { reworkPacket } : {}),
          createdAt: now(),
        } satisfies Omit<ReviewerDecision, "userVisibleSummaryRef">;
        const summary = formatSummary({
          decision: decisionBase,
          workflow,
          gates,
          evidenceBundle: bundle,
        });
        const summaryRef = yield* writeArtifact(
          bundle.sessionId,
          "workflow-trace",
          summary,
          "text/markdown",
          {
            type: "reviewer-user-visible-summary",
            workflowRunId: workflow.id,
            evidenceBundleId: bundle.id,
            outcome,
          },
        );
        const decision: ReviewerDecision = {
          ...decisionBase,
          userVisibleSummaryRef: summaryRef,
        };
        yield* repository.createReviewerDecision({
          decisionId: decision.id,
          sessionId: decision.sessionId,
          workflowRunId: decision.workflowRunId,
          evidenceBundleId: decision.evidenceBundleId,
          outcome: decision.outcome,
          confidence: decision.confidence,
          criteriaJson: JSON.stringify(criteria),
          findingsJson: JSON.stringify(findings),
          unresolvedCriteriaJson: JSON.stringify(unresolvedCriteria),
          reworkPacketJson: decision.reworkPacket ? JSON.stringify(decision.reworkPacket) : null,
          userVisibleSummaryRef: summaryRef,
          createdAt: decision.createdAt,
        });
        yield* appendEvent(bundle.sessionId, workflow.id, "ReviewerDecisionCreated", [summaryRef], {
          decisionId: decision.id,
          evidenceBundleId: bundle.id,
          outcome: decision.outcome,
          gates,
        });
        decisions.set(String(decision.id), decision);
        return { decision, evidenceBundle: bundle };
      }).pipe(Effect.mapError(errorFromUnknown));

    const getDecision: ReviewerDecisionServiceShape["getDecision"] = (input) =>
      Effect.gen(function* () {
        const cached = decisions.get(String(input.decisionId));
        if (cached) return { decision: cached };
        const row = yield* repository.getReviewerDecision({ decisionId: input.decisionId });
        return {
          decision: Option.isSome(row) ? reviewerDecisionFromRow(row.value) : undefined,
        };
      }).pipe(Effect.mapError(errorFromUnknown));

    const listDecisions: ReviewerDecisionServiceShape["listDecisions"] = (
      input: ReviewerDecisionListInput,
    ) =>
      Effect.sync(() => {
        const all = [...decisions.values()];
        const filtered = input.sessionId
          ? all.filter((decision) => String(decision.sessionId) === String(input.sessionId))
          : all;
        return { decisions: filtered };
      });

    return {
      createEvidenceBundle,
      getEvidenceBundle,
      createDecision,
      getDecision,
      listDecisions,
    } satisfies ReviewerDecisionServiceShape;
  }),
);
