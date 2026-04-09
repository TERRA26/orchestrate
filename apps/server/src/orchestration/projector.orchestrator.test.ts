import {
  CommandId,
  EventId,
  type OrchestrationEvent,
  type OrchestratorTaskId,
  type ThreadId,
} from "@t3tools/contracts";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { createEmptyReadModel, projectEvent } from "./projector.ts";

function makeOrchestratorEvent(input: {
  sequence: number;
  type: OrchestrationEvent["type"];
  aggregateId: string;
  payload: unknown;
}): OrchestrationEvent {
  return {
    sequence: input.sequence,
    eventId: EventId.makeUnsafe(`event-${input.sequence}`),
    type: input.type,
    aggregateKind: "orchestrator",
    aggregateId: input.aggregateId,
    occurredAt: new Date().toISOString(),
    commandId: CommandId.makeUnsafe(`cmd-${input.sequence}`),
    causationEventId: null,
    correlationId: null,
    metadata: {},
    payload: input.payload as never,
  } as unknown as OrchestrationEvent;
}

const defaultSpawnBudget = {
  maxDepth: 2,
  maxChildren: 4,
  maxConcurrentWriters: 2,
  maxTotalWorkers: 8,
  allowedTools: ["read", "write", "bash"],
  writeScope: ["src/**"],
};

