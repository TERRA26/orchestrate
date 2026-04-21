/**
 * OrchestrationToolRouterLive - Layer implementation for OrchestrationToolRouterService.
 *
 * Routes orchestration tool calls from the meta-agent into three categories:
 * 1. **UI directives** — returned as ephemeral signals (not persisted).
 * 2. **Read-only tools** — query the in-memory read model from the engine.
 * 3. **Command tools** — dispatch domain commands to the orchestration engine.
 *
 * Input validation uses `Schema.decodeUnknown` against the per-tool schemas
 * from `@orchestrate/contracts`.
 *
 * @module OrchestrationToolRouterLive
 */
import {
  ORCHESTRATION_TOOL_NAMES,
  READ_ONLY_TOOLS,
  UI_DIRECTIVE_TOOLS,
  type OrchestrationReadModel,
  type OrchestrationThread,
  type OrchestratorTaskId,
  type OrchestratorWorkerModelBinding,
  type OrchestratorWorkerId,
} from "@orchestrate/contracts";
import * as ToolSchemas from "@orchestrate/contracts";
import { Effect, Layer, Option, Schema, Stream } from "effect";
import crypto from "node:crypto";

import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import {
  OrchestrationToolRouterService,
  type OrchestrationToolRouterShape,
} from "../Services/OrchestrationToolRouter.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Decode tool input against its schema, mapping decode errors to plain Error. */
function decodeInput<A, I>(schema: Schema.Schema<A, I>, input: unknown): Effect.Effect<A, Error> {
  return Schema.decodeUnknownEffect(schema)(input).pipe(
    Effect.mapError((e) => new Error(`Invalid tool input: ${e.message}`)),
  );
}

/** Generate a branded ID string via crypto.randomUUID(). */
const uuid = (): string => crypto.randomUUID();

/** Current ISO timestamp. */
const now = (): string => new Date().toISOString();

const DEFAULT_SPAWN_BUDGET = {
  maxDepth: 3,
  maxChildren: 5,
  maxConcurrentWriters: 2,
  maxTotalWorkers: 10,
  allowedTools: [],
  writeScope: [],
} as const;

const SpawnBudgetInputSchema = Schema.Struct({
  maxDepth: Schema.Number,
  maxChildren: Schema.Number,
  maxConcurrentWriters: Schema.Number,
  maxTotalWorkers: Schema.Number,
});

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readOptionalString(
  record: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return undefined;
}

function readOptionalStringArray(
  record: Record<string, unknown>,
  ...keys: string[]
): ReadonlyArray<string> {
  for (const key of keys) {
    const value = record[key];
    if (!Array.isArray(value)) {
      continue;
    }
    const normalized = value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return [];
}

function normalizeVisibility(value: string | undefined): "foreground" | "background" {
  return value === "background" ? "background" : "foreground";
}

function normalizeProvider(value: string | undefined): "codex" | "claudeAgent" | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "codex" || normalized === "openai") {
    return "codex";
  }
  if (
    normalized === "claude" ||
    normalized === "claudeagent" ||
    normalized === "claude-agent" ||
    normalized === "sonnet" ||
    normalized === "opus" ||
    normalized === "haiku"
  ) {
    return "claudeAgent";
  }
  return undefined;
}

function inferProviderFromModel(model: string | undefined): "codex" | "claudeAgent" | undefined {
  if (!model) {
    return undefined;
  }
  const normalized = model.trim().toLowerCase();
  if (normalized.includes("codex") || normalized.includes("gpt-5") || normalized.includes("gpt5")) {
    return "codex";
  }
  if (
    normalized.includes("claude") ||
    normalized.includes("sonnet") ||
    normalized.includes("opus") ||
    normalized.includes("haiku")
  ) {
    return "claudeAgent";
  }
  return undefined;
}

function buildStandbyObjective(): string {
  return [
    "Stand by for follow-up instructions from the orchestrator.",
    "Do not modify files or run project-changing commands until you receive a concrete implementation task.",
    "Reply once to confirm that the agent window is open and ready.",
  ].join(" ");
}

function buildStandbyAcceptanceCriteria(): ReadonlyArray<string> {
  return [
    "The worker thread is created and visible in the UI.",
    "The worker confirms it is ready for follow-up instructions.",
    "No repository files are modified before a later task is assigned.",
  ];
}

function resolveSpawnTaskTitle(input: {
  readonly taskLabel?: string;
  readonly objective?: string;
}): string {
  return input.taskLabel ?? input.objective ?? "Stand by for follow-up instructions";
}

function resolveSpawnObjective(input: {
  readonly taskLabel?: string;
  readonly objective?: string;
}): string {
  if (input.objective) {
    return input.objective;
  }
  if (input.taskLabel) {
    return `Complete the following task: ${input.taskLabel}`;
  }
  return buildStandbyObjective();
}

