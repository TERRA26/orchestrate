import { describe, expect, it } from "vitest";

import { withStableCommandId } from "./idempotentDispatch";

/**
 * Pins the stable-commandId retry helper introduced by ORC-171.
 *
 * @see ORC-171
 */

const noSleep = async (_ms: number) => {
  /* no-op: tests should never block on real time */
};

describe("withStableCommandId (ORC-171)", () => {
  it("invokes the operation once and returns its result on first success", async () => {
    let invocations = 0;
    const result = await withStableCommandId(
      async (commandId) => {
        invocations += 1;
        return { commandId };
      },
      { sleep: noSleep },
    );
    expect(invocations).toBe(1);
    expect(typeof result.commandId).toBe("string");
    expect(result.commandId.length).toBeGreaterThan(0);
  });

  it("reuses the SAME commandId across retry attempts (the bug fix)", async () => {
    const seenIds: string[] = [];
    let attempts = 0;
    const result = await withStableCommandId<string>(
      async (commandId) => {
        seenIds.push(commandId);
        attempts += 1;
        if (attempts < 3) throw new Error("Timeout");
        return commandId;
      },
      { baseDelayMs: 0, sleep: noSleep },
    );
    expect(attempts).toBe(3);
    expect(new Set(seenIds).size).toBe(1);
    expect(seenIds[0]).toBe(result);
  });

  it("rethrows non-retryable errors immediately without retrying", async () => {
    let attempts = 0;
    await expect(
      withStableCommandId(
        async () => {
          attempts += 1;
          throw new Error("Validation failed");
        },
        { sleep: noSleep },
      ),
    ).rejects.toThrow("Validation failed");
    expect(attempts).toBe(1);
  });

  it("rethrows the last error after maxAttempts exhaustion", async () => {
    let attempts = 0;
    await expect(
      withStableCommandId(
        async () => {
          attempts += 1;
          throw new Error("Cannot connect to ws://localhost:0");
        },
        { maxAttempts: 2, baseDelayMs: 0, sleep: noSleep },
      ),
    ).rejects.toThrow("Cannot connect");
    expect(attempts).toBe(2);
  });

  it("treats 'Timeout' as retryable by default", async () => {
    let attempts = 0;
    const result = await withStableCommandId<number>(
      async () => {
        attempts += 1;
        if (attempts < 2) throw new Error("Timeout");
        return attempts;
      },
      { baseDelayMs: 0, sleep: noSleep },
    );
    expect(result).toBe(2);
  });

  it("treats 'WebSocket is not open' as retryable by default", async () => {
    let attempts = 0;
    const result = await withStableCommandId<number>(
      async () => {
        attempts += 1;
        if (attempts < 2) throw new Error("WebSocket is not open: readyState 3 (CLOSED)");
        return attempts;
      },
      { baseDelayMs: 0, sleep: noSleep },
    );
    expect(result).toBe(2);
  });

  it("treats ECONNRESET / ECONNREFUSED as retryable by default", async () => {
    let attempts = 0;
    const result = await withStableCommandId<number>(
      async () => {
        attempts += 1;
        if (attempts < 2) throw new Error("connect ECONNREFUSED 127.0.0.1:0");
        return attempts;
      },
      { baseDelayMs: 0, sleep: noSleep },
    );
    expect(result).toBe(2);
  });

  it("respects custom isRetryable predicate", async () => {
    let attempts = 0;
    const result = await withStableCommandId<number>(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("server busy");
        return attempts;
      },
      {
        baseDelayMs: 0,
        sleep: noSleep,
        isRetryable: (error) =>
          error instanceof Error && /server busy/.test(error.message),
      },
    );
    expect(result).toBe(3);
  });

  it("uses exponential backoff delays (256, 512, ...)", async () => {
    const delays: number[] = [];
    let attempts = 0;
    await withStableCommandId(
      async () => {
        attempts += 1;
        if (attempts < 4) throw new Error("Timeout");
        return attempts;
      },
      {
        maxAttempts: 4,
        baseDelayMs: 256,
        sleep: async (ms: number) => {
          delays.push(ms);
        },
      },
    );
    expect(delays).toEqual([256, 512, 1024]);
  });

  it("accepts an injected generateId for deterministic tests", async () => {
    const result = await withStableCommandId<string>(
      async (commandId) => commandId,
      { generateId: () => "fixed-id", sleep: noSleep },
    );
    expect(result).toBe("fixed-id");
  });

  it("generates UUIDs by default (length and shape sanity)", async () => {
    const result = await withStableCommandId<string>(
      async (commandId) => commandId,
      { sleep: noSleep },
    );
    expect(result).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
