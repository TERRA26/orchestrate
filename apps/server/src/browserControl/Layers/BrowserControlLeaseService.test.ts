import assert from "node:assert/strict";
import { it } from "@effect/vitest";
import { BrowserSessionId } from "@orchestrate/contracts";
import { Effect, Layer, Option } from "effect";

import { BrowserOrchestrationEvidenceRepositoryLive } from "../../persistence/Layers/BrowserOrchestrationEvidence.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { BrowserOrchestrationEvidenceRepository } from "../../persistence/Services/BrowserOrchestrationEvidence.ts";
import { BrowserControlLeaseService } from "../Services/BrowserControlLeaseService.ts";
import { BrowserControlLeaseServiceLive } from "./BrowserControlLeaseService.ts";

const evidenceRepositoryLayer = BrowserOrchestrationEvidenceRepositoryLive.pipe(
  Layer.provide(SqlitePersistenceMemory),
);

const layer = it.layer(
  Layer.mergeAll(
    BrowserControlLeaseServiceLive.pipe(Layer.provide(evidenceRepositoryLayer)),
    evidenceRepositoryLayer,
  ),
);

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
      assert.strictEqual(agent.lease.state, "agent-control");

      const human = yield* service.acquire({
        browserSessionId,
        requestedBy: "human",
        reason: "user-takeover",
      });
      assert.strictEqual(human.lease.holder, "human");
      assert.strictEqual(human.lease.state, "human-control");

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

  it.effect("records durable control events and clears fresh-observation requirement", () =>
    Effect.gen(function* () {
      const service = yield* BrowserControlLeaseService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;
      const browserSessionId = BrowserSessionId.makeUnsafe("browser-session-4");

      const human = yield* service.take({
        browserSessionId,
        reason: "user-takeover",
      });
      yield* service.release({
        browserSessionId,
        leaseId: human.lease.id,
      });

      const resumeBlocked = yield* Effect.exit(service.resumeAgent({ browserSessionId }));
      assert.strictEqual(resumeBlocked._tag, "Failure");

      const observed = yield* service.observeFresh({
        browserSessionId,
        observationRef: "artifact-after-human-control",
      });
      assert.strictEqual(observed.lease.snapshotAfterReleaseRef, "artifact-after-human-control");

      const controlState = yield* repository.getBrowserControlState({ browserSessionId });
      assert.ok(Option.isSome(controlState));
      assert.strictEqual(Boolean(controlState.value.freshObservationRequired), false);
      assert.strictEqual(
        controlState.value.snapshotAfterReleaseRef,
        "artifact-after-human-control",
      );

      const resumed = yield* service.resumeAgent({ browserSessionId });
      assert.strictEqual(resumed.lease?.snapshotAfterReleaseRef, "artifact-after-human-control");

      const events = yield* repository.getSessionEvents({ sessionId: browserSessionId });
      assert.ok(events.some((event) => event.type === "BrowserControlLeaseAcquired"));
      assert.ok(events.some((event) => event.type === "BrowserControlLeaseReleased"));
      assert.ok(events.some((event) => event.type === "BrowserControlFreshObservationRequired"));
      assert.ok(events.some((event) => event.type === "BrowserControlFreshObservationSatisfied"));
      assert.ok(events.some((event) => event.type === "BrowserControlAgentResumed"));
    }),
  );

  it.effect("records human input as current state and durable event", () =>
    Effect.gen(function* () {
      const service = yield* BrowserControlLeaseService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;
      const browserSessionId = BrowserSessionId.makeUnsafe("browser-session-human-input");

      const result = yield* service.humanInput({
        browserSessionId,
        kind: "mouse",
        url: "http://127.0.0.1:5173/",
        occurredAt: "2026-04-29T00:00:00.000Z",
      });

      assert.strictEqual(result.lease.holder, "human");
      assert.strictEqual(result.lease.reason, "human-input");

      const controlState = yield* repository.getBrowserControlState({ browserSessionId });
      assert.ok(Option.isSome(controlState));
      assert.strictEqual(controlState.value.holder, "human");
      assert.strictEqual(controlState.value.state, "human-control");
      assert.strictEqual(Boolean(controlState.value.freshObservationRequired), true);

      const events = yield* repository.getSessionEvents({ sessionId: browserSessionId });
      assert.ok(events.some((event) => event.type === "BrowserControlHumanInputDetected"));
      assert.ok(events.some((event) => event.type === "BrowserControlLeaseAcquired"));
    }),
  );
});
