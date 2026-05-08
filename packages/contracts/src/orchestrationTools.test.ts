import { describe, expect, it } from "vitest";
import { Effect, Schema, Result } from "effect";

import { SendUpdateToOrchestratorInput, SpawnAgentInput } from "./orchestrationTools";

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