function resolveSpawnAcceptanceCriteria(input: {
  readonly taskLabel?: string;
  readonly acceptanceCriteria: ReadonlyArray<string>;
}): ReadonlyArray<string> {
  if (input.acceptanceCriteria.length > 0) {
    return input.acceptanceCriteria;
  }
  if (input.taskLabel) {
    return [
      `Complete the assigned task: ${input.taskLabel}.`,
      "Report the files changed, commands run, and any follow-up needed.",
    ];
  }
  return buildStandbyAcceptanceCriteria();
}

function resolveSpawnBudget(input: {
  readonly override?:
    | {
        readonly maxDepth: number;
        readonly maxChildren: number;
        readonly maxConcurrentWriters: number;
        readonly maxTotalWorkers: number;
      }
    | undefined;
  readonly inherited?:
    | {
        readonly maxDepth: number;
        readonly maxChildren: number;
        readonly maxConcurrentWriters: number;
        readonly maxTotalWorkers: number;
        readonly allowedTools: ReadonlyArray<string>;
        readonly writeScope: ReadonlyArray<string>;
      }
    | undefined;
}) {
  if (input.inherited) {
    return input.inherited;
  }
  return {
    ...DEFAULT_SPAWN_BUDGET,
    ...input.override,
  };
}

function buildRequestedModelBinding(input: {
  readonly workerId: string;
  readonly provider?: string;
  readonly model?: string;
}): OrchestratorWorkerModelBinding | undefined {
  if (!input.model) {
    return undefined;
  }
  const provider = normalizeProvider(input.provider) ?? inferProviderFromModel(input.model);
  if (!provider) {
    return undefined;
  }
  return {
    workerId: input.workerId as any,
    provider,
    model: input.model,
    selectedAt: now(),
    selectedBy: "orchestrator-tool",
    selectionReason: "Requested explicitly via spawn_agent",
    inheritedFromTaskPolicy: false,
  };
}

function resolveWorkerIdFromToolInput(
  readModel: OrchestrationReadModel,
  input: unknown,
): string | null {
  const raw = asObject(input) ?? {};
  const directWorkerId = readOptionalString(raw, "agentId", "agent_id", "workerId", "worker_id");
  if (directWorkerId) {
    return directWorkerId;
  }

  const threadId = readOptionalString(raw, "threadId", "thread_id");
  if (!threadId) {
    return null;
  }

  return (
    readModel.orchestratorWorkers.find((worker) => worker.threadId === (threadId as any))
      ?.workerId ?? null
  );
}

function resolveActiveRunForThread(
  readModel: OrchestrationReadModel,
  thread: OrchestrationThread,
  requestedRunId: string | undefined,
) {
  const activeRunsForProject = (readModel.orchestratorRuns ?? [])
    .filter((run) => run.projectId === thread.projectId && run.status === "active")
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  if (requestedRunId) {
    return activeRunsForProject.find((run) => run.runId === (requestedRunId as any)) ?? null;
  }

  return activeRunsForProject[0] ?? null;
}

// ---------------------------------------------------------------------------
// Read-only tool handlers
// ---------------------------------------------------------------------------

function handleGetAgentStatus(
  readModel: OrchestrationReadModel,
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.GetAgentStatusInput, input);
    const worker = readModel.orchestratorWorkers.find((w) => w.workerId === decoded.agentId);
    if (!worker) {
      return { error: `Worker not found: ${decoded.agentId}` };
    }
    // Gap H: surface the worker's structured submit report from the active task
    // so the orchestrator can read "what the worker did" in a single call
    // without falling back to disk inspection.
    const activeTask = worker.activeTaskId
      ? (readModel.orchestratorTasks ?? []).find((t) => t.taskId === worker.activeTaskId)
      : undefined;
    return {
      agentId: worker.workerId,
      status: worker.status,
      visibility: worker.visibility ?? "foreground",
      activeTaskId: worker.activeTaskId ?? null,
      threadId: worker.threadId,
      updatedAt: worker.updatedAt,
      ...(activeTask?.submitSummary !== undefined
        ? { submitSummary: activeTask.submitSummary }
        : {}),
      ...(activeTask?.filesWritten !== undefined
        ? { filesWritten: activeTask.filesWritten }
        : {}),
      ...(activeTask?.testsRun !== undefined ? { testsRun: activeTask.testsRun } : {}),
      ...(activeTask?.submitNotes !== undefined
        ? { submitNotes: activeTask.submitNotes }
        : {}),
      ...(activeTask?.hasChanges !== undefined ? { hasChanges: activeTask.hasChanges } : {}),
      ...(activeTask?.diffStats !== undefined ? { diffStats: activeTask.diffStats } : {}),
    };
  });
}

function handleGetAllStatus(
  readModel: OrchestrationReadModel,
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.GetAllStatusInput, input);
    const workers = decoded.runId
      ? readModel.orchestratorWorkers.filter((w) => w.runId === decoded.runId)
      : readModel.orchestratorWorkers;
    return {
      agents: workers.map((w) => ({
        agentId: w.workerId,
        status: w.status,
        visibility: w.visibility ?? "foreground",
        activeTaskId: w.activeTaskId ?? null,
        threadId: w.threadId,
      })),
    };
  });
}

