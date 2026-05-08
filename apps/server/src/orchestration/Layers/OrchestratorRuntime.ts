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
} from "@orchestrate/contracts";
import type {
  OrchestratorDecision,
  OrchestratorEvidenceRecord,
  OrchestratorFallbackPolicy,
  OrchestratorWorkerModelBinding,
} from "@orchestrate/contracts";
import { Effect, Layer } from "effect";

import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ModelRegistryService } from "../Services/ModelRegistry.ts";
import { OrchestratorRunsRepository } from "../../persistence/Services/OrchestratorRuns.ts";
import { findDependentTasks, toDependencyTasks } from "../taskDependencyGraph.ts";
import {
  ORPHAN_RECOVERY_REASON,
  findOrphanedWorkersOnRecovery,
} from "../orphanedWorkersOnRecovery.ts";
import {
  OrchestratorRuntimeService,
  type OrchestratorRuntimeShape,
  type FailureType,
  type FallbackResult,
} from "../Services/OrchestratorRuntime.ts";

// ---------------------------------------------------------------------------
// Default fallback policy (Task 23)
// ---------------------------------------------------------------------------

const DEFAULT_FALLBACK_POLICY: OrchestratorFallbackPolicy = {
  onTimeout: { action: "retry-same-model", maxAttempts: 2 },
  onToolFailure: { action: "retry-same-model", maxAttempts: 2 },
  onMalformedOutput: { action: "retry-same-provider", maxAttempts: 2 },
  onReviewRejected: { action: "retry-same-model", maxAttempts: 3 },
  onCapabilityMismatch: { action: "switch-provider", maxAttempts: 1 },
  onProviderUnavailable: { action: "switch-provider", maxAttempts: 1 },
};

/** Map failure type to the corresponding fallback policy field. */
const FAILURE_TO_POLICY_KEY: Record<FailureType, keyof OrchestratorFallbackPolicy> = {
  timeout: "onTimeout",
  "tool-failure": "onToolFailure",
  "malformed-output": "onMalformedOutput",
  "review-rejected": "onReviewRejected",
  "capability-mismatch": "onCapabilityMismatch",
  "provider-unavailable": "onProviderUnavailable",
};
const now = () => new Date().toISOString();

