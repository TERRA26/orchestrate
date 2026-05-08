import { Effect } from "effect";

/**
 * ORC-223: orphan-worker reap helper.
 *
 * Encapsulates the per-worker terminate-with-error-handling loop
 * that runs on server startup to mark non-terminal workers from
 * the previous process as `terminated`. Originally inline in
 * `wsServer.ts`; extracted so the failure-handling contract can be
 * unit-tested without standing up a full orchestration engine.
 *
 * Contract:
 *  - Iterates `orphans`, awaiting `dispatchTerminate(worker)` for
 *    each.
 *  - On per-worker failure, the cause is captured (not rethrown);
 *    `onFailure` is invoked with structured metadata so the caller
 *    can log at warn level. Iteration continues to the next worker.
 *  - Returns a summary with counts plus the failure list so the
 *    caller can surface a high-visibility error if every dispatch
 *    failed (likely systemic).
 *  - Does NOT abort startup. The caller decides whether to escalate
 *    based on the summary.
 *
 * @see ORC-223
 */

export interface OrphanWorker {
  readonly workerId: string;
  readonly threadId: string;
  readonly priorStatus: string;
}

export interface OrphanReapFailure {
  readonly workerId: string;
  readonly threadId: string;
  readonly priorStatus: string;
  readonly reason: string;
}

export interface OrphanReapSummary {
  readonly orphanCount: number;
  readonly reclaimed: number;
  readonly failures: ReadonlyArray<OrphanReapFailure>;
}

export interface OrphanReapInput<E = unknown> {
  readonly orphans: ReadonlyArray<OrphanWorker>;
  readonly dispatchTerminate: (worker: OrphanWorker) => Effect.Effect<unknown, E>;
  readonly onFailure?: (failure: OrphanReapFailure) => Effect.Effect<void>;
}

export function reapOrphanWorkers<E>(
  input: OrphanReapInput<E>,
): Effect.Effect<OrphanReapSummary, never> {
  return Effect.gen(function* () {
    let reclaimed = 0;
    const failures: OrphanReapFailure[] = [];
    for (const worker of input.orphans) {
      yield* input.dispatchTerminate(worker).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            reclaimed += 1;
          }),
        ),
        Effect.catch((cause) =>
          Effect.gen(function* () {
            const reason = cause instanceof Error ? cause.message : String(cause);
            const failure: OrphanReapFailure = {
              workerId: worker.workerId,
              threadId: worker.threadId,
              priorStatus: worker.priorStatus,
              reason,
            };
            failures.push(failure);
            if (input.onFailure) {
              yield* input.onFailure(failure);
            }
          }),
        ),
      );
    }
    return {
      orphanCount: input.orphans.length,
      reclaimed,
      failures,
    } as const;
  });
}
