import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Forbidden-list regression test for Effect 4.0-beta API drift.
 *
 * The codebase pins Effect at 4.0.0-beta.43 (and the platform/sql/vitest
 * sub-packages at the same version). Several APIs from earlier Effect
 * versions were renamed or removed during the 4.x beta cycle. This test
 * scans the source tree for the deprecated names so a future contributor
 * pasting from older docs / ChatGPT / a stale tutorial gets a fast
 * failure instead of a runtime "is not a function".
 *
 * Pinned by ORC-081. When 4.0 GA stabilizes the public surface, the
 * beta-only renames can probably stay forbidden permanently (the new
 * names are the supported ones), but the comment above each entry
 * documents *why* the name is forbidden so a future maintainer can
 * judge whether to relax the rule.
 *
 * @see ORC-081
 */

const REPO_ROOTS = [
  path.resolve(__dirname, "..", ".."),
  path.resolve(__dirname, "..", "..", "..", "..", "apps", "web", "src"),
  path.resolve(__dirname, "..", "..", "..", "..", "packages", "contracts", "src"),
  path.resolve(__dirname, "..", "..", "..", "..", "packages", "shared", "src"),
];

interface ForbiddenPattern {
  readonly name: string;
  readonly pattern: RegExp;
  readonly replacement: string;
  readonly rationale: string;
}

const FORBIDDEN_PATTERNS: ReadonlyArray<ForbiddenPattern> = [
  {
    name: "Effect.either",
    pattern: /\bEffect\.either\b/,
    replacement: "Effect.result",
    rationale:
      "Renamed to Effect.result in 4.0-beta. Returns Result<A, E> with isSuccess/isFailure narrowing.",
  },
  {
    name: "Cause.isFailType",
    pattern: /\bCause\.isFailType\b/,
    replacement: "Cause.isFailReason",
    rationale:
      "Renamed to Cause.isFailReason in 4.0-beta. Iterate via cause.reasons and filter with this guard.",
  },
  {
    name: "Cause.parallel",
    pattern: /\bCause\.parallel\b/,
    replacement: "construct via Cause.failure / squash via Cause.squash",
    rationale:
      "Removed/changed in 4.0-beta. Composite causes flow through the standard cause-pretty path naturally.",
  },
  {
    name: "Effect.cause (the old getter)",
    pattern: /\bEffect\.cause\b\s*\(/,
    replacement: "Effect.exit + Exit.isFailure narrowing",
    rationale:
      "The 4.0 API surface uses Effect.exit + Exit.isFailure for cause inspection from outside the effect.",
  },
];

function listSourceFiles(root: string): string[] {
  const out: string[] = [];
  if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) return out;

  for (const entry of readdirSync(root)) {
    const full = path.join(root, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "dist" || entry === ".turbo") continue;
      out.push(...listSourceFiles(full));
      continue;
    }
    if (!stat.isFile()) continue;
    if (!entry.endsWith(".ts") && !entry.endsWith(".tsx")) continue;
    // Allow this very test file to mention the forbidden names verbatim
    // since it documents them as strings/regex sources.
    if (full === __filename) continue;
    out.push(full);
  }
  return out;
}

describe("Effect 4.0-beta forbidden API surface (ORC-081)", () => {
  for (const forbidden of FORBIDDEN_PATTERNS) {
    it(`does not use ${forbidden.name} (use ${forbidden.replacement} instead)`, () => {
      const offenders: Array<{ file: string; line: number; text: string }> = [];

      for (const root of REPO_ROOTS) {
        for (const file of listSourceFiles(root)) {
          const contents = readFileSync(file, "utf8");
          if (!forbidden.pattern.test(contents)) continue;
          contents.split("\n").forEach((line, index) => {
            if (forbidden.pattern.test(line)) {
              offenders.push({ file, line: index + 1, text: line.trim() });
            }
          });
        }
      }

      expect(
        offenders,
        `Forbidden Effect 4.0-beta API: ${forbidden.name}\n` +
          `Reason: ${forbidden.rationale}\n` +
          `Replacement: ${forbidden.replacement}\n` +
          `Offenders:\n${offenders.map((o) => `  ${o.file}:${o.line}: ${o.text}`).join("\n")}`,
      ).toEqual([]);
    });
  }

  it("documents at least 3 forbidden patterns to anchor the regression net", () => {
    expect(FORBIDDEN_PATTERNS.length).toBeGreaterThanOrEqual(3);
    expect(FORBIDDEN_PATTERNS.every((p) => p.rationale.length > 20)).toBe(true);
  });
});
