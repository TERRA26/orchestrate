import { describe, expect, it } from "vitest";

import { logUpgradeSocketError } from "./wsServer";

interface CapturedLog {
  readonly payload: Record<string, unknown>;
  readonly message: string;
}

function makeLogger(): {
  readonly debug: (payload: Record<string, unknown>, message: string) => void;
  readonly calls: CapturedLog[];
} {
  const calls: CapturedLog[] = [];
  return {
    calls,
    debug(payload, message) {
      calls.push({ payload, message });
    },
  };
}

describe("logUpgradeSocketError (ORC-033)", () => {
  it("logs the structured event with err code, syscall, errno, and remoteAddress", () => {
    const logger = makeLogger();
    const err: NodeJS.ErrnoException = Object.assign(new Error("read ECONNRESET"), {
      code: "ECONNRESET",
      syscall: "read",
      errno: -54,
    });
    const socket = { remoteAddress: "127.0.0.1" };

    logUpgradeSocketError(logger, err, socket);

    expect(logger.calls).toHaveLength(1);
    expect(logger.calls[0]!.payload).toEqual({
      event: "wsserver.upgrade.socket-error",
      code: "ECONNRESET",
      syscall: "read",
      errno: -54,
      remoteAddress: "127.0.0.1",
    });
    expect(logger.calls[0]!.message).toBe("read ECONNRESET");
  });

  it("falls back to a default message when err.message is undefined", () => {
    const logger = makeLogger();
    const err = { name: "Error" } as NodeJS.ErrnoException;
    logUpgradeSocketError(logger, err, {});
    expect(logger.calls[0]!.message).toBe("ws upgrade socket error");
  });

  it("handles a socket without remoteAddress", () => {
    const logger = makeLogger();
    const err: NodeJS.ErrnoException = Object.assign(new Error("EPIPE"), {
      code: "EPIPE",
    });
    logUpgradeSocketError(logger, err, {});
    expect(logger.calls[0]!.payload).toMatchObject({
      event: "wsserver.upgrade.socket-error",
      code: "EPIPE",
      remoteAddress: undefined,
    });
  });
});
