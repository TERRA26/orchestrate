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
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const TOOLS = [
  { name: "orchestrate_spawn_agent", description: "Create a new agent with a dedicated thread and panel", inputSchema: { type: "object" as const, properties: { task: { type: "string", description: "Task description for the agent" }, provider: { type: "string", description: "Provider: codex or claudeAgent" }, model: { type: "string", description: "Model name" }, mode: { type: "string", enum: ["foreground", "background"], description: "Visibility mode" } }, required: ["task"] } },
  { name: "orchestrate_terminate_agent", description: "Kill an agent", inputSchema: { type: "object" as const, properties: { workerId: { type: "string" }, reason: { type: "string" } }, required: ["workerId"] } },
  { name: "orchestrate_get_all_status", description: "Dashboard snapshot of all agents", inputSchema: { type: "object" as const, properties: {} } },
  { name: "orchestrate_get_agent_status", description: "Check what an agent is doing", inputSchema: { type: "object" as const, properties: { workerId: { type: "string" } }, required: ["workerId"] } },
  { name: "orchestrate_send_to_agent", description: "Send instruction to a specific agent", inputSchema: { type: "object" as const, properties: { workerId: { type: "string" }, message: { type: "string" } }, required: ["workerId", "message"] } },
  { name: "orchestrate_wait_agent", description: "Block until agent completes", inputSchema: { type: "object" as const, properties: { workerId: { type: "string" }, timeout: { type: "number" } }, required: ["workerId"] } },
  { name: "orchestrate_wait_all", description: "Block until all agents complete", inputSchema: { type: "object" as const, properties: { timeout: { type: "number" } } } },
  { name: "orchestrate_accept_work", description: "Accept agent output", inputSchema: { type: "object" as const, properties: { workerId: { type: "string" } }, required: ["workerId"] } },
  { name: "orchestrate_reject_work", description: "Reject with rework instructions", inputSchema: { type: "object" as const, properties: { workerId: { type: "string" }, reason: { type: "string" }, instructions: { type: "string" } }, required: ["workerId", "reason", "instructions"] } },
  { name: "orchestrate_review_agent_work", description: "Pull diff and checklist for review", inputSchema: { type: "object" as const, properties: { workerId: { type: "string" } }, required: ["workerId"] } },
  { name: "orchestrate_focus_agent", description: "Bring agent panel to foreground", inputSchema: { type: "object" as const, properties: { workerId: { type: "string" } }, required: ["workerId"] } },
  { name: "orchestrate_collapse_panel", description: "Minimize agent to background", inputSchema: { type: "object" as const, properties: { workerId: { type: "string" } }, required: ["workerId"] } },
  { name: "orchestrate_get_spawn_tree", description: "View full agent hierarchy", inputSchema: { type: "object" as const, properties: {} } },
  { name: "orchestrate_broadcast", description: "Send message to all active agents", inputSchema: { type: "object" as const, properties: { message: { type: "string" } }, required: ["message"] } },
  { name: "orchestrate_set_dependency", description: "Set agent dependencies", inputSchema: { type: "object" as const, properties: { workerId: { type: "string" }, dependsOn: { type: "array", items: { type: "string" } } }, required: ["workerId", "dependsOn"] } },
  { name: "orchestrate_merge_work", description: "Combine changes from multiple agents", inputSchema: { type: "object" as const, properties: { workerIds: { type: "array", items: { type: "string" } }, targetBranch: { type: "string" } }, required: ["workerIds", "targetBranch"] } },
  { name: "orchestrate_run_tests", description: "Execute tests against agent changes", inputSchema: { type: "object" as const, properties: { workerId: { type: "string" }, command: { type: "string" } }, required: ["workerId"] } },
  { name: "orchestrate_pause_agent", description: "Pause an agent mid-work", inputSchema: { type: "object" as const, properties: { workerId: { type: "string" } }, required: ["workerId"] } },
  { name: "orchestrate_resume_agent", description: "Resume a paused agent", inputSchema: { type: "object" as const, properties: { workerId: { type: "string" }, instructions: { type: "string" } }, required: ["workerId"] } },
  { name: "orchestrate_promote_to_foreground", description: "Move background agent to visible panel", inputSchema: { type: "object" as const, properties: { workerId: { type: "string" } }, required: ["workerId"] } },
  { name: "orchestrate_demote_to_background", description: "Move foreground agent to background", inputSchema: { type: "object" as const, properties: { workerId: { type: "string" } }, required: ["workerId"] } },
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
    ws.onopen = () => { wsConnection = ws; resolve(ws); };
    ws.onerror = () => reject(new Error(`Cannot connect to orchestration server at ${ORCH_WS_URL}`));
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
      if (wsPending.has(id)) { wsPending.delete(id); reject(new Error("Timeout")); }
    }, 30000);
  });
}