describe("orchestrator projector", () => {
  it("projects orchestrator.run.created → adds run with status=active", async () => {
    const now = new Date().toISOString();
    const model = createEmptyReadModel(now);

    const next = await Effect.runPromise(
      projectEvent(
        model,
        makeOrchestratorEvent({
          sequence: 1,
          type: "orchestrator.run.created",
          aggregateId: "run-1",
          payload: {
            runId: "run-1",
            projectId: "project-1",
            userRequest: "Add unit tests",
            goals: ["100% coverage"],
            constraints: ["no external deps"],
            spawnBudget: defaultSpawnBudget,
            createdAt: now,
          },
        }),
      ),
    );

    expect(next.snapshotSequence).toBe(1);
    expect(next.orchestratorRuns!).toHaveLength(1);
    const run = next.orchestratorRuns![0]!;
    expect(run.runId).toBe("run-1");
    expect(run.projectId).toBe("project-1");
    expect(run.userRequest).toBe("Add unit tests");
    expect(run.status).toBe("active");
    expect(run.goals).toEqual(["100% coverage"]);
    expect(run.constraints).toEqual(["no external deps"]);
    expect(run.rootTaskId).toBe("" as OrchestratorTaskId);
    expect(run.createdAt).toBe(now);
  });

  it("projects orchestrator.task.created → adds task with status=pending and sets rootTaskId on first task", async () => {
    const now = new Date().toISOString();
    const model = createEmptyReadModel(now);

    // First create a run
    const afterRun = await Effect.runPromise(
      projectEvent(
        model,
        makeOrchestratorEvent({
          sequence: 1,
          type: "orchestrator.run.created",
          aggregateId: "run-1",
          payload: {
            runId: "run-1",
            projectId: "project-1",
            userRequest: "Add tests",
            goals: ["coverage"],
            spawnBudget: defaultSpawnBudget,
            createdAt: now,
          },
        }),
      ),
    );

    // Create the first task -- should set rootTaskId
    const afterTask = await Effect.runPromise(
      projectEvent(
        afterRun,
        makeOrchestratorEvent({
          sequence: 2,
          type: "orchestrator.task.created",
          aggregateId: "run-1",
          payload: {
            taskId: "task-1",
            runId: "run-1",
            title: "Root task",
            objective: "Decompose and execute",
            acceptanceCriteria: ["all tests pass"],
            createdAt: now,
          },
        }),
      ),
    );

    expect(afterTask.orchestratorTasks!).toHaveLength(1);
    const task = afterTask.orchestratorTasks![0]!;
    expect(task.taskId).toBe("task-1");
    expect(task.runId).toBe("run-1");
    expect(task.status).toBe("pending");
    expect(task.ownerKind).toBe("orchestrator");
    expect(task.iteration).toBe(0);
    expect(task.maxIterations).toBe(3);
    expect(task.checklist).toEqual([]);
    expect(task.title).toBe("Root task");
    expect(task.objective).toBe("Decompose and execute");

    // rootTaskId should now be set on the run
    const run = afterTask.orchestratorRuns![0]!;
    expect(run.rootTaskId).toBe("task-1");

    // Create a second task -- rootTaskId should NOT change
    const afterSecondTask = await Effect.runPromise(
      projectEvent(
        afterTask,
        makeOrchestratorEvent({
          sequence: 3,
          type: "orchestrator.task.created",
          aggregateId: "run-1",
          payload: {
            taskId: "task-2",
            runId: "run-1",
            parentTaskId: "task-1",
            title: "Sub task",
            objective: "Write the test file",
            acceptanceCriteria: ["file exists"],
            createdAt: now,
          },
        }),
      ),
    );

    expect(afterSecondTask.orchestratorTasks!).toHaveLength(2);
    // rootTaskId should still be task-1
    expect(afterSecondTask.orchestratorRuns![0]!.rootTaskId).toBe("task-1");
    // Second task should have parentTaskId set
    expect(afterSecondTask.orchestratorTasks![1]!.parentTaskId).toBe("task-1");
  });

  it("projects orchestrator.task.assigned → sets status=assigned with ownerKind and ownerId", async () => {
    const now = new Date().toISOString();
    const later = new Date(Date.parse(now) + 1_000).toISOString();
    const model = createEmptyReadModel(now);

    // Create run and task
    const afterRun = await Effect.runPromise(
      projectEvent(
        model,
        makeOrchestratorEvent({
          sequence: 1,
          type: "orchestrator.run.created",
          aggregateId: "run-1",
          payload: {
            runId: "run-1",
            projectId: "project-1",
            userRequest: "Build feature",
            goals: ["feature complete"],
            spawnBudget: defaultSpawnBudget,
            createdAt: now,
          },
        }),
      ),
    );

    const afterTask = await Effect.runPromise(
      projectEvent(
        afterRun,
        makeOrchestratorEvent({
          sequence: 2,
          type: "orchestrator.task.created",
          aggregateId: "run-1",
          payload: {
            taskId: "task-1",
            runId: "run-1",
            title: "Implement feature",
            objective: "Code it up",
            acceptanceCriteria: ["builds"],
            createdAt: now,
          },
        }),
      ),
    );

    // Assign the task
    const afterAssign = await Effect.runPromise(
      projectEvent(
        afterTask,
        makeOrchestratorEvent({
          sequence: 3,
          type: "orchestrator.task.assigned",
          aggregateId: "run-1",
          payload: {
            taskId: "task-1",
            assigneeKind: "worker",
            assigneeId: "worker-1",
            assignedAt: later,
          },
        }),
      ),
    );

    const task = afterAssign.orchestratorTasks![0]!;
    expect(task.status).toBe("assigned");
    expect(task.ownerKind).toBe("worker");
    expect(task.ownerId).toBe("worker-1");
    expect(task.assignedWorkerId).toBe("worker-1");
    expect(task.updatedAt).toBe(later);
  });

  it("projects orchestrator.worker.spawned → adds worker with status=running and marks task as running", async () => {
    const now = new Date().toISOString();
    const later = new Date(Date.parse(now) + 1_000).toISOString();
    const model = createEmptyReadModel(now);

    // Create run and task
    const afterRun = await Effect.runPromise(
      projectEvent(
        model,
        makeOrchestratorEvent({
          sequence: 1,
          type: "orchestrator.run.created",
          aggregateId: "run-1",
          payload: {
            runId: "run-1",
            projectId: "project-1",
            userRequest: "Build feature",
            goals: ["done"],
            spawnBudget: defaultSpawnBudget,
            createdAt: now,
          },
        }),
      ),
    );

    const afterTask = await Effect.runPromise(
      projectEvent(
        afterRun,
        makeOrchestratorEvent({
          sequence: 2,
          type: "orchestrator.task.created",
          aggregateId: "run-1",
          payload: {
            taskId: "task-1",
            runId: "run-1",
            title: "Do work",
            objective: "Write code",
            acceptanceCriteria: ["compiles"],
            createdAt: now,
          },
        }),
      ),
    );

    const modelBinding = {
      workerId: "worker-1",
      provider: "codex",
      model: "gpt-5-codex",
      selectedAt: later,
      selectedBy: "root-policy",
      selectionReason: "default",
      inheritedFromTaskPolicy: false,
    };

    // Spawn worker
    const afterSpawn = await Effect.runPromise(
      projectEvent(
        afterTask,
        makeOrchestratorEvent({
          sequence: 3,
          type: "orchestrator.worker.spawned",
          aggregateId: "run-1",
          payload: {
            workerId: "worker-1",
            runId: "run-1",
            taskId: "task-1",
            threadId: "thread-1" as ThreadId,
            spawnBudget: defaultSpawnBudget,
            workspace: {
              mode: "local",
              cwd: "/tmp/work",
              terminalIds: [],
            },
            modelBinding,
            spawnedAt: later,
          },
        }),
      ),
    );

    expect(afterSpawn.orchestratorWorkers!).toHaveLength(1);
    const worker = afterSpawn.orchestratorWorkers![0]!;
    expect(worker.workerId).toBe("worker-1");
    expect(worker.runId).toBe("run-1");
    expect(worker.threadId).toBe("thread-1");
    expect(worker.status).toBe("running");
    expect(worker.activeTaskId).toBe("task-1");
    expect(worker.modelBinding?.provider).toBe("codex");
    expect(worker.modelBinding?.model).toBe("gpt-5-codex");
    expect(worker.createdAt).toBe(later);

    // Task should be marked as running with worker assigned
    const task = afterSpawn.orchestratorTasks![0]!;
    expect(task.status).toBe("running");
    expect(task.assignedWorkerId).toBe("worker-1");
  });

  it("projects orchestrator.run.cancelled → sets run status to cancelled", async () => {
    const now = new Date().toISOString();
    const later = new Date(Date.parse(now) + 5_000).toISOString();
    const model = createEmptyReadModel(now);

    const afterRun = await Effect.runPromise(
      projectEvent(
        model,
        makeOrchestratorEvent({
          sequence: 1,
          type: "orchestrator.run.created",
          aggregateId: "run-1",
          payload: {
            runId: "run-1",
            projectId: "project-1",
            userRequest: "Build feature",
            goals: ["done"],
            spawnBudget: defaultSpawnBudget,
            createdAt: now,
          },
        }),
      ),
    );

    const afterCancel = await Effect.runPromise(
      projectEvent(
        afterRun,
        makeOrchestratorEvent({
          sequence: 2,
          type: "orchestrator.run.cancelled",
          aggregateId: "run-1",
          payload: {
            runId: "run-1",
            reason: "User requested cancellation",
            cancelledAt: later,
          },
        }),
      ),
    );

    expect(afterCancel.orchestratorRuns!).toHaveLength(1);
    const run = afterCancel.orchestratorRuns![0]!;
    expect(run.status).toBe("cancelled");
    expect(run.updatedAt).toBe(later);
    expect(run.completedAt).toBe(later);
  });

  it("projects orchestrator.task.rejected → sets status=needs-rework and increments iteration", async () => {
    const now = new Date().toISOString();
    const later = new Date(Date.parse(now) + 1_000).toISOString();
    const evenLater = new Date(Date.parse(now) + 2_000).toISOString();
    const model = createEmptyReadModel(now);

    // Create run + task
    const afterRun = await Effect.runPromise(
      projectEvent(
        model,
        makeOrchestratorEvent({
          sequence: 1,
          type: "orchestrator.run.created",
          aggregateId: "run-1",
          payload: {
            runId: "run-1",
            projectId: "project-1",
            userRequest: "Implement X",
            goals: ["X works"],
            spawnBudget: defaultSpawnBudget,
            createdAt: now,
          },
        }),
      ),
    );

    const afterTask = await Effect.runPromise(
      projectEvent(
        afterRun,
        makeOrchestratorEvent({
          sequence: 2,
          type: "orchestrator.task.created",
          aggregateId: "run-1",
          payload: {
            taskId: "task-1",
            runId: "run-1",
            title: "Write code",
            objective: "Implement feature X",
            acceptanceCriteria: ["tests pass"],
            createdAt: now,
          },
        }),
      ),
    );

    // Verify initial iteration is 0
    expect(afterTask.orchestratorTasks![0]!.iteration).toBe(0);

    // First rejection
    const afterReject1 = await Effect.runPromise(
      projectEvent(
        afterTask,
        makeOrchestratorEvent({
          sequence: 3,
          type: "orchestrator.task.rejected",
          aggregateId: "run-1",
          payload: {
            taskId: "task-1",
            instruction: "Tests still failing, fix error handling",
            rejectedAt: later,
          },
        }),
      ),
    );

    const taskAfterReject1 = afterReject1.orchestratorTasks![0]!;
    expect(taskAfterReject1.status).toBe("needs-rework");
    expect(taskAfterReject1.iteration).toBe(1);
    expect(taskAfterReject1.updatedAt).toBe(later);

    // Second rejection
    const afterReject2 = await Effect.runPromise(
      projectEvent(
        afterReject1,
        makeOrchestratorEvent({
          sequence: 4,
          type: "orchestrator.task.rejected",
          aggregateId: "run-1",
          payload: {
            taskId: "task-1",
            instruction: "Still broken, try different approach",
            rejectedAt: evenLater,
          },
        }),
      ),
    );

    const taskAfterReject2 = afterReject2.orchestratorTasks![0]!;
    expect(taskAfterReject2.status).toBe("needs-rework");
    expect(taskAfterReject2.iteration).toBe(2);
    expect(taskAfterReject2.updatedAt).toBe(evenLater);
  });

  it("projects orchestrator.run.completed → sets run status to completed with summary", async () => {
    const now = new Date().toISOString();
    const later = new Date(Date.parse(now) + 5_000).toISOString();
    const model = createEmptyReadModel(now);

    const afterRun = await Effect.runPromise(
      projectEvent(
        model,
        makeOrchestratorEvent({
          sequence: 1,
          type: "orchestrator.run.created",
          aggregateId: "run-1",
          payload: {
            runId: "run-1",
            projectId: "project-1",
            userRequest: "Build feature",
            goals: ["done"],
            spawnBudget: defaultSpawnBudget,
            createdAt: now,
          },
        }),
      ),
    );

    const afterComplete = await Effect.runPromise(
      projectEvent(
        afterRun,
        makeOrchestratorEvent({
          sequence: 2,
          type: "orchestrator.run.completed",
          aggregateId: "run-1",
          payload: {
            runId: "run-1",
            summary: "All tasks finished successfully",
            completedAt: later,
          },
        }),
      ),
    );

    const run = afterComplete.orchestratorRuns![0]!;
    expect(run.status).toBe("completed");
    expect(run.updatedAt).toBe(later);
    expect(run.completedAt).toBe(later);
    expect(run.completionSummary).toBe("All tasks finished successfully");
  });

  it("projects orchestrator.worker.spawned without modelBinding", async () => {
    const now = new Date().toISOString();
    const model = createEmptyReadModel(now);

    const afterRun = await Effect.runPromise(
      projectEvent(
        model,
        makeOrchestratorEvent({
          sequence: 1,
          type: "orchestrator.run.created",
          aggregateId: "run-1",
          payload: {
            runId: "run-1",
            projectId: "project-1",
            userRequest: "Work",
            goals: ["done"],
            spawnBudget: defaultSpawnBudget,
            createdAt: now,
          },
        }),
      ),
    );

    const afterTask = await Effect.runPromise(
      projectEvent(
        afterRun,
        makeOrchestratorEvent({
          sequence: 2,
          type: "orchestrator.task.created",
          aggregateId: "run-1",
          payload: {
            taskId: "task-1",
            runId: "run-1",
            title: "Task",
            objective: "Do things",
            acceptanceCriteria: ["done"],
            createdAt: now,
          },
        }),
      ),
    );

    // Spawn worker without modelBinding (optional field)
    const afterSpawn = await Effect.runPromise(
      projectEvent(
        afterTask,
        makeOrchestratorEvent({
          sequence: 3,
          type: "orchestrator.worker.spawned",
          aggregateId: "run-1",
          payload: {
            workerId: "worker-no-binding",
            runId: "run-1",
            taskId: "task-1",
            threadId: "thread-1" as ThreadId,
            spawnBudget: defaultSpawnBudget,
            workspace: {
              mode: "worktree",
              branch: "feat/test",
              worktreePath: "/tmp/wt",
              cwd: "/tmp/wt",
              terminalIds: ["term-1"],
            },
            spawnedAt: now,
          },
        }),
      ),
    );

    const worker = afterSpawn.orchestratorWorkers![0]!;
    expect(worker.workerId).toBe("worker-no-binding");
    expect(worker.status).toBe("running");
    expect(worker.modelBinding).toBeUndefined();
    expect(worker.workspace.mode).toBe("worktree");
    expect(worker.workspace.branch).toBe("feat/test");
  });

  it("projects orchestrator.run.failed → sets run status to failed with reason", async () => {
    const now = new Date().toISOString();
    const later = new Date(Date.parse(now) + 3_000).toISOString();
    const model = createEmptyReadModel(now);

    const afterRun = await Effect.runPromise(
      projectEvent(
        model,
        makeOrchestratorEvent({
          sequence: 1,
          type: "orchestrator.run.created",
          aggregateId: "run-1",
          payload: {
            runId: "run-1",
            projectId: "project-1",
            userRequest: "Deploy",
            goals: ["deployed"],
            spawnBudget: defaultSpawnBudget,
            createdAt: now,
          },
        }),
      ),
    );

    const afterFail = await Effect.runPromise(
      projectEvent(
        afterRun,
        makeOrchestratorEvent({
          sequence: 2,
          type: "orchestrator.run.failed",
          aggregateId: "run-1",
          payload: {
            runId: "run-1",
            reason: "Max iterations exceeded",
            failedAt: later,
          },
        }),
      ),
    );

    const run = afterFail.orchestratorRuns![0]!;
    expect(run.status).toBe("failed");
    expect(run.updatedAt).toBe(later);
    expect(run.completedAt).toBe(later);
    expect(run.completionSummary).toBe("Max iterations exceeded");
  });

  it("projects orchestrator.worker.terminated → sets worker status to terminated", async () => {
    const now = new Date().toISOString();
    const later = new Date(Date.parse(now) + 2_000).toISOString();
    const model = createEmptyReadModel(now);

    // Build up: run -> task -> worker
    const afterRun = await Effect.runPromise(
      projectEvent(
        model,
        makeOrchestratorEvent({
          sequence: 1,
          type: "orchestrator.run.created",
          aggregateId: "run-1",
          payload: {
            runId: "run-1",
            projectId: "project-1",
            userRequest: "Work",
            goals: ["done"],
            spawnBudget: defaultSpawnBudget,
            createdAt: now,
          },
        }),
      ),
    );

    const afterTask = await Effect.runPromise(
      projectEvent(
        afterRun,
        makeOrchestratorEvent({
          sequence: 2,
          type: "orchestrator.task.created",
          aggregateId: "run-1",
          payload: {
            taskId: "task-1",
            runId: "run-1",
            title: "Task",
            objective: "Work",
            acceptanceCriteria: ["done"],
            createdAt: now,
          },
        }),
      ),
    );

    const afterSpawn = await Effect.runPromise(
      projectEvent(
        afterTask,
        makeOrchestratorEvent({
          sequence: 3,
          type: "orchestrator.worker.spawned",
          aggregateId: "run-1",
          payload: {
            workerId: "worker-1",
            runId: "run-1",
            taskId: "task-1",
            threadId: "thread-1" as ThreadId,
            spawnBudget: defaultSpawnBudget,
            workspace: { mode: "local", cwd: "/tmp", terminalIds: [] },
            spawnedAt: now,
          },
        }),
      ),
    );

    expect(afterSpawn.orchestratorWorkers![0]!.status).toBe("running");

    const afterTerminate = await Effect.runPromise(
      projectEvent(
        afterSpawn,
        makeOrchestratorEvent({
          sequence: 4,
          type: "orchestrator.worker.terminated",
          aggregateId: "run-1",
          payload: {
            workerId: "worker-1",
            reason: "Task completed",
            terminatedAt: later,
          },
        }),
      ),
    );

    const worker = afterTerminate.orchestratorWorkers![0]!;
    expect(worker.status).toBe("terminated");
    expect(worker.terminatedAt).toBe(later);
    expect(worker.terminationReason).toBe("Task completed");
    expect(worker.updatedAt).toBe(later);
  });
});
