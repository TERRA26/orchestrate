import {
  BrowserSessionId,
  HumanControlLeaseId,
  type BrowserControlAcquireInput,
  type BrowserControlHumanInputInput,
  type BrowserControlObserveFreshInput,
  type BrowserControlPauseInput,
  type BrowserControlLeaseResult,
  type BrowserControlReleaseInput,
  type BrowserControlSessionInput,
  type BrowserControlStatusResult,
  type BrowserControlTakeInput,
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
  readonly status: (input: BrowserControlSessionInput) => Effect.Effect<BrowserControlStatusResult>;
  readonly take: (
    input: BrowserControlTakeInput,
  ) => Effect.Effect<
    BrowserControlLeaseResult,
    BrowserControlLeaseHeldError | BrowserControlSnapshotRequiredError
  >;
  readonly pauseAgent: (
    input: BrowserControlPauseInput,
  ) => Effect.Effect<
    BrowserControlLeaseResult,
    BrowserControlLeaseHeldError | BrowserControlSnapshotRequiredError
  >;
  readonly resumeAgent: (
    input: BrowserControlSessionInput,
  ) => Effect.Effect<BrowserControlStatusResult, BrowserControlSnapshotRequiredError>;
  readonly observeFresh: (
    input: BrowserControlObserveFreshInput,
  ) => Effect.Effect<BrowserControlLeaseResult, BrowserControlLeaseNotFoundError>;
  readonly humanInput: (
    input: BrowserControlHumanInputInput,
  ) => Effect.Effect<
    BrowserControlLeaseResult,
    BrowserControlLeaseHeldError | BrowserControlSnapshotRequiredError
  >;
}

export class BrowserControlLeaseService extends ServiceMap.Service<
  BrowserControlLeaseService,
  BrowserControlLeaseServiceShape
>()("t3/browserControl/Services/BrowserControlLeaseService") {}
