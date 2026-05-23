import {
  BrowserOrchestrationSchemaVersion,
  BrowserApprovalId,
  BrowserApprovalRisk,
  BrowserApprovalStatus,
  BrowserSessionId,
  EvidenceAccess,
  EvidenceArtifactId,
  EvidenceArtifactKind,
  EvidenceBundleId,
  EvidenceSensitivity,
  HumanControlLeaseId,
  IsoDateTime,
  PreviewTargetId,
  ReviewerDecisionId,
  ReviewerDecisionPurpose,
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
  browserSessionId: Schema.NullOr(BrowserSessionId),
  codeStateJson: Schema.String,
  artifactRefsJson: Schema.String,
  eventRefsJson: Schema.String,
  bundleSnapshotJson: Schema.NullOr(Schema.String),
  createdAt: IsoDateTime,
});
export type EvidenceBundleRow = typeof EvidenceBundleRow.Type;

export const ReviewerDecisionRow = Schema.Struct({
  decisionId: ReviewerDecisionId,
  sessionId: Schema.String,
  workflowRunId: WorkflowRunId,
  evidenceBundleId: EvidenceBundleId,
  purpose: ReviewerDecisionPurpose,
  outcome: ReviewerOutcome,
  confidence: Schema.Literals(["high", "medium", "low"]),
  gatesJson: Schema.String,
  criteriaJson: Schema.String,
  findingsJson: Schema.String,
  unresolvedCriteriaJson: Schema.String,
  reworkPacketJson: Schema.NullOr(Schema.String),
  actionPacketJson: Schema.NullOr(Schema.String),
  userVisibleSummaryRef: EvidenceArtifactId,
  createdAt: IsoDateTime,
});
export type ReviewerDecisionRow = typeof ReviewerDecisionRow.Type;

export const BrowserControlStateRow = Schema.Struct({
  browserSessionId: BrowserSessionId,
  sessionId: Schema.String,
  leaseId: Schema.NullOr(HumanControlLeaseId),
  holder: Schema.Literals(["human", "agent", "none"]),
  state: Schema.Literals(["human-control", "agent-control", "paused", "approval-required"]),
  reason: Schema.String,
  lastObservationRef: Schema.NullOr(EvidenceArtifactId),
  snapshotAfterReleaseRef: Schema.NullOr(EvidenceArtifactId),
  freshObservationRequired: Schema.Union([Schema.Boolean, Schema.Number]),
  desktopClientId: Schema.NullOr(Schema.String),
  updatedAt: IsoDateTime,
});
export type BrowserControlStateRow = typeof BrowserControlStateRow.Type;

export const BrowserApprovalRequestRow = Schema.Struct({
  approvalId: BrowserApprovalId,
  browserSessionId: BrowserSessionId,
  sessionId: Schema.String,
  desktopClientId: Schema.NullOr(Schema.String),
  actionJson: Schema.String,
  targetContextJson: Schema.NullOr(Schema.String),
  actionHash: Schema.String,
  reason: Schema.String,
  risk: BrowserApprovalRisk,
  preApprovalObservationRef: Schema.NullOr(EvidenceArtifactId),
  observedUrl: Schema.NullOr(Schema.String),
  origin: Schema.NullOr(Schema.String),
  status: BrowserApprovalStatus,
  evidenceRefsJson: Schema.String,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  expiresAt: Schema.NullOr(IsoDateTime),
  consumedAt: Schema.NullOr(IsoDateTime),
  executedActionRef: Schema.NullOr(EvidenceArtifactId),
  decisionReason: Schema.NullOr(Schema.String),
});
export type BrowserApprovalRequestRow = typeof BrowserApprovalRequestRow.Type;

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

export const ListReviewerDecisionsInput = Schema.Struct({
  sessionId: Schema.optional(Schema.String),
  workflowRunId: Schema.optional(WorkflowRunId),
});
export type ListReviewerDecisionsInput = typeof ListReviewerDecisionsInput.Type;

export const GetBrowserControlStateInput = Schema.Struct({
  browserSessionId: BrowserSessionId,
});
export type GetBrowserControlStateInput = typeof GetBrowserControlStateInput.Type;

export const GetBrowserApprovalRequestInput = Schema.Struct({
  approvalId: BrowserApprovalId,
});
export type GetBrowserApprovalRequestInput = typeof GetBrowserApprovalRequestInput.Type;

export const ListBrowserApprovalRequestsInput = Schema.Struct({
  browserSessionId: Schema.optional(BrowserSessionId),
  status: Schema.optional(BrowserApprovalStatus),
});
export type ListBrowserApprovalRequestsInput = typeof ListBrowserApprovalRequestsInput.Type;

export const UpdateBrowserApprovalStatusInput = Schema.Struct({
  approvalId: BrowserApprovalId,
  status: BrowserApprovalStatus,
  updatedAt: IsoDateTime,
  decisionReason: Schema.optional(Schema.String),
  consumedAt: Schema.optional(IsoDateTime),
  executedActionRef: Schema.optional(EvidenceArtifactId),
});
export type UpdateBrowserApprovalStatusInput = typeof UpdateBrowserApprovalStatusInput.Type;

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
  readonly listReviewerDecisions: (
    input: ListReviewerDecisionsInput,
  ) => Effect.Effect<ReadonlyArray<ReviewerDecisionRow>, ProjectionRepositoryError>;
  readonly upsertBrowserControlState: (
    row: BrowserControlStateRow,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly getBrowserControlState: (
    input: GetBrowserControlStateInput,
  ) => Effect.Effect<Option.Option<BrowserControlStateRow>, ProjectionRepositoryError>;
  readonly createBrowserApprovalRequest: (
    row: BrowserApprovalRequestRow,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly getBrowserApprovalRequest: (
    input: GetBrowserApprovalRequestInput,
  ) => Effect.Effect<Option.Option<BrowserApprovalRequestRow>, ProjectionRepositoryError>;
  readonly listBrowserApprovalRequests: (
    input: ListBrowserApprovalRequestsInput,
  ) => Effect.Effect<ReadonlyArray<BrowserApprovalRequestRow>, ProjectionRepositoryError>;
  readonly updateBrowserApprovalStatus: (
    input: UpdateBrowserApprovalStatusInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
}

export class BrowserOrchestrationEvidenceRepository extends ServiceMap.Service<
  BrowserOrchestrationEvidenceRepository,
  BrowserOrchestrationEvidenceRepositoryShape
>()("t3/persistence/Services/BrowserOrchestrationEvidence/Repository") {}
