/**
 * OrchestratorRunsRepository - Projection repository interface for orchestrator runs,
 * tasks, workers, evidence, and decisions.
 *
 * Owns persistence operations for orchestrator domain records in the
 * orchestration read model.
 *
 * @module OrchestratorRunsRepository
 */
import {
  IsoDateTime,
  OrchestratorDecisionId,
  OrchestratorDecisionType,
  OrchestratorEvidenceId,
  OrchestratorEvidenceType,
  OrchestratorRunId,
  OrchestratorRunStatus,
  OrchestratorTaskId,
  OrchestratorTaskStatus,
  OrchestratorWorkerId,
  OrchestratorWorkerStatus,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
import { Option, Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

// ---------------------------------------------------------------------------
// Row schemas
// ---------------------------------------------------------------------------

export const OrchestratorRunRow = Schema.Struct({
  runId: OrchestratorRunId,
  projectId: ProjectId,
  userRequest: Schema.String,
  status: OrchestratorRunStatus,
  rootTaskId: Schema.String,
  goalsJson: Schema.String,
  constraintsJson: Schema.NullOr(Schema.String),
  spawnBudgetJson: Schema.String,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  completedAt: Schema.NullOr(IsoDateTime),
  completionSummary: Schema.NullOr(Schema.String),
});
export type OrchestratorRunRow = typeof OrchestratorRunRow.Type;

export const OrchestratorTaskRow = Schema.Struct({
  taskId: OrchestratorTaskId,
  runId: OrchestratorRunId,
  parentTaskId: Schema.NullOr(Schema.String),
  title: Schema.String,
  objective: Schema.String,
  status: OrchestratorTaskStatus,
  ownerKind: Schema.String,
  ownerId: Schema.NullOr(Schema.String),
  stopCondition: Schema.NullOr(Schema.String),
  readScopeJson: Schema.NullOr(Schema.String),
  writeScopeJson: Schema.NullOr(Schema.String),
  allowedToolsJson: Schema.NullOr(Schema.String),
  evidenceRequiredJson: Schema.NullOr(Schema.String),
  escalationRules: Schema.NullOr(Schema.String),
  acceptanceCriteriaJson: Schema.String,
  checklistJson: Schema.String,
  dependsOnJson: Schema.NullOr(Schema.String),
  blockedBy: Schema.NullOr(Schema.String),
  modelPolicyJson: Schema.NullOr(Schema.String),
  assignedWorkerId: Schema.NullOr(Schema.String),
  iteration: Schema.Number,
  maxIterations: Schema.Number,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  submittedAt: Schema.NullOr(IsoDateTime),
  acceptedAt: Schema.NullOr(IsoDateTime),
});
export type OrchestratorTaskRow = typeof OrchestratorTaskRow.Type;

export const OrchestratorWorkerRow = Schema.Struct({
  workerId: OrchestratorWorkerId,
  runId: OrchestratorRunId,
  threadId: ThreadId,
  status: OrchestratorWorkerStatus,
  activeTaskId: Schema.NullOr(Schema.String),
  parentWorkerId: Schema.NullOr(Schema.String),
  spawnBudgetJson: Schema.String,
  workspaceJson: Schema.String,
  modelBindingJson: Schema.NullOr(Schema.String),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  terminatedAt: Schema.NullOr(IsoDateTime),
  terminationReason: Schema.NullOr(Schema.String),
});
export type OrchestratorWorkerRow = typeof OrchestratorWorkerRow.Type;

export const OrchestratorEvidenceRow = Schema.Struct({
  evidenceId: OrchestratorEvidenceId,
  taskId: OrchestratorTaskId,
  workerId: Schema.NullOr(Schema.String),
  type: OrchestratorEvidenceType,
  capturedAt: IsoDateTime,
  content: Schema.String,
  contentTruncated: Schema.Number,
  metadataJson: Schema.NullOr(Schema.String),
});
export type OrchestratorEvidenceRow = typeof OrchestratorEvidenceRow.Type;

export const OrchestratorDecisionRow = Schema.Struct({
  decisionId: OrchestratorDecisionId,
  runId: OrchestratorRunId,
  taskId: Schema.NullOr(Schema.String),
  type: OrchestratorDecisionType,
  reason: Schema.String,
  inputs: Schema.NullOr(Schema.String),
  createdAt: IsoDateTime,
});
export type OrchestratorDecisionRow = typeof OrchestratorDecisionRow.Type;

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

export const GetRunByIdInput = Schema.Struct({
  runId: OrchestratorRunId,
});
export type GetRunByIdInput = typeof GetRunByIdInput.Type;

export const GetTasksByRunIdInput = Schema.Struct({
  runId: OrchestratorRunId,
});
export type GetTasksByRunIdInput = typeof GetTasksByRunIdInput.Type;

export const GetWorkersByRunIdInput = Schema.Struct({
  runId: OrchestratorRunId,
});
export type GetWorkersByRunIdInput = typeof GetWorkersByRunIdInput.Type;

export const GetEvidenceByTaskIdInput = Schema.Struct({
  taskId: OrchestratorTaskId,
});
export type GetEvidenceByTaskIdInput = typeof GetEvidenceByTaskIdInput.Type;

export const GetDecisionsByRunIdInput = Schema.Struct({
  runId: OrchestratorRunId,
});
export type GetDecisionsByRunIdInput = typeof GetDecisionsByRunIdInput.Type;

// ---------------------------------------------------------------------------
// Service shape
// ---------------------------------------------------------------------------

export interface OrchestratorRunsRepositoryShape {
  readonly upsertRun: (row: OrchestratorRunRow) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly upsertTask: (row: OrchestratorTaskRow) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly upsertWorker: (
    row: OrchestratorWorkerRow,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly insertEvidence: (
    row: OrchestratorEvidenceRow,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly insertDecision: (
    row: OrchestratorDecisionRow,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly getRunById: (
    input: GetRunByIdInput,
  ) => Effect.Effect<Option.Option<OrchestratorRunRow>, ProjectionRepositoryError>;
  readonly getTasksByRunId: (
    input: GetTasksByRunIdInput,
  ) => Effect.Effect<ReadonlyArray<OrchestratorTaskRow>, ProjectionRepositoryError>;
  readonly getWorkersByRunId: (
    input: GetWorkersByRunIdInput,
  ) => Effect.Effect<ReadonlyArray<OrchestratorWorkerRow>, ProjectionRepositoryError>;
  readonly getEvidenceByTaskId: (
    input: GetEvidenceByTaskIdInput,
  ) => Effect.Effect<ReadonlyArray<OrchestratorEvidenceRow>, ProjectionRepositoryError>;
  readonly getDecisionsByRunId: (
    input: GetDecisionsByRunIdInput,
  ) => Effect.Effect<ReadonlyArray<OrchestratorDecisionRow>, ProjectionRepositoryError>;
  readonly getActiveRuns: () => Effect.Effect<
    ReadonlyArray<OrchestratorRunRow>,
    ProjectionRepositoryError
  >;
}

/**
 * OrchestratorRunsRepository - Service tag for orchestrator projection persistence.
 */
export class OrchestratorRunsRepository extends ServiceMap.Service<
  OrchestratorRunsRepository,
  OrchestratorRunsRepositoryShape
>()("t3/persistence/Services/OrchestratorRuns/OrchestratorRunsRepository") {}
