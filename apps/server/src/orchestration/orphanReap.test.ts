import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { reapOrphanWorkers, type OrphanWorker } from "./orphanReap";

/**
 * Pins the orphan-worker reap helper from ORC-223. The previous
 * inline implementation in `wsServer.ts` swallowed every per-worker
 * dispatch failure with a bare `Effect.catch(() => Effect.void)`,
 * leaving operators with no signal when reap failed systemically
 * (locked DB, schema mismatch, projection error).
 *
 * @see ORC-223
 */

const orphan = (id: string): OrphanWorker => ({
  workerId: id,
  threadId: "thread-" + id,
  priorStatus: "running",
});

describe("reapOrphanWorkers (ORC-223)", () => {
  it("returns reclaimed=N and no failures when every dispatch succeeds", async () => {
    const summary = await Effect.runPromise(
      reapOrphanWorkers({
        orphans: [orphan("w1"), orphan("w2"), orphan("w3")],
        dispatchTerminate: () => Effect.void,
      }),
    );
    expect(summary.orphanCount).toBe(3);
    expect(summary.reclaimed).toBe(3);
    expect(summary.failures).toEqual([]);
  });

  it("captures per-worker failures and continues iterating", async () => {
    const summary = await Effect.runPromise(
      reapOrphanWorkers({
        orphans: [orphan("w1"), orphan("w2"), orphan("w3")],
        dispatchTerminate: (worker) =>
          worker.workerId === "w2"
            ? Effect.fail(new Error("simulated dispatch failure"))
            : Effect.void,
      }),
    );
    expect(summary.orphanCount).toBe(3);
    expect(summary.reclaimed).toBe(2);
    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0]?.workerId).toBe("w2");
    expect(summary.failures[0]?.reason).toContain("simulated dispatch failure");
  });

  it("reports failures.length === orphanCount when EVERY dispatch fails", async () => {
    const summary = await Effect.runPromise(
      reapOrphanWorkers({
        orphans: [orphan("a"), orphan("b")],
        dispatchTerminate: () => Effect.fail(new Error("DB locked")),
      }),
    );
    expect(summary.failures).toHaveLength(2);
    expect(summary.reclaimed).toBe(0);
    expect(summary.failures.every((f) => f.reason.includes("DB locked"))).toBe(true);
  });

  it("returns an empty summary for zero orphans without invoking dispatchTerminate", async () => {
    let calls = 0;
    const summary = await Effect.runPromise(
      reapOrphanWorkers({
        orphans: [],
        dispatchTerminate: () => {
          calls += 1;
          return Effect.void;
        },
      }),
    );
    expect(summary.orphanCount).toBe(0);
    expect(summary.reclaimed).toBe(0);
    expect(summary.failures).toEqual([]);
    expect(calls).toBe(0);
  });

  it("invokes onFailure exactly once per failed worker with structured metadata", async () => {
    const seen: Array<{ workerId: string; reason: string; threadId: string; priorStatus: string }> = [];
    await Effect.runPromise(
      reapOrphanWorkers({
        orphans: [orphan("w1"), orphan("w2")],
        dispatchTerminate: () => Effect.fail(new Error("boom")),
        onFailure: (failure) =>
          Effect.sync(() => {
            seen.push({
              workerId: failure.workerId,
              reason: failure.reason,
              threadId: failure.threadId,
              priorStatus: failure.priorStatus,
            });
          }),
      }),
    );
    expect(seen).toHaveLength(2);
    expect(seen[0]).toEqual({
      workerId: "w1",
      reason: "boom",
      threadId: "thread-w1",
      priorStatus: "running",
    });
    expect(seen[1]?.workerId).toBe("w2");
  });

  it("survives a non-Error thrown failure (string/symbol)", async () => {
    const summary = await Effect.runPromise(
      reapOrphanWorkers({
        orphans: [orphan("w1")],
        dispatchTerminate: () => Effect.fail("string-failure" as unknown as Error),
      }),
    );
    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0]?.reason).toBe("string-failure");
  });
});
