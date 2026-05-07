import { describe, expect, it } from "vitest";
import { Effect, Result, Schema } from "effect";

import { containsShellMetacharacters, isSafeFilePath, SafeFilePath } from "./safeFilePath";

describe("containsShellMetacharacters (ORC-027)", () => {
  it("rejects command separators", () => {
    expect(containsShellMetacharacters("foo; rm -rf /")).toBe(true);
    expect(containsShellMetacharacters("foo\nbar")).toBe(true);
    expect(containsShellMetacharacters("foo\rbar")).toBe(true);
  });

  it("rejects pipes and redirects", () => {
    expect(containsShellMetacharacters("foo | bar")).toBe(true);
    expect(containsShellMetacharacters("foo > /tmp/x")).toBe(true);
    expect(containsShellMetacharacters("foo < /etc/passwd")).toBe(true);
  });

  it("rejects expansion characters", () => {
    expect(containsShellMetacharacters("foo$(whoami)")).toBe(true);
    expect(containsShellMetacharacters("foo`whoami`")).toBe(true);
    expect(containsShellMetacharacters("$(rm)")).toBe(true);
  });

  it("rejects background and group operators", () => {
    expect(containsShellMetacharacters("foo & bar")).toBe(true);
    expect(containsShellMetacharacters("(foo)")).toBe(true);
    expect(containsShellMetacharacters("{foo}")).toBe(true);
  });

  it("rejects quoting characters and backslash", () => {
    expect(containsShellMetacharacters("foo'bar")).toBe(true);
    expect(containsShellMetacharacters('foo"bar')).toBe(true);
    expect(containsShellMetacharacters("foo\\bar")).toBe(true);
  });

  it("rejects null bytes and tabs", () => {
    expect(containsShellMetacharacters("foo\x00bar")).toBe(true);
    expect(containsShellMetacharacters("foo\tbar")).toBe(true);
  });

  it("accepts ordinary repo-relative paths", () => {
    expect(containsShellMetacharacters("apps/server/src/main.ts")).toBe(false);
    expect(containsShellMetacharacters("docs/operations.md")).toBe(false);
    expect(containsShellMetacharacters(".github/workflows/ci.yml")).toBe(false);
    expect(containsShellMetacharacters("packages/contracts/src/safeFilePath.ts")).toBe(false);
  });

  it("accepts paths with spaces (legal in repo paths)", () => {
    expect(containsShellMetacharacters("My Project/file.txt")).toBe(false);
  });

  it("accepts paths with hyphens, underscores, dots, slashes", () => {
    expect(containsShellMetacharacters("a-b_c.d/sub/file-name_v2.ts")).toBe(false);
  });
});

describe("isSafeFilePath (ORC-027)", () => {
  it("rejects empty paths", () => {
    expect(isSafeFilePath("")).toBe(false);
  });

  it("rejects extremely long paths (over 4096 bytes)", () => {
    expect(isSafeFilePath("x".repeat(4097))).toBe(false);
  });

  it("accepts borderline-length paths up to 4096", () => {
    expect(isSafeFilePath("x".repeat(4096))).toBe(true);
  });

  it("rejects paths with shell metacharacters (ORC-027 core case)", () => {
    expect(isSafeFilePath("foo; cat /etc/shadow")).toBe(false);
    expect(isSafeFilePath("$(rm -rf /)")).toBe(false);
  });

  it("accepts ordinary repo paths", () => {
    expect(isSafeFilePath("apps/server/src/main.ts")).toBe(true);
  });
});

describe("SafeFilePath schema (ORC-027)", () => {
  function decode(input: unknown) {
    return Effect.runSync(Schema.decodeUnknownEffect(SafeFilePath)(input).pipe(Effect.result));
  }

  it("decodes ordinary repo paths", () => {
    expect(Result.isSuccess(decode("apps/server/src/main.ts"))).toBe(true);
  });

  it("rejects shell-injection paths at the schema layer", () => {
    expect(Result.isFailure(decode("foo; rm -rf /"))).toBe(true);
    expect(Result.isFailure(decode("$(whoami)"))).toBe(true);
    expect(Result.isFailure(decode("foo`bar`"))).toBe(true);
    expect(Result.isFailure(decode("foo|bar"))).toBe(true);
  });

  it("rejects empty strings", () => {
    expect(Result.isFailure(decode(""))).toBe(true);
  });

  it("rejects non-string inputs", () => {
    expect(Result.isFailure(decode(42))).toBe(true);
    expect(Result.isFailure(decode(null))).toBe(true);
    expect(Result.isFailure(decode({}))).toBe(true);
  });
});
