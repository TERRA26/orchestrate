import type {
  EvidenceBundleCreateInput,
  EvidenceBundleCreateResult,
  EvidenceBundleGetInput,
  EvidenceBundleGetResult,
  ReviewerDecisionCreateInput,
  ReviewerDecisionCreateResult,
  ReviewerDecisionGetInput,
  ReviewerDecisionGetResult,
  ReviewerDecisionListInput,
  ReviewerDecisionListResult,
  ReviewerReworkStartInput,
  ReviewerReworkStartResult,
} from "@orchestrate/contracts";
import { ServiceMap } from "effect";
import type { Effect } from "effect";

export interface ReviewerDecisionServiceShape {
  readonly createEvidenceBundle: (
    input: EvidenceBundleCreateInput,
  ) => Effect.Effect<EvidenceBundleCreateResult, Error>;
  readonly getEvidenceBundle: (
    input: EvidenceBundleGetInput,
  ) => Effect.Effect<EvidenceBundleGetResult, Error>;
  readonly createDecision: (
    input: ReviewerDecisionCreateInput,
  ) => Effect.Effect<ReviewerDecisionCreateResult, Error>;
  readonly getDecision: (
    input: ReviewerDecisionGetInput,
  ) => Effect.Effect<ReviewerDecisionGetResult, Error>;
  readonly listDecisions: (
    input: ReviewerDecisionListInput,
  ) => Effect.Effect<ReviewerDecisionListResult, Error>;
  readonly startRework: (
    input: ReviewerReworkStartInput,
  ) => Effect.Effect<ReviewerReworkStartResult, Error>;
}

export class ReviewerDecisionService extends ServiceMap.Service<
  ReviewerDecisionService,
  ReviewerDecisionServiceShape
>()("t3/reviewer/Services/ReviewerDecisionService") {}
