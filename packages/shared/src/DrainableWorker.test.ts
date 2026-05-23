import { it } from "@effect/vitest";
import { describe, expect } from "vitest";
import { Deferred, Effect, Ref } from "effect";

import { DEFAULT_MAX_QUEUE_DEPTH, makeDrainableWorker } from "./DrainableWorker";

describe("makeDrainableWorker", () => {
  it.live("waits for work enqueued during active processing before draining", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const processed: string[] = [];
        const firstStarted = yield* Deferred.make<void>();
        const releaseFirst = yield* Deferred.make<void>();
        const secondStarted = yield* Deferred.make<void>();
        const releaseSecond = yield* Deferred.make<void>();

        const worker = yield* makeDrainableWorker((item: string) =>
          Effect.gen(function* () {
            if (item === "first") {
              yield* Deferred.succeed(firstStarted, undefined).pipe(Effect.orDie);
              yield* Deferred.await(releaseFirst);
            }

            if (item === "second") {
              yield* Deferred.succeed(secondStarted, undefined).pipe(Effect.orDie);
              yield* Deferred.await(releaseSecond);
            }

            processed.push(item);
          }),
        );

        yield* worker.enqueue("first");
        yield* Deferred.await(firstStarted);

        const drained = yield* Deferred.make<void>();
        yield* Effect.forkChild(
          worker.drain.pipe(
            Effect.tap(() => Deferred.succeed(drained, undefined).pipe(Effect.orDie)),
          ),
        );

        yield* worker.enqueue("second");
        yield* Deferred.succeed(releaseFirst, undefined);
        yield* Deferred.await(secondStarted);

        expect(yield* Deferred.isDone(drained)).toBe(false);

        yield* Deferred.succeed(releaseSecond, undefined);
        yield* Deferred.await(drained);

        expect(processed).toEqual(["first", "second"]);
      }),
    ),
  );

  it.live("drops items beyond maxQueueDepth and invokes onOverflow [ORC-047]", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const processStarted = yield* Deferred.make<void>();
        const releaseProcess = yield* Deferred.make<void>();
        const overflowed = yield* Ref.make<readonly string[]>([]);

        // capacity=2 means at most 2 items can sit in the queue waiting.
        // The first item is taken immediately by the worker (which we then block),
        // so we can offer 2 more before any drops occur.
        const worker = yield* makeDrainableWorker(
          (item: string) =>
            Effect.gen(function* () {
              if (item === "first") {
                yield* Deferred.succeed(processStarted, undefined).pipe(Effect.orDie);
                yield* Deferred.await(releaseProcess);
              }
            }),
          {
            maxQueueDepth: 2,
            onOverflow: (item) => Ref.update(overflowed, (xs) => [...xs, item]),
          },
        );

        yield* worker.enqueue("first");
        yield* Deferred.await(processStarted);

        // Queue capacity = 2. Worker is busy with "first", so the queue is empty.
        yield* worker.enqueue("queued-1");
        yield* worker.enqueue("queued-2");

        // These two should overflow.
        yield* worker.enqueue("dropped-1");
        yield* worker.enqueue("dropped-2");

        const drops = yield* Ref.get(overflowed);
        expect(drops).toEqual(["dropped-1", "dropped-2"]);

        yield* Deferred.succeed(releaseProcess, undefined);
        yield* worker.drain;
      }),
    ),
  );

  it.live("does not call onOverflow when the queue has room [ORC-047]", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const overflowed = yield* Ref.make(0);

        const worker = yield* makeDrainableWorker((_item: string) => Effect.void, {
          maxQueueDepth: 4,
          onOverflow: () => Ref.update(overflowed, (n) => n + 1),
        });

        yield* worker.enqueue("a");
        yield* worker.enqueue("b");
        yield* worker.enqueue("c");
        yield* worker.drain;

        expect(yield* Ref.get(overflowed)).toBe(0);
      }),
    ),
  );

  it.live("treats maxQueueDepth=0 as unbounded [ORC-047]", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const overflowed = yield* Ref.make(0);
        const processStarted = yield* Deferred.make<void>();
        const releaseProcess = yield* Deferred.make<void>();

        const worker = yield* makeDrainableWorker(
          (item: number) =>
            Effect.gen(function* () {
              if (item === 0) {
                yield* Deferred.succeed(processStarted, undefined).pipe(Effect.orDie);
                yield* Deferred.await(releaseProcess);
              }
            }),
          {
            maxQueueDepth: 0,
            onOverflow: () => Ref.update(overflowed, (n) => n + 1),
          },
        );

        yield* worker.enqueue(0);
        yield* Deferred.await(processStarted);

        // Stuff in many more items than the default cap. Unbounded should accept all.
        for (let i = 1; i <= 50; i += 1) {
          yield* worker.enqueue(i);
        }

        expect(yield* Ref.get(overflowed)).toBe(0);

        yield* Deferred.succeed(releaseProcess, undefined);
        yield* worker.drain;
      }),
    ),
  );

  it("exposes a sane default cap that matches DEFAULT_MAX_QUEUE_DEPTH [ORC-047]", () => {
    expect(DEFAULT_MAX_QUEUE_DEPTH).toBe(5000);
  });
});
