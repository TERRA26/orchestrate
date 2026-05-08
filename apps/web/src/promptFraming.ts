/**
 * Prompt-injection framing helpers introduced by ORC-200.
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
 */

export type UntrustedContentKind =
  | "file"
  | "browser"
  | "tool-output"
  | "console";

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
    result = result.replace(pattern, (match) => {
      // Insert a zero-width joiner after the first character so the
      // pattern no longer matches but the human-readable text is
      // still recognizable.
      return match.charAt(0) + ZWJ + match.slice(1);
    });
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
