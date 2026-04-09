/**
 * OrchestratorRuntimeLive - Layer implementation for OrchestratorRuntimeService.
 *
 * Dispatches orchestration commands through OrchestrationEngineService and reads
 * updated state from the in-memory read model. Handles run, task, and worker
 * lifecycle including workspace isolation, stuck detection, and termination.
 *
 * @module OrchestratorRuntimeLive
 */
import {
  CommandId,
  OrchestratorDecisionId,
  OrchestratorEvidenceId,
  OrchestratorRunId,
  OrchestratorTaskId,
  OrchestratorWorkerId,
  ProjectId,
} from "@t3tools/contracts";
import type {
  OrchestratorDecision,
  OrchestratorEvidenceRecord,
  OrchestratorRun,
  OrchestratorTask,
  OrchestratorWorker,
} from "@t3tools/contracts";
import { Effect, Layer } from "effect";

import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import {
  OrchestratorRuntimeService,
  type OrchestratorRuntimeShape,
} from "../Services/OrchestratorRuntime.ts";

const makeOrchestratorRuntime = Effect.gen(function* () {
  const engine = yield* OrchestrationEngineService;

  const now = () => new Date().toISOString();

  // -----------------------------------------------------------------------
  // Run lifecycle
  // -----------------------------------------------------------------------

  const createRun: OrchestratorRuntimeShape["createRun"] = (input) =>
    Effect.gen(function* () {
      const runId = OrchestratorRunId.makeUnsafe(crypto.randomUUID());
      const rootTaskId = OrchestratorTaskId.makeUnsafe(crypto.randomUUID());

      yield* engine.dispatch({
        type: "orchestrator.run.create",
        commandId: CommandId.makeUnsafe(crypto.randomUUID()),
        runId,
        projectId: ProjectId.makeUnsafe(input.projectId),
        userRequest: input.userRequest,
        goals: [...input.goals],
        constraints: input.constraints ? [...input.constraints] : undefined,
        spawnBudget: input.spawnBudget,
        createdAt: now(),
      });

      // Create root task for the run
      yield* engine.dispatch({
        type: "orchestrator.task.create",
        commandId: CommandId.makeUnsafe(crypto.randomUUID()),
        taskId: rootTaskId,
        runId,
        title: "Root task",
        objective: input.userRequest,
        acceptanceCriteria: [...input.goals],
        maxIterations: 3,
        createdAt: now(),
      });

      const readModel = yield* engine.getReadModel();
      const run = (readModel.orchestratorRuns ?? []).find((r) => r.runId === runId);
      return run!;
    });

  const cancelRun: OrchestratorRuntimeShape["cancelRun"] = (runId, reason) =>
    engine
      .dispatch({
        type: "orchestrator.run.cancel",
        commandId: CommandId.makeUnsafe(crypto.randomUUID()),
        runId,
        reason,
        createdAt: now(),
      })
      .pipe(Effect.asVoid);

  // -----------------------------------------------------------------------
  // Task lifecycle
  // -----------------------------------------------------------------------

  const createTask: OrchestratorRuntimeShape["createTask"] = (input) =>
    Effect.gen(function* () {
      const taskId = OrchestratorTaskId.makeUnsafe(crypto.randomUUID());

      yield* engine.dispatch({
        type: "orchestrator.task.create",
        commandId: CommandId.makeUnsafe(crypto.randomUUID()),
        taskId,
        runId: input.runId,
        parentTaskId: input.parentTaskId,
        title: input.title,
        objective: input.objective,
        acceptanceCriteria: [...input.acceptanceCriteria],
        stopCondition: input.stopCondition,
        readScope: input.readScope ? [...input.readScope] : undefined,
        writeScope: input.writeScope ? [...input.writeScope] : undefined,
        allowedTools: input.allowedTools ? [...input.allowedTools] : undefined,
        evidenceRequired: input.evidenceRequired ? [...input.evidenceRequired] : undefined,
        dependsOn: input.dependsOn ? [...input.dependsOn] : undefined,
        modelPolicy: input.modelPolicy,
        maxIterations: input.maxIterations,
        createdAt: now(),
      });

      const readModel = yield* engine.getReadModel();
      const task = (readModel.orchestratorTasks ?? []).find((t) => t.taskId === taskId);
      return task!;
    });

  const assignTask: OrchestratorRuntimeShape["assignTask"] = (taskId, assigneeKind, assigneeId) =>
    engine
      .dispatch({
        type: "orchestrator.task.assign",
        commandId: CommandId.makeUnsafe(crypto.randomUUID()),
        taskId,
        assigneeKind,
        assigneeId,
        createdAt: now(),
      })
      .pipe(Effect.asVoid);

  const submitTask: OrchestratorRuntimeShape["submitTask"] = (taskId, workerId, summary) =>
    engine
      .dispatch({
        type: "orchestrator.task.submit",
        commandId: CommandId.makeUnsafe(crypto.randomUUID()),
        taskId,
        workerId,
        summary,
        createdAt: now(),
      })
      .pipe(Effect.asVoid);

  const acceptTask: OrchestratorRuntimeShape["acceptTask"] = (taskId, summary) =>
    engine
      .dispatch({
        type: "orchestrator.task.accept",
        commandId: CommandId.makeUnsafe(crypto.randomUUID()),
        taskId,
        summary,
        createdAt: now(),
      })
      .pipe(Effect.asVoid);

  const rejectTask: OrchestratorRuntimeShape["rejectTask"] = (taskId, instruction) =>
    engine
      .dispatch({
        type: "orchestrator.task.reject",
        commandId: CommandId.makeUnsafe(crypto.randomUUID()),
        taskId,
        instruction,
        createdAt: now(),
      })
      .pipe(Effect.asVoid);

  const blockTask: OrchestratorRuntimeShape["blockTask"] = (taskId, reason) =>
    engine
      .dispatch({
        type: "orchestrator.task.block",
        commandId: CommandId.makeUnsafe(crypto.randomUUID()),
        taskId,
        reason,
        createdAt: now(),
      })
      .pipe(Effect.asVoid);

  // -----------------------------------------------------------------------
  // Worker lifecycle
  // -----------------------------------------------------------------------

  const spawnWorker: OrchestratorRuntimeShape["spawnWorker"] = (input) =>
    Effect.gen(function* () {
      const workerId = OrchestratorWorkerId.makeUnsafe(crypto.randomUUID());

      // Record the spawn decision before dispatching the command
      yield* engine.dispatch({
        type: "orchestrator.decision.record",
        commandId: CommandId.makeUnsafe(crypto.randomUUID()),
        decisionId: OrchestratorDecisionId.makeUnsafe(crypto.randomUUID()),
        runId: input.runId,
        taskId: input.taskId,
        decisionType: "spawned-worker",
        reason: `Spawning worker ${workerId} for task ${input.taskId}`,
        createdAt: now(),
      });

      // Spawn the worker
      yield* engine.dispatch({
        type: "orchestrator.worker.spawn",
        commandId: CommandId.makeUnsafe(crypto.randomUUID()),
        workerId,
        runId: input.runId,
        taskId: input.taskId,
        spawnBudget: input.spawnBudget,
        workspace: input.workspace,
        modelBinding: input.modelBinding,
        createdAt: now(),
      });

      const readModel = yield* engine.getReadModel();
      const worker = (readModel.orchestratorWorkers ?? []).find((w) => w.workerId === workerId);
      return worker!;
    });

  const terminateWorker: OrchestratorRuntimeShape["terminateWorker"] = (workerId, reason) =>
    Effect.gen(function* () {
      // If the worker has an active task, block it
      const readModel = yield* engine.getReadModel();
      const worker = (readModel.orchestratorWorkers ?? []).find((w) => w.workerId === workerId);
      if (worker?.activeTaskId) {
        yield* engine.dispatch({
          type: "orchestrator.task.block",
          commandId: CommandId.makeUnsafe(crypto.randomUUID()),
          taskId: worker.activeTaskId,
          reason: `Worker ${workerId} terminated: ${reason}`,
          createdAt: now(),
        });
      }

      yield* engine.dispatch({
        type: "orchestrator.worker.terminate",
        commandId: CommandId.makeUnsafe(crypto.randomUUID()),
        workerId,
        reason,
        createdAt: now(),
      });
    });

  const detectStuckWorkers: OrchestratorRuntimeShape["detectStuckWorkers"] = (timeoutMs) =>
    Effect.map(engine.getReadModel(), (readModel) => {
      const cutoff = new Date(Date.now() - timeoutMs).toISOString();
      return (readModel.orchestratorWorkers ?? [])
        .filter((w) => w.status === "running" && w.updatedAt < cutoff)
        .map((w) => w.workerId);
    });

  // -----------------------------------------------------------------------
  // Evidence
  // -----------------------------------------------------------------------

  const captureEvidence: OrchestratorRuntimeShape["captureEvidence"] = (input) =>
    Effect.gen(function* () {
      const evidenceId = OrchestratorEvidenceId.makeUnsafe(crypto.randomUUID());

      yield* engine.dispatch({
        type: "orchestrator.evidence.capture",
        commandId: CommandId.makeUnsafe(crypto.randomUUID()),
        evidenceId,
        taskId: input.taskId,
        workerId: input.workerId,
        evidenceType: input.evidenceType,
        content: input.content,
        contentTruncated: input.contentTruncated,
        metadata: input.metadata,
        createdAt: now(),
      });

      const record: OrchestratorEvidenceRecord = {
        evidenceId,
        taskId: input.taskId,
        workerId: input.workerId,
        type: input.evidenceType,
        capturedAt: now(),
        content: input.content,
        contentTruncated: input.contentTruncated,
        metadata: input.metadata,
      };
      return record;
    });

  // -----------------------------------------------------------------------
  // Decisions
  // -----------------------------------------------------------------------

  const recordDecision: OrchestratorRuntimeShape["recordDecision"] = (input) =>
    Effect.gen(function* () {
      const decisionId = OrchestratorDecisionId.makeUnsafe(crypto.randomUUID());
      const timestamp = now();

      yield* engine.dispatch({
        type: "orchestrator.decision.record",
        commandId: CommandId.makeUnsafe(crypto.randomUUID()),
        decisionId,
        runId: input.runId,
        taskId: input.taskId,
        decisionType: input.decisionType,
        reason: input.reason,
        inputs: input.inputs,
        createdAt: timestamp,
      });

      const decision: OrchestratorDecision = {
        decisionId,
        runId: input.runId,
        taskId: input.taskId,
        type: input.decisionType,
        reason: input.reason,
        inputs: input.inputs,
        createdAt: timestamp,
      };
      return decision;
    });

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  const getRun: OrchestratorRuntimeShape["getRun"] = (runId) =>
    Effect.map(
      engine.getReadModel(),
      (readModel) => (readModel.orchestratorRuns ?? []).find((r) => r.runId === runId) ?? null,
    );

  const getActiveRuns: OrchestratorRuntimeShape["getActiveRuns"] = () =>
    Effect.map(engine.getReadModel(), (readModel) =>
      (readModel.orchestratorRuns ?? []).filter((r) => r.status === "active"),
    );

  const getTaskTree: OrchestratorRuntimeShape["getTaskTree"] = (runId) =>
    Effect.map(engine.getReadModel(), (readModel) =>
      (readModel.orchestratorTasks ?? []).filter((t) => t.runId === runId),
    );

  const getWorkers: OrchestratorRuntimeShape["getWorkers"] = (runId) =>
    Effect.map(engine.getReadModel(), (readModel) =>
      (readModel.orchestratorWorkers ?? []).filter((w) => w.runId === runId),
    );

  return {
    createRun,
    cancelRun,
    createTask,
    assignTask,
    submitTask,
    acceptTask,
    rejectTask,
    blockTask,
    spawnWorker,
    terminateWorker,
    detectStuckWorkers,
    captureEvidence,
    recordDecision,
    getRun,
    getActiveRuns,
    getTaskTree,
    getWorkers,
  } satisfies OrchestratorRuntimeShape;
});

export const OrchestratorRuntimeLive = Layer.effect(
  OrchestratorRuntimeService,
  makeOrchestratorRuntime,
);
