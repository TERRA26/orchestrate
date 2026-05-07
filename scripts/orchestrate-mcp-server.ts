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

function truncateText(value: unknown, maxLength: number): unknown {
  if (typeof value !== "string" || value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}\n...[truncated ${value.length - maxLength} chars]`;
}

function summarizeBrowserTarget(target: unknown): unknown {
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    return target;
  }
  const record = target as Record<string, unknown>;
  return {
    ...record,
    ...(typeof record.text === "string" ? { text: truncateText(record.text, 240) } : {}),
    ...(typeof record.label === "string" ? { label: truncateText(record.label, 240) } : {}),
    ...(typeof record.name === "string" ? { name: truncateText(record.name, 240) } : {}),
  };
}

function browserVisualWarnings(observation: any): string[] {
  const haystack = [
    observation?.title,
    observation?.textSummary,
    observation?.ariaSnapshot,
    ...(Array.isArray(observation?.targets)
      ? observation.targets.map((target: any) =>
          [target?.text, target?.label, target?.name].filter(Boolean).join(" "),
        )
      : []),
  ]
    .filter((value): value is string => typeof value === "string")
    .join("\n")
    .toLowerCase();

  const warnings: string[] = [];
  if (haystack.includes("something went wrong")) {
    warnings.push(
      "Visible page reports 'Something went wrong'; do not claim media playback succeeded.",
    );
  }
  if (haystack.includes("try searching to get started")) {
    warnings.push("Visible page is still the YouTube home/search-start screen, not a watch page.");
  }
  if (haystack.includes("sign in to like videos")) {
    warnings.push(
      "Visible page is unauthenticated YouTube shell; verify player state from screenshot.",
    );
  }
  return warnings;
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
    name: "orchestrate_send_update_to_orchestrator",
    description:
      "Worker → orchestrator turn-end signal. Workers MUST call this at the end of every NON-final turn. " +
      "On the final turn, end the assistant message with a `## REPORT` block instead (no submit tool exists — the REPORT block is parsed server-side). " +
      "Statuses: `in-progress` (continuing next turn), `needs-input` (waiting on a clarification — set `question`), " +
      "`ready-for-review` (work is done; final REPORT block follows in the same or next turn), `blocked` (cannot proceed — set `blockedReason`). " +
      "Without this call the orchestrator sees only your tool calls and diffs — it has no way to know you're waiting on a reply.",
    inputSchema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["in-progress", "needs-input", "ready-for-review", "blocked"],
        },
        summary: {
          type: "string",
          description: "One-sentence account of what you did or learned this turn.",
        },
        question: {
          type: "string",
          description:
            "Concrete question for the orchestrator (only set when status is 'needs-input').",
        },
        nextStep: {
          type: "string",
          description: "What you plan to do on the next turn once unblocked.",
        },
        blockedReason: {
          type: "string",
          description: "Why you cannot proceed (only set when status is 'blocked').",
        },
      },
      required: ["status", "summary"],
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
  {
    name: "orchestrate_open_browser_preview",
    description:
      "Open the built-in browser preview as a visible side panel for the orchestrator thread",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "Optional preview URL to open, for example http://localhost:5733/",
        },
        threadId: {
          type: "string",
          description:
            "Optional thread id whose browser panel should open. Defaults to the current orchestrator thread.",
        },
      },
    },
  },
  {
    name: "orchestrate_browser_open_session",
    description:
      "Open an automated browser session and return a screenshot-backed observation with URL, title, text summary, ARIA snapshot, and interactive targets.",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "URL to open, for example https://example.com" },
        viewportWidth: { type: "number", description: "Optional viewport width in pixels" },
        viewportHeight: { type: "number", description: "Optional viewport height in pixels" },
        includeScreenshot: {
          type: "boolean",
          description:
            "Deprecated. A compact screenshot proof is always returned; full screenshot data URLs are omitted from tool text to keep the thread parseable.",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "orchestrate_browser_act",
    description:
      "Act in an existing automated browser session, then return a fresh screenshot-backed observation. Supports navigate, click, type, press, scroll, wait, resize, waitFor, and evaluate actions.",
    inputSchema: {
      type: "object" as const,
      properties: {
        sessionId: { type: "string", description: "Browser automation session id" },
        action: {
          type: "object" as const,
          description:
            "Browser action object. Supported shapes: {kind:'navigate', url}, {kind:'click', targetId}, {kind:'type', targetId, text, clearFirst?}, {kind:'press', key}, {kind:'scroll', direction:'up'|'down', amount}, {kind:'wait', ms}, {kind:'resize', width, height}, {kind:'waitFor', text?, textGone?, timeout?}, {kind:'evaluate', expression}. For scroll, use direction+amount; deltaY/y aliases are normalized.",
        },
        includeScreenshot: {
          type: "boolean",
          description:
            "Deprecated. A compact screenshot proof is always returned; full screenshot data URLs are omitted from tool text to keep the thread parseable.",
        },
      },
      required: ["sessionId", "action"],
    },
  },
  {
    name: "orchestrate_browser_close_session",
    description: "Close an automated browser session",
    inputSchema: {
      type: "object" as const,
      properties: { sessionId: { type: "string" } },
      required: ["sessionId"],
    },
  },
  {
    name: "orchestrate_browser_list_annotations",
    description:
      "List user-created browser annotations/comments for this orchestrator thread. Use these as high-priority visual feedback before acting in the browser.",
    inputSchema: {
      type: "object" as const,
      properties: {
        threadId: {
          type: "string",
          description:
            "Optional thread id. Defaults to the current orchestrator thread when available.",
        },
        sessionId: {
          type: "string",
          description: "Optional automated browser session id to filter annotations.",
        },
      },
    },
  },
];

