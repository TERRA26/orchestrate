/**
 * Per-request trace context for the WebSocket request pipeline. Lets every
 * downstream Effect log line include the originating request id and a
 * server-minted trace id so operators can correlate "request X arrived"
 * with "push Y went out" with "engine dispatch Z failed".
 *
 * @see ORC-062
 * @module observability/traceContext
 */
import { randomUUID } from "node:crypto";

import { Effect } from "effect";

export interface TraceContext {
  /** The id the client sent on the request envelope. May be reused across retries. */
  readonly requestId: string;
  /** The JSON-RPC-ish method name from the request. */
  readonly method: string;
  /**
   * A server-minted id that is unique per arrival of a request. Even if the
   * client retries with the same requestId, each invocation has its own
   * traceId so log lines disambiguate retries.
   */
  readonly traceId: string;
}

/**
 * Build a new TraceContext for the given request. The traceId is derived
 * from the requestId plus a short random suffix to keep both compact and
 * human-readable in logs.
 */
export const buildTraceContext = (input: {
  readonly requestId: string;
  readonly method: string;
}): TraceContext => ({
  requestId: input.requestId,
  method: input.method,
  traceId: `${input.requestId}.${randomUUID().slice(0, 8)}`,
});

/**
 * Attach the trace context to an Effect so every log line emitted within
 * sees `traceId`, `requestId`, and `method` annotations. The annotation
 * lives in the Fiber's log scope, so child fibers and downstream
 * `Effect.logInfo`/`logWarning`/`logError` calls all inherit the values
 * automatically.
 */
export const withTraceContext = <A, E, R>(
  trace: TraceContext,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.annotateLogs(effect, {
    traceId: trace.traceId,
    requestId: trace.requestId,
    method: trace.method,
  });
