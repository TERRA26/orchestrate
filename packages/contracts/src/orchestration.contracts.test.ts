import assert from "node:assert/strict";
import { it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import {
  OrchestratorRunCreateCommand,
  OrchestratorRunCancelCommand,
  OrchestratorRunCompleteCommand,
  OrchestratorTaskCreateCommand,
  OrchestratorTaskSubmitCommand,
  OrchestratorTaskAcceptCommand,
  OrchestratorTaskRejectCommand,
  OrchestratorWorkerSpawnCommand,
  OrchestratorEvidenceCaptureCommand,
  OrchestratorDecisionRecordCommand,
} from "./orchestration";

// ---------------------------------------------------------------------------
// Decoders
// ---------------------------------------------------------------------------

const decodeRunCreate = Schema.decodeUnknownEffect(OrchestratorRunCreateCommand);
const decodeRunCancel = Schema.decodeUnknownEffect(OrchestratorRunCancelCommand);
const decodeRunComplete = Schema.decodeUnknownEffect(OrchestratorRunCompleteCommand);
const decodeTaskCreate = Schema.decodeUnknownEffect(OrchestratorTaskCreateCommand);
const decodeTaskSubmit = Schema.decodeUnknownEffect(OrchestratorTaskSubmitCommand);
const decodeTaskAccept = Schema.decodeUnknownEffect(OrchestratorTaskAcceptCommand);
const decodeTaskReject = Schema.decodeUnknownEffect(OrchestratorTaskRejectCommand);
const decodeWorkerSpawn = Schema.decodeUnknownEffect(OrchestratorWorkerSpawnCommand);
const decodeEvidenceCapture = Schema.decodeUnknownEffect(OrchestratorEvidenceCaptureCommand);
const decodeDecisionRecord = Schema.decodeUnknownEffect(OrchestratorDecisionRecordCommand);

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const ISO = "2026-01-01T00:00:00.000Z";

const spawnBudget = {
  maxDepth: 2,
  maxChildren: 4,
  maxConcurrentWriters: 2,
  maxTotalWorkers: 8,
  allowedTools: ["bash", "file_write"],
  writeScope: ["src/"],
};

// ---------------------------------------------------------------------------
// OrchestratorRunCreateCommand
// ---------------------------------------------------------------------------

it.effect("decodes OrchestratorRunCreateCommand with required fields", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeRunCreate({
      type: "orchestrator.run.create",
      commandId: "cmd-1",
      runId: "run-1",
      projectId: "project-1",
      userRequest: "Refactor the auth module",
      goals: ["Split auth into separate files"],
      spawnBudget,
      createdAt: ISO,
    });
    assert.strictEqual(parsed.type, "orchestrator.run.create");
    assert.strictEqual(parsed.commandId, "cmd-1");
    assert.strictEqual(parsed.runId, "run-1");
    assert.strictEqual(parsed.projectId, "project-1");
    assert.strictEqual(parsed.userRequest, "Refactor the auth module");
    assert.deepStrictEqual(parsed.goals, ["Split auth into separate files"]);
    assert.strictEqual(parsed.constraints, undefined);
    assert.deepStrictEqual(parsed.spawnBudget, spawnBudget);
  }),
);

it.effect("decodes OrchestratorRunCreateCommand with optional constraints", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeRunCreate({
      type: "orchestrator.run.create",
      commandId: "cmd-2",
      runId: "run-2",
      projectId: "project-1",
      userRequest: "Fix tests",
      goals: ["All tests green"],
      constraints: ["Do not modify public API"],
      spawnBudget,
      createdAt: ISO,
    });
    assert.deepStrictEqual(parsed.constraints, ["Do not modify public API"]);
  }),
);

