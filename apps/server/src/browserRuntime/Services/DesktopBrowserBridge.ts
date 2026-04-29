import {
  type BrowserCloseSessionInput,
  type BrowserActInput,
  type BrowserAnnotationResolveTargetAtPointInput,
  type BrowserAnnotationResolveTargetAtPointResult,
  type BrowserInspectResult,
  type BrowserInspectSessionInput,
  type BrowserObservation,
  type BrowserObserveSessionInput,
  type BrowserOpenSessionInput,
  type BrowserResolveTargetSessionInput,
  type BrowserResolveTargetSessionResult,
} from "@orchestrate/contracts";
import { ServiceMap } from "effect";
import type { Effect } from "effect";

export interface DesktopBrowserBridgeShape {
  readonly openSession: (
    input: BrowserOpenSessionInput,
  ) => Effect.Effect<BrowserObservation, Error>;
  readonly observeSession: (
    input: BrowserObserveSessionInput,
  ) => Effect.Effect<BrowserObservation, Error>;
  readonly inspectSession: (
    input: BrowserInspectSessionInput,
  ) => Effect.Effect<BrowserInspectResult, Error>;
  readonly resolveTargetSession: (
    input: BrowserResolveTargetSessionInput,
  ) => Effect.Effect<BrowserResolveTargetSessionResult, Error>;
  readonly resolveAnnotationTargetAtPoint: (
    input: BrowserAnnotationResolveTargetAtPointInput,
  ) => Effect.Effect<BrowserAnnotationResolveTargetAtPointResult, Error>;
  readonly actSession: (input: BrowserActInput) => Effect.Effect<BrowserObservation, Error>;
  readonly closeSession: (input: BrowserCloseSessionInput) => Effect.Effect<void, Error>;
  readonly getSessionOwnerClientId: (sessionId: string) => Effect.Effect<string | null>;
}

export class DesktopBrowserBridge extends ServiceMap.Service<
  DesktopBrowserBridge,
  DesktopBrowserBridgeShape
>()("t3/browserRuntime/Services/DesktopBrowserBridge") {}
