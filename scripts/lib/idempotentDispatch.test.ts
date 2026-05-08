import { describe, expect, it } from "vitest";

import {
  drainPendingRequestsWith,
  formatConnectionClosedReason,
  withStableCommandId,
} from "./idempotentDispatch";

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

describe("drainPendingRequestsWith (ORC-220)", () => {
  it("rejects every pending entry with the supplied error and clears the Map", async () => {
    const pending = new Map<string, { reject: (e: Error) => void; promise: Promise<unknown> }>();
    const promises: Array<Promise<unknown>> = [];
    for (const id of ["a", "b", "c"]) {
      const promise = new Promise((_resolve, reject) => {
        pending.set(id, { reject, promise: undefined as unknown as Promise<unknown> });
      });
      promises.push(promise);
    }
    const result = drainPendingRequestsWith(
      pending as unknown as Map<string, { reject: (e: Error) => void }>,
      new Error("boom"),
    );
    expect(result.drained).toBe(3);
    expect(pending.size).toBe(0);

    // All promises must have rejected with our error.
    const settled = await Promise.allSettled(promises);
    for (const s of settled) {
      expect(s.status).toBe("rejected");
      if (s.status === "rejected") {
        expect((s.reason as Error).message).toBe("boom");
      }
    }
  });

  it("returns drained:0 on an already-empty Map (idempotent)", () => {
    const pending = new Map<string, { reject: (e: Error) => void }>();
    expect(drainPendingRequestsWith(pending, new Error("x")).drained).toBe(0);
  });

  it("does not throw when a reject handler synchronously mutates the Map", () => {
    const pending = new Map<string, { reject: (e: Error) => void }>();
    let rejectsOk = 0;
    pending.set("a", {
      reject: () => {
        // simulate a handler that re-enters and adds a phantom pending.
        pending.set("phantom", { reject: () => {} });
        rejectsOk += 1;
      },
    });
    pending.set("b", {
      reject: () => {
        rejectsOk += 1;
      },
    });
    expect(() =>
      drainPendingRequestsWith(pending, new Error("x")),
    ).not.toThrow();
    expect(rejectsOk).toBe(2);
    // The phantom that "a" re-added is NOT drained by the snapshot
    // pass; the Map post-clear has only the phantom entry.
    expect(pending.size).toBe(1);
    expect(pending.has("phantom")).toBe(true);
  });
});

describe("formatConnectionClosedReason (ORC-220)", () => {
  it("returns 'connection_closed' for null event", () => {
    expect(formatConnectionClosedReason(null)).toBe("connection_closed");
  });

  it("returns 'connection_closed' when code is missing", () => {
    expect(formatConnectionClosedReason({ reason: "x" })).toBe("connection_closed");
  });

  it("includes the code for a normal close event", () => {
    expect(formatConnectionClosedReason({ code: 1006 })).toBe(
      "connection_closed (code 1006)",
    );
  });

  it("includes code + reason when both present", () => {
    expect(formatConnectionClosedReason({ code: 1011, reason: "server crash" })).toBe(
      "connection_closed (code 1011: server crash)",
    );
  });

  it("ignores empty-string reason", () => {
    expect(formatConnectionClosedReason({ code: 1000, reason: "" })).toBe(
      "connection_closed (code 1000)",
    );
  });
});
