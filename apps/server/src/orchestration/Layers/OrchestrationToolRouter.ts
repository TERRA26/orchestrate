/**
 * OrchestrationToolRouterLive - Layer implementation for OrchestrationToolRouterService.
 *
 * Routes orchestration tool calls from the meta-agent into three categories:
 * 1. **UI directives** — returned as ephemeral signals (not persisted).
 * 2. **Read-only tools** — query the in-memory read model from the engine.
 * 3. **Command tools** — dispatch domain commands to the orchestration engine.
 *
 * Input validation uses `Schema.decodeUnknown` against the per-tool schemas
 * from `@t3tools/contracts`.
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
} from "@t3tools/contracts";
import * as ToolSchemas from "@t3tools/contracts";
import { Effect, Layer, Schema } from "effect";
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
  return Schema.decodeUnknown(schema)(input).pipe(
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
    return {
      agentId: worker.workerId,
      status: worker.status,
      visibility: worker.visibility ?? "foreground",
      activeTaskId: worker.activeTaskId ?? null,
      threadId: worker.threadId,
      updatedAt: worker.updatedAt,
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

    // Resolve provider/model for the worker thread, falling back to the
    // orchestrator thread's model selection when not explicitly provided.
    const resolvedProvider = normalizeProvider(provider) ?? callingThread.modelSelection.provider;
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
    const taskMessage = normalizedObjective || "Begin working on the assigned task.";
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
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.TerminateAgentInput, input);
    yield* dispatch({
      type: "orchestrator.worker.terminate" as const,
      commandId: uuid() as any,
      workerId: decoded.agentId as any,
      reason: decoded.reason ?? "Terminated by orchestrator",
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    return { agentId: decoded.agentId, terminated: true };
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

    // Find source worker (first non-terminated worker as the sender, or use a synthetic ID)
    const fromWorker = readModel.orchestratorWorkers.find((w) => w.status !== "terminated");
    const fromWorkerId = fromWorker?.workerId ?? ("orchestrator" as any);

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

    return { delivered: true, messageId };
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
        case "focus_agent":
          return yield* handleFocusAgent(readModel, engine.dispatch, toolInput);
        case "promote_panel":
          return yield* handlePromotePanel(readModel, engine.dispatch, toolInput);
        case "collapse_panel":
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
          case "get_agent_status":
            return yield* handleGetAgentStatus(readModel, toolInput);
          case "get_all_status":
            return yield* handleGetAllStatus(readModel, toolInput);
          case "get_spawn_tree":
            return yield* handleGetSpawnTree(readModel, toolInput);
          default:
            return { error: `Not implemented: ${toolName}` };
        }
      }

      // --- Command tools: dispatch to the engine ---
      switch (toolName) {
        case "spawn_agent":
          return yield* handleSpawnAgent(readModel, engine.dispatch, input.threadId, toolInput);
        case "terminate_agent":
          return yield* handleTerminateAgent(engine.dispatch, toolInput);
        case "pause_agent":
          return yield* handlePauseAgent(engine.dispatch, toolInput);
        case "resume_agent":
          return yield* handleResumeAgent(engine.dispatch, toolInput);
        case "promote_to_foreground":
          return yield* handlePromoteToForeground(engine.dispatch, toolInput);
        case "demote_to_background":
          return yield* handleDemoteToBackground(engine.dispatch, toolInput);
        case "send_to_agent":
          return yield* handleSendToAgent(engine.dispatch, readModel, toolInput);
        case "accept_work":
          return yield* handleAcceptWork(engine.dispatch, readModel, toolInput);
        case "reject_work":
          return yield* handleRejectWork(engine.dispatch, readModel, toolInput);
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
