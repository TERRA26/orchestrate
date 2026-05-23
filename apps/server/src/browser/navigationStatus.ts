/**
 * Heuristics for "did this navigation actually succeed?" introduced
 * by ORC-151. The orchestrator captures `navigationStatus` plus the
 * page title and text summary; it can ask `looksLikeErrorPage()` for
 * a structured verdict before deciding whether to accept the screenshot
 * as evidence.
 *
 * Three failure modes the heuristic distinguishes:
 *   1. HTTP 4xx/5xx response (deterministic).
 *   2. Successful HTTP 200 that the app rendered as a custom error UI
 *      ("page not found", "something went wrong", etc).
 *   3. Successful HTTP 200 with empty / nearly-empty body (often a
 *      JS shell that crashed before hydrating).
 *
 * @see ORC-151
 */

export type NavigationVerdict =
  | { readonly kind: "ok" }
  | {
      readonly kind: "error";
      readonly reason:
        | "http-status"
        | "error-text-pattern"
        | "empty-body";
      readonly detail: string;
    };

export interface NavigationVerdictInput {
  readonly status?: number;
  readonly statusText?: string;
  readonly title?: string;
  readonly textSummary?: string;
}

const ERROR_TEXT_PATTERNS: readonly RegExp[] = [
  /\b404 not found\b/i,
  /\bpage not found\b/i,
  /\bthis page (?:could not be found|isn't available|doesn't exist)\b/i,
  /\bsomething went wrong\b/i,
  /\binternal server error\b/i,
  /\b500 internal\b/i,
  /\b403 forbidden\b/i,
  /\baccess denied\b/i,
  /\bservice unavailable\b/i,
  /\bgateway timeout\b/i,
  /\bbad gateway\b/i,
];

const EMPTY_BODY_THRESHOLD = 16;

export function looksLikeErrorPage(input: NavigationVerdictInput): NavigationVerdict {
  if (typeof input.status === "number" && input.status >= 400 && input.status <= 599) {
    const detail = input.statusText
      ? input.status + " " + input.statusText
      : String(input.status);
    return { kind: "error", reason: "http-status", detail };
  }

  const haystack = [input.title ?? "", input.textSummary ?? ""].join(" ");
  for (const pattern of ERROR_TEXT_PATTERNS) {
    const match = pattern.exec(haystack);
    if (match) {
      return {
        kind: "error",
        reason: "error-text-pattern",
        detail: match[0],
      };
    }
  }

  if (
    typeof input.status === "number" &&
    input.status >= 200 &&
    input.status < 300 &&
    typeof input.textSummary === "string" &&
    input.textSummary.trim().length < EMPTY_BODY_THRESHOLD
  ) {
    return {
      kind: "error",
      reason: "empty-body",
      detail: "text summary length " + input.textSummary.trim().length,
    };
  }

  return { kind: "ok" };
}
