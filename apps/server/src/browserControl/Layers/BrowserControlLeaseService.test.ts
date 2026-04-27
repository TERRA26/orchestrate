import assert from "node:assert/strict";
import { it } from "@effect/vitest";
import { BrowserSessionId } from "@orchestrate/contracts";
import { Effect, Layer } from "effect";

import { BrowserControlLeaseService } from "../Services/BrowserControlLeaseService.ts";
import { BrowserControlLeaseServiceLive } from "./BrowserControlLeaseService.ts";

const layer = it.layer(BrowserControlLeaseServiceLive.pipe(Layer.provideMerge(Layer.empty)));

layer("BrowserControlLeaseService", (it) => {
  it.effect("lets human control preempt agent control", () =>
    Effect.gen(function* () {
      const service = yield* BrowserControlLeaseService;
      const browserSessionId = BrowserSessionId.makeUnsafe("browser-session-1");

      const agent = yield* service.acquire({
        browserSessionId,
        requestedBy: "agent",
        reason: "agent-action",
      });
      assert.strictEqual(agent.lease.holder, "agent");

      const human = yield* service.acquire({
        browserSessionId,
        requestedBy: "human",
        reason: "user-takeover",
      });
      assert.strictEqual(human.lease.holder, "human");

      const current = yield* service.get({ browserSessionId });
      assert.strictEqual(current?.lease.id, human.lease.id);
    }),
  );

  it.effect("blocks agent control while human holds the browser", () =>
    Effect.gen(function* () {
      const service = yield* BrowserControlLeaseService;
      const browserSessionId = BrowserSessionId.makeUnsafe("browser-session-2");

      yield* service.acquire({
        browserSessionId,
        requestedBy: "human",
        reason: "user-takeover",
      });

      const result = yield* Effect.exit(
        service.acquire({
          browserSessionId,
          requestedBy: "agent",
          reason: "agent-action",
        }),
      );
      assert.strictEqual(result._tag, "Failure");
    }),
  );

  it.effect("requires a post-release snapshot before agent control resumes", () =>
    Effect.gen(function* () {
      const service = yield* BrowserControlLeaseService;
      const browserSessionId = BrowserSessionId.makeUnsafe("browser-session-3");

      const human = yield* service.acquire({
        browserSessionId,
        requestedBy: "human",
        reason: "user-takeover",
      });

      yield* service.release({
        browserSessionId,
        leaseId: human.lease.id,
      });

      const blocked = yield* Effect.exit(
        service.acquire({
          browserSessionId,
          requestedBy: "agent",
          reason: "agent-action",
        }),
      );
      assert.strictEqual(blocked._tag, "Failure");

      yield* service.release({
        browserSessionId,
        leaseId: human.lease.id,
        snapshotAfterReleaseRef: "artifact-after-human-control",
      });

      const agent = yield* service.acquire({
        browserSessionId,
        requestedBy: "agent",
        reason: "agent-action",
      });
      assert.strictEqual(agent.lease.holder, "agent");
    }),
  );
});
