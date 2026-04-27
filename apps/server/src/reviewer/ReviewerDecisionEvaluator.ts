import { randomUUID } from "node:crypto";

import {
  type AcceptanceCriterionId,
  type AcceptanceCriterionResult,
  type CodeStateRef,
  EvidenceArtifactId,
  type EvidenceBundle,
  type PreviewViewport,
  type ReviewerDecision,
  ReviewerDecisionId,
  type ReviewerFinding,
  ReworkPacketId,
  type WorkflowRunId,
} from "@orchestrate/contracts";
import { Effect } from "effect";

import type { BrowserOrchestrationEvidenceRepositoryShape } from "../persistence/Services/BrowserOrchestrationEvidence.ts";

export type ReviewerHardGateName =
  | "evidence-bundle-present"
  | "dev-server-healthy"
  | "target-route-opened"
  | "required-route-checked"
  | "required-viewport-checked"
  | "no-blocking-runtime-errors"
  | "comments-resolved"
  | "criteria-evaluated"
  | "evidence-fresh"
  | "human-control-settled";

export type ReviewerHardGateResult = {
  readonly name: ReviewerHardGateName;
  readonly status: "pass" | "fail" | "warn" | "not-applicable";
  readonly evidenceRefs: ReadonlyArray<EvidenceArtifactId>;
  readonly message: string;
};

export type ReviewerDecisionInput = {
  readonly sessionId: string;
  readonly workflowRunId: WorkflowRunId;
  readonly evidenceBundle: EvidenceBundle;
  readonly finalCodeState: CodeStateRef;
  readonly finalCodeMutationCompletedAt?: string | undefined;
  readonly criteria: ReadonlyArray<AcceptanceCriterionResult>;
  readonly requiredCriterionIds: ReadonlyArray<AcceptanceCriterionId>;
  readonly checkedRoutes: ReadonlyArray<string>;
  readonly requiredRoutes: ReadonlyArray<string>;
  readonly checkedViewports: ReadonlyArray<PreviewViewport>;
  readonly requiredViewports: ReadonlyArray<PreviewViewport>;
  readonly devServerHealthy: boolean;
  readonly targetRouteOpened: boolean;
  readonly blockingRuntimeErrors: ReadonlyArray<ReviewerFinding>;
  readonly unresolvedCommentRefs: ReadonlyArray<EvidenceArtifactId>;
  readonly humanTakeoverOccurredAfterLatestSnapshot: boolean;
  readonly userVisibleSummaryRef: EvidenceArtifactId;
  readonly maxReworkAttemptsRemaining: number;
};

export type ReviewerDecisionEvaluation = {
  readonly decision: ReviewerDecision;
  readonly gates: ReadonlyArray<ReviewerHardGateResult>;
  readonly userVisibleReport: string;
};

export class ReviewerDecisionEvaluator {
  constructor(private readonly evidenceRepository?: BrowserOrchestrationEvidenceRepositoryShape) {}

