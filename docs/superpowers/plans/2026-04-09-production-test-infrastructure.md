# Production Test Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a layered test infrastructure that validates claims at the layer where they actually fail, replacing the "tests pass = product works" assumption with a production-grade validation matrix.

**Architecture:** Ten test layers organized from fastest/cheapest (contract schema decode) to slowest/richest (live-provider smoke, UI e2e). Each layer catches a distinct class of failure. Lower layers run in CI unconditionally; upper layers are opt-in gates. A top-level `bun run test:gate` script runs all mandatory layers and reports pass/fail per layer.

**Tech Stack:** Vitest, Effect/Schema, @effect/vitest, Playwright (browser tests), ws (websocket client), bun test runner, SQLite in-memory persistence.

---

## File Map

### New Files

| File                                                                     | Responsibility                                                                |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `packages/contracts/src/orchestration.contracts.test.ts`                 | Contract schema stability tests for orchestrator commands/events              |
| `apps/server/src/orchestration/decider.orchestrator.test.ts`             | Decider tests for all orchestrator command→event transitions                  |
| `apps/server/src/orchestration/projector.orchestrator.test.ts`           | Projector tests for orchestrator event→read-model projections                 |
| `apps/server/src/persistence/Layers/OrchestratorRuns.test.ts`            | Persistence round-trip tests for runs/tasks/workers/evidence/decisions        |
| `apps/server/src/orchestration/Layers/orchestratorIntegration.test.ts`   | Runtime integration: run→task→worker→submit→review flow with mocked providers |
| `apps/server/src/wsServer.orchestrator.test.ts`                          | WebSocket smoke: full orchestrator journey over real server                   |
| `apps/server/src/integration/liveProvider.smoke.test.ts`                 | Live-provider smoke: opt-in tests against real dev server with real CLIs      |
| `apps/web/src/components/orchestrator/OrchestratorPanel.e2e.browser.tsx` | Playwright thin-panel UI e2e tests                                            |
| `apps/server/src/orchestration/recovery.test.ts`                         | Recovery tests: restart, reconnect, cancellation during active run            |
| `scripts/test-gate.ts`                                                   | Release gate runner: executes all mandatory layers, reports matrix            |

### Modified Files