interface SpawnTreeNode {
  agentId: string;
  workerId: string;
  status: string;
  children: SpawnTreeNode[];
}

function handleGetSpawnTree(
  readModel: OrchestrationReadModel,
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.GetSpawnTreeInput, input);
    const workers = readModel.orchestratorWorkers.filter((w) => w.runId === decoded.runId);

    // Index by workerId for child lookup
    const byId = new Map(workers.map((w) => [w.workerId, w]));
    const childrenOf = new Map<string | undefined, typeof workers>();
    for (const w of workers) {
      const parentKey = w.parentWorkerId ?? undefined;
      const siblings = childrenOf.get(parentKey) ?? [];
      siblings.push(w);
      childrenOf.set(parentKey, siblings);
    }

    function buildNode(workerId: string): SpawnTreeNode {
      const w = byId.get(workerId);
      const kids = childrenOf.get(workerId as OrchestratorWorkerId) ?? [];
      return {
        agentId: w?.workerId ?? workerId,
        workerId,
        status: w?.status ?? "unknown",
        children: kids.map((k) => buildNode(k.workerId)),
      };
    }

    // Root workers have no parentWorkerId
    const roots = childrenOf.get(undefined) ?? [];
    const rootNode: SpawnTreeNode =
      roots.length === 1
        ? buildNode(roots[0]!.workerId)
        : {
            agentId: "root",
            workerId: "root",
            status: "virtual",
            children: roots.map((r) => buildNode(r.workerId)),
          };

    return { root: rootNode };
  });
}

// ---------------------------------------------------------------------------
// Command tool handlers
// ---------------------------------------------------------------------------

