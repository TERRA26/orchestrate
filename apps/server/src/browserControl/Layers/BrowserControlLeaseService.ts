import {
  EvidenceArtifactId,
  HumanControlLeaseId,
  SessionEventId,
  type BrowserControlAcquireInput,
  type HumanControlLease,
} from "@orchestrate/contracts";
import { Effect, Layer, Option, Ref } from "effect";
import { randomUUID } from "node:crypto";

import { BrowserOrchestrationEvidenceRepository } from "../../persistence/Services/BrowserOrchestrationEvidence.ts";
import {
  BrowserControlLeaseHeldError,
  BrowserControlLeaseNotFoundError,
  BrowserControlLeaseService,
  type BrowserControlLeaseServiceShape,
  BrowserControlSnapshotRequiredError,
} from "../Services/BrowserControlLeaseService.ts";

type LeaseByBrowserSession = Map<string, HumanControlLease>;

function leaseFromCurrentState(row: {
  readonly browserSessionId: string;
  readonly leaseId: string | null;
  readonly holder: "human" | "agent" | "none";
  readonly state: "human-control" | "agent-control" | "paused" | "approval-required";
  readonly reason: HumanControlLease["reason"] | string;
  readonly lastObservationRef: EvidenceArtifactId | null;
  readonly snapshotAfterReleaseRef: EvidenceArtifactId | null;
  readonly freshObservationRequired: boolean | number;
  readonly updatedAt: string;
}): HumanControlLease | null {
  if (!row.leaseId) return null;
  return {
    id: HumanControlLeaseId.makeUnsafe(row.leaseId),
    browserSessionId: row.browserSessionId,
    holder: row.holder,
    mode: "exclusive",
    state: row.state,
    acquiredAt: row.updatedAt,
    reason: row.reason as HumanControlLease["reason"],
    requiredSnapshotAfterRelease: Boolean(row.freshObservationRequired),
    ...(row.snapshotAfterReleaseRef
      ? { snapshotAfterReleaseRef: row.snapshotAfterReleaseRef }
      : {}),
    ...(row.lastObservationRef ? { lastObservationRef: row.lastObservationRef } : {}),
  };
}

function stateForLease(input: BrowserControlAcquireInput): HumanControlLease["state"] {
  if (input.requestedBy === "human") return "human-control";
  if (input.reason === "approval-needed") return "approval-required";
  if (input.reason === "manual-pause") return "paused";
  return "agent-control";
}

function makeLease(input: BrowserControlAcquireInput, acquiredAt: string): HumanControlLease {
  return {
    id: HumanControlLeaseId.makeUnsafe(randomUUID()),
    browserSessionId: input.browserSessionId,
    holder: input.requestedBy,
    mode: "exclusive",
    state: stateForLease(input),
    acquiredAt,
    reason: input.reason,
    ...(input.lastSnapshotBeforeAcquireRef
      ? { lastSnapshotBeforeAcquireRef: input.lastSnapshotBeforeAcquireRef }
      : {}),
    requiredSnapshotAfterRelease: input.requestedBy === "human",
  };
}

function persistedStateForLease(
  state: HumanControlLease["state"],
): "human-control" | "agent-control" | "paused" | "approval-required" {
  return state === "human-control" ||
    state === "paused" ||
    state === "approval-required" ||
    state === "agent-control"
    ? state
    : "agent-control";
}

function readLeaseFromPayload(payloadJson: string): HumanControlLease | null {
  try {
    const payload = JSON.parse(payloadJson) as { lease?: HumanControlLease };
    return payload.lease ?? null;
  } catch {
    return null;
  }
}

function assertAgentCanAcquire(input: BrowserControlAcquireInput, current: HumanControlLease) {
  if (input.requestedBy !== "agent") {
    return Option.none<BrowserControlLeaseHeldError | BrowserControlSnapshotRequiredError>();
  }

  if (current.holder === "human" && !current.releasedAt) {
    return Option.some(
      new BrowserControlLeaseHeldError({
        browserSessionId: input.browserSessionId,
        holder: "human",
      }),
    );
  }

  if (
    (current.holder === "human" || current.holder === "none") &&
    current.requiredSnapshotAfterRelease &&
    !current.snapshotAfterReleaseRef
  ) {
    return Option.some(
      new BrowserControlSnapshotRequiredError({
        browserSessionId: input.browserSessionId,
        leaseId: current.id,
      }),
    );
  }

  return Option.none<BrowserControlLeaseHeldError | BrowserControlSnapshotRequiredError>();
}

