import { describe, expect, it } from "vitest";

import { settle, type SettleOps } from "./waitForSettled";

/**
 * Pins the settle-chain semantics introduced by ORC-150.
 *
 * The chain previously had no escape from networkIdle on pages with
 * persistent connections. These tests exercise the readyHint code
 * path that supersedes networkIdle when the supplied selector
 * resolves, and the fallback path when the selector times out.
 *
 * @see ORC-150
 */

interface RecordedCalls {
  readonly events: string[];
}

function makeOps(
  recorded: RecordedCalls,
  overrides: Partial<SettleOps> = {},
): SettleOps {
  return {
    domLoaded: async () => {
      recorded.events.push("domLoaded");
    },
    selectorReady: async (selector: string) => {
      recorded.events.push("selectorReady:" + selector);
    },
    networkIdle: async () => {
      recorded.events.push("networkIdle");
    },
    delay: async (ms: number) => {
      recorded.events.push("delay:" + ms);
    },
    ...overrides,
  };
}

describe("settle (ORC-150)", () => {
  it("without readyHint runs domLoaded -> networkIdle -> delay", async () => {
    const recorded: RecordedCalls = { events: [] };
    await settle(makeOps(recorded));
    expect(recorded.events).toEqual(["domLoaded", "networkIdle", "delay:350"]);
  });

  it("with a resolving readyHint skips networkIdle", async () => {
    const recorded: RecordedCalls = { events: [] };
    await settle(makeOps(recorded), { readyHint: "main[data-ready]" });
    expect(recorded.events).toEqual([
      "domLoaded",
      "selectorReady:main[data-ready]",
      "delay:350",
    ]);
  });

  it("with a rejecting readyHint falls back to networkIdle", async () => {
    const recorded: RecordedCalls = { events: [] };
    await settle(
      makeOps(recorded, {
        selectorReady: async (selector: string) => {
          recorded.events.push("selectorReady:fail:" + selector);
          throw new Error("Timeout 5000ms exceeded.");
        },
      }),
      { readyHint: "main[data-ready]" },
    );
    expect(recorded.events).toEqual([
      "domLoaded",
      "selectorReady:fail:main[data-ready]",
      "networkIdle",
      "delay:350",
    ]);
  });

  it("respects custom postActionDelayMs", async () => {
    const recorded: RecordedCalls = { events: [] };
    await settle(makeOps(recorded), { postActionDelayMs: 50 });
    expect(recorded.events).toEqual(["domLoaded", "networkIdle", "delay:50"]);
  });

  it("swallows errors from each individual op (best-effort settle)", async () => {
    const recorded: RecordedCalls = { events: [] };
    await settle(
      makeOps(recorded, {
        domLoaded: async () => {
          recorded.events.push("domLoaded:fail");
          throw new Error("dom timeout");
        },
        networkIdle: async () => {
          recorded.events.push("networkIdle:fail");
          throw new Error("idle timeout");
        },
        delay: async (ms: number) => {
          recorded.events.push("delay:fail:" + ms);
          throw new Error("delay timeout");
        },
      }),
    );
    expect(recorded.events).toEqual([
      "domLoaded:fail",
      "networkIdle:fail",
      "delay:fail:350",
    ]);
  });

  it("treats empty-string readyHint as no hint", async () => {
    const recorded: RecordedCalls = { events: [] };
    await settle(makeOps(recorded), { readyHint: "" });
    expect(recorded.events).toEqual(["domLoaded", "networkIdle", "delay:350"]);
  });
});
