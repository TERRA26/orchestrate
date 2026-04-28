import {
  BrowserOrchestrationSchemaVersion,
  BrowserSessionId,
  EvidenceAccess,
  EvidenceArtifactId,
  EvidenceArtifactKind,
  EvidenceBundleId,
  EvidenceSensitivity,
  IsoDateTime,
  PreviewTargetId,
  ReviewerDecisionId,
  ReviewerOutcome,
  SessionEventActor,
  SessionEventId,
  TaskSpecId,
  AcceptanceCriteriaId,
  PermissionPolicyId,
  WorkflowRunId,
} from "@orchestrate/contracts";
import { Option, Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const BrowserSessionEventRow = Schema.Struct({
  eventId: SessionEventId,
  sessionId: Schema.String,
  workflowRunId: Schema.NullOr(WorkflowRunId),
  type: Schema.String,
  actor: SessionEventActor,
  artifactRefsJson: Schema.String,
  payloadJson: Schema.String,
  occurredAt: IsoDateTime,
});
export type BrowserSessionEventRow = typeof BrowserSessionEventRow.Type;

export const EvidenceArtifactRow = Schema.Struct({
  artifactId: EvidenceArtifactId,
  schemaVersion: BrowserOrchestrationSchemaVersion,
  kind: EvidenceArtifactKind,
  sha256: Schema.String,
  byteSize: Schema.Number,
  contentType: Schema.String,
  storageUri: Schema.String,
  sensitivity: EvidenceSensitivity,
  access: EvidenceAccess,
  redactedArtifactId: Schema.NullOr(Schema.String),
  supersededByArtifactId: Schema.NullOr(Schema.String),
  metadataJson: Schema.NullOr(Schema.String),
  createdAt: IsoDateTime,
});
export type EvidenceArtifactRow = typeof EvidenceArtifactRow.Type;

export const EvidenceArtifactContentRow = Schema.Struct({
  artifactId: EvidenceArtifactId,
  contentText: Schema.String,
  createdAt: IsoDateTime,
});
export type EvidenceArtifactContentRow = typeof EvidenceArtifactContentRow.Type;

export const EvidenceBundleRow = Schema.Struct({
  bundleId: EvidenceBundleId,
  sessionId: Schema.String,
  workflowRunId: WorkflowRunId,
  previewTargetId: PreviewTargetId,
  taskSpecId: TaskSpecId,
  acceptanceCriteriaId: AcceptanceCriteriaId,
  permissionPolicyId: PermissionPolicyId,
  browserSessionId: BrowserSessionId,
  codeStateJson: Schema.String,
  artifactRefsJson: Schema.String,
  eventRefsJson: Schema.String,
  createdAt: IsoDateTime,
});
export type EvidenceBundleRow = typeof EvidenceBundleRow.Type;

export const ReviewerDecisionRow = Schema.Struct({
  decisionId: ReviewerDecisionId,
  sessionId: Schema.String,
  workflowRunId: WorkflowRunId,
  evidenceBundleId: EvidenceBundleId,
  outcome: ReviewerOutcome,
  confidence: Schema.Literals(["high", "medium", "low"]),
  criteriaJson: Schema.String,
  findingsJson: Schema.String,
  unresolvedCriteriaJson: Schema.String,
  reworkPacketJson: Schema.NullOr(Schema.String),
  userVisibleSummaryRef: EvidenceArtifactId,
  createdAt: IsoDateTime,
});
export type ReviewerDecisionRow = typeof ReviewerDecisionRow.Type;

export const GetSessionEventsInput = Schema.Struct({
  sessionId: Schema.String,
});
export type GetSessionEventsInput = typeof GetSessionEventsInput.Type;

export const GetEvidenceArtifactInput = Schema.Struct({
  artifactId: EvidenceArtifactId,
});
export type GetEvidenceArtifactInput = typeof GetEvidenceArtifactInput.Type;

export const GetEvidenceBundleInput = Schema.Struct({
  bundleId: EvidenceBundleId,
});
export type GetEvidenceBundleInput = typeof GetEvidenceBundleInput.Type;

export const GetReviewerDecisionInput = Schema.Struct({
  decisionId: ReviewerDecisionId,
});
export type GetReviewerDecisionInput = typeof GetReviewerDecisionInput.Type;

export interface BrowserOrchestrationEvidenceRepositoryShape {
  readonly appendSessionEvent: (
    row: BrowserSessionEventRow,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly getSessionEvents: (
    input: GetSessionEventsInput,
  ) => Effect.Effect<ReadonlyArray<BrowserSessionEventRow>, ProjectionRepositoryError>;
  readonly writeEvidenceArtifact: (
    row: EvidenceArtifactRow,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly getEvidenceArtifact: (
    input: GetEvidenceArtifactInput,
  ) => Effect.Effect<Option.Option<EvidenceArtifactRow>, ProjectionRepositoryError>;
  readonly writeEvidenceArtifactContent: (
    row: EvidenceArtifactContentRow,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly getEvidenceArtifactContent: (
    input: GetEvidenceArtifactInput,
  ) => Effect.Effect<Option.Option<EvidenceArtifactContentRow>, ProjectionRepositoryError>;
  readonly createEvidenceBundle: (
    row: EvidenceBundleRow,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly getEvidenceBundle: (
    input: GetEvidenceBundleInput,
  ) => Effect.Effect<Option.Option<EvidenceBundleRow>, ProjectionRepositoryError>;
  readonly createReviewerDecision: (
    row: ReviewerDecisionRow,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly getReviewerDecision: (
    input: GetReviewerDecisionInput,
  ) => Effect.Effect<Option.Option<ReviewerDecisionRow>, ProjectionRepositoryError>;
}

export class BrowserOrchestrationEvidenceRepository extends ServiceMap.Service<
  BrowserOrchestrationEvidenceRepository,
  BrowserOrchestrationEvidenceRepositoryShape
>()("t3/persistence/Services/BrowserOrchestrationEvidence/Repository") {}