  async evaluate(input: ReviewerDecisionInput): Promise<ReviewerDecisionEvaluation> {
    const gates = evaluateHardGates(input);
    const findings = buildFindings(input, gates);
    const unresolvedCriteria = input.criteria
      .filter((criterion) => criterion.status === "fail" || criterion.status === "not-evaluated")
      .map((criterion) => criterion.criterionId);
    const canAccept =
      gates.every((gate) => gate.status === "pass" || gate.status === "not-applicable") &&
      unresolvedCriteria.length === 0 &&
      input.criteria.every(
        (criterion) =>
          criterion.status === "pass" ||
          criterion.status === "not-applicable" ||
          criterion.status === "waived-by-user",
      );
    const outcome = canAccept
      ? findings.some((finding) => finding.severity === "note" || finding.severity === "minor")
        ? "accepted-with-notes"
        : "accepted"
      : "rework-required";
    const now = new Date().toISOString();
    const decisionId = ReviewerDecisionId.makeUnsafe(`reviewer-decision-${randomUUID()}`);
    const reworkPacket =
      outcome === "rework-required"
        ? {
            id: ReworkPacketId.makeUnsafe(`rework-packet-${randomUUID()}`),
            decisionId,
            reason: findings[0]?.description ?? "Hard browser review gates failed.",
            blockingFindings: findings.filter((finding) => finding.severity !== "note"),
            focusedRoutes: input.requiredRoutes.length ? [...input.requiredRoutes] : ["/"],
            focusedViewports: input.requiredViewports.length
              ? [...input.requiredViewports]
              : [...input.checkedViewports],
            relevantEvidenceRefs: input.evidenceBundle.artifactRefs,
            relevantCommentRefs: [...input.unresolvedCommentRefs],
            relevantDiffRefs: [input.evidenceBundle.codeState.diffArtifactRef],
            recommendedNextActions: findings.map(
              (finding) => finding.suggestedAction ?? finding.title,
            ),
            maxReworkAttemptsRemaining: input.maxReworkAttemptsRemaining,
          }
        : undefined;
    const decision: ReviewerDecision = {
      id: decisionId,
      sessionId: input.sessionId,
      workflowRunId: input.workflowRunId,
      evidenceBundleId: input.evidenceBundle.id,
      outcome,
      confidence: canAccept ? "high" : "medium",
      criteria: [...input.criteria],
      findings,
      unresolvedCriteria,
      ...(reworkPacket ? { reworkPacket } : {}),
      userVisibleSummaryRef: input.userVisibleSummaryRef,
      createdAt: now,
    };

    if (this.evidenceRepository) {
      await Effect.runPromise(
        this.evidenceRepository.createReviewerDecision({
          decisionId: decision.id,
          sessionId: decision.sessionId,
          workflowRunId: decision.workflowRunId,
          evidenceBundleId: input.evidenceBundle.id,
          outcome: decision.outcome,
          confidence: decision.confidence,
          criteriaJson: JSON.stringify(decision.criteria),
          findingsJson: JSON.stringify(decision.findings),
          unresolvedCriteriaJson: JSON.stringify(decision.unresolvedCriteria),
          reworkPacketJson: decision.reworkPacket ? JSON.stringify(decision.reworkPacket) : null,
          userVisibleSummaryRef: decision.userVisibleSummaryRef,
          createdAt: decision.createdAt,
        }),
      );
    }

    return {
      decision,
      gates,
      userVisibleReport: formatUserVisibleReport(decision, gates),
    };
  }
}

function evaluateHardGates(input: ReviewerDecisionInput): ReviewerHardGateResult[] {
  const evidenceRefs = input.evidenceBundle.artifactRefs;
  const requiredCriterionIds = new Set(input.requiredCriterionIds);
  const evaluatedCriterionIds = new Set(input.criteria.map((criterion) => criterion.criterionId));
  const missingCriteria = [...requiredCriterionIds].filter((id) => !evaluatedCriterionIds.has(id));
  const failedCriteria = input.criteria.filter(
    (criterion) => criterion.status === "fail" || criterion.status === "not-evaluated",
  );

  return [
    {
      name: "evidence-bundle-present",
      status: "pass",
      evidenceRefs,
      message: "Evidence bundle is present.",
    },
    {
      name: "dev-server-healthy",
      status: input.devServerHealthy ? "pass" : "fail",
      evidenceRefs,
      message: input.devServerHealthy ? "Dev server is healthy." : "Dev server is unhealthy.",
    },
    {
      name: "target-route-opened",
      status: input.targetRouteOpened ? "pass" : "fail",
      evidenceRefs,
      message: input.targetRouteOpened ? "Target route opened." : "Target route was not opened.",
    },
    {
      name: "required-route-checked",
      status: includesAll(input.checkedRoutes, input.requiredRoutes) ? "pass" : "fail",
      evidenceRefs,
      message: includesAll(input.checkedRoutes, input.requiredRoutes)
        ? "Required routes were checked."
        : "One or more required routes were not checked.",
    },
    {
      name: "required-viewport-checked",
      status: includesAll(
        input.checkedViewports.map(viewportKey),
        input.requiredViewports.map(viewportKey),
      )
        ? "pass"
        : "fail",
      evidenceRefs,
      message: "Required viewport matrix checked.",
    },
    {
      name: "no-blocking-runtime-errors",
      status: input.blockingRuntimeErrors.length === 0 ? "pass" : "fail",
      evidenceRefs: input.blockingRuntimeErrors.flatMap((finding) => finding.evidenceRefs),
      message:
        input.blockingRuntimeErrors.length === 0
          ? "No blocking runtime errors."
          : `${input.blockingRuntimeErrors.length} blocking runtime error(s).`,
    },
    {
      name: "comments-resolved",
      status: input.unresolvedCommentRefs.length === 0 ? "pass" : "fail",
      evidenceRefs: input.unresolvedCommentRefs,
      message:
        input.unresolvedCommentRefs.length === 0
          ? "No unresolved browser comments."
          : `${input.unresolvedCommentRefs.length} unresolved browser comment(s).`,
    },
    {
      name: "criteria-evaluated",
      status: missingCriteria.length === 0 && failedCriteria.length === 0 ? "pass" : "fail",
      evidenceRefs,
      message:
        missingCriteria.length === 0 && failedCriteria.length === 0
          ? "Required criteria were evaluated."
          : "One or more required criteria failed or were not evaluated.",
    },
    {
      name: "evidence-fresh",
      status: isEvidenceFresh(input) ? "pass" : "fail",
      evidenceRefs,
      message: isEvidenceFresh(input)
        ? "Evidence code state matches final review state."
        : "Evidence is stale relative to the final code state.",
    },
    {
      name: "human-control-settled",
      status: input.humanTakeoverOccurredAfterLatestSnapshot ? "fail" : "pass",
      evidenceRefs,
      message: input.humanTakeoverOccurredAfterLatestSnapshot
        ? "Human takeover occurred after the latest browser snapshot."
        : "No unsettled human takeover after latest snapshot.",
    },
  ];
}