it.effect("rejects OrchestratorRunCreateCommand missing runId", () =>
  Effect.gen(function* () {
    const result = yield* Effect.exit(
      decodeRunCreate({
        type: "orchestrator.run.create",
        commandId: "cmd-3",
        // runId intentionally missing
        projectId: "project-1",
        userRequest: "Refactor",
        goals: ["goal"],
        spawnBudget,
        createdAt: ISO,
      }),
    );
    assert.strictEqual(result._tag, "Failure");
  }),
);

// ---------------------------------------------------------------------------
// OrchestratorTaskCreateCommand
// ---------------------------------------------------------------------------

it.effect("decodes OrchestratorTaskCreateCommand with full fields", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeTaskCreate({
      type: "orchestrator.task.create",
      commandId: "cmd-t1",
      taskId: "task-1",
      runId: "run-1",
      parentTaskId: "task-0",
      title: "Refactor auth middleware",
      objective: "Extract JWT validation into shared util",
      acceptanceCriteria: ["Tests pass", "No regressions"],
      stopCondition: "All criteria met",
      readScope: ["src/auth/"],
      writeScope: ["src/auth/"],
      allowedTools: ["bash"],
      evidenceRequired: ["test-result"],
      dependsOn: [],
      modelPolicy: {
        executionMode: "worker",
        preferredModels: [{ provider: "codex", model: "gpt-5.2", weight: 1, reason: "fast" }],
        requiredCapabilities: ["code-edit"],
        switchPolicy: "allow-on-retry",
        reviewMode: "same-model",
      },
      maxIterations: 5,
      createdAt: ISO,
    });
    assert.strictEqual(parsed.type, "orchestrator.task.create");
    assert.strictEqual(parsed.taskId, "task-1");
    assert.strictEqual(parsed.parentTaskId, "task-0");
    assert.strictEqual(parsed.title, "Refactor auth middleware");
    assert.strictEqual(parsed.objective, "Extract JWT validation into shared util");
    assert.deepStrictEqual(parsed.acceptanceCriteria, ["Tests pass", "No regressions"]);
    assert.strictEqual(parsed.maxIterations, 5);
  }),
);

it.effect("decodes OrchestratorTaskCreateCommand with optional parentTaskId omitted", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeTaskCreate({
      type: "orchestrator.task.create",
      commandId: "cmd-t2",
      taskId: "task-2",
      runId: "run-1",
      title: "Root task",
      objective: "Top-level objective",
      acceptanceCriteria: ["Done"],
      createdAt: ISO,
    });
    assert.strictEqual(parsed.parentTaskId, undefined);
  }),
);

// ---------------------------------------------------------------------------
// OrchestratorWorkerSpawnCommand
// ---------------------------------------------------------------------------

it.effect("decodes OrchestratorWorkerSpawnCommand with modelBinding", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeWorkerSpawn({
      type: "orchestrator.worker.spawn",
      commandId: "cmd-w1",
      workerId: "worker-1",
      runId: "run-1",
      taskId: "task-1",
      threadId: "thread-1",
      spawnBudget,
      workspace: {
        mode: "local",
        cwd: "/tmp/workspace",
        terminalIds: ["term-1"],
      },
      modelBinding: {
        workerId: "worker-1",
        provider: "codex",
        model: "gpt-5.2",
        selectedAt: ISO,
        selectedBy: "root-policy",
        selectionReason: "Preferred model for code-edit",
        inheritedFromTaskPolicy: true,
      },
      createdAt: ISO,
    });
    assert.strictEqual(parsed.type, "orchestrator.worker.spawn");
    assert.strictEqual(parsed.workerId, "worker-1");
    assert.strictEqual(parsed.threadId, "thread-1");
    assert.strictEqual(parsed.modelBinding?.provider, "codex");
    assert.strictEqual(parsed.modelBinding?.selectedBy, "root-policy");
    assert.strictEqual(parsed.modelBinding?.inheritedFromTaskPolicy, true);
  }),
);

