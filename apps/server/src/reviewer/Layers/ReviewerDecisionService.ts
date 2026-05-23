import { createHash, randomUUID } from "node:crypto";

import {
  AcceptanceCriterionId,
  BROWSER_ORCHESTRATION_SCHEMA_VERSION,
  BrowserAnnotationId,
  BrowserSessionId,
  CommandId,
  type BrowserAssertionResult,
  type BrowserWorkflowRun,
  type CodeStateRef,
  EvidenceArtifactId,
  type EvidenceArtifactKind,
  EvidenceBundle as EvidenceBundleSchema,
  EvidenceBundleId,
  MessageId,
  type EvidenceBundle,
  type PreviewViewport,
  PreviewTargetId,
  type ReviewerActionPacket,
  type ReviewerDecision,
  ReviewerDecisionId,
  type ReviewerDecisionListInput,
  type ReviewerDecisionPurpose,
  type ReviewerReworkStartResult,
  type ReviewerFinding,
  type ReviewerGateResult,
  type ReviewerOutcome,
  ReworkPacketId,
  SessionEventId,
  ThreadId,
  OrchestratorRunId,
  OrchestratorTaskId,
  OrchestratorWorkerId,
  WorkflowRunId,
  type AcceptanceCriterionResult,
  type BrowserAnnotationReworkTarget,
} from "@orchestrate/contracts";
import { Effect, Layer, Option, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { BrowserWorkflowManager } from "../../browserWorkflow/Services/BrowserWorkflowManager.ts";
import { workerKickoffMessage } from "../../orchestration/reportProtocol.ts";
import { OrchestrationEngineService } from "../../orchestration/Services/OrchestrationEngine.ts";
import { BrowserAnnotationRepository } from "../../persistence/Services/BrowserAnnotations.ts";
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

function commandId(): CommandId {
  return CommandId.makeUnsafe(`reviewer-rework:${randomUUID()}`);
}

function errorFromUnknown(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

function uniqueRefs(refs: ReadonlyArray<EvidenceArtifactId | string>): EvidenceArtifactId[] {
  return [...new Set(refs.map(String))].map((ref) => EvidenceArtifactId.makeUnsafe(ref));
}

function uniqueStrings(values: ReadonlyArray<string>): string[] {
  return [...new Set(values)];
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

const decodeEvidenceBundle = Schema.decodeUnknownSync(EvidenceBundleSchema);

function evidenceBundleFromRow(row: EvidenceBundleRow): EvidenceBundle {
  if (row.bundleSnapshotJson) {
    const snapshot = decodeEvidenceBundle(JSON.parse(row.bundleSnapshotJson));
    if (
      snapshot.id !== row.bundleId ||
      snapshot.sessionId !== row.sessionId ||
      snapshot.workflowRunId !== row.workflowRunId ||
      snapshot.previewTargetId !== row.previewTargetId
    ) {
      throw new Error(`Evidence bundle snapshot identity mismatch: ${row.bundleId}`);
    }
    return snapshot;
  }
  return {
    id: row.bundleId,
    sessionId: row.sessionId,
    workflowRunId: row.workflowRunId,
    previewTargetId: row.previewTargetId,
    taskSpecId: row.taskSpecId,
    acceptanceCriteriaId: row.acceptanceCriteriaId,
    permissionPolicyId: row.permissionPolicyId,
    ...(row.browserSessionId ? { browserSessionId: row.browserSessionId } : {}),
    codeState: parseJson<CodeStateRef>(row.codeStateJson, {
      repoRoot: process.cwd(),
      captureStatus: "unknown",
      changedFiles: [],
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
  const actionPacket = row.actionPacketJson
    ? { actionPacket: parseJson(row.actionPacketJson, undefined) }
    : {};
  return {
    id: row.decisionId,
    sessionId: row.sessionId,
    workflowRunId: row.workflowRunId,
    evidenceBundleId: row.evidenceBundleId,
    purpose: row.purpose,
    outcome: row.outcome,
    confidence: row.confidence,
    gates: parseJson(row.gatesJson, []),
    criteria: parseJson(row.criteriaJson, []),
    criterionResults: parseJson(row.criteriaJson, []),
    findings: parseJson(row.findingsJson, []),
    unresolvedCriteria: parseJson(row.unresolvedCriteriaJson, []),
    ...reworkPacket,
    ...actionPacket,
    userVisibleSummaryRef: row.userVisibleSummaryRef,
    createdAt: row.createdAt,
  };
}

function defaultCodeState(capturedAt: string): CodeStateRef {
  return {
    captureStatus: "unknown",
    repoRoot: process.cwd(),
    changedFiles: [],
    capturedAt,
  };
}

function makeSyntheticCriterionResult(input: {
  readonly status: "pass" | "fail" | "warning" | "not-evaluated" | "not-applicable";
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

function derivePurpose(
  workflow: BrowserWorkflowRun,
  explicitPurpose?: ReviewerDecisionPurpose | undefined,
): ReviewerDecisionPurpose {
  const workflowPurpose = (() => {
    switch (workflow.purpose) {
      case "initial-preview":
        return "browser-smoke";
      case "post-edit-verification":
        return "post-edit-verification";
      case "comment-resolution":
        return "comment-resolution";
      case "regression-check":
        return "post-edit-verification";
      case "manual-human-review":
        return "manual-review";
      default:
        return "manual-review";
    }
  })();
  if (!explicitPurpose) return workflowPurpose;
  return purposeRank(explicitPurpose) > purposeRank(workflowPurpose)
    ? explicitPurpose
    : workflowPurpose;
}

function purposeRank(purpose: ReviewerDecisionPurpose): number {
  switch (purpose) {
    case "browser-smoke":
      return 0;
    case "manual-review":
      return 1;
    case "post-edit-verification":
      return 2;
    case "comment-resolution":
      return 3;
    case "code-change":
      return 4;
  }
}

function isTaskSpecificCriterion(criterion: AcceptanceCriterionResult): boolean {
  switch (String(criterion.criterionId)) {
    case "criterion-browser-workflow-hard-gates":
    case "criterion-user-acceptance-criteria":
      return false;
    default:
      return true;
  }
}

function isCodeChangeLikePurpose(purpose: ReviewerDecisionPurpose): boolean {
  return (
    purpose === "code-change" ||
    purpose === "post-edit-verification" ||
    purpose === "comment-resolution"
  );
}

function routeForAnnotation(url: string | undefined) {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}

function buildHardGates(input: {
  readonly workflow: BrowserWorkflowRun;
  readonly evidenceBundle: EvidenceBundle;
  readonly purpose: ReviewerDecisionPurpose;
  readonly screenshotArtifactsResolve: boolean;
  readonly requiredRoutes: ReadonlyArray<string>;
  readonly requiredViewports: ReadonlyArray<PreviewViewport>;
  readonly hasTaskSpecificCriteria: boolean;
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
  const failedBeforeBrowser =
    workflow.status === "failed" &&
    !workflow.browserSessionId &&
    !(workflow.observationRefs?.length ?? 0);
  const evidenceStale =
    input.finalCodeState &&
    ((input.finalCodeState.headSha &&
      evidenceBundle.codeState.headSha &&
      input.finalCodeState.headSha !== evidenceBundle.codeState.headSha) ||
      (input.finalCodeState.dirtyHash &&
        evidenceBundle.codeState.dirtyHash &&
        input.finalCodeState.dirtyHash !== evidenceBundle.codeState.dirtyHash) ||
      (input.finalCodeMutationCompletedAt
        ? Date.parse(evidenceBundle.createdAt) <= Date.parse(input.finalCodeMutationCompletedAt)
        : false));
  const codeStateUnknown = (evidenceBundle.codeState.captureStatus ?? "captured") === "unknown";
  const codeChangeLike = isCodeChangeLikePurpose(input.purpose);

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
      status: failedBeforeBrowser
        ? "not-applicable"
        : input.screenshotArtifactsResolve
          ? "pass"
          : "fail",
      message: failedBeforeBrowser
        ? "No browser session was opened; screenshot evidence was not expected."
        : input.screenshotArtifactsResolve
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
      status: input.finalCodeState
        ? evidenceStale || codeStateUnknown
          ? "fail"
          : "pass"
        : codeStateUnknown && codeChangeLike
          ? "warn"
          : "not-applicable",
      message: input.finalCodeState
        ? codeStateUnknown
          ? "Evidence code state was not captured and cannot be compared to the final review state."
          : evidenceStale
            ? "Evidence is stale relative to the final code state."
            : "Evidence code state matches the final review state."
        : codeStateUnknown && codeChangeLike
          ? "Evidence code state was not captured for a code-change-like review."
          : codeStateUnknown
            ? "No captured code state was supplied for freshness comparison."
            : "No final code state was supplied for freshness comparison.",
      evidenceRefs,
    }),
    gate({
      name: "criteria-evaluated",
      status: codeChangeLike ? (input.hasTaskSpecificCriteria ? "pass" : "warn") : "not-applicable",
      message: codeChangeLike
        ? input.hasTaskSpecificCriteria
          ? "Task-specific acceptance criteria were evaluated."
          : "No task-specific acceptance criteria were supplied for this code-change-like review."
        : "Task-specific acceptance criteria are not required for this reviewer purpose.",
      evidenceRefs,
    }),
    gate({
      name: "comments-addressed",
      status: evidenceBundle.annotations
        ? evidenceBundle.annotations.unresolvedAnnotationRefs.length
          ? "fail"
          : "pass"
        : "not-applicable",
      message: evidenceBundle.annotations
        ? evidenceBundle.annotations.unresolvedAnnotationRefs.length
          ? `${evidenceBundle.annotations.unresolvedAnnotationRefs.length} browser comment(s) remain unresolved.`
          : "Browser comments are resolved."
        : "No browser comments were attached to this review.",
      evidenceRefs: evidenceBundle.annotations?.artifactRefs ?? [],
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
  readonly purpose: ReviewerDecisionPurpose;
  readonly hasTaskSpecificCriteria: boolean;
  readonly codeStateUnknown: boolean;
}): ReviewerOutcome {
  const failed = input.gates.filter((item) => item.status === "fail");
  const codeChangeLike = isCodeChangeLikePurpose(input.purpose);
  if (input.workflow.status === "failed" && !(input.workflow.observationRefs?.length ?? 0)) {
    return "blocked";
  }
  if (
    input.workflow.status === "completed" &&
    (!input.workflow.browserSessionId || !(input.workflow.observationRefs?.length ?? 0))
  ) {
    return "inconclusive";
  }
  if (failed.some((item) => item.name === "screenshot-evidence-resolves")) {
    return "inconclusive";
  }
  if (failed.length > 0) {
    return "rework-required";
  }
  if (codeChangeLike && (input.codeStateUnknown || !input.hasTaskSpecificCriteria)) {
    return "needs-human-review";
  }
  if (input.purpose === "manual-review" && input.codeStateUnknown) {
    return "needs-human-review";
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

function makeActionPacket(input: {
  readonly decisionId: ReviewerDecisionId;
  readonly outcome: ReviewerOutcome;
  readonly purpose: ReviewerDecisionPurpose;
  readonly workflow: BrowserWorkflowRun;
  readonly gates: ReadonlyArray<ReviewerGateResult>;
  readonly criteria: ReadonlyArray<AcceptanceCriterionResult>;
  readonly findings: ReadonlyArray<ReviewerFinding>;
  readonly evidenceBundle: EvidenceBundle;
  readonly focusedRoutes: ReadonlyArray<string>;
  readonly focusedViewports: ReadonlyArray<PreviewViewport>;
  readonly createdAt: string;
}): ReviewerActionPacket | undefined {
  const failedGates = input.gates.filter((item) => item.status === "fail");
  const warnGates = input.gates.filter((item) => item.status === "warn");
  const relevantGates = [...failedGates, ...warnGates];
  const unresolvedCriteria = input.criteria.filter(
    (criterion) =>
      criterion.status === "fail" ||
      criterion.status === "not-evaluated" ||
      criterion.status === "warning",
  );
  const relevantEvidenceRefs = uniqueRefs([
    ...input.evidenceBundle.artifactRefs,
    ...relevantGates.flatMap((gateResult) => gateResult.evidenceRefs),
    ...input.findings.flatMap((finding) => finding.evidenceRefs),
  ]);
  const base = {
    id: `reviewer-action-packet-${randomUUID()}`,
    decisionId: input.decisionId,
    reason:
      input.findings[0]?.description ??
      relevantGates[0]?.message ??
      "Reviewer decision requires follow-up.",
    blockingFindings: input.findings.filter((finding) => finding.severity !== "note"),
    relevantEvidenceRefs,
    relevantGateNames: [
      ...new Set(relevantGates.map((gateResult) => gateResult.name)),
    ] as ReviewerActionPacket["relevantGateNames"],
    relevantCriterionIds: unresolvedCriteria.map((criterion) => criterion.criterionId),
    focusedRoutes: [...input.focusedRoutes],
    focusedViewports: [...input.focusedViewports],
    createdAt: input.createdAt,
  };
  switch (input.outcome) {
    case "accepted":
      return undefined;
    case "accepted-with-notes":
      return {
        ...base,
        kind: "notes",
        recommendedNextActions: ["Review warning gates before treating this as fully accepted."],
      };
    case "rework-required":
      return {
        ...base,
        kind: "rework",
        recommendedNextActions: input.findings.length
          ? input.findings.map((finding) => finding.suggestedAction ?? finding.title)
          : ["Fix failing workflow assertions and rerun browser.workflow.start."],
      };
    case "blocked":
      return {
        ...base,
        kind: "blocked",
        recommendedNextActions: [
          "Inspect preview and workflow logs for the blocking failure.",
          "Restart the preview target if needed.",
          "Rerun the workflow after the browser session can open.",
        ],
      };
    case "inconclusive":
      return {
        ...base,
        kind: "inconclusive",
        recommendedNextActions: [
          "Rerun the workflow to recapture missing evidence.",
          "Verify required screenshot artifacts resolve.",
        ],
      };
    case "needs-human-review":
      return {
        ...base,
        kind: "needs-human-review",
        recommendedNextActions: isCodeChangeLikePurpose(input.purpose)
          ? [
              "Review the evidence manually.",
              "Provide task-specific acceptance criteria.",
              "Provide captured final code state before code-change acceptance.",
            ]
          : ["Review the evidence manually before accepting this result."],
      };
  }
}

function formatSummary(input: {
  readonly decision: Omit<ReviewerDecision, "userVisibleSummaryRef">;
  readonly workflow: BrowserWorkflowRun;
  readonly evidenceBundle: EvidenceBundle;
}) {
  return JSON.stringify(
    {
      decisionId: input.decision.id,
      outcome: input.decision.outcome,
      confidence: input.decision.confidence,
      purpose: input.decision.purpose,
      checked: {
        routes: input.workflow.routes,
        viewports: input.workflow.viewports,
        previewTargetId: input.workflow.previewTargetId,
        workflowRunId: input.workflow.id,
      },
      gates: input.decision.gates,
      findings: input.decision.findings,
      criterionResults: input.decision.criterionResults,
      evidence: {
        screenshotArtifactRefs: input.workflow.screenshotArtifactRefs ?? [],
        observationRefs: input.workflow.observationRefs ?? [],
        workflowRunRef: input.workflow.id,
        evidenceBundleId: input.evidenceBundle.id,
      },
      ...(input.decision.actionPacket ? { actionPacket: input.decision.actionPacket } : {}),
      createdAt: input.decision.createdAt,
    },
    null,
    2,
  );
}

export const ReviewerDecisionServiceLive = Layer.effect(
  ReviewerDecisionService,
  Effect.gen(function* () {
    const repository = yield* BrowserOrchestrationEvidenceRepository;
    const workflows = yield* BrowserWorkflowManager;
    const annotationRepository = yield* BrowserAnnotationRepository;
    const orchestrationEngine = yield* Effect.serviceOption(OrchestrationEngineService);
    const sqlOption = yield* Effect.serviceOption(SqlClient.SqlClient);
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
      workflowRunId: BrowserWorkflowRun["id"] | null,
      type: "EvidenceBundleCreated" | "ReviewerDecisionCreated" | "ReviewerReworkTaskDrafted",
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
        const artifactRefs: EvidenceArtifactId[] = [];
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
          if (kind) {
            artifactRefs.push(ref);
          }
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
          artifactRefs: uniqueRefs(artifactRefs),
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

    const classifyWorkflowEvidenceRefs = (
      workflow: BrowserWorkflowRun,
      diffArtifactRef: EvidenceArtifactId | undefined,
    ) =>
      Effect.gen(function* () {
        const evidenceRefs = uniqueRefs([
          ...(workflow.evidenceRefs ?? []),
          ...(diffArtifactRef ? [diffArtifactRef] : []),
        ]);
        const screenshotArtifactRefs = uniqueRefs(workflow.screenshotArtifactRefs ?? []);
        const observationRefs = uniqueRefs(workflow.observationRefs ?? []);
        const classifiedEvidence = yield* classifyRefs(evidenceRefs);
        const classifiedScreenshots = yield* classifyRefs(screenshotArtifactRefs);
        const classifiedObservations = yield* classifyRefs(observationRefs);
        const artifactRefs = uniqueRefs([
          ...classifiedEvidence.artifactRefs,
          ...classifiedScreenshots.artifactRefs,
          ...classifiedObservations.artifactRefs,
        ]);
        const artifactRefSet = new Set(artifactRefs.map(String));
        const observationRefSet = new Set(observationRefs.map(String));
        const unknownWorkflowRefs = evidenceRefs.filter((ref) => !artifactRefSet.has(String(ref)));
        const unknownBrowserRefs = uniqueRefs(
          screenshotArtifactRefs.filter(
            (ref) => !artifactRefSet.has(String(ref)) && !observationRefSet.has(String(ref)),
          ),
        );
        const sessionEvents = yield* repository.getSessionEvents({ sessionId: workflow.sessionId });
        const eventRefs = sessionEvents
          .filter((event) => event.workflowRunId === workflow.id)
          .map((event) => event.eventId);

        return {
          artifactRefs,
          eventRefs,
          observationRefs,
          screenshotArtifactRefs,
          unknownWorkflowRefs,
          unknownBrowserRefs,
          assertionResultRefs: uniqueRefs([
            ...classifiedEvidence.assertionResultRefs,
            ...classifiedScreenshots.assertionResultRefs,
            ...classifiedObservations.assertionResultRefs,
          ]),
          statusEventRefs: uniqueRefs([
            ...classifiedEvidence.statusEventRefs,
            ...classifiedScreenshots.statusEventRefs,
            ...classifiedObservations.statusEventRefs,
          ]),
          consoleSummaryRefs: uniqueRefs([
            ...classifiedEvidence.consoleSummaryRefs,
            ...classifiedScreenshots.consoleSummaryRefs,
            ...classifiedObservations.consoleSummaryRefs,
          ]),
          networkSummaryRefs: uniqueRefs([
            ...classifiedEvidence.networkSummaryRefs,
            ...classifiedScreenshots.networkSummaryRefs,
            ...classifiedObservations.networkSummaryRefs,
          ]),
          pageErrorRefs: uniqueRefs([
            ...classifiedEvidence.pageErrorRefs,
            ...classifiedScreenshots.pageErrorRefs,
            ...classifiedObservations.pageErrorRefs,
          ]),
          healthEvidenceRefs: uniqueRefs([
            ...classifiedEvidence.healthEvidenceRefs,
            ...classifiedScreenshots.healthEvidenceRefs,
            ...classifiedObservations.healthEvidenceRefs,
          ]),
          serverLogRefs: uniqueRefs([
            ...classifiedEvidence.serverLogRefs,
            ...classifiedScreenshots.serverLogRefs,
            ...classifiedObservations.serverLogRefs,
          ]),
          readinessEvidenceRef:
            classifiedEvidence.readinessEvidenceRef ??
            classifiedScreenshots.readinessEvidenceRef ??
            classifiedObservations.readinessEvidenceRef,
        };
      });

    const loadAnnotationSection = (
      workflow: BrowserWorkflowRun,
      annotationIds: ReadonlyArray<string> | undefined,
    ) =>
      Effect.gen(function* () {
        const allThreadRows = yield* annotationRepository.listByThread({
          threadId: ThreadId.makeUnsafe(workflow.sessionId),
          includeResolved: true,
        });
        const autoRows = allThreadRows.filter((row) => {
          if (row.status === "resolved") return false;
          try {
            const annotation = JSON.parse(row.annotationJson) as {
              browserSessionId?: string;
              sessionId?: string;
              previewTargetId?: string;
              workflowRunId?: string;
            };
            return (
              annotation.workflowRunId === workflow.id ||
              annotation.previewTargetId === workflow.previewTargetId ||
              (workflow.browserSessionId !== undefined &&
                (annotation.browserSessionId === workflow.browserSessionId ||
                  annotation.sessionId === workflow.browserSessionId)) ||
              (!workflow.browserSessionId && annotation.sessionId === workflow.sessionId)
            );
          } catch {
            return false;
          }
        });
        const evidenceRows = allThreadRows.filter((row) => {
          try {
            const annotation = JSON.parse(row.annotationJson) as {
              browserSessionId?: string;
              sessionId?: string;
              previewTargetId?: string;
              workflowRunId?: string;
            };
            return (
              annotation.workflowRunId === workflow.id ||
              annotation.previewTargetId === workflow.previewTargetId ||
              (workflow.browserSessionId !== undefined &&
                (annotation.browserSessionId === workflow.browserSessionId ||
                  annotation.sessionId === workflow.browserSessionId))
            );
          } catch {
            return false;
          }
        });
        const mergedIds = uniqueStrings([
          ...(annotationIds ?? []),
          ...autoRows.map((row) => String(row.annotationId)),
          ...evidenceRows.map((row) => String(row.annotationId)),
        ]);
        if (!mergedIds.length) return undefined;
        const annotationRefs: string[] = [];
        const artifactRefs: EvidenceArtifactId[] = [];
        const unresolvedAnnotationRefs: string[] = [];
        for (const rawId of mergedIds) {
          const annotationId = BrowserAnnotationId.makeUnsafe(rawId);
          const row = yield* annotationRepository.getById({ annotationId });
          if (Option.isNone(row)) {
            unresolvedAnnotationRefs.push(rawId);
            continue;
          }
          annotationRefs.push(rawId);
          const annotation = JSON.parse(row.value.annotationJson) as {
            artifactRefs?: string[];
            cropArtifactRef?: string;
            screenshotArtifactRef?: string;
          };
          for (const ref of [
            ...(annotation.artifactRefs ?? []),
            annotation.cropArtifactRef,
            annotation.screenshotArtifactRef,
          ]) {
            if (ref) artifactRefs.push(EvidenceArtifactId.makeUnsafe(ref));
          }
          if (row.value.status !== "resolved") {
            unresolvedAnnotationRefs.push(rawId);
          }
        }
        return {
          annotationRefs,
          artifactRefs: uniqueRefs(artifactRefs),
          unresolvedAnnotationRefs,
        };
      });

    const createEvidenceBundle: ReviewerDecisionServiceShape["createEvidenceBundle"] = (input) =>
      Effect.gen(function* () {
        const workflow = yield* getWorkflowOrFail(input.workflowRunId);
        const createdAt = now();
        const bundleId = EvidenceBundleId.makeUnsafe(`evidence-bundle-${randomUUID()}`);
        const diffArtifactRef = input.codeState?.diffArtifactRef;
        const classified = yield* classifyWorkflowEvidenceRefs(workflow, diffArtifactRef);
        const annotations = yield* loadAnnotationSection(workflow, input.annotationIds);
        const codeState = input.codeState ?? defaultCodeState(createdAt);
        const browserSection = workflow.browserSessionId
          ? {
              browser: {
                observationRefs: classified.observationRefs,
                screenshotArtifactRefs: classified.screenshotArtifactRefs,
                consoleSummaryRefs: classified.consoleSummaryRefs,
                networkSummaryRefs: classified.networkSummaryRefs,
                pageErrorRefs: classified.pageErrorRefs,
                ...(classified.unknownBrowserRefs.length
                  ? { unknownRefs: classified.unknownBrowserRefs }
                  : {}),
              },
            }
          : {};
        const bundle: EvidenceBundle = {
          id: bundleId,
          sessionId: workflow.sessionId,
          workflowRunId: workflow.id,
          previewTargetId: workflow.previewTargetId,
          taskSpecId: workflow.taskSpecId,
          acceptanceCriteriaId: workflow.acceptanceCriteriaId,
          permissionPolicyId: workflow.permissionPolicyId,
          ...(workflow.browserSessionId ? { browserSessionId: workflow.browserSessionId } : {}),
          codeState,
          artifactRefs: uniqueRefs([
            ...classified.artifactRefs,
            ...(annotations?.artifactRefs ?? []),
          ]),
          eventRefs: classified.eventRefs,
          preview: {
            serverLogRefs: classified.serverLogRefs,
            healthEvidenceRefs: classified.healthEvidenceRefs,
            ...(classified.readinessEvidenceRef
              ? { readinessEvidenceRef: classified.readinessEvidenceRef }
              : {}),
          },
          ...browserSection,
          workflow: {
            workflowRunRef: workflow.id,
            assertionResultRefs: classified.assertionResultRefs,
            statusEventRefs: classified.statusEventRefs,
            ...(classified.unknownWorkflowRefs.length
              ? { unknownRefs: classified.unknownWorkflowRefs }
              : {}),
          },
          ...(annotations ? { annotations } : {}),
          createdAt,
        };
        const validatedBundle = decodeEvidenceBundle(bundle);
        yield* repository.createEvidenceBundle({
          bundleId: validatedBundle.id,
          sessionId: validatedBundle.sessionId,
          workflowRunId: validatedBundle.workflowRunId,
          previewTargetId: validatedBundle.previewTargetId,
          taskSpecId: validatedBundle.taskSpecId,
          acceptanceCriteriaId: validatedBundle.acceptanceCriteriaId,
          permissionPolicyId: validatedBundle.permissionPolicyId,
          browserSessionId: validatedBundle.browserSessionId ?? null,
          codeStateJson: JSON.stringify(validatedBundle.codeState),
          artifactRefsJson: JSON.stringify(validatedBundle.artifactRefs),
          eventRefsJson: JSON.stringify(validatedBundle.eventRefs),
          bundleSnapshotJson: JSON.stringify(validatedBundle),
          createdAt: validatedBundle.createdAt,
        });
        yield* appendEvent(
          workflow.sessionId,
          workflow.id,
          "EvidenceBundleCreated",
          validatedBundle.artifactRefs,
          {
            evidenceBundleId: validatedBundle.id,
            workflowRunId: workflow.id,
          },
        );
        evidenceBundles.set(String(validatedBundle.id), validatedBundle);
        return { evidenceBundle: validatedBundle };
      }).pipe(Effect.mapError(errorFromUnknown));

    const getEvidenceBundle: ReviewerDecisionServiceShape["getEvidenceBundle"] = (input) =>
      Effect.gen(function* () {
        const cached = evidenceBundles.get(String(input.evidenceBundleId));
        if (cached) return { evidenceBundle: cached };
        const row = yield* repository.getEvidenceBundle({ bundleId: input.evidenceBundleId });
        if (Option.isNone(row)) return { evidenceBundle: undefined };
        const evidenceBundle = evidenceBundleFromRow(row.value);
        evidenceBundles.set(String(evidenceBundle.id), evidenceBundle);
        return {
          evidenceBundle,
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
        const assertionScreenshotRefs = (workflow.assertionResults ?? [])
          .filter((result) => result.assertion.type === "screenshot-captured")
          .flatMap((result) => result.evidenceRefs);
        const refs = uniqueRefs([
          ...(workflow.screenshotArtifactRefs ?? []),
          ...assertionScreenshotRefs,
        ]);
        if (!refs.length) return false;
        for (const ref of refs) {
          const artifact = yield* repository.getEvidenceArtifact({ artifactId: ref });
          if (Option.isNone(artifact)) return false;
        }
        return true;
      });

    const loadAnnotationReworkTargetsByIds = (annotationIds: ReadonlyArray<string>) =>
      Effect.gen(function* () {
        if (!annotationIds.length) return [] as BrowserAnnotationReworkTarget[];
        const targets: BrowserAnnotationReworkTarget[] = [];
        for (const rawId of annotationIds) {
          const row = yield* annotationRepository.getById({
            annotationId: BrowserAnnotationId.makeUnsafe(rawId),
          });
          if (Option.isNone(row)) {
            targets.push({
              annotationId: rawId,
              comment: "Missing browser annotation record.",
              artifactRefs: [],
            });
            continue;
          }
          const annotation = JSON.parse(row.value.annotationJson) as {
            id?: string;
            browserSessionId?: string;
            previewTargetId?: string;
            workflowRunId?: string;
            url?: string;
            target?: BrowserAnnotationReworkTarget["target"];
            comment?: string;
            cropArtifactRef?: string;
            domSnippetArtifactRef?: string;
            styleSummaryArtifactRef?: string;
            beforeScreenshotArtifactRef?: string;
            beforeDomArtifactRef?: string;
            afterScreenshotArtifactRef?: string;
            afterDomArtifactRef?: string;
            artifactRefs?: string[];
          };
          const artifactRefs = [
            ...(annotation.artifactRefs ?? []),
            annotation.cropArtifactRef,
            annotation.domSnippetArtifactRef,
            annotation.styleSummaryArtifactRef,
            annotation.beforeScreenshotArtifactRef,
            annotation.beforeDomArtifactRef,
            annotation.afterScreenshotArtifactRef,
            annotation.afterDomArtifactRef,
          ].filter((ref): ref is string => typeof ref === "string" && ref.length > 0);
          targets.push({
            annotationId: rawId,
            ...(annotation.browserSessionId
              ? { browserSessionId: BrowserSessionId.makeUnsafe(annotation.browserSessionId) }
              : {}),
            ...(annotation.previewTargetId
              ? { previewTargetId: PreviewTargetId.makeUnsafe(annotation.previewTargetId) }
              : {}),
            ...(annotation.workflowRunId
              ? { workflowRunId: WorkflowRunId.makeUnsafe(annotation.workflowRunId) }
              : {}),
            ...(annotation.url ? { url: annotation.url } : {}),
            ...(annotation.url ? { route: routeForAnnotation(annotation.url) } : {}),
            ...(annotation.target ? { target: annotation.target } : {}),
            comment: annotation.comment ?? "Unresolved browser comment.",
            ...(annotation.cropArtifactRef
              ? { cropArtifactRef: EvidenceArtifactId.makeUnsafe(annotation.cropArtifactRef) }
              : {}),
            ...(annotation.domSnippetArtifactRef
              ? {
                  domSnippetArtifactRef: EvidenceArtifactId.makeUnsafe(
                    annotation.domSnippetArtifactRef,
                  ),
                }
              : {}),
            ...(annotation.styleSummaryArtifactRef
              ? {
                  styleSummaryArtifactRef: EvidenceArtifactId.makeUnsafe(
                    annotation.styleSummaryArtifactRef,
                  ),
                }
              : {}),
            ...(annotation.beforeScreenshotArtifactRef
              ? {
                  beforeScreenshotArtifactRef: EvidenceArtifactId.makeUnsafe(
                    annotation.beforeScreenshotArtifactRef,
                  ),
                }
              : {}),
            ...(annotation.beforeDomArtifactRef
              ? {
                  beforeDomArtifactRef: EvidenceArtifactId.makeUnsafe(
                    annotation.beforeDomArtifactRef,
                  ),
                }
              : {}),
            ...(annotation.afterScreenshotArtifactRef
              ? {
                  afterScreenshotArtifactRef: EvidenceArtifactId.makeUnsafe(
                    annotation.afterScreenshotArtifactRef,
                  ),
                }
              : {}),
            ...(annotation.afterDomArtifactRef
              ? {
                  afterDomArtifactRef: EvidenceArtifactId.makeUnsafe(
                    annotation.afterDomArtifactRef,
                  ),
                }
              : {}),
            artifactRefs: uniqueRefs(artifactRefs.map((ref) => EvidenceArtifactId.makeUnsafe(ref))),
          });
        }
        return targets;
      });

    const loadAnnotationReworkTargets = (bundle: EvidenceBundle) =>
      loadAnnotationReworkTargetsByIds(bundle.annotations?.unresolvedAnnotationRefs ?? []);

    const createDecision: ReviewerDecisionServiceShape["createDecision"] = (input) =>
      Effect.gen(function* () {
        const bundle = yield* loadEvidenceBundleOrFail(input.evidenceBundleId);
        const workflow = yield* getWorkflowOrFail(input.workflowRunId ?? bundle.workflowRunId);
        const purpose = derivePurpose(workflow, input.purpose);
        const hasTaskSpecificCriteria = (input.criteria ?? []).some(isTaskSpecificCriterion);
        const codeStateUnknown = (bundle.codeState.captureStatus ?? "captured") === "unknown";
        const screenshotArtifactsResolve = yield* screenshotsResolve(workflow);
        const gates = buildHardGates({
          workflow,
          evidenceBundle: bundle,
          purpose,
          screenshotArtifactsResolve,
          requiredRoutes: input.requiredRoutes ?? workflow.routes,
          requiredViewports: input.requiredViewports ?? workflow.viewports,
          hasTaskSpecificCriteria,
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
        const criteriaWithPolicy =
          isCodeChangeLikePurpose(purpose) && !hasTaskSpecificCriteria
            ? [
                ...suppliedCriteria,
                {
                  criterionId: AcceptanceCriterionId.makeUnsafe(
                    "criterion-user-acceptance-criteria",
                  ),
                  status: "not-evaluated" as const,
                  evidenceRefs: bundle.artifactRefs,
                  reason: "No task-specific acceptance criteria were supplied.",
                },
              ]
            : suppliedCriteria;
        const suppliedCriterionIds = new Set(
          criteriaWithPolicy.map((criterion) => criterion.criterionId),
        );
        const missingRequiredCriteria = (input.requiredCriterionIds ?? []).filter(
          (criterionId) => !suppliedCriterionIds.has(criterionId),
        );
        const criteria = [
          ...criteriaWithPolicy,
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
        const outcome = chooseOutcome({
          workflow,
          gates,
          criteria,
          purpose,
          hasTaskSpecificCriteria,
          codeStateUnknown,
        });
        const decisionId = ReviewerDecisionId.makeUnsafe(`reviewer-decision-${randomUUID()}`);
        const annotationTargets = yield* loadAnnotationReworkTargets(bundle);
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
                relevantCommentRefs: uniqueRefs(
                  annotationTargets.flatMap((target) => target.artifactRefs),
                ),
                relevantDiffRefs: bundle.codeState.diffArtifactRef
                  ? [bundle.codeState.diffArtifactRef]
                  : [],
                ...(annotationTargets.length ? { annotationTargets } : {}),
                recommendedNextActions:
                  annotationTargets.length || findings.length
                    ? [
                        ...annotationTargets.map(
                          (target) =>
                            `Address browser comment ${target.annotationId}: ${target.comment}`,
                        ),
                        ...findings.map((finding) => finding.suggestedAction ?? finding.title),
                      ]
                    : ["Fix failing workflow assertions and rerun browser.workflow.start."],
                maxReworkAttemptsRemaining:
                  input.maxReworkAttemptsRemaining ?? workflow.retryBudget,
              }
            : undefined;
        const createdAt = now();
        let actionPacket = makeActionPacket({
          decisionId,
          outcome,
          purpose,
          workflow,
          gates,
          criteria,
          findings,
          evidenceBundle: bundle,
          focusedRoutes: input.requiredRoutes?.length ? input.requiredRoutes : workflow.routes,
          focusedViewports: input.requiredViewports?.length
            ? input.requiredViewports
            : workflow.viewports,
          createdAt,
        });
        if (actionPacket?.kind === "rework" && reworkPacket) {
          actionPacket = {
            ...actionPacket,
            blockingFindings: reworkPacket.blockingFindings,
            relevantEvidenceRefs: reworkPacket.relevantEvidenceRefs,
            focusedRoutes: reworkPacket.focusedRoutes,
            focusedViewports: reworkPacket.focusedViewports,
            ...(reworkPacket.annotationTargets
              ? { annotationTargets: reworkPacket.annotationTargets }
              : {}),
            recommendedNextActions: reworkPacket.recommendedNextActions,
          };
        }
        const decisionBase = {
          id: decisionId,
          sessionId: bundle.sessionId,
          workflowRunId: workflow.id,
          evidenceBundleId: bundle.id,
          purpose,
          outcome,
          confidence:
            outcome === "accepted" ? "high" : outcome === "inconclusive" ? "low" : "medium",
          gates,
          criteria,
          criterionResults: criteria,
          findings,
          unresolvedCriteria,
          ...(reworkPacket ? { reworkPacket } : {}),
          ...(actionPacket ? { actionPacket } : {}),
          createdAt,
        } satisfies Omit<ReviewerDecision, "userVisibleSummaryRef">;
        const summary = formatSummary({
          decision: decisionBase,
          workflow,
          evidenceBundle: bundle,
        });
        const summaryRef = yield* writeArtifact(
          bundle.sessionId,
          "reviewer-user-visible-summary",
          summary,
          "application/json",
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
          purpose: decision.purpose,
          outcome: decision.outcome,
          confidence: decision.confidence,
          gatesJson: JSON.stringify(gates),
          criteriaJson: JSON.stringify(criteria),
          findingsJson: JSON.stringify(findings),
          unresolvedCriteriaJson: JSON.stringify(unresolvedCriteria),
          reworkPacketJson: decision.reworkPacket ? JSON.stringify(decision.reworkPacket) : null,
          actionPacketJson: decision.actionPacket ? JSON.stringify(decision.actionPacket) : null,
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
      Effect.gen(function* () {
        if (!input.sessionId && !input.workflowRunId) {
          return yield* Effect.fail(
            new Error("reviewer.decision.list requires sessionId or workflowRunId."),
          );
        }
        const rows = yield* repository.listReviewerDecisions(input);
        const listed = rows.map(reviewerDecisionFromRow);
        for (const decision of listed) {
          decisions.set(String(decision.id), decision);
        }
        return { decisions: listed };
      }).pipe(Effect.mapError(errorFromUnknown));

    const startRework: ReviewerDecisionServiceShape["startRework"] = (input) =>
      Effect.gen(function* () {
        let parentDecisionId: ReviewerDecisionId | undefined;
        let parentWorkflowRunId: WorkflowRunId | undefined;
        let threadId: ThreadId | undefined;
        let annotationTargets: BrowserAnnotationReworkTarget[] = [];
        if (input.decisionId) {
          const decisionResult = yield* getDecision({ decisionId: input.decisionId });
          const decision = decisionResult.decision;
          if (!decision) {
            return yield* Effect.fail(
              new Error(`Reviewer decision not found: ${input.decisionId}`),
            );
          }
          parentDecisionId = decision.id;
          parentWorkflowRunId = decision.workflowRunId;
          threadId = ThreadId.makeUnsafe(decision.sessionId);
          annotationTargets = [
            ...(decision.reworkPacket?.annotationTargets ??
              decision.actionPacket?.annotationTargets ??
              []),
          ];
        }
        if (input.annotationIds?.length) {
          annotationTargets = [
            ...annotationTargets,
            ...(yield* loadAnnotationReworkTargetsByIds(input.annotationIds)),
          ];
        }
        const uniqueTargets = [
          ...new Map(annotationTargets.map((target) => [target.annotationId, target])).values(),
        ];
        if (!uniqueTargets.length) {
          return yield* Effect.fail(
            new Error("reviewer.decision.rework.start requires unresolved annotation targets."),
          );
        }
        threadId ??= ThreadId.makeUnsafe(
          uniqueTargets[0]?.browserSessionId ??
            uniqueTargets[0]?.workflowRunId ??
            "reviewer-rework",
        );
        const evidenceRefs = uniqueRefs(uniqueTargets.flatMap((target) => target.artifactRefs));
        const instruction =
          input.instruction ??
          [
            "Address the following browser comment(s):",
            ...uniqueTargets.map(
              (target) =>
                `- ${target.annotationId}${target.route ? ` on ${target.route}` : ""}: ${target.comment}`,
            ),
            "Use the attached crop, DOM snippet, style summary, route, target, and geometry evidence. Acceptance requires the comment to be resolved or the reviewer comments-addressed gate to pass.",
          ].join("\n");
        const reworkTaskId = `reviewer-rework-task-${randomUUID()}`;
        let spawnedTaskId: string | null = null;
        let spawnedWorkerId: string | null = null;
        if (input.mode === "start-agent-run") {
          if (Option.isNone(orchestrationEngine)) {
            return yield* Effect.fail(
              new Error("reviewer.decision.rework.start requires OrchestrationEngineService."),
            );
          }
          const readModel = yield* orchestrationEngine.value.getReadModel();
          const callingThread = readModel.threads.find((thread) => thread.id === threadId);
          if (!callingThread) {
            return yield* Effect.fail(
              new Error(`reviewer.decision.rework.start thread not found: ${threadId}`),
            );
          }
          const spawnBudget = {
            maxDepth: 1,
            maxChildren: 1,
            maxConcurrentWriters: 1,
            maxTotalWorkers: 1,
            allowedTools: [],
            writeScope: [],
          };
          const runId = OrchestratorRunId.makeUnsafe(randomUUID());
          spawnedTaskId = randomUUID();
          spawnedWorkerId = randomUUID();
          const workerThreadId = randomUUID();
          yield* orchestrationEngine.value.dispatch({
            type: "orchestrator.run.create",
            commandId: commandId(),
            runId,
            projectId: callingThread.projectId,
            userRequest: "Focused browser annotation rework",
            goals: uniqueTargets.map((target) => target.comment),
            spawnBudget,
            createdAt: now(),
          });
          yield* orchestrationEngine.value.dispatch({
            type: "orchestrator.task.create",
            commandId: commandId(),
            taskId: OrchestratorTaskId.makeUnsafe(spawnedTaskId),
            runId,
            title: "Focused browser annotation rework",
            objective: instruction,
            acceptanceCriteria: [
              "Resolve the referenced browser annotation comments.",
              "Submit evidence that the before/after UI state was reviewed.",
            ],
            maxIterations: 3,
            createdAt: now(),
          });
          yield* orchestrationEngine.value.dispatch({
            type: "thread.create",
            commandId: commandId(),
            threadId: ThreadId.makeUnsafe(workerThreadId),
            projectId: callingThread.projectId,
            title: "Browser annotation rework",
            modelSelection: callingThread.modelSelection,
            runtimeMode: "full-access",
            interactionMode: "default",
            threadType: "agent",
            parentThreadId: threadId,
            branch: null,
            worktreePath: null,
            createdAt: now(),
          });
          yield* orchestrationEngine.value.dispatch({
            type: "orchestrator.worker.spawn",
            commandId: commandId(),
            workerId: OrchestratorWorkerId.makeUnsafe(spawnedWorkerId),
            runId,
            taskId: OrchestratorTaskId.makeUnsafe(spawnedTaskId),
            threadId: ThreadId.makeUnsafe(workerThreadId),
            spawnBudget,
            workspace: { mode: "local", cwd: process.cwd(), terminalIds: [] },
            createdAt: now(),
          });
          yield* orchestrationEngine.value.dispatch({
            type: "thread.turn.start",
            commandId: commandId(),
            threadId: ThreadId.makeUnsafe(workerThreadId),
            message: {
              messageId: MessageId.makeUnsafe(randomUUID()),
              role: "user",
              text: workerKickoffMessage(instruction),
              attachments: [],
            },
            modelSelection: callingThread.modelSelection,
            runtimeMode: "full-access",
            interactionMode: "default",
            createdAt: now(),
          });
        }
        const startedAt = now();
        const result: ReviewerReworkStartResult = {
          reworkTaskId,
          threadId,
          ...(parentDecisionId ? { parentDecisionId } : {}),
          annotationTargets: uniqueTargets,
          evidenceRefs,
          status: input.mode === "start-agent-run" ? "started" : "drafted",
          instruction,
        };
        const beforeEvidenceRefs = uniqueRefs(
          uniqueTargets.flatMap((target) =>
            [target.beforeScreenshotArtifactRef, target.beforeDomArtifactRef].filter(
              (ref): ref is EvidenceArtifactId => ref !== undefined,
            ),
          ),
        );
        if (Option.isSome(sqlOption)) {
          const sql = sqlOption.value;
          yield* sql`
            INSERT INTO rework_tasks (
              rework_task_id, parent_decision_id, workflow_run_id, thread_id,
              orchestrator_task_id, worker_id, status, annotation_targets_json,
              evidence_refs_json, before_evidence_refs_json, after_evidence_refs_json,
              instruction, created_at, updated_at
            )
            VALUES (
              ${reworkTaskId}, ${parentDecisionId ?? null},
              ${input.workflowRunId ?? parentWorkflowRunId ?? null}, ${threadId},
              ${spawnedTaskId}, ${spawnedWorkerId},
              ${result.status === "started" ? "assigned" : "drafted"},
              ${JSON.stringify(uniqueTargets)}, ${JSON.stringify(evidenceRefs)},
              ${JSON.stringify(beforeEvidenceRefs)}, ${JSON.stringify([])},
              ${instruction}, ${startedAt}, ${startedAt}
            )
            ON CONFLICT (rework_task_id) DO UPDATE SET
              status = excluded.status,
              updated_at = excluded.updated_at
          `;
        }
        yield* appendEvent(
          threadId,
          input.workflowRunId ?? parentWorkflowRunId ?? null,
          "ReviewerReworkTaskDrafted",
          evidenceRefs,
          {
            ...result,
            mode: input.mode ?? "draft-task",
          },
        );
        return result;
      }).pipe(Effect.mapError(errorFromUnknown));

    return {
      createEvidenceBundle,
      getEvidenceBundle,
      createDecision,
      getDecision,
      listDecisions,
      startRework,
    } satisfies ReviewerDecisionServiceShape;
  }),
);
