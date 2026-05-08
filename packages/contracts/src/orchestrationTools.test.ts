import { describe, expect, it } from "vitest";
import { Effect, Schema, Result } from "effect";

import {
  GetAgentStatusOutput,
  SendUpdateToOrchestratorInput,
  SpawnAgentInput,
} from "./orchestrationTools";

function decode(input: unknown) {
  return Effect.runSync(
    Schema.decodeUnknownEffect(SendUpdateToOrchestratorInput)(input).pipe(Effect.result),
  );
}

describe("SendUpdateToOrchestratorInput discriminated union (ORC-128)", () => {
  it("accepts a valid in-progress update with nextStep", () => {
    const result = decode({
      status: "in-progress",
      summary: "Working on the auth refactor",
      nextStep: "Add the validator",
    });
    expect(Result.isSuccess(result)).toBe(true);
  });

  it("accepts a valid needs-input update with question", () => {
    const result = decode({
      status: "needs-input",
      summary: "Need clarification",
      question: "Which provider should I use?",
    });
    expect(Result.isSuccess(result)).toBe(true);
  });

  it("accepts a valid blocked update with blockedReason", () => {
    const result = decode({
      status: "blocked",
      summary: "Cannot proceed",
      blockedReason: "Database is unreachable",
    });
    expect(Result.isSuccess(result)).toBe(true);
  });

  it("accepts a valid ready-for-review update with no extra fields", () => {
    const result = decode({
      status: "ready-for-review",
      summary: "All work done",
    });
    expect(Result.isSuccess(result)).toBe(true);
  });

  it("rejects an in-progress update that includes blockedReason (ORC-128 core case)", () => {
    const result = decode({
      status: "in-progress",
      summary: "Working",
      blockedReason: "fake reason on the wrong status",
    });
    expect(Result.isFailure(result)).toBe(true);
  });

  it("rejects an in-progress update that includes a question", () => {
    const result = decode({
      status: "in-progress",
      summary: "Working",
      question: "fake question on the wrong status",
    });
    expect(Result.isFailure(result)).toBe(true);
  });

  it("rejects a needs-input update missing the question field", () => {
    const result = decode({
      status: "needs-input",
      summary: "Need clarification",
    });
    expect(Result.isFailure(result)).toBe(true);
  });

  it("rejects a blocked update missing the blockedReason field", () => {
    const result = decode({
      status: "blocked",
      summary: "Stuck",
    });
    expect(Result.isFailure(result)).toBe(true);
  });

  it("rejects a ready-for-review update with extra cross-field data", () => {
    const result = decode({
      status: "ready-for-review",
      summary: "All done",
      blockedReason: "this should not be here",
    });
    expect(Result.isFailure(result)).toBe(true);
  });
});

describe("SpawnAgentInput.spawnBudget shape (ORC-129)", () => {
  function decodeSpawnAgent(input: unknown) {
    return Effect.runSync(
      Schema.decodeUnknownEffect(SpawnAgentInput)(input).pipe(Effect.result),
    );
  }

  it("accepts a budget with exactly the four numeric counters", () => {
    const result = decodeSpawnAgent({
      runId: "run-1",
      taskId: "task-1",
      spawnBudget: {
        maxDepth: 2,
        maxChildren: 4,
        maxConcurrentWriters: 1,
        maxTotalWorkers: 8,
      },
    });
    expect(Result.isSuccess(result)).toBe(true);
  });

  it("accepts a payload omitting spawnBudget entirely (server fills defaults)", () => {
    const result = decodeSpawnAgent({
      runId: "run-1",
      taskId: "task-1",
    });
    expect(Result.isSuccess(result)).toBe(true);
  });

  it("the schema's spawnBudget keys are exactly the four documented counters (no policy fields)", () => {
    // The canonical SpawnBudget in orchestration.ts has 6 fields
    // including allowedTools + writeScope. The orchestrator-facing
    // tool surface intentionally hides those; verify by inspecting
    // the schema's field set rather than relying on decode strictness
    // (the canonical decode is loose to support pass-through, but
    // the SHAPE of the tool input is the contract).
    type SpawnAgentInputType = typeof SpawnAgentInput.Type;
    type BudgetType = NonNullable<SpawnAgentInputType["spawnBudget"]>;
    type ExpectedKeys = "maxDepth" | "maxChildren" | "maxConcurrentWriters" | "maxTotalWorkers";
    // If a future contributor adds a key to the budget struct, the
    // following line will fail to typecheck. Both directions checked:
    // every actual key is in ExpectedKeys, and ExpectedKeys covers
    // every actual key.
    const _coversBoth: ExpectedKeys = "" as unknown as keyof BudgetType;
    const _coversBoth2: keyof BudgetType = "" as unknown as ExpectedKeys;
    expect(_coversBoth).toBeDefined();
    expect(_coversBoth2).toBeDefined();
  });

  it("decode of a budget with extra allowedTools strips the policy field (back-compat)", () => {
    // Production decode is loose; orchestrator-supplied extras get
    // dropped silently rather than rejected. The pinning test
    // documents this and asserts the dropped field is not present in
    // the decoded value, so a future contributor relying on the
    // policy field flowing through would catch the mismatch.
    const result = decodeSpawnAgent({
      runId: "run-1",
      taskId: "task-1",
      spawnBudget: {
        maxDepth: 2,
        maxChildren: 4,
        maxConcurrentWriters: 1,
        maxTotalWorkers: 8,
        allowedTools: ["read", "write"],
      },
    });
    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) {
      const decoded = result.success as {
        spawnBudget?: Record<string, unknown>;
      };
      expect(decoded.spawnBudget).toBeDefined();
      expect((decoded.spawnBudget ?? {})["allowedTools"]).toBeUndefined();
      expect((decoded.spawnBudget ?? {})["writeScope"]).toBeUndefined();
    }
  });
});