it.effect("decodes OrchestratorWorkerSpawnCommand without modelBinding", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeWorkerSpawn({
      type: "orchestrator.worker.spawn",
      commandId: "cmd-w2",
      workerId: "worker-2",
      runId: "run-1",
      taskId: "task-1",
      threadId: "thread-2",
      spawnBudget,
      workspace: {
        mode: "worktree",
        branch: "feat/auth",
        worktreePath: "/tmp/wt",
        cwd: "/tmp/wt",
        terminalIds: [],
      },
      createdAt: ISO,
    });
    assert.strictEqual(parsed.modelBinding, undefined);
    assert.strictEqual(parsed.workspace.mode, "worktree");
    assert.strictEqual(parsed.workspace.branch, "feat/auth");
  }),
);

// ---------------------------------------------------------------------------
// OrchestratorTaskSubmitCommand
// ---------------------------------------------------------------------------

it.effect("decodes OrchestratorTaskSubmitCommand", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeTaskSubmit({
      type: "orchestrator.task.submit",
      commandId: "cmd-ts1",
      taskId: "task-1",
      workerId: "worker-1",
      summary: "Completed refactoring",
      browserAfterScreenshotRef: "browser-screenshot-after-1",
      browserAfterDomRef: "browser-dom-after-1",
      createdAt: ISO,
    });
    assert.strictEqual(parsed.type, "orchestrator.task.submit");
    assert.strictEqual(parsed.taskId, "task-1");
    assert.strictEqual(parsed.workerId, "worker-1");
    assert.strictEqual(parsed.summary, "Completed refactoring");
    assert.strictEqual(parsed.browserAfterScreenshotRef, "browser-screenshot-after-1");
    assert.strictEqual(parsed.browserAfterDomRef, "browser-dom-after-1");
  }),
);

// ---------------------------------------------------------------------------
// OrchestratorTaskAcceptCommand
// ---------------------------------------------------------------------------

it.effect("decodes OrchestratorTaskAcceptCommand", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeTaskAccept({
      type: "orchestrator.task.accept",
      commandId: "cmd-ta1",
      taskId: "task-1",
      summary: "Looks good",
      createdAt: ISO,
    });
    assert.strictEqual(parsed.type, "orchestrator.task.accept");
    assert.strictEqual(parsed.taskId, "task-1");
    assert.strictEqual(parsed.summary, "Looks good");
  }),
);

it.effect("decodes OrchestratorTaskAcceptCommand without optional summary", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeTaskAccept({
      type: "orchestrator.task.accept",
      commandId: "cmd-ta2",
      taskId: "task-2",
      createdAt: ISO,
    });
    assert.strictEqual(parsed.summary, undefined);
  }),
);

// ---------------------------------------------------------------------------
// OrchestratorTaskRejectCommand
// ---------------------------------------------------------------------------

it.effect("decodes OrchestratorTaskRejectCommand", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeTaskReject({
      type: "orchestrator.task.reject",
      commandId: "cmd-tr1",
      taskId: "task-1",
      instruction: "Tests are still failing, fix the auth test",
      createdAt: ISO,
    });
    assert.strictEqual(parsed.type, "orchestrator.task.reject");
    assert.strictEqual(parsed.taskId, "task-1");
    assert.strictEqual(parsed.instruction, "Tests are still failing, fix the auth test");
  }),
);

// ---------------------------------------------------------------------------
// OrchestratorRunCancelCommand
// ---------------------------------------------------------------------------

it.effect("decodes OrchestratorRunCancelCommand", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeRunCancel({
      type: "orchestrator.run.cancel",
      commandId: "cmd-rc1",
      runId: "run-1",
      reason: "User requested cancellation",
      createdAt: ISO,
    });
    assert.strictEqual(parsed.type, "orchestrator.run.cancel");
    assert.strictEqual(parsed.runId, "run-1");
    assert.strictEqual(parsed.reason, "User requested cancellation");
  }),
);

