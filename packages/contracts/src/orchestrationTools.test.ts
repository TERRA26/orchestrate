import { describe, expect, it } from "vitest";
import { Effect, Schema, Result } from "effect";

import { SendUpdateToOrchestratorInput } from "./orchestrationTools.ts";

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
