import * as Http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { Effect, Exit, Layer, PubSub, Scope, Stream } from "effect";
import { describe, expect, it, afterEach, vi } from "vitest";
import { createServer } from "./wsServer";
import WebSocket from "ws";
import { deriveServerPaths, ServerConfig, type ServerConfigShape } from "./config";
import { makeServerProviderLayer, makeServerRuntimeServicesLayer } from "./serverLayers";
import { ProviderDiscoveryService } from "./provider/Services/ProviderDiscoveryService";
import { ServerSettingsService } from "./serverSettings";

import {
  ORCHESTRATION_WS_CHANNELS,
  ORCHESTRATION_WS_METHODS,
  ThreadId,
  TurnId,
  WS_CHANNELS,
  type WebSocketResponse,
  type ProviderRuntimeEvent,
  type ServerProvider,
  type WsPushChannel,
  type WsPushMessage,
  type WsPush,
} from "@orchestrate/contracts";
import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite";
import { ProviderService, type ProviderServiceShape } from "./provider/Services/ProviderService";
import { ProviderHealth, type ProviderHealthShape } from "./provider/Services/ProviderHealth";
import { Open } from "./open";
import { AnalyticsService } from "./telemetry/Services/AnalyticsService.ts";

const asThreadId = (value: string): ThreadId => ThreadId.makeUnsafe(value);
const asTurnId = (value: string): TurnId => TurnId.makeUnsafe(value);

// ---------------------------------------------------------------------------
// WebSocket test harness (same channel-based design as wsServer.test.ts)
// ---------------------------------------------------------------------------

interface MessageChannel<T> {
  queue: T[];
  waiters: Array<{
    resolve: (value: T) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout> | null;
  }>;
}

interface SocketChannels {
  push: MessageChannel<WsPush>;
  response: MessageChannel<WebSocketResponse>;
}

const channelsBySocket = new WeakMap<WebSocket, SocketChannels>();

function enqueue<T>(channel: MessageChannel<T>, item: T) {
  const waiter = channel.waiters.shift();
  if (waiter) {
    if (waiter.timeoutId !== null) clearTimeout(waiter.timeoutId);
    waiter.resolve(item);
    return;
  }
  channel.queue.push(item);
}

function dequeue<T>(channel: MessageChannel<T>, timeoutMs: number): Promise<T> {
  const queued = channel.queue.shift();
  if (queued !== undefined) {
    return Promise.resolve(queued);
  }
  return new Promise((resolve, reject) => {
    const waiter = {
      resolve,
      reject,
      timeoutId: setTimeout(() => {
        const index = channel.waiters.indexOf(waiter);
        if (index >= 0) channel.waiters.splice(index, 1);
        reject(new Error(`Timed out waiting for WebSocket message after ${timeoutMs}ms`));
      }, timeoutMs) as ReturnType<typeof setTimeout>,
    };
    channel.waiters.push(waiter);
  });
}

function isWsPushEnvelope(message: unknown): message is WsPush {
  if (typeof message !== "object" || message === null) return false;
  if (!("type" in message) || !("channel" in message)) return false;
  return (message as { type?: unknown }).type === "push";
}

function asWebSocketResponse(message: unknown): WebSocketResponse | null {
  if (typeof message !== "object" || message === null) return null;
  if (!("id" in message)) return null;
  const id = (message as { id?: unknown }).id;
  if (typeof id !== "string") return null;
  return message as WebSocketResponse;
}

function connectWsOnce(port: number, token?: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const query = token ? `?token=${encodeURIComponent(token)}` : "";
    const ws = new WebSocket(`ws://127.0.0.1:${port}/${query}`);
    const channels: SocketChannels = {
      push: { queue: [], waiters: [] },
      response: { queue: [], waiters: [] },
    };
    channelsBySocket.set(ws, channels);

    ws.on("message", (raw) => {
      const parsed = JSON.parse(String(raw));
      if (isWsPushEnvelope(parsed)) {
        enqueue(channels.push, parsed);
      } else {
        const response = asWebSocketResponse(parsed);
        if (response) {
          enqueue(channels.response, response);
        }
      }
    });

    ws.once("open", () => resolve(ws));
    ws.once("error", () => reject(new Error("WebSocket connection failed")));
  });
}

