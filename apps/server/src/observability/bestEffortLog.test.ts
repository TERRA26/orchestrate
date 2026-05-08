import { describe, expect, it, vi } from "vitest";

import {
  type BestEffortLogger,
  errorToLogFields,
  logBestEffortFailure,
} from "./bestEffortLog.ts";

const makeMockLogger = (): BestEffortLogger & {
  calls: Array<{ message: string; fields: Record<string, unknown> | undefined }>;
} => {
  const calls: Array<{ message: string; fields: Record<string, unknown> | undefined }> = [];
  return {
    warn: vi.fn((message: string, fields?: Record<string, unknown>) => {
      calls.push({ message, fields });
    }),
    calls,
  };
};

describe("errorToLogFields (ORC-065)", () => {
  it("extracts the message from an Error instance", () => {
    expect(errorToLogFields(new Error("boom"))).toEqual({ errorMessage: "boom" });
  });

  it("includes a Node fs error code when present", () => {
    const err = new Error("not found") as Error & { code?: string };
    err.code = "ENOENT";
    expect(errorToLogFields(err)).toEqual({
      errorMessage: "not found",
      errorCode: "ENOENT",
    });
  });

  it("preserves numeric error codes verbatim", () => {
    const err = new Error("syscall failed") as Error & { code?: number };
    err.code = 13;
    expect(errorToLogFields(err)).toEqual({
      errorMessage: "syscall failed",
      errorCode: 13,
    });
  });

  it("falls back to String() for non-Error throws", () => {
    expect(errorToLogFields("plain string")).toEqual({ errorMessage: "plain string" });
    expect(errorToLogFields(42)).toEqual({ errorMessage: "42" });
    expect(errorToLogFields(null)).toEqual({ errorMessage: "null" });
  });
});

describe("logBestEffortFailure (ORC-065)", () => {
  it("emits a warn log with scope, action, and the error fields", () => {
    const logger = makeMockLogger();
    const err = new Error("disk full");
    logBestEffortFailure(logger, "codex.sidecar", "write", err);
    expect(logger.calls).toHaveLength(1);
    expect(logger.calls[0]?.message).toBe("best-effort failure: codex.sidecar:write");
    expect(logger.calls[0]?.fields).toEqual({
      scope: "codex.sidecar",
      action: "write",
      errorMessage: "disk full",
    });
  });

  it("merges in extra fields supplied at the callsite", () => {
    const logger = makeMockLogger();
    logBestEffortFailure(
      logger,
      "codex.sidecar",
      "remove",
      new Error("EACCES"),
      { codexPid: 1234 },
    );
    expect(logger.calls[0]?.fields).toMatchObject({
      scope: "codex.sidecar",
      action: "remove",
      codexPid: 1234,
      errorMessage: "EACCES",
    });
  });

  it("includes the error code field when present", () => {
    const logger = makeMockLogger();
    const err = new Error("denied") as Error & { code?: string };
    err.code = "EACCES";
    logBestEffortFailure(logger, "codex.sidecar", "remove", err);
    expect(logger.calls[0]?.fields).toMatchObject({
      errorMessage: "denied",
      errorCode: "EACCES",
    });
  });
});
