import {
  CommandId,
  ProjectId,
  ThreadId,
  type OrchestratorRunId,
  type OrchestratorTaskId,
  type OrchestratorWorkerId,
  type OrchestrationCommand,
  type OrchestrationReadModel,
  type OrchestrationEvent,
  type SpawnBudget,
  type OrchestratorWorkspace,
  type OrchestratorWorkerModelBinding,
} from "@t3tools/contracts";
import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent } from "./projector.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const now = "2026-04-09T12:00:00.000Z";
const later = "2026-04-09T12:01:00.000Z";
const evenLater = "2026-04-09T12:02:00.000Z";

const projectId = ProjectId.makeUnsafe("project-1");
const runId = "run-1" as OrchestratorRunId;
const taskId = "task-1" as OrchestratorTaskId;
const workerId = "worker-1" as OrchestratorWorkerId;
const threadId = ThreadId.makeUnsafe("thread-1");

const spawnBudget: SpawnBudget = {
  maxDepth: 2,
  maxChildren: 5,
  maxConcurrentWriters: 3,
  maxTotalWorkers: 10,
  allowedTools: ["read", "write", "bash"],
  writeScope: ["src/**"],
};

const workspace: OrchestratorWorkspace = {
  mode: "local",
  cwd: "/tmp/project-1",
  terminalIds: [],
};

function cmd(id: string): CommandId {
  return CommandId.makeUnsafe(id);
}

/** Apply a sequence of commands, projecting each event into the read model. */
async function applyCommands(
  initial: OrchestrationReadModel,
  commands: ReadonlyArray<OrchestrationCommand>,
): Promise<OrchestrationReadModel> {
  let model = initial;
  for (const command of commands) {
    const result = await Effect.runPromise(
      decideOrchestrationCommand({ command, readModel: model }),
    );
    const events = Array.isArray(result) ? result : [result];
    for (const event of events) {
      model = await Effect.runPromise(
        projectEvent(model, {
          ...event,
          sequence: model.snapshotSequence + 1,
        } as OrchestrationEvent),
      );
    }
  }
  return model;
}

/** Decide a single command, returning produced events as an array. */
async function decide(
  model: OrchestrationReadModel,
  command: OrchestrationCommand,
): Promise<ReadonlyArray<Omit<OrchestrationEvent, "sequence">>> {
  const result = await Effect.runPromise(decideOrchestrationCommand({ command, readModel: model }));
  return (Array.isArray(result) ? result : [result]) as ReadonlyArray<
    Omit<OrchestrationEvent, "sequence">
  >;
}

/** Decide a single command, expecting a failure. */
async function decideFailure(
  model: OrchestrationReadModel,
  command: OrchestrationCommand,
): Promise<string> {
  const exit = await Effect.runPromiseExit(
    decideOrchestrationCommand({ command, readModel: model }),
  );
  if (Exit.isFailure(exit)) {
    const cause = exit.cause;
    // Extract the error message from the cause
    const error = cause as unknown as { _tag: string; error?: { detail?: string } };
    if (error._tag === "Fail" && error.error?.detail) {
      return error.error.detail;
    }
    return JSON.stringify(cause);
  }
  throw new Error("Expected command to fail but it succeeded");
}

