/**
 * Prompt-injection framing helpers introduced by ORC-200, promoted to
 * `@orchestrate/shared/promptFraming` by ORC-208 so server-side and
 * web-side code share a single implementation.
 *
 * Untrusted content (file contents written by a worker, browser-derived
 * text, MCP tool output) reaches the orchestrator's reasoning context.
 * If a worker plants a fake `## REPORT` block or an
 * `[ORCHESTRATOR_OVERRIDE]` directive inside a written file, the LLM
 * may treat it as authoritative orchestrator-side instruction.
 *
 * `wrapUntrustedContent` solves both problems at once:
 *  1. Wraps the content in a clearly named XML-style tag so the
 *     orchestrator's system prompt can be instructed to treat the
 *     interior as data, not instructions.
 *  2. Escapes known orchestrator-control sequences inside the body so
 *     even if the orchestrator's prompt-following falters, the most
 *     dangerous patterns no longer parse as live directives.
 *
 * @see ORC-200
 * @see ORC-208
 */

export type UntrustedContentKind =
  | "file"
  | "browser"
  | "tool-output"
  | "console"
  | "diff";

export interface WrapUntrustedContentInput {
  readonly kind: UntrustedContentKind;
  readonly content: string;
  readonly metadata?: Readonly<Record<string, string | number | undefined>>;
}

const TAG_BY_KIND: Readonly<Record<UntrustedContentKind, string>> = {
  file: "untrusted_file",
  browser: "untrusted_browser",
  "tool-output": "untrusted_tool_output",
  console: "untrusted_console",
  diff: "untrusted_diff",
};

/**
 * Patterns that look like orchestrator-side directives. Replaced with
 * an inert form (zero-width-joiner inserted) before framing so a
 * naive LLM scan does not parse them as live commands.
 *
 * Tradeoff: the rewrite is visible to a human reading the framed
 * content. That is fine; the goal is to make the directive inert,
 * not to hide its prior existence from a debugger.
 */
const NEUTRALIZE_PATTERNS: readonly RegExp[] = [
  /^##\s+REPORT\b/gim,
  /\[ORCHESTRATOR_[A-Z_]+\]/g,
  /\[ORCHESTRATOR_OVERRIDE\b/gi,
  /<\/?orchestrator(?:_[a-z_]*)?\b[^>]*>/gi,
];

const ZWJ = "‍";

function escapeAttributeValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

export function neutralizeOrchestratorDirectives(content: string): string {
  let result = content;
  for (const pattern of NEUTRALIZE_PATTERNS) {
    result = result.replace(pattern, (match) => match.charAt(0) + ZWJ + match.slice(1));
  }
  return result;
}

export function wrapUntrustedContent(input: WrapUntrustedContentInput): string {
  const tag = TAG_BY_KIND[input.kind];
  const attrParts: string[] = [];
  if (input.metadata) {
    for (const [key, raw] of Object.entries(input.metadata)) {
      if (raw === undefined) continue;
      const value = typeof raw === "number" ? String(raw) : raw;
      attrParts.push(key + '="' + escapeAttributeValue(value) + '"');
    }
  }
  const attrs = attrParts.length > 0 ? " " + attrParts.join(" ") : "";
  const safeContent = neutralizeOrchestratorDirectives(input.content);
  return "<" + tag + attrs + ">\n" + safeContent + "\n</" + tag + ">";
}

/**
 * ORC-204: strip ANSI escape sequences and most control characters so
 * an error message from a shell tool (git, npm, eslint, etc.) cannot
 * smuggle terminal escape codes or directive-control characters into
 * the orchestrator's reasoning context.
 *
 * Preserves common whitespace (`\n`, `\t`, `\r`); removes everything
 * else in the C0/C1 control ranges plus the soft-hyphen and BOM.
 */
export function stripAnsiAndControlChars(text: string): string {
  // ANSI CSI / OSC / VT100 sequences. Covers the common subset:
  //   ESC [ <params> <cmd>      (CSI)
  //   ESC ] <params> ST/BEL     (OSC)
  //   ESC ( | ) | * | + <set>   (charset)
  //   ESC <single-letter>       (other escapes)
  // eslint-disable-next-line no-control-regex
  const ANSI = /\x1b(?:\[[0-9;?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[()*+][A-Za-z0-9]|[@-Z\\-_])/g;
  let out = text.replace(ANSI, "");
  // Drop all C0 control chars except \n \t \r and all C1 control chars.
  // eslint-disable-next-line no-control-regex
  out = out.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, "");
  // Drop soft hyphen and BOM which can break tokenization in some
  // model tokenizers.
  out = out.replace(/[­﻿]/g, "");
  return out;
}

/**
 * ORC-204: convenience wrapper that combines `stripAnsiAndControlChars`
 * with `wrapUntrustedContent({ kind: "tool-output" })`. Use this at
 * any boundary where shell-tool error text is echoed back to the
 * orchestrator (e.g. CheckpointReactor activity details, MCP tool
 * error returns).
 */
export function wrapToolError(input: {
  readonly text: string;
  readonly tool?: string;
  readonly cause?: string;
}): string {
  const sanitized = stripAnsiAndControlChars(input.text);
  return wrapUntrustedContent({
    kind: "tool-output",
    content: sanitized,
    metadata: {
      role: "error",
      ...(input.tool ? { tool: input.tool } : {}),
      ...(input.cause ? { cause: input.cause } : {}),
    },
  });
}
