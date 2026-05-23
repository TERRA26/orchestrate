import { describe, expect, it } from "vitest";

import { DEFAULT_STALE_TURN_MS, evaluateTurnStaleness } from "./turnStaleness.ts";

describe("evaluateTurnStaleness (ORC-219)", () => {
  const T0 = "2026-05-07T12:00:00.000Z";
  const T0_MS = Date.parse(T0);

  it("returns stale=true when a running worker has been idle longer than threshold", () => {
    const result = evaluateTurnStaleness({
      status: "running",
      updatedAt: T0,
      nowMs: T0_MS + DEFAULT_STALE_TURN_MS + 1000,
    });
    expect(result.stale).toBe(true);
    expect(result.idleMs).toBeGreaterThan(DEFAULT_STALE_TURN_MS);
  });

  it("returns stale=false for a freshly-active running worker", () => {
    const result = evaluateTurnStaleness({
      status: "running",
      updatedAt: T0,
      nowMs: T0_MS + 1000,
    });
    expect(result.stale).toBe(false);
    expect(result.idleMs).toBeLessThan(DEFAULT_STALE_TURN_MS);
  });

  it("does not mark non-running statuses as stale", () => {
    for (const status of ["submitted", "terminated", "blocked", "ready-for-review"]) {
      const result = evaluateTurnStaleness({
        status,
        updatedAt: T0,
        nowMs: T0_MS + DEFAULT_STALE_TURN_MS + 1000,
      });
      expect(result.stale).toBe(false);
    }
  });

  it("treats `assigned` workers as eligible for staleness (handed off but not yet active)", () => {
    const result = evaluateTurnStaleness({
      status: "assigned",
      updatedAt: T0,
      nowMs: T0_MS + DEFAULT_STALE_TURN_MS + 1000,
    });
    expect(result.stale).toBe(true);
  });

  it("returns stale=false when updatedAt is missing", () => {
    const result = evaluateTurnStaleness({
      status: "running",
      updatedAt: undefined,
      nowMs: T0_MS,
    });
    expect(result.stale).toBe(false);
    expect(result.idleMs).toBeUndefined();
  });

  it("returns stale=false when updatedAt is unparseable", () => {
    const result = evaluateTurnStaleness({
      status: "running",
      updatedAt: "not-a-real-iso-string",
      nowMs: T0_MS,
    });
    expect(result.stale).toBe(false);
    expect(result.idleMs).toBeUndefined();
  });

  it("respects an override thresholdMs", () => {
    const result = evaluateTurnStaleness({
      status: "running",
      updatedAt: T0,
      nowMs: T0_MS + 30_000,
      thresholdMs: 10_000,
    });
    expect(result.stale).toBe(true);
    expect(result.thresholdMs).toBe(10_000);
  });

  it("clamps idleMs to >= 0 when nowMs is before updatedAt (clock skew)", () => {
    const result = evaluateTurnStaleness({
      status: "running",
      updatedAt: T0,
      nowMs: T0_MS - 5000,
    });
    expect(result.stale).toBe(false);
    expect(result.idleMs).toBe(0);
  });
});