// ORC-188 + ORC-002: read the auth token AND the parent thread id from
// a same-user-only file when available so we never have to keep them in
// env. The parent process writes a 0o600 JSON envelope and passes its
// path; we read the contents once and unlink the file. Caching at module
// load time means a single read covers all subsequent reconnects.
interface SpawnEnvelope {
  readonly token?: string;
  readonly parentThreadId?: string;
}

function consumeMcpSpawnFile(filePath: string): SpawnEnvelope | undefined {
  try {
    const fs = require("node:fs") as typeof import("node:fs");
    const contents = fs.readFileSync(filePath, "utf8");
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Best-effort cleanup; the file is mode 0o600 either way.
    }
    const trimmed = contents.trim();
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed) as { token?: unknown; parentThreadId?: unknown };
        if (parsed && typeof parsed === "object") {
          return {
            ...(typeof parsed.token === "string" && parsed.token.length > 0
              ? { token: parsed.token }
              : {}),
            ...(typeof parsed.parentThreadId === "string" && parsed.parentThreadId.length > 0
              ? { parentThreadId: parsed.parentThreadId }
              : {}),
          };
        }
      } catch {
        // fall through to legacy plain-text interpretation
      }
    }
    return trimmed.length > 0 ? { token: trimmed } : undefined;
  } catch {
    return undefined;
  }
}

function resolveSpawnEnvelope(env: NodeJS.ProcessEnv): SpawnEnvelope {
  const filePath = env.ORCHESTRATE_AUTH_TOKEN_FILE;
  if (filePath && filePath.length > 0) {
    const fromFile = consumeMcpSpawnFile(filePath);
    if (fromFile) {
      return fromFile;
    }
  }
  const directToken = env.ORCHESTRATE_AUTH_TOKEN;
  const directParent = env.ORCHESTRATE_PARENT_THREAD_ID;
  return {
    ...(directToken && directToken.length > 0 ? { token: directToken } : {}),
    ...(directParent && directParent.length > 0 ? { parentThreadId: directParent } : {}),
  };
}

// Cached at module load. Subsequent reconnects use the cached values
// because the file has been unlinked.
const SPAWN_ENVELOPE = resolveSpawnEnvelope(process.env);

function resolveOrchestrateAuthToken(env: NodeJS.ProcessEnv): string | undefined {
  // Prefer the cached envelope value when available; fall back to env
  // for callers that pass a fresh env (mostly tests).
  if (env === process.env && SPAWN_ENVELOPE.token) {
    return SPAWN_ENVELOPE.token;
  }
  return resolveSpawnEnvelope(env).token;
}

function resolveOrchestrateParentThreadId(env: NodeJS.ProcessEnv): string | undefined {
  if (env === process.env && SPAWN_ENVELOPE.parentThreadId) {
    return SPAWN_ENVELOPE.parentThreadId;
  }
  return resolveSpawnEnvelope(env).parentThreadId;
}

