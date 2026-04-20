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
