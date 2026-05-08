/**
 * Helper for the empty-catch best-effort cleanup pattern. Replaces silent
 * `catch {}` blocks with a structured warn log so transient failures
 * surface in the operator log instead of accumulating into a noisy
 * end-state.
 *
 * The shape is intentionally simple: a scope, an action, and the caught
 * error. Callers stay synchronous and pass through whatever logger they
 * have. For Effect contexts use `Effect.logWarning` directly; this helper
 * is only for sync helper functions that lack a runtime.
 *
 * @see ORC-065
 * @module observability/bestEffortLog
 */

export interface BestEffortLogger {
  readonly warn: (message: string, fields?: Record<string, unknown>) => void;
}

/**
 * Coerce an unknown caught value into a small set of log fields.
 * Stringifies the error message and the error's `code` if present (Node
 * file-system errors carry codes like ENOENT / EPERM that are useful for
 * triage).
 */
export const errorToLogFields = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    const fields: Record<string, unknown> = { errorMessage: error.message };
    const maybeCode = (error as Error & { code?: unknown }).code;
    if (typeof maybeCode === "string" || typeof maybeCode === "number") {
      fields.errorCode = maybeCode;
    }
    return fields;
  }
  return { errorMessage: String(error) };
};

/**
 * Log a best-effort failure at warn level. The label combines scope and
 * action so a single grep finds every related event:
 *   "best-effort failure: codex.sidecar:write"
 */
export const logBestEffortFailure = (
  logger: BestEffortLogger,
  scope: string,
  action: string,
  error: unknown,
  extraFields: Record<string, unknown> = {},
): void => {
  logger.warn(`best-effort failure: ${scope}:${action}`, {
    scope,
    action,
    ...errorToLogFields(error),
    ...extraFields,
  });
};
