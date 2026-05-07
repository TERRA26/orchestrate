import {
  WsPush,
  type WsPushChannel,
  type WsPushData,
  type WsPushEnvelopeBase,
} from "@orchestrate/contracts";
import { Deferred, Effect, Queue, Ref, Schema } from "effect";
import type { Scope } from "effect";
import type { WebSocket } from "ws";

type PushTarget =
  | { readonly kind: "all" }
  | { readonly kind: "client"; readonly client: WebSocket };

interface PushJob<C extends WsPushChannel = WsPushChannel> {
  readonly channel: C;
  readonly data: WsPushData<C>;
  readonly target: PushTarget;
  readonly delivered: Deferred.Deferred<boolean> | null;
}

export interface ServerPushBus {
  readonly publishAll: <C extends WsPushChannel>(
    channel: C,
    data: WsPushData<C>,
  ) => Effect.Effect<void>;
  readonly publishClient: <C extends WsPushChannel>(
    client: WebSocket,
    channel: C,
    data: WsPushData<C>,
  ) => Effect.Effect<boolean>;
}

export interface PushBusOverflowInfo {
  readonly channel: WsPushChannel;
  readonly target: "all" | "client";
  readonly maxQueueDepth: number;
}

export interface PushBusSlowClientInfo {
  readonly channel: WsPushChannel;
  readonly bufferedAmount: number;
  readonly maxBufferedBytesPerClient: number;
}

// ORC-045: cap the in-memory push queue. With Queue.unbounded a slow client
// would balloon the queue until the server OOMed. Queue.dropping rejects
// new offers when full, so the publisher learns immediately and the worker
// fork keeps draining. 10_000 is large enough that healthy operation never
// trips it; if it does, the structured overflow callback fires.
const DEFAULT_PUSH_QUEUE_DEPTH = 10_000;

// ORC-055: per-client backpressure threshold. Even though the bus's own
// queue is bounded (ORC-045), each individual ws.WebSocket has its own
// internal send buffer (`bufferedAmount`). If a client's network is slow
// or its TCP receive window is closed, that buffer grows per-message in
// memory until the kernel kills the process. Skip clients above this
// threshold so they cannot starve healthy clients.
const DEFAULT_MAX_BUFFERED_BYTES_PER_CLIENT = 8 * 1024 * 1024;

export const makeServerPushBus = (input: {
  readonly clients: Ref.Ref<Set<WebSocket>>;
  readonly logOutgoingPush: (push: WsPushEnvelopeBase, recipients: number) => void;
  readonly maxQueueDepth?: number;
  readonly onOverflow?: (info: PushBusOverflowInfo) => void;
  readonly maxBufferedBytesPerClient?: number;
  readonly onSlowClient?: (info: PushBusSlowClientInfo) => void;
}): Effect.Effect<ServerPushBus, never, Scope.Scope> =>
  Effect.gen(function* () {
    const nextSequence = yield* Ref.make(0);
    const maxQueueDepth = input.maxQueueDepth ?? DEFAULT_PUSH_QUEUE_DEPTH;
    const maxBufferedBytesPerClient =
      input.maxBufferedBytesPerClient ?? DEFAULT_MAX_BUFFERED_BYTES_PER_CLIENT;
    const queue = yield* Queue.dropping<PushJob>(maxQueueDepth);
    const encodePush = Schema.encodeUnknownEffect(Schema.fromJsonString(WsPush));

    const settleDelivery = (job: PushJob, delivered: boolean) =>
      job.delivered === null
        ? Effect.void
        : Deferred.succeed(job.delivered, delivered).pipe(Effect.orDie);

    const send = Effect.fnUntraced(function* (job: PushJob) {
      const sequence = yield* Ref.updateAndGet(nextSequence, (current) => current + 1);
      const push: WsPushEnvelopeBase = {
        type: "push",
        sequence,
        channel: job.channel,
        data: job.data,
      };
      const recipients =
        job.target.kind === "all" ? yield* Ref.get(input.clients) : new Set([job.target.client]);

      return yield* encodePush(push).pipe(
        Effect.map((message) => {
          let recipientCount = 0;
          for (const client of recipients) {
            if (client.readyState !== client.OPEN) {
              continue;
            }
            // ORC-055: per-client backpressure. ws.WebSocket exposes
            // bufferedAmount (bytes queued for transmission). When the
            // kernel/peer is slow this grows per-send. Skip the client
            // once it crosses the threshold so a single stuck consumer
            // cannot OOM the server by accumulating in its private
            // send buffer.
            const bufferedAmount = client.bufferedAmount ?? 0;
            if (bufferedAmount >= maxBufferedBytesPerClient) {
              if (input.onSlowClient) {
                input.onSlowClient({
                  channel: job.channel,
                  bufferedAmount,
                  maxBufferedBytesPerClient,
                });
              }
              continue;
            }
            client.send(message);
            recipientCount += 1;
          }

          input.logOutgoingPush(push, recipientCount);
          return recipientCount > 0;
        }),
      );
    });

    yield* Effect.forkScoped(
      Effect.forever(
        Queue.take(queue).pipe(
          Effect.flatMap((job) =>
            send(job).pipe(
              Effect.tap((delivered) => settleDelivery(job, delivered)),
              Effect.tapCause(() => settleDelivery(job, false)),
              Effect.ignoreCause({ log: true }),
            ),
          ),
        ),
      ),
    );

    const reportOverflow = (job: PushJob): void => {
      if (input.onOverflow) {
        input.onOverflow({
          channel: job.channel,
          target: job.target.kind === "all" ? "all" : "client",
          maxQueueDepth,
        });
      }
    };

    const offerJob = (job: PushJob): Effect.Effect<boolean> =>
      Queue.offer(queue, job).pipe(
        Effect.tap((accepted) =>
          accepted
            ? Effect.void
            : Effect.sync(() => {
                reportOverflow(job);
              }),
        ),
      );

    const publish =
      (target: PushTarget) =>
      <C extends WsPushChannel>(channel: C, data: WsPushData<C>) =>
        offerJob({
          channel,
          data,
          target,
          delivered: null,
        }).pipe(Effect.asVoid);

    return {
      publishAll: publish({ kind: "all" }),
      publishClient: (client, channel, data) =>
        Effect.gen(function* () {
          const delivered = yield* Deferred.make<boolean>();
          const job: PushJob = {
            channel,
            data,
            target: { kind: "client", client },
            delivered,
          };
          const accepted = yield* offerJob(job);
          // ORC-045: when the queue is full the offer is dropped so the
          // worker fork never picks the job up, which means the delivered
          // Deferred would never settle and the caller would hang. Settle
          // it here with false so callers learn the dispatch was dropped.
          if (!accepted) {
            yield* Deferred.succeed(delivered, false).pipe(Effect.orDie);
          }
          return yield* Deferred.await(delivered);
        }),
    } satisfies ServerPushBus;
  });
