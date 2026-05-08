import { describe, expect, it } from "vitest";

import { makeAuthAttemptLimiter } from "./authAttemptLimiter";

/**
 * Pins the per-IP auth-attempt rate limiter introduced by ORC-239.
 *
 * @see ORC-239
 */

function makeClock(initial = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let current = initial;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe("makeAuthAttemptLimiter (ORC-239)", () => {
  it("returns blocked=false for unknown IPs", () => {
    const limiter = makeAuthAttemptLimiter();
    const outcome = limiter.isBlocked("1.2.3.4");
    expect(outcome.blocked).toBe(false);
    expect(outcome.failureCount).toBe(0);
  });

  it("does NOT block until threshold is reached", () => {
    const limiter = makeAuthAttemptLimiter({ threshold: 5 });
    for (let i = 0; i < 4; i += 1) {
      const outcome = limiter.recordFailure("1.2.3.4");
      expect(outcome.blocked).toBe(false);
    }
  });

  it("blocks the IP once the threshold is hit", () => {
    const limiter = makeAuthAttemptLimiter({ threshold: 5, baseBlockMs: 30_000 });
    let lastOutcome;
    for (let i = 0; i < 5; i += 1) {
      lastOutcome = limiter.recordFailure("1.2.3.4");
    }
    expect(lastOutcome?.blocked).toBe(true);
    expect(lastOutcome?.retryAfterMs).toBeGreaterThan(0);
  });

  it("returns blocked=true on subsequent isBlocked checks during the window", () => {
    const clock = makeClock();
    const limiter = makeAuthAttemptLimiter({
      threshold: 1,
      baseBlockMs: 30_000,
      now: clock.now,
    });
    limiter.recordFailure("1.2.3.4");
    expect(limiter.isBlocked("1.2.3.4").blocked).toBe(true);

    clock.advance(15_000);
    expect(limiter.isBlocked("1.2.3.4").blocked).toBe(true);
  });

  it("clears the block window once retry time elapses", () => {
    const clock = makeClock();
    const limiter = makeAuthAttemptLimiter({
      threshold: 1,
      baseBlockMs: 30_000,
      now: clock.now,
    });
    limiter.recordFailure("1.2.3.4");
    expect(limiter.isBlocked("1.2.3.4").blocked).toBe(true);

    clock.advance(31_000);
    expect(limiter.isBlocked("1.2.3.4").blocked).toBe(false);
  });

  it("escalates the block window with exponential backoff", () => {
    const clock = makeClock();
    const limiter = makeAuthAttemptLimiter({
      threshold: 1,
      baseBlockMs: 30_000,
      maxBlockMs: 60 * 60_000,
      now: clock.now,
    });
    // First failure -> 30s.
    const a = limiter.recordFailure("1.2.3.4");
    expect(a.retryAfterMs).toBe(30_000);

    // Second failure (still within window) -> exponent grows.
    const b = limiter.recordFailure("1.2.3.4");
    expect(b.retryAfterMs).toBe(60_000);

    // Third -> 120s.
    const c = limiter.recordFailure("1.2.3.4");
    expect(c.retryAfterMs).toBe(120_000);
  });

  it("clamps the block window at maxBlockMs", () => {
    const clock = makeClock();
    const limiter = makeAuthAttemptLimiter({
      threshold: 1,
      baseBlockMs: 30_000,
      maxBlockMs: 60_000,
      now: clock.now,
    });
    let last;
    for (let i = 0; i < 10; i += 1) {
      last = limiter.recordFailure("1.2.3.4");
    }
    expect(last?.retryAfterMs).toBe(60_000);
  });

  it("recordSuccess clears the IP entry entirely", () => {
    const limiter = makeAuthAttemptLimiter({ threshold: 5 });
    for (let i = 0; i < 3; i += 1) limiter.recordFailure("1.2.3.4");
    limiter.recordSuccess("1.2.3.4");
    expect(limiter.currentState("1.2.3.4").failureCount).toBe(0);
  });

  it("isolates state per IP", () => {
    const limiter = makeAuthAttemptLimiter({ threshold: 1 });
    limiter.recordFailure("1.2.3.4");
    expect(limiter.isBlocked("1.2.3.4").blocked).toBe(true);
    expect(limiter.isBlocked("5.6.7.8").blocked).toBe(false);
  });

  it("post-window failures continue to escalate (do not reset to base)", () => {
    const clock = makeClock();
    const limiter = makeAuthAttemptLimiter({
      threshold: 1,
      baseBlockMs: 30_000,
      now: clock.now,
    });
    limiter.recordFailure("1.2.3.4");
    expect(limiter.recordFailure("1.2.3.4").retryAfterMs).toBe(60_000);

    // Advance past the second block; the next failure should not
    // start over at 30s but escalate further (failure count is
    // persistent: failures=3 -> exponent=2 -> 30_000 * 4 = 120_000).
    clock.advance(120_000);
    const next = limiter.recordFailure("1.2.3.4");
    expect(next.retryAfterMs).toBe(120_000);
  });
});
