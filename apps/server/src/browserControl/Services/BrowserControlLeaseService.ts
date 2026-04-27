import {
  BrowserSessionId,
  HumanControlLeaseId,
  type BrowserControlAcquireInput,
  type BrowserControlLeaseResult,
  type BrowserControlReleaseInput,
} from "@orchestrate/contracts";
import { Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

export class BrowserControlLeaseHeldError extends Schema.TaggedErrorClass<BrowserControlLeaseHeldError>()(
  "BrowserControlLeaseHeldError",
  {
    browserSessionId: BrowserSessionId,
    holder: Schema.Literals(["human", "agent"]),
  },
) {
  override get message(): string {
    return `Browser control is held by ${this.holder} for session ${this.browserSessionId}`;
  }
}

export class BrowserControlSnapshotRequiredError extends Schema.TaggedErrorClass<BrowserControlSnapshotRequiredError>()(
  "BrowserControlSnapshotRequiredError",
  {
    browserSessionId: BrowserSessionId,
    leaseId: HumanControlLeaseId,
  },
) {
  override get message(): string {
    return `Browser session ${this.browserSessionId} requires a fresh snapshot after human control lease ${this.leaseId}`;
  }
}

export class BrowserControlLeaseNotFoundError extends Schema.TaggedErrorClass<BrowserControlLeaseNotFoundError>()(
  "BrowserControlLeaseNotFoundError",
  {
    browserSessionId: BrowserSessionId,
    leaseId: HumanControlLeaseId,
  },
) {
  override get message(): string {
    return `Browser control lease ${this.leaseId} was not found for session ${this.browserSessionId}`;
  }
}

export interface BrowserControlLeaseServiceShape {
  readonly acquire: (
    input: BrowserControlAcquireInput,
  ) => Effect.Effect<
    BrowserControlLeaseResult,
    BrowserControlLeaseHeldError | BrowserControlSnapshotRequiredError
  >;
  readonly release: (
    input: BrowserControlReleaseInput,
  ) => Effect.Effect<BrowserControlLeaseResult, BrowserControlLeaseNotFoundError>;
  readonly get: (input: {
    readonly browserSessionId: BrowserSessionId;
  }) => Effect.Effect<BrowserControlLeaseResult | null>;
}

export class BrowserControlLeaseService extends ServiceMap.Service<
  BrowserControlLeaseService,
  BrowserControlLeaseServiceShape
>()("t3/browserControl/Services/BrowserControlLeaseService") {}
