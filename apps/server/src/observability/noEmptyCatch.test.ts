import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Stand-in lint rule banning the silent `catch {}` pattern across
 * apps/server/src. Empty catches obscure transient outages until they
 * accumulate into orphaned state. Replace them with structured warnings
 * (`logBestEffortFailure` for sync helpers, `Effect.logWarning` for
 * Effect contexts) or rethrow.
 *
 * Pinned by ORC-065.
 */

const SERVER_SRC = path.resolve(__dirname, "..");
// Files allowed to contain literal `catch {}` (this test itself contains
// the pattern as a regex / string literal).
const ALLOWED_FILES = new Set<string>([
  path.join(SERVER_SRC, "observability", "noEmptyCatch.test.ts"),
]);

// Match `catch {` followed only by whitespace and `}` on the same line, or
// `catch {` followed by an empty line and `}` on the next two non-comment
// lines. The simpler check covers all occurrences in this codebase today.
const EMPTY_CATCH_PATTERN = /\}\s*catch\s*\{\s*\}\s*$/;

function listTsFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      out.push(...listTsFilesRecursive(full));
      continue;
    }
    if (!stat.isFile()) continue;
    if (!entry.endsWith(".ts") && !entry.endsWith(".tsx")) continue;
    if (entry.endsWith(".test.ts") || entry.endsWith(".test.tsx")) continue;
    if (entry.endsWith(".spec.ts") || entry.endsWith(".spec.tsx")) continue;
    out.push(full);
  }
  return out;
}

describe("no empty catch blocks in apps/server/src (ORC-065)", () => {
  it("contains no `} catch {}` patterns outside of tests", () => {
    const offenders: Array<{ file: string; line: number; text: string }> = [];

    for (const file of listTsFilesRecursive(SERVER_SRC)) {
      if (ALLOWED_FILES.has(file)) continue;
      const contents = readFileSync(file, "utf8");
      const lines = contents.split("\n");
      lines.forEach((line, index) => {
        const trimmed = line.trimEnd();
        if (!EMPTY_CATCH_PATTERN.test(trimmed)) return;
        offenders.push({
          file: path.relative(SERVER_SRC, file),
          line: index + 1,
          text: trimmed.trim(),
        });
      });
    }

    expect(
      offenders,
      `Empty catch block(s) found. Replace with logBestEffortFailure or ` +
        `Effect.logWarning so transient failures surface in operator logs. ` +
        `Offenders:\n` +
        offenders.map((o) => `  ${o.file}:${o.line}: ${o.text}`).join("\n"),
    ).toEqual([]);
  });
});
