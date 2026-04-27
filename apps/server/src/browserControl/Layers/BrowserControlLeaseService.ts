import {
  HumanControlLeaseId,
  type BrowserControlAcquireInput,
  type HumanControlLease,
} from "@orchestrate/contracts";
import { Effect, Layer, Option, Ref } from "effect";
import { randomUUID } from "node:crypto";

import {
  BrowserControlLeaseHeldError,
  BrowserControlLeaseNotFoundError,
  BrowserControlLeaseService,
  type BrowserControlLeaseServiceShape,
  BrowserControlSnapshotRequiredError,
} from "../Services/BrowserControlLeaseService.ts";

type LeaseByBrowserSession = Map<string, HumanControlLease>;

function makeLease(input: BrowserControlAcquireInput, acquiredAt: string): HumanControlLease {
  return {
    id: HumanControlLeaseId.makeUnsafe(randomUUID()),
    browserSessionId: input.browserSessionId,
    holder: input.requestedBy,
    mode: "exclusive",
    acquiredAt,
    reason: input.reason,
    ...(input.lastSnapshotBeforeAcquireRef
      ? { lastSnapshotBeforeAcquireRef: input.lastSnapshotBeforeAcquireRef }
      : {}),
    requiredSnapshotAfterRelease: input.requestedBy === "human",
  };
}

function assertAgentCanAcquire(input: BrowserControlAcquireInput, current: HumanControlLease) {
  if (input.requestedBy !== "agent" || current.holder !== "human") {
    return Option.none<BrowserControlLeaseHeldError | BrowserControlSnapshotRequiredError>();
  }

  if (!current.releasedAt) {
    return Option.some(
      new BrowserControlLeaseHeldError({
        browserSessionId: input.browserSessionId,
        holder: "human",
      }),
    );
  }

  if (current.requiredSnapshotAfterRelease && !current.snapshotAfterReleaseRef) {
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

  const acquire: BrowserControlLeaseServiceShape["acquire"] = (input) =>
    Effect.gen(function* () {
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

      return { lease: result.value };
    });

  const get: BrowserControlLeaseServiceShape["get"] = (input) =>
    Ref.get(leases).pipe(
      Effect.map((current) => {
        const lease = current.get(input.browserSessionId);
        return lease ? { lease } : null;
      }),
    );

  return { acquire, release, get } satisfies BrowserControlLeaseServiceShape;
});

export const BrowserControlLeaseServiceLive = Layer.effect(
  BrowserControlLeaseService,
  makeBrowserControlLeaseService,
);
