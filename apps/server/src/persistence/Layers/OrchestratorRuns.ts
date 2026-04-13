import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import { Effect, Layer, Schema } from "effect";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  GetRunByIdInput,
  GetTasksByRunIdInput,
  GetWorkersByRunIdInput,
  GetEvidenceByTaskIdInput,
  GetDecisionsByRunIdInput,
  OrchestratorRunRow,
  OrchestratorTaskRow,
  OrchestratorWorkerRow,
  OrchestratorEvidenceRow,
  OrchestratorDecisionRow,
  OrchestratorRunsRepository,
  type OrchestratorRunsRepositoryShape,
} from "../Services/OrchestratorRuns.ts";

const makeOrchestratorRunsRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // ----- Runs -----

  const upsertRunRow = SqlSchema.void({
    Request: OrchestratorRunRow,
    execute: (row) =>
      sql`
        INSERT INTO orchestrator_runs (
          run_id, project_id, user_request, status, root_task_id,
          goals_json, constraints_json, spawn_budget_json,
          created_at, updated_at, completed_at, completion_summary
        )
        VALUES (
          ${row.runId}, ${row.projectId}, ${row.userRequest}, ${row.status}, ${row.rootTaskId},
          ${row.goalsJson}, ${row.constraintsJson}, ${row.spawnBudgetJson},
          ${row.createdAt}, ${row.updatedAt}, ${row.completedAt}, ${row.completionSummary}
        )
        ON CONFLICT (run_id)
        DO UPDATE SET
          project_id = excluded.project_id,
          user_request = excluded.user_request,
          status = excluded.status,
          root_task_id = excluded.root_task_id,
          goals_json = excluded.goals_json,
          constraints_json = excluded.constraints_json,
          spawn_budget_json = excluded.spawn_budget_json,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          completed_at = excluded.completed_at,
          completion_summary = excluded.completion_summary
      `,
  });

  const getRunRowById = SqlSchema.findOneOption({
    Request: GetRunByIdInput,
    Result: OrchestratorRunRow,
    execute: ({ runId }) =>
      sql`
        SELECT
          run_id AS "runId",
          project_id AS "projectId",
          user_request AS "userRequest",
          status,
          root_task_id AS "rootTaskId",
          goals_json AS "goalsJson",
          constraints_json AS "constraintsJson",
          spawn_budget_json AS "spawnBudgetJson",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          completed_at AS "completedAt",
          completion_summary AS "completionSummary"
        FROM orchestrator_runs
        WHERE run_id = ${runId}
      `,
  });

  const getActiveRunRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: OrchestratorRunRow,
    execute: () =>
      sql`
        SELECT
          run_id AS "runId",
          project_id AS "projectId",
          user_request AS "userRequest",
          status,
          root_task_id AS "rootTaskId",
          goals_json AS "goalsJson",
          constraints_json AS "constraintsJson",
          spawn_budget_json AS "spawnBudgetJson",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          completed_at AS "completedAt",
          completion_summary AS "completionSummary"
        FROM orchestrator_runs
        WHERE status = 'active'
        ORDER BY created_at ASC
      `,
  });

  // ----- Tasks -----

  const upsertTaskRow = SqlSchema.void({
    Request: OrchestratorTaskRow,
    execute: (row) =>
      sql`
        INSERT INTO orchestrator_tasks (
          task_id, run_id, parent_task_id, title, objective,
          status, owner_kind, owner_id, stop_condition,
          read_scope_json, write_scope_json, allowed_tools_json,
          evidence_required_json, escalation_rules,
          acceptance_criteria_json, checklist_json,
          depends_on_json, blocked_by, model_policy_json,
          assigned_worker_id, iteration, max_iterations,
          created_at, updated_at, submitted_at, accepted_at
        )
        VALUES (
          ${row.taskId}, ${row.runId}, ${row.parentTaskId}, ${row.title}, ${row.objective},
          ${row.status}, ${row.ownerKind}, ${row.ownerId}, ${row.stopCondition},
          ${row.readScopeJson}, ${row.writeScopeJson}, ${row.allowedToolsJson},
          ${row.evidenceRequiredJson}, ${row.escalationRules},
          ${row.acceptanceCriteriaJson}, ${row.checklistJson},
          ${row.dependsOnJson}, ${row.blockedBy}, ${row.modelPolicyJson},
          ${row.assignedWorkerId}, ${row.iteration}, ${row.maxIterations},
          ${row.createdAt}, ${row.updatedAt}, ${row.submittedAt}, ${row.acceptedAt}
        )
        ON CONFLICT (task_id)
        DO UPDATE SET
          run_id = excluded.run_id,
          parent_task_id = excluded.parent_task_id,
          title = excluded.title,
          objective = excluded.objective,
          status = excluded.status,
          owner_kind = excluded.owner_kind,
          owner_id = excluded.owner_id,
          stop_condition = excluded.stop_condition,
          read_scope_json = excluded.read_scope_json,
          write_scope_json = excluded.write_scope_json,
          allowed_tools_json = excluded.allowed_tools_json,
          evidence_required_json = excluded.evidence_required_json,
          escalation_rules = excluded.escalation_rules,
          acceptance_criteria_json = excluded.acceptance_criteria_json,
          checklist_json = excluded.checklist_json,
          depends_on_json = excluded.depends_on_json,
          blocked_by = excluded.blocked_by,
          model_policy_json = excluded.model_policy_json,
          assigned_worker_id = excluded.assigned_worker_id,
          iteration = excluded.iteration,
          max_iterations = excluded.max_iterations,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          submitted_at = excluded.submitted_at,
          accepted_at = excluded.accepted_at
      `,
  });

  const getTaskRows = SqlSchema.findAll({
    Request: GetTasksByRunIdInput,
    Result: OrchestratorTaskRow,
    execute: ({ runId }) =>
      sql`
        SELECT
          task_id AS "taskId",
          run_id AS "runId",
          parent_task_id AS "parentTaskId",
          title,
          objective,
          status,
          owner_kind AS "ownerKind",
          owner_id AS "ownerId",
          stop_condition AS "stopCondition",
          read_scope_json AS "readScopeJson",
          write_scope_json AS "writeScopeJson",
          allowed_tools_json AS "allowedToolsJson",
          evidence_required_json AS "evidenceRequiredJson",
          escalation_rules AS "escalationRules",
          acceptance_criteria_json AS "acceptanceCriteriaJson",
          checklist_json AS "checklistJson",
          depends_on_json AS "dependsOnJson",
          blocked_by AS "blockedBy",
          model_policy_json AS "modelPolicyJson",
          assigned_worker_id AS "assignedWorkerId",
          iteration,
          max_iterations AS "maxIterations",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          submitted_at AS "submittedAt",
          accepted_at AS "acceptedAt"
        FROM orchestrator_tasks
        WHERE run_id = ${runId}
        ORDER BY created_at ASC
      `,
  });

  // ----- Workers -----

  const upsertWorkerRow = SqlSchema.void({
    Request: OrchestratorWorkerRow,
    execute: (row) =>
      sql`
        INSERT INTO orchestrator_workers (
          worker_id, run_id, thread_id, status, visibility,
          active_task_id, parent_worker_id,
          spawn_budget_json, workspace_json, model_binding_json,
          created_at, updated_at, terminated_at, termination_reason
        )
        VALUES (
          ${row.workerId}, ${row.runId}, ${row.threadId}, ${row.status}, ${row.visibility},
          ${row.activeTaskId}, ${row.parentWorkerId},
          ${row.spawnBudgetJson}, ${row.workspaceJson}, ${row.modelBindingJson},
          ${row.createdAt}, ${row.updatedAt}, ${row.terminatedAt}, ${row.terminationReason}
        )
        ON CONFLICT (worker_id)
        DO UPDATE SET
          run_id = excluded.run_id,
          thread_id = excluded.thread_id,
          status = excluded.status,
          visibility = excluded.visibility,
          active_task_id = excluded.active_task_id,
          parent_worker_id = excluded.parent_worker_id,
          spawn_budget_json = excluded.spawn_budget_json,
          workspace_json = excluded.workspace_json,
          model_binding_json = excluded.model_binding_json,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          terminated_at = excluded.terminated_at,
          termination_reason = excluded.termination_reason
      `,
  });

  const getWorkerRows = SqlSchema.findAll({
    Request: GetWorkersByRunIdInput,
    Result: OrchestratorWorkerRow,
    execute: ({ runId }) =>
      sql`
        SELECT
          worker_id AS "workerId",
          run_id AS "runId",
          thread_id AS "threadId",
          status,
          visibility,
          active_task_id AS "activeTaskId",
          parent_worker_id AS "parentWorkerId",
          spawn_budget_json AS "spawnBudgetJson",
          workspace_json AS "workspaceJson",
          model_binding_json AS "modelBindingJson",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          terminated_at AS "terminatedAt",
          termination_reason AS "terminationReason"
        FROM orchestrator_workers
        WHERE run_id = ${runId}
        ORDER BY created_at ASC
      `,
  });

  // ----- Evidence -----

  const insertEvidenceRow = SqlSchema.void({
    Request: OrchestratorEvidenceRow,
    execute: (row) =>
      sql`
        INSERT INTO orchestrator_evidence (
          evidence_id, task_id, worker_id, type,
          captured_at, content, content_truncated, metadata_json
        )
        VALUES (
          ${row.evidenceId}, ${row.taskId}, ${row.workerId}, ${row.type},
          ${row.capturedAt}, ${row.content}, ${row.contentTruncated}, ${row.metadataJson}
        )
        ON CONFLICT (evidence_id) DO NOTHING
      `,
  });

  const getEvidenceRows = SqlSchema.findAll({
    Request: GetEvidenceByTaskIdInput,
    Result: OrchestratorEvidenceRow,
    execute: ({ taskId }) =>
      sql`
        SELECT
          evidence_id AS "evidenceId",
          task_id AS "taskId",
          worker_id AS "workerId",
          type,
          captured_at AS "capturedAt",
          content,
          content_truncated AS "contentTruncated",
          metadata_json AS "metadataJson"
        FROM orchestrator_evidence
        WHERE task_id = ${taskId}
        ORDER BY captured_at ASC
      `,
  });

  // ----- Decisions -----

  const insertDecisionRow = SqlSchema.void({
    Request: OrchestratorDecisionRow,
    execute: (row) =>
      sql`
        INSERT INTO orchestrator_decisions (
          decision_id, run_id, task_id, type,
          reason, inputs, created_at
        )
        VALUES (
          ${row.decisionId}, ${row.runId}, ${row.taskId}, ${row.type},
          ${row.reason}, ${row.inputs}, ${row.createdAt}
        )
        ON CONFLICT (decision_id) DO NOTHING
      `,
  });

  const getDecisionRows = SqlSchema.findAll({
    Request: GetDecisionsByRunIdInput,
    Result: OrchestratorDecisionRow,
    execute: ({ runId }) =>
      sql`
        SELECT
          decision_id AS "decisionId",
          run_id AS "runId",
          task_id AS "taskId",
          type,
          reason,
          inputs,
          created_at AS "createdAt"
        FROM orchestrator_decisions
        WHERE run_id = ${runId}
        ORDER BY created_at ASC
      `,
  });

  // ----- Implement interface -----

  const upsertRun: OrchestratorRunsRepositoryShape["upsertRun"] = (row) =>
    upsertRunRow(row).pipe(
      Effect.mapError(toPersistenceSqlError("OrchestratorRunsRepository.upsertRun:query")),
    );

  const upsertTask: OrchestratorRunsRepositoryShape["upsertTask"] = (row) =>
    upsertTaskRow(row).pipe(
      Effect.mapError(toPersistenceSqlError("OrchestratorRunsRepository.upsertTask:query")),
    );

  const upsertWorker: OrchestratorRunsRepositoryShape["upsertWorker"] = (row) =>
    upsertWorkerRow(row).pipe(
      Effect.mapError(toPersistenceSqlError("OrchestratorRunsRepository.upsertWorker:query")),
    );

  const insertEvidence: OrchestratorRunsRepositoryShape["insertEvidence"] = (row) =>
    insertEvidenceRow(row).pipe(
      Effect.mapError(toPersistenceSqlError("OrchestratorRunsRepository.insertEvidence:query")),
    );

  const insertDecision: OrchestratorRunsRepositoryShape["insertDecision"] = (row) =>
    insertDecisionRow(row).pipe(
      Effect.mapError(toPersistenceSqlError("OrchestratorRunsRepository.insertDecision:query")),
    );

  const getRunById: OrchestratorRunsRepositoryShape["getRunById"] = (input) =>
    getRunRowById(input).pipe(
      Effect.mapError(toPersistenceSqlError("OrchestratorRunsRepository.getRunById:query")),
    );

  const getTasksByRunId: OrchestratorRunsRepositoryShape["getTasksByRunId"] = (input) =>
    getTaskRows(input).pipe(
      Effect.mapError(toPersistenceSqlError("OrchestratorRunsRepository.getTasksByRunId:query")),
    );

  const getWorkersByRunId: OrchestratorRunsRepositoryShape["getWorkersByRunId"] = (input) =>
    getWorkerRows(input).pipe(
      Effect.mapError(toPersistenceSqlError("OrchestratorRunsRepository.getWorkersByRunId:query")),
    );

  const getEvidenceByTaskId: OrchestratorRunsRepositoryShape["getEvidenceByTaskId"] = (input) =>
    getEvidenceRows(input).pipe(
      Effect.mapError(
        toPersistenceSqlError("OrchestratorRunsRepository.getEvidenceByTaskId:query"),
      ),
    );

  const getDecisionsByRunId: OrchestratorRunsRepositoryShape["getDecisionsByRunId"] = (input) =>
    getDecisionRows(input).pipe(
      Effect.mapError(
        toPersistenceSqlError("OrchestratorRunsRepository.getDecisionsByRunId:query"),
      ),
    );

  const getActiveRuns: OrchestratorRunsRepositoryShape["getActiveRuns"] = () =>
    getActiveRunRows(undefined).pipe(
      Effect.mapError(toPersistenceSqlError("OrchestratorRunsRepository.getActiveRuns:query")),
    );

  return {
    upsertRun,
    upsertTask,
    upsertWorker,
    insertEvidence,
    insertDecision,
    getRunById,
    getTasksByRunId,
    getWorkersByRunId,
    getEvidenceByTaskId,
    getDecisionsByRunId,
    getActiveRuns,
  } satisfies OrchestratorRunsRepositoryShape;
});

export const OrchestratorRunsRepositoryLive = Layer.effect(
  OrchestratorRunsRepository,
  makeOrchestratorRunsRepository,
);