// ---------------------------------------------------------------------------
// OrchestratorRunCompleteCommand
// ---------------------------------------------------------------------------

it.effect("decodes OrchestratorRunCompleteCommand", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeRunComplete({
      type: "orchestrator.run.complete",
      commandId: "cmd-rco1",
      runId: "run-1",
      summary: "All tasks completed successfully",
      createdAt: ISO,
    });
    assert.strictEqual(parsed.type, "orchestrator.run.complete");
    assert.strictEqual(parsed.runId, "run-1");
    assert.strictEqual(parsed.summary, "All tasks completed successfully");
  }),
);

it.effect("decodes OrchestratorRunCompleteCommand without optional summary", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeRunComplete({
      type: "orchestrator.run.complete",
      commandId: "cmd-rco2",
      runId: "run-2",
      createdAt: ISO,
    });
    assert.strictEqual(parsed.summary, undefined);
  }),
);

// ---------------------------------------------------------------------------
// OrchestratorEvidenceCaptureCommand
// ---------------------------------------------------------------------------

it.effect("decodes OrchestratorEvidenceCaptureCommand", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeEvidenceCapture({
      type: "orchestrator.evidence.capture",
      commandId: "cmd-ev1",
      evidenceId: "ev-1",
      taskId: "task-1",
      workerId: "worker-1",
      evidenceType: "test-result",
      content: "All 42 tests passed",
      contentTruncated: false,
      metadata: { suite: "auth" },
      createdAt: ISO,
    });
    assert.strictEqual(parsed.type, "orchestrator.evidence.capture");
    assert.strictEqual(parsed.evidenceId, "ev-1");
    assert.strictEqual(parsed.evidenceType, "test-result");
    assert.strictEqual(parsed.content, "All 42 tests passed");
    assert.strictEqual(parsed.contentTruncated, false);
    assert.deepStrictEqual(parsed.metadata, { suite: "auth" });
  }),
);

it.effect("decodes OrchestratorEvidenceCaptureCommand without optional fields", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeEvidenceCapture({
      type: "orchestrator.evidence.capture",
      commandId: "cmd-ev2",
      evidenceId: "ev-2",
      taskId: "task-1",
      evidenceType: "diff",
      content: "--- a/file\n+++ b/file",
      contentTruncated: true,
      createdAt: ISO,
    });
    assert.strictEqual(parsed.workerId, undefined);
    assert.strictEqual(parsed.metadata, undefined);
  }),
);

// ---------------------------------------------------------------------------
// OrchestratorDecisionRecordCommand
// ---------------------------------------------------------------------------

it.effect("decodes OrchestratorDecisionRecordCommand", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeDecisionRecord({
      type: "orchestrator.decision.record",
      commandId: "cmd-dr1",
      decisionId: "dec-1",
      runId: "run-1",
      taskId: "task-1",
      decisionType: "delegated",
      reason: "Task requires browser validation",
      inputs: "task complexity analysis",
      createdAt: ISO,
    });
    assert.strictEqual(parsed.type, "orchestrator.decision.record");
    assert.strictEqual(parsed.decisionId, "dec-1");
    assert.strictEqual(parsed.runId, "run-1");
    assert.strictEqual(parsed.taskId, "task-1");
    assert.strictEqual(parsed.decisionType, "delegated");
    assert.strictEqual(parsed.reason, "Task requires browser validation");
    assert.strictEqual(parsed.inputs, "task complexity analysis");
  }),
);

it.effect("decodes OrchestratorDecisionRecordCommand without optional fields", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeDecisionRecord({
      type: "orchestrator.decision.record",
      commandId: "cmd-dr2",
      decisionId: "dec-2",
      runId: "run-1",
      decisionType: "completed",
      reason: "Run finished",
      createdAt: ISO,
    });
    assert.strictEqual(parsed.taskId, undefined);
    assert.strictEqual(parsed.inputs, undefined);
  }),
);
