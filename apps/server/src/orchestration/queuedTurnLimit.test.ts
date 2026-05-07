import { describe, expect, it } from "vitest";

import {
  DEFAULT_MAX_QUEUED_TURNS_PER_THREAD,
  decideQueuedTurnAdmission,
} from "./queuedTurnLimit.ts";

describe("decideQueuedTurnAdmission (ORC-046)", () => {
  it("admits when current depth is well under the default limit", () => {
    expect(decideQueuedTurnAdmission({ currentDepth: 0 })).toEqual({ admitted: true });
    expect(decideQueuedTurnAdmission({ currentDepth: 50 })).toEqual({ admitted: true });
    expect(decideQueuedTurnAdmission({ currentDepth: DEFAULT_MAX_QUEUED_TURNS_PER_THREAD - 1 })).toEqual(
      { admitted: true },
    );
  });

  it("rejects when current depth equals the default limit (ORC-046 core case)", () => {
    const result = decideQueuedTurnAdmission({
      currentDepth: DEFAULT_MAX_QUEUED_TURNS_PER_THREAD,
    });
    expect(result.admitted).toBe(false);
    if (!result.admitted) {
      expect(result.reason).toContain("100/100");
      expect(result.reason).toContain("queued-turn limit reached");
    }
  });

  it("rejects when current depth exceeds the default limit", () => {
    const result = decideQueuedTurnAdmission({
      currentDepth: DEFAULT_MAX_QUEUED_TURNS_PER_THREAD + 50,
    });
    expect(result.admitted).toBe(false);
    if (!result.admitted) {
      expect(result.reason).toContain("150/100");
    }
  });

  it("respects an override limit", () => {
    expect(decideQueuedTurnAdmission({ currentDepth: 4, limit: 5 })).toEqual({ admitted: true });
    const rejected = decideQueuedTurnAdmission({ currentDepth: 5, limit: 5 });
    expect(rejected.admitted).toBe(false);
  });

  it("admits a depth of 0 even when limit is 1 (boundary)", () => {
    expect(decideQueuedTurnAdmission({ currentDepth: 0, limit: 1 })).toEqual({ admitted: true });
  });

  it("rejects a depth of 1 with limit 1", () => {
    const result = decideQueuedTurnAdmission({ currentDepth: 1, limit: 1 });
    expect(result.admitted).toBe(false);
  });
});
