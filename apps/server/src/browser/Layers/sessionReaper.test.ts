import { describe, expect, it } from "vitest";

import {
  DEFAULT_SESSION_IDLE_TTL_MS,
  DEFAULT_SESSION_REAPER_INTERVAL_MS,
  DEFAULT_SESSION_WARN_THRESHOLD,
  evaluateIdleSessions,
} from "./sessionReaper.ts";

describe("evaluateIdleSessions (ORC-048)", () => {
  it("evicts sessions whose idle time exceeds the TTL", () => {
    const now = 1_000_000;
    const ttl = 5_000;
    const decision = evaluateIdleSessions({
      now,
      idleTtlMs: ttl,
      entries: [
        { id: "fresh", lastActivityAt: now - 100 },
        { id: "stale", lastActivityAt: now - ttl - 1 },
        { id: "very-stale", lastActivityAt: now - ttl - 10_000 },
      ],
    });
    expect(decision.toEvict).toEqual(["stale", "very-stale"]);
    expect(decision.activeCount).toBe(1);
  });

  it("does not evict at the boundary (strict greater-than)", () => {
    const now = 1_000_000;
    const ttl = 5_000;
    const decision = evaluateIdleSessions({
      now,
      idleTtlMs: ttl,
      entries: [{ id: "edge", lastActivityAt: now - ttl }],
    });
    expect(decision.toEvict).toEqual([]);
    expect(decision.activeCount).toBe(1);
  });

  it("evicts a session at TTL+1 ms", () => {
    const now = 1_000_000;
    const ttl = 5_000;
    const decision = evaluateIdleSessions({
      now,
      idleTtlMs: ttl,
      entries: [{ id: "edge-plus", lastActivityAt: now - ttl - 1 }],
    });
    expect(decision.toEvict).toEqual(["edge-plus"]);
  });

  it("emits warnExceeded only when the surviving count exceeds the threshold", () => {
    const now = 1_000_000;
    const entries = Array.from({ length: 101 }, (_, i) => ({
      id: `s${i}`,
      lastActivityAt: now,
    }));
    const decision = evaluateIdleSessions({
      now,
      entries,
      warnThreshold: 100,
    });
    expect(decision.warnExceeded).toBe(true);
    expect(decision.activeCount).toBe(101);
  });

  it("does not warn when the surviving count is at the threshold", () => {
    const now = 1_000_000;
    const entries = Array.from({ length: 100 }, (_, i) => ({
      id: `s${i}`,
      lastActivityAt: now,
    }));
    const decision = evaluateIdleSessions({
      now,
      entries,
      warnThreshold: 100,
    });
    expect(decision.warnExceeded).toBe(false);
    expect(decision.activeCount).toBe(100);
  });

  it("excludes evicted sessions from activeCount when computing warnExceeded", () => {
    const now = 1_000_000;
    const ttl = 5_000;
    const stale = Array.from({ length: 50 }, (_, i) => ({
      id: `stale-${i}`,
      lastActivityAt: now - ttl - 1,
    }));
    const fresh = Array.from({ length: 80 }, (_, i) => ({
      id: `fresh-${i}`,
      lastActivityAt: now,
    }));
    const decision = evaluateIdleSessions({
      now,
      idleTtlMs: ttl,
      warnThreshold: 100,
      entries: [...stale, ...fresh],
    });
    expect(decision.toEvict.length).toBe(50);
    expect(decision.activeCount).toBe(80);
    expect(decision.warnExceeded).toBe(false);
  });

  it("returns an empty decision for an empty input", () => {
    const decision = evaluateIdleSessions({ now: 1_000_000, entries: [] });
    expect(decision.toEvict).toEqual([]);
    expect(decision.activeCount).toBe(0);
    expect(decision.warnExceeded).toBe(false);
  });

  it("reports the applied idleTtlMs and warnThreshold for instrumentation", () => {
    const decision = evaluateIdleSessions({
      now: 0,
      entries: [],
      idleTtlMs: 7,
      warnThreshold: 9,
    });
    expect(decision.idleTtlMs).toBe(7);
    expect(decision.warnThreshold).toBe(9);
  });

  it("falls back to the documented defaults when no overrides are provided", () => {
    const decision = evaluateIdleSessions({ now: 0, entries: [] });
    expect(decision.idleTtlMs).toBe(DEFAULT_SESSION_IDLE_TTL_MS);
    expect(decision.warnThreshold).toBe(DEFAULT_SESSION_WARN_THRESHOLD);
  });

  it("documents reaper-interval default at 5 minutes", () => {
    expect(DEFAULT_SESSION_REAPER_INTERVAL_MS).toBe(5 * 60 * 1000);
    expect(DEFAULT_SESSION_IDLE_TTL_MS).toBe(30 * 60 * 1000);
    expect(DEFAULT_SESSION_WARN_THRESHOLD).toBe(100);
  });
});
