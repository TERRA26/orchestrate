import { describe, expect, it } from "vitest";

import {
  LIVE_CENTER_SCRIPT,
  liveCenterForSelector,
  type LiveCenterEvaluator,
} from "./clickCoordinates";

/**
 * Pins the live-center coordinate helper introduced by ORC-153.
 *
 * @see ORC-153
 */

function makeEvaluator(
  fn: (selector: string) => unknown,
): LiveCenterEvaluator {
  return {
    evaluate: async <T>(snippet: (selector: string) => T, selector: string) => {
      void snippet;
      return fn(selector) as T;
    },
  };
}

describe("liveCenterForSelector (ORC-153)", () => {
  it("returns the rect center when the snippet resolves to coordinates", async () => {
    const evaluator = makeEvaluator(() => ({ x: 42.5, y: 100 }));
    const result = await liveCenterForSelector(evaluator, "button[data-id='1']");
    expect(result).toEqual({ x: 42.5, y: 100 });
  });

  it("returns null when the snippet resolves to null (element missing)", async () => {
    const evaluator = makeEvaluator(() => null);
    expect(await liveCenterForSelector(evaluator, "button[gone]")).toBeNull();
  });

  it("returns null on empty selector", async () => {
    const evaluator = makeEvaluator(() => ({ x: 1, y: 1 }));
    expect(await liveCenterForSelector(evaluator, "")).toBeNull();
  });

  it("returns null when the evaluator throws (transient navigation, etc)", async () => {
    const evaluator: LiveCenterEvaluator = {
      evaluate: async () => {
        throw new Error("Execution context was destroyed");
      },
    };
    expect(await liveCenterForSelector(evaluator, "button")).toBeNull();
  });

  it("returns null when the result has non-numeric coordinates", async () => {
    const evaluator = makeEvaluator(() => ({ x: "left", y: "top" }));
    expect(await liveCenterForSelector(evaluator, "button")).toBeNull();
  });

  it("returns null when the result has Infinity/NaN", async () => {
    const evaluator = makeEvaluator(() => ({ x: Number.POSITIVE_INFINITY, y: 0 }));
    expect(await liveCenterForSelector(evaluator, "button")).toBeNull();
  });
});

describe("LIVE_CENTER_SCRIPT (ORC-153)", () => {
  function withFakeDOM(rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null): { x: number; y: number } | null {
    const fakeWindow = { innerWidth: 1000, innerHeight: 800 };
    const fakeElement =
      rect === null
        ? null
        : ({
            getBoundingClientRect: () => ({
              left: rect.left,
              top: rect.top,
              right: rect.left + rect.width,
              bottom: rect.top + rect.height,
              width: rect.width,
              height: rect.height,
            }),
          } as HTMLElement);
    const fakeDocument = {
      querySelector: () => fakeElement,
    };
    const previousDocument = (globalThis as { document?: unknown }).document;
    const previousWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { document?: unknown }).document = fakeDocument;
    (globalThis as { window?: unknown }).window = fakeWindow;
    try {
      return LIVE_CENTER_SCRIPT("button");
    } finally {
      (globalThis as { document?: unknown }).document = previousDocument;
      (globalThis as { window?: unknown }).window = previousWindow;
    }
  }

  it("returns the center of a fully visible rect", () => {
    expect(withFakeDOM({ left: 100, top: 50, width: 80, height: 40 })).toEqual({
      x: 140,
      y: 70,
    });
  });

  it("returns null for zero-size rects", () => {
    expect(withFakeDOM({ left: 100, top: 50, width: 0, height: 40 })).toBeNull();
    expect(withFakeDOM({ left: 100, top: 50, width: 80, height: 0 })).toBeNull();
  });

  it("returns null when missing element", () => {
    expect(withFakeDOM(null)).toBeNull();
  });

  it("returns null when the rect is fully above/left of viewport", () => {
    expect(
      withFakeDOM({ left: -500, top: -500, width: 100, height: 100 }),
    ).toBeNull();
  });

  it("returns null when the rect is fully below/right of viewport", () => {
    expect(
      withFakeDOM({ left: 1100, top: 900, width: 50, height: 50 }),
    ).toBeNull();
  });

  it("accepts a rect partially in the viewport (overlap)", () => {
    const result = withFakeDOM({ left: -10, top: -10, width: 50, height: 50 });
    expect(result).toEqual({ x: 15, y: 15 });
  });
});