function buildFindings(
  input: ReviewerDecisionInput,
  gates: ReadonlyArray<ReviewerHardGateResult>,
): ReviewerFinding[] {
  const gateFindings = gates
    .filter((gate) => gate.status === "fail")
    .map(
      (gate): ReviewerFinding => ({
        severity: gate.name === "evidence-bundle-present" ? "blocker" : "major",
        title: gate.name,
        description: gate.message,
        evidenceRefs: gate.evidenceRefs.length
          ? gate.evidenceRefs
          : input.evidenceBundle.artifactRefs,
        suggestedAction: suggestedActionForGate(gate.name),
      }),
    );

  return [...gateFindings, ...input.blockingRuntimeErrors];
}

function suggestedActionForGate(gateName: ReviewerHardGateName): string {
  switch (gateName) {
    case "evidence-fresh":
      return "Rerun browser verification after the final code changes.";
    case "human-control-settled":
      return "Capture a fresh browser snapshot after human control is released.";
    case "criteria-evaluated":
      return "Evaluate every required acceptance criterion with evidence refs.";
    case "comments-resolved":
      return "Resolve required browser comments and rerun focused verification.";
    default:
      return "Fix the failing review gate and rerun browser verification.";
  }
}

function isEvidenceFresh(input: ReviewerDecisionInput): boolean {
  const evidenceCodeState = input.evidenceBundle.codeState;
  const sameCodeState =
    evidenceCodeState.headSha === input.finalCodeState.headSha &&
    evidenceCodeState.dirtyHash === input.finalCodeState.dirtyHash;
  const mutationCompletedAt = input.finalCodeMutationCompletedAt
    ? Date.parse(input.finalCodeMutationCompletedAt)
    : Number.NEGATIVE_INFINITY;
  const evidenceCapturedAt = Date.parse(input.evidenceBundle.createdAt);

  return sameCodeState && evidenceCapturedAt > mutationCompletedAt;
}

function includesAll<T>(actual: ReadonlyArray<T>, required: ReadonlyArray<T>): boolean {
  const actualSet = new Set(actual);
  return required.every((item) => actualSet.has(item));
}

function viewportKey(viewport: PreviewViewport): string {
  return `${viewport.width}x${viewport.height}@${viewport.deviceScaleFactor ?? 1}`;
}

function formatUserVisibleReport(
  decision: ReviewerDecision,
  gates: ReadonlyArray<ReviewerHardGateResult>,
): string {
  const failedGates = gates.filter((gate) => gate.status === "fail");
  const gateLines = gates.map((gate) => `- ${gate.name}: ${gate.status}`);
  return [
    `Review outcome: ${decision.outcome}`,
    `Criteria: ${decision.criteria.map((criterion) => `${criterion.criterionId}=${criterion.status}`).join(", ")}`,
    failedGates.length
      ? `Failed gates: ${failedGates.map((gate) => gate.name).join(", ")}`
      : "Failed gates: none",
    "Gates:",
    ...gateLines,
  ].join("\n");
}
