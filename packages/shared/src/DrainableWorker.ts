/**
 * DrainableWorker - A queue-based worker that exposes a `drain()` effect.
 *
 * Wraps the common `Queue.unbounded` + `Effect.forever` pattern and adds
 * a signal that resolves when the queue is empty **and** the current item
 * has finished processing. This lets tests replace timing-sensitive
 * `Effect.sleep` calls with deterministic `drain()`.
 *
 * @module DrainableWorker
 */
import type { Scope } from "effect";
import { Effect, TxQueue, TxRef } from "effect";

export interface DrainableWorker<A> {
  /**
   * Enqueue a work item and track it for `drain()`.
   *
   * This wraps `Queue.offer` so drain state is updated atomically with the
   * enqueue path instead of inferring it from queue internals.
   *
   * Returns void; when the queue is bounded and full the item is dropped
   * silently from the consumer's perspective. Use `options.onOverflow`
   * to observe drops.
   */
  readonly enqueue: (item: A) => Effect.Effect<void>;

  /**
   * Resolves when the queue is empty and the worker is idle (not processing).
   */
  readonly drain: Effect.Effect<void>;
}

/**
 * Default upper bound on queued items per worker. Prevents unbounded memory
 * growth from a fast producer (e.g. burst of provider events) outpacing a
 * serial consumer. Picked to be high enough that legitimate workloads never
 * notice but low enough to detect a runaway producer before OOM. [ORC-047]
 */
export const DEFAULT_MAX_QUEUE_DEPTH = 5000;

export interface MakeDrainableWorkerOptions<A> {
  /**
   * Maximum number of items the queue can hold before backpressure kicks in.
   * Defaults to {@link DEFAULT_MAX_QUEUE_DEPTH}. Set to `0` to disable the
   * limit (unbounded queue).
   *
   * When the queue is full, additional offers are dropped (the dropping
   * strategy: new items are rejected, existing items keep their place).
   */
  readonly maxQueueDepth?: number | undefined;

  /**
   * Called when an item is dropped because the queue is full. Use this to
   * emit a structured warning, increment a metric, or escalate to an error
   * channel. Errors raised here are isolated from the producer's enqueue
   * call (they fail the enqueue effect, but never block the queue).
   */
  readonly onOverflow?: ((item: A) => Effect.Effect<void>) | undefined;
}

/**
 * Create a drainable worker that processes items from an internal queue.
 *
 * The worker is forked into the current scope and will be interrupted when
 * the scope closes. A finalizer shuts down the queue.
 *
 * By default the queue is bounded to {@link DEFAULT_MAX_QUEUE_DEPTH} items
 * with a dropping strategy. Pass `{ maxQueueDepth: 0 }` to opt back into
 * an unbounded queue (not recommended for production reactors).
 *
 * @param process - The effect to run for each queued item.
 * @param options - Optional capacity and overflow handling.
 * @returns A `DrainableWorker` with `enqueue` and `drain`.
 */
export const makeDrainableWorker = <A, E, R>(
  process: (item: A) => Effect.Effect<void, E, R>,
  options?: MakeDrainableWorkerOptions<A>,
): Effect.Effect<DrainableWorker<A>, never, Scope.Scope | R> =>
  Effect.gen(function* () {
    const limit = options?.maxQueueDepth ?? DEFAULT_MAX_QUEUE_DEPTH;
    const queue =
      limit > 0
        ? yield* Effect.acquireRelease(TxQueue.dropping<A>(limit), TxQueue.shutdown)
        : yield* Effect.acquireRelease(TxQueue.unbounded<A>(), TxQueue.shutdown);
    const outstanding = yield* TxRef.make(0);

    yield* TxQueue.take(queue).pipe(
      Effect.tap((a) =>
        Effect.ensuring(
          process(a),
          TxRef.update(outstanding, (n) => n - 1),
        ),
      ),
      Effect.forever,
      Effect.forkScoped,
    );

    const drain: DrainableWorker<A>["drain"] = TxRef.get(outstanding).pipe(
      Effect.tap((n) => (n > 0 ? Effect.txRetry : Effect.void)),
      Effect.tx,
    );

    const onOverflow = options?.onOverflow;

    const enqueue = (element: A): Effect.Effect<void> =>
      TxQueue.offer(queue, element).pipe(
        Effect.tap((accepted) =>
          accepted ? TxRef.update(outstanding, (n) => n + 1) : Effect.void,
        ),
        Effect.tx,
        Effect.flatMap((accepted) =>
          accepted || !onOverflow ? Effect.void : onOverflow(element),
        ),
      );

    return { enqueue, drain } satisfies DrainableWorker<A>;
  });
