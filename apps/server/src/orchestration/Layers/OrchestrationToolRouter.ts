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
  type OrchestratorTaskId,
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
  dispatch: OrchestrationEngineService["Type"]["dispatch"],
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.SpawnAgentInput, input);
    const workerId = uuid();
    const threadId = uuid();

    yield* dispatch({
      type: "orchestrator.worker.spawn" as const,
      commandId: uuid() as any,
      workerId: workerId as any,
      runId: decoded.runId as any,
      taskId: decoded.taskId as any,
      threadId: threadId as any,
      spawnBudget: decoded.spawnBudget ?? {
        maxDepth: 3,
        maxChildren: 5,
        maxConcurrentWriters: 2,
        maxTotalWorkers: 10,
        allowedTools: [],
        writeScope: [],
      },
      workspace: {
        mode: decoded.worktreePath ? ("worktree" as const) : ("local" as const),
        branch: decoded.branch,
        worktreePath: decoded.worktreePath,
        cwd: decoded.worktreePath ?? process.cwd(),
        terminalIds: [],
      },
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    return {
      agentId: workerId,
      threadId,
      workerId,
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

      // --- UI directives: ephemeral, not persisted ---
      if (UI_DIRECTIVE_TOOLS.has(toolName)) {
        return { success: true, directive: toolName };
      }

      const readModel = yield* engine.getReadModel();

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
          return yield* handleSpawnAgent(engine.dispatch, toolInput);
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