// The MCP server connects back to our orchestration WebSocket server to execute tools.
export function buildOrchestrationWsUrls(env: NodeJS.ProcessEnv): ReadonlyArray<string> {
  const authToken = resolveOrchestrateAuthToken(env);
  const withAuth = (baseUrl: string): string => {
    if (!authToken) {
      return baseUrl;
    }

    const url = new URL(baseUrl);
    url.searchParams.set("token", authToken);
    return url.toString();
  };

  if (env.ORCHESTRATE_WS_PORT !== undefined) {
    return [withAuth(`ws://localhost:${env.ORCHESTRATE_WS_PORT}`)];
  }

  return [withAuth("ws://localhost:3773"), withAuth("ws://localhost:3774")];
}

const ORCH_WS_URLS = buildOrchestrationWsUrls(process.env);

export function redactOrchestrationWsUrlForLog(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("token");
    return parsed.toString();
  } catch {
    return url.replace(/([?&]token=)[^&]*/i, "$1<redacted>");
  }
}

export function buildMcpBootDiagnostic(env: NodeJS.ProcessEnv): string {
  return [
    "orchestrate-mcp-server loaded",
    `port=${env.ORCHESTRATE_WS_PORT ?? "fallback"}`,
    `auth=${env.ORCHESTRATE_AUTH_TOKEN_FILE || env.ORCHESTRATE_AUTH_TOKEN ? "present" : "missing"}`,
    `parentThread=${env.ORCHESTRATE_PARENT_THREAD_ID ? "present" : "missing"}`,
  ].join("; ");
}

export function buildMcpConnectionFailureMessage(
  error: Error,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return `${error.message}; ${buildMcpBootDiagnostic(env)}`;
}

export function buildOrchestrationConnectionFallbackError(url: string | undefined): Error {
  return new Error(
    `Cannot connect to orchestration server at ${redactOrchestrationWsUrlForLog(url ?? "unknown")}`,
  );
}

let wsConnection: WebSocket | null = null;
let wsRequestId = 0;
const wsPending = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>();

async function ensureWs(): Promise<WebSocket> {
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) return wsConnection;
  let lastError: Error | null = null;
  for (const url of ORCH_WS_URLS) {
    try {
      return await connectWs(url);
    } catch (error) {
      const redactedUrl = redactOrchestrationWsUrlForLog(url);
      lastError =
        error instanceof Error
          ? error
          : new Error(`Cannot connect to orchestration server at ${redactedUrl}`);
    }
  }
  throw new Error(
    buildMcpConnectionFailureMessage(
      lastError ?? buildOrchestrationConnectionFallbackError(ORCH_WS_URLS[0]),
    ),
  );
}

