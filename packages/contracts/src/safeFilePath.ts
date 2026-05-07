/**
 * Safe-file-path validator (ORC-027).
 *
 * Worker REPORT blocks include a `filesWritten` array. Without
 * validation, a worker can emit `["foo; cat /etc/shadow"]` and an
 * orchestrator that interpolates that string into a Bash command
 * (e.g. the documented `ls -la <path>` verification) executes
 * arbitrary code. The orchestrator MUST use array-form Bash invocations
 * (handled by ORCHESTRATOR.md guidance), and the schema MUST reject
 * shell metacharacters at decode time as defense in depth.
 *
 * Rejected characters cover the canonical shell-injection set: command
 * separators (`;`, `\n`), pipes (`|`), redirects (`<`, `>`), expansion
 * (`$`, backticks, `(`, `)`, `{`, `}`), background (`&`), quoting
 * (`'`, `"`, `\\`), and the null byte. Path traversal (`..`) is allowed
 * here because the schema is for already-resolved relative repo paths;
 * a separate writeScope check (decider) enforces tree containment.
 */

import { Schema } from "effect";

const FORBIDDEN_PATH_CHARS_PATTERN =
  /[;\n\r\t|<>$`(){}&'"\\\x00]/;

export function containsShellMetacharacters(path: string): boolean {
  return FORBIDDEN_PATH_CHARS_PATTERN.test(path);
}

export function isSafeFilePath(path: string): boolean {
  if (path.length === 0) return false;
  if (path.length > 4096) return false;
  return !containsShellMetacharacters(path);
}

/**
 * Effect Schema variant: a non-empty string up to 4096 bytes that
 * contains no shell metacharacters. Use this for any field that carries
 * a worker-supplied path the orchestrator may shell out to.
 */
export const SafeFilePath = Schema.String.check(
  Schema.makeFilter<string>((value) => {
    if (value.length === 0) return "path must not be empty";
    if (value.length > 4096) return "path must be at most 4096 bytes";
    if (containsShellMetacharacters(value)) {
      return 'path must not contain shell metacharacters (`;|<>$"\'`{}()&\\\\` or null bytes/newlines/tabs)';
    }
    return undefined;
  }),
);