describe("GetAgentStatusOutput shape (ORC-130)", () => {
  function decodeStatus(input: unknown) {
    return Effect.runSync(
      Schema.decodeUnknownEffect(GetAgentStatusOutput)(input).pipe(Effect.result),
    );
  }

  it("decodes the minimal required fields", () => {
    const result = decodeStatus({
      agentId: "agent-1",
      status: "running",
      visibility: "foreground",
      activeTaskId: "task-1",
      threadId: "thread-1",
      updatedAt: "2026-04-09T12:00:00.000Z",
    });
    expect(Result.isSuccess(result)).toBe(true);
  });

  it("decodes the full handler output (mirrors handleGetAgentStatus)", () => {
    // Mirrors apps/server/src/orchestration/Layers/OrchestrationToolRouter.ts
    // handleGetAgentStatus return at lines 430-461 (post-fix). All optional
    // fields populated together so a decode regression catches drift in
    // either direction.
    const result = decodeStatus({
      agentId: "agent-1",
      status: "running",
      visibility: "foreground",
      activeTaskId: "task-1",
      threadId: "thread-1",
      updatedAt: "2026-04-09T12:00:00.000Z",
      latestUpdate: {
        status: "in-progress",
        summary: "Implementing the feature",
        nextStep: "Run lint",
        postedAt: "2026-04-09T12:00:30.000Z",
      },
      lastAssistantMessage: "Let me check the test results.",
      submitSummary: "Done; tests passing.",
      filesWritten: ["src/foo.ts", "src/bar.ts"],
      testsRun: [
        { name: "foo.spec.ts", status: "pass" },
        { name: "bar.spec.ts", status: "pass" },
      ],
      submitNotes: "no warnings",
      hasChanges: true,
      diffStats: { filesChanged: 2, additions: 12, deletions: 4 },
      stale: false,
      idleMs: 1000,
      stalenessThresholdMs: 600000,
      stalenessReason: "all good",
    });
    expect(Result.isSuccess(result)).toBe(true);
  });

  it("decodes a status with stale=true and a reason set", () => {
    const result = decodeStatus({
      agentId: "agent-1",
      status: "running",
      visibility: "foreground",
      activeTaskId: "task-1",
      threadId: "thread-1",
      updatedAt: "2026-04-09T12:00:00.000Z",
      stale: true,
      idleMs: 700_000,
      stalenessThresholdMs: 600_000,
      stalenessReason: "No worker activity for over 10 minutes.",
    });
    expect(Result.isSuccess(result)).toBe(true);
  });

  it("rejects an output missing the required `agentId` field", () => {
    const result = decodeStatus({
      status: "running",
      visibility: "foreground",
      activeTaskId: null,
      threadId: "thread-1",
      updatedAt: "2026-04-09T12:00:00.000Z",
    });
    expect(Result.isFailure(result)).toBe(true);
  });

  it("rejects an invalid latestUpdate shape", () => {
    const result = decodeStatus({
      agentId: "agent-1",
      status: "running",
      visibility: "foreground",
      activeTaskId: null,
      threadId: "thread-1",
      updatedAt: "2026-04-09T12:00:00.000Z",
      latestUpdate: { wrong: "shape" },
    });
    expect(Result.isFailure(result)).toBe(true);
  });
});
