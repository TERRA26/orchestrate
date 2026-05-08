import { describe, expect, it } from "vitest";

import { validateToolCallResult } from "./codexToolCallResultGuard";

/**
 * Pins the tool-call-result guard introduced by ORC-221.
 *
 * @see ORC-221
 */

describe("validateToolCallResult (ORC-221)", () => {
  it("accepts a plain object with serializable fields", () => {
    const outcome = validateToolCallResult("orchestrate_get_status", {
      status: "ok",
      count: 3,
      labels: ["a", "b"],
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value).toEqual({
        status: "ok",
        count: 3,
        labels: ["a", "b"],
      });
    }
  });

  it("accepts undefined (handlers returning void are mapped to ok:true)", () => {
    const outcome = validateToolCallResult("orchestrate_void", undefined);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value).toBeUndefined();
    }
  });

  it("accepts null", () => {
    const outcome = validateToolCallResult("orchestrate_null", null);
    expect(outcome.ok).toBe(true);
  });

  it("accepts primitives (string, number, boolean)", () => {
    expect(validateToolCallResult("t", "hello").ok).toBe(true);
    expect(validateToolCallResult("t", 42).ok).toBe(true);
    expect(validateToolCallResult("t", true).ok).toBe(true);
  });

  it("rejects objects with circular references", () => {
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    const outcome = validateToolCallResult("orchestrate_cycle", cycle);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.reason).toBe("exception");
      expect(outcome.error.toolName).toBe("orchestrate_cycle");
    }
  });

  it("rejects values that contain NaN", () => {
    const outcome = validateToolCallResult("orchestrate_nan", {
      ratio: Number.NaN,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.reason).toBe("non-finite-number");
    }
  });

  it("rejects values that contain Infinity", () => {
    const outcome = validateToolCallResult("orchestrate_inf", {
      ratio: Number.POSITIVE_INFINITY,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.reason).toBe("non-finite-number");
    }
  });

  it("rejects deeply-nested NaN", () => {
    const outcome = validateToolCallResult("orchestrate_deep", {
      stats: { latency: { p50: 12, p95: Number.NaN } },
    });
    expect(outcome.ok).toBe(false);
  });

  it("rejects bare function values (not JSON-serializable)", () => {
    const outcome = validateToolCallResult(
      "orchestrate_fn",
      () => 1 as unknown,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.reason).toBe("non-serializable");
    }
  });

  it("rejects bare symbols (not JSON-serializable)", () => {
    const outcome = validateToolCallResult(
      "orchestrate_sym",
      Symbol("x") as unknown,
    );
    expect(outcome.ok).toBe(false);
  });

  it("returns the parsed roundtrip value (defensive copy)", () => {
    const original = { count: 1 };
    const outcome = validateToolCallResult("orchestrate_copy", original);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value).toEqual(original);
      // Roundtrip produces a new object, not the original.
      expect(outcome.value).not.toBe(original);
    }
  });

  it("error payload includes the toolName for diagnosis", () => {
    const outcome = validateToolCallResult("orchestrate_diag", {
      x: Number.NaN,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.toolName).toBe("orchestrate_diag");
      expect(outcome.error.code).toBe("tool_result_invalid");
    }
  });
});
