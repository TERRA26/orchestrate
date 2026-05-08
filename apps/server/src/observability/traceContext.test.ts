import { Effect, Logger } from "effect";
import { CurrentLogAnnotations } from "effect/References";
import { describe, expect, it } from "vitest";

import { buildTraceContext, withTraceContext } from "./traceContext.ts";

describe("buildTraceContext (ORC-062)", () => {
  it("returns the supplied requestId and method verbatim", () => {
    const trace = buildTraceContext({ requestId: "req-42", method: "ping" });
    expect(trace.requestId).toBe("req-42");
    expect(trace.method).toBe("ping");
  });

  it("derives a traceId that begins with the requestId and a dot separator", () => {
    const trace = buildTraceContext({ requestId: "req-42", method: "ping" });
    expect(trace.traceId).toMatch(/^req-42\.[0-9a-f]{8}$/);
  });

  it("produces a fresh traceId on every call (no retry collision)", () => {
    const a = buildTraceContext({ requestId: "req-42", method: "ping" });
    const b = buildTraceContext({ requestId: "req-42", method: "ping" });
    expect(a.traceId).not.toBe(b.traceId);
  });
});

describe("withTraceContext (ORC-062)", () => {
  const captureLogger = (
    captured: Array<{ message: unknown; annotations: Record<string, unknown> }>,
  ) =>
    Logger.make((options) => {
      const fiberAnnotations = options.fiber.getRef(CurrentLogAnnotations);
      captured.push({ message: options.message, annotations: { ...fiberAnnotations } });
    });

  it("annotates a downstream Effect.logInfo with traceId, requestId, method", async () => {
    const captured: Array<{ message: unknown; annotations: Record<string, unknown> }> = [];
    const trace = {
      requestId: "req-1",
      method: "method.thread.start",
      traceId: "req-1.aaaaaaaa",
    };

    await Effect.runPromise(
      withTraceContext(trace, Effect.logInfo("inside-handler")).pipe(
        Effect.provide(Logger.layer([captureLogger(captured)], { mergeWithExisting: false })),
      ),
    );

    expect(captured).toHaveLength(1);
    expect(captured[0]?.annotations).toMatchObject({
      traceId: "req-1.aaaaaaaa",
      requestId: "req-1",
      method: "method.thread.start",
    });
  });

  it("propagates annotations through nested gen effects", async () => {
    const captured: Array<{ message: unknown; annotations: Record<string, unknown> }> = [];
    const trace = {
      requestId: "req-2",
      method: "method.git.status",
      traceId: "req-2.bbbbbbbb",
    };

    await Effect.runPromise(
      withTraceContext(
        trace,
        Effect.gen(function* () {
          yield* Effect.logInfo("outer");
          yield* Effect.gen(function* () {
            yield* Effect.logInfo("inner");
          });
        }),
      ).pipe(Effect.provide(Logger.layer([captureLogger(captured)], { mergeWithExisting: false }))),
    );

    const messages = captured.map((c) =>
      Array.isArray(c.message) ? c.message[0] : c.message,
    );
    expect(messages).toEqual(["outer", "inner"]);
    expect(captured.every((c) => c.annotations.traceId === "req-2.bbbbbbbb")).toBe(true);
    expect(captured.every((c) => c.annotations.requestId === "req-2")).toBe(true);
  });

  it("does not leak annotations outside the wrapped effect", async () => {
    const captured: Array<{ message: unknown; annotations: Record<string, unknown> }> = [];
    const trace = {
      requestId: "req-3",
      method: "ping",
      traceId: "req-3.cccccccc",
    };

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* withTraceContext(trace, Effect.logInfo("inside"));
        yield* Effect.logInfo("outside");
      }).pipe(Effect.provide(Logger.layer([captureLogger(captured)], { mergeWithExisting: false }))),
    );

    expect(captured).toHaveLength(2);
    expect(captured[0]?.annotations.traceId).toBe("req-3.cccccccc");
    expect(captured[1]?.annotations.traceId).toBeUndefined();
  });
});