function handleSpawnAgent(
  readModel: OrchestrationReadModel,
  dispatch: OrchestrationEngineService["Type"]["dispatch"],
  threadId: string,
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const raw = asObject(input) ?? {};
    const requestedRunId = readOptionalString(raw, "runId", "run_id");
    const requestedTaskKey = readOptionalString(raw, "taskId", "task_id");
    const taskLabel = readOptionalString(raw, "task", "title", "label");
    const objective = readOptionalString(raw, "objective", "instructions", "prompt", "message");
    const acceptanceCriteria = readOptionalStringArray(
      raw,
      "acceptanceCriteria",
      "acceptance_criteria",
      "criteria",
    );
    const visibility = normalizeVisibility(readOptionalString(raw, "visibility", "mode", "panel"));
    const provider = readOptionalString(raw, "provider");
    const model = readOptionalString(raw, "model");
    const worktreePath = readOptionalString(raw, "worktreePath", "worktree_path", "worktree");
    const branch = readOptionalString(raw, "branch");
    const spawnBudget =
      raw.spawnBudget && typeof raw.spawnBudget === "object" && !Array.isArray(raw.spawnBudget)
        ? yield* decodeInput(SpawnBudgetInputSchema, raw.spawnBudget).pipe(
            Effect.orElseSucceed(() => undefined),
          )
        : undefined;

    const callingThread =
      readModel.threads.find((thread) => thread.id === (threadId as any)) ?? null;
    if (!callingThread) {
      return { error: `Calling orchestrator thread not found: ${threadId}` };
    }

    const existingTask =
      requestedTaskKey !== undefined
        ? (readModel.orchestratorTasks ?? []).find(
            (task) => task.taskId === (requestedTaskKey as any),
          )
        : null;

    let resolvedRun =
      (existingTask
        ? (readModel.orchestratorRuns ?? []).find((run) => run.runId === existingTask.runId)
        : null) ?? resolveActiveRunForThread(readModel, callingThread, requestedRunId);

    let resolvedRunId = resolvedRun?.runId ?? null;
    const normalizedTaskLabel = taskLabel ?? (!existingTask ? requestedTaskKey : undefined);
    const normalizedObjective = resolveSpawnObjective({
      taskLabel: normalizedTaskLabel,
      objective,
    });
    const normalizedCriteria = resolveSpawnAcceptanceCriteria({
      taskLabel: normalizedTaskLabel,
      acceptanceCriteria,
    });

    const resolvedSpawnBudget = resolveSpawnBudget({
      override: spawnBudget,
      inherited: resolvedRun?.spawnBudget,
    });

    if (!resolvedRunId) {
      resolvedRunId = uuid() as any;
      yield* dispatch({
        type: "orchestrator.run.create" as const,
        commandId: uuid() as any,
        runId: resolvedRunId,
        projectId: callingThread.projectId,
        userRequest: normalizedTaskLabel ?? normalizedObjective,
        goals: [...normalizedCriteria],
        spawnBudget: resolvedSpawnBudget as any,
        createdAt: now() as any,
      }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

      resolvedRun = {
        runId: resolvedRunId,
        projectId: callingThread.projectId,
        userRequest: normalizedTaskLabel ?? normalizedObjective,
        status: "active",
        rootTaskId: "" as any,
        goals: [...normalizedCriteria],
        spawnBudget: resolvedSpawnBudget as any,
        createdAt: now(),
        updatedAt: now(),
      } as (typeof readModel.orchestratorRuns)[number];
    }

    const resolvedTaskId = existingTask?.taskId ?? (uuid() as any);
    if (!existingTask) {
      yield* dispatch({
        type: "orchestrator.task.create" as const,
        commandId: uuid() as any,
        taskId: resolvedTaskId,
        runId: resolvedRunId,
        ...(resolvedRun?.rootTaskId ? { parentTaskId: resolvedRun.rootTaskId } : {}),
        title: resolveSpawnTaskTitle({
          taskLabel: normalizedTaskLabel,
          objective,
        }),
        objective: normalizedObjective,
        acceptanceCriteria: [...normalizedCriteria],
        maxIterations: 3,
        createdAt: now() as any,
      }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));
    }

    const workerId = uuid();
    const workerThreadId = uuid();
    const modelBinding = buildRequestedModelBinding({
      workerId,
      provider,
      model,
    });

    // Resolve provider/model for the worker thread. Explicit provider wins;
    // otherwise infer from the model name so a Claude model never lands on
    // Codex (or vice versa). Fall back to the orchestrator thread's selection
    // only when neither an explicit nor an inferable provider is available.
    const resolvedProvider =
      normalizeProvider(provider) ??
      inferProviderFromModel(model) ??
      callingThread.modelSelection.provider;
    const resolvedModel = model?.trim() || callingThread.modelSelection.model;

    // Create a real thread for the worker so the provider runtime can attach.
    yield* dispatch({
      type: "thread.create" as const,
      commandId: uuid() as any,
      threadId: workerThreadId as any,
      projectId: callingThread.projectId,
      title: ((taskLabel ?? objective ?? "Agent") as string).slice(0, 50) as any,
      modelSelection: { provider: resolvedProvider, model: resolvedModel } as any,
      runtimeMode: "full-access" as any,
      interactionMode: "default" as any,
      threadType: "agent" as any,
      parentThreadId: threadId as any,
      branch: (branch ?? null) as any,
      worktreePath: (worktreePath ?? null) as any,
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    yield* dispatch({
      type: "orchestrator.worker.spawn" as const,
      commandId: uuid() as any,
      workerId: workerId as any,
      runId: resolvedRunId as any,
      taskId: resolvedTaskId as any,
      threadId: workerThreadId as any,
      spawnBudget: resolvedSpawnBudget as any,
      workspace: {
        mode: worktreePath ? ("worktree" as const) : ("local" as const),
        branch,
        worktreePath,
        cwd:
          worktreePath ??
          callingThread.associatedWorktreePath ??
          callingThread.worktreePath ??
          process.cwd(),
        terminalIds: [],
      },
      ...(modelBinding ? { modelBinding } : {}),
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    if (visibility === "background") {
      yield* dispatch({
        type: "orchestrator.worker.demote" as const,
        commandId: uuid() as any,
        workerId: workerId as any,
        visibility: "background" as any,
        createdAt: now() as any,
      }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));
    }

    // Kick off the first turn on the newly-created worker thread so the
    // provider runtime picks it up immediately.
    //
    // Gap J: include a submit-protocol reminder so every worker knows how to
    // fill out the structured report the orchestrator will read back. Workers
    // that omit this get rejected with a resubmit instruction; better to
    // prompt them up front.
    const submitProtocolReminder = [
      "",
      "When you finish, submit your work with:",
      "- summary: one-sentence account of what you did",
      "- filesWritten: every file you created or modified (absolute repo-relative paths)",
      "- testsRun: array of { name, passed } for each test file/suite you ran",
      "- notes: anything surprising, deferred cleanup, or unresolved questions",
      "- hasChanges: true if you wrote files, false if the task was inspection-only",
      "The orchestrator reads these fields from your submission to decide accept/reject.",
    ].join("\n");
    const taskMessage =
      (normalizedObjective || "Begin working on the assigned task.") + submitProtocolReminder;
    yield* dispatch({
      type: "thread.turn.start" as const,
      commandId: uuid() as any,
      threadId: workerThreadId as any,
      message: {
        messageId: uuid() as any,
        role: "user" as const,
        text: taskMessage,
        attachments: [],
      },
      modelSelection: { provider: resolvedProvider, model: resolvedModel } as any,
      runtimeMode: "full-access" as any,
      interactionMode: "default" as any,
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    return {
      agentId: workerId,
      threadId: workerThreadId,
      workerId,
      runId: resolvedRunId,
      taskId: resolvedTaskId,
      visibility,
    };
  });
}

function handleTerminateAgent(
  dispatch: OrchestrationEngineService["Type"]["dispatch"],
  readModel: any,
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.TerminateAgentInput, input);

    // 1. Mark the worker terminated in the orchestrator read model.
    yield* dispatch({
      type: "orchestrator.worker.terminate" as const,
      commandId: uuid() as any,
      workerId: decoded.agentId as any,
      reason: decoded.reason ?? "Terminated by orchestrator",
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    // 2. Stop the underlying provider session so the child Codex/Claude
    //    process is actually killed and resources are released. Without this
    //    the worker row disappears from the UI but the process keeps running.
    const worker = (readModel.orchestratorWorkers ?? []).find(
      (w: any) => w.workerId === decoded.agentId,
    );
    const workerThreadId = worker?.threadId;
    if (workerThreadId) {
      yield* dispatch({
        type: "thread.session.stop" as const,
        commandId: uuid() as any,
        threadId: workerThreadId as any,
        reason: decoded.reason ?? "Terminated by orchestrator",
        createdAt: now() as any,
      }).pipe(Effect.catch(() => Effect.void));
    }

    return {
      agentId: decoded.agentId,
      terminated: true,
      ...(workerThreadId ? { sessionStopped: true, threadId: workerThreadId } : {}),
    };
  });
}

function handlePauseAgent(
  dispatch: OrchestrationEngineService["Type"]["dispatch"],
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.PauseAgentInput, input);
    yield* dispatch({
      type: "orchestrator.worker.pause" as const,
      commandId: uuid() as any,
      workerId: decoded.agentId as any,
      reason: decoded.reason,
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    return { agentId: decoded.agentId, paused: true };
  });
}

function handleResumeAgent(
  dispatch: OrchestrationEngineService["Type"]["dispatch"],
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.ResumeAgentInput, input);
    yield* dispatch({
      type: "orchestrator.worker.resume" as const,
      commandId: uuid() as any,
      workerId: decoded.agentId as any,
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    return { agentId: decoded.agentId, resumed: true };
  });
}

