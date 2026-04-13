import {
  ProjectId,
  ThreadId,
  type OrchestrationCommand,
  type OrchestrationReadModel,
  type OrchestrationThread,
} from "@t3tools/contracts";
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
  it("spawns a foreground agent from the simple documented spawn_agent shape", async () => {
    const commands: OrchestrationCommand[] = [];
    const layer = OrchestrationToolRouterLive.pipe(
      Layer.provide(makeEngine(makeReadModel(), commands)),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const router = yield* OrchestrationToolRouterService;
        return yield* router.executeTool({
          toolName: "spawn_agent",
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

  it("creates a standby foreground worker when spawn_agent has no explicit task", async () => {
    const commands: OrchestrationCommand[] = [];
    const layer = OrchestrationToolRouterLive.pipe(
      Layer.provide(makeEngine(makeReadModel(), commands)),
    );

    await Effect.runPromise(
      Effect.gen(function* () {
        const router = yield* OrchestrationToolRouterService;
        yield* router.executeTool({
          toolName: "spawn_agent",
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

  it("focus_agent promotes the requested agent into the foreground", async () => {
    const commands: OrchestrationCommand[] = [];
    const layer = OrchestrationToolRouterLive.pipe(
      Layer.provide(makeEngine(makeReadModel(), commands)),
    );

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const router = yield* OrchestrationToolRouterService;
        return yield* router.executeTool({
          toolName: "focus_agent",
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
