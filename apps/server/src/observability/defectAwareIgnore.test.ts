import { Effect, Logger, type LogLevel } from "effect";
import { CurrentLogAnnotations } from "effect/References";
import { describe, expect, it } from "vitest";

import { ignoreCauseDefectAware } from "./defectAwareIgnore";

/**
 * Pins the defect-aware cause logger introduced by ORC-222.
 *
 * Captures log entries through a custom Logger so the test can assert
 * which level each cause class produces.
 *
 * @see ORC-222
 */

interface CapturedLog {
  readonly level: LogLevel;
  readonly message: unknown;
  readonly annotations: Record<string, unknown>;
}

function makeCapturingLogger(captured: CapturedLog[]): Logger.Logger<unknown, void> {
  return Logger.make((options) => {
    const fiberAnnotations = options.fiber.getRef(CurrentLogAnnotations);
    captured.push({
      level: options.logLevel,
      message: options.message,
      annotations: { ...fiberAnnotations },
    });
  });
}

function runAndCapture<A>(
  effect: Effect.Effect<A, never, never>,
): { result: A; captured: CapturedLog[] } {
  const captured: CapturedLog[] = [];
  const result = Effect.runSync(
    effect.pipe(
      Effect.provide(
        Logger.layer([makeCapturingLogger(captured)], { mergeWithExisting: false }),
      ),
    ) as Effect.Effect<A, never, never>,
  );
  return { result, captured };
}

describe("ignoreCauseDefectAware (ORC-222)", () => {
  it("logs Die at error level with defect=true", () => {
    const subject = Effect.die(new Error("programmer bug")).pipe(
      ignoreCauseDefectAware({ tag: "test/die" }),
    );
    const { captured } = runAndCapture(subject);

    expect(captured.length).toBeGreaterThanOrEqual(1);
    const error = captured.find((c) => c.annotations.defect === true);
    expect(error).toBeDefined();
    expect(error?.annotations.defect).toBe(true);
    expect(error?.annotations.tag).toBe("test/die");
    // Confirm the captured log is at Error level (not Warning/Info).
    expect(error?.level).toBe("Error");
  });

  it("logs typed Fail at warn level with defect=false", () => {
    const subject = Effect.fail(new Error("typed failure")).pipe(
      ignoreCauseDefectAware({ tag: "test/fail" }),
    );
    const { captured } = runAndCapture(subject);

    const warn = captured.find((c) => c.annotations.defect === false);
    expect(warn).toBeDefined();
    expect(warn?.annotations.tag).toBe("test/fail");
  });

  it("propagates supplied metadata into log annotations", () => {
    const subject = Effect.die(new Error("x")).pipe(
      ignoreCauseDefectAware({
        tag: "test/meta",
        metadata: { workerId: "w-1", iteration: 3 },
      }),
    );
    const { captured } = runAndCapture(subject);
    const error = captured.find((c) => c.annotations.defect === true);
    expect(error?.annotations.workerId).toBe("w-1");
    expect(error?.annotations.iteration).toBe(3);
  });

  it("includes Cause.pretty in annotations for both Die and Fail", () => {
    const die = runAndCapture(
      Effect.die(new Error("die-msg")).pipe(ignoreCauseDefectAware({ tag: "die" })),
    );
    const fail = runAndCapture(
      Effect.fail(new Error("fail-msg")).pipe(ignoreCauseDefectAware({ tag: "fail" })),
    );

    const dieEntry = die.captured.find((c) => c.annotations.defect === true);
    const failEntry = fail.captured.find((c) => c.annotations.defect === false);
    expect(String(dieEntry?.annotations.cause)).toContain("die-msg");
    expect(String(failEntry?.annotations.cause)).toContain("fail-msg");
  });

  it("returns void successfully even when the inner effect dies", () => {
    const subject = Effect.die(new Error("boom")).pipe(
      ignoreCauseDefectAware({ tag: "test/return" }),
    );
    const { result } = runAndCapture(subject);
    expect(result).toBeUndefined();
  });

  it("returns void successfully when the inner effect succeeds (no log noise)", () => {
    const subject = Effect.succeed(42).pipe(
      ignoreCauseDefectAware({ tag: "test/success" }),
    );
    const { result, captured } = runAndCapture(subject);
    expect(result).toBeUndefined();
    expect(captured).toEqual([]);
  });

  it("does not double-fire the logger for a single Die cause", () => {
    const subject = Effect.die(new Error("once")).pipe(
      ignoreCauseDefectAware({ tag: "once" }),
    );
    const { captured } = runAndCapture(subject);
    expect(captured.filter((c) => c.annotations.defect === true)).toHaveLength(1);
  });

  it("classifies a thrown non-Error string as Die (not Fail)", () => {
    const subject = Effect.sync(() => {
      throw "string-thrown-as-defect";
    }).pipe(ignoreCauseDefectAware({ tag: "die-string" }));
    const { captured } = runAndCapture(
      subject as Effect.Effect<void, never, never>,
    );
    const error = captured.find((c) => c.annotations.defect === true);
    expect(error).toBeDefined();
  });
});
