import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Scan apps/server/src/**\/*.ts for `console.<level>(` invocations outside of:
 *  - the structured logger module (logger.ts) which is the one place we
 *    fall through to the underlying console;
 *  - vitest test files (`*.test.ts`, `*.spec.ts`);
 *  - this test file itself, which contains console patterns as string
 *    literals.
 *
 * Stand-in lint rule until we wire `eslint/no-console` into oxlint with a
 * file-pattern override. Pinned by ORC-063.
 */

const SERVER_SRC = path.resolve(__dirname, "..");
const ALLOWED_FILES = new Set<string>([
  path.join(SERVER_SRC, "logger.ts"),
  path.join(SERVER_SRC, "observability", "noBareConsole.test.ts"),
]);

const CONSOLE_PATTERN = /\bconsole\.(?:log|info|warn|error|debug|trace)\s*\(/g;

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

describe("no bare console.* in apps/server/src (ORC-063)", () => {
  it("contains no console.<level>( calls outside of logger.ts and test files", () => {
    const offenders: Array<{ file: string; line: number; text: string }> = [];

    for (const file of listTsFilesRecursive(SERVER_SRC)) {
      if (ALLOWED_FILES.has(file)) continue;
      const contents = readFileSync(file, "utf8");
      const lines = contents.split("\n");
      lines.forEach((line, index) => {
        const match = CONSOLE_PATTERN.exec(line);
        CONSOLE_PATTERN.lastIndex = 0;
        if (!match) return;
        // Skip commented lines so historical references (// console.log...) survive.
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
        offenders.push({
          file: path.relative(SERVER_SRC, file),
          line: index + 1,
          text: trimmed,
        });
      });
    }

    expect(
      offenders,
      `Bare console.<level>( found. Use Effect.logInfo / logWarning / logError ` +
        `or createLogger() from logger.ts instead. Offenders:\n` +
        offenders.map((o) => `  ${o.file}:${o.line}: ${o.text}`).join("\n"),
    ).toEqual([]);
  });
});
