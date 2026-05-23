import { afterEach, describe, expect, it, vi } from "vitest";

import {
  installCrashHandlers,
  makeUncaughtExceptionHandler,
  makeUnhandledRejectionHandler,
  type CrashHandlerDeps,
  type CrashLogger,
} from "./processHandlers.ts";

function makeLogger(): CrashLogger & { calls: Array<{ payload: unknown; message: string }> } {
  const calls: Array<{ payload: unknown; message: string }> = [];
  return {
    calls,
    error(payload, message) {
      calls.push({ payload, message });
    },
  };
}

interface SpyExit {
  readonly fn: (code: number) => void;
  readonly calls: number[];
  readonly waitForExit: () => Promise<number>;
}

function makeSpyExit(): SpyExit {
  const calls: number[] = [];
  const waiters: Array<(code: number) => void> = [];
  return {
    calls,
    fn(code) {
      calls.push(code);
      while (waiters.length > 0) waiters.shift()!(code);
    },
    waitForExit() {
      if (calls.length > 0) return Promise.resolve(calls[calls.length - 1]!);
      return new Promise((resolve) => waiters.push(resolve));
    },
  };
}

describe("processHandlers (ORC-213)", () => {
  it("makeUnhandledRejectionHandler logs the rejection and triggers shutdown + exit", async () => {
    const logger = makeLogger();
    const exit = makeSpyExit();
    const shutdown = vi.fn(async () => {});
    const handler = makeUnhandledRejectionHandler({
      logger,
      shutdown,
      exit: exit.fn,
      shutdownTimeoutMs: 100,
    });

    handler(new Error("boom"));
    const code = await exit.waitForExit();

    expect(code).toBe(1);
    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(
      logger.calls.some((c) => (c.payload as any).event === "process.unhandled-rejection"),
    ).toBe(true);
  });

  it("makeUncaughtExceptionHandler logs the error and triggers shutdown + exit", async () => {
    const logger = makeLogger();
    const exit = makeSpyExit();
    const shutdown = vi.fn(async () => {});
    const handler = makeUncaughtExceptionHandler({
      logger,
      shutdown,
      exit: exit.fn,
      shutdownTimeoutMs: 100,
    });

    handler(new Error("boom"));
    const code = await exit.waitForExit();

    expect(code).toBe(1);
    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(
      logger.calls.some((c) => (c.payload as any).event === "process.uncaught-exception"),
    ).toBe(true);
  });

  it("falls back to hard exit when shutdown exceeds shutdownTimeoutMs (ORC-213)", async () => {
    const logger = makeLogger();
    const exit = makeSpyExit();
    // shutdown that never resolves
    const shutdown = vi.fn(() => new Promise<void>(() => {}));
    const handler = makeUnhandledRejectionHandler({
      logger,
      shutdown,
      exit: exit.fn,
      shutdownTimeoutMs: 50,
    });

    handler(new Error("hung"));
    const code = await exit.waitForExit();

    expect(code).toBe(1);
    expect(logger.calls.some((c) => (c.payload as any).event === "process.shutdown-timeout")).toBe(
      true,
    );
  });

  it("logs shutdown errors and still exits", async () => {
    const logger = makeLogger();
    const exit = makeSpyExit();
    const shutdown = vi.fn(async () => {
      throw new Error("close-failed");
    });
    const handler = makeUncaughtExceptionHandler({
      logger,
      shutdown,
      exit: exit.fn,
      shutdownTimeoutMs: 100,
    });

    handler(new Error("orig"));
    const code = await exit.waitForExit();

    expect(code).toBe(1);
    expect(logger.calls.some((c) => (c.payload as any).event === "process.shutdown-failed")).toBe(
      true,
    );
  });

  it("serializes a non-Error rejection reason without crashing", async () => {
    const logger = makeLogger();
    const exit = makeSpyExit();
    const shutdown = vi.fn(async () => {});
    const handler = makeUnhandledRejectionHandler({
      logger,
      shutdown,
      exit: exit.fn,
      shutdownTimeoutMs: 50,
    });

    handler({ weird: "object", not: "an Error" });
    await exit.waitForExit();
    const reasonLog = logger.calls.find(
      (c) => (c.payload as any).event === "process.unhandled-rejection",
    );
    expect(reasonLog).toBeDefined();
    expect((reasonLog!.payload as any).reason).toBeDefined();
  });

  let cleanup: (() => void) | undefined;
  afterEach(() => {
    if (cleanup) {
      cleanup();
      cleanup = undefined;
    }
  });

  it("installCrashHandlers registers and unregisters handlers on the global process", () => {
    const baselineRejection = process.listenerCount("unhandledRejection");
    const baselineException = process.listenerCount("uncaughtException");

    const deps: CrashHandlerDeps = {
      logger: makeLogger(),
      shutdown: async () => {},
      exit: () => {},
      shutdownTimeoutMs: 50,
    };
    cleanup = installCrashHandlers(deps);

    expect(process.listenerCount("unhandledRejection")).toBe(baselineRejection + 1);
    expect(process.listenerCount("uncaughtException")).toBe(baselineException + 1);

    cleanup();
    cleanup = undefined;

    expect(process.listenerCount("unhandledRejection")).toBe(baselineRejection);
    expect(process.listenerCount("uncaughtException")).toBe(baselineException);
  });
});
