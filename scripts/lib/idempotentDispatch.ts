/**
 * Idempotent dispatch helper introduced by ORC-171.
 *
 * The MCP server script's `wsRequest` accepts a method + fields and
 * relies on the caller to generate a unique `commandId` per call. A
 * naive retry on WS reconnect would generate a NEW `commandId`, and
 * the server would process the retried command as a fresh dispatch
 * (creating duplicate turns, workers, etc.) once the original
 * connection drained.
 *
 * The server already deduplicates by `commandId` via the
 * `OrchestrationCommandReceiptRepository`; the client side just needs
 * to reuse the SAME `commandId` across retries. This helper captures
 * a single generated id and threads it through every retry attempt.
 *
 * @see ORC-171
 */

import { randomUUID } from "node:crypto";

export interface IdempotentRetryOptions {
  /** Maximum number of attempts (including the initial one). Default 3. */
  readonly maxAttempts?: number;
  /** Base delay between attempts in ms. Default 250ms. */
  readonly baseDelayMs?: number;
  /**
   * Predicate selecting which errors are retryable. Default treats
   * timeouts and "Cannot connect" as retryable; other errors propagate
   * immediately.
   */
  readonly isRetryable?: (error: unknown) => boolean;
  /** Optional id factory for tests. Defaults to `crypto.randomUUID()`. */
  readonly generateId?: () => string;
  /** Optional sleep override for tests. Defaults to `setTimeout`. */
  readonly sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_RETRYABLE_PATTERNS: readonly RegExp[] = [
  /timeout/i,
  /cannot connect/i,
  /econnreset/i,
  /econnrefused/i,
  /websocket is not open/i,
  /socket hang up/i,
];

function defaultIsRetryable(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : (() => {
            try {
              return JSON.stringify(error);
            } catch {
              return "";
            }
          })();
  return DEFAULT_RETRYABLE_PATTERNS.some((pattern) => pattern.test(message));
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `operation` with a stable `commandId` reused across retry
 * attempts. The operation receives the captured id as its argument so
 * the dispatched command body can include it.
 *
 * Retries use exponential backoff (`baseDelayMs * 2^attempt`) on
 * errors matching `isRetryable`. Non-retryable errors are rethrown
 * immediately. After `maxAttempts` exhaustion, the last error
 * rethrows.
 */
export async function withStableCommandId<T>(
  operation: (commandId: string) => Promise<T>,
  options: IdempotentRetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 250;
  const isRetryable = options.isRetryable ?? defaultIsRetryable;
  const generateId = options.generateId ?? randomUUID;
  const sleep = options.sleep ?? defaultSleep;

  const commandId = generateId();
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await operation(commandId);
    } catch (error) {
      lastError = error;
      if (attempt + 1 >= maxAttempts || !isRetryable(error)) {
        throw error;
      }
      await sleep(baseDelayMs * Math.pow(2, attempt));
    }
  }
  throw lastError;
}
