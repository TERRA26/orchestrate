import {
  type BrowserActInput,
  type BrowserActResult,
  type BrowserCloseSessionInput,
  type BrowserOpenSessionInput,
  type BrowserOpenSessionResult,
} from "@orchestrate/contracts";
import { ServiceMap } from "effect";
import type { Effect } from "effect";

import type { BrowserAutomationServiceError } from "../../browser/Services/BrowserAutomation.ts";

export interface BrowserRuntimeServiceShape {
  readonly openSession: (
    input: BrowserOpenSessionInput,
  ) => Effect.Effect<BrowserOpenSessionResult, BrowserAutomationServiceError>;
  readonly act: (
    input: BrowserActInput,
  ) => Effect.Effect<BrowserActResult, BrowserAutomationServiceError | Error>;
  readonly closeSession: (
    input: BrowserCloseSessionInput,
  ) => Effect.Effect<void, BrowserAutomationServiceError>;
}

export class BrowserRuntimeService extends ServiceMap.Service<
  BrowserRuntimeService,
  BrowserRuntimeServiceShape
>()("t3/browserRuntime/Services/BrowserRuntimeService") {}
