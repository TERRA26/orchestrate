import { ThreadId } from "@orchestrate/contracts";
import { describe, expect, it } from "vitest";

import { buildCodexLifecycleLog } from "./codexLifecycleLog.ts";

const threadId = ThreadId.makeUnsafe("orc-064-thread");

describe("buildCodexLifecycleLog (ORC-064)", () => {
  it("starting: info level with cwd/model/runtimeMode and the session scope", () => {
    const payload = buildCodexLifecycleLog({
      kind: "starting",
      threadId,
      cwd: "/repo",
      model: "gpt-5.3-codex",
      runtimeMode: "full-access",
    });
    expect(payload.level).toBe("info");
    expect(payload.message).toBe("codex session starting");
    expect(payload.fields).toMatchObject({
      scope: "codex.session",
      event: "codex.session.starting",
      threadId,
      cwd: "/repo",
      model: "gpt-5.3-codex",
      runtimeMode: "full-access",
    });
  });

  it("starting: nulls missing optional fields", () => {
    const payload = buildCodexLifecycleLog({
      kind: "starting",
      threadId,
      cwd: undefined,
      model: undefined,
      runtimeMode: undefined,
    });
    expect(payload.fields.cwd).toBeNull();
    expect(payload.fields.model).toBeNull();
    expect(payload.fields.runtimeMode).toBeNull();
  });

  it("ready: info level with the resolved provider thread and pid", () => {
    const payload = buildCodexLifecycleLog({
      kind: "ready",
      threadId,
      cwd: "/repo",
      model: "gpt-5.3-codex",
      providerThreadId: "thr_abc",
      pid: 1234,
    });
    expect(payload.level).toBe("info");
    expect(payload.message).toBe("codex session ready");
    expect(payload.fields).toMatchObject({
      event: "codex.session.ready",
      providerThreadId: "thr_abc",
      pid: 1234,
    });
  });

  it("retry: warning level with attempt count and reason", () => {
    const payload = buildCodexLifecycleLog({
      kind: "retry",
      threadId,
      attempt: 2,
      reason: "thread/resume failed: connection reset",
    });
    expect(payload.level).toBe("warning");
    expect(payload.message).toBe("codex session retry");
    expect(payload.fields).toMatchObject({
      event: "codex.session.retry",
      attempt: 2,
      reason: "thread/resume failed: connection reset",
    });
  });

  it("closed-graceful: info level with no exit metadata", () => {
    const payload = buildCodexLifecycleLog({
      kind: "closed-graceful",
      threadId,
    });
    expect(payload.level).toBe("info");
    expect(payload.message).toBe("codex session closed");
    expect(payload.fields).toMatchObject({
      event: "codex.session.closed",
      threadId,
    });
    expect(payload.fields.code).toBeUndefined();
  });

  it("exited-unexpected: error level with code, signal, pid", () => {
    const payload = buildCodexLifecycleLog({
      kind: "exited-unexpected",
      threadId,
      code: 137,
      signal: "SIGKILL",
      pid: 7890,
    });
    expect(payload.level).toBe("error");
    expect(payload.message).toBe("codex session exited unexpectedly");
    expect(payload.fields).toMatchObject({
      event: "codex.session.exited-unexpected",
      code: 137,
      signal: "SIGKILL",
      pid: 7890,
    });
  });

  it("exited-unexpected: serializes null code/signal verbatim", () => {
    const payload = buildCodexLifecycleLog({
      kind: "exited-unexpected",
      threadId,
      code: null,
      signal: null,
      pid: undefined,
    });
    expect(payload.fields.code).toBeNull();
    expect(payload.fields.signal).toBeNull();
    expect(payload.fields.pid).toBeNull();
  });

  it("process-error: error level with sanitized error message", () => {
    const payload = buildCodexLifecycleLog({
      kind: "process-error",
      threadId,
      errorMessage: "EPIPE: broken pipe",
      pid: 4242,
    });
    expect(payload.level).toBe("error");
    expect(payload.message).toBe("codex session process error");
    expect(payload.fields).toMatchObject({
      event: "codex.session.process-error",
      errorMessage: "EPIPE: broken pipe",
      pid: 4242,
    });
  });

  it("every payload includes a distinguishing event tag for log filtering", () => {
    const events = [
      buildCodexLifecycleLog({
        kind: "starting",
        threadId,
        cwd: "/r",
        model: "m",
        runtimeMode: "full-access",
      }),
      buildCodexLifecycleLog({
        kind: "ready",
        threadId,
        cwd: "/r",
        model: "m",
        providerThreadId: "p",
        pid: 1,
      }),
      buildCodexLifecycleLog({ kind: "retry", threadId, attempt: 1, reason: "x" }),
      buildCodexLifecycleLog({ kind: "closed-graceful", threadId }),
      buildCodexLifecycleLog({
        kind: "exited-unexpected",
        threadId,
        code: 1,
        signal: null,
        pid: 1,
      }),
      buildCodexLifecycleLog({
        kind: "process-error",
        threadId,
        errorMessage: "x",
        pid: 1,
      }),
    ];
    const tags = events.map((e) => e.fields.event);
    expect(new Set(tags).size).toBe(tags.length);
    expect(tags.every((t) => typeof t === "string" && (t as string).startsWith("codex.session."))).toBe(true);
  });
});
