#!/usr/bin/env bun
/**
 * MCP Server for Orchestrate orchestration tools.
 *
 * This runs as a stdio MCP server that the Codex app-server connects to.
 * It exposes the 38 orchestrate_* tools and routes them to the
 * OrchestrationToolRouter via WebSocket.
 *
 * Register with: codex mcp add orchestrate -- bun /path/to/orchestrate-mcp-server.ts
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ORCHESTRATOR_PID_SIDECAR_DIR = path.join(os.tmpdir(), "orchestrate-codex-pid-map");

function readSidecarFor(pid: number): string | undefined {
  const file = path.join(ORCHESTRATOR_PID_SIDECAR_DIR, `${pid}.json`);
  if (!existsSync(file)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf-8"));
    return typeof parsed.orchestratorThreadId === "string"
      ? parsed.orchestratorThreadId
      : undefined;
  } catch {
    return undefined;
  }
}

function getParentPid(pid: number): number | undefined {
  try {
    const out = execFileSync("ps", ["-o", "ppid=", "-p", String(pid)], {
      encoding: "utf-8",
    }).trim();
    const ppid = Number.parseInt(out, 10);
    return Number.isFinite(ppid) && ppid > 1 ? ppid : undefined;
  } catch {
    return undefined;
  }
}

function readOrchestratorThreadIdFromSidecar(): string | undefined {
  let pid: number | undefined = process.ppid;
  for (let depth = 0; depth < 6 && pid !== undefined; depth++) {
    const found = readSidecarFor(pid);
    if (found) return found;
    pid = getParentPid(pid);
  }
  return undefined;
}

function inferProviderFromModel(model: string | undefined): "codex" | "claudeAgent" | undefined {
  if (!model) return undefined;
  const normalized = model.trim().toLowerCase();
  if (normalized.startsWith("gpt") || normalized.includes("codex") || /^o[13]/.test(normalized)) {
    return "codex";
  }
  if (
    normalized.startsWith("claude") ||
    normalized.includes("sonnet") ||
    normalized.includes("opus") ||
    normalized.includes("haiku")
  ) {
    return "claudeAgent";
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serializeWsError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { message: error.message, name: error.name };
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      message:
        typeof record.message === "string"
          ? record.message
          : typeof record._tag === "string"
            ? String(record._tag)
            : "dispatch failed",
      payload: record,
    };
  }
  return { message: String(error) };
}

async function findWorker(workerId: string): Promise<any | undefined> {
  const snap = await wsRequest("orchestration.getSnapshot");
  return (snap.orchestratorWorkers ?? []).find((w: any) => w.workerId === workerId);
}

async function findThread(threadId: string): Promise<any | undefined> {
  const snap = await wsRequest("orchestration.getSnapshot");
  return (snap.threads ?? []).find((t: any) => t.id === threadId);
}

const TOOLS = [
  {
    name: "orchestrate_spawn_agent",
    description: "Create a new agent with a dedicated thread and panel",
    inputSchema: {
      type: "object" as const,
      properties: {
        task: { type: "string", description: "Task description for the agent" },
        provider: { type: "string", description: "Provider: codex or claudeAgent" },
        model: { type: "string", description: "Model name" },
        mode: {
          type: "string",
          enum: ["foreground", "background"],
          description: "Visibility mode",
        },
      },
      required: ["task"],
    },
  },
  {
    name: "orchestrate_terminate_agent",
    description: "Kill an agent",
    inputSchema: {
      type: "object" as const,
      properties: { workerId: { type: "string" }, reason: { type: "string" } },
      required: ["workerId"],
    },
  },
  {
    name: "orchestrate_get_all_status",
    description: "Dashboard snapshot of all agents",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "orchestrate_get_agent_status",
    description: "Check what an agent is doing",
    inputSchema: {
      type: "object" as const,
      properties: { workerId: { type: "string" } },
      required: ["workerId"],
    },
  },
  {
    name: "orchestrate_send_to_agent",
    description: "Send instruction to a specific agent",
    inputSchema: {
      type: "object" as const,
      properties: { workerId: { type: "string" }, message: { type: "string" } },
      required: ["workerId", "message"],
    },
  },
  {
    name: "orchestrate_wait_agent",
    description: "Block until agent completes",
    inputSchema: {
      type: "object" as const,
      properties: { workerId: { type: "string" }, timeout: { type: "number" } },
      required: ["workerId"],
    },
  },
  {
    name: "orchestrate_wait_all",
    description: "Block until all agents complete",
    inputSchema: { type: "object" as const, properties: { timeout: { type: "number" } } },
  },
  {
    name: "orchestrate_accept_work",
    description: "Accept agent output",
    inputSchema: {
      type: "object" as const,
      properties: { workerId: { type: "string" } },
      required: ["workerId"],
    },
  },
  {
    name: "orchestrate_reject_work",
    description: "Reject with rework instructions",
    inputSchema: {
      type: "object" as const,
      properties: {
        workerId: { type: "string" },
        reason: { type: "string" },
        instructions: { type: "string" },
      },
      required: ["workerId", "reason", "instructions"],
    },
  },
  {
    name: "orchestrate_review_agent_work",
    description: "Pull diff and checklist for review",
    inputSchema: {
      type: "object" as const,
      properties: { workerId: { type: "string" } },
      required: ["workerId"],
    },
  },
  {
    name: "orchestrate_get_agent_diff",
    description:
      "Read the diff produced by an agent: aggregated file-by-file additions/deletions plus a line-per-file stat string. Use this (alongside orchestrate_get_agent_status for the submit report) to review without shelling out.",
    inputSchema: {
      type: "object" as const,
      properties: { workerId: { type: "string" } },
      required: ["workerId"],
    },
  },
  {
    name: "orchestrate_get_agent_logs",
    description:
      "Tail the work-log activities for an agent: recent commands run, files read/written, errors. Optional tail and since filter.",
    inputSchema: {
      type: "object" as const,
      properties: {
        workerId: { type: "string" },
        tail: { type: "number" },
        since: { type: "string" },
      },
      required: ["workerId"],
    },
  },
  {
    name: "orchestrate_focus_agent",
    description: "Bring agent panel to foreground",
    inputSchema: {
      type: "object" as const,
      properties: { workerId: { type: "string" } },
      required: ["workerId"],
    },
  },
  {
    name: "orchestrate_collapse_panel",
    description: "Minimize agent to background",
    inputSchema: {
      type: "object" as const,
      properties: { workerId: { type: "string" } },
      required: ["workerId"],
    },
  },
  {
    name: "orchestrate_get_spawn_tree",
    description: "View full agent hierarchy",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "orchestrate_broadcast",
    description: "Send message to all active agents",
    inputSchema: {
      type: "object" as const,
      properties: { message: { type: "string" } },
      required: ["message"],
    },
  },
  {
    name: "orchestrate_set_dependency",
    description: "Set agent dependencies",
    inputSchema: {
      type: "object" as const,
      properties: {
        workerId: { type: "string" },
        dependsOn: { type: "array", items: { type: "string" } },
      },
      required: ["workerId", "dependsOn"],
    },
  },
  {
    name: "orchestrate_merge_work",
    description: "Combine changes from multiple agents",
    inputSchema: {
      type: "object" as const,
      properties: {
        workerIds: { type: "array", items: { type: "string" } },
        targetBranch: { type: "string" },
      },
      required: ["workerIds", "targetBranch"],
    },
  },
  {
    name: "orchestrate_run_tests",
    description: "Execute tests against agent changes",
    inputSchema: {
      type: "object" as const,
      properties: { workerId: { type: "string" }, command: { type: "string" } },
      required: ["workerId"],
    },
  },
  {
    name: "orchestrate_pause_agent",
    description: "Pause an agent mid-work",
    inputSchema: {
      type: "object" as const,
      properties: { workerId: { type: "string" } },
      required: ["workerId"],
    },
  },
  {
    name: "orchestrate_resume_agent",
    description: "Resume a paused agent",
    inputSchema: {
      type: "object" as const,
      properties: { workerId: { type: "string" }, instructions: { type: "string" } },
      required: ["workerId"],
    },
  },
  {
    name: "orchestrate_promote_to_foreground",
    description: "Move background agent to visible panel",
    inputSchema: {
      type: "object" as const,
      properties: { workerId: { type: "string" } },
      required: ["workerId"],
    },
  },
  {
    name: "orchestrate_demote_to_background",
    description: "Move foreground agent to background",
    inputSchema: {
      type: "object" as const,
      properties: { workerId: { type: "string" } },
      required: ["workerId"],
    },
  },
];

// The MCP server connects back to our orchestration WebSocket server to execute tools
const ORCH_WS_PORT = process.env.ORCHESTRATE_WS_PORT ?? "3773";
const ORCH_WS_URL = `ws://localhost:${ORCH_WS_PORT}`;

let wsConnection: WebSocket | null = null;
let wsRequestId = 0;
const wsPending = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>();

async function ensureWs(): Promise<WebSocket> {
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) return wsConnection;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(ORCH_WS_URL);
    ws.onopen = () => {
      wsConnection = ws;
      resolve(ws);
    };
    ws.onerror = () =>
      reject(new Error(`Cannot connect to orchestration server at ${ORCH_WS_URL}`));
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.id && wsPending.has(String(msg.id))) {
          const p = wsPending.get(String(msg.id))!;
          wsPending.delete(String(msg.id));
          msg.error ? p.reject(msg.error) : p.resolve(msg.result);
        }
      } catch {}
    };
  });
}

async function wsRequest(method: string, fields?: any): Promise<any> {
  const ws = await ensureWs();
  return new Promise((resolve, reject) => {
    const id = String(++wsRequestId);
    wsPending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, body: { _tag: method, ...fields } }));
    setTimeout(() => {
      if (wsPending.has(id)) {
        wsPending.delete(id);
        reject(new Error("Timeout"));
      }
    }, 30000);
  });
}

async function executeOrchestrationTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  // Always fetch the snapshot — we need projectId and other fields from the
  // orchestrator thread even when the env var or sidecar provides the threadId.
  const snapshot = await wsRequest("orchestration.getSnapshot");
  const envThreadId = process.env.ORCHESTRATE_PARENT_THREAD_ID;
  const sidecarThreadId = envThreadId ? undefined : readOrchestratorThreadIdFromSidecar();
  const resolvedThreadId = envThreadId ?? sidecarThreadId;
  const orchestratorThread = resolvedThreadId
    ? (snapshot.threads ?? []).find((t: any) => t.id === resolvedThreadId)
    : (snapshot.threads ?? []).find(
        (t: any) => t.threadType === "orchestrator" && t.session?.status !== "error",
      );
  const threadId = resolvedThreadId ?? orchestratorThread?.id ?? "unknown";

  // Dispatch as an orchestration command simulation
  // For spawn_agent, we need to go through the full handleSpawnAgent path
  // which requires dispatching through the tool router.
  // Since we can't directly call the tool router from this MCP server,
  // we simulate the effect by dispatching the underlying commands.

  if (toolName === "orchestrate_spawn_agent") {
    const task = String(args.task ?? "Agent task");
    const rawModel = typeof args.model === "string" ? args.model : undefined;
    const rawProvider = typeof args.provider === "string" ? args.provider : undefined;
    const model = rawModel ?? orchestratorThread?.modelSelection?.model ?? "claude-sonnet-4-6";
    const provider =
      rawProvider ??
      inferProviderFromModel(model) ??
      orchestratorThread?.modelSelection?.provider ??
      "claudeAgent";
    const mode = String(args.mode ?? "foreground");
    const runId = crypto.randomUUID();
    const taskId = crypto.randomUUID();
    const workerId = crypto.randomUUID();
    const workerThreadId = crypto.randomUUID();
    const projectId = orchestratorThread?.projectId ?? snapshot.projects?.[0]?.id ?? "";

    // Create run
    await wsRequest("orchestration.dispatchCommand", {
      command: {
        type: "orchestrator.run.create",
        commandId: crypto.randomUUID(),
        runId,
        projectId,
        userRequest: task,
        goals: [task],
        spawnBudget: {
          maxDepth: 3,
          maxChildren: 4,
          maxConcurrentWriters: 4,
          maxTotalWorkers: 12,
          allowedTools: [],
          writeScope: [],
        },
        createdAt: new Date().toISOString(),
      },
    });

    // Create task
    await wsRequest("orchestration.dispatchCommand", {
      command: {
        type: "orchestrator.task.create",
        commandId: crypto.randomUUID(),
        taskId,
        runId,
        title: task.slice(0, 50),
        objective: task,
        acceptanceCriteria: [],
        maxIterations: 3,
        createdAt: new Date().toISOString(),
      },
    });

    // Create child thread
    await wsRequest("orchestration.dispatchCommand", {
      command: {
        type: "thread.create",
        commandId: crypto.randomUUID(),
        threadId: workerThreadId,
        projectId,
        title: task.slice(0, 50),
        modelSelection: { provider, model },
        runtimeMode: "full-access",
        interactionMode: "default",
        threadType: "agent",
        parentThreadId: threadId,
        branch: null,
        worktreePath: null,
        createdAt: new Date().toISOString(),
      },
    });

    // Spawn worker
    await wsRequest("orchestration.dispatchCommand", {
      command: {
        type: "orchestrator.worker.spawn",
        commandId: crypto.randomUUID(),
        workerId,
        runId,
        taskId,
        threadId: workerThreadId,
        spawnBudget: {
          maxDepth: 3,
          maxChildren: 4,
          maxConcurrentWriters: 4,
          maxTotalWorkers: 12,
          allowedTools: [],
          writeScope: [],
        },
        workspace: { mode: "local", cwd: process.cwd(), terminalIds: [] },
        createdAt: new Date().toISOString(),
      },
    });

    // Start first turn
    await wsRequest("orchestration.dispatchCommand", {
      command: {
        type: "thread.turn.start",
        commandId: crypto.randomUUID(),
        threadId: workerThreadId,
        message: { messageId: crypto.randomUUID(), role: "user", text: task, attachments: [] },
        modelSelection: { provider, model },
        runtimeMode: "full-access",
        interactionMode: "default",
        createdAt: new Date().toISOString(),
      },
    });

    return JSON.stringify({
      agentId: workerId,
      threadId: workerThreadId,
      workerId,
      runId,
      taskId,
      visibility: mode,
    });
  }

  if (toolName === "orchestrate_get_all_status") {
    const workers = snapshot.orchestratorWorkers ?? [];
    return JSON.stringify({
      agents: workers.map((w: any) => ({
        workerId: w.workerId,
        status: w.status,
        threadId: w.threadId,
        visibility: w.visibility ?? "foreground",
      })),
      total: workers.length,
    });
  }

  if (toolName === "orchestrate_get_agent_status") {
    const workerId = String(args.workerId ?? args.agent_id ?? args.agentId ?? "");
    if (!workerId) {
      return JSON.stringify({ error: "workerId is required" });
    }
    const worker = await findWorker(workerId);
    if (!worker) {
      return JSON.stringify({ workerId, status: "not-found" });
    }
    const thread = worker.threadId ? await findThread(worker.threadId) : undefined;
    // Gap H: surface the worker's structured submit report so the orchestrator
    // can read "what the worker did" from a single status call.
    const task =
      worker.activeTaskId || worker.taskId
        ? (snapshot.orchestratorTasks ?? []).find(
            (t: any) => t.taskId === (worker.activeTaskId ?? worker.taskId),
          )
        : undefined;
    return JSON.stringify({
      workerId,
      status: worker.status,
      threadId: worker.threadId,
      taskId: worker.activeTaskId ?? worker.taskId ?? null,
      session: thread?.session ?? null,
      latestActivity: thread?.activities?.at?.(-1) ?? null,
      hasRunningSubprocess: thread?.session?.hasRunningSubprocess ?? false,
      submitSummary: task?.submitSummary ?? null,
      filesWritten: task?.filesWritten ?? null,
      testsRun: task?.testsRun ?? null,
      submitNotes: task?.submitNotes ?? null,
      hasChanges: task?.hasChanges ?? null,
      diffStats: task?.diffStats ?? null,
    });
  }

  if (toolName === "orchestrate_get_agent_diff") {
    // Gap I: expose the diff aggregator to the Codex orchestrator via MCP.
    const workerId = String(args.workerId ?? args.agent_id ?? args.agentId ?? "");
    if (!workerId) {
      return JSON.stringify({ error: "workerId is required" });
    }
    const worker = await findWorker(workerId);
    if (!worker) {
      return JSON.stringify({ workerId, error: "worker not found" });
    }
    const thread = worker.threadId ? await findThread(worker.threadId) : undefined;
    const checkpoints = thread?.checkpoints ?? [];
    const latest = checkpoints[checkpoints.length - 1];
    const files = (latest?.files ?? []) as Array<{
      path: string;
      kind: string;
      additions: number;
      deletions: number;
    }>;
    const additions = files.reduce((sum, f) => sum + (f.additions ?? 0), 0);
    const deletions = files.reduce((sum, f) => sum + (f.deletions ?? 0), 0);
    const diff = files
      .map((f) => `${f.kind ?? "M"}  ${f.path}  +${f.additions ?? 0} -${f.deletions ?? 0}`)
      .join("\n");
    return JSON.stringify({
      workerId,
      agentId: workerId,
      diff,
      filesChanged: files.length,
      additions,
      deletions,
    });
  }

  if (toolName === "orchestrate_send_to_agent") {
    // Gap L0: mirror of handleSendToAgent from the server-side router,
    // expressed over the MCP WebSocket dispatch path so the Codex
    // orchestrator can actually send follow-ups instead of spawning a
    // fresh worker for every 1-char fix.
    const targetWorkerId = String(args.workerId ?? args.agent_id ?? args.agentId ?? "");
    const message = String(args.message ?? "");
    if (!targetWorkerId) {
      return JSON.stringify({ error: "workerId is required" });
    }
    if (!message) {
      return JSON.stringify({ error: "message is required" });
    }
    const targetWorker = await findWorker(targetWorkerId);
    if (!targetWorker) {
      return JSON.stringify({ error: `Unknown agent: ${targetWorkerId}` });
    }
    if (targetWorker.status === "terminated") {
      return JSON.stringify({
        error: `Agent ${targetWorkerId} is terminated; spawn a new agent instead of messaging this one.`,
      });
    }
    const messageId = crypto.randomUUID();
    const fromWorker = (snapshot.orchestratorWorkers ?? []).find(
      (w: any) => w.status !== "terminated" && w.workerId !== targetWorkerId,
    );
    const fromWorkerId = fromWorker?.workerId ?? "orchestrator";
    try {
      // 1) Audit trail on the orchestrator's message bus.
      try {
        await wsRequest("orchestration.dispatchCommand", {
          command: {
            type: "orchestrator.message.send",
            commandId: crypto.randomUUID(),
            messageId,
            fromWorkerId,
            toWorkerId: targetWorkerId,
            content: message,
            createdAt: new Date().toISOString(),
          },
        });
      } catch {
        // Non-fatal: fall through and still try to dispatch the turn so
        // the worker sees the message even if the audit record failed.
      }
      // 2) Inject the message into the worker's turn queue by starting a
      //    new user turn on its thread. The decider handles the "thread
      //    mid-turn" case via thread.turn-queued.
      await wsRequest("orchestration.dispatchCommand", {
        command: {
          type: "thread.turn.start",
          commandId: crypto.randomUUID(),
          threadId: targetWorker.threadId,
          message: {
            messageId: crypto.randomUUID(),
            role: "user",
            text: message,
            attachments: [],
          },
          dispatchMode: "queue",
          assistantDeliveryMode: "buffered",
          createdAt: new Date().toISOString(),
        },
      });
      return JSON.stringify({
        queued: true,
        messageId,
        workerId: targetWorkerId,
        deliveredVia: "thread.turn.start",
      });
    } catch (error) {
      return JSON.stringify({
        queued: false,
        messageId,
        workerId: targetWorkerId,
        dispatchError: serializeWsError(error),
      });
    }
  }

  if (toolName === "orchestrate_get_agent_logs") {
    // Gap I: expose the activity tail to the Codex orchestrator via MCP.
    const workerId = String(args.workerId ?? args.agent_id ?? args.agentId ?? "");
    if (!workerId) {
      return JSON.stringify({ error: "workerId is required" });
    }
    const worker = await findWorker(workerId);
    if (!worker) {
      return JSON.stringify({ workerId, entries: [] });
    }
    const thread = worker.threadId ? await findThread(worker.threadId) : undefined;
    const activities = thread?.activities ?? [];
    const tail = typeof args.tail === "number" ? Math.max(1, Math.min(500, args.tail)) : 50;
    const since = typeof args.since === "string" ? Date.parse(args.since) : NaN;
    const filtered = Number.isFinite(since)
      ? activities.filter((a: any) => Date.parse(a.createdAt) >= since)
      : activities;
    const windowed = filtered.slice(-tail);
    const entries = windowed.map((a: any) => ({
      timestamp: a.createdAt,
      level: a.tone === "error" ? "error" : a.tone === "approval" ? "warn" : "info",
      message: a.summary,
    }));
    return JSON.stringify({ workerId, agentId: workerId, entries });
  }

  if (toolName === "orchestrate_wait_agent") {
    const workerId = String(args.workerId ?? args.agent_id ?? args.agentId ?? "");
    const timeoutMs = Math.max(1000, Math.min(600000, Number(args.timeout ?? 120000)));
    if (!workerId) {
      return JSON.stringify({ error: "workerId is required" });
    }
    const deadline = Date.now() + timeoutMs;
    let lastStatus: string | undefined;
    let lastTurnId: string | undefined;
    let stableIdleChecks = 0;
    while (Date.now() < deadline) {
      const worker = await findWorker(workerId);
      if (!worker) {
        await sleep(750);
        continue;
      }
      lastStatus = worker.status;
      // Any explicit terminal status — return immediately.
      if (
        worker.status === "submitted" ||
        worker.status === "terminated" ||
        worker.status === "stuck" ||
        worker.status === "accepted" ||
        worker.status === "rejected"
      ) {
        const thread = worker.threadId ? await findThread(worker.threadId) : undefined;
        return JSON.stringify({
          workerId,
          status: worker.status,
          threadId: worker.threadId,
          taskId: worker.activeTaskId ?? worker.taskId ?? null,
          latestActivity: thread?.activities?.at?.(-1)?.summary ?? null,
          timedOut: false,
        });
      }
      // Soft completion: worker has produced at least one completed turn and
      // neither its session nor a subprocess is currently executing. We
      // DELIBERATELY ignore the `worker.status` field here because the worker
      // projection today doesn't transition "running" back to "idle" when a
      // turn finishes — the turn lifecycle lives on the session instead.
      const thread = worker.threadId ? await findThread(worker.threadId) : undefined;
      const turnId = thread?.latestTurn?.turnId;
      const turnCompleted = Boolean(thread?.latestTurn?.completedAt);
      const sessionBusy =
        thread?.session?.status === "running" ||
        thread?.session?.status === "connecting" ||
        thread?.session?.hasRunningSubprocess === true;
      if (turnCompleted && !sessionBusy) {
        if (turnId && turnId === lastTurnId) {
          stableIdleChecks += 1;
        } else {
          stableIdleChecks = 0;
          lastTurnId = turnId;
        }
        if (stableIdleChecks >= 1) {
          return JSON.stringify({
            workerId,
            status: worker.status,
            threadId: worker.threadId,
            taskId: worker.activeTaskId ?? worker.taskId ?? null,
            latestTurnId: turnId ?? null,
            latestActivity: thread?.activities?.at?.(-1)?.summary ?? null,
            sessionStatus: thread?.session?.status ?? null,
            hasRunningSubprocess: thread?.session?.hasRunningSubprocess ?? null,
            timedOut: false,
            note:
              "Worker's latest turn completed and its session is no longer running. " +
              "The projection keeps `status: running` until a terminal command is dispatched, " +
              "so use `orchestrate_review_agent_work`, then `orchestrate_accept_work` or " +
              "`orchestrate_reject_work` to advance the task.",
          });
        }
      } else {
        stableIdleChecks = 0;
      }
      await sleep(1500);
    }
    return JSON.stringify({
      workerId,
      status: lastStatus ?? "unknown",
      timedOut: true,
    });
  }

  if (toolName === "orchestrate_wait_all") {
    const timeoutMs = Math.max(1000, Math.min(600000, Number(args.timeout ?? 180000)));
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const snap = await wsRequest("orchestration.getSnapshot");
      const active = (snap.orchestratorWorkers ?? []).filter((w: any) =>
        ["running", "idle", "submitted"].includes(w.status) === false
          ? false
          : w.status === "running",
      );
      if (active.length === 0) {
        return JSON.stringify({
          timedOut: false,
          remaining: 0,
        });
      }
      await sleep(2000);
    }
    return JSON.stringify({ timedOut: true });
  }

  if (toolName === "orchestrate_review_agent_work") {
    const workerId = String(args.workerId ?? args.agent_id ?? args.agentId ?? "");
    if (!workerId) {
      return JSON.stringify({ error: "workerId is required" });
    }
    const worker = await findWorker(workerId);
    if (!worker) {
      return JSON.stringify({ workerId, error: "worker not found" });
    }
    const thread = worker.threadId ? await findThread(worker.threadId) : undefined;
    const latestTurnId = thread?.latestTurn?.turnId;
    let diffSummary: any = null;
    if (latestTurnId && worker.threadId) {
      try {
        diffSummary = await wsRequest("orchestration.getTurnDiff", {
          threadId: worker.threadId,
          turnId: latestTurnId,
        });
      } catch {
        diffSummary = null;
      }
    }
    return JSON.stringify({
      workerId,
      status: worker.status,
      threadId: worker.threadId,
      taskId: worker.activeTaskId ?? worker.taskId ?? null,
      latestActivity: thread?.activities?.at?.(-1) ?? null,
      latestTurn: thread?.latestTurn ?? null,
      diff: diffSummary,
    });
  }

  if (toolName === "orchestrate_accept_work") {
    const workerId = String(args.workerId ?? args.agent_id ?? args.agentId ?? "");
    if (!workerId) {
      return JSON.stringify({ error: "workerId is required" });
    }
    const worker = await findWorker(workerId);
    const taskId =
      typeof args.taskId === "string" && args.taskId.length > 0
        ? args.taskId
        : (worker?.activeTaskId ?? worker?.taskId);
    if (!worker || !taskId) {
      return JSON.stringify({
        workerId,
        error: "worker or task not found",
        workerFound: Boolean(worker),
        taskId: taskId ?? null,
      });
    }
    try {
      // accept requires the task to be in "submitted" status. The projection
      // doesn't auto-submit on worker turn completion (yet), so we submit on
      // the worker's behalf here before accepting. Submit is idempotent from
      // the orchestrator's perspective — if the task is already submitted the
      // command will be a no-op at the invariant layer.
      try {
        await wsRequest("orchestration.dispatchCommand", {
          command: {
            type: "orchestrator.task.submit",
            commandId: crypto.randomUUID(),
            taskId,
            workerId,
            summary:
              typeof args.summary === "string" ? args.summary : "Auto-submitted prior to accept",
            createdAt: new Date().toISOString(),
          },
        });
      } catch {
        // If submit fails (e.g. already submitted), continue — accept will
        // either succeed or report its own invariant error.
      }
      await wsRequest("orchestration.dispatchCommand", {
        command: {
          type: "orchestrator.task.accept",
          commandId: crypto.randomUUID(),
          taskId,
          workerId,
          reason: typeof args.reason === "string" ? args.reason : "Accepted by orchestrator",
          createdAt: new Date().toISOString(),
        },
      });
      return JSON.stringify({ accepted: true, workerId, taskId });
    } catch (error) {
      return JSON.stringify({
        accepted: false,
        workerId,
        taskId,
        dispatchError: serializeWsError(error),
      });
    }
  }

  if (toolName === "orchestrate_reject_work") {
    const workerId = String(args.workerId ?? args.agent_id ?? args.agentId ?? "");
    const reason = String(args.reason ?? "Rejected by orchestrator");
    const instructions = String(args.instructions ?? "");
    if (!workerId) {
      return JSON.stringify({ error: "workerId is required" });
    }
    const worker = await findWorker(workerId);
    const taskId =
      typeof args.taskId === "string" && args.taskId.length > 0
        ? args.taskId
        : (worker?.activeTaskId ?? worker?.taskId);
    if (!worker || !taskId) {
      return JSON.stringify({
        workerId,
        error: "worker or task not found",
        workerFound: Boolean(worker),
        taskId: taskId ?? null,
      });
    }
    try {
      // reject also needs the task in "submitted" status per invariants.
      // Gap L1: do NOT pass a synthetic summary — leaving submitSummary
      // missing preserves the fact that the worker never produced a real
      // report, rather than overwriting it with a filler string.
      try {
        await wsRequest("orchestration.dispatchCommand", {
          command: {
            type: "orchestrator.task.submit",
            commandId: crypto.randomUUID(),
            taskId,
            workerId,
            createdAt: new Date().toISOString(),
          },
        });
      } catch {
        // Already submitted / invariant block — continue to the reject.
      }
      await wsRequest("orchestration.dispatchCommand", {
        command: {
          type: "orchestrator.task.reject",
          commandId: crypto.randomUUID(),
          taskId,
          workerId,
          reason,
          reworkInstructions: instructions,
          createdAt: new Date().toISOString(),
        },
      });
      return JSON.stringify({ rejected: true, workerId, taskId, reason });
    } catch (error) {
      return JSON.stringify({
        rejected: false,
        workerId,
        taskId,
        dispatchError: serializeWsError(error),
      });
    }
  }

  if (toolName === "orchestrate_focus_agent" || toolName === "orchestrate_promote_to_foreground") {
    const workerId = String(args.workerId ?? args.agent_id ?? args.agentId ?? "");
    if (!workerId) {
      return JSON.stringify({ error: "workerId is required" });
    }
    const worker = await findWorker(workerId);
    if (!worker) {
      return JSON.stringify({ workerId, error: "worker not found" });
    }
    return JSON.stringify({
      workerId,
      threadId: worker.threadId,
      visibility: "foreground",
      note: "UI will auto-focus spawned/updated agent threads via domain events.",
    });
  }

  if (toolName === "orchestrate_terminate_agent") {
    const workerId = String(args.workerId ?? args.agent_id ?? args.agentId ?? "");
    const reason = String(args.reason ?? "Terminated by orchestrator");
    if (!workerId) {
      return JSON.stringify({ error: "workerId is required" });
    }
    await wsRequest("orchestration.dispatchCommand", {
      command: {
        type: "orchestrator.worker.terminate",
        commandId: crypto.randomUUID(),
        workerId,
        reason,
        createdAt: new Date().toISOString(),
      },
    }).catch(() => undefined);
    return JSON.stringify({ terminated: true, workerId, reason });
  }

  // Generic fallback — clearly signal the tool isn't wired yet so the
  // orchestrator knows to try a different approach instead of waiting
  // on a ghost response.
  return JSON.stringify({
    status: "unimplemented",
    tool: toolName,
    args,
    note: "This orchestration tool is not yet implemented in the MCP server. Use a combination of orchestrate_spawn_agent, orchestrate_wait_agent, orchestrate_get_agent_status, orchestrate_review_agent_work, orchestrate_accept_work, orchestrate_reject_work, and orchestrate_terminate_agent to manage agents.",
  });
}

// Create MCP server
const server = new Server(
  { name: "orchestrate", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

function serializeErrorForTool(error: unknown): string {
  if (error instanceof Error) {
    return JSON.stringify({
      error: error.message,
      name: error.name,
      ...(error.stack ? { stack: error.stack.split("\n").slice(0, 6).join("\n") } : {}),
    });
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message =
      typeof record.message === "string"
        ? record.message
        : typeof record._tag === "string"
          ? `${record._tag}`
          : JSON.stringify(record);
    return JSON.stringify({
      error: message,
      payload: record,
    });
  }
  return JSON.stringify({ error: String(error) });
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await executeOrchestrationTool(name, args ?? {});
    return { content: [{ type: "text", text: result }] };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: serializeErrorForTool(error),
        },
      ],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