async function connectWs(port: number, token?: string, attempts = 5): Promise<WebSocket> {
  let lastError: unknown = new Error("WebSocket connection failed");
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await connectWsOnce(port, token);
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
  }
  throw lastError;
}

async function connectAndAwaitWelcome(
  port: number,
  token?: string,
): Promise<[WebSocket, WsPushMessage<typeof WS_CHANNELS.serverWelcome>]> {
  const ws = await connectWs(port, token);
  const welcome = await waitForPush(ws, WS_CHANNELS.serverWelcome);
  return [ws, welcome];
}

async function sendRequest(
  ws: WebSocket,
  method: string,
  params?: unknown,
): Promise<WebSocketResponse> {
  const channels = channelsBySocket.get(ws);
  if (!channels) throw new Error("WebSocket not initialized");

  const id = crypto.randomUUID();
  const body =
    method === ORCHESTRATION_WS_METHODS.dispatchCommand
      ? { _tag: method, command: params }
      : params && typeof params === "object" && !Array.isArray(params)
        ? { _tag: method, ...(params as Record<string, unknown>) }
        : { _tag: method };
  ws.send(JSON.stringify({ id, body }));

  while (true) {
    const response = await dequeue(channels.response, 60_000);
    if (response.id === id || response.id === "unknown") {
      return response;
    }
  }
}

async function getOrchestratorSnapshot(ws: WebSocket) {
  const snapshotRes = await sendRequest(ws, ORCHESTRATION_WS_METHODS.getSnapshot, {});
  expect(snapshotRes.error).toBeUndefined();
  return snapshotRes.result as {
    orchestratorTasks?: Array<{
      taskId: string;
      runId: string;
      title: string;
      status: string;
      iteration: number;
    }>;
    orchestratorWorkers?: Array<{
      workerId: string;
      runId: string;
      threadId: string;
      status: string;
      activeTaskId: string | null;
      modelBinding?: { provider: string; model: string };
    }>;
  };
}

async function getOrchestratorTasks(ws: WebSocket, runId: string) {
  const snapshot = await getOrchestratorSnapshot(ws);
  return (snapshot.orchestratorTasks ?? []).filter((task) => task.runId === runId);
}

async function getOrchestratorWorkers(ws: WebSocket, runId: string) {
  const snapshot = await getOrchestratorSnapshot(ws);
  return (snapshot.orchestratorWorkers ?? []).filter((worker) => worker.runId === runId);
}

async function waitForPush<C extends WsPushChannel>(
  ws: WebSocket,
  channel: C,
  predicate?: (push: WsPushMessage<C>) => boolean,
  maxMessages = 120,
  idleTimeoutMs = 5_000,
): Promise<WsPushMessage<C>> {
  const channels = channelsBySocket.get(ws);
  if (!channels) throw new Error("WebSocket not initialized");

  for (let remaining = maxMessages; remaining > 0; remaining--) {
    const push = await dequeue(channels.push, idleTimeoutMs);
    if (push.channel !== channel) continue;
    const typed = push as WsPushMessage<C>;
    if (!predicate || predicate(typed)) return typed;
  }
  throw new Error(`Timed out waiting for push on ${channel}`);
}

// ---------------------------------------------------------------------------
// Shared mock factories
// ---------------------------------------------------------------------------

const defaultProviderStatuses: ReadonlyArray<ServerProvider> = [
  {
    provider: "codex",
    status: "ready",
    enabled: true,
    installed: true,
    version: null,
    auth: { status: "authenticated" },
    checkedAt: "2026-01-01T00:00:00.000Z",
    models: [],
  },
  {
    provider: "claudeAgent",
    status: "ready",
    enabled: true,
    installed: true,
    version: null,
    auth: { status: "authenticated" },
    checkedAt: "2026-01-01T00:00:00.000Z",
    models: [],
  },
];

