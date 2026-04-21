import {
  ProjectId,
  ThreadId,
  type OrchestrationCommand,
  type OrchestrationReadModel,
  type OrchestrationThread,
  type OrchestratorRunId,
  type OrchestratorWorkerId,
  type OrchestrationEvent,
  EventId,
  CommandId,
} from "@orchestrate/contracts";
import { describe, expect, it } from "vitest";
import { Effect, Layer, Stream } from "effect";

import { OrchestrationToolRouterLive } from "./OrchestrationToolRouter.ts";
import { OrchestrationToolRouterService } from "../Services/OrchestrationToolRouter.ts";
import {
  OrchestrationEngineService,
  type OrchestrationEngineShape,
} from "../Services/OrchestrationEngine.ts";
import { createEmptyReadModel } from "../projector.ts";

const NOW = "2026-04-12T12:00:00.000Z";
const PROJECT_ID = ProjectId.makeUnsafe("project-router-test");
const THREAD_ID = ThreadId.makeUnsafe("thread-router-test");

function makeThread(): OrchestrationThread {
  return {
    id: THREAD_ID,
    projectId: PROJECT_ID,
    title: "Router test orchestrator thread",
    threadType: "orchestrator",
    modelSelection: { provider: "claudeAgent", model: "sonnet" },
    runtimeMode: "full-access",
    interactionMode: "default",
    envMode: "local",
    branch: null,
    worktreePath: null,
    associatedWorktreePath: null,
    associatedWorktreeBranch: null,
    associatedWorktreeRef: null,
    forkSourceThreadId: null,
    latestTurn: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    archivedAt: null,
    handoff: null,
    messages: [],
    proposedPlans: [],
    activities: [],
    checkpoints: [],
    session: null,
  };
}

function makeReadModel(overrides?: Partial<OrchestrationReadModel>): OrchestrationReadModel {
  return {
    ...createEmptyReadModel(NOW),
    projects: [
      {
        id: PROJECT_ID,
        title: "Router Test Project",
        workspaceRoot: "/tmp/router-test",
        defaultModelSelection: { provider: "codex", model: "gpt-5.3-codex" },
        scripts: [],
        createdAt: NOW,
        updatedAt: NOW,
        deletedAt: null,
      },
    ],
    threads: [makeThread()],
    ...overrides,
  };
}

function makeEngine(readModel: OrchestrationReadModel, commands: OrchestrationCommand[]) {
  const engine: OrchestrationEngineShape = {
    getReadModel: () => Effect.succeed(readModel),
    dispatch: (command) =>
      Effect.sync(() => {
        commands.push(command);
        return { sequence: commands.length };
      }),
    readEvents: () => Stream.empty,
    streamDomainEvents: Stream.empty,
  };

  return Layer.succeed(OrchestrationEngineService, engine);
}