function connectWs(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => {
      wsConnection = ws;
      resolve(ws);
    };
    ws.onerror = () =>
      reject(
        new Error(
          `Cannot connect to orchestration server at ${redactOrchestrationWsUrlForLog(url)}`,
        ),
      );
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.id && wsPending.has(String(msg.id))) {
          const p = wsPending.get(String(msg.id))!;
          wsPending.delete(String(msg.id));
          if (msg.error) {
            p.reject(msg.error);
          } else {
            p.resolve(msg.result);
          }
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

export function summarizeBrowserObservation(observation: any, includeScreenshot: boolean): any {
  if (!observation || typeof observation !== "object") return observation;
  void includeScreenshot;
  const screenshotDataUrl =
    typeof observation.screenshotDataUrl === "string" ? observation.screenshotDataUrl : undefined;
  const previewScreenshotDataUrl =
    typeof observation.previewScreenshotDataUrl === "string"
      ? observation.previewScreenshotDataUrl
      : undefined;
  const fullPageScreenshotDataUrl =
    typeof observation.fullPageScreenshotDataUrl === "string"
      ? observation.fullPageScreenshotDataUrl
      : undefined;
  return {
    sessionId: observation.sessionId,
    url: observation.url,
    title: observation.title,
    readyState: observation.readyState,
    textSummary: truncateText(observation.textSummary, 4_000),
    ariaSnapshot: truncateText(observation.ariaSnapshot, 6_000),
    visualWarnings: browserVisualWarnings(observation),
    targets: Array.isArray(observation.targets)
      ? observation.targets.slice(0, 50).map(summarizeBrowserTarget)
      : [],
    consoleErrors: Array.isArray(observation.consoleErrors)
      ? observation.consoleErrors.slice(0, 20)
      : [],
    networkErrors: Array.isArray(observation.networkErrors)
      ? observation.networkErrors.slice(0, 20)
      : [],
    pageMetrics: observation.pageMetrics,
    navigationError: observation.navigationError,
    evaluateResult: observation.evaluateResult,
    observedAt: observation.observedAt,
    screenshot: {
      present: Boolean(screenshotDataUrl),
      bytes: screenshotDataUrl ? Buffer.byteLength(screenshotDataUrl) : 0,
      previewDataUrl: previewScreenshotDataUrl,
      previewBytes: previewScreenshotDataUrl ? Buffer.byteLength(previewScreenshotDataUrl) : 0,
    },
    fullPageScreenshot: {
      present: Boolean(fullPageScreenshotDataUrl),
      bytes: fullPageScreenshotDataUrl ? Buffer.byteLength(fullPageScreenshotDataUrl) : 0,
    },
  };
}

function normalizeBrowserAction(action: Record<string, unknown>): Record<string, unknown> {
  if (action.kind !== "scroll") {
    return action;
  }
  const direction = action.direction;
  const amount = action.amount;
  if ((direction === "up" || direction === "down") && typeof amount === "number") {
    return action;
  }

  const rawDelta =
    typeof action.deltaY === "number"
      ? action.deltaY
      : typeof action.y === "number"
        ? action.y
        : undefined;
  if (typeof rawDelta !== "number" || !Number.isFinite(rawDelta) || rawDelta === 0) {
    return action;
  }
  return {
    ...action,
    direction: rawDelta < 0 ? "up" : "down",
    amount: Math.min(4_000, Math.max(1, Math.round(Math.abs(rawDelta)))),
  };
}

export function buildWorkerFollowUpTurnStartCommand({
  message,
  targetThread,
}: {
  message: string;
  targetThread: Record<string, any>;
}): Record<string, unknown> {
  return {
    type: "thread.turn.start",
    commandId: crypto.randomUUID(),
    threadId: targetThread.id,
    message: {
      messageId: crypto.randomUUID(),
      role: "user",
      text: message,
      attachments: [],
    },
    dispatchMode: "queue",
    assistantDeliveryMode: "buffered",
    runtimeMode: targetThread.runtimeMode ?? "full-access",
    interactionMode: targetThread.interactionMode ?? "default",
    createdAt: new Date().toISOString(),
  };
}

async function executeOrchestrationTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  // Always fetch the snapshot — we need projectId and other fields from the
  // orchestrator thread even when the env var or sidecar provides the threadId.
  const snapshot = await wsRequest("orchestration.getSnapshot");
  // ORC-002: prefer the parent thread id from the same-user-only spawn
  // envelope (file-based), falling back to env then sidecar. The file
  // path was already unlinked at module load; SPAWN_ENVELOPE is the
  // cached value.
  const envelopeThreadId = resolveOrchestrateParentThreadId(process.env);
  const sidecarThreadId = envelopeThreadId ? undefined : readOrchestratorThreadIdFromSidecar();
  const resolvedThreadId = envelopeThreadId ?? sidecarThreadId;
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
    const targetThread = targetWorker.threadId
      ? await findThread(targetWorker.threadId)
      : undefined;
    if (!targetThread) {
      return JSON.stringify({ error: `Agent ${targetWorkerId} has no target thread.` });
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
        command: buildWorkerFollowUpTurnStartCommand({ message, targetThread }),
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
        retryable: true,
        note:
          "The worker did not acknowledge the queued turn before the dispatch timeout. " +
          "Do not assume delivery; retry or paste the instruction into the worker pane.",
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
    const sawFileChange = windowed.some((a: any) => a.summary === "File change");
    const checkpoints = thread?.checkpoints ?? [];
    const latestCheckpoint = checkpoints[checkpoints.length - 1];
    const filesChanged = Array.isArray(latestCheckpoint?.files) ? latestCheckpoint.files.length : 0;
    return JSON.stringify({
      workerId,
      agentId: workerId,
      entries,
      warning:
        sawFileChange && filesChanged === 0
          ? "Recent activity includes provider-reported file-change events, but the latest checkpoint has no changed files. Verify with orchestrate_get_agent_diff before accepting work."
          : null,
    });
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
            awaitingInstruction: worker.status === "running",
            needsSubmission: worker.status === "running",
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

  if (toolName === "orchestrate_open_browser_preview") {
    const targetThreadId =
      typeof args.threadId === "string" && args.threadId.trim().length > 0
        ? args.threadId.trim()
        : threadId;
    if (!targetThreadId || targetThreadId === "unknown") {
      return JSON.stringify({ opened: false, error: "Could not resolve an orchestrator thread." });
    }
    const url =
      typeof args.url === "string" && args.url.trim().length > 0 ? args.url.trim() : undefined;
    const result = await wsRequest("browser.openPreview", {
      threadId: targetThreadId,
      ...(url ? { url } : {}),
    });
    return JSON.stringify({
      opened: true,
      threadId: targetThreadId,
      url: url ?? null,
      focused: true,
      reusedExistingSession: true,
      result,
    });
  }

  if (toolName === "orchestrate_browser_open_session") {
    const url = typeof args.url === "string" && args.url.trim().length > 0 ? args.url.trim() : "";
    if (!url) {
      return JSON.stringify({ error: "url is required" });
    }
    const viewportWidth =
      typeof args.viewportWidth === "number" && Number.isFinite(args.viewportWidth)
        ? args.viewportWidth
        : undefined;
    const viewportHeight =
      typeof args.viewportHeight === "number" && Number.isFinite(args.viewportHeight)
        ? args.viewportHeight
        : undefined;
    const includeScreenshot = args.includeScreenshot === true;
    const result = await wsRequest("browser.openSession", {
      ...(threadId && threadId !== "unknown" ? { threadId } : {}),
      url,
      ...(viewportWidth ? { viewportWidth } : {}),
      ...(viewportHeight ? { viewportHeight } : {}),
    });
    return JSON.stringify({
      sessionId: result.sessionId,
      observation: summarizeBrowserObservation(result.observation, includeScreenshot),
    });
  }

  if (toolName === "orchestrate_browser_act") {
    const sessionId =
      typeof args.sessionId === "string" && args.sessionId.trim().length > 0
        ? args.sessionId.trim()
        : "";
    if (!sessionId) {
      return JSON.stringify({ error: "sessionId is required" });
    }
    if (!args.action || typeof args.action !== "object" || Array.isArray(args.action)) {
      return JSON.stringify({ error: "action object is required" });
    }
    const includeScreenshot = args.includeScreenshot === true;
    const result = await wsRequest("browser.act", {
      ...(threadId && threadId !== "unknown" ? { threadId } : {}),
      sessionId,
      action: normalizeBrowserAction(args.action as Record<string, unknown>),
    });
    return JSON.stringify({
      sessionId,
      observation: summarizeBrowserObservation(result.observation, includeScreenshot),
    });
  }

  if (toolName === "orchestrate_browser_close_session") {
    const sessionId =
      typeof args.sessionId === "string" && args.sessionId.trim().length > 0
        ? args.sessionId.trim()
        : "";
    if (!sessionId) {
      return JSON.stringify({ error: "sessionId is required" });
    }
    const result = await wsRequest("browser.closeSession", { sessionId });
    return JSON.stringify({ closed: true, sessionId, result });
  }

  if (toolName === "orchestrate_browser_list_annotations") {
    const targetThreadId =
      typeof args.threadId === "string" && args.threadId.trim().length > 0
        ? args.threadId.trim()
        : threadId;
    if (!targetThreadId || targetThreadId === "unknown") {
      return JSON.stringify({
        annotations: [],
        error: "Could not resolve an orchestrator thread.",
      });
    }
    const sessionId =
      typeof args.sessionId === "string" && args.sessionId.trim().length > 0
        ? args.sessionId.trim()
        : undefined;
    const result = await wsRequest("browser.listAnnotations", {
      threadId: targetThreadId,
      ...(sessionId ? { sessionId } : {}),
    });
    return JSON.stringify(result);
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

if ((import.meta as ImportMeta & { readonly main?: boolean }).main === true) {
  console.error(buildMcpBootDiagnostic(process.env));
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
