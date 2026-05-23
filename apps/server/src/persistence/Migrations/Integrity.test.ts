import { describe, expect, it } from "vitest";

import {
  computeMigrationIntegrity,
  formatMigrationFailureMessage,
  MigrationFailureError,
  projectExpectedMigrations,
} from "./Integrity.ts";

describe("computeMigrationIntegrity (ORC-216)", () => {
  it("ok=true when executed matches expected", () => {
    const result = computeMigrationIntegrity({
      executed: [
        [1, "First"],
        [2, "Second"],
      ],
      expected: [
        [1, "First"],
        [2, "Second"],
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.highestApplied).toBe(2);
    expect(result.highestExpected).toBe(2);
  });

  it("ok=false and reports the missing tail when migration N+1 was not applied", () => {
    const result = computeMigrationIntegrity({
      executed: [
        [1, "First"],
        [2, "Second"],
      ],
      expected: [
        [1, "First"],
        [2, "Second"],
        [3, "Third"],
        [4, "Fourth"],
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([
      [3, "Third"],
      [4, "Fourth"],
    ]);
    expect(result.highestApplied).toBe(2);
    expect(result.highestExpected).toBe(4);
  });

  it("detects missing migrations even when ordering is interleaved", () => {
    const result = computeMigrationIntegrity({
      executed: [
        [1, "First"],
        [3, "Third"],
      ],
      expected: [
        [1, "First"],
        [2, "Second"],
        [3, "Third"],
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([[2, "Second"]]);
  });

  it("treats empty executed list as missing everything", () => {
    const result = computeMigrationIntegrity({
      executed: [],
      expected: [
        [1, "First"],
        [2, "Second"],
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.missing).toHaveLength(2);
    expect(result.highestApplied).toBe(0);
  });
});

describe("formatMigrationFailureMessage (ORC-216)", () => {
  it("includes the migration ID/name when known", () => {
    const msg = formatMigrationFailureMessage({
      attemptedId: 42,
      attemptedName: "BrokenChange",
      cause: new Error("no such column: foo"),
    });
    expect(msg).toContain("42_BrokenChange");
    expect(msg).toContain("no such column: foo");
    expect(msg).toContain("recover");
  });

  it("falls back to a generic phrasing when the migration ID/name is unknown", () => {
    const msg = formatMigrationFailureMessage({
      cause: "raw string cause",
    });
    expect(msg).toContain("migration failed");
    expect(msg).toContain("raw string cause");
  });

  it("provides recovery hints (drop DB, fix script)", () => {
    const msg = formatMigrationFailureMessage({
      attemptedId: 5,
      attemptedName: "Whatever",
      cause: new Error("syntax error"),
    });
    expect(msg).toMatch(/drop the DB/);
    expect(msg).toMatch(/fix the migration script/);
    expect(msg).toMatch(/restart the server/);
  });
});

describe("MigrationFailureError (ORC-216)", () => {
  it("is a Data.TaggedError with the right tag and fields", () => {
    const err = new MigrationFailureError({
      attemptedId: 7,
      attemptedName: "Schema",
      cause: new Error("boom"),
      message: "DB schema migration aborted",
    });
    expect(err._tag).toBe("MigrationFailureError");
    expect(err.attemptedId).toBe(7);
    expect(err.attemptedName).toBe("Schema");
    expect(err.message).toBe("DB schema migration aborted");
  });
});

describe("projectExpectedMigrations (ORC-216)", () => {
  it("strips the third payload tuple element so the integrity check can compare just id/name", () => {
    const result = projectExpectedMigrations([
      [1, "First", { stub: 1 }] as const,
      [2, "Second", { stub: 2 }] as const,
    ]);
    expect(result).toEqual([
      [1, "First"],
      [2, "Second"],
    ]);
  });
});