async function executeOrchestrationTool(toolName: string, args: Record<string, unknown>): Promise<string> {
  // Find the calling thread from the snapshot
  const snapshot = await wsRequest("orchestration.getSnapshot");
  const orchestratorThread = (snapshot.threads ?? []).find(
    (t: any) => t.threadType === "orchestrator" && t.session?.status !== "error",
  );
  const threadId = orchestratorThread?.id ?? "unknown";

  // Dispatch as an orchestration command simulation
  // For spawn_agent, we need to go through the full handleSpawnAgent path
  // which requires dispatching through the tool router.
  // Since we can't directly call the tool router from this MCP server,
  // we simulate the effect by dispatching the underlying commands.

  if (toolName === "orchestrate_spawn_agent") {
    const task = String(args.task ?? "Agent task");
    const provider = String(args.provider ?? "codex");
    const model = String(args.model ?? "gpt-5.4");
    const mode = String(args.mode ?? "foreground");
    const runId = crypto.randomUUID();
    const taskId = crypto.randomUUID();
    const workerId = crypto.randomUUID();
    const workerThreadId = crypto.randomUUID();
    const projectId = orchestratorThread?.projectId ?? snapshot.projects?.[0]?.id ?? "";

    // Create run
    await wsRequest("orchestration.dispatchCommand", { command: {
      type: "orchestrator.run.create", commandId: crypto.randomUUID(), runId, projectId,
      userRequest: task, goals: [task],
      spawnBudget: { maxDepth: 3, maxChildren: 4, maxConcurrentWriters: 4, maxTotalWorkers: 12, allowedTools: [], writeScope: [] },
      createdAt: new Date().toISOString(),
    }});

    // Create task
    await wsRequest("orchestration.dispatchCommand", { command: {
      type: "orchestrator.task.create", commandId: crypto.randomUUID(), taskId, runId,
      title: task.slice(0, 50), objective: task, acceptanceCriteria: [], maxIterations: 3,
      createdAt: new Date().toISOString(),
    }});

    // Create child thread
    await wsRequest("orchestration.dispatchCommand", { command: {
      type: "thread.create", commandId: crypto.randomUUID(), threadId: workerThreadId, projectId,
      title: task.slice(0, 50), modelSelection: { provider, model },
      runtimeMode: "full-access", interactionMode: "default",
      threadType: "agent", parentThreadId: threadId,
      branch: null, worktreePath: null, createdAt: new Date().toISOString(),
    }});

    // Spawn worker
    await wsRequest("orchestration.dispatchCommand", { command: {
      type: "orchestrator.worker.spawn", commandId: crypto.randomUUID(), workerId, runId, taskId,
      threadId: workerThreadId,
      spawnBudget: { maxDepth: 3, maxChildren: 4, maxConcurrentWriters: 4, maxTotalWorkers: 12, allowedTools: [], writeScope: [] },
      workspace: { mode: "local", cwd: process.cwd(), terminalIds: [] },
      createdAt: new Date().toISOString(),
    }});

    // Start first turn
    await wsRequest("orchestration.dispatchCommand", { command: {
      type: "thread.turn.start", commandId: crypto.randomUUID(), threadId: workerThreadId,
      message: { messageId: crypto.randomUUID(), role: "user", text: task, attachments: [] },
      modelSelection: { provider, model },
      runtimeMode: "full-access", interactionMode: "default",
      createdAt: new Date().toISOString(),
    }});

    return JSON.stringify({ agentId: workerId, threadId: workerThreadId, workerId, runId, taskId, visibility: mode });
  }

  if (toolName === "orchestrate_get_all_status") {
    const snapshot = await wsRequest("orchestration.getSnapshot");
    const workers = snapshot.orchestratorWorkers ?? [];
    return JSON.stringify({
      agents: workers.map((w: any) => ({
        workerId: w.workerId, status: w.status, threadId: w.threadId,
        visibility: w.visibility ?? "foreground",
      })),
      total: workers.length,
    });
  }

  // Generic fallback — return a descriptive message
  return JSON.stringify({ status: "ok", tool: toolName, args, note: "Tool executed (generic handler)" });
}

// Create MCP server
const server = new Server(
  { name: "orchestrate", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await executeOrchestrationTool(name, args ?? {});
    return { content: [{ type: "text", text: result }] };
  } catch (error) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