const defaultProviderHealthService: ProviderHealthShape = {
  getStatuses: Effect.succeed(defaultProviderStatuses),
};

function deriveServerPathsSync(baseDir: string, devUrl: URL | undefined) {
  return Effect.runSync(
    deriveServerPaths(baseDir, devUrl).pipe(Effect.provide(NodeServices.layer)),
  );
}

function makeMockProviderLayer() {
  const runtimeEventPubSub = Effect.runSync(PubSub.unbounded<ProviderRuntimeEvent>());
  const unsupported = () => Effect.die(new Error("Unsupported provider call in test")) as never;

  const startSession = vi.fn((input: unknown) =>
    Effect.succeed({
      provider:
        typeof input === "object" &&
        input !== null &&
        "modelSelection" in input &&
        typeof input.modelSelection === "object" &&
        input.modelSelection !== null &&
        "provider" in input.modelSelection
          ? (input.modelSelection.provider as "codex" | "claudeAgent")
          : "codex",
      status: "ready" as const,
      runtimeMode: "full-access" as const,
      threadId:
        typeof input === "object" &&
        input !== null &&
        "threadId" in input &&
        typeof input.threadId === "string"
          ? asThreadId(input.threadId)
          : asThreadId("thread-journey"),
      model:
        typeof input === "object" &&
        input !== null &&
        "modelSelection" in input &&
        typeof input.modelSelection === "object" &&
        input.modelSelection !== null &&
        "model" in input.modelSelection &&
        typeof input.modelSelection.model === "string"
          ? input.modelSelection.model
          : "gpt-5-codex",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  );

  const sendTurn = vi.fn((input: unknown) =>
    Effect.succeed({
      threadId:
        typeof input === "object" &&
        input !== null &&
        "threadId" in input &&
        typeof input.threadId === "string"
          ? asThreadId(input.threadId)
          : asThreadId("thread-journey"),
      turnId: asTurnId("journey-turn-1"),
    }),
  );

  const providerService: ProviderServiceShape = {
    startSession: startSession as ProviderServiceShape["startSession"],
    sendTurn: sendTurn as ProviderServiceShape["sendTurn"],
    steerTurn: () => unsupported(),
    startReview: () => unsupported(),
    forkThread: () => Effect.succeed(null),
    interruptTurn: () => unsupported(),
    respondToRequest: () => unsupported(),
    respondToUserInput: () => unsupported(),
    stopSession: () => Effect.void,
    listSessions: () => Effect.succeed([]),
    getCapabilities: () => Effect.succeed({ sessionModelSwitch: "in-session" }),
    rollbackConversation: () => unsupported(),
    streamEvents: Stream.fromPubSub(runtimeEventPubSub),
  };

  const providerLayer = Layer.mergeAll(
    Layer.succeed(ProviderService, providerService),
    Layer.succeed(ProviderDiscoveryService, {
      getComposerCapabilities: () =>
        Effect.succeed({
          provider: "codex" as const,
          supportsSkillMentions: false,
          supportsSkillDiscovery: false,
          supportsNativeSlashCommandDiscovery: false,
          supportsPluginMentions: false,
          supportsPluginDiscovery: false,
          supportsRuntimeModelList: false,
        }),
      listSkills: () => Effect.succeed({ skills: [], source: "test", cached: false }),
      listCommands: () => Effect.succeed({ commands: [], source: "test", cached: false }),
      listPlugins: () =>
        Effect.succeed({
          marketplaces: [],
          marketplaceLoadErrors: [],
          remoteSyncError: null,
          featuredPluginIds: [],
          source: "test",
          cached: false,
        }),
      readPlugin: () =>
        Effect.succeed({
          plugin: {
            marketplaceName: "test-marketplace",
            marketplacePath: "/test/marketplace.json",
            summary: {
              id: "plugin/test",
              name: "test",
              source: {
                type: "local",
                path: "/test/plugin",
              },
              installed: false,
              enabled: false,
              installPolicy: "AVAILABLE",
              authPolicy: "ON_USE",
            },
            skills: [],
            apps: [],
            mcpServers: [],
          },
          source: "test",
          cached: false,
        }),
      listModels: () => Effect.succeed({ models: [], source: "test", cached: false }),
    }),
  );

  return { providerLayer, startSession, sendTurn };
}

// ---------------------------------------------------------------------------
// Orchestrator Journey Smoke Tests
// ---------------------------------------------------------------------------

describe("Orchestrator Journey Smoke Tests", () => {
  let server: Http.Server | null = null;
  let serverScope: Scope.Closeable | null = null;
  const connections: WebSocket[] = [];
  const tempDirs: string[] = [];

  function makeTempDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  async function createTestServer(
    options: {
      cwd?: string;
      providerLayer?: Layer.Layer<ProviderService | ProviderDiscoveryService, never>;
      providerHealth?: ProviderHealthShape;
    } = {},
  ): Promise<Http.Server> {
    if (serverScope) {
      throw new Error("Test server is already running");
    }

    const baseDir = makeTempDir("orchestrate-ws-journey-base-");
    const devUrl = undefined;
    const derivedPaths = deriveServerPathsSync(baseDir, devUrl);
    const scope = await Effect.runPromise(Scope.make("sequential"));
    const persistenceLayer = SqlitePersistenceMemory;
    const providerLayer = options.providerLayer ?? makeServerProviderLayer();
    const providerHealthLayer = Layer.succeed(
      ProviderHealth,
      options.providerHealth ?? defaultProviderHealthService,
    );
    const openLayer = Layer.succeed(Open, {
      openBrowser: () => Effect.void,
      openInEditor: () => Effect.void,
    });
    const serverConfigLayer = Layer.succeed(ServerConfig, {
      mode: "web",
      port: 0,
      host: undefined,
      cwd: options.cwd ?? "/test/project",
      baseDir,
      ...derivedPaths,
      staticDir: undefined,
      devUrl,
      noBrowser: true,
      authToken: undefined,
      autoBootstrapProjectFromCwd: false,
      logWebSocketEvents: false,
    } satisfies ServerConfigShape);
    const infrastructureLayer = providerLayer.pipe(Layer.provideMerge(persistenceLayer));
    const runtimeLayer = Layer.merge(
      Layer.merge(
        makeServerRuntimeServicesLayer().pipe(Layer.provide(infrastructureLayer)),
        infrastructureLayer,
      ),
      Layer.empty,
    );
    const dependenciesLayer = Layer.empty.pipe(
      Layer.provideMerge(runtimeLayer),
      Layer.provideMerge(providerHealthLayer),
      Layer.provideMerge(openLayer),
      Layer.provideMerge(serverConfigLayer),
      Layer.provideMerge(AnalyticsService.layerTest),
      Layer.provideMerge(ServerSettingsService.layerTest()),
      Layer.provideMerge(NodeServices.layer),
    );
    const runtimeServices = await Effect.runPromise(
      Layer.build(dependenciesLayer).pipe(Scope.provide(scope)),
    );

    try {
      const runtime = await Effect.runPromise(
        createServer().pipe(Effect.provide(runtimeServices), Scope.provide(scope)),
      );
      serverScope = scope;
      return runtime;
    } catch (error) {
      await Effect.runPromise(Scope.close(scope, Exit.void));
      throw error;
    }
  }

  async function closeTestServer() {
    if (!serverScope) return;
    const scope = serverScope;
    serverScope = null;
    await Effect.runPromise(Scope.close(scope, Exit.void));
  }

  afterEach(async () => {
    for (const ws of connections) {
      ws.close();
    }
    connections.length = 0;
    await closeTestServer();
    server = null;
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Helpers to reduce boilerplate in each journey
  // -------------------------------------------------------------------------

  async function bootstrapOrchestration(ws: WebSocket, workspaceRoot: string, suffix: string) {
    const createdAt = new Date().toISOString();
    const projectId = `project-journey-${suffix}`;
    const threadId = `thread-journey-${suffix}`;

    // Create project
    const projectRes = await sendRequest(ws, ORCHESTRATION_WS_METHODS.dispatchCommand, {
      type: "project.create",
      commandId: `cmd-${suffix}-project-create`,
      projectId,
      title: `Journey ${suffix}`,
      workspaceRoot,
      defaultModelSelection: { provider: "codex", model: "gpt-5-codex" },
      createdAt,
    });
    expect(projectRes.error).toBeUndefined();

    // Create thread
    const threadRes = await sendRequest(ws, ORCHESTRATION_WS_METHODS.dispatchCommand, {
      type: "thread.create",
      commandId: `cmd-${suffix}-thread-create`,
      threadId,
      projectId,
      title: `Thread ${suffix}`,
      modelSelection: { provider: "claudeAgent", model: "claude-sonnet-4-6" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdAt,
    });
    expect(threadRes.error).toBeUndefined();

    // Create run and root task through the current dispatchCommand API.
    const runId = `run-journey-${suffix}`;
    const runRes = await sendRequest(ws, ORCHESTRATION_WS_METHODS.dispatchCommand, {
      type: "orchestrator.run.create",
      commandId: `cmd-${suffix}-run-create`,
      runId,
      projectId,
      userRequest: `Journey test: ${suffix}`,
      goals: [`Verify ${suffix} flow works end-to-end`],
      spawnBudget: {
        maxDepth: 2,
        maxChildren: 2,
        maxConcurrentWriters: 1,
        maxTotalWorkers: 2,
        allowedTools: ["edit", "search"],
        writeScope: [],
      },
      createdAt,
    });
    expect(runRes.error).toBeUndefined();
    const run = { runId, status: "active", projectId };

    const rootTaskId = `task-journey-${suffix}-root`;
    const taskCreateRes = await sendRequest(ws, ORCHESTRATION_WS_METHODS.dispatchCommand, {
      type: "orchestrator.task.create",
      commandId: `cmd-${suffix}-task-create`,
      taskId: rootTaskId,
      runId: run.runId,
      title: `Root task ${suffix}`,
      objective: `Verify ${suffix} flow works end-to-end`,
      acceptanceCriteria: ["Task reaches accepted state"],
      readScope: [],
      writeScope: [],
      allowedTools: ["edit", "search"],
      createdAt,
    });
    expect(taskCreateRes.error).toBeUndefined();

    const tasks = await getOrchestratorTasks(ws, run.runId);
    expect(tasks).toHaveLength(1);

    // Spawn worker with Claude binding
    const workerId = `worker-journey-${suffix}`;
    const workerRes = await sendRequest(ws, ORCHESTRATION_WS_METHODS.dispatchCommand, {
      type: "orchestrator.worker.spawn",
      commandId: `cmd-${suffix}-worker-spawn`,
      workerId,
      runId: run.runId,
      taskId: rootTaskId,
      threadId,
      spawnBudget: {
        maxDepth: 1,
        // ORC-136: SpawnBudget schema rejects 0; smallest legal
        // value is 1. The journey test never actually spawns a
        // child so the budget upper-bound is unused, but the
        // schema decode must succeed.
        maxChildren: 1,
        maxConcurrentWriters: 1,
        maxTotalWorkers: 1,
        allowedTools: ["edit"],
        writeScope: [],
      },
      workspace: { mode: "local", cwd: workspaceRoot, terminalIds: [] },
      modelBinding: {
        workerId,
        provider: "claudeAgent",
        model: "claude-sonnet-4-6",
        selectedAt: createdAt,
        selectedBy: "root-override",
        selectionReason: "Journey test provider override",
        inheritedFromTaskPolicy: false,
      },
      createdAt,
    });
    expect(workerRes.error).toBeUndefined();

    // Verify worker exists in read model
    const workers = await getOrchestratorWorkers(ws, run.runId);
    expect(workers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workerId,
          threadId,
          modelBinding: expect.objectContaining({
            provider: "claudeAgent",
            model: "claude-sonnet-4-6",
          }),
        }),
      ]),
    );

    return { projectId, threadId, run, rootTaskId, workerId, createdAt };
  }

  // -------------------------------------------------------------------------
  // Journey 1: Full delegate flow
  //   project -> thread -> run -> worker.spawn (auto-assigns task to running)
  //   -> submit -> accept
  //
  //   Note: worker.spawn automatically transitions the root task to "running"
  //   and sets assignedWorkerId in the projector, so no separate
  //   orchestrator.task.assign is needed.
  // -------------------------------------------------------------------------

  it("Journey 1: full delegate flow — spawn worker, submit, accept", async () => {
    const { providerLayer } = makeMockProviderLayer();

    server = await createTestServer({
      cwd: "/test",
      providerLayer,
      providerHealth: defaultProviderHealthService,
    });
    const addr = server.address();
    const port = typeof addr === "object" && addr !== null ? addr.port : 0;
    expect(port).toBeGreaterThan(0);

    const [ws] = await connectAndAwaitWelcome(port);
    connections.push(ws);

    const workspaceRoot = makeTempDir("orchestrate-journey-delegate-");
    const { run, rootTaskId, workerId } = await bootstrapOrchestration(
      ws,
      workspaceRoot,
      "delegate",
    );
    const now = new Date().toISOString();

    // Worker spawn already set the task to "running" — verify via task tree
    const taskTreeAfterSpawn = await getOrchestratorTasks(ws, run.runId);
    const runningTask = taskTreeAfterSpawn.find((t) => t.taskId === rootTaskId);
    expect(runningTask!.status).toBe("running");

    // -- Submit the task --
    const submitRes = await sendRequest(ws, ORCHESTRATION_WS_METHODS.dispatchCommand, {
      type: "orchestrator.task.submit",
      commandId: "cmd-delegate-task-submit",
      taskId: rootTaskId,
      workerId,
      summary: "Implemented the landing page with all components",
      createdAt: now,
    });
    expect(submitRes.error).toBeUndefined();

    await waitForPush(ws, ORCHESTRATION_WS_CHANNELS.domainEvent, (push) => {
      const event = push.data as { type?: string };
      return event.type === "orchestrator.task.submitted";
    });

    // -- Accept the task --
    const acceptRes = await sendRequest(ws, ORCHESTRATION_WS_METHODS.dispatchCommand, {
      type: "orchestrator.task.accept",
      commandId: "cmd-delegate-task-accept",
      taskId: rootTaskId,
      summary: "LGTM - all acceptance criteria met",
      createdAt: now,
    });
    expect(acceptRes.error).toBeUndefined();

    await waitForPush(ws, ORCHESTRATION_WS_CHANNELS.domainEvent, (push) => {
      const event = push.data as { type?: string };
      return event.type === "orchestrator.task.accepted";
    });

    // -- Verify final state via task tree --
    const finalTasks = await getOrchestratorTasks(ws, run.runId);
    const finalTask = finalTasks.find((t) => t.taskId === rootTaskId);
    expect(finalTask).toBeDefined();
    expect(finalTask!.status).toBe("accepted");
    expect(finalTask!.iteration).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Journey 2: Rework flow
  //   Same setup (worker.spawn sets task to running)
  //   -> submit -> reject -> verify needs-rework & iteration=1
  //   -> re-assign (needs-rework allows it) -> resubmit -> accept
  // -------------------------------------------------------------------------

  it("Journey 2: rework flow — submit, reject, re-assign, resubmit, accept", async () => {
    const { providerLayer } = makeMockProviderLayer();

    server = await createTestServer({
      cwd: "/test",
      providerLayer,
      providerHealth: defaultProviderHealthService,
    });
    const addr = server.address();
    const port = typeof addr === "object" && addr !== null ? addr.port : 0;
    expect(port).toBeGreaterThan(0);

    const [ws] = await connectAndAwaitWelcome(port);
    connections.push(ws);

    const workspaceRoot = makeTempDir("orchestrate-journey-rework-");
    const { run, rootTaskId, workerId } = await bootstrapOrchestration(ws, workspaceRoot, "rework");
    const now = new Date().toISOString();

    // Task is already "running" after worker.spawn — submit directly

    // -- First submit --
    const submitRes1 = await sendRequest(ws, ORCHESTRATION_WS_METHODS.dispatchCommand, {
      type: "orchestrator.task.submit",
      commandId: "cmd-rework-task-submit-1",
      taskId: rootTaskId,
      workerId,
      summary: "Initial implementation attempt",
      createdAt: now,
    });
    expect(submitRes1.error).toBeUndefined();

    await waitForPush(ws, ORCHESTRATION_WS_CHANNELS.domainEvent, (push) => {
      const event = push.data as { type?: string };
      return event.type === "orchestrator.task.submitted";
    });

    // -- Reject the submission --
    const rejectRes = await sendRequest(ws, ORCHESTRATION_WS_METHODS.dispatchCommand, {
      type: "orchestrator.task.reject",
      commandId: "cmd-rework-task-reject",
      taskId: rootTaskId,
      instruction: "Tests are still failing. Fix the auth test before resubmitting.",
      createdAt: now,
    });
    expect(rejectRes.error).toBeUndefined();

    await waitForPush(ws, ORCHESTRATION_WS_CHANNELS.domainEvent, (push) => {
      const event = push.data as { type?: string };
      return event.type === "orchestrator.task.rejected";
    });

    // -- Verify task is now needs-rework with iteration=1 --
    const tasksAfterReject = await getOrchestratorTasks(ws, run.runId);
    const rejectedTask = tasksAfterReject.find((t) => t.taskId === rootTaskId);
    expect(rejectedTask).toBeDefined();
    expect(rejectedTask!.status).toBe("needs-rework");
    expect(rejectedTask!.iteration).toBe(1);

    // -- Re-assign (needs-rework allows re-assignment) --
    const reassignRes = await sendRequest(ws, ORCHESTRATION_WS_METHODS.dispatchCommand, {
      type: "orchestrator.task.assign",
      commandId: "cmd-rework-task-reassign",
      taskId: rootTaskId,
      assigneeKind: "worker",
      assigneeId: workerId,
      createdAt: now,
    });
    expect(reassignRes.error).toBeUndefined();

    await waitForPush(ws, ORCHESTRATION_WS_CHANNELS.domainEvent, (push) => {
      const event = push.data as { type?: string };
      return event.type === "orchestrator.task.assigned";
    });

    // -- Resubmit --
    const submitRes2 = await sendRequest(ws, ORCHESTRATION_WS_METHODS.dispatchCommand, {
      type: "orchestrator.task.submit",
      commandId: "cmd-rework-task-submit-2",
      taskId: rootTaskId,
      workerId,
      summary: "Fixed auth test and all acceptance criteria now pass",
      createdAt: now,
    });
    expect(submitRes2.error).toBeUndefined();

    // -- Accept the resubmission --
    const acceptRes = await sendRequest(ws, ORCHESTRATION_WS_METHODS.dispatchCommand, {
      type: "orchestrator.task.accept",
      commandId: "cmd-rework-task-accept",
      taskId: rootTaskId,
      summary: "All tests pass now",
      createdAt: now,
    });
    expect(acceptRes.error).toBeUndefined();

    // -- Verify final state via task tree --
    const finalTasks = await getOrchestratorTasks(ws, run.runId);
    const finalTask = finalTasks.find((t) => t.taskId === rootTaskId);
    expect(finalTask).toBeDefined();
    expect(finalTask!.status).toBe("accepted");
    expect(finalTask!.iteration).toBe(1);
  });
});
