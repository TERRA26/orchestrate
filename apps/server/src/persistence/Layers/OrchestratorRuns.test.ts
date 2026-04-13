import {
  OrchestratorRunId,
  OrchestratorTaskId,
  OrchestratorWorkerId,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";

import { OrchestratorRunsRepository } from "../Services/OrchestratorRuns.ts";
import { OrchestratorRunsRepositoryLive } from "./OrchestratorRuns.ts";
import { SqlitePersistenceMemory } from "./Sqlite.ts";

const layer = it.layer(
  OrchestratorRunsRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
);

const now = "2026-04-09T12:00:00.000Z";
const later = "2026-04-09T13:00:00.000Z";

layer("OrchestratorRunsRepository", (it) => {
  // -----------------------------------------------------------------------
  // 1. Round-trip a run through insert and query
  // -----------------------------------------------------------------------
  it.effect("round-trips a run through upsert and getRunById", () =>
    Effect.gen(function* () {
      const repo = yield* OrchestratorRunsRepository;

      const run = {
        runId: OrchestratorRunId.makeUnsafe("run-roundtrip-1"),
        projectId: ProjectId.makeUnsafe("proj-roundtrip-1"),
        userRequest: "Implement the frobulator",
        status: "active" as const,
        rootTaskId: "task-root-1",
        goalsJson: JSON.stringify(["goal-a", "goal-b"]),
        constraintsJson: JSON.stringify({ maxFiles: 10 }),
        spawnBudgetJson: JSON.stringify({ maxWorkers: 3 }),
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        completionSummary: null,
      };

      yield* repo.upsertRun(run);

      const result = yield* repo.getRunById({
        runId: OrchestratorRunId.makeUnsafe("run-roundtrip-1"),
      });
      assert.ok(Option.isSome(result));

      const persisted = Option.getOrThrow(result);
      assert.strictEqual(persisted.runId, run.runId);
      assert.strictEqual(persisted.projectId, run.projectId);
      assert.strictEqual(persisted.userRequest, run.userRequest);
      assert.strictEqual(persisted.status, "active");
      assert.strictEqual(persisted.rootTaskId, run.rootTaskId);
      assert.strictEqual(persisted.goalsJson, run.goalsJson);
      assert.strictEqual(persisted.constraintsJson, run.constraintsJson);
      assert.strictEqual(persisted.spawnBudgetJson, run.spawnBudgetJson);
      assert.strictEqual(persisted.createdAt, now);
      assert.strictEqual(persisted.completedAt, null);
      assert.strictEqual(persisted.completionSummary, null);
    }),
  );

  // -----------------------------------------------------------------------
  // 2. Round-trip a task with all fields (including JSON fields)
  // -----------------------------------------------------------------------
  it.effect("round-trips a task with all fields including JSON columns", () =>
    Effect.gen(function* () {
      const repo = yield* OrchestratorRunsRepository;

      // Insert a parent run first (FK dependency)
      yield* repo.upsertRun({
        runId: OrchestratorRunId.makeUnsafe("run-task-rt"),
        projectId: ProjectId.makeUnsafe("proj-task-rt"),
        userRequest: "Task round-trip parent run",
        status: "active" as const,
        rootTaskId: "task-rt-root",
        goalsJson: "[]",
        constraintsJson: null,
        spawnBudgetJson: "{}",
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        completionSummary: null,
      });

      const task = {
        taskId: OrchestratorTaskId.makeUnsafe("task-rt-1"),
        runId: OrchestratorRunId.makeUnsafe("run-task-rt"),
        parentTaskId: null,
        title: "Implement feature X",
        objective: "Build the X subsystem end-to-end",
        status: "pending" as const,
        ownerKind: "orchestrator",
        ownerId: null,
        stopCondition: "tests pass",
        readScopeJson: JSON.stringify(["src/**"]),
        writeScopeJson: JSON.stringify(["src/feature-x/**"]),
        allowedToolsJson: JSON.stringify(["read", "write", "bash"]),
        evidenceRequiredJson: JSON.stringify(["test-result"]),
        escalationRules: "escalate on failure",
        acceptanceCriteriaJson: JSON.stringify(["all tests green"]),
        checklistJson: JSON.stringify([{ step: "write tests", done: false }]),
        dependsOnJson: null,
        blockedBy: null,
        modelPolicyJson: JSON.stringify({ preferred: "claude-opus-4-6", fallback: "gpt-5" }),
        assignedWorkerId: null,
        iteration: 0,
        maxIterations: 3,
        createdAt: now,
        updatedAt: now,
        submittedAt: null,
        acceptedAt: null,
      };

      yield* repo.upsertTask(task);

      const tasks = yield* repo.getTasksByRunId({
        runId: OrchestratorRunId.makeUnsafe("run-task-rt"),
      });
      assert.strictEqual(tasks.length, 1);

      const persisted = tasks[0]!;
      assert.strictEqual(persisted.taskId, task.taskId);
      assert.strictEqual(persisted.runId, task.runId);
      assert.strictEqual(persisted.parentTaskId, null);
      assert.strictEqual(persisted.title, task.title);
      assert.strictEqual(persisted.objective, task.objective);
      assert.strictEqual(persisted.status, "pending");
      assert.strictEqual(persisted.ownerKind, "orchestrator");
      assert.strictEqual(persisted.stopCondition, "tests pass");
      assert.strictEqual(persisted.readScopeJson, task.readScopeJson);
      assert.strictEqual(persisted.writeScopeJson, task.writeScopeJson);
      assert.strictEqual(persisted.allowedToolsJson, task.allowedToolsJson);
      assert.strictEqual(persisted.evidenceRequiredJson, task.evidenceRequiredJson);
      assert.strictEqual(persisted.escalationRules, task.escalationRules);
      assert.strictEqual(persisted.acceptanceCriteriaJson, task.acceptanceCriteriaJson);
      assert.strictEqual(persisted.checklistJson, task.checklistJson);
      assert.strictEqual(persisted.modelPolicyJson, task.modelPolicyJson);
      assert.strictEqual(persisted.assignedWorkerId, null);
      assert.strictEqual(persisted.iteration, 0);
      assert.strictEqual(persisted.maxIterations, 3);
      assert.strictEqual(persisted.submittedAt, null);
      assert.strictEqual(persisted.acceptedAt, null);
    }),
  );

  // -----------------------------------------------------------------------
  // 3. Round-trip a worker with modelBinding (JSON field)
  // -----------------------------------------------------------------------
  it.effect("round-trips a worker with modelBindingJson", () =>
    Effect.gen(function* () {
      const repo = yield* OrchestratorRunsRepository;

      // Insert a parent run first
      yield* repo.upsertRun({
        runId: OrchestratorRunId.makeUnsafe("run-worker-rt"),
        projectId: ProjectId.makeUnsafe("proj-worker-rt"),
        userRequest: "Worker round-trip parent run",
        status: "active" as const,
        rootTaskId: "task-worker-root",
        goalsJson: "[]",
        constraintsJson: null,
        spawnBudgetJson: "{}",
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        completionSummary: null,
      });

      const modelBinding = {
        provider: "claudeAgent",
        model: "claude-opus-4-6",
        temperature: 0.7,
        maxTokens: 8192,
      };

      const worker = {
        workerId: OrchestratorWorkerId.makeUnsafe("worker-rt-1"),
        runId: OrchestratorRunId.makeUnsafe("run-worker-rt"),
        threadId: ThreadId.makeUnsafe("thread-worker-rt-1"),
        status: "idle" as const,
        visibility: "foreground" as const,
        activeTaskId: null,
        parentWorkerId: null,
        spawnBudgetJson: JSON.stringify({ maxSubWorkers: 2 }),
        workspaceJson: JSON.stringify({ root: "/tmp/workspace" }),
        modelBindingJson: JSON.stringify(modelBinding),
        createdAt: now,
        updatedAt: now,
        terminatedAt: null,
        terminationReason: null,
      };

      yield* repo.upsertWorker(worker);

      const workers = yield* repo.getWorkersByRunId({
        runId: OrchestratorRunId.makeUnsafe("run-worker-rt"),
      });
      assert.strictEqual(workers.length, 1);

      const persisted = workers[0]!;
      assert.strictEqual(persisted.workerId, worker.workerId);
      assert.strictEqual(persisted.runId, worker.runId);
      assert.strictEqual(persisted.threadId, worker.threadId);
      assert.strictEqual(persisted.status, "idle");
      assert.strictEqual(persisted.visibility, "foreground");
      assert.strictEqual(persisted.activeTaskId, null);
      assert.strictEqual(persisted.parentWorkerId, null);
      assert.strictEqual(persisted.spawnBudgetJson, worker.spawnBudgetJson);
      assert.strictEqual(persisted.workspaceJson, worker.workspaceJson);
      assert.strictEqual(persisted.modelBindingJson, worker.modelBindingJson);
      assert.deepStrictEqual(JSON.parse(persisted.modelBindingJson!), modelBinding);
      assert.strictEqual(persisted.terminatedAt, null);
      assert.strictEqual(persisted.terminationReason, null);
    }),
  );

  // -----------------------------------------------------------------------
  // 4. Update run status on re-upsert
  // -----------------------------------------------------------------------
  it.effect("updates run status on re-upsert", () =>
    Effect.gen(function* () {
      const repo = yield* OrchestratorRunsRepository;

      const runId = OrchestratorRunId.makeUnsafe("run-upsert-status");

      // Insert initial run as active
      yield* repo.upsertRun({
        runId,
        projectId: ProjectId.makeUnsafe("proj-upsert-status"),
        userRequest: "Status update test",
        status: "active" as const,
        rootTaskId: "task-upsert-root",
        goalsJson: JSON.stringify(["goal-1"]),
        constraintsJson: null,
        spawnBudgetJson: "{}",
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        completionSummary: null,
      });

      // Verify it's active and shows in getActiveRuns
      const activeRuns = yield* repo.getActiveRuns();
      const activeMatch = activeRuns.find((r) => r.runId === runId);
      assert.ok(activeMatch, "Run should appear in active runs");
      assert.strictEqual(activeMatch!.status, "active");

      // Re-upsert with completed status
      yield* repo.upsertRun({
        runId,
        projectId: ProjectId.makeUnsafe("proj-upsert-status"),
        userRequest: "Status update test",
        status: "completed" as const,
        rootTaskId: "task-upsert-root",
        goalsJson: JSON.stringify(["goal-1"]),
        constraintsJson: null,
        spawnBudgetJson: "{}",
        createdAt: now,
        updatedAt: later,
        completedAt: later,
        completionSummary: "All tasks completed successfully",
      });

      // Verify status was updated
      const result = yield* repo.getRunById({ runId });
      assert.ok(Option.isSome(result));

      const persisted = Option.getOrThrow(result);
      assert.strictEqual(persisted.status, "completed");
      assert.strictEqual(persisted.updatedAt, later);
      assert.strictEqual(persisted.completedAt, later);
      assert.strictEqual(persisted.completionSummary, "All tasks completed successfully");

      // Verify it no longer appears in active runs
      const activeRunsAfter = yield* repo.getActiveRuns();
      const staleMatch = activeRunsAfter.find((r) => r.runId === runId);
      assert.strictEqual(staleMatch, undefined, "Completed run should not appear in active runs");
    }),
  );
});
