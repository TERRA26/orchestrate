/**
 * OrchestratorRuntimeService - Service interface for orchestrator run/task/worker lifecycle.
 *
 * Provides a high-level API over the raw command dispatch of
 * OrchestrationEngineService for creating runs, managing tasks, spawning and
 * monitoring workers, and recording evidence and decisions.
 *
 * @module OrchestratorRuntimeService
 */
import { ServiceMap } from "effect";
import type { Effect } from "effect";
import type {
  OrchestratorRun,
  OrchestratorTask,
  OrchestratorWorker,
  OrchestratorEvidenceRecord,
  OrchestratorDecision,
  OrchestratorRunId,
  OrchestratorTaskId,
  OrchestratorWorkerId,
  SpawnBudget,
  OrchestratorWorkspace,
  OrchestratorModelPolicy,
  OrchestratorWorkerModelBinding,
} from "@t3tools/contracts";

import type { OrchestrationDispatchError } from "../Errors.ts";

// --- Input types ---

export interface CreateRunInput {
  readonly userRequest: string;
  readonly goals: ReadonlyArray<string>;
  readonly constraints?: ReadonlyArray<string>;
  readonly spawnBudget: SpawnBudget;
  readonly projectId: string;
}

export interface CreateTaskInput {
  readonly runId: OrchestratorRunId;
  readonly parentTaskId?: OrchestratorTaskId;
  readonly title: string;
  readonly objective: string;
  readonly acceptanceCriteria: ReadonlyArray<string>;
  readonly stopCondition?: string;
  readonly readScope?: ReadonlyArray<string>;
  readonly writeScope?: ReadonlyArray<string>;
  readonly allowedTools?: ReadonlyArray<string>;
  readonly evidenceRequired?: ReadonlyArray<
    typeof import("@t3tools/contracts").OrchestratorEvidenceType.Type
  >;
  readonly dependsOn?: ReadonlyArray<OrchestratorTaskId>;
  readonly modelPolicy?: OrchestratorModelPolicy;
  readonly maxIterations?: number;
}

export interface SpawnWorkerInput {
  readonly runId: OrchestratorRunId;
  readonly taskId: OrchestratorTaskId;
  readonly spawnBudget: SpawnBudget;
  readonly workspace: OrchestratorWorkspace;
  readonly modelBinding?: OrchestratorWorkerModelBinding;
}

export interface CaptureEvidenceInput {
  readonly taskId: OrchestratorTaskId;
  readonly workerId?: OrchestratorWorkerId;
  readonly evidenceType: typeof import("@t3tools/contracts").OrchestratorEvidenceType.Type;
  readonly content: string;
  readonly contentTruncated: boolean;
  readonly metadata?: Record<string, string>;
}

export interface RecordDecisionInput {
  readonly runId: OrchestratorRunId;
  readonly taskId?: OrchestratorTaskId;
  readonly decisionType: typeof import("@t3tools/contracts").OrchestratorDecisionType.Type;
  readonly reason: string;
  readonly inputs?: string;
}

// --- Service shape ---

export interface OrchestratorRuntimeShape {
  // Run lifecycle
  readonly createRun: (
    input: CreateRunInput,
  ) => Effect.Effect<OrchestratorRun, OrchestrationDispatchError>;
  readonly cancelRun: (
    runId: OrchestratorRunId,
    reason: string,
  ) => Effect.Effect<void, OrchestrationDispatchError>;

  // Task lifecycle
  readonly createTask: (
    input: CreateTaskInput,
  ) => Effect.Effect<OrchestratorTask, OrchestrationDispatchError>;
  readonly assignTask: (
    taskId: OrchestratorTaskId,
    assigneeKind: "orchestrator" | "worker",
    assigneeId?: string,
  ) => Effect.Effect<void, OrchestrationDispatchError>;
  readonly submitTask: (
    taskId: OrchestratorTaskId,
    workerId: OrchestratorWorkerId,
    summary?: string,
  ) => Effect.Effect<void, OrchestrationDispatchError>;
  readonly acceptTask: (
    taskId: OrchestratorTaskId,
    summary?: string,
  ) => Effect.Effect<void, OrchestrationDispatchError>;
  readonly rejectTask: (
    taskId: OrchestratorTaskId,
    instruction: string,
  ) => Effect.Effect<void, OrchestrationDispatchError>;
  readonly blockTask: (
    taskId: OrchestratorTaskId,
    reason: string,
  ) => Effect.Effect<void, OrchestrationDispatchError>;

  // Worker lifecycle
  readonly spawnWorker: (
    input: SpawnWorkerInput,
  ) => Effect.Effect<OrchestratorWorker, OrchestrationDispatchError>;
  readonly terminateWorker: (
    workerId: OrchestratorWorkerId,
    reason: string,
  ) => Effect.Effect<void, OrchestrationDispatchError>;
  readonly detectStuckWorkers: (
    timeoutMs: number,
  ) => Effect.Effect<ReadonlyArray<OrchestratorWorkerId>>;

  // Evidence
  readonly captureEvidence: (
    input: CaptureEvidenceInput,
  ) => Effect.Effect<OrchestratorEvidenceRecord, OrchestrationDispatchError>;

  // Decisions
  readonly recordDecision: (
    input: RecordDecisionInput,
  ) => Effect.Effect<OrchestratorDecision, OrchestrationDispatchError>;

  // Queries
  readonly getRun: (runId: OrchestratorRunId) => Effect.Effect<OrchestratorRun | null>;
  readonly getActiveRuns: () => Effect.Effect<ReadonlyArray<OrchestratorRun>>;
  readonly getTaskTree: (
    runId: OrchestratorRunId,
  ) => Effect.Effect<ReadonlyArray<OrchestratorTask>>;
  readonly getWorkers: (
    runId: OrchestratorRunId,
  ) => Effect.Effect<ReadonlyArray<OrchestratorWorker>>;
}

// --- Service tag ---

/**
 * OrchestratorRuntimeService - Service tag for orchestrator runtime access.
 *
 * @example
 * ```ts
 * const program = Effect.gen(function* () {
 *   const runtime = yield* OrchestratorRuntimeService
 *   const run = yield* runtime.createRun({ ... })
 * })
 * ```
 */
export class OrchestratorRuntimeService extends ServiceMap.Service<
  OrchestratorRuntimeService,
  OrchestratorRuntimeShape
>()("t3/orchestration/Services/OrchestratorRuntime/OrchestratorRuntimeService") {}
