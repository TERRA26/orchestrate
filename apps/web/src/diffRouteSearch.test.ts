import { describe, expect, it } from "vitest";

import {
  parseDiffRouteSearch,
  parseDiffRouteSearchStrict,
} from "./diffRouteSearch";

describe("parseDiffRouteSearch", () => {
  it("parses valid diff search values", () => {
    const parsed = parseDiffRouteSearch({
      panel: "diff",
      diff: "1",
      diffTurnId: "turn-1",
      diffFilePath: "src/app.ts",
    });

    expect(parsed).toEqual({
      panel: "diff",
      diff: "1",
      diffTurnId: "turn-1",
      diffFilePath: "src/app.ts",
    });
  });

  it("treats numeric and boolean diff toggles as open", () => {
    expect(
      parseDiffRouteSearch({
        diff: 1,
        diffTurnId: "turn-1",
      }),
    ).toEqual({
      panel: "diff",
      diff: "1",
      diffTurnId: "turn-1",
    });

    expect(
      parseDiffRouteSearch({
        diff: true,
        diffTurnId: "turn-1",
      }),
    ).toEqual({
      panel: "diff",
      diff: "1",
      diffTurnId: "turn-1",
    });
  });

  it("drops turn and file values when diff is closed", () => {
    const parsed = parseDiffRouteSearch({
      diff: "0",
      diffTurnId: "turn-1",
      diffFilePath: "src/app.ts",
    });

    expect(parsed).toEqual({});
  });

  it("drops file value when turn is not selected", () => {
    const parsed = parseDiffRouteSearch({
      diff: "1",
      diffFilePath: "src/app.ts",
    });

    expect(parsed).toEqual({
      panel: "diff",
      diff: "1",
    });
  });

  it("normalizes whitespace-only values", () => {
    const parsed = parseDiffRouteSearch({
      diff: "1",
      diffTurnId: "  ",
      diffFilePath: "  ",
    });

    expect(parsed).toEqual({
      panel: "diff",
      diff: "1",
    });
  });

  it("preserves browser panel mode without diff state", () => {
    const parsed = parseDiffRouteSearch({
      panel: "browser",
      diffTurnId: "turn-1",
    });

    expect(parsed).toEqual({
      panel: "browser",
    });
  });

  it("preserves split route state while normalizing unrelated values", () => {
    const parsed = parseDiffRouteSearch({
      panel: "browser",
      diffTurnId: "turn-1",
      splitViewId: " split-1 ",
    });

    expect(parsed).toEqual({
      panel: "browser",
      splitViewId: "split-1",
    });
  });
});

describe("parseDiffRouteSearchStrict (ORC-170)", () => {
  it("returns no errors and the same value as the loose parser for valid input", () => {
    const result = parseDiffRouteSearchStrict({
      panel: "diff",
      diff: "1",
      diffTurnId: "turn-1",
      diffFilePath: "src/app.ts",
    });
    expect(result.errors).toEqual([]);
    expect(result.value).toEqual({
      panel: "diff",
      diff: "1",
      diffTurnId: "turn-1",
      diffFilePath: "src/app.ts",
    });
  });

  it("flags duplicated diffTurnId param (Array<string>) as a duplicated error", () => {
    const result = parseDiffRouteSearchStrict({
      diff: "1",
      diffTurnId: ["turn-1", "turn-2"],
    });
    expect(result.value).toEqual({ panel: "diff", diff: "1" });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.key).toBe("diffTurnId");
    expect(result.errors[0]?.reason).toBe("duplicated");
  });

  it("flags non-string diffTurnId (number, boolean) as non-string", () => {
    const numResult = parseDiffRouteSearchStrict({
      diff: "1",
      diffTurnId: 42,
    });
    expect(numResult.errors[0]?.reason).toBe("non-string");
    expect(numResult.value.diffTurnId).toBeUndefined();

    const boolResult = parseDiffRouteSearchStrict({
      diff: "1",
      diffTurnId: true,
    });
    expect(boolResult.errors[0]?.reason).toBe("non-string");
  });

  it("flags diffTurnId with invalid characters (e.g. spaces, slashes)", () => {
    const result = parseDiffRouteSearchStrict({
      diff: "1",
      diffTurnId: "../etc/passwd",
    });
    expect(result.errors[0]?.reason).toBe("invalid-shape");
    expect(result.value.diffTurnId).toBeUndefined();
  });

  it("flags 'NaN' literal as invalid-shape only if it does not match the id pattern", () => {
    // 'NaN' actually matches the id pattern [A-Za-z0-9._:-]; it would be
    // accepted as a TurnId. The defensive check is for *shape*, not
    // *meaning*. The orchestrator's read-model lookup is responsible for
    // returning empty data for the bogus id; the URL parser is not.
    const result = parseDiffRouteSearchStrict({
      diff: "1",
      diffTurnId: "NaN",
    });
    expect(result.errors).toEqual([]);
    expect(result.value.diffTurnId).toBe("NaN");
  });

  it("flags an unknown panel value with invalid-shape", () => {
    const result = parseDiffRouteSearchStrict({
      panel: "settings",
    });
    expect(result.errors[0]?.key).toBe("panel");
    expect(result.errors[0]?.reason).toBe("invalid-shape");
    expect(result.value.panel).toBeUndefined();
  });

  it("flags duplicated splitViewId param", () => {
    const result = parseDiffRouteSearchStrict({
      splitViewId: ["a", "b"],
    });
    expect(result.errors[0]?.key).toBe("splitViewId");
    expect(result.errors[0]?.reason).toBe("duplicated");
    expect(result.value.splitViewId).toBeUndefined();
  });

  it("returns no error for absent params (undefined or missing keys)", () => {
    expect(parseDiffRouteSearchStrict({}).errors).toEqual([]);
    expect(parseDiffRouteSearchStrict({ panel: undefined }).errors).toEqual([]);
  });

  it("does not validate diffTurnId when diff is closed", () => {
    // Stale URL: diff=0 + diffTurnId=garbage. Since diff gates the
    // turn id parse, the bad turn id never trips a validation error.
    const result = parseDiffRouteSearchStrict({
      diff: "0",
      diffTurnId: "../etc/passwd",
    });
    expect(result.value).toEqual({});
    expect(result.errors).toEqual([]);
  });
});
