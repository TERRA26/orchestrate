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
} from "@orchestrate/contracts";
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
      browserAfterScreenshotRef: "browser-screenshot-after-submit",
      browserAfterDomRef: "browser-dom-after-submit",
      createdAt: later,
    });

    expect(submitEvents).toHaveLength(1);
    expect(submitEvents[0]!.type).toBe("orchestrator.task.submitted");
    expect((submitEvents[0]!.payload as { workerId: string }).workerId).toBe(workerId);
    expect(
      (submitEvents[0]!.payload as { browserAfterScreenshotRef?: string })
        .browserAfterScreenshotRef,
    ).toBe("browser-screenshot-after-submit");
    expect((submitEvents[0]!.payload as { browserAfterDomRef?: string }).browserAfterDomRef).toBe(
      "browser-dom-after-submit",
    );

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

  it("persists worker submit report (summary + filesWritten + testsRun) on the task (Gap C+F)", async () => {
    const model = await applyCommands(modelWithProject(), [
      createRunCommand,
      createTaskCommand,
      {
        type: "orchestrator.task.assign",
        commandId: cmd("cmd-rep-assign"),
        taskId,
        assigneeKind: "worker",
        assigneeId: workerId as unknown as string,
        createdAt: now,
      },
      {
        type: "orchestrator.worker.spawn",
        commandId: cmd("cmd-rep-spawn"),
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
        commandId: cmd("cmd-rep-submit"),
        taskId,
        workerId,
        summary: "Implemented /api/todos POST/GET/DELETE",
        hasChanges: true,
        diffStats: { adds: 120, dels: 5, filesChanged: 3 },
        filesWritten: ["server/src/app.ts", "server/src/app.test.ts", "server/src/main.ts"],
        testsRun: [
          { name: "POST then GET roundtrip", passed: true },
          { name: "POST returns 400 on empty", passed: true },
        ],
        notes: "CORS set to 5173; in-memory Map store.",
        browserAfterScreenshotRef: "browser-screenshot-after-submit",
        browserAfterDomRef: "browser-dom-after-submit",
        createdAt: later,
      } as any,
    ]);

    const task = model.orchestratorTasks.find((t) => t.taskId === taskId);
    expect(task).toBeDefined();
    expect(task?.submitSummary).toBe("Implemented /api/todos POST/GET/DELETE");
    expect(task?.filesWritten).toEqual([
      "server/src/app.ts",
      "server/src/app.test.ts",
      "server/src/main.ts",
    ]);
    expect(task?.testsRun).toEqual([
      { name: "POST then GET roundtrip", passed: true },
      { name: "POST returns 400 on empty", passed: true },
    ]);
    expect(task?.submitNotes).toBe("CORS set to 5173; in-memory Map store.");
    const submittedEvent = model.orchestratorTasks.find((t) => t.taskId === taskId);
    expect(submittedEvent).toBeDefined();
  });

  it("rejects accept when submitted task has hasChanges=false and accept lacks allowNoOp (Gap 5+6)", async () => {
    const model = await applyCommands(modelWithProject(), [
      createRunCommand,
      createTaskCommand,
      {
        type: "orchestrator.task.assign",
        commandId: cmd("cmd-noop-assign"),
        taskId,
        assigneeKind: "worker",
        assigneeId: workerId as unknown as string,
        createdAt: now,
      },
      {
        type: "orchestrator.worker.spawn",
        commandId: cmd("cmd-noop-spawn"),
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
        commandId: cmd("cmd-noop-submit"),
        taskId,
        workerId,
        summary: "Read-only inspection, no writes",
        hasChanges: false,
        createdAt: later,
      },
    ]);

    const detail = await decideFailure(model, {
      type: "orchestrator.task.accept",
      commandId: cmd("cmd-noop-accept"),
      taskId,
      summary: "ok",
      createdAt: evenLater,
    });

    expect(detail).toContain("noChangesRequireExplicitOverride");
  });

  it("allows accept on no-change submission when allowNoOp=true (Gap 5+6)", async () => {
    const model = await applyCommands(modelWithProject(), [
      createRunCommand,
      createTaskCommand,
      {
        type: "orchestrator.task.assign",
        commandId: cmd("cmd-noop2-assign"),
        taskId,
        assigneeKind: "worker",
        assigneeId: workerId as unknown as string,
        createdAt: now,
      },
      {
        type: "orchestrator.worker.spawn",
        commandId: cmd("cmd-noop2-spawn"),
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
        commandId: cmd("cmd-noop2-submit"),
        taskId,
        workerId,
        summary: "Read-only inspection, no writes",
        hasChanges: false,
        createdAt: later,
      },
    ]);

    const acceptEvents = await decide(model, {
      type: "orchestrator.task.accept",
      commandId: cmd("cmd-noop2-accept"),
      taskId,
      summary: "acknowledged no-op",
      allowNoOp: true,
      createdAt: evenLater,
    });

    expect(acceptEvents).toHaveLength(1);
    expect(acceptEvents[0]!.type).toBe("orchestrator.task.accepted");
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

describe("orchestrator decider — worker.spawn dependency gate (ORC-126)", () => {
  const taskAId = "task-a" as OrchestratorTaskId;
  const taskBId = "task-b" as OrchestratorTaskId;
  const workerForBId = "worker-b" as OrchestratorWorkerId;

  it("rejects worker.spawn for a task whose dependency is still pending", async () => {
    const model = await applyCommands(modelWithProject(), [
      createRunCommand,
      {
        type: "orchestrator.task.create",
        commandId: cmd("cmd-task-a-prereq"),
        taskId: taskAId,
        runId,
        title: "Task A (prerequisite)",
        objective: "Must finish before B",
        acceptanceCriteria: ["a"],
        createdAt: now,
      },
      {
        type: "orchestrator.task.create",
        commandId: cmd("cmd-task-b-dependent"),
        taskId: taskBId,
        runId,
        title: "Task B (depends on A)",
        objective: "Cannot start until A is accepted",
        acceptanceCriteria: ["b"],
        dependsOn: [taskAId],
        createdAt: later,
      },
    ]);

    const detail = await decideFailure(model, {
      type: "orchestrator.worker.spawn",
      commandId: cmd("cmd-spawn-b-too-early"),
      workerId: workerForBId,
      runId,
      taskId: taskBId,
      threadId: ThreadId.makeUnsafe("thread-b"),
      spawnBudget,
      workspace,
      createdAt: evenLater,
    });

    expect(detail).toContain("prerequisite");
    expect(detail).toContain(taskAId);
    expect(detail).toContain("pending");
  });

  it("rejects worker.spawn when the prerequisite is rejected (status needs-rework)", async () => {
    // Build state: assign(A) -> spawn(A) -> submit(A) -> reject(A).
    // After reject, A's status is "needs-rework", not "accepted".
    const workerForAId = "worker-a" as OrchestratorWorkerId;
    const model = await applyCommands(modelWithProject(), [
      createRunCommand,
      {
        type: "orchestrator.task.create",
        commandId: cmd("cmd-task-a-rework"),
        taskId: taskAId,
        runId,
        title: "Task A",
        objective: "First",
        acceptanceCriteria: ["a"],
        createdAt: now,
      },
      {
        type: "orchestrator.task.create",
        commandId: cmd("cmd-task-b-rework"),
        taskId: taskBId,
        runId,
        title: "Task B",
        objective: "Second",
        acceptanceCriteria: ["b"],
        dependsOn: [taskAId],
        createdAt: now,
      },
      {
        type: "orchestrator.task.assign",
        commandId: cmd("cmd-assign-a"),
        taskId: taskAId,
        assigneeKind: "worker",
        assigneeId: workerForAId as unknown as string,
        createdAt: now,
      },
      {
        type: "orchestrator.worker.spawn",
        commandId: cmd("cmd-spawn-a"),
        workerId: workerForAId,
        runId,
        taskId: taskAId,
        threadId: ThreadId.makeUnsafe("thread-a"),
        spawnBudget,
        workspace,
        createdAt: now,
      },
      {
        type: "orchestrator.task.submit",
        commandId: cmd("cmd-submit-a"),
        taskId: taskAId,
        workerId: workerForAId,
        summary: "First pass attempt",
        createdAt: now,
      },
      {
        type: "orchestrator.task.reject",
        commandId: cmd("cmd-reject-a"),
        taskId: taskAId,
        instruction: "Try again",
        createdAt: now,
      },
    ]);

    const detail = await decideFailure(model, {
      type: "orchestrator.worker.spawn",
      commandId: cmd("cmd-spawn-b-needs-rework"),
      workerId: workerForBId,
      runId,
      taskId: taskBId,
      threadId: ThreadId.makeUnsafe("thread-b"),
      spawnBudget,
      workspace,
      createdAt: now,
    });

    expect(detail).toContain("prerequisite");
    expect(detail).toContain(taskAId);
    expect(detail).toContain("needs-rework");
  });

  it("accepts worker.spawn when the prerequisite was accepted", async () => {
    const workerForAId = "worker-a-ok" as OrchestratorWorkerId;
    const model = await applyCommands(modelWithProject(), [
      createRunCommand,
      {
        type: "orchestrator.task.create",
        commandId: cmd("cmd-task-a-ok"),
        taskId: taskAId,
        runId,
        title: "Task A",
        objective: "First",
        acceptanceCriteria: ["a"],
        createdAt: now,
      },
      {
        type: "orchestrator.task.create",
        commandId: cmd("cmd-task-b-ok"),
        taskId: taskBId,
        runId,
        title: "Task B",
        objective: "Second",
        acceptanceCriteria: ["b"],
        dependsOn: [taskAId],
        createdAt: now,
      },
      {
        type: "orchestrator.task.assign",
        commandId: cmd("cmd-assign-a-ok"),
        taskId: taskAId,
        assigneeKind: "worker",
        assigneeId: workerForAId as unknown as string,
        createdAt: now,
      },
      {
        type: "orchestrator.worker.spawn",
        commandId: cmd("cmd-spawn-a-ok"),
        workerId: workerForAId,
        runId,
        taskId: taskAId,
        threadId: ThreadId.makeUnsafe("thread-a-ok"),
        spawnBudget,
        workspace,
        createdAt: now,
      },
      {
        type: "orchestrator.task.submit",
        commandId: cmd("cmd-submit-a-ok"),
        taskId: taskAId,
        workerId: workerForAId,
        summary: "Done",
        filesWritten: ["src/a.ts"],
        testsRun: [],
        hasChanges: true,
        createdAt: now,
      },
      {
        type: "orchestrator.task.accept",
        commandId: cmd("cmd-accept-a"),
        taskId: taskAId,
        summary: "ok",
        createdAt: now,
      },
    ]);

    const events = await decide(model, {
      type: "orchestrator.worker.spawn",
      commandId: cmd("cmd-spawn-b-ok"),
      workerId: workerForBId,
      runId,
      taskId: taskBId,
      threadId: ThreadId.makeUnsafe("thread-b-ok"),
      spawnBudget,
      workspace,
      createdAt: now,
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("orchestrator.worker.spawned");
  });
});

describe("orchestrator decider — task dependency cycles (ORC-118)", () => {
  it("rejects task.create that would form a self-dependency", async () => {
    const model = await applyCommands(modelWithProject(), [createRunCommand]);
    const detail = await decideFailure(model, {
      type: "orchestrator.task.create",
      commandId: cmd("cmd-task-self-cycle"),
      taskId,
      runId,
      title: "Self-loop",
      objective: "Self loops should be rejected",
      acceptanceCriteria: ["depends on itself"],
      dependsOn: [taskId],
      createdAt: now,
    });
    expect(detail).toContain("dependency cycle");
    expect(detail).toContain(taskId);
  });

  it("rejects task.create that would close a 2-node cycle (A -> B, then B -> A)", async () => {
    const taskAId = "task-a" as OrchestratorTaskId;
    const taskBId = "task-b" as OrchestratorTaskId;

    const modelWithA = await applyCommands(modelWithProject(), [
      createRunCommand,
      {
        type: "orchestrator.task.create",
        commandId: cmd("cmd-task-a"),
        taskId: taskAId,
        runId,
        title: "Task A",
        objective: "First task",
        acceptanceCriteria: ["a"],
        dependsOn: [taskBId],
        createdAt: now,
      },
    ]);

    const detail = await decideFailure(modelWithA, {
      type: "orchestrator.task.create",
      commandId: cmd("cmd-task-b"),
      taskId: taskBId,
      runId,
      title: "Task B",
      objective: "Second task",
      acceptanceCriteria: ["b"],
      dependsOn: [taskAId],
      createdAt: later,
    });
    expect(detail).toContain("dependency cycle");
    expect(detail).toContain(taskAId);
    expect(detail).toContain(taskBId);
  });

  it("accepts a linear dependency chain", async () => {
    const taskAId = "task-a" as OrchestratorTaskId;
    const taskBId = "task-b" as OrchestratorTaskId;

    const model = await applyCommands(modelWithProject(), [
      createRunCommand,
      {
        type: "orchestrator.task.create",
        commandId: cmd("cmd-task-a-acyclic"),
        taskId: taskAId,
        runId,
        title: "Task A",
        objective: "First",
        acceptanceCriteria: ["a"],
        createdAt: now,
      },
    ]);

    const events = await decide(model, {
      type: "orchestrator.task.create",
      commandId: cmd("cmd-task-b-acyclic"),
      taskId: taskBId,
      runId,
      title: "Task B",
      objective: "Second, depends on A",
      acceptanceCriteria: ["b"],
      dependsOn: [taskAId],
      createdAt: later,
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("orchestrator.task.created");
  });
});

describe("orchestrator decider — worker resume invariants (ORC-117)", () => {
  it("rejects resume when the worker has been terminated", async () => {
    const model = await applyCommands(modelWithProject(), [
      createRunCommand,
      createTaskCommand,
      {
        type: "orchestrator.worker.spawn",
        commandId: cmd("cmd-worker-spawn"),
        workerId,
        runId,
        taskId,
        threadId,
        spawnBudget,
        workspace,
        createdAt: later,
      },
      {
        type: "orchestrator.worker.terminate",
        commandId: cmd("cmd-worker-terminate"),
        workerId,
        reason: "test cleanup",
        createdAt: evenLater,
      },
    ]);

    const detail = await decideFailure(model, {
      type: "orchestrator.worker.resume",
      commandId: cmd("cmd-worker-resume-after-terminate"),
      workerId,
      reason: "stale orchestrator retry",
      createdAt: evenLater,
    });

    // Either guard (expectedStatus=paused or the transition graph) rejects
    // the command. Both messages reference the worker's current status so
    // operators can see why the resume was denied.
    expect(detail).toContain(workerId);
    expect(detail.toLowerCase()).toContain("terminated");
  });
});

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

// ---------------------------------------------------------------------------
// ORC-183: parentThreadId integrity on thread.create
// ---------------------------------------------------------------------------

describe("orchestrator decider — thread.create parentThreadId integrity (ORC-183)", () => {
  function makeThreadCreate(
    overrides: Partial<Extract<OrchestrationCommand, { type: "thread.create" }>>,
  ): OrchestrationCommand {
    return {
      type: "thread.create",
      commandId: cmd("cmd-thread-create-orc183"),
      threadId: ThreadId.makeUnsafe("thread-orc183"),
      projectId,
      title: "ORC-183",
      modelSelection: { provider: "codex", model: "gpt-5-codex" },
      runtimeMode: "approval-required",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdAt: now,
      ...overrides,
    } as OrchestrationCommand;
  }

  it("accepts a null parentThreadId (top-level thread)", async () => {
    const model = modelWithProject();
    const events = await decide(model, makeThreadCreate({ parentThreadId: null }));
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("thread.created");
    expect((events[0]!.payload as { parentThreadId: unknown }).parentThreadId).toBeNull();
  });

  it("rejects a self-parented thread", async () => {
    const model = modelWithProject();
    const detail = await decideFailure(
      model,
      makeThreadCreate({
        threadId: ThreadId.makeUnsafe("thread-self"),
        parentThreadId: ThreadId.makeUnsafe("thread-self"),
      }),
    );
    expect(detail).toContain("cannot be its own parent");
  });

  it("rejects a parentThreadId that does not match any known thread", async () => {
    const model = modelWithProject();
    const detail = await decideFailure(
      model,
      makeThreadCreate({
        parentThreadId: ThreadId.makeUnsafe("thread-ghost"),
      }),
    );
    expect(detail).toContain("does not match any known thread");
  });

  it("rejects a parentThreadId belonging to a different project", async () => {
    const otherProjectId = ProjectId.makeUnsafe("project-other");
    const baseModel = modelWithProject();
    const otherProjectModel: OrchestrationReadModel = {
      ...baseModel,
      projects: [
        ...baseModel.projects,
        {
          id: otherProjectId,
          title: "Other",
          workspaceRoot: "/tmp/other",
          defaultModelSelection: { provider: "codex", model: "gpt-5-codex" },
          scripts: [],
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        },
      ],
    };

    // Create a parent thread in the OTHER project.
    const parentInOtherProject = makeThreadCreate({
      commandId: cmd("cmd-parent-other-project"),
      threadId: ThreadId.makeUnsafe("thread-parent-other"),
      projectId: otherProjectId,
      parentThreadId: null,
    });
    const modelWithCrossProjectParent = await applyCommands(otherProjectModel, [
      parentInOtherProject,
    ]);

    // Now try to create a thread in the original project that points at
    // the parent in the OTHER project.
    const detail = await decideFailure(
      modelWithCrossProjectParent,
      makeThreadCreate({
        commandId: cmd("cmd-cross-project-link"),
        threadId: ThreadId.makeUnsafe("thread-spoof"),
        parentThreadId: ThreadId.makeUnsafe("thread-parent-other"),
      }),
    );
    expect(detail).toContain("belongs to project");
    expect(detail).toContain("project-other");
  });

  it("accepts a valid same-project parentThreadId", async () => {
    const baseModel = modelWithProject();
    const parent = makeThreadCreate({
      commandId: cmd("cmd-parent"),
      threadId: ThreadId.makeUnsafe("thread-parent"),
      parentThreadId: null,
    });
    const modelWithParent = await applyCommands(baseModel, [parent]);
    const events = await decide(
      modelWithParent,
      makeThreadCreate({
        commandId: cmd("cmd-child"),
        threadId: ThreadId.makeUnsafe("thread-child"),
        parentThreadId: ThreadId.makeUnsafe("thread-parent"),
      }),
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("thread.created");
    expect((events[0]!.payload as { parentThreadId: unknown }).parentThreadId).toBe(
      "thread-parent",
    );
  });
});
