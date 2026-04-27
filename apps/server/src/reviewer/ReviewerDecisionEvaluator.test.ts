import {
  AcceptanceCriteriaId,
  AcceptanceCriterionId,
  BrowserSessionId,
  EvidenceArtifactId,
  EvidenceBundleId,
  PermissionPolicyId,
  PreviewTargetId,
  TaskSpecId,
  WorkflowRunId,
  type EvidenceBundle,
  type PreviewViewport,
} from "@orchestrate/contracts";
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";

import type {
  BrowserOrchestrationEvidenceRepositoryShape,
  ReviewerDecisionRow,
} from "../persistence/Services/BrowserOrchestrationEvidence.ts";
import { ReviewerDecisionEvaluator } from "./ReviewerDecisionEvaluator.ts";

const now = "2026-04-27T00:00:00.000Z";
const later = "2026-04-27T00:00:01.000Z";
const screenshotRef = EvidenceArtifactId.makeUnsafe("artifact-review-shot");
const summaryRef = EvidenceArtifactId.makeUnsafe("artifact-review-summary");
const criterionId = AcceptanceCriterionId.makeUnsafe("criterion-review");
const viewport: PreviewViewport = {
  id: "desktop",
  label: "Desktop",
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
};

function makeEvidenceBundle(overrides: Partial<EvidenceBundle> = {}): EvidenceBundle {
  return {
    id: EvidenceBundleId.makeUnsafe("bundle-review"),
    sessionId: "session-review",
    workflowRunId: WorkflowRunId.makeUnsafe("workflow-review"),
    previewTargetId: PreviewTargetId.makeUnsafe("target-review"),
    taskSpecId: TaskSpecId.makeUnsafe("task-review"),
    acceptanceCriteriaId: AcceptanceCriteriaId.makeUnsafe("criteria-review"),
    permissionPolicyId: PermissionPolicyId.makeUnsafe("policy-review"),
    browserSessionId: BrowserSessionId.makeUnsafe("browser-session-review"),
    codeState: {
      repoRoot: "/tmp/orchestrate",
      headSha: "head",
      dirtyHash: "dirty",
      changedFiles: ["apps/web/src/App.tsx"],
      diffArtifactRef: EvidenceArtifactId.makeUnsafe("artifact-diff"),
      capturedAt: now,
    },
    artifactRefs: [screenshotRef],
    eventRefs: [],
    createdAt: later,
    ...overrides,
  };
}

function makeRepository(): BrowserOrchestrationEvidenceRepositoryShape & {
  readonly decisions: ReviewerDecisionRow[];
} {
  const decisions: ReviewerDecisionRow[] = [];
  return {
    decisions,
    appendSessionEvent: () => Effect.void,
    getSessionEvents: () => Effect.succeed([]),
    writeEvidenceArtifact: () => Effect.void,
    getEvidenceArtifact: () => Effect.succeed(Option.none()),
    createEvidenceBundle: () => Effect.void,
    getEvidenceBundle: () => Effect.succeed(Option.none()),
    createReviewerDecision: (row) => {
      decisions.push(row);
      return Effect.void;
    },
    getReviewerDecision: () => Effect.succeed(Option.none()),
  };
}

function makeInput(overrides: Partial<Parameters<ReviewerDecisionEvaluator["evaluate"]>[0]> = {}) {
  const evidenceBundle = makeEvidenceBundle();
  return {
    sessionId: evidenceBundle.sessionId,
    workflowRunId: evidenceBundle.workflowRunId,
    evidenceBundle,
    finalCodeState: evidenceBundle.codeState,
    finalCodeMutationCompletedAt: now,
    criteria: [
      {
        criterionId,
        status: "pass",
        evidenceRefs: [screenshotRef],
        reason: "Browser evidence passed.",
      },
    ],
    requiredCriterionIds: [criterionId],
    checkedRoutes: ["/"],
    requiredRoutes: ["/"],
    checkedViewports: [viewport],
    requiredViewports: [viewport],
    devServerHealthy: true,
    targetRouteOpened: true,
    blockingRuntimeErrors: [],
    unresolvedCommentRefs: [],
    humanTakeoverOccurredAfterLatestSnapshot: false,
    userVisibleSummaryRef: summaryRef,
    maxReworkAttemptsRemaining: 1,
    ...overrides,
  } satisfies Parameters<ReviewerDecisionEvaluator["evaluate"]>[0];
}

describe("ReviewerDecisionEvaluator", () => {
  it("accepts only when every hard gate and criterion passes", async () => {
    const repository = makeRepository();
    const evaluator = new ReviewerDecisionEvaluator(repository);

    const result = await evaluator.evaluate(makeInput());

    expect(result.decision.outcome).toBe("accepted");
    expect(result.decision.unresolvedCriteria).toEqual([]);
    expect(result.gates.every((gate) => gate.status === "pass")).toBe(true);
    expect(result.userVisibleReport).toContain("Review outcome: accepted");
    expect(repository.decisions).toHaveLength(1);
  });

  it("requires rework when evidence is stale relative to final code state", async () => {
    const evidenceBundle = makeEvidenceBundle({
      codeState: {
        ...makeEvidenceBundle().codeState,
        dirtyHash: "old-dirty",
      },
    });
    const evaluator = new ReviewerDecisionEvaluator();

    const result = await evaluator.evaluate(
      makeInput({
        evidenceBundle,
        finalCodeState: {
          ...evidenceBundle.codeState,
          dirtyHash: "new-dirty",
        },
      }),
    );

    expect(result.decision.outcome).toBe("rework-required");
    expect(result.decision.reworkPacket?.recommendedNextActions).toContain(
      "Rerun browser verification after the final code changes.",
    );
    expect(result.gates.find((gate) => gate.name === "evidence-fresh")?.status).toBe("fail");
  });

  it("requires a fresh snapshot after human takeover", async () => {
    const evaluator = new ReviewerDecisionEvaluator();

    const result = await evaluator.evaluate(
      makeInput({
        humanTakeoverOccurredAfterLatestSnapshot: true,
      }),
    );

    expect(result.decision.outcome).toBe("rework-required");
    expect(result.gates.find((gate) => gate.name === "human-control-settled")?.status).toBe("fail");
    expect(result.decision.reworkPacket?.recommendedNextActions).toContain(
      "Capture a fresh browser snapshot after human control is released.",
    );
  });

  it("requires all required criteria to be evaluated", async () => {
    const evaluator = new ReviewerDecisionEvaluator();

    const result = await evaluator.evaluate(
      makeInput({
        criteria: [],
      }),
    );

    expect(result.decision.outcome).toBe("rework-required");
    expect(result.gates.find((gate) => gate.name === "criteria-evaluated")?.status).toBe("fail");
  });
});
