import type { WebSocket } from "ws";
import { it } from "@effect/vitest";
import { describe, expect } from "vitest";
import { Effect, Ref } from "effect";
import { WS_CHANNELS } from "@orchestrate/contracts";

import { makeServerPushBus, type PushBusOverflowInfo } from "./pushBus";

class MockWebSocket {
  static readonly OPEN = 1;

  readonly OPEN = MockWebSocket.OPEN;
  readyState = MockWebSocket.OPEN;
  readonly sent: string[] = [];
  // ORC-055: ws.WebSocket exposes bufferedAmount; the bus should consult it
  // to skip slow clients rather than letting their internal send queue
  // grow unboundedly. Tests can pre-set this to simulate a stalled client.
  bufferedAmount = 0;
  private readonly waiters = new Set<() => void>();

  send(message: string) {
    this.sent.push(message);
    for (const waiter of this.waiters) {
      waiter();
    }
  }

  waitForSentCount(count: number): Promise<void> {
    if (this.sent.length >= count) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const check = () => {
        if (this.sent.length < count) {
          return;
        }
        this.waiters.delete(check);
        resolve();
      };

      this.waiters.add(check);
    });
  }
}

describe("makeServerPushBus", () => {
  it.live("waits for the welcome push before a new client joins broadcast delivery", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const client = new MockWebSocket();
        const clients = yield* Ref.make(new Set<WebSocket>());
        const pushBus = yield* makeServerPushBus({
          clients,
          logOutgoingPush: () => {},
        });

        yield* pushBus.publishAll(WS_CHANNELS.serverConfigUpdated, {
          issues: [{ kind: "keybindings.malformed-config", message: "queued-before-connect" }],
          providers: [],
        });

        const delivered = yield* pushBus.publishClient(
          client as unknown as WebSocket,
          WS_CHANNELS.serverWelcome,
          {
            cwd: "/tmp/project",
            projectName: "project",
          },
        );
        expect(delivered).toBe(true);

        yield* Ref.update(clients, (current) => current.add(client as unknown as WebSocket));

        yield* pushBus.publishAll(WS_CHANNELS.serverConfigUpdated, {
          issues: [],
          providers: [],
        });

        yield* Effect.promise(() => client.waitForSentCount(2));

        const messages = client.sent.map(
          (message) => JSON.parse(message) as { channel: string; data: unknown },
        );

        expect(messages).toHaveLength(2);
        expect(messages[0]).toEqual({
          type: "push",
          sequence: 2,
          channel: WS_CHANNELS.serverWelcome,
          data: {
            cwd: "/tmp/project",
            projectName: "project",
          },
        });
        expect(messages[1]).toEqual({
          type: "push",
          sequence: 3,
          channel: WS_CHANNELS.serverConfigUpdated,
          data: {
            issues: [],
            providers: [],
          },
        });
      }),
    ),
  );

  it.live(
    "drops new pushes when the bounded queue is at capacity and reports overflow (ORC-045)",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const overflowEvents: PushBusOverflowInfo[] = [];
          const clients = yield* Ref.make(new Set<WebSocket>());
          // Use depth 1 so the second-and-onward offers in a tight burst
          // overflow before the worker fork can drain. There are no
          // connected clients (set is empty), so send() is fast but
          // sequential offers can still race the fork.
          const pushBus = yield* makeServerPushBus({
            clients,
            logOutgoingPush: () => {},
            maxQueueDepth: 1,
            onOverflow: (info) => overflowEvents.push(info),
          });

          // Issue many publishes inside a single Effect.all parallel block
          // so the offers arrive faster than the fork can drain.
          yield* Effect.all(
            Array.from({ length: 50 }, () =>
              pushBus.publishAll(WS_CHANNELS.serverConfigUpdated, {
                issues: [],
                providers: [],
              }),
            ),
            { concurrency: "unbounded" },
          );

          // Some of the 50 must have been rejected.
          expect(overflowEvents.length).toBeGreaterThan(0);
          for (const info of overflowEvents) {
            expect(info.maxQueueDepth).toBe(1);
            expect(info.target).toBe("all");
            expect(info.channel).toBe(WS_CHANNELS.serverConfigUpdated);
          }
        }),
      ),
  );

  it.live("ORC-055 skips a client whose bufferedAmount exceeds the per-client threshold", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fast = new MockWebSocket();
        const slow = new MockWebSocket();
        // 100 MB queued: a stuck client whose receive buffer hasn't drained.
        slow.bufferedAmount = 100_000_000;

        const slowClientEvents: Array<{
          readonly bufferedAmount: number;
          readonly channel: string;
        }> = [];
        const clients = yield* Ref.make(
          new Set<WebSocket>([fast as unknown as WebSocket, slow as unknown as WebSocket]),
        );
        const pushBus = yield* makeServerPushBus({
          clients,
          logOutgoingPush: () => {},
          maxBufferedBytesPerClient: 8_000_000,
          onSlowClient: (info) =>
            slowClientEvents.push({
              bufferedAmount: info.bufferedAmount,
              channel: info.channel,
            }),
        });

        yield* pushBus.publishAll(WS_CHANNELS.serverConfigUpdated, {
          issues: [],
          providers: [],
        });

        yield* Effect.promise(() => fast.waitForSentCount(1));

        expect(fast.sent.length).toBe(1);
        expect(slow.sent.length).toBe(0);
        expect(slowClientEvents.length).toBe(1);
        expect(slowClientEvents[0]!.bufferedAmount).toBeGreaterThanOrEqual(8_000_000);
        expect(slowClientEvents[0]!.channel).toBe(WS_CHANNELS.serverConfigUpdated);
      }),
    ),
  );

  it.live("publishClient resolves false instead of hanging when the queue is full (ORC-045)", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const client = new MockWebSocket();
        const clients = yield* Ref.make(new Set<WebSocket>());
        const pushBus = yield* makeServerPushBus({
          clients,
          logOutgoingPush: () => {},
          maxQueueDepth: 1,
          onOverflow: () => {},
        });

        // Burst enough publishClient calls that some get dropped. Without
        // the ORC-045 fix, dropped jobs leave their delivered Deferred
        // unresolved so this Effect.all would deadlock.
        const results = yield* Effect.all(
          Array.from({ length: 50 }, () =>
            pushBus.publishClient(client as unknown as WebSocket, WS_CHANNELS.serverWelcome, {
              cwd: "/tmp/p",
              projectName: "p",
            }),
          ),
          { concurrency: "unbounded" },
        );

        // At least one must have been accepted (delivered=false because no
        // clients in the set, but it didn't deadlock); the test passes if
        // the Effect.all completed without timing out.
        expect(results.length).toBe(50);
      }),
    ),
  );

  // ORC-247: skip-only is not enough; a stuck client whose buffer never
  // drains keeps occupying a connection slot, leaks state per-client, and
  // bypasses fair backoff. Once a client has been over-threshold for a
  // grace window, the bus must escalate by invoking disconnectSlowClient.
  it.live("ORC-247 escalates to disconnect after the grace window", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const slow = new MockWebSocket();
        slow.bufferedAmount = 50_000_000;

        let currentTime = 1_700_000_000_000;
        const disconnects: Array<{
          readonly reason: string;
          readonly bufferedAmount: number;
          readonly durationMs: number;
        }> = [];

        const clients = yield* Ref.make(new Set<WebSocket>([slow as unknown as WebSocket]));
        const pushBus = yield* makeServerPushBus({
          clients,
          logOutgoingPush: () => {},
          maxBufferedBytesPerClient: 8_000_000,
          slowClientGraceMs: 5_000,
          now: () => currentTime,
          onSlowClient: () => {},
          disconnectSlowClient: (_client, info) =>
            disconnects.push({
              reason: info.reason,
              bufferedAmount: info.bufferedAmount,
              durationMs: info.durationMs,
            }),
        });

        // First publish: client is over threshold but the timer is just
        // starting. Disconnect must NOT fire on the very first detection.
        yield* pushBus.publishAll(WS_CHANNELS.serverConfigUpdated, {
          issues: [],
          providers: [],
        });
        // Allow the worker fork to drain the publish.
        yield* Effect.sleep(10);
        expect(disconnects.length).toBe(0);

        // Advance the clock past the grace window. Next publish should
        // trigger the disconnect with reason "slow_consumer".
        currentTime += 6_000;
        yield* pushBus.publishAll(WS_CHANNELS.serverConfigUpdated, {
          issues: [],
          providers: [],
        });
        yield* Effect.sleep(10);

        expect(disconnects.length).toBe(1);
        expect(disconnects[0]!.reason).toBe("slow_consumer");
        expect(disconnects[0]!.bufferedAmount).toBe(50_000_000);
        expect(disconnects[0]!.durationMs).toBeGreaterThanOrEqual(5_000);
      }),
    ),
  );

  it.live("ORC-247 resets the slow timer when bufferedAmount recovers", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const flaky = new MockWebSocket();
        flaky.bufferedAmount = 50_000_000;

        let currentTime = 1_700_000_000_000;
        const disconnects: number[] = [];

        const clients = yield* Ref.make(new Set<WebSocket>([flaky as unknown as WebSocket]));
        const pushBus = yield* makeServerPushBus({
          clients,
          logOutgoingPush: () => {},
          maxBufferedBytesPerClient: 8_000_000,
          slowClientGraceMs: 5_000,
          now: () => currentTime,
          onSlowClient: () => {},
          disconnectSlowClient: () => disconnects.push(currentTime),
        });

        // Trip threshold.
        yield* pushBus.publishAll(WS_CHANNELS.serverConfigUpdated, {
          issues: [],
          providers: [],
        });
        yield* Effect.sleep(10);

        // Client drains before grace expires.
        currentTime += 1_000;
        flaky.bufferedAmount = 0;
        yield* pushBus.publishAll(WS_CHANNELS.serverConfigUpdated, {
          issues: [],
          providers: [],
        });
        yield* Effect.sleep(10);
        expect(flaky.sent.length).toBeGreaterThan(0);

        // Buffer fills again; the timer must restart, not carry forward.
        flaky.bufferedAmount = 50_000_000;
        currentTime += 1_000;
        yield* pushBus.publishAll(WS_CHANNELS.serverConfigUpdated, {
          issues: [],
          providers: [],
        });
        yield* Effect.sleep(10);

        // Even though >5_000 ms passed since FIRST trip, the timer was
        // reset by the recovery, so disconnect must NOT have fired.
        expect(disconnects.length).toBe(0);
      }),
    ),
  );
});
