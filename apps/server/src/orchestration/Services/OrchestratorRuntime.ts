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
  OrchestratorFallbackPolicy,
  ThreadId,
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
  readonly threadId: ThreadId;
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

// --- Multi-model input types ---

export type FailureType =
  | "timeout"
  | "tool-failure"
  | "malformed-output"
  | "review-rejected"
  | "capability-mismatch"
  | "provider-unavailable";

export interface HandleWorkerFailureInput {
  readonly runId: OrchestratorRunId;
  readonly taskId: OrchestratorTaskId;
  readonly workerId: OrchestratorWorkerId;
  readonly failureType: FailureType;
  readonly failureMessage: string;
  readonly attemptCounts: ReadonlyMap<string, number>;
  readonly fallbackPolicy?: OrchestratorFallbackPolicy;
}

export type FallbackResult =
  | { action: "retry"; modelBinding: OrchestratorWorkerModelBinding }
  | { action: "escalate"; reason: string };

export interface SelectReviewModelInput {
  readonly runId: OrchestratorRunId;
  readonly taskId: OrchestratorTaskId;
  readonly implementationBinding: OrchestratorWorkerModelBinding;
  readonly reviewMode: OrchestratorModelPolicy["reviewMode"];
}

// --- Service shape ---

export interface OrchestratorRuntimeShape {
  // Run lifecycle
  readonly createRun: (
    input: CreateRunInput,
  ) => Effect.Effect<OrchestratorRun, OrchestrationDispatchError>;
  readonly completeRun: (
    runId: OrchestratorRunId,
    summary?: string,
  ) => Effect.Effect<void, OrchestrationDispatchError>;
  readonly failRun: (
    runId: OrchestratorRunId,
    reason: string,
  ) => Effect.Effect<void, OrchestrationDispatchError>;
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
  readonly getEvidence: (
    taskId: OrchestratorTaskId,
  ) => Effect.Effect<ReadonlyArray<OrchestratorEvidenceRecord>>;
  readonly getDecisions: (
    runId: OrchestratorRunId,
    taskId?: OrchestratorTaskId,
  ) => Effect.Effect<ReadonlyArray<OrchestratorDecision>>;

  // Multi-model selection
  readonly selectReviewModel: (
    input: SelectReviewModelInput,
  ) => Effect.Effect<OrchestratorWorkerModelBinding | null>;

  // Fallback/retry
  readonly handleWorkerFailure: (
    input: HandleWorkerFailureInput,
  ) => Effect.Effect<FallbackResult, OrchestrationDispatchError>;

  // Recovery
  readonly resumeActiveRuns: () => Effect.Effect<void>;
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