const makeBrowserControlLeaseService = Effect.gen(function* () {
  const leases = yield* Ref.make<LeaseByBrowserSession>(new Map());
  const repository = yield* BrowserOrchestrationEvidenceRepository;

  const appendControlEvent = (input: {
    readonly browserSessionId: string;
    readonly type: string;
    readonly actor: "agent" | "human";
    readonly artifactRefs?: ReadonlyArray<EvidenceArtifactId>;
    readonly payload: unknown;
  }) =>
    repository
      .appendSessionEvent({
        eventId: SessionEventId.makeUnsafe(`browser-control-event-${randomUUID()}`),
        sessionId: input.browserSessionId,
        workflowRunId: null,
        type: input.type,
        actor: input.actor,
        artifactRefsJson: JSON.stringify(input.artifactRefs ?? []),
        payloadJson: JSON.stringify(input.payload),
        occurredAt: new Date().toISOString(),
      })
      .pipe(Effect.catch(() => Effect.void));

  const persistControlState = (lease: HumanControlLease) =>
    repository
      .upsertBrowserControlState({
        browserSessionId: lease.browserSessionId,
        sessionId: lease.browserSessionId,
        leaseId: lease.id,
        holder: lease.holder,
        state: persistedStateForLease(lease.state),
        reason: lease.reason,
        lastObservationRef: lease.lastObservationRef ?? null,
        snapshotAfterReleaseRef: lease.snapshotAfterReleaseRef ?? null,
        freshObservationRequired:
          lease.requiredSnapshotAfterRelease && !lease.snapshotAfterReleaseRef,
        desktopClientId: null,
        updatedAt: new Date().toISOString(),
      })
      .pipe(Effect.catch(() => Effect.void));

  const reconstructLease = (browserSessionId: string) =>
    repository.getBrowserControlState({ browserSessionId }).pipe(
      Effect.flatMap((row) => {
        if (Option.isSome(row)) return Effect.succeed(leaseFromCurrentState(row.value));
        return repository.getSessionEvents({ sessionId: browserSessionId }).pipe(
          Effect.map((events) => {
            for (const event of [...events].reverse()) {
              if (!event.type.startsWith("BrowserControl")) continue;
              const lease = readLeaseFromPayload(event.payloadJson);
              if (lease) return lease;
            }
            return null;
          }),
        );
      }),
      Effect.catch(() => Effect.succeed(null)),
    );

  const ensureCachedLease = (browserSessionId: string) =>
    Effect.gen(function* () {
      const current = yield* Ref.get(leases);
      if (current.has(browserSessionId)) return;
      const reconstructed = yield* reconstructLease(browserSessionId);
      if (!reconstructed) return;
      yield* Ref.update(leases, (existing) => {
        if (existing.has(browserSessionId)) return existing;
        const next = new Map(existing);
        next.set(browserSessionId, reconstructed);
        return next;
      });
    });

  const acquire: BrowserControlLeaseServiceShape["acquire"] = (input) =>
    Effect.gen(function* () {
      yield* ensureCachedLease(input.browserSessionId);
      const acquiredAt = new Date().toISOString();
      const lease = makeLease(input, acquiredAt);

      const error = yield* Ref.modify(leases, (current) => {
        const existing = current.get(input.browserSessionId);
        if (existing) {
          const acquireError = assertAgentCanAcquire(input, existing);
          if (Option.isSome(acquireError)) {
            return [acquireError, current] as const;
          }
        }

        const next = new Map(current);
        next.set(input.browserSessionId, lease);
        return [
          Option.none<BrowserControlLeaseHeldError | BrowserControlSnapshotRequiredError>(),
          next,
        ] as const;
      });

      if (Option.isSome(error)) {
        return yield* Effect.fail(error.value);
      }

      yield* appendControlEvent({
        browserSessionId: input.browserSessionId,
        type: "BrowserControlLeaseAcquired",
        actor: input.requestedBy,
        payload: { lease },
      });
      yield* persistControlState(lease);
      return { lease };
    });

  const release: BrowserControlLeaseServiceShape["release"] = (input) =>
    Effect.gen(function* () {
      const releasedAt = new Date().toISOString();
      const result = yield* Ref.modify(leases, (current) => {
        const existing = current.get(input.browserSessionId);
        if (!existing || existing.id !== input.leaseId) {
          return [Option.none<HumanControlLease>(), current] as const;
        }

        const released: HumanControlLease = {
          ...existing,
          holder: "none",
          releasedAt,
          ...(input.snapshotAfterReleaseRef
            ? { snapshotAfterReleaseRef: input.snapshotAfterReleaseRef }
            : {}),
        };
        const next = new Map(current);
        next.set(input.browserSessionId, released);
        return [Option.some(released), next] as const;
      });

      if (Option.isNone(result)) {
        return yield* Effect.fail(
          new BrowserControlLeaseNotFoundError({
            browserSessionId: input.browserSessionId,
            leaseId: input.leaseId,
          }),
        );
      }

      const releasedActor = result.value.reason === "agent-action" ? "agent" : "human";
      yield* appendControlEvent({
        browserSessionId: input.browserSessionId,
        type: "BrowserControlLeaseReleased",
        actor: releasedActor,
        artifactRefs: input.snapshotAfterReleaseRef ? [input.snapshotAfterReleaseRef] : [],
        payload: { lease: result.value },
      });
      yield* persistControlState(result.value);
      if (result.value.requiredSnapshotAfterRelease && !result.value.snapshotAfterReleaseRef) {
        yield* appendControlEvent({
          browserSessionId: input.browserSessionId,
          type: "BrowserControlFreshObservationRequired",
          actor: "human",
          payload: { lease: result.value },
        });
      }
      return { lease: result.value };
    });

  const get: BrowserControlLeaseServiceShape["get"] = (input) =>
    Effect.gen(function* () {
      yield* ensureCachedLease(input.browserSessionId);
      const current = yield* Ref.get(leases);
      const lease = current.get(input.browserSessionId);
      return lease ? { lease } : null;
    });

  const status: BrowserControlLeaseServiceShape["status"] = (input) =>
    get(input).pipe(Effect.map((result) => ({ lease: result?.lease ?? null })));

  const take: BrowserControlLeaseServiceShape["take"] = (input) =>
    acquire({
      browserSessionId: input.browserSessionId,
      requestedBy: "human",
      reason: input.reason ?? "user-takeover",
    }).pipe(
      Effect.tap((result) =>
        appendControlEvent({
          browserSessionId: input.browserSessionId,
          type: "BrowserControlHumanControlTaken",
          actor: "human",
          payload: { lease: result.lease, reason: input.reason ?? "user-takeover" },
        }),
      ),
    );

  const pauseAgent: BrowserControlLeaseServiceShape["pauseAgent"] = (input) =>
    acquire({
      browserSessionId: input.browserSessionId,
      requestedBy: "human",
      reason: input.reason ?? "manual-pause",
    }).pipe(
      Effect.tap((result) =>
        appendControlEvent({
          browserSessionId: input.browserSessionId,
          type: "BrowserControlAgentPaused",
          actor: "human",
          payload: { lease: result.lease, reason: input.reason ?? "manual-pause" },
        }),
      ),
    );

  const resumeAgent: BrowserControlLeaseServiceShape["resumeAgent"] = (input) =>
    Effect.gen(function* () {
      const current = yield* get(input);
      const lease = current?.lease ?? null;
      if (lease?.requiredSnapshotAfterRelease && !lease.snapshotAfterReleaseRef) {
        return yield* Effect.fail(
          new BrowserControlSnapshotRequiredError({
            browserSessionId: input.browserSessionId,
            leaseId: lease.id,
          }),
        );
      }

      yield* appendControlEvent({
        browserSessionId: input.browserSessionId,
        type: "BrowserControlAgentResumed",
        actor: "agent",
        payload: { lease },
      });
      if (lease) {
        yield* persistControlState({
          ...lease,
          holder: "none",
          state: "agent-control",
          requiredSnapshotAfterRelease: false,
        });
      }
      return { lease };
    });

  const observeFresh: BrowserControlLeaseServiceShape["observeFresh"] = (input) =>
    Effect.gen(function* () {
      if (!input.observationRef) {
        return yield* Effect.fail(
          new BrowserControlLeaseNotFoundError({
            browserSessionId: input.browserSessionId,
            leaseId: HumanControlLeaseId.makeUnsafe("missing-observation-ref"),
          }),
        );
      }
      const observedAt = new Date().toISOString();
      const result = yield* Ref.modify(leases, (current) => {
        const existing = current.get(input.browserSessionId);
        if (!existing) return [Option.none<HumanControlLease>(), current] as const;
        const updated: HumanControlLease = {
          ...existing,
          holder: "none",
          releasedAt: existing.releasedAt ?? observedAt,
          snapshotAfterReleaseRef: input.observationRef,
          lastObservationRef: input.observationRef,
        };
        const next = new Map(current);
        next.set(input.browserSessionId, updated);
        return [Option.some(updated), next] as const;
      });

      if (Option.isNone(result)) {
        return yield* Effect.fail(
          new BrowserControlLeaseNotFoundError({
            browserSessionId: input.browserSessionId,
            leaseId: HumanControlLeaseId.makeUnsafe("unknown"),
          }),
        );
      }

      yield* appendControlEvent({
        browserSessionId: input.browserSessionId,
        type: "BrowserControlFreshObservationSatisfied",
        actor: "agent",
        artifactRefs: [input.observationRef],
        payload: { lease: result.value, observationRef: input.observationRef },
      });
      yield* persistControlState(result.value);
      return { lease: result.value };
    });

  const humanInput: BrowserControlLeaseServiceShape["humanInput"] = (input) =>
    take({
      browserSessionId: input.browserSessionId,
      reason: "human-input",
    }).pipe(
      Effect.tap((result) =>
        appendControlEvent({
          browserSessionId: input.browserSessionId,
          type: "BrowserControlHumanInputDetected",
          actor: "human",
          payload: {
            lease: result.lease,
            kind: input.kind,
            ...(input.url ? { url: input.url } : {}),
            occurredAt: input.occurredAt,
          },
        }),
      ),
    );

  return {
    acquire,
    release,
    get,
    status,
    take,
    pauseAgent,
    resumeAgent,
    observeFresh,
    humanInput,
  } satisfies BrowserControlLeaseServiceShape;
});

export const BrowserControlLeaseServiceLive = Layer.effect(
  BrowserControlLeaseService,
  makeBrowserControlLeaseService,
);