function handlePromoteToForeground(
  dispatch: OrchestrationEngineService["Type"]["dispatch"],
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.PromoteToForegroundInput, input);
    yield* dispatch({
      type: "orchestrator.worker.promote" as const,
      commandId: uuid() as any,
      workerId: decoded.agentId as any,
      visibility: "foreground" as any,
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    return { agentId: decoded.agentId, visibility: "foreground" as const };
  });
}

function handleFocusAgent(
  readModel: OrchestrationReadModel,
  dispatch: OrchestrationEngineService["Type"]["dispatch"],
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const agentId = resolveWorkerIdFromToolInput(readModel, input);
    if (!agentId) {
      return { error: "Missing agent id for focus_agent." };
    }

    yield* dispatch({
      type: "orchestrator.worker.promote" as const,
      commandId: uuid() as any,
      workerId: agentId as any,
      visibility: "foreground" as any,
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    const worker = (readModel.orchestratorWorkers ?? []).find(
      (w) => w.workerId === (agentId as any),
    );
    return {
      success: true,
      focused: true,
      directive: "focus" as const,
      threadId: worker?.threadId ?? null,
      workerId: agentId,
      agentId,
    };
  });
}

function handlePromotePanel(
  readModel: OrchestrationReadModel,
  dispatch: OrchestrationEngineService["Type"]["dispatch"],
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const agentId = resolveWorkerIdFromToolInput(readModel, input);
    if (!agentId) {
      return { error: "Missing agent id for promote_panel." };
    }

    yield* dispatch({
      type: "orchestrator.worker.promote" as const,
      commandId: uuid() as any,
      workerId: agentId as any,
      visibility: "foreground" as any,
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    return { promoted: true, agentId };
  });
}

function handleCollapsePanel(
  readModel: OrchestrationReadModel,
  dispatch: OrchestrationEngineService["Type"]["dispatch"],
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const agentId = resolveWorkerIdFromToolInput(readModel, input);
    if (!agentId) {
      return { error: "Missing agent id for collapse_panel." };
    }

    yield* dispatch({
      type: "orchestrator.worker.demote" as const,
      commandId: uuid() as any,
      workerId: agentId as any,
      visibility: "background" as any,
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    const worker = (readModel.orchestratorWorkers ?? []).find(
      (w) => w.workerId === (agentId as any),
    );
    return {
      success: true,
      collapsed: true,
      directive: "collapse" as const,
      threadId: worker?.threadId ?? null,
      workerId: agentId,
      agentId,
    };
  });
}

function handleDemoteToBackground(
  dispatch: OrchestrationEngineService["Type"]["dispatch"],
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.DemoteToBackgroundInput, input);
    yield* dispatch({
      type: "orchestrator.worker.demote" as const,
      commandId: uuid() as any,
      workerId: decoded.agentId as any,
      visibility: "background" as any,
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    return { agentId: decoded.agentId, visibility: "background" as const };
  });
}

