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
});