const makeOrchestratorRuntime = Effect.gen(function* () {
  const engine = yield* OrchestrationEngineService;
  const modelRegistry = yield* ModelRegistryService;
  const orchestratorRunsRepo = yield* OrchestratorRunsRepository;

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

  const completeRun: OrchestratorRuntimeShape["completeRun"] = (runId, summary) =>
    engine
      .dispatch({
        type: "orchestrator.run.complete",
        commandId: CommandId.makeUnsafe(crypto.randomUUID()),
        runId,
        summary,
        createdAt: now(),
      })
      .pipe(Effect.asVoid);

  const failRun: OrchestratorRuntimeShape["failRun"] = (runId, reason) =>
    engine
      .dispatch({
        type: "orchestrator.run.fail",
        commandId: CommandId.makeUnsafe(crypto.randomUUID()),
        runId,
        reason,
        createdAt: now(),
      })
      .pipe(Effect.asVoid);

  const cancelRun: OrchestratorRuntimeShape["cancelRun"] = (runId, reason) =>
    Effect.gen(function* () {
      // Cancel the run itself
      yield* engine.dispatch({
        type: "orchestrator.run.cancel",
        commandId: CommandId.makeUnsafe(crypto.randomUUID()),
        runId,
        reason,
        createdAt: now(),
      });

      // Cancel all active tasks for this run
      const readModel = yield* engine.getReadModel();
      const terminalTaskStatuses = new Set(["cancelled", "failed", "accepted"]);
      const activeTasks = (readModel.orchestratorTasks ?? []).filter(
        (t) => t.runId === runId && !terminalTaskStatuses.has(t.status),
      );
      for (const task of activeTasks) {
        yield* engine
          .dispatch({
            type: "orchestrator.task.cancel",
            commandId: CommandId.makeUnsafe(crypto.randomUUID()),
            taskId: task.taskId,
            reason: `Run cancelled: ${reason}`,
            createdAt: now(),
          })
          .pipe(Effect.catch(() => Effect.void));
      }

      // Terminate all active workers for this run
      const activeWorkers = (readModel.orchestratorWorkers ?? []).filter(
        (w) => w.runId === runId && w.status !== "terminated",
      );
      for (const worker of activeWorkers) {
        yield* engine
          .dispatch({
            type: "orchestrator.worker.terminate",
            commandId: CommandId.makeUnsafe(crypto.randomUUID()),
            workerId: worker.workerId,
            reason: `Run cancelled: ${reason}`,
            createdAt: now(),
          })
          .pipe(Effect.catch(() => Effect.void));
      }

      // Record the cancellation decision
      yield* recordDecision({
        runId,
        decisionType: "cancelled",
        reason,
      });
    }).pipe(Effect.asVoid);

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

      // --- Task 21: Model selection ---
      // Resolve model binding if not explicitly provided
      let resolvedBinding: OrchestratorWorkerModelBinding | undefined = input.modelBinding;

      if (!resolvedBinding) {
        // Read the task's model policy from the read model
        const readModelForPolicy = yield* engine.getReadModel();
        const task = (readModelForPolicy.orchestratorTasks ?? []).find(
          (t) => t.taskId === input.taskId,
        );
        const modelPolicy = task?.modelPolicy;

        if (modelPolicy && modelPolicy.preferredModels.length > 0) {
          // Use the task's model policy to resolve binding
          resolvedBinding = yield* modelRegistry.resolveBinding(workerId, modelPolicy);
        } else {
          // No policy: use ModelRegistry.findCandidates with default capabilities
          const defaultCapabilities: Array<"code-edit"> = ["code-edit"];
          const candidates = yield* modelRegistry.findCandidates(defaultCapabilities);
          if (candidates.length > 0) {
            const top = candidates[0]!;
            resolvedBinding = {
              workerId,
              provider: top.provider,
              model: top.model,
              selectedAt: now(),
              selectedBy: "root-policy",
              selectionReason: `Default selection: ${top.reason}`,
              inheritedFromTaskPolicy: false,
            };
          }
        }
      }

      // Record the spawn decision before dispatching the command
      const selectionInfo = resolvedBinding
        ? ` with model ${resolvedBinding.provider}/${resolvedBinding.model}`
        : "";
      yield* engine.dispatch({
        type: "orchestrator.decision.record",
        commandId: CommandId.makeUnsafe(crypto.randomUUID()),
        decisionId: OrchestratorDecisionId.makeUnsafe(crypto.randomUUID()),
        runId: input.runId,
        taskId: input.taskId,
        decisionType: "spawned-worker",
        reason: `Spawning worker ${workerId} for task ${input.taskId}${selectionInfo}`,
        createdAt: now(),
      });

      // Spawn the worker with model binding
      yield* engine.dispatch({
        type: "orchestrator.worker.spawn",
        commandId: CommandId.makeUnsafe(crypto.randomUUID()),
        workerId,
        runId: input.runId,
        taskId: input.taskId,
        threadId: input.threadId,
        spawnBudget: input.spawnBudget,
        workspace: input.workspace,
        modelBinding: resolvedBinding,
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

        // ORC-122: cascade the block to every task that transitively
        // depends on the terminated worker's active task. Without this,
        // dependent tasks stay pending forever and the orchestrator's
        // spawn loop never retries them. Only block tasks currently in
        // a runnable / waiting state; already-terminal tasks
        // (accepted, cancelled, failed) are left alone.
        const allTasks = toDependencyTasks(readModel.orchestratorTasks ?? []);
        const dependents = findDependentTasks({
          rootTaskId: worker.activeTaskId,
          tasks: allTasks,
        });
        const tasksByIdLookup = new Map(
          (readModel.orchestratorTasks ?? []).map((t) => [t.taskId as unknown as string, t]),
        );
        const cascadeBlockable = new Set([
          "pending",
          "assigned",
          "running",
          "submitted",
          "needs-rework",
        ]);
        for (const dependentId of dependents) {
          const dependent = tasksByIdLookup.get(dependentId as unknown as string);
          if (!dependent) continue;
          if (!cascadeBlockable.has(dependent.status)) continue;
          yield* engine.dispatch({
            type: "orchestrator.task.block",
            commandId: CommandId.makeUnsafe(crypto.randomUUID()),
            taskId: dependent.taskId,
            reason: `Dependency '${worker.activeTaskId}' was blocked by worker termination (worker ${workerId}: ${reason}).`,
            createdAt: now(),
          });
        }
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

  const getEvidence: OrchestratorRuntimeShape["getEvidence"] = (taskId) =>
    orchestratorRunsRepo.getEvidenceByTaskId({ taskId }).pipe(
      Effect.map(
        (rows): ReadonlyArray<OrchestratorEvidenceRecord> =>
          rows.map((row) => ({
            evidenceId: row.evidenceId,
            taskId: row.taskId,
            ...(row.workerId ? { workerId: OrchestratorWorkerId.makeUnsafe(row.workerId) } : {}),
            type: row.type,
            content: row.content,
            contentTruncated: Boolean(row.contentTruncated),
            metadata: row.metadataJson ? JSON.parse(row.metadataJson) : {},
            capturedAt: row.capturedAt,
          })),
      ),
      Effect.catch(() => Effect.succeed([] as ReadonlyArray<OrchestratorEvidenceRecord>)),
    );

  const getDecisions: OrchestratorRuntimeShape["getDecisions"] = (_runId, _taskId) =>
    // Decisions are persisted to DB, not the in-memory read model.
    // Callers should use OrchestratorRunsRepository for DB-backed queries.
    // The wsServer route handler queries the repository directly.
    Effect.succeed([]);

  // -----------------------------------------------------------------------
  // Multi-model: review model selection (Task 22)
  // -----------------------------------------------------------------------

  const selectReviewModel: OrchestratorRuntimeShape["selectReviewModel"] = (input) =>
    Effect.gen(function* () {
      const { implementationBinding, reviewMode } = input;
      const profiles = yield* modelRegistry.getProfiles();

      switch (reviewMode) {
        case "same-model": {
          // Use the same model as the implementation worker
          const binding: OrchestratorWorkerModelBinding = {
            workerId: OrchestratorWorkerId.makeUnsafe(crypto.randomUUID()),
            provider: implementationBinding.provider,
            model: implementationBinding.model,
            selectedAt: now(),
            selectedBy: "root-policy",
            selectionReason: "Review mode: same-model",
            inheritedFromTaskPolicy: true,
          };
          return binding;
        }

        case "same-provider-different-model": {
          // Find a different model from the same provider
          const sameProviderDifferent = profiles.find(
            (p) =>
              p.provider === implementationBinding.provider &&
              p.model !== implementationBinding.model &&
              p.supports.includes("structured-review"),
          );
          // Fall back to any different model from same provider
          const candidate =
            sameProviderDifferent ??
            profiles.find(
              (p) =>
                p.provider === implementationBinding.provider &&
                p.model !== implementationBinding.model,
            );
          if (!candidate) return null;

          const binding: OrchestratorWorkerModelBinding = {
            workerId: OrchestratorWorkerId.makeUnsafe(crypto.randomUUID()),
            provider: candidate.provider,
            model: candidate.model,
            selectedAt: now(),
            selectedBy: "root-policy",
            selectionReason: `Review mode: same-provider-different-model (impl: ${implementationBinding.model})`,
            inheritedFromTaskPolicy: true,
          };
          return binding;
        }

        case "cross-provider": {
          // Select a model from a different provider, preferring structured-review
          const crossProvider = profiles.find(
            (p) =>
              p.provider !== implementationBinding.provider &&
              p.supports.includes("structured-review"),
          );
          // Fall back to any model from a different provider
          const candidate =
            crossProvider ?? profiles.find((p) => p.provider !== implementationBinding.provider);
          if (!candidate) return null;

          const binding: OrchestratorWorkerModelBinding = {
            workerId: OrchestratorWorkerId.makeUnsafe(crypto.randomUUID()),
            provider: candidate.provider,
            model: candidate.model,
            selectedAt: now(),
            selectedBy: "root-policy",
            selectionReason: `Review mode: cross-provider (impl: ${implementationBinding.provider}/${implementationBinding.model})`,
            inheritedFromTaskPolicy: true,
          };
          return binding;
        }

        case "root-decides": {
          // Root orchestrator decides -- return null so caller handles it
          return null;
        }
      }
    });

  // -----------------------------------------------------------------------
  // Fallback/retry: worker failure handling (Task 23)
  // -----------------------------------------------------------------------

  const handleWorkerFailure: OrchestratorRuntimeShape["handleWorkerFailure"] = (input) =>
    Effect.gen(function* () {
      const policy = input.fallbackPolicy ?? DEFAULT_FALLBACK_POLICY;
      const policyKey = FAILURE_TO_POLICY_KEY[input.failureType];
      const fallbackAction = policy[policyKey];

      // Check attempt count for the current model
      const readModel = yield* engine.getReadModel();
      const worker = (readModel.orchestratorWorkers ?? []).find(
        (w) => w.workerId === input.workerId,
      );
      const currentModel = worker?.modelBinding
        ? `${worker.modelBinding.provider}/${worker.modelBinding.model}`
        : "unknown";
      const currentAttempts = input.attemptCounts.get(currentModel) ?? 0;

      // Exceeded max attempts for this action
      if (currentAttempts >= fallbackAction.maxAttempts) {
        const escalateResult: FallbackResult = {
          action: "escalate",
          reason: `Exceeded ${fallbackAction.maxAttempts} attempts for ${fallbackAction.action} on ${input.failureType}`,
        };

        yield* recordDecision({
          runId: input.runId,
          taskId: input.taskId,
          decisionType: "escalated",
          reason: escalateResult.reason,
        });

        return escalateResult;
      }

      const profiles = yield* modelRegistry.getProfiles();
      let newBinding: OrchestratorWorkerModelBinding | null = null;

      switch (fallbackAction.action) {
        case "retry-same-model": {
          // Re-use the same model
          if (worker?.modelBinding) {
            newBinding = {
              ...worker.modelBinding,
              workerId: OrchestratorWorkerId.makeUnsafe(crypto.randomUUID()),
              selectedAt: now(),
              selectedBy: "retry-policy",
              selectionReason: `Retry same model after ${input.failureType} (attempt ${currentAttempts + 1}/${fallbackAction.maxAttempts})`,
            };
          }
          break;
        }

        case "retry-same-provider": {
          // Try a different model from the same provider
          const currentProvider = worker?.modelBinding?.provider;
          const currentModelName = worker?.modelBinding?.model;
          const alternate = profiles.find(
            (p) => p.provider === currentProvider && p.model !== currentModelName,
          );
          if (alternate) {
            newBinding = {
              workerId: OrchestratorWorkerId.makeUnsafe(crypto.randomUUID()),
              provider: alternate.provider,
              model: alternate.model,
              selectedAt: now(),
              selectedBy: "retry-policy",
              selectionReason: `Retry same provider after ${input.failureType}: switched from ${currentModelName} to ${alternate.model}`,
              inheritedFromTaskPolicy: false,
              supersedesBindingId: worker?.modelBinding?.workerId,
            };
          }
          break;
        }

        case "switch-provider": {
          // Try a model from a different provider
          const currentProvider = worker?.modelBinding?.provider;
          const alternate = profiles.find((p) => p.provider !== currentProvider);
          if (alternate) {
            newBinding = {
              workerId: OrchestratorWorkerId.makeUnsafe(crypto.randomUUID()),
              provider: alternate.provider,
              model: alternate.model,
              selectedAt: now(),
              selectedBy: "retry-policy",
              selectionReason: `Switch provider after ${input.failureType}: from ${currentProvider} to ${alternate.provider}/${alternate.model}`,
              inheritedFromTaskPolicy: false,
              supersedesBindingId: worker?.modelBinding?.workerId,
            };
          }
          break;
        }

        case "escalate": {
          const escalateResult: FallbackResult = {
            action: "escalate",
            reason: `Policy requires escalation on ${input.failureType}`,
          };

          yield* recordDecision({
            runId: input.runId,
            taskId: input.taskId,
            decisionType: "escalated",
            reason: escalateResult.reason,
          });

          return escalateResult;
        }
      }

      if (!newBinding) {
        const escalateResult: FallbackResult = {
          action: "escalate",
          reason: `No alternative model available for ${fallbackAction.action} after ${input.failureType}`,
        };

        yield* recordDecision({
          runId: input.runId,
          taskId: input.taskId,
          decisionType: "escalated",
          reason: escalateResult.reason,
        });

        return escalateResult;
      }

      // Record the fallback decision
      yield* recordDecision({
        runId: input.runId,
        taskId: input.taskId,
        decisionType: "spawned-worker",
        reason: newBinding.selectionReason,
      });

      return { action: "retry", modelBinding: newBinding } satisfies FallbackResult;
    });

  // -----------------------------------------------------------------------
  // Recovery
  // -----------------------------------------------------------------------

  const resumeActiveRuns: OrchestratorRuntimeShape["resumeActiveRuns"] = () =>
    Effect.gen(function* () {
      const readModel = yield* engine.getReadModel();
      const activeRuns = (readModel.orchestratorRuns ?? []).filter((r) => r.status === "active");

      if (activeRuns.length === 0) {
        yield* Effect.logInfo("resumeActiveRuns: no active runs found");
        return;
      }

      yield* Effect.logInfo(`resumeActiveRuns: found ${activeRuns.length} active run(s)`);

      for (const run of activeRuns) {
        // Check worker health for this run
        const workers = (readModel.orchestratorWorkers ?? []).filter(
          (w) => w.runId === run.runId && w.status !== "terminated",
        );
        const tasks = (readModel.orchestratorTasks ?? []).filter((t) => t.runId === run.runId);
        const terminalTaskStatuses = new Set(["cancelled", "failed", "accepted"]);
        const pendingTasks = tasks.filter((t) => !terminalTaskStatuses.has(t.status));

        yield* Effect.logInfo("resumeActiveRuns: run state on recovery", {
          runId: run.runId,
          activeWorkers: workers.length,
          pendingTasks: pendingTasks.length,
          totalTasks: tasks.length,
        });

        // ORC-275: any worker persisted in `running` / `submitted` /
        // `paused` / `stuck` had its provider session torn down with
        // the previous server process. Auto-terminate them so the
        // active task gets blocked, dependent tasks cascade-block,
        // and the orchestrator's spawn loop can re-plan. Without
        // this, half-spawned workers from a server crash linger
        // forever and dependent tasks never unblock.
        const orphans = findOrphanedWorkersOnRecovery(workers);
        for (const worker of orphans) {
          yield* Effect.logWarning("resumeActiveRuns: terminating orphaned worker", {
            runId: run.runId,
            workerId: worker.workerId,
            previousStatus: worker.status,
            activeTaskId: worker.activeTaskId,
          });
          yield* terminateWorker(worker.workerId, ORPHAN_RECOVERY_REASON);
        }
      }
    });

  return {
    createRun,
    completeRun,
    failRun,
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
    selectReviewModel,
    handleWorkerFailure,
    getRun,
    getActiveRuns,
    getTaskTree,
    getWorkers,
    getEvidence,
    getDecisions,
    resumeActiveRuns,
  } satisfies OrchestratorRuntimeShape;
});

export const OrchestratorRuntimeLive = Layer.effect(
  OrchestratorRuntimeService,
  makeOrchestratorRuntime,
);