function handleSendToAgent(
  dispatch: OrchestrationEngineService["Type"]["dispatch"],
  readModel: OrchestrationReadModel,
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.SendToAgentInput, input);
    const messageId = uuid();
    const targetAgentId = decoded.targetAgentId as unknown as string;

    // Resolve the target worker's thread so we can hand the message to the
    // existing turn pipeline. Without this the message used to live only in
    // orchestratorMessages[] and the worker never saw it — the orchestrator
    // was forced to spawn a fresh worker for every follow-up.
    const targetWorker = (readModel.orchestratorWorkers ?? []).find(
      (w) => (w.workerId as unknown as string) === targetAgentId,
    );
    if (!targetWorker) {
      return { error: `Unknown agent: ${decoded.targetAgentId}` };
    }

    // Gap K: if the target worker is terminated there is no live thread to
    // deliver to. Dispatch would fail silently inside Effect.ignore and the
    // caller would get a misleading `{ queued: true }`. Tell the truth.
    if (targetWorker.status === "terminated") {
      return {
        error: `Agent ${decoded.targetAgentId} is terminated; spawn a new agent instead of messaging this one.`,
      };
    }

    const fromWorker = readModel.orchestratorWorkers.find((w) => w.status !== "terminated");
    const fromWorkerId = fromWorker?.workerId ?? ("orchestrator" as any);

    // 1) Record the message on the orchestrator message bus (projector writes
    //    it to orchestratorMessages[] for audit + replay).
    yield* dispatch({
      type: "orchestrator.message.send" as const,
      commandId: uuid() as any,
      messageId: messageId as any,
      fromWorkerId,
      toWorkerId: decoded.targetAgentId as any,
      content: decoded.message,
      metadata: decoded.metadata,
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    // 2) Gap A: bridge the message into the worker's turn queue by starting a
    //    new turn on the target thread. The decider queues if the thread is
    //    mid-turn (dispatchMode="queue", default). Delivery = when the turn
    //    actually begins; the orchestrator observes via thread.turn-started.
    yield* dispatch({
      type: "thread.turn.start" as const,
      commandId: uuid() as any,
      threadId: targetWorker.threadId,
      message: {
        messageId: uuid() as any,
        role: "user" as const,
        text: decoded.message,
        attachments: [],
      },
      dispatchMode: "queue" as const,
      assistantDeliveryMode: "buffered" as const,
      createdAt: now() as any,
    } as any).pipe(
      // Non-fatal: if the dispatch is rejected (e.g., thread already has a
      // queued turn), leave the message.send durable and let the caller
      // decide what to do based on the returned { queued: true, messageId }.
      Effect.ignore,
    );

    return { queued: true, messageId, deliveredVia: "thread.turn.start" };
  });
}

function handleAcceptWork(
  dispatch: OrchestrationEngineService["Type"]["dispatch"],
  readModel: OrchestrationReadModel,
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.AcceptWorkInput, input);
    const taskId =
      decoded.taskId ??
      readModel.orchestratorWorkers.find(
        (w) => w.workerId === (decoded.agentId as unknown as OrchestratorWorkerId),
      )?.activeTaskId;

    if (!taskId) {
      return { error: `No active task found for agent: ${decoded.agentId}` };
    }

    yield* dispatch({
      type: "orchestrator.task.accept" as const,
      commandId: uuid() as any,
      taskId: taskId as OrchestratorTaskId,
      summary: decoded.notes,
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    return { accepted: true, taskId };
  });
}

function handleRejectWork(
  dispatch: OrchestrationEngineService["Type"]["dispatch"],
  readModel: OrchestrationReadModel,
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.RejectWorkInput, input);
    const taskId =
      decoded.taskId ??
      readModel.orchestratorWorkers.find(
        (w) => w.workerId === (decoded.agentId as unknown as OrchestratorWorkerId),
      )?.activeTaskId;

    if (!taskId) {
      return { error: `No active task found for agent: ${decoded.agentId}` };
    }

    yield* dispatch({
      type: "orchestrator.task.reject" as const,
      commandId: uuid() as any,
      taskId: taskId as OrchestratorTaskId,
      instruction: decoded.reason,
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    return { rejected: true, taskId };
  });
}

// ---------------------------------------------------------------------------
// Gap B: orchestrate_get_agent_diff — aggregate the worker's latest checkpoint
// ---------------------------------------------------------------------------

function handleGetAgentDiff(
  readModel: OrchestrationReadModel,
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.GetAgentDiffInput, input);
    const agentId = decoded.agentId as unknown as string;
    const worker = (readModel.orchestratorWorkers ?? []).find(
      (w) => (w.workerId as unknown as string) === agentId,
    );
    if (!worker) {
      return { agentId: decoded.agentId, diff: "", filesChanged: 0, additions: 0, deletions: 0 };
    }
    const thread = readModel.threads.find(
      (t) => (t.id as unknown as string) === (worker.threadId as unknown as string),
    );
    if (!thread || !thread.checkpoints || thread.checkpoints.length === 0) {
      return { agentId: decoded.agentId, diff: "", filesChanged: 0, additions: 0, deletions: 0 };
    }
    const latest = thread.checkpoints[thread.checkpoints.length - 1];
    const files = latest?.files ?? [];
    const additions = files.reduce((sum, f) => sum + (f.additions ?? 0), 0);
    const deletions = files.reduce((sum, f) => sum + (f.deletions ?? 0), 0);
    const diff = files
      .map((f) => `${f.kind ?? "M"}  ${f.path}  +${f.additions ?? 0} -${f.deletions ?? 0}`)
      .join("\n");
    return {
      agentId: decoded.agentId,
      diff,
      filesChanged: files.length,
      additions,
      deletions,
    };
  });
}