describe("OrchestrationToolRouter", () => {
  it("spawns a foreground agent from the simple documented orchestrate_spawn_agent shape", async () => {
    const commands: OrchestrationCommand[] = [];
    const layer = OrchestrationToolRouterLive.pipe(
      Layer.provide(makeEngine(makeReadModel(), commands)),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const router = yield* OrchestrationToolRouterService;
        return yield* router.executeTool({
          toolName: "orchestrate_spawn_agent",
          threadId: THREAD_ID,
          runId: null,
          toolInput: {
            task: "Build a blank page website template",
            objective:
              "Create a blank page website template and report the files changed and commands run.",
            provider: "claude",
            model: "sonnet",
            mode: "foreground",
          },
        });
      }).pipe(Effect.provide(layer)),
    );

    expect(result).toMatchObject({
      agentId: expect.any(String),
      workerId: expect.any(String),
      threadId: expect.any(String),
      visibility: "foreground",
    });
    expect(commands.map((command) => command.type)).toEqual([
      "orchestrator.run.create",
      "orchestrator.task.create",
      "orchestrator.worker.spawn",
    ]);
    expect(commands[0]).toMatchObject({
      type: "orchestrator.run.create",
      projectId: PROJECT_ID,
      userRequest: "Build a blank page website template",
    });
    expect(commands[1]).toMatchObject({
      type: "orchestrator.task.create",
      title: "Build a blank page website template",
    });
    expect(commands[2]).toMatchObject({
      type: "orchestrator.worker.spawn",
      modelBinding: {
        provider: "claudeAgent",
        model: "sonnet",
        selectedBy: "orchestrator-tool",
      },
    });
  });

  it("orchestrate_get_agent_status surfaces submitSummary / filesWritten / testsRun (Gap H)", async () => {
    const workerId = "worker-reporting";
    const taskId = "task-reporting";
    const threadId = ThreadId.makeUnsafe("thread-reporting");
    const readModel = makeReadModel({
      threads: [makeThread(), { ...makeThread(), id: threadId }],
      orchestratorTasks: [
        {
          taskId,
          runId: "run-1",
          title: "Build endpoint",
          objective: "Build the endpoint",
          status: "submitted",
          ownerKind: "worker",
          acceptanceCriteria: [],
          checklist: [],
          iteration: 1,
          maxIterations: 3,
          createdAt: NOW,
          updatedAt: NOW,
          submittedAt: NOW,
          submitSummary: "Built POST /api/todos with in-memory store",
          filesWritten: ["server/src/app.ts", "server/src/app.test.ts"],
          testsRun: [{ name: "POST then GET roundtrip", passed: true }],
          submitNotes: "CORS pinned to :5173",
        } as any,
      ],
      orchestratorWorkers: [
        {
          workerId: workerId as unknown as OrchestratorWorkerId,
          runId: "run-1" as OrchestratorRunId,
          threadId,
          status: "submitted",
          visibility: "foreground",
          activeTaskId: taskId,
          spawnBudget: {
            maxDepth: 2,
            maxChildren: 5,
            maxConcurrentWriters: 3,
            maxTotalWorkers: 10,
            allowedTools: [],
            writeScope: [],
          },
          workspace: { mode: "local", cwd: "/tmp", terminalIds: [] },
          createdAt: NOW,
          updatedAt: NOW,
        } as any,
      ],
    });
    const layer = OrchestrationToolRouterLive.pipe(
      Layer.provide(makeEngine(readModel, [])),
    );
    const result = (await Effect.runPromise(
      Effect.gen(function* () {
        const router = yield* OrchestrationToolRouterService;
        return yield* router.executeTool({
          toolName: "orchestrate_get_agent_status",
          threadId: THREAD_ID,
          runId: null,
          toolInput: { agentId: workerId },
        });
      }).pipe(Effect.provide(layer)),
    )) as {
      agentId: string;
      submitSummary?: string;
      filesWritten?: string[];
      testsRun?: Array<{ name: string; passed: boolean }>;
      submitNotes?: string;
    };
    expect(result.agentId).toBe(workerId);
    expect(result.submitSummary).toBe("Built POST /api/todos with in-memory store");
    expect(result.filesWritten).toEqual(["server/src/app.ts", "server/src/app.test.ts"]);
    expect(result.testsRun).toEqual([{ name: "POST then GET roundtrip", passed: true }]);
    expect(result.submitNotes).toBe("CORS pinned to :5173");
  });

  it("orchestrate_send_to_agent rejects when target worker is terminated (Gap K)", async () => {
    const workerId = "worker-gone";
    const readModel = makeReadModel({
      orchestratorWorkers: [
        {
          workerId: workerId as unknown as OrchestratorWorkerId,
          runId: "run-1" as OrchestratorRunId,
          threadId: THREAD_ID,
          status: "terminated",
          visibility: "foreground",
          spawnBudget: {
            maxDepth: 2,
            maxChildren: 5,
            maxConcurrentWriters: 3,
            maxTotalWorkers: 10,
            allowedTools: [],
            writeScope: [],
          },
          workspace: { mode: "local", cwd: "/tmp", terminalIds: [] },
          createdAt: NOW,
          updatedAt: NOW,
        } as any,
      ],
    });
    const commands: OrchestrationCommand[] = [];
    const layer = OrchestrationToolRouterLive.pipe(
      Layer.provide(makeEngine(readModel, commands)),
    );
    const result = (await Effect.runPromise(
      Effect.gen(function* () {
        const router = yield* OrchestrationToolRouterService;
        return yield* router.executeTool({
          toolName: "orchestrate_send_to_agent",
          threadId: THREAD_ID,
          runId: null,
          toolInput: { targetAgentId: workerId, message: "one more thing" },
        });
      }).pipe(Effect.provide(layer)),
    )) as { error?: string };
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/terminated/);
    // No commands dispatched.
    expect(commands).toHaveLength(0);
  });

  it("orchestrate_spawn_agent task message carries submit-report protocol reminder (Gap J)", async () => {
    const commands: OrchestrationCommand[] = [];
    const layer = OrchestrationToolRouterLive.pipe(
      Layer.provide(makeEngine(makeReadModel(), commands)),
    );
    await Effect.runPromise(
      Effect.gen(function* () {
        const router = yield* OrchestrationToolRouterService;
        yield* router.executeTool({
          toolName: "orchestrate_spawn_agent",
          threadId: THREAD_ID,
          runId: null,
          toolInput: {
            task: "Build a button component",
            objective: "Create src/Button.tsx matching the arcade theme.",
            mode: "foreground",
          },
        });
      }).pipe(Effect.provide(layer)),
    );
    const turnStart = commands.find((c) => c.type === "thread.turn.start") as any;
    expect(turnStart).toBeDefined();
    const text: string = turnStart.message.text ?? "";
    expect(text).toContain("Create src/Button.tsx");
    // Protocol reminder — must tell the worker how to submit a structured report.
    expect(text.toLowerCase()).toContain("filesWritten".toLowerCase());
    expect(text.toLowerCase()).toContain("testsRun".toLowerCase());
  });

  it("orchestrate_send_to_agent dispatches thread.turn.start on target worker's thread (Gap A)", async () => {
    const commands: OrchestrationCommand[] = [];
    const targetWorkerId = "worker-target";
    const targetThreadId = ThreadId.makeUnsafe("thread-target");
    const readModel = makeReadModel({
      threads: [
        makeThread(),
        {
          ...makeThread(),
          id: targetThreadId,
          title: "Target worker thread",
        },
      ],
      orchestratorWorkers: [
        {
          workerId: targetWorkerId as unknown as OrchestratorWorkerId,
          runId: "run-1" as OrchestratorRunId,
          threadId: targetThreadId,
          status: "running",
          visibility: "foreground",
          spawnBudget: {
            maxDepth: 2,
            maxChildren: 5,
            maxConcurrentWriters: 3,
            maxTotalWorkers: 10,
            allowedTools: [],
            writeScope: [],
          },
          workspace: { mode: "local", cwd: "/tmp", terminalIds: [] },
          createdAt: NOW,
          updatedAt: NOW,
        } as any,
      ],
    });
    const layer = OrchestrationToolRouterLive.pipe(
      Layer.provide(makeEngine(readModel, commands)),
    );
    await Effect.runPromise(
      Effect.gen(function* () {
        const router = yield* OrchestrationToolRouterService;
        yield* router.executeTool({
          toolName: "orchestrate_send_to_agent",
          threadId: THREAD_ID,
          runId: null,
          toolInput: {
            targetAgentId: targetWorkerId,
            message: "Use port 5175 instead of 5173.",
          },
        });
      }).pipe(Effect.provide(layer)),
    );
    const types = commands.map((c) => c.type);
    expect(types).toContain("orchestrator.message.send");
    expect(types).toContain("thread.turn.start");
    const turnStart = commands.find((c) => c.type === "thread.turn.start") as any;
    expect(turnStart.threadId).toBe(targetThreadId);
    expect(turnStart.message.text).toContain("Use port 5175");
  });

  it("orchestrate_get_agent_diff returns aggregated file stats for worker's latest checkpoint (Gap B)", async () => {
    const workerId = "worker-with-diff";
    const threadId = ThreadId.makeUnsafe("thread-with-diff");
    const readModel = makeReadModel({
      threads: [
        makeThread(),
        {
          ...makeThread(),
          id: threadId,
          checkpoints: [
            {
              turnId: { __brand: "TurnId" } as any,
              checkpointTurnCount: 1,
              checkpointRef: "ckpt-1" as any,
              status: "ready" as const,
              files: [
                { path: "server/app.ts", kind: "M", additions: 40, deletions: 2 },
                { path: "server/main.ts", kind: "A", additions: 8, deletions: 0 },
              ],
              assistantMessageId: null,
              completedAt: NOW,
            },
          ],
        },
      ],
      orchestratorWorkers: [
        {
          workerId: workerId as unknown as OrchestratorWorkerId,
          runId: "run-1" as OrchestratorRunId,
          threadId,
          status: "submitted",
          visibility: "foreground",
          spawnBudget: {
            maxDepth: 2,
            maxChildren: 5,
            maxConcurrentWriters: 3,
            maxTotalWorkers: 10,
            allowedTools: [],
            writeScope: [],
          },
          workspace: { mode: "local", cwd: "/tmp", terminalIds: [] },
          createdAt: NOW,
          updatedAt: NOW,
        } as any,
      ],
    });
    const layer = OrchestrationToolRouterLive.pipe(
      Layer.provide(makeEngine(readModel, [])),
    );
    const result = (await Effect.runPromise(
      Effect.gen(function* () {
        const router = yield* OrchestrationToolRouterService;
        return yield* router.executeTool({
          toolName: "orchestrate_get_agent_diff",
          threadId: THREAD_ID,
          runId: null,
          toolInput: { agentId: workerId },
        });
      }).pipe(Effect.provide(layer)),
    )) as { agentId: string; diff: string; filesChanged: number; additions: number; deletions: number };
    expect(result.agentId).toBe(workerId);
    expect(result.filesChanged).toBe(2);
    expect(result.additions).toBe(48);
    expect(result.deletions).toBe(2);
    expect(result.diff).toContain("server/app.ts");
    expect(result.diff).toContain("+40");
    expect(result.diff).toContain("-2");
  });

  it("orchestrate_get_agent_logs returns activities tail for the worker's thread (Gap 10)", async () => {
    const workerId = "worker-logs";
    const activities = [
      {
        id: EventId.makeUnsafe("act-1"),
        createdAt: "2026-04-12T12:00:01.000Z",
        tone: "info" as const,
        kind: "turn.plan.updated",
        summary: "Plan refined",
        payload: {},
        turnId: null,
      },
      {
        id: EventId.makeUnsafe("act-2"),
        createdAt: "2026-04-12T12:00:02.000Z",
        tone: "tool" as const,
        kind: "tool.completed",
        summary: "Ran bash command",
        payload: {},
        turnId: null,
      },
      {
        id: EventId.makeUnsafe("act-3"),
        createdAt: "2026-04-12T12:00:03.000Z",
        tone: "error" as const,
        kind: "runtime.error",
        summary: "Command failed",
        payload: {},
        turnId: null,
      },
    ];
    const thread = { ...makeThread(), activities };
    const readModel = makeReadModel({
      threads: [thread],
      orchestratorWorkers: [
        {
          workerId: workerId as unknown as OrchestratorWorkerId,
          runId: "run-1" as OrchestratorRunId,
          threadId: THREAD_ID,
          status: "running",
          visibility: "foreground",
          spawnBudget: {
            maxDepth: 2,
            maxChildren: 5,
            maxConcurrentWriters: 3,
            maxTotalWorkers: 10,
            allowedTools: [],
            writeScope: [],
          },
          workspace: { mode: "local", cwd: "/tmp", terminalIds: [] },
          createdAt: NOW,
          updatedAt: NOW,
        } as any,
      ],
    });
    const layer = OrchestrationToolRouterLive.pipe(
      Layer.provide(makeEngine(readModel, [])),
    );
    const result = (await Effect.runPromise(
      Effect.gen(function* () {
        const router = yield* OrchestrationToolRouterService;
        return yield* router.executeTool({
          toolName: "orchestrate_get_agent_logs",
          threadId: THREAD_ID,
          runId: null,
          toolInput: { agentId: workerId, tail: 2 },
        });
      }).pipe(Effect.provide(layer)),
    )) as { agentId: string; entries: Array<{ level: string; message: string }> };

    expect(result.agentId).toBe(workerId);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[1].level).toBe("error");
    expect(result.entries[1].message).toBe("Command failed");
  });

  it("orchestrate_wait_agent resolves immediately when worker already terminal (Gap 7)", async () => {
    const workerId = "worker-done";
    const readModel = makeReadModel({
      orchestratorWorkers: [
        {
          workerId: workerId as unknown as OrchestratorWorkerId,
          runId: "run-1" as OrchestratorRunId,
          threadId: THREAD_ID,
          status: "terminated",
          visibility: "foreground",
          spawnBudget: {
            maxDepth: 2,
            maxChildren: 5,
            maxConcurrentWriters: 3,
            maxTotalWorkers: 10,
            allowedTools: [],
            writeScope: [],
          },
          workspace: { mode: "local", cwd: "/tmp", terminalIds: [] },
          createdAt: NOW,
          updatedAt: NOW,
        } as any,
      ],
    });
    const layer = OrchestrationToolRouterLive.pipe(
      Layer.provide(makeEngine(readModel, [])),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const router = yield* OrchestrationToolRouterService;
        return yield* router.executeTool({
          toolName: "orchestrate_wait_agent",
          threadId: THREAD_ID,
          runId: null,
          toolInput: { agentId: workerId, timeoutMs: 500 },
        });
      }).pipe(Effect.provide(layer)),
    );

    expect(result).toMatchObject({
      agentId: workerId,
      status: "terminated",
      timedOut: false,
    });
  });

  it("orchestrate_wait_agent reports unknown agent without blocking (Gap 7)", async () => {
    const readModel = makeReadModel({ orchestratorWorkers: [] });
    const layer = OrchestrationToolRouterLive.pipe(
      Layer.provide(makeEngine(readModel, [])),
    );
    const result = (await Effect.runPromise(
      Effect.gen(function* () {
        const router = yield* OrchestrationToolRouterService;
        return yield* router.executeTool({
          toolName: "orchestrate_wait_agent",
          threadId: THREAD_ID,
          runId: null,
          toolInput: { agentId: "worker-missing", timeoutMs: 200 },
        });
      }).pipe(Effect.provide(layer)),
    )) as { error?: string };
    expect(typeof result.error).toBe("string");
    expect(result.error).toMatch(/Unknown agent/);
  });

  it("orchestrate_wait_all resolves when all requested workers are already terminal (Gap 7)", async () => {
    const ids = ["w-a", "w-b"];
    const workers = ids.map(
      (id) =>
        ({
          workerId: id as unknown as OrchestratorWorkerId,
          runId: "run-1" as OrchestratorRunId,
          threadId: THREAD_ID,
          status: "submitted",
          visibility: "foreground",
          spawnBudget: {
            maxDepth: 2,
            maxChildren: 5,
            maxConcurrentWriters: 3,
            maxTotalWorkers: 10,
            allowedTools: [],
            writeScope: [],
          },
          workspace: { mode: "local", cwd: "/tmp", terminalIds: [] },
          createdAt: NOW,
          updatedAt: NOW,
        }) as any,
    );
    const readModel = makeReadModel({ orchestratorWorkers: workers });
    const layer = OrchestrationToolRouterLive.pipe(
      Layer.provide(makeEngine(readModel, [])),
    );
    const result = (await Effect.runPromise(
      Effect.gen(function* () {
        const router = yield* OrchestrationToolRouterService;
        return yield* router.executeTool({
          toolName: "orchestrate_wait_all",
          threadId: THREAD_ID,
          runId: null,
          toolInput: { agentIds: ids, timeoutMs: 500 },
        });
      }).pipe(Effect.provide(layer)),
    )) as { results: Array<{ agentId: string; status: string }>; timedOut: boolean };
    expect(result.timedOut).toBe(false);
    expect(result.results.map((r) => r.agentId).sort()).toEqual(ids.sort());
    for (const r of result.results) expect(r.status).toBe("submitted");
  });

  it("creates a standby foreground worker when orchestrate_spawn_agent has no explicit task", async () => {
    const commands: OrchestrationCommand[] = [];
    const layer = OrchestrationToolRouterLive.pipe(
      Layer.provide(makeEngine(makeReadModel(), commands)),
    );

    await Effect.runPromise(
      Effect.gen(function* () {
        const router = yield* OrchestrationToolRouterService;
        yield* router.executeTool({
          toolName: "orchestrate_spawn_agent",
          threadId: THREAD_ID,
          runId: null,
          toolInput: {
            mode: "foreground",
          },
        });
      }).pipe(Effect.provide(layer)),
    );

    expect(commands.map((command) => command.type)).toEqual([
      "orchestrator.run.create",
      "orchestrator.task.create",
      "orchestrator.worker.spawn",
    ]);
    expect(commands[0]).toMatchObject({
      type: "orchestrator.run.create",
      userRequest: "Stand by for follow-up instructions",
    });
    expect(commands[1]).toMatchObject({
      type: "orchestrator.task.create",
      title: "Stand by for follow-up instructions",
    });
  });

  it("orchestrate_focus_agent promotes the requested agent into the foreground", async () => {
    const commands: OrchestrationCommand[] = [];
    const layer = OrchestrationToolRouterLive.pipe(
      Layer.provide(makeEngine(makeReadModel(), commands)),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const router = yield* OrchestrationToolRouterService;
        return yield* router.executeTool({
          toolName: "orchestrate_focus_agent",
          threadId: THREAD_ID,
          runId: null,
          toolInput: {
            agent_id: "worker-focus-1",
          },
        });
      }).pipe(Effect.provide(layer)),
    );

    expect(result).toEqual({
      focused: true,
      agentId: "worker-focus-1",
    });
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      type: "orchestrator.worker.promote",
      workerId: "worker-focus-1",
      visibility: "foreground",
    });
  });
});
