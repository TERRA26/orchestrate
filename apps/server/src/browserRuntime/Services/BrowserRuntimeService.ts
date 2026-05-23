import {
  type BrowserActInput,
  type BrowserActResult,
  type BrowserAnnotationResolveTargetAtPointInput,
  type BrowserAnnotationResolveTargetAtPointResult,
  type BrowserCloseSessionInput,
  type BrowserInspectResult,
  type BrowserInspectSessionInput,
  type BrowserObserveSessionInput,
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
  readonly observe: (
    input: BrowserObserveSessionInput,
  ) => Effect.Effect<BrowserActResult, BrowserAutomationServiceError | Error>;
  readonly inspect: (
    input: BrowserInspectSessionInput,
  ) => Effect.Effect<BrowserInspectResult, BrowserAutomationServiceError | Error>;
  readonly resolveAnnotationTargetAtPoint: (
    input: BrowserAnnotationResolveTargetAtPointInput,
  ) => Effect.Effect<
    BrowserAnnotationResolveTargetAtPointResult,
    BrowserAutomationServiceError | Error
  >;
}

export class BrowserRuntimeService extends ServiceMap.Service<
  BrowserRuntimeService,
  BrowserRuntimeServiceShape
>()("t3/browserRuntime/Services/BrowserRuntimeService") {}