/** Create a model with a project already present. */
function modelWithProject(): OrchestrationReadModel {
  const model = createEmptyReadModel(now);
  return {
    ...model,
    projects: [
      {
        id: projectId,
        title: "Test Project",
        workspaceRoot: "/tmp/project-1",
        defaultModelSelection: { provider: "codex", model: "gpt-5-codex" },
        scripts: [],
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Common commands
// ---------------------------------------------------------------------------

const createRunCommand: OrchestrationCommand = {
  type: "orchestrator.run.create",
  commandId: cmd("cmd-run-create"),
  runId,
  projectId,
  userRequest: "Build a REST API",
  goals: ["Create endpoints", "Add tests"],
  spawnBudget,
  createdAt: now,
};

const createTaskCommand: OrchestrationCommand = {
  type: "orchestrator.task.create",
  commandId: cmd("cmd-task-create"),
  taskId,
  runId,
  title: "Create endpoints",
  objective: "Build CRUD endpoints for users",
  acceptanceCriteria: ["GET /users returns 200", "POST /users creates a user"],
  createdAt: now,
};

// ---------------------------------------------------------------------------
// Run lifecycle
// ---------------------------------------------------------------------------

describe("orchestrator decider — run lifecycle", () => {
  it("creates a run → produces orchestrator.run.created event", async () => {
    const model = modelWithProject();
    const events = await decide(model, createRunCommand);

    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.type).toBe("orchestrator.run.created");
    expect(event.aggregateKind).toBe("orchestrator");
    expect(event.aggregateId).toBe(runId);
    expect((event.payload as { runId: string }).runId).toBe(runId);
    expect((event.payload as { projectId: string }).projectId).toBe(projectId);
    expect((event.payload as { userRequest: string }).userRequest).toBe("Build a REST API");
    expect((event.payload as unknown as { goals: string[] }).goals).toEqual([
      "Create endpoints",
      "Add tests",
    ]);
  });

  it("rejects duplicate run creation", async () => {
    const model = await applyCommands(modelWithProject(), [createRunCommand]);
    const detail = await decideFailure(model, {
      ...createRunCommand,
      commandId: cmd("cmd-run-create-dup"),
    });
    expect(detail).toContain("already exists");
  });

  it("cancels an active run → produces orchestrator.run.cancelled", async () => {
    const model = await applyCommands(modelWithProject(), [createRunCommand]);

    const events = await decide(model, {
      type: "orchestrator.run.cancel",
      commandId: cmd("cmd-run-cancel"),
      runId,
      reason: "User requested cancellation",
      createdAt: later,
    });

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("orchestrator.run.cancelled");
    expect((events[0]!.payload as { reason: string }).reason).toBe("User requested cancellation");
  });

  it("completes an active run → produces orchestrator.run.completed", async () => {
    const model = await applyCommands(modelWithProject(), [createRunCommand]);

    const events = await decide(model, {
      type: "orchestrator.run.complete",
      commandId: cmd("cmd-run-complete"),
      runId,
      summary: "All tasks done",
      createdAt: later,
    });

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("orchestrator.run.completed");
    expect((events[0]!.payload as { summary: string }).summary).toBe("All tasks done");
  });

  it("rejects cancel on non-existent run", async () => {
    const model = modelWithProject();
    const detail = await decideFailure(model, {
      type: "orchestrator.run.cancel",
      commandId: cmd("cmd-run-cancel-missing"),
      runId: "run-missing" as OrchestratorRunId,
      reason: "no such run",
      createdAt: now,
    });
    expect(detail).toContain("does not exist");
  });

  it("rejects complete on already-cancelled run", async () => {
    const model = await applyCommands(modelWithProject(), [
      createRunCommand,
      {
        type: "orchestrator.run.cancel",
        commandId: cmd("cmd-run-cancel"),
        runId,
        reason: "cancelled first",
        createdAt: later,
      },
    ]);

    const detail = await decideFailure(model, {
      type: "orchestrator.run.complete",
      commandId: cmd("cmd-run-complete-after-cancel"),
      runId,
      summary: "should fail",
      createdAt: evenLater,
    });
    expect(detail).toContain("not active");
  });
});

// ---------------------------------------------------------------------------
// Task lifecycle
// ---------------------------------------------------------------------------

describe("orchestrator decider — task lifecycle", () => {
  it("creates a task on an active run → produces orchestrator.task.created", async () => {
    const model = await applyCommands(modelWithProject(), [createRunCommand]);

    const events = await decide(model, createTaskCommand);

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("orchestrator.task.created");
    const payload = events[0]!.payload as {
      taskId: string;
      runId: string;
      title: string;
      objective: string;
    };
    expect(payload.taskId).toBe(taskId);
    expect(payload.runId).toBe(runId);
    expect(payload.title).toBe("Create endpoints");
    expect(payload.objective).toBe("Build CRUD endpoints for users");
  });

  it("assigns a task → produces orchestrator.task.assigned", async () => {
    const model = await applyCommands(modelWithProject(), [createRunCommand, createTaskCommand]);

    const events = await decide(model, {
      type: "orchestrator.task.assign",
      commandId: cmd("cmd-task-assign"),
      taskId,
      assigneeKind: "worker",
      assigneeId: workerId as unknown as string,
      createdAt: later,
    });

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("orchestrator.task.assigned");
    const payload = events[0]!.payload as {
      taskId: string;
      assigneeKind: string;
      assigneeId: string;
    };
    expect(payload.taskId).toBe(taskId);
    expect(payload.assigneeKind).toBe("worker");
  });

  it("submit → accept flow produces correct events", async () => {
    // Set up: run → task → assign → spawn worker (to mark task as running)
    const model = await applyCommands(modelWithProject(), [
      createRunCommand,
      createTaskCommand,
      {
        type: "orchestrator.task.assign",
        commandId: cmd("cmd-task-assign"),
        taskId,
        assigneeKind: "worker",
        assigneeId: workerId as unknown as string,
        createdAt: now,
      },
      {
        type: "orchestrator.worker.spawn",
        commandId: cmd("cmd-worker-spawn"),
        workerId,
        runId,
        taskId,
        threadId,
        spawnBudget,
        workspace,
        createdAt: now,
      },
    ]);

    // Submit the task
    const submitEvents = await decide(model, {
      type: "orchestrator.task.submit",
      commandId: cmd("cmd-task-submit"),
      taskId,
      workerId,
      summary: "Endpoints implemented",
      createdAt: later,
    });

    expect(submitEvents).toHaveLength(1);
    expect(submitEvents[0]!.type).toBe("orchestrator.task.submitted");
    expect((submitEvents[0]!.payload as { workerId: string }).workerId).toBe(workerId);

    // Project submit event, then accept
    const afterSubmit = await applyCommands(model, [
      {
        type: "orchestrator.task.submit",
        commandId: cmd("cmd-task-submit"),
        taskId,
        workerId,
        summary: "Endpoints implemented",
        createdAt: later,
      },
    ]);

    const acceptEvents = await decide(afterSubmit, {
      type: "orchestrator.task.accept",
      commandId: cmd("cmd-task-accept"),
      taskId,
      summary: "Looks good",
      createdAt: evenLater,
    });

    expect(acceptEvents).toHaveLength(1);
    expect(acceptEvents[0]!.type).toBe("orchestrator.task.accepted");
    expect((acceptEvents[0]!.payload as { taskId: string }).taskId).toBe(taskId);
  });

  it("reject increments iteration and sets needs-rework status", async () => {
    // Set up: run → task → assign → spawn worker → submit
    const model = await applyCommands(modelWithProject(), [
      createRunCommand,
      createTaskCommand,
      {
        type: "orchestrator.task.assign",
        commandId: cmd("cmd-task-assign"),
        taskId,
        assigneeKind: "worker",
        createdAt: now,
      },
      {
        type: "orchestrator.worker.spawn",
        commandId: cmd("cmd-worker-spawn"),
        workerId,
        runId,
        taskId,
        threadId,
        spawnBudget,
        workspace,
        createdAt: now,
      },
      {
        type: "orchestrator.task.submit",
        commandId: cmd("cmd-task-submit"),
        taskId,
        workerId,
        summary: "First attempt",
        createdAt: later,
      },
    ]);

    // Reject produces orchestrator.task.rejected
    const rejectEvents = await decide(model, {
      type: "orchestrator.task.reject",
      commandId: cmd("cmd-task-reject"),
      taskId,
      instruction: "Missing error handling",
      createdAt: evenLater,
    });

    expect(rejectEvents).toHaveLength(1);
    expect(rejectEvents[0]!.type).toBe("orchestrator.task.rejected");
    expect((rejectEvents[0]!.payload as { instruction: string }).instruction).toBe(
      "Missing error handling",
    );

    // After projecting the rejection, the task status should be "needs-rework"
    // and iteration should be incremented
    const afterReject = await applyCommands(model, [
      {
        type: "orchestrator.task.reject",
        commandId: cmd("cmd-task-reject"),
        taskId,
        instruction: "Missing error handling",
        createdAt: evenLater,
      },
    ]);

    const task = afterReject.orchestratorTasks?.find((t) => t.taskId === taskId);
    expect(task).toBeDefined();
    expect(task!.status).toBe("needs-rework");
    expect(task!.iteration).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Worker lifecycle
// ---------------------------------------------------------------------------

describe("orchestrator decider — worker lifecycle", () => {
  it("spawns a worker with modelBinding → produces orchestrator.worker.spawned with correct provider", async () => {
    const model = await applyCommands(modelWithProject(), [createRunCommand, createTaskCommand]);

    const modelBinding: OrchestratorWorkerModelBinding = {
      workerId,
      provider: "claudeAgent",
      model: "claude-opus-4-6",
      selectedAt: now,
      selectedBy: "root-policy",
      selectionReason: "Best for code editing tasks",
      inheritedFromTaskPolicy: true,
    };

    const events = await decide(model, {
      type: "orchestrator.worker.spawn",
      commandId: cmd("cmd-worker-spawn"),
      workerId,
      runId,
      taskId,
      threadId,
      spawnBudget,
      workspace,
      modelBinding,
      createdAt: later,
    });

    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.type).toBe("orchestrator.worker.spawned");

    const payload = event.payload as {
      workerId: string;
      runId: string;
      taskId: string;
      threadId: string;
      modelBinding: OrchestratorWorkerModelBinding;
    };
    expect(payload.workerId).toBe(workerId);
    expect(payload.runId).toBe(runId);
    expect(payload.taskId).toBe(taskId);
    expect(payload.modelBinding).toBeDefined();
    expect(payload.modelBinding.provider).toBe("claudeAgent");
    expect(payload.modelBinding.model).toBe("claude-opus-4-6");
    expect(payload.modelBinding.selectedBy).toBe("root-policy");
  });
});