| File                       | Change                                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`             | Add `test:gate`, `test:contracts`, `test:decider`, `test:projector`, `test:persistence`, `test:integration`, `test:smoke`, `test:e2e` scripts |
| `apps/server/package.json` | Add per-layer test scripts                                                                                                                    |
| `apps/web/package.json`    | Add `test:e2e` script for Playwright orchestrator tests                                                                                       |

---

## Task 1: Contract Schema Stability Tests

**Files:**

- Create: `packages/contracts/src/orchestration.contracts.test.ts`

These tests catch schema drift. If a field is renamed, removed, or has its type changed, these fail immediately. This prevents "invalid body" runtime errors that hide behind vague decode failures.

- [ ] **Step 1: Write failing tests for orchestrator command decode stability**

```typescript
// packages/contracts/src/orchestration.contracts.test.ts
import { it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import assert from "node:assert/strict";
import {
  OrchestratorRunCreateCommand,
  OrchestratorTaskCreateCommand,
  OrchestratorTaskAssignCommand,
  OrchestratorTaskSubmitCommand,
  OrchestratorTaskAcceptCommand,
  OrchestratorTaskRejectCommand,
  OrchestratorWorkerSpawnCommand,
  OrchestratorEvidenceCaptureCommand,
  OrchestratorDecisionRecordCommand,
  OrchestratorRunCancelCommand,
  OrchestratorRunCompleteCommand,
  OrchestratorRunFailCommand,
  OrchestratorTaskBlockCommand,
  OrchestratorTaskCancelCommand,
  OrchestratorTaskFailCommand,
  OrchestratorWorkerTerminateCommand,
} from "./orchestration";

const decode = <A, I>(schema: Schema.Schema<A, I>) => Schema.decodeUnknownEffect(schema);

it.effect("decodes OrchestratorRunCreateCommand with all required fields", () =>
  Effect.gen(function* () {
    const parsed = yield* decode(OrchestratorRunCreateCommand)({
      type: "orchestrator.run.create",
      commandId: "cmd-1",
      runId: "run-1",
      projectId: "project-1",
      userRequest: "Build a landing page",
      goals: ["goal-1", "goal-2"],
      spawnBudget: {
        maxDepth: 2,
        maxChildren: 3,
        maxConcurrentWriters: 1,
        maxTotalWorkers: 4,
        allowedTools: ["edit", "search"],
        writeScope: ["/src"],
      },
      createdAt: new Date().toISOString(),
    });
    assert.equal(parsed.type, "orchestrator.run.create");
    assert.equal(parsed.runId, "run-1");
    assert.equal(parsed.goals.length, 2);
  }),
);

it.effect("decodes OrchestratorRunCreateCommand with optional constraints", () =>
  Effect.gen(function* () {
    const parsed = yield* decode(OrchestratorRunCreateCommand)({
      type: "orchestrator.run.create",
      commandId: "cmd-2",
      runId: "run-2",
      projectId: "project-1",
      userRequest: "Build a landing page",
      goals: ["goal-1"],
      constraints: "No external dependencies",
      spawnBudget: {
        maxDepth: 1,
        maxChildren: 1,
        maxConcurrentWriters: 1,
        maxTotalWorkers: 1,
        allowedTools: [],
        writeScope: [],
      },
      createdAt: new Date().toISOString(),
    });
    assert.equal(parsed.constraints, "No external dependencies");
  }),
);

it.effect("rejects OrchestratorRunCreateCommand with missing runId", () =>
  Effect.gen(function* () {
    const result = yield* Effect.exit(
      decode(OrchestratorRunCreateCommand)({
        type: "orchestrator.run.create",
        commandId: "cmd-3",
        projectId: "project-1",
        userRequest: "Build a page",
        goals: [],
        spawnBudget: {
          maxDepth: 1,
          maxChildren: 1,
          maxConcurrentWriters: 1,
          maxTotalWorkers: 1,
          allowedTools: [],
          writeScope: [],
        },
        createdAt: new Date().toISOString(),
      }),
    );
    assert.equal(result._tag, "Failure");
  }),
);

it.effect("decodes OrchestratorTaskCreateCommand with full fields", () =>
  Effect.gen(function* () {
    const parsed = yield* decode(OrchestratorTaskCreateCommand)({
      type: "orchestrator.task.create",
      commandId: "cmd-task-1",
      taskId: "task-1",
      runId: "run-1",
      title: "Implement auth",
      objective: "Add OAuth2 login flow",
      acceptanceCriteria: "Users can log in with Google",
      stopCondition: "Tests pass",
      readScope: ["/src"],
      writeScope: ["/src/auth"],
      allowedTools: ["edit"],
      evidenceRequired: true,
      modelPolicy: { preferredProvider: "claudeAgent" },
      maxIterations: 3,
      createdAt: new Date().toISOString(),
    });
    assert.equal(parsed.taskId, "task-1");
    assert.equal(parsed.title, "Implement auth");
  }),
);

it.effect("decodes OrchestratorTaskCreateCommand with optional parentTaskId", () =>
  Effect.gen(function* () {
    const parsed = yield* decode(OrchestratorTaskCreateCommand)({
      type: "orchestrator.task.create",
      commandId: "cmd-task-2",
      taskId: "task-2",
      runId: "run-1",
      parentTaskId: "task-1",
      title: "Sub-task",
      objective: "Do part of it",
      acceptanceCriteria: "Done",
      stopCondition: "Done",
      readScope: [],
      writeScope: [],
      allowedTools: [],
      evidenceRequired: false,
      maxIterations: 1,
      createdAt: new Date().toISOString(),
    });
    assert.equal(parsed.parentTaskId, "task-1");
  }),
);

it.effect("decodes OrchestratorWorkerSpawnCommand with modelBinding", () =>
  Effect.gen(function* () {
    const now = new Date().toISOString();
    const parsed = yield* decode(OrchestratorWorkerSpawnCommand)({
      type: "orchestrator.worker.spawn",
      commandId: "cmd-worker-1",
      workerId: "worker-1",
      runId: "run-1",
      taskId: "task-1",
      threadId: "thread-1",
      spawnBudget: {
        maxDepth: 1,
        maxChildren: 0,
        maxConcurrentWriters: 1,
        maxTotalWorkers: 1,
        allowedTools: ["edit"],
        writeScope: [],
      },
      workspace: {
        mode: "local",
        cwd: "/tmp/work",
        terminalIds: [],
      },
      modelBinding: {
        workerId: "worker-1",
        provider: "claudeAgent",
        model: "claude-sonnet-4-6",
        selectedAt: now,
        selectedBy: "orchestrator",
        selectionReason: "User requested Claude",
        inheritedFromTaskPolicy: false,
      },
      createdAt: now,
    });
    assert.equal(parsed.modelBinding?.provider, "claudeAgent");
    assert.equal(parsed.modelBinding?.model, "claude-sonnet-4-6");
  }),
);

it.effect("decodes OrchestratorTaskSubmitCommand", () =>
  Effect.gen(function* () {
    const parsed = yield* decode(OrchestratorTaskSubmitCommand)({
      type: "orchestrator.task.submit",
      commandId: "cmd-submit-1",
      taskId: "task-1",
      workerId: "worker-1",
      summary: "Implemented OAuth2 flow",
      createdAt: new Date().toISOString(),
    });
    assert.equal(parsed.taskId, "task-1");
    assert.equal(parsed.workerId, "worker-1");
  }),
);

it.effect("decodes OrchestratorTaskAcceptCommand", () =>
  Effect.gen(function* () {
    const parsed = yield* decode(OrchestratorTaskAcceptCommand)({
      type: "orchestrator.task.accept",
      commandId: "cmd-accept-1",
      taskId: "task-1",
      summary: "Looks good",
      createdAt: new Date().toISOString(),
    });
    assert.equal(parsed.taskId, "task-1");
  }),
);

it.effect("decodes OrchestratorTaskRejectCommand", () =>
  Effect.gen(function* () {
    const parsed = yield* decode(OrchestratorTaskRejectCommand)({
      type: "orchestrator.task.reject",
      commandId: "cmd-reject-1",
      taskId: "task-1",
      instruction: "Missing error handling",
      createdAt: new Date().toISOString(),
    });
    assert.equal(parsed.instruction, "Missing error handling");
  }),
);

it.effect("decodes OrchestratorRunCancelCommand", () =>
  Effect.gen(function* () {
    const parsed = yield* decode(OrchestratorRunCancelCommand)({
      type: "orchestrator.run.cancel",
      commandId: "cmd-cancel-1",
      runId: "run-1",
      reason: "User cancelled",
      createdAt: new Date().toISOString(),
    });
    assert.equal(parsed.reason, "User cancelled");
  }),
);

it.effect("decodes OrchestratorRunCompleteCommand", () =>
  Effect.gen(function* () {
    const parsed = yield* decode(OrchestratorRunCompleteCommand)({
      type: "orchestrator.run.complete",
      commandId: "cmd-complete-1",
      runId: "run-1",
      summary: "All tasks done",
      createdAt: new Date().toISOString(),
    });
    assert.equal(parsed.summary, "All tasks done");
  }),
);

it.effect("decodes OrchestratorEvidenceCaptureCommand", () =>
  Effect.gen(function* () {
    const parsed = yield* decode(OrchestratorEvidenceCaptureCommand)({
      type: "orchestrator.evidence.capture",
      commandId: "cmd-evidence-1",
      evidenceId: "evidence-1",
      runId: "run-1",
      taskId: "task-1",
      workerId: "worker-1",
      kind: "screenshot",
      payload: { url: "http://localhost:3000", base64: "abc123" },
      capturedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    assert.equal(parsed.kind, "screenshot");
  }),
);

it.effect("decodes OrchestratorDecisionRecordCommand", () =>
  Effect.gen(function* () {
    const parsed = yield* decode(OrchestratorDecisionRecordCommand)({
      type: "orchestrator.decision.record",
      commandId: "cmd-decision-1",
      decisionId: "decision-1",
      runId: "run-1",
      kind: "spawn",
      context: { taskId: "task-1", reason: "Needs a worker" },
      outcome: "approved",
      decidedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    assert.equal(parsed.kind, "spawn");
    assert.equal(parsed.outcome, "approved");
  }),
);
```

- [ ] **Step 2: Run tests to verify they fail (schemas may not be exported yet)**

Run: `cd /Users/christophe/Documents/Orchestrate/orchestrate && bun run test -- packages/contracts/src/orchestration.contracts.test.ts`

Expected: Either PASS (if schemas are already exported) or FAIL with import errors (telling us which schemas need exporting).

- [ ] **Step 3: Fix any missing exports in contracts**

If any command schemas are not exported from `packages/contracts/src/orchestration.ts`, add them to the existing exports. Do NOT add new schemas - only export what already exists. Check the file for `export const OrchestratorRunCreateCommand` etc. and ensure each is exported.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/christophe/Documents/Orchestrate/orchestrate && bun run test -- packages/contracts/src/orchestration.contracts.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/orchestration.contracts.test.ts
git commit -m "test(contracts): add orchestrator command schema stability tests"
```

---

## Task 2: Orchestrator Decider Tests

**Files:**

- Create: `apps/server/src/orchestration/decider.orchestrator.test.ts`

These tests prove that every orchestrator command produces the correct events and that invariant violations are caught. Pure functions, no IO, deterministic.

- [ ] **Step 1: Write failing tests for orchestrator run lifecycle**

```typescript
// apps/server/src/orchestration/decider.orchestrator.test.ts
import { describe, expect, it } from "vitest";
import { CommandId, ProjectId, type OrchestrationReadModel } from "@t3tools/contracts";
import { Effect } from "effect";

import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent } from "./projector.ts";

const now = () => new Date().toISOString();

/** Apply a sequence of decided events to produce an updated read model. */
async function applyCommands(
  initial: OrchestrationReadModel,
  commands: Parameters<typeof decideOrchestrationCommand>[0]["command"][],
): Promise<OrchestrationReadModel> {
  let model = initial;
  for (const command of commands) {
    const result = await Effect.runPromise(
      decideOrchestrationCommand({ command, readModel: model }),
    );
    const events = Array.isArray(result) ? result : [result];
    for (const event of events) {
      model = await Effect.runPromise(
        projectEvent(model, { ...event, sequence: model.snapshotSequence + 1 }),
      );
    }
  }
  return model;
}

/** Seed a read model with a project already created. */
async function seedWithProject(projectId = "project-1"): Promise<OrchestrationReadModel> {
  return applyCommands(createEmptyReadModel(now()), [
    {
      type: "project.create",
      commandId: CommandId.makeUnsafe("cmd-seed-project"),
      projectId: ProjectId.makeUnsafe(projectId),
      title: "Test Project",
      workspaceRoot: "/tmp/test",
      defaultModelSelection: { provider: "codex", model: "gpt-5-codex" },
      createdAt: now(),
    },
  ]);
}

describe("orchestrator decider: run lifecycle", () => {
  it("creates a run and produces orchestrator.run.created event", async () => {
    const model = await seedWithProject();
    const createdAt = now();

    const result = await Effect.runPromise(
      decideOrchestrationCommand({
        command: {
          type: "orchestrator.run.create",
          commandId: CommandId.makeUnsafe("cmd-run-create"),
          runId: "run-1",
          projectId: ProjectId.makeUnsafe("project-1"),
          userRequest: "Build a page",
          goals: ["goal-1"],
          spawnBudget: {
            maxDepth: 2,
            maxChildren: 2,
            maxConcurrentWriters: 1,
            maxTotalWorkers: 4,
            allowedTools: [],
            writeScope: [],
          },
          createdAt,
        },
        readModel: model,
      }),
    );

    const events = Array.isArray(result) ? result : [result];
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("orchestrator.run.created");
    expect((events[0]!.payload as { runId: string }).runId).toBe("run-1");
  });

  it("rejects duplicate run creation", async () => {
    const model = await seedWithProject();
    const withRun = await applyCommands(model, [
      {
        type: "orchestrator.run.create",
        commandId: CommandId.makeUnsafe("cmd-run-create"),
        runId: "run-1",
        projectId: ProjectId.makeUnsafe("project-1"),
        userRequest: "Build a page",
        goals: ["goal-1"],
        spawnBudget: {
          maxDepth: 2,
          maxChildren: 2,
          maxConcurrentWriters: 1,
          maxTotalWorkers: 4,
          allowedTools: [],
          writeScope: [],
        },
        createdAt: now(),
      },
    ]);

    const exit = await Effect.runPromiseExit(
      decideOrchestrationCommand({
        command: {
          type: "orchestrator.run.create",
          commandId: CommandId.makeUnsafe("cmd-run-create-dup"),
          runId: "run-1",
          projectId: ProjectId.makeUnsafe("project-1"),
          userRequest: "Build another page",
          goals: [],
          spawnBudget: {
            maxDepth: 1,
            maxChildren: 1,
            maxConcurrentWriters: 1,
            maxTotalWorkers: 1,
            allowedTools: [],
            writeScope: [],
          },
          createdAt: now(),
        },
        readModel: withRun,
      }),
    );

    expect(exit._tag).toBe("Failure");
  });

  it("cancels an active run", async () => {
    const model = await seedWithProject();
    const withRun = await applyCommands(model, [
      {
        type: "orchestrator.run.create",
        commandId: CommandId.makeUnsafe("cmd-run-create"),
        runId: "run-1",
        projectId: ProjectId.makeUnsafe("project-1"),
        userRequest: "Build a page",
        goals: [],
        spawnBudget: {
          maxDepth: 1,
          maxChildren: 1,
          maxConcurrentWriters: 1,
          maxTotalWorkers: 1,
          allowedTools: [],
          writeScope: [],
        },
        createdAt: now(),
      },
    ]);

    const result = await Effect.runPromise(
      decideOrchestrationCommand({
        command: {
          type: "orchestrator.run.cancel",
          commandId: CommandId.makeUnsafe("cmd-run-cancel"),
          runId: "run-1",
          reason: "User cancelled",
          createdAt: now(),
        },
        readModel: withRun,
      }),
    );

    const events = Array.isArray(result) ? result : [result];
    expect(events[0]!.type).toBe("orchestrator.run.cancelled");
  });

  it("completes an active run", async () => {
    const model = await seedWithProject();
    const withRun = await applyCommands(model, [
      {
        type: "orchestrator.run.create",
        commandId: CommandId.makeUnsafe("cmd-run-create"),
        runId: "run-1",
        projectId: ProjectId.makeUnsafe("project-1"),
        userRequest: "Build a page",
        goals: [],
        spawnBudget: {
          maxDepth: 1,
          maxChildren: 1,
          maxConcurrentWriters: 1,
          maxTotalWorkers: 1,
          allowedTools: [],
          writeScope: [],
        },
        createdAt: now(),
      },
    ]);

    const result = await Effect.runPromise(
      decideOrchestrationCommand({
        command: {
          type: "orchestrator.run.complete",
          commandId: CommandId.makeUnsafe("cmd-run-complete"),
          runId: "run-1",
          summary: "All done",
          createdAt: now(),
        },
        readModel: withRun,
      }),
    );

    const events = Array.isArray(result) ? result : [result];
    expect(events[0]!.type).toBe("orchestrator.run.completed");
  });

  it("rejects cancel on non-existent run", async () => {
    const model = await seedWithProject();
    const exit = await Effect.runPromiseExit(
      decideOrchestrationCommand({
        command: {
          type: "orchestrator.run.cancel",
          commandId: CommandId.makeUnsafe("cmd-run-cancel"),
          runId: "run-nonexistent",
          reason: "Ghost",
          createdAt: now(),
        },
        readModel: model,
      }),
    );
    expect(exit._tag).toBe("Failure");
  });

  it("rejects complete on already-cancelled run", async () => {
    const model = await seedWithProject();
    const withCancelled = await applyCommands(model, [
      {
        type: "orchestrator.run.create",
        commandId: CommandId.makeUnsafe("cmd-run-create"),
        runId: "run-1",
        projectId: ProjectId.makeUnsafe("project-1"),
        userRequest: "Build a page",
        goals: [],
        spawnBudget: {
          maxDepth: 1,
          maxChildren: 1,
          maxConcurrentWriters: 1,
          maxTotalWorkers: 1,
          allowedTools: [],
          writeScope: [],
        },
        createdAt: now(),
      },
      {
        type: "orchestrator.run.cancel",
        commandId: CommandId.makeUnsafe("cmd-run-cancel"),
        runId: "run-1",
        reason: "User cancelled",
        createdAt: now(),
      },
    ]);

    const exit = await Effect.runPromiseExit(
      decideOrchestrationCommand({
        command: {
          type: "orchestrator.run.complete",
          commandId: CommandId.makeUnsafe("cmd-run-complete"),
          runId: "run-1",
          summary: "Done",
          createdAt: now(),
        },
        readModel: withCancelled,
      }),
    );
    expect(exit._tag).toBe("Failure");
  });
});

describe("orchestrator decider: task lifecycle", () => {
  it("creates a task on an active run", async () => {
    const model = await seedWithProject();
    const withRun = await applyCommands(model, [
      {
        type: "orchestrator.run.create",
        commandId: CommandId.makeUnsafe("cmd-run-create"),
        runId: "run-1",
        projectId: ProjectId.makeUnsafe("project-1"),
        userRequest: "Build",
        goals: [],
        spawnBudget: {
          maxDepth: 1,
          maxChildren: 1,
          maxConcurrentWriters: 1,
          maxTotalWorkers: 1,
          allowedTools: [],
          writeScope: [],
        },
        createdAt: now(),
      },
    ]);

    const result = await Effect.runPromise(
      decideOrchestrationCommand({
        command: {
          type: "orchestrator.task.create",
          commandId: CommandId.makeUnsafe("cmd-task-create"),
          taskId: "task-1",
          runId: "run-1",
          title: "Root task",
          objective: "Build it",
          acceptanceCriteria: "Works",
          stopCondition: "Tests pass",
          readScope: [],
          writeScope: [],
          allowedTools: [],
          evidenceRequired: false,
          maxIterations: 3,
          createdAt: now(),
        },
        readModel: withRun,
      }),
    );

    const events = Array.isArray(result) ? result : [result];
    expect(events[0]!.type).toBe("orchestrator.task.created");
  });

  it("assigns a task", async () => {
    const model = await seedWithProject();
    const withTask = await applyCommands(model, [
      {
        type: "orchestrator.run.create",
        commandId: CommandId.makeUnsafe("cmd-run-create"),
        runId: "run-1",
        projectId: ProjectId.makeUnsafe("project-1"),
        userRequest: "Build",
        goals: [],
        spawnBudget: {
          maxDepth: 1,
          maxChildren: 1,
          maxConcurrentWriters: 1,
          maxTotalWorkers: 1,
          allowedTools: [],
          writeScope: [],
        },
        createdAt: now(),
      },
      {
        type: "orchestrator.task.create",
        commandId: CommandId.makeUnsafe("cmd-task-create"),
        taskId: "task-1",
        runId: "run-1",
        title: "Root task",
        objective: "Build it",
        acceptanceCriteria: "Works",
        stopCondition: "Tests pass",
        readScope: [],
        writeScope: [],
        allowedTools: [],
        evidenceRequired: false,
        maxIterations: 3,
        createdAt: now(),
      },
    ]);

    const result = await Effect.runPromise(
      decideOrchestrationCommand({
        command: {
          type: "orchestrator.task.assign",
          commandId: CommandId.makeUnsafe("cmd-task-assign"),
          taskId: "task-1",
          assigneeKind: "worker",
          assigneeId: "worker-1",
          createdAt: now(),
        },
        readModel: withTask,
      }),
    );

    const events = Array.isArray(result) ? result : [result];
    expect(events[0]!.type).toBe("orchestrator.task.assigned");
  });

  it("submit → accept completes a task", async () => {
    const model = await seedWithProject();
    const withAssigned = await applyCommands(model, [
      {
        type: "orchestrator.run.create",
        commandId: CommandId.makeUnsafe("cmd-run-create"),
        runId: "run-1",
        projectId: ProjectId.makeUnsafe("project-1"),
        userRequest: "Build",
        goals: [],
        spawnBudget: {
          maxDepth: 1,
          maxChildren: 1,
          maxConcurrentWriters: 1,
          maxTotalWorkers: 1,
          allowedTools: [],
          writeScope: [],
        },
        createdAt: now(),
      },
      {
        type: "orchestrator.task.create",
        commandId: CommandId.makeUnsafe("cmd-task-create"),
        taskId: "task-1",
        runId: "run-1",
        title: "Root task",
        objective: "Build it",
        acceptanceCriteria: "Works",
        stopCondition: "Tests pass",
        readScope: [],
        writeScope: [],
        allowedTools: [],
        evidenceRequired: false,
        maxIterations: 3,
        createdAt: now(),
      },
      {
        type: "orchestrator.task.assign",
        commandId: CommandId.makeUnsafe("cmd-task-assign"),
        taskId: "task-1",
        assigneeKind: "worker",
        assigneeId: "worker-1",
        createdAt: now(),
      },
    ]);

    const submitResult = await Effect.runPromise(
      decideOrchestrationCommand({
        command: {
          type: "orchestrator.task.submit",
          commandId: CommandId.makeUnsafe("cmd-task-submit"),
          taskId: "task-1",
          workerId: "worker-1",
          summary: "Done",
          createdAt: now(),
        },
        readModel: withAssigned,
      }),
    );
    const submitEvents = Array.isArray(submitResult) ? submitResult : [submitResult];
    expect(submitEvents[0]!.type).toBe("orchestrator.task.submitted");

    const afterSubmit = await applyCommands(withAssigned, [
      {
        type: "orchestrator.task.submit",
        commandId: CommandId.makeUnsafe("cmd-task-submit"),
        taskId: "task-1",
        workerId: "worker-1",
        summary: "Done",
        createdAt: now(),
      },
    ]);

    const acceptResult = await Effect.runPromise(
      decideOrchestrationCommand({
        command: {
          type: "orchestrator.task.accept",
          commandId: CommandId.makeUnsafe("cmd-task-accept"),
          taskId: "task-1",
          summary: "LGTM",
          createdAt: now(),
        },
        readModel: afterSubmit,
      }),
    );
    const acceptEvents = Array.isArray(acceptResult) ? acceptResult : [acceptResult];
    expect(acceptEvents[0]!.type).toBe("orchestrator.task.accepted");
  });

  it("reject increments iteration and sets needs-rework", async () => {
    const model = await seedWithProject();
    const afterSubmit = await applyCommands(model, [
      {
        type: "orchestrator.run.create",
        commandId: CommandId.makeUnsafe("cmd-run-create"),
        runId: "run-1",
        projectId: ProjectId.makeUnsafe("project-1"),
        userRequest: "Build",
        goals: [],
        spawnBudget: {
          maxDepth: 1,
          maxChildren: 1,
          maxConcurrentWriters: 1,
          maxTotalWorkers: 1,
          allowedTools: [],
          writeScope: [],
        },
        createdAt: now(),
      },
      {
        type: "orchestrator.task.create",
        commandId: CommandId.makeUnsafe("cmd-task-create"),
        taskId: "task-1",
        runId: "run-1",
        title: "Root task",
        objective: "Build it",
        acceptanceCriteria: "Works",
        stopCondition: "Tests pass",
        readScope: [],
        writeScope: [],
        allowedTools: [],
        evidenceRequired: false,
        maxIterations: 3,
        createdAt: now(),
      },
      {
        type: "orchestrator.task.assign",
        commandId: CommandId.makeUnsafe("cmd-task-assign"),
        taskId: "task-1",
        assigneeKind: "worker",
        assigneeId: "worker-1",
        createdAt: now(),
      },
      {
        type: "orchestrator.task.submit",
        commandId: CommandId.makeUnsafe("cmd-task-submit"),
        taskId: "task-1",
        workerId: "worker-1",
        summary: "First attempt",
        createdAt: now(),
      },
    ]);

    const rejectResult = await Effect.runPromise(
      decideOrchestrationCommand({
        command: {
          type: "orchestrator.task.reject",
          commandId: CommandId.makeUnsafe("cmd-task-reject"),
          taskId: "task-1",
          instruction: "Missing error handling",
          createdAt: now(),
        },
        readModel: afterSubmit,
      }),
    );
    const rejectEvents = Array.isArray(rejectResult) ? rejectResult : [rejectResult];
    expect(rejectEvents[0]!.type).toBe("orchestrator.task.rejected");

    // After projection, task should be needs-rework with iteration=1
    const afterReject = await applyCommands(afterSubmit, [
      {
        type: "orchestrator.task.reject",
        commandId: CommandId.makeUnsafe("cmd-task-reject"),
        taskId: "task-1",
        instruction: "Missing error handling",
        createdAt: now(),
      },
    ]);
    const task = afterReject.orchestratorTasks.find((t) => t.taskId === "task-1");
    expect(task?.status).toBe("needs-rework");
    expect(task?.iteration).toBe(1);
  });
});

describe("orchestrator decider: worker lifecycle", () => {
  it("spawns a worker with modelBinding", async () => {
    const model = await seedWithProject();
    const createdAt = now();
    const withTaskAssigned = await applyCommands(model, [
      {
        type: "orchestrator.run.create",
        commandId: CommandId.makeUnsafe("cmd-run-create"),
        runId: "run-1",
        projectId: ProjectId.makeUnsafe("project-1"),
        userRequest: "Build",
        goals: [],
        spawnBudget: {
          maxDepth: 1,
          maxChildren: 1,
          maxConcurrentWriters: 1,
          maxTotalWorkers: 1,
          allowedTools: [],
          writeScope: [],
        },
        createdAt,
      },
      {
        type: "orchestrator.task.create",
        commandId: CommandId.makeUnsafe("cmd-task-create"),
        taskId: "task-1",
        runId: "run-1",
        title: "Root",
        objective: "Build it",
        acceptanceCriteria: "Works",
        stopCondition: "Tests pass",
        readScope: [],
        writeScope: [],
        allowedTools: [],
        evidenceRequired: false,
        maxIterations: 3,
        createdAt,
      },
    ]);

    // Need a thread for the worker
    const withThread = await applyCommands(withTaskAssigned, [
      {
        type: "thread.create",
        commandId: CommandId.makeUnsafe("cmd-thread-create"),
        threadId: "thread-1",
        projectId: ProjectId.makeUnsafe("project-1"),
        title: "Worker thread",
        modelSelection: { provider: "codex", model: "gpt-5-codex" },
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        createdAt,
      },
    ]);

    const result = await Effect.runPromise(
      decideOrchestrationCommand({
        command: {
          type: "orchestrator.worker.spawn",
          commandId: CommandId.makeUnsafe("cmd-worker-spawn"),
          workerId: "worker-1",
          runId: "run-1",
          taskId: "task-1",
          threadId: "thread-1",
          spawnBudget: {
            maxDepth: 0,
            maxChildren: 0,
            maxConcurrentWriters: 1,
            maxTotalWorkers: 1,
            allowedTools: ["edit"],
            writeScope: [],
          },
          workspace: { mode: "local", cwd: "/tmp", terminalIds: [] },
          modelBinding: {
            workerId: "worker-1",
            provider: "claudeAgent",
            model: "claude-sonnet-4-6",
            selectedAt: createdAt,
            selectedBy: "orchestrator",
            selectionReason: "User override",
            inheritedFromTaskPolicy: false,
          },
          createdAt,
        },
        readModel: withThread,
      }),
    );

    const events = Array.isArray(result) ? result : [result];
    expect(events[0]!.type).toBe("orchestrator.worker.spawned");
    expect(
      (events[0]!.payload as { modelBinding?: { provider: string } }).modelBinding?.provider,
    ).toBe("claudeAgent");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail or pass**

Run: `cd /Users/christophe/Documents/Orchestrate/orchestrate && bun run test -- apps/server/src/orchestration/decider.orchestrator.test.ts`

Expected: PASS (these are pure function tests against existing decider logic).

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/orchestration/decider.orchestrator.test.ts
git commit -m "test(decider): add orchestrator command lifecycle tests for runs, tasks, workers"
```

---

## Task 3: Orchestrator Projector Tests

**Files:**

- Create: `apps/server/src/orchestration/projector.orchestrator.test.ts`

These tests prove that orchestrator events correctly update the read model. The existing `projector.test.ts` covers threads and projects but not orchestrator runs/tasks/workers.

- [ ] **Step 1: Write projector tests for orchestrator events**

```typescript
// apps/server/src/orchestration/projector.orchestrator.test.ts
import {
  CommandId,
  EventId,
  ProjectId,
  ThreadId,
  type OrchestrationEvent,
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
  } as OrchestrationEvent;
}

describe("orchestration projector: orchestrator events", () => {
  const createdAt = new Date().toISOString();

  it("projects orchestrator.run.created into read model", async () => {
    const model = createEmptyReadModel(createdAt);
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
            userRequest: "Build a page",
            goals: ["goal-1"],
            constraints: null,
            spawnBudget: {
              maxDepth: 2,
              maxChildren: 2,
              maxConcurrentWriters: 1,
              maxTotalWorkers: 4,
              allowedTools: [],
              writeScope: [],
            },
            createdAt,
          },
        }),
      ),
    );

    expect(next.orchestratorRuns).toHaveLength(1);
    expect(next.orchestratorRuns[0]!.runId).toBe("run-1");
    expect(next.orchestratorRuns[0]!.status).toBe("active");
  });

  it("projects orchestrator.task.created and sets rootTaskId on first task", async () => {
    const model = createEmptyReadModel(createdAt);
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
            userRequest: "Build",
            goals: [],
            constraints: null,
            spawnBudget: {
              maxDepth: 1,
              maxChildren: 1,
              maxConcurrentWriters: 1,
              maxTotalWorkers: 1,
              allowedTools: [],
              writeScope: [],
            },
            createdAt,
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
            parentTaskId: null,
            title: "Root task",
            objective: "Build it",
            acceptanceCriteria: "Works",
            stopCondition: "Tests pass",
            readScope: [],
            writeScope: [],
            allowedTools: [],
            evidenceRequired: false,
            dependsOn: [],
            modelPolicy: null,
            maxIterations: 3,
            createdAt,
          },
        }),
      ),
    );

    expect(afterTask.orchestratorTasks).toHaveLength(1);
    expect(afterTask.orchestratorTasks[0]!.status).toBe("pending");
    // First task should become the rootTaskId
    expect(afterTask.orchestratorRuns[0]!.rootTaskId).toBe("task-1");
  });

  it("projects task.assigned correctly", async () => {
    const model = createEmptyReadModel(createdAt);
    const afterTask = await [
      makeOrchestratorEvent({
        sequence: 1,
        type: "orchestrator.run.created",
        aggregateId: "run-1",
        payload: {
          runId: "run-1",
          projectId: "project-1",
          userRequest: "Build",
          goals: [],
          constraints: null,
          spawnBudget: {
            maxDepth: 1,
            maxChildren: 1,
            maxConcurrentWriters: 1,
            maxTotalWorkers: 1,
            allowedTools: [],
            writeScope: [],
          },
          createdAt,
        },
      }),
      makeOrchestratorEvent({
        sequence: 2,
        type: "orchestrator.task.created",
        aggregateId: "run-1",
        payload: {
          taskId: "task-1",
          runId: "run-1",
          parentTaskId: null,
          title: "Root task",
          objective: "Build",
          acceptanceCriteria: "Works",
          stopCondition: "Pass",
          readScope: [],
          writeScope: [],
          allowedTools: [],
          evidenceRequired: false,
          dependsOn: [],
          modelPolicy: null,
          maxIterations: 3,
          createdAt,
        },
      }),
    ].reduce<Promise<typeof model>>(async (accP, event) => {
      const acc = await accP;
      return Effect.runPromise(projectEvent(acc, event));
    }, Promise.resolve(model));

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
            assignedAt: createdAt,
          },
        }),
      ),
    );

    const task = afterAssign.orchestratorTasks.find((t) => t.taskId === "task-1");
    expect(task?.status).toBe("assigned");
  });

  it("projects worker.spawned into read model", async () => {
    const model = createEmptyReadModel(createdAt);
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
            userRequest: "Build",
            goals: [],
            constraints: null,
            spawnBudget: {
              maxDepth: 1,
              maxChildren: 1,
              maxConcurrentWriters: 1,
              maxTotalWorkers: 1,
              allowedTools: [],
              writeScope: [],
            },
            createdAt,
          },
        }),
      ),
    );

    const afterWorker = await Effect.runPromise(
      projectEvent(
        afterRun,
        makeOrchestratorEvent({
          sequence: 2,
          type: "orchestrator.worker.spawned",
          aggregateId: "run-1",
          payload: {
            workerId: "worker-1",
            runId: "run-1",
            taskId: "task-1",
            threadId: "thread-1",
            spawnBudget: {
              maxDepth: 0,
              maxChildren: 0,
              maxConcurrentWriters: 1,
              maxTotalWorkers: 1,
              allowedTools: ["edit"],
              writeScope: [],
            },
            workspace: { mode: "local", cwd: "/tmp", terminalIds: [] },
            modelBinding: {
              workerId: "worker-1",
              provider: "claudeAgent",
              model: "claude-sonnet-4-6",
              selectedAt: createdAt,
              selectedBy: "orchestrator",
              selectionReason: "User override",
              inheritedFromTaskPolicy: false,
            },
            spawnedAt: createdAt,
          },
        }),
      ),
    );

    expect(afterWorker.orchestratorWorkers).toHaveLength(1);
    expect(afterWorker.orchestratorWorkers[0]!.workerId).toBe("worker-1");
    expect(afterWorker.orchestratorWorkers[0]!.status).toBe("running");
    expect(afterWorker.orchestratorWorkers[0]!.modelBinding?.provider).toBe("claudeAgent");
  });

  it("projects run.cancelled sets status to cancelled", async () => {
    const model = createEmptyReadModel(createdAt);
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
            userRequest: "Build",
            goals: [],
            constraints: null,
            spawnBudget: {
              maxDepth: 1,
              maxChildren: 1,
              maxConcurrentWriters: 1,
              maxTotalWorkers: 1,
              allowedTools: [],
              writeScope: [],
            },
            createdAt,
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
            reason: "User cancelled",
            cancelledAt: createdAt,
          },
        }),
      ),
    );

    expect(afterCancel.orchestratorRuns[0]!.status).toBe("cancelled");
  });

  it("projects task.rejected increments iteration", async () => {
    const model = createEmptyReadModel(createdAt);
    const events = [
      makeOrchestratorEvent({
        sequence: 1,
        type: "orchestrator.run.created",
        aggregateId: "run-1",
        payload: {
          runId: "run-1",
          projectId: "project-1",
          userRequest: "Build",
          goals: [],
          constraints: null,
          spawnBudget: {
            maxDepth: 1,
            maxChildren: 1,
            maxConcurrentWriters: 1,
            maxTotalWorkers: 1,
            allowedTools: [],
            writeScope: [],
          },
          createdAt,
        },
      }),
      makeOrchestratorEvent({
        sequence: 2,
        type: "orchestrator.task.created",
        aggregateId: "run-1",
        payload: {
          taskId: "task-1",
          runId: "run-1",
          parentTaskId: null,
          title: "Root",
          objective: "Build",
          acceptanceCriteria: "Works",
          stopCondition: "Pass",
          readScope: [],
          writeScope: [],
          allowedTools: [],
          evidenceRequired: false,
          dependsOn: [],
          modelPolicy: null,
          maxIterations: 3,
          createdAt,
        },
      }),
      makeOrchestratorEvent({
        sequence: 3,
        type: "orchestrator.task.submitted",
        aggregateId: "run-1",
        payload: {
          taskId: "task-1",
          workerId: "worker-1",
          summary: "First attempt",
          submittedAt: createdAt,
        },
      }),
      makeOrchestratorEvent({
        sequence: 4,
        type: "orchestrator.task.rejected",
        aggregateId: "run-1",
        payload: {
          taskId: "task-1",
          instruction: "Missing error handling",
          rejectedAt: createdAt,
        },
      }),
    ];

    const final = await events.reduce<Promise<typeof model>>(async (accP, event) => {
      const acc = await accP;
      return Effect.runPromise(projectEvent(acc, event));
    }, Promise.resolve(model));

    const task = final.orchestratorTasks.find((t) => t.taskId === "task-1");
    expect(task?.status).toBe("needs-rework");
    expect(task?.iteration).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/christophe/Documents/Orchestrate/orchestrate && bun run test -- apps/server/src/orchestration/projector.orchestrator.test.ts`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/orchestration/projector.orchestrator.test.ts
git commit -m "test(projector): add orchestrator run/task/worker projection tests"
```

---

## Task 4: Persistence Round-Trip Tests

**Files:**

- Create: `apps/server/src/persistence/Layers/OrchestratorRuns.test.ts`

These tests prove that orchestrator runs, tasks, workers, evidence, and decisions survive SQLite round-trips. This is where "looked fine in memory" dies.

- [ ] **Step 1: Write persistence round-trip tests**

```typescript
// apps/server/src/persistence/Layers/OrchestratorRuns.test.ts
import { it, assert } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { OrchestratorRunsRepository } from "../Services/OrchestratorRuns.ts";
import { OrchestratorRunsRepositoryLive } from "./OrchestratorRuns.ts";
import { SqlitePersistenceMemory } from "./Sqlite.ts";

const layer = it.layer(
  OrchestratorRunsRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
);

layer("OrchestratorRuns persistence", (it) => {
  it.effect("round-trips a run through insert and query", () =>
    Effect.gen(function* () {
      const repo = yield* OrchestratorRunsRepository;
      const now = new Date().toISOString();

      yield* repo.upsertRun({
        runId: "run-persist-1",
        projectId: "project-1",
        status: "active",
        userRequest: "Build a page",
        goals: ["goal-1"],
        constraints: null,
        spawnBudget: {
          maxDepth: 2,
          maxChildren: 2,
          maxConcurrentWriters: 1,
          maxTotalWorkers: 4,
          allowedTools: [],
          writeScope: [],
        },
        rootTaskId: "",
        createdAt: now,
        updatedAt: now,
      });

      const runs = yield* repo.getRunsByProject("project-1");
      assert.equal(runs.length, 1);
      assert.equal(runs[0]!.runId, "run-persist-1");
      assert.equal(runs[0]!.status, "active");
      assert.equal(runs[0]!.userRequest, "Build a page");
    }),
  );

  it.effect("round-trips a task with all fields", () =>
    Effect.gen(function* () {
      const repo = yield* OrchestratorRunsRepository;
      const now = new Date().toISOString();

      yield* repo.upsertRun({
        runId: "run-persist-task",
        projectId: "project-1",
        status: "active",
        userRequest: "Build",
        goals: [],
        constraints: null,
        spawnBudget: {
          maxDepth: 1,
          maxChildren: 1,
          maxConcurrentWriters: 1,
          maxTotalWorkers: 1,
          allowedTools: [],
          writeScope: [],
        },
        rootTaskId: "task-persist-1",
        createdAt: now,
        updatedAt: now,
      });

      yield* repo.upsertTask({
        taskId: "task-persist-1",
        runId: "run-persist-task",
        parentTaskId: null,
        title: "Root task",
        objective: "Build it",
        acceptanceCriteria: "Works",
        stopCondition: "Tests pass",
        status: "pending",
        iteration: 0,
        readScope: ["/src"],
        writeScope: ["/src/auth"],
        allowedTools: ["edit"],
        evidenceRequired: true,
        dependsOn: [],
        modelPolicy: { preferredProvider: "claudeAgent" },
        maxIterations: 3,
        createdAt: now,
        updatedAt: now,
      });

      const tasks = yield* repo.getTasksByRun("run-persist-task");
      assert.equal(tasks.length, 1);
      assert.equal(tasks[0]!.taskId, "task-persist-1");
      assert.equal(tasks[0]!.status, "pending");
      assert.equal(tasks[0]!.iteration, 0);
      assert.equal(tasks[0]!.evidenceRequired, true);
    }),
  );

  it.effect("round-trips a worker with modelBinding", () =>
    Effect.gen(function* () {
      const repo = yield* OrchestratorRunsRepository;
      const now = new Date().toISOString();

      yield* repo.upsertRun({
        runId: "run-persist-worker",
        projectId: "project-1",
        status: "active",
        userRequest: "Build",
        goals: [],
        constraints: null,
        spawnBudget: {
          maxDepth: 1,
          maxChildren: 1,
          maxConcurrentWriters: 1,
          maxTotalWorkers: 1,
          allowedTools: [],
          writeScope: [],
        },
        rootTaskId: "",
        createdAt: now,
        updatedAt: now,
      });

      yield* repo.upsertWorker({
        workerId: "worker-persist-1",
        runId: "run-persist-worker",
        threadId: "thread-1",
        status: "running",
        activeTaskId: "task-1",
        modelBinding: {
          workerId: "worker-persist-1",
          provider: "claudeAgent",
          model: "claude-sonnet-4-6",
          selectedAt: now,
          selectedBy: "orchestrator",
          selectionReason: "User override",
          inheritedFromTaskPolicy: false,
        },
        spawnBudget: {
          maxDepth: 0,
          maxChildren: 0,
          maxConcurrentWriters: 1,
          maxTotalWorkers: 1,
          allowedTools: ["edit"],
          writeScope: [],
        },
        workspace: { mode: "local", cwd: "/tmp", terminalIds: [] },
        spawnedAt: now,
        updatedAt: now,
      });

      const workers = yield* repo.getWorkersByRun("run-persist-worker");
      assert.equal(workers.length, 1);
      assert.equal(workers[0]!.workerId, "worker-persist-1");
      assert.equal(workers[0]!.modelBinding?.provider, "claudeAgent");
      assert.equal(workers[0]!.modelBinding?.model, "claude-sonnet-4-6");
    }),
  );

  it.effect("updates run status on re-upsert", () =>
    Effect.gen(function* () {
      const repo = yield* OrchestratorRunsRepository;
      const now = new Date().toISOString();

      yield* repo.upsertRun({
        runId: "run-persist-update",
        projectId: "project-1",
        status: "active",
        userRequest: "Build",
        goals: [],
        constraints: null,
        spawnBudget: {
          maxDepth: 1,
          maxChildren: 1,
          maxConcurrentWriters: 1,
          maxTotalWorkers: 1,
          allowedTools: [],
          writeScope: [],
        },
        rootTaskId: "",
        createdAt: now,
        updatedAt: now,
      });

      yield* repo.upsertRun({
        runId: "run-persist-update",
        projectId: "project-1",
        status: "cancelled",
        userRequest: "Build",
        goals: [],
        constraints: null,
        spawnBudget: {
          maxDepth: 1,
          maxChildren: 1,
          maxConcurrentWriters: 1,
          maxTotalWorkers: 1,
          allowedTools: [],
          writeScope: [],
        },
        rootTaskId: "",
        createdAt: now,
        updatedAt: new Date().toISOString(),
      });

      const runs = yield* repo.getRunsByProject("project-1");
      const run = runs.find((r) => r.runId === "run-persist-update");
      assert.equal(run?.status, "cancelled");
    }),
  );
});
```

- [ ] **Step 2: Run tests to check if the OrchestratorRunsRepository service interface matches**

Run: `cd /Users/christophe/Documents/Orchestrate/orchestrate && bun run test -- apps/server/src/persistence/Layers/OrchestratorRuns.test.ts`

Expected: Either PASS (if the service shape matches) or FAIL with type errors (telling us the actual method names). If the method signatures differ from the test code, update the test to match the real interface.

- [ ] **Step 3: Fix any mismatches and re-run**

Read `apps/server/src/persistence/Services/OrchestratorRuns.ts` to confirm exact method names and parameter shapes. Update the test to match.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/persistence/Layers/OrchestratorRuns.test.ts
git commit -m "test(persistence): add orchestrator run/task/worker round-trip tests"
```

---

## Task 5: Release Gate Script

**Files:**

- Create: `scripts/test-gate.ts`
- Modify: `package.json`
- Modify: `apps/server/package.json`
- Modify: `apps/web/package.json`

This script runs all mandatory test layers and reports a matrix of pass/fail results. It is the single command that answers "can we ship?"

- [ ] **Step 1: Create the gate script**

```typescript
// scripts/test-gate.ts
import { $ } from "bun";

interface GateResult {
  layer: string;
  command: string;
  blocking: boolean;
  status: "pass" | "fail" | "skip";
  durationMs: number;
  error?: string;
}

const gates: Array<{
  layer: string;
  command: string;
  blocking: boolean;
  condition?: () => boolean;
}> = [
  {
    layer: "1. Contracts typecheck",
    command: "cd packages/contracts && bun run typecheck",
    blocking: true,
  },
  {
    layer: "2. Server typecheck",
    command: "cd apps/server && bun run typecheck",
    blocking: true,
  },
  {
    layer: "3. Web typecheck",
    command: "cd apps/web && bun run typecheck",
    blocking: true,
  },
  {
    layer: "4. Lint",
    command: "bun lint",
    blocking: true,
  },
  {
    layer: "5. Contract schema tests",
    command: "bun run test -- packages/contracts/src/orchestration.contracts.test.ts",
    blocking: true,
  },
  {
    layer: "6. Decider tests",
    command: "bun run test -- apps/server/src/orchestration/decider.orchestrator.test.ts",
    blocking: true,
  },
  {
    layer: "7. Projector tests",
    command: "bun run test -- apps/server/src/orchestration/projector.orchestrator.test.ts",
    blocking: true,
  },
  {
    layer: "8. Persistence tests",
    command: "bun run test -- apps/server/src/persistence/Layers/OrchestratorRuns.test.ts",
    blocking: true,
  },
  {
    layer: "9. Full unit/integration suites",
    command: "turbo run test",
    blocking: true,
  },
  {
    layer: "10. Server orchestrator smoke",
    command: "bun run test:orchestrator-smoke",
    blocking: true,
  },
  {
    layer: "11. UI browser e2e",
    command: "cd apps/web && bun run test:browser",
    blocking: false, // advisory until Playwright tests stabilize
  },
];

async function runGate(gate: (typeof gates)[number]): Promise<GateResult> {
  if (gate.condition && !gate.condition()) {
    return {
      layer: gate.layer,
      command: gate.command,
      blocking: gate.blocking,
      status: "skip",
      durationMs: 0,
    };
  }

  const start = performance.now();
  try {
    await $`bash -c ${gate.command}`.quiet();
    return {
      layer: gate.layer,
      command: gate.command,
      blocking: gate.blocking,
      status: "pass",
      durationMs: Math.round(performance.now() - start),
    };
  } catch (error) {
    return {
      layer: gate.layer,
      command: gate.command,
      blocking: gate.blocking,
      status: "fail",
      durationMs: Math.round(performance.now() - start),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  console.log("=== Production Release Gate ===\n");

  const results: GateResult[] = [];
  for (const gate of gates) {
    const prefix = gate.blocking ? "[BLOCKING]" : "[ADVISORY]";
    process.stdout.write(`${prefix} ${gate.layer}... `);
    const result = await runGate(gate);
    const icon = result.status === "pass" ? "PASS" : result.status === "skip" ? "SKIP" : "FAIL";
    console.log(`${icon} (${result.durationMs}ms)`);
    results.push(result);
  }

  console.log("\n=== Release Gate Summary ===\n");

  const maxLayerLen = Math.max(...results.map((r) => r.layer.length));
  for (const r of results) {
    const icon = r.status === "pass" ? "+" : r.status === "skip" ? "~" : "x";
    const blockLabel = r.blocking ? "BLOCK" : "ADVISE";
    console.log(`  [${icon}] ${r.layer.padEnd(maxLayerLen)}  ${blockLabel}  ${r.durationMs}ms`);
  }

  const blockingFailures = results.filter((r) => r.blocking && r.status === "fail");
  const advisoryFailures = results.filter((r) => !r.blocking && r.status === "fail");

  console.log("");
  if (blockingFailures.length > 0) {
    console.log(`BLOCKED: ${blockingFailures.length} blocking gate(s) failed:`);
    for (const f of blockingFailures) {
      console.log(`  - ${f.layer}`);
    }
    process.exit(1);
  } else if (advisoryFailures.length > 0) {
    console.log(`PASS with warnings: ${advisoryFailures.length} advisory gate(s) failed:`);
    for (const f of advisoryFailures) {
      console.log(`  - ${f.layer}`);
    }
    process.exit(0);
  } else {
    console.log("ALL GATES PASSED - ready to ship.");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Gate runner crashed:", err);
  process.exit(2);
});
```

- [ ] **Step 2: Add test:gate script to root package.json**

Add to the `"scripts"` section of `/Users/christophe/Documents/Orchestrate/orchestrate/package.json`:

```json
"test:gate": "bun scripts/test-gate.ts"
```

- [ ] **Step 3: Run the gate to verify it works**

Run: `cd /Users/christophe/Documents/Orchestrate/orchestrate && bun run test:gate`

Expected: Runs each layer sequentially and prints a summary matrix.

- [ ] **Step 4: Commit**

```bash
git add scripts/test-gate.ts package.json
git commit -m "feat: add production release gate script (bun run test:gate)"
```

---

## Task 6: WebSocket Orchestrator Journey Smoke Test

**Files:**

- Create: `apps/server/src/wsServer.orchestrator.test.ts`

This extends the existing smoke test to cover the full orchestrator journey: create run, create task, assign, spawn worker, submit, review, accept. This is the server-side equivalent of "can a real user complete a delegate flow?"

- [ ] **Step 1: Write the full journey test**

```typescript
// apps/server/src/wsServer.orchestrator.test.ts
//
// This file re-uses the test harness from wsServer.test.ts.
// It focuses on the multi-step orchestrator journey that validates
// claim: "a user can create a run, spawn work, submit, and review."
//
// We import the test helpers from the main wsServer.test.ts by
// extracting the harness into the same file structure.
// For now, this test is self-contained with its own harness copy.

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
import { makeServerRuntimeServicesLayer } from "./serverLayers";
import { ProviderDiscoveryService } from "./provider/Services/ProviderDiscoveryService";
import { ServerSettingsService } from "./serverSettings";
import {
  ORCHESTRATION_WS_CHANNELS,
  ORCHESTRATION_WS_METHODS,
  WS_CHANNELS,
  WS_METHODS,
  type WebSocketResponse,
  type WsPush,
  type WsPushChannel,
  type WsPushMessage,
} from "@t3tools/contracts";
import { ProviderService, type ProviderServiceShape } from "./provider/Services/ProviderService";
import { ProviderHealth, type ProviderHealthShape } from "./provider/Services/ProviderHealth";
import { Open } from "./open";
import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite";
import { AnalyticsService } from "./telemetry/Services/AnalyticsService.ts";

// --- Minimal WebSocket harness (mirrors wsServer.test.ts) ---

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
  if (queued !== undefined) return Promise.resolve(queued);
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

function connectWs(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/`);
    const channels: SocketChannels = {
      push: { queue: [], waiters: [] },
      response: { queue: [], waiters: [] },
    };
    channelsBySocket.set(ws, channels);
    ws.on("message", (raw) => {
      const parsed = JSON.parse(String(raw));
      if (parsed.type === "push") enqueue(channels.push, parsed as WsPush);
      else if (parsed.id) enqueue(channels.response, parsed as WebSocketResponse);
    });
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

async function connectAndAwaitWelcome(
  port: number,
): Promise<[WebSocket, WsPushMessage<typeof WS_CHANNELS.serverWelcome>]> {
  const ws = await connectWs(port);
  const welcome = await waitForPush(ws, WS_CHANNELS.serverWelcome);
  return [ws, welcome];
}

async function sendRequest(
  ws: WebSocket,
  method: string,
  params?: unknown,
): Promise<WebSocketResponse> {
  const channels = channelsBySocket.get(ws)!;
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
    if (response.id === id || response.id === "unknown") return response;
  }
}

async function waitForPush<C extends WsPushChannel>(
  ws: WebSocket,
  channel: C,
  predicate?: (push: WsPushMessage<C>) => boolean,
  maxMessages = 120,
  idleTimeoutMs = 5_000,
): Promise<WsPushMessage<C>> {
  const channels = channelsBySocket.get(ws)!;
  for (let remaining = maxMessages; remaining > 0; remaining--) {
    const push = await dequeue(channels.push, idleTimeoutMs);
    if (push.channel !== channel) continue;
    const typed = push as WsPushMessage<C>;
    if (!predicate || predicate(typed)) return typed;
  }
  throw new Error(`Timed out waiting for push on ${channel}`);
}

// --- Test server factory ---

describe("Orchestrator Journey Smoke", () => {
  let serverScope: Scope.Closeable | null = null;
  const connections: WebSocket[] = [];
  const tempDirs: string[] = [];

  function makeTempDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(dir);
    return dir;
  }

  const startSession = vi.fn((_threadId: string, _input: unknown) => Effect.void);
  const sendTurn = vi.fn((_input: unknown) => Effect.void);

  async function createTestServer(): Promise<Http.Server> {
    const baseDir = makeTempDir("t3-orch-journey-");
    const devUrl = undefined;
    const derivedPaths = Effect.runSync(
      deriveServerPaths(baseDir, devUrl).pipe(Effect.provide(NodeServices.layer)),
    );

    const mockProviderService: ProviderServiceShape = {
      startSession: (threadId, input) => startSession(threadId, input),
      sendTurn: (input) => sendTurn(input),
      steerTurn: () => Effect.void,
      startReview: () => Effect.void,
      forkThread: () => Effect.void,
      interruptTurn: () => Effect.void,
      respondToRequest: () => Effect.void,
      respondToUserInput: () => Effect.void,
      stopSession: () => Effect.void,
      listSessions: Effect.succeed([]),
      getCapabilities: () =>
        Effect.succeed({
          sessionModelSwitch: "restart-session",
          supportsSkillMentions: false,
          supportsNativeSlashCommandDiscovery: false,
          supportsPluginDiscovery: false,
          supportsTurnSteering: false,
          supportsRuntimeModelList: false,
          supportsReview: false,
          supportsFork: false,
          supportsConversationRollback: false,
        }),
      rollbackConversation: () => Effect.void,
      streamEvents: Stream.empty,
    };

    const mockDiscovery = {
      getComposerCapabilities: () => Effect.succeed({ supportsMarkdown: true }),
      listModels: () => Effect.succeed([]),
      listSkills: () => Effect.succeed([]),
      listCommands: () => Effect.succeed([]),
      listPlugins: () => Effect.succeed([]),
      readPlugin: () => Effect.succeed(null),
    };

    const providerLayer = Layer.mergeAll(
      Layer.succeed(ProviderService, mockProviderService as unknown as ProviderService),
      Layer.succeed(ProviderDiscoveryService, mockDiscovery as unknown as ProviderDiscoveryService),
    );

    const providerHealthLayer = Layer.succeed(ProviderHealth, {
      getStatuses: Effect.succeed([]),
    } as unknown as ProviderHealth);

    const serverConfigLayer = Layer.succeed(ServerConfig, {
      mode: "web",
      port: 0,
      host: undefined,
      cwd: makeTempDir("t3-orch-cwd-"),
      baseDir,
      ...derivedPaths,
      staticDir: undefined,
      devUrl: undefined,
      noBrowser: true,
      authToken: undefined,
      autoBootstrapProjectFromCwd: false,
      logWebSocketEvents: false,
    } satisfies ServerConfigShape);

    const runtimeLayer = makeServerRuntimeServicesLayer().pipe(
      Layer.provide(providerLayer),
      Layer.provide(SqlitePersistenceMemory),
    );

    const dependenciesLayer = Layer.empty.pipe(
      Layer.provideMerge(Layer.merge(runtimeLayer, providerLayer)),
      Layer.provideMerge(providerHealthLayer),
      Layer.provideMerge(
        Layer.succeed(Open, {
          openBrowser: () => Effect.void,
          openInEditor: () => Effect.void,
        }),
      ),
      Layer.provideMerge(serverConfigLayer),
      Layer.provideMerge(AnalyticsService.layerTest),
      Layer.provideMerge(ServerSettingsService.layerTest()),
      Layer.provideMerge(NodeServices.layer),
    );

    const scope = await Effect.runPromise(Scope.make("sequential"));
    const runtimeServices = await Effect.runPromise(
      Layer.build(dependenciesLayer).pipe(Scope.provide(scope)),
    );

    const runtime = await Effect.runPromise(
      createServer().pipe(Effect.provide(runtimeServices), Scope.provide(scope)),
    );
    serverScope = scope;
    return runtime;
  }

  afterEach(async () => {
    for (const ws of connections) ws.close();
    connections.length = 0;
    if (serverScope) {
      const scope = serverScope;
      serverScope = null;
      await Effect.runPromise(Scope.close(scope, Exit.void));
    }
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it("full orchestrator journey: run → task → worker → submit → accept", async () => {
    const server = await createTestServer();
    const addr = server.address();
    const port = typeof addr === "object" && addr !== null ? addr.port : 0;
    const [ws] = await connectAndAwaitWelcome(port);
    connections.push(ws);

    const createdAt = new Date().toISOString();

    // 1. Create project
    const projectRes = await sendRequest(ws, ORCHESTRATION_WS_METHODS.dispatchCommand, {
      type: "project.create",
      commandId: "cmd-journey-project",
      projectId: "project-journey",
      title: "Journey Test",
      workspaceRoot: "/tmp/journey",
      defaultModelSelection: { provider: "codex", model: "gpt-5-codex" },
      createdAt,
    });
    expect(projectRes.error).toBeUndefined();

    // 2. Create thread
    const threadRes = await sendRequest(ws, ORCHESTRATION_WS_METHODS.dispatchCommand, {
      type: "thread.create",
      commandId: "cmd-journey-thread",
      threadId: "thread-journey",
      projectId: "project-journey",
      title: "Journey thread",
      modelSelection: { provider: "codex", model: "gpt-5-codex" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdAt,
    });
    expect(threadRes.error).toBeUndefined();

    // 3. Create run
    const runRes = await sendRequest(ws, WS_METHODS.orchestratorCreateRun, {
      projectId: "project-journey",
      userRequest: "Build a dashboard",
      goals: ["Working dashboard", "Tests pass"],
      spawnBudget: {
        maxDepth: 2,
        maxChildren: 3,
        maxConcurrentWriters: 1,
        maxTotalWorkers: 4,
        allowedTools: ["edit", "search"],
        writeScope: [],
      },
    });
    expect(runRes.error).toBeUndefined();
    const run = runRes.result as { runId: string; status: string };
    expect(run.status).toBe("active");

    // 4. Verify task tree has root task
    const taskTreeRes = await sendRequest(ws, WS_METHODS.orchestratorGetTaskTree, {
      runId: run.runId,
    });
    expect(taskTreeRes.error).toBeUndefined();
    const tasks = taskTreeRes.result as Array<{ taskId: string; status: string }>;
    expect(tasks).toHaveLength(1);
    const rootTaskId = tasks[0]!.taskId;

    // 5. Spawn worker with Claude binding
    const workerRes = await sendRequest(ws, ORCHESTRATION_WS_METHODS.dispatchCommand, {
      type: "orchestrator.worker.spawn",
      commandId: "cmd-journey-worker",
      workerId: "worker-journey",
      runId: run.runId,
      taskId: rootTaskId,
      threadId: "thread-journey",
      spawnBudget: {
        maxDepth: 0,
        maxChildren: 0,
        maxConcurrentWriters: 1,
        maxTotalWorkers: 1,
        allowedTools: ["edit"],
        writeScope: [],
      },
      workspace: { mode: "local", cwd: "/tmp/journey", terminalIds: [] },
      modelBinding: {
        workerId: "worker-journey",
        provider: "claudeAgent",
        model: "claude-sonnet-4-6",
        selectedAt: createdAt,
        selectedBy: "orchestrator",
        selectionReason: "Journey test",
        inheritedFromTaskPolicy: false,
      },
      createdAt,
    });
    expect(workerRes.error).toBeUndefined();

    // 6. Verify worker is queryable
    const workersRes = await sendRequest(ws, WS_METHODS.orchestratorGetWorkers, {
      runId: run.runId,
    });
    expect(workersRes.error).toBeUndefined();
    const workers = workersRes.result as Array<{
      workerId: string;
      modelBinding?: { provider: string };
    }>;
    expect(workers).toHaveLength(1);
    expect(workers[0]!.modelBinding?.provider).toBe("claudeAgent");

    // 7. Assign task to worker
    const assignRes = await sendRequest(ws, ORCHESTRATION_WS_METHODS.dispatchCommand, {
      type: "orchestrator.task.assign",
      commandId: "cmd-journey-assign",
      taskId: rootTaskId,
      assigneeKind: "worker",
      assigneeId: "worker-journey",
      createdAt,
    });
    expect(assignRes.error).toBeUndefined();

    // 8. Submit task
    const submitRes = await sendRequest(ws, ORCHESTRATION_WS_METHODS.dispatchCommand, {
      type: "orchestrator.task.submit",
      commandId: "cmd-journey-submit",
      taskId: rootTaskId,
      workerId: "worker-journey",
      summary: "Dashboard implemented with tests",
      createdAt,
    });
    expect(submitRes.error).toBeUndefined();

    // 9. Accept task
    const acceptRes = await sendRequest(ws, ORCHESTRATION_WS_METHODS.dispatchCommand, {
      type: "orchestrator.task.accept",
      commandId: "cmd-journey-accept",
      taskId: rootTaskId,
      summary: "LGTM",
      createdAt,
    });
    expect(acceptRes.error).toBeUndefined();

    // 10. Verify final state via snapshot
    const snapshotRes = await sendRequest(ws, ORCHESTRATION_WS_METHODS.getSnapshot);
    expect(snapshotRes.error).toBeUndefined();
    const snapshot = snapshotRes.result as {
      orchestratorRuns: Array<{ runId: string; status: string }>;
      orchestratorTasks: Array<{ taskId: string; status: string; iteration: number }>;
      orchestratorWorkers: Array<{ workerId: string; status: string }>;
    };

    const finalRun = snapshot.orchestratorRuns.find((r) => r.runId === run.runId);
    expect(finalRun).toBeDefined();

    const finalTask = snapshot.orchestratorTasks.find((t) => t.taskId === rootTaskId);
    expect(finalTask?.status).toBe("accepted");
    expect(finalTask?.iteration).toBe(0);

    const finalWorker = snapshot.orchestratorWorkers.find((w) => w.workerId === "worker-journey");
    expect(finalWorker).toBeDefined();
  });

  it("orchestrator journey: submit → reject → resubmit → accept (rework flow)", async () => {
    const server = await createTestServer();
    const addr = server.address();
    const port = typeof addr === "object" && addr !== null ? addr.port : 0;
    const [ws] = await connectAndAwaitWelcome(port);
    connections.push(ws);

    const createdAt = new Date().toISOString();

    // Setup: project + thread + run + task + worker + assign
    await sendRequest(ws, ORCHESTRATION_WS_METHODS.dispatchCommand, {
      type: "project.create",
      commandId: "cmd-rework-project",
      projectId: "project-rework",
      title: "Rework",
      workspaceRoot: "/tmp/rework",
      defaultModelSelection: { provider: "codex", model: "gpt-5-codex" },
      createdAt,
    });
    await sendRequest(ws, ORCHESTRATION_WS_METHODS.dispatchCommand, {
      type: "thread.create",
      commandId: "cmd-rework-thread",
      threadId: "thread-rework",
      projectId: "project-rework",
      title: "Rework thread",
      modelSelection: { provider: "codex", model: "gpt-5-codex" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdAt,
    });
    const runRes = await sendRequest(ws, WS_METHODS.orchestratorCreateRun, {
      projectId: "project-rework",
      userRequest: "Build with rework",
      goals: [],
      spawnBudget: {
        maxDepth: 1,
        maxChildren: 1,
        maxConcurrentWriters: 1,
        maxTotalWorkers: 1,
        allowedTools: [],
        writeScope: [],
      },
    });
    const run = runRes.result as { runId: string };
    const taskTreeRes = await sendRequest(ws, WS_METHODS.orchestratorGetTaskTree, {
      runId: run.runId,
    });
    const rootTaskId = (taskTreeRes.result as Array<{ taskId: string }>)[0]!.taskId;

    await sendRequest(ws, ORCHESTRATION_WS_METHODS.dispatchCommand, {
      type: "orchestrator.worker.spawn",
      commandId: "cmd-rework-worker",
      workerId: "worker-rework",
      runId: run.runId,
      taskId: rootTaskId,
      threadId: "thread-rework",
      spawnBudget: {
        maxDepth: 0,
        maxChildren: 0,
        maxConcurrentWriters: 1,
        maxTotalWorkers: 1,
        allowedTools: [],
        writeScope: [],
      },
      workspace: { mode: "local", cwd: "/tmp/rework", terminalIds: [] },
      createdAt,
    });
    await sendRequest(ws, ORCHESTRATION_WS_METHODS.dispatchCommand, {
      type: "orchestrator.task.assign",
      commandId: "cmd-rework-assign",
      taskId: rootTaskId,
      assigneeKind: "worker",
      assigneeId: "worker-rework",
      createdAt,
    });

    // Submit first attempt
    await sendRequest(ws, ORCHESTRATION_WS_METHODS.dispatchCommand, {
      type: "orchestrator.task.submit",
      commandId: "cmd-rework-submit-1",
      taskId: rootTaskId,
      workerId: "worker-rework",
      summary: "First attempt",
      createdAt,
    });

    // Reject
    const rejectRes = await sendRequest(ws, ORCHESTRATION_WS_METHODS.dispatchCommand, {
      type: "orchestrator.task.reject",
      commandId: "cmd-rework-reject",
      taskId: rootTaskId,
      instruction: "Missing tests",
      createdAt,
    });
    expect(rejectRes.error).toBeUndefined();

    // Verify needs-rework state
    let snapshot = await sendRequest(ws, ORCHESTRATION_WS_METHODS.getSnapshot);
    let tasks = (
      snapshot.result as {
        orchestratorTasks: Array<{ taskId: string; status: string; iteration: number }>;
      }
    ).orchestratorTasks;
    let task = tasks.find((t) => t.taskId === rootTaskId);
    expect(task?.status).toBe("needs-rework");
    expect(task?.iteration).toBe(1);

    // Resubmit
    await sendRequest(ws, ORCHESTRATION_WS_METHODS.dispatchCommand, {
      type: "orchestrator.task.submit",
      commandId: "cmd-rework-submit-2",
      taskId: rootTaskId,
      workerId: "worker-rework",
      summary: "Second attempt with tests",
      createdAt,
    });

    // Accept
    const acceptRes = await sendRequest(ws, ORCHESTRATION_WS_METHODS.dispatchCommand, {
      type: "orchestrator.task.accept",
      commandId: "cmd-rework-accept",
      taskId: rootTaskId,
      summary: "LGTM now",
      createdAt,
    });
    expect(acceptRes.error).toBeUndefined();

    // Verify accepted
    snapshot = await sendRequest(ws, ORCHESTRATION_WS_METHODS.getSnapshot);
    tasks = (
      snapshot.result as {
        orchestratorTasks: Array<{ taskId: string; status: string; iteration: number }>;
      }
    ).orchestratorTasks;
    task = tasks.find((t) => t.taskId === rootTaskId);
    expect(task?.status).toBe("accepted");
  });
});
```

- [ ] **Step 2: Run the journey test**

Run: `cd /Users/christophe/Documents/Orchestrate/orchestrate && bun run test -- apps/server/src/wsServer.orchestrator.test.ts`

Expected: PASS. If there are type mismatches (e.g., the mock provider shape doesn't match current ProviderServiceShape), fix the mock to match current types.

- [ ] **Step 3: Add a script for this test to apps/server/package.json**

Add to `"scripts"`:

```json
"test:orchestrator-journey": "vitest run src/wsServer.orchestrator.test.ts"
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/wsServer.orchestrator.test.ts apps/server/package.json
git commit -m "test(smoke): add full orchestrator journey smoke test over websocket"
```

---

## Task 7: Recovery Tests

**Files:**

- Create: `apps/server/src/orchestration/recovery.test.ts`

These tests prove the orchestrator survives real operating conditions: restart during active run, event replay after crash, state recovery from persistence.

- [ ] **Step 1: Write recovery tests**

```typescript
// apps/server/src/orchestration/recovery.test.ts
import { CommandId, ProjectId, ThreadId, type OrchestrationEvent } from "@t3tools/contracts";
import { Effect, Layer, ManagedRuntime } from "effect";
import { describe, expect, it } from "vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";

import { OrchestrationEngineLive } from "./Layers/OrchestrationEngine.ts";
import { OrchestrationProjectionPipelineLive } from "./Layers/ProjectionPipeline.ts";
import { OrchestrationEventStoreLive } from "../persistence/Layers/OrchestrationEventStore.ts";
import { OrchestrationCommandReceiptRepositoryLive } from "../persistence/Layers/OrchestrationCommandReceipts.ts";
import { makeSqlitePersistenceLive } from "../persistence/Layers/Sqlite.ts";
import { OrchestrationEngineService } from "./Services/OrchestrationEngine.ts";
import { ServerConfig } from "../config.ts";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const now = () => new Date().toISOString();

/** Create an engine backed by a file-based SQLite DB (survives restart). */
async function createPersistentEngine(dbPath: string) {
  const ServerConfigLayer = ServerConfig.layerTest(process.cwd(), {
    prefix: "t3-recovery-test-",
  });

  // Use file-based persistence instead of in-memory
  const persistenceLayer = makeSqlitePersistenceLive(dbPath);

  const orchestrationLayer = OrchestrationEngineLive.pipe(
    Layer.provide(OrchestrationProjectionPipelineLive),
    Layer.provide(OrchestrationEventStoreLive),
    Layer.provide(OrchestrationCommandReceiptRepositoryLive),
    Layer.provide(persistenceLayer),
    Layer.provideMerge(ServerConfigLayer),
    Layer.provideMerge(NodeServices.layer),
  );

  const runtime = ManagedRuntime.make(orchestrationLayer);
  const engine = await runtime.runPromise(Effect.service(OrchestrationEngineService));
  return {
    engine,
    run: <A, E>(effect: Effect.Effect<A, E>) => runtime.runPromise(effect),
    dispose: () => runtime.dispose(),
  };
}

describe("orchestrator recovery", () => {
  const tempDirs: string[] = [];

  function makeTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t3-recovery-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("recovers orchestrator run state after engine restart", async () => {
    const dir = makeTempDir();
    const dbPath = path.join(dir, "test.db");

    // Phase 1: Create run and task
    const system1 = await createPersistentEngine(dbPath);
    const createdAt = now();

    await system1.run(
      system1.engine.dispatch({
        type: "project.create",
        commandId: CommandId.makeUnsafe("cmd-recovery-project"),
        projectId: ProjectId.makeUnsafe("project-recovery"),
        title: "Recovery Test",
        workspaceRoot: "/tmp/recovery",
        defaultModelSelection: { provider: "codex", model: "gpt-5-codex" },
        createdAt,
      }),
    );

    await system1.run(
      system1.engine.dispatch({
        type: "orchestrator.run.create",
        commandId: CommandId.makeUnsafe("cmd-recovery-run"),
        runId: "run-recovery",
        projectId: ProjectId.makeUnsafe("project-recovery"),
        userRequest: "Build it",
        goals: ["Works"],
        spawnBudget: {
          maxDepth: 1,
          maxChildren: 1,
          maxConcurrentWriters: 1,
          maxTotalWorkers: 1,
          allowedTools: [],
          writeScope: [],
        },
        createdAt,
      }),
    );

    // Verify state before shutdown
    const model1 = await system1.run(system1.engine.getReadModel());
    expect(model1.orchestratorRuns).toHaveLength(1);
    expect(model1.orchestratorRuns[0]!.status).toBe("active");

    // Shutdown
    await system1.dispose();

    // Phase 2: Restart with same DB
    const system2 = await createPersistentEngine(dbPath);

    // State should be recovered from events
    const model2 = await system2.run(system2.engine.getReadModel());
    expect(model2.orchestratorRuns).toHaveLength(1);
    expect(model2.orchestratorRuns[0]!.runId).toBe("run-recovery");
    expect(model2.orchestratorRuns[0]!.status).toBe("active");
    expect(model2.projects).toHaveLength(1);

    // Should be able to continue operating
    await system2.run(
      system2.engine.dispatch({
        type: "orchestrator.run.cancel",
        commandId: CommandId.makeUnsafe("cmd-recovery-cancel"),
        runId: "run-recovery",
        reason: "Test complete",
        createdAt: now(),
      }),
    );

    const model3 = await system2.run(system2.engine.getReadModel());
    expect(model3.orchestratorRuns[0]!.status).toBe("cancelled");

    await system2.dispose();
  });
});
```

- [ ] **Step 2: Run recovery tests**

Run: `cd /Users/christophe/Documents/Orchestrate/orchestrate && bun run test -- apps/server/src/orchestration/recovery.test.ts`

Expected: PASS if `makeSqlitePersistenceLive` accepts a file path. If not, check the actual API and fix.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/orchestration/recovery.test.ts
git commit -m "test(recovery): add engine restart recovery test with file-based SQLite"
```

---

## Task 8: Wire Up Package Scripts

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Add per-layer test scripts to root package.json**

Add these scripts to the root `package.json` `"scripts"` section:

```json
"test:contracts": "cd packages/contracts && bun run test",
"test:decider": "cd apps/server && vitest run src/orchestration/decider.orchestrator.test.ts",
"test:projector": "cd apps/server && vitest run src/orchestration/projector.orchestrator.test.ts",
"test:persistence": "cd apps/server && vitest run src/persistence/Layers/OrchestratorRuns.test.ts",
"test:recovery": "cd apps/server && vitest run src/orchestration/recovery.test.ts",
"test:journey": "cd apps/server && vitest run src/wsServer.orchestrator.test.ts"
```

- [ ] **Step 2: Run each script to verify wiring**

Run: `cd /Users/christophe/Documents/Orchestrate/orchestrate && bun run test:contracts && bun run test:decider && bun run test:projector`

Expected: All PASS.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add per-layer test scripts to root package.json"
```

---

## Validation Matrix

### Mandatory (Blocking) Gates

| #   | Layer                 | Command                                      | What it catches                |
| --- | --------------------- | -------------------------------------------- | ------------------------------ |
| 1   | Contracts typecheck   | `cd packages/contracts && bun run typecheck` | Type drift in shared schemas   |
| 2   | Server typecheck      | `cd apps/server && bun run typecheck`        | Type errors in server code     |
| 3   | Web typecheck         | `cd apps/web && bun run typecheck`           | Type errors in UI code         |
| 4   | Lint                  | `bun lint`                                   | Code quality, unused imports   |
| 5   | Contract schema tests | `bun run test:contracts`                     | Schema decode/encode stability |
| 6   | Decider tests         | `bun run test:decider`                       | Command→event invariants       |
| 7   | Projector tests       | `bun run test:projector`                     | Event→read-model correctness   |
| 8   | Persistence tests     | `bun run test:persistence`                   | SQLite round-trip correctness  |
| 9   | Full suites           | `turbo run test`                             | All unit/integration tests     |
| 10  | Orchestrator smoke    | `bun run test:orchestrator-smoke`            | Server RPC surface works       |
| 11  | Journey smoke         | `bun run test:journey`                       | Full delegate flow end-to-end  |
| 12  | Recovery              | `bun run test:recovery`                      | State survives restart         |

### Advisory (Non-Blocking) Gates

| #   | Layer             | Command                               | What it catches                 |
| --- | ----------------- | ------------------------------------- | ------------------------------- |
| 13  | UI browser e2e    | `cd apps/web && bun run test:browser` | Layout, scroll, thin-panel bugs |
| 14  | Live Codex smoke  | Manual opt-in                         | Real Codex CLI integration      |
| 15  | Live Claude smoke | Manual opt-in                         | Real Claude CLI integration     |

### Gate Runner

Run all mandatory + advisory gates with a single command:

```bash
bun run test:gate
```

This prints a matrix summary and exits non-zero if any blocking gate fails.