// ---------------------------------------------------------------------------
// Gap 10: orchestrate_get_agent_logs — project thread activities as log entries
// ---------------------------------------------------------------------------

function handleGetAgentLogs(
  readModel: OrchestrationReadModel,
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.GetAgentLogsInput, input);
    const agentId = decoded.agentId as unknown as string;
    const worker = (readModel.orchestratorWorkers ?? []).find(
      (w) => (w.workerId as unknown as string) === agentId,
    );
    if (!worker) {
      return { agentId: decoded.agentId, entries: [] };
    }
    const thread = readModel.threads.find(
      (t) => (t.id as unknown as string) === (worker.threadId as unknown as string),
    );
    if (!thread) {
      return { agentId: decoded.agentId, entries: [] };
    }
    const activities = thread.activities ?? [];
    const sinceMs = decoded.since ? Date.parse(decoded.since) : Number.NEGATIVE_INFINITY;
    const filtered = Number.isFinite(sinceMs)
      ? activities.filter((a) => Date.parse(a.createdAt) >= sinceMs)
      : activities;
    const tail = decoded.tail ?? filtered.length;
    const windowed = tail > 0 ? filtered.slice(Math.max(0, filtered.length - tail)) : filtered;
    const entries = windowed.map((a) => ({
      timestamp: a.createdAt,
      level:
        a.tone === "error"
          ? ("error" as const)
          : a.tone === "approval"
            ? ("warn" as const)
            : ("info" as const),
      message: a.summary,
    }));
    return { agentId: decoded.agentId, entries };
  });
}

// ---------------------------------------------------------------------------
// Gap 7: server-side wait_agent / wait_all blocking coordination
// ---------------------------------------------------------------------------

const TERMINAL_WORKER_STATUSES: ReadonlySet<string> = new Set([
  "submitted",
  "terminated",
  "stuck",
]);

const DEFAULT_WAIT_TIMEOUT_MS = 15 * 60 * 1000;

function findWorkerStatus(
  readModel: OrchestrationReadModel,
  workerId: string,
): string | undefined {
  return readModel.orchestratorWorkers?.find(
    (w) => (w.workerId as unknown as string) === workerId,
  )?.status;
}

function handleWaitAgent(
  engine: OrchestrationEngineService["Type"],
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.WaitAgentInput, input);
    const agentId = decoded.agentId as unknown as string;
    const timeoutMs = decoded.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;

    const initialModel = yield* engine.getReadModel();
    const initialStatus = findWorkerStatus(initialModel, agentId);
    if (initialStatus === undefined) {
      return { error: `Unknown agent: ${decoded.agentId}` };
    }
    if (TERMINAL_WORKER_STATUSES.has(initialStatus)) {
      return { agentId: decoded.agentId, status: initialStatus, timedOut: false };
    }

    // Subscribe to domain events; on each tick, check if the worker's
    // status in the read model has reached a terminal state. This replaces
    // orchestrator-driven polling via get_agent_status.
    const streamed = yield* engine.streamDomainEvents.pipe(
      Stream.mapEffect(() =>
        engine.getReadModel().pipe(Effect.map((model) => findWorkerStatus(model, agentId))),
      ),
      Stream.filter(
        (status): status is string =>
          status !== undefined && TERMINAL_WORKER_STATUSES.has(status),
      ),
      Stream.take(1),
      Stream.runHead,
      Effect.timeoutOption(timeoutMs),
      Effect.map((outer) => Option.flatten(outer)),
    );

    if (Option.isNone(streamed)) {
      const lastState = yield* engine.getReadModel();
      const lastStatus = findWorkerStatus(lastState, agentId);
      return {
        agentId: decoded.agentId,
        status: lastStatus ?? "unknown",
        timedOut: true,
      };
    }
    return {
      agentId: decoded.agentId,
      status: Option.getOrElse(streamed, () => "unknown"),
      timedOut: false,
    };
  });
}

function handleWaitAll(
  engine: OrchestrationEngineService["Type"],
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.WaitAllInput, input);
    const ids = decoded.agentIds.map((id) => id as unknown as string);
    const timeoutMs = decoded.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;

    const allTerminal = (model: OrchestrationReadModel): boolean =>
      ids.every((id) => {
        const status = findWorkerStatus(model, id);
        return status !== undefined && TERMINAL_WORKER_STATUSES.has(status);
      });

    const snapshot = yield* engine.getReadModel();
    if (allTerminal(snapshot)) {
      return {
        results: ids.map((id) => ({
          agentId: id,
          status: findWorkerStatus(snapshot, id) ?? "unknown",
        })),
        timedOut: false,
      };
    }

    const streamed = yield* engine.streamDomainEvents.pipe(
      Stream.mapEffect(() => engine.getReadModel()),
      Stream.filter(allTerminal),
      Stream.take(1),
      Stream.runHead,
      Effect.timeoutOption(timeoutMs),
      Effect.map((outer) => Option.flatten(outer)),
    );

    if (Option.isNone(streamed)) {
      const lastState = yield* engine.getReadModel();
      return {
        results: ids.map((id) => ({
          agentId: id,
          status: findWorkerStatus(lastState, id) ?? "unknown",
        })),
        timedOut: true,
      };
    }
    const finalModel = Option.getOrElse(streamed, () => snapshot);
    return {
      results: ids.map((id) => ({
        agentId: id,
        status: findWorkerStatus(finalModel, id) ?? "unknown",
      })),
      timedOut: false,
    };
  });
}

// ---------------------------------------------------------------------------
// Router implementation
// ---------------------------------------------------------------------------

const makeOrchestrationToolRouter = Effect.gen(function* () {
  const engine = yield* OrchestrationEngineService;

  const isOrchestrationTool: OrchestrationToolRouterShape["isOrchestrationTool"] = (toolName) =>
    ORCHESTRATION_TOOL_NAMES.has(toolName);

  const executeTool: OrchestrationToolRouterShape["executeTool"] = (input) =>
    Effect.gen(function* () {
      const { toolName, toolInput } = input;

      if (!ORCHESTRATION_TOOL_NAMES.has(toolName)) {
        return { error: `Unknown orchestration tool: ${toolName}` };
      }

      const readModel = yield* engine.getReadModel();

      // --- UI actions that can be expressed through existing domain commands ---
      switch (toolName) {
        case "orchestrate_focus_agent":
          return yield* handleFocusAgent(readModel, engine.dispatch, toolInput);
        case "orchestrate_promote_panel":
          return yield* handlePromotePanel(readModel, engine.dispatch, toolInput);
        case "orchestrate_collapse_panel":
          return yield* handleCollapsePanel(readModel, engine.dispatch, toolInput);
        default:
          break;
      }

      // --- UI directives: ephemeral, not persisted ---
      if (UI_DIRECTIVE_TOOLS.has(toolName)) {
        return { success: true, directive: toolName };
      }

      // --- Read-only tools: query the read model ---
      if (READ_ONLY_TOOLS.has(toolName)) {
        switch (toolName) {
          case "orchestrate_get_agent_status":
            return yield* handleGetAgentStatus(readModel, toolInput);
          case "orchestrate_get_all_status":
            return yield* handleGetAllStatus(readModel, toolInput);
          case "orchestrate_get_spawn_tree":
            return yield* handleGetSpawnTree(readModel, toolInput);
          case "orchestrate_get_agent_logs":
            return yield* handleGetAgentLogs(readModel, toolInput);
          case "orchestrate_get_agent_diff":
            return yield* handleGetAgentDiff(readModel, toolInput);
          default:
            return { error: `Not implemented: ${toolName}` };
        }
      }

      // --- Command tools: dispatch to the engine ---
      switch (toolName) {
        case "orchestrate_spawn_agent":
          return yield* handleSpawnAgent(readModel, engine.dispatch, input.threadId, toolInput);
        case "orchestrate_terminate_agent":
          return yield* handleTerminateAgent(engine.dispatch, readModel, toolInput);
        case "orchestrate_pause_agent":
          return yield* handlePauseAgent(engine.dispatch, toolInput);
        case "orchestrate_resume_agent":
          return yield* handleResumeAgent(engine.dispatch, toolInput);
        case "orchestrate_promote_to_foreground":
          return yield* handlePromoteToForeground(engine.dispatch, toolInput);
        case "orchestrate_demote_to_background":
          return yield* handleDemoteToBackground(engine.dispatch, toolInput);
        case "orchestrate_send_to_agent":
          return yield* handleSendToAgent(engine.dispatch, readModel, toolInput);
        case "orchestrate_accept_work":
          return yield* handleAcceptWork(engine.dispatch, readModel, toolInput);
        case "orchestrate_reject_work":
          return yield* handleRejectWork(engine.dispatch, readModel, toolInput);
        case "orchestrate_wait_agent":
          return yield* handleWaitAgent(engine, toolInput);
        case "orchestrate_wait_all":
          return yield* handleWaitAll(engine, toolInput);
        default:
          return { error: `Not implemented: ${toolName}` };
      }
    });

  return { isOrchestrationTool, executeTool } satisfies OrchestrationToolRouterShape;
});

export const OrchestrationToolRouterLive = Layer.effect(
  OrchestrationToolRouterService,
  makeOrchestrationToolRouter,
);
