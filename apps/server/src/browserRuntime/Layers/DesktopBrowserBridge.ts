import { randomUUID } from "node:crypto";

import {
  type BrowserCloseSessionInput,
  type BrowserActInput,
  BrowserAnnotationResolveTargetAtPointResult,
  type BrowserAnnotationResolveTargetAtPointInput,
  BrowserInspectResult,
  type BrowserInspectSessionInput,
  BrowserObservation,
  type BrowserObserveSessionInput,
  type BrowserOpenSessionInput,
  BrowserResolveTargetSessionResult,
  type BrowserResolveTargetSessionInput,
  type DesktopBrowserBridgeRequestPayload,
  type DesktopBrowserBridgeResponseInput,
  WS_CHANNELS,
} from "@orchestrate/contracts";
import { Effect, Layer, Schema } from "effect";

import {
  DesktopBrowserBridge,
  type DesktopBrowserBridgeShape,
} from "../Services/DesktopBrowserBridge.ts";

const unavailable = () =>
  Effect.fail(
    new Error(
      "Electron visible browser runtime bridge is unavailable; refusing headless fallback.",
    ),
  );

export const DesktopBrowserBridgeUnavailableLive = Layer.succeed(DesktopBrowserBridge, {
  openSession: unavailable,
  observeSession: unavailable,
  inspectSession: unavailable,
  resolveTargetSession: unavailable,
  resolveAnnotationTargetAtPoint: unavailable,
  closeSession: unavailable,
  actSession: unavailable,
  getSessionOwnerClientId: () => Effect.succeed(null),
} satisfies DesktopBrowserBridgeShape);

type PublishDesktopBrowserBridgeRequest = (
  clientId: string,
  channel: typeof WS_CHANNELS.desktopBrowserBridgeRequest,
  data: DesktopBrowserBridgeRequestPayload,
) => Effect.Effect<boolean>;

type PendingRequest = {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
  readonly clientId: string;
  readonly kind: DesktopBrowserBridgeRequestPayload["kind"];
};

let publishDesktopBrowserBridgeRequest: PublishDesktopBrowserBridgeRequest | null = null;
const pendingRequests = new Map<string, PendingRequest>();
const desktopBridgeClientIds = new Set<string>();
const sessionOwnerClientIds = new Map<string, string>();
const decodeBrowserObservation = Schema.decodeUnknownEffect(BrowserObservation);
const decodeBrowserInspectResult = Schema.decodeUnknownEffect(BrowserInspectResult);
const decodeBrowserResolveTargetResult = Schema.decodeUnknownEffect(
  BrowserResolveTargetSessionResult,
);
const decodeBrowserResolveAnnotationTargetAtPointResult = Schema.decodeUnknownEffect(
  BrowserAnnotationResolveTargetAtPointResult,
);

const DEFAULT_TIMEOUT_MS = 30_000;

function bridgeError(message: string, code = "desktop-bridge-unavailable") {
  const error = new Error(message);
  error.name = code;
  return error;
}

function bridgeErrorWithDetails(
  message: string,
  code = "desktop-bridge-unavailable",
  details?: unknown,
) {
  const error = bridgeError(message, code);
  if (details !== undefined) Object.assign(error, { details });
  return error;
}

function requestDesktopBrowserBridge(
  kind: DesktopBrowserBridgeRequestPayload["kind"],
  input:
    | BrowserOpenSessionInput
    | BrowserObserveSessionInput
    | BrowserInspectSessionInput
    | BrowserResolveTargetSessionInput
    | BrowserAnnotationResolveTargetAtPointInput
    | BrowserActInput
    | BrowserCloseSessionInput,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Effect.Effect<unknown, Error> {
  return Effect.tryPromise({
    try: () =>
      new Promise<unknown>((resolve, reject) => {
        const publish = publishDesktopBrowserBridgeRequest;
        if (!publish) {
          reject(
            bridgeError(
              "Electron visible browser runtime bridge is unavailable; refusing headless fallback.",
            ),
          );
          return;
        }
        const sessionId = "sessionId" in input ? String(input.sessionId) : null;
        const ownerClientId = sessionId ? sessionOwnerClientIds.get(sessionId) : null;
        const clientId = ownerClientId ?? [...desktopBridgeClientIds][0];
        if (!clientId) {
          reject(
            bridgeError(
              "Electron visible browser runtime bridge has no connected desktop-capable client.",
            ),
          );
          return;
        }

        const requestId = `desktop-browser-${randomUUID()}`;
        const timeout = setTimeout(() => {
          pendingRequests.delete(requestId);
          reject(
            bridgeError(
              `Electron visible browser runtime bridge timed out waiting for ${kind}.`,
              "desktop-bridge-timeout",
            ),
          );
        }, timeoutMs);

        pendingRequests.set(requestId, { resolve, reject, timeout, clientId, kind });
        Effect.runPromise(
          publish(clientId, WS_CHANNELS.desktopBrowserBridgeRequest, {
            requestId,
            kind,
            input,
            timeoutMs,
          }),
        )
          .then((delivered) => {
            if (delivered) return;
            clearTimeout(timeout);
            pendingRequests.delete(requestId);
            reject(
              bridgeError(
                `Electron visible browser runtime bridge client is unavailable: ${clientId}`,
                "desktop-bridge-client-unavailable",
              ),
            );
          })
          .catch((cause) => {
            clearTimeout(timeout);
            pendingRequests.delete(requestId);
            reject(
              bridgeError(
                `Electron visible browser runtime bridge request could not be delivered: ${cause instanceof Error ? cause.message : String(cause)}`,
                "desktop-bridge-delivery-failed",
              ),
            );
          });
      }),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

function decodeObservationResult(value: unknown): Effect.Effect<BrowserObservation, Error> {
  return decodeBrowserObservation(value).pipe(
    Effect.mapError(
      (cause) =>
        bridgeError(
          `Electron visible browser runtime bridge returned an invalid observation: ${cause}`,
          "desktop-bridge-invalid-observation",
        ) as Error,
    ),
  );
}

function decodeInspectResult(value: unknown): Effect.Effect<BrowserInspectResult, Error> {
  return decodeBrowserInspectResult(value).pipe(
    Effect.mapError(
      (cause) =>
        bridgeError(
          `Electron visible browser runtime bridge returned an invalid inspect result: ${cause}`,
          "desktop-bridge-invalid-inspect-result",
        ) as Error,
    ),
  );
}

function decodeResolveTargetResult(
  value: unknown,
): Effect.Effect<BrowserResolveTargetSessionResult, Error> {
  return decodeBrowserResolveTargetResult(value).pipe(
    Effect.mapError(
      (cause) =>
        bridgeError(
          `Electron visible browser runtime bridge returned an invalid target resolution: ${cause}`,
          "desktop-bridge-invalid-target-resolution",
        ) as Error,
    ),
  );
}

function decodeResolveAnnotationTargetAtPointResult(
  value: unknown,
): Effect.Effect<BrowserAnnotationResolveTargetAtPointResult, Error> {
  return decodeBrowserResolveAnnotationTargetAtPointResult(value).pipe(
    Effect.mapError(
      (cause) =>
        bridgeError(
          `Electron visible browser runtime bridge returned an invalid annotation target resolution: ${cause}`,
          "desktop-bridge-invalid-annotation-target-resolution",
        ) as Error,
    ),
  );
}

export function setDesktopBrowserBridgePublisher(
  publisher: PublishDesktopBrowserBridgeRequest | null,
): void {
  publishDesktopBrowserBridgeRequest = publisher;
}

export function registerDesktopBrowserBridgeClient(clientId: string): void {
  desktopBridgeClientIds.add(clientId);
}

export function unregisterDesktopBrowserBridgeClient(clientId: string): void {
  desktopBridgeClientIds.delete(clientId);
  for (const [sessionId, ownerClientId] of sessionOwnerClientIds) {
    if (ownerClientId === clientId) {
      sessionOwnerClientIds.delete(sessionId);
    }
  }
}

export function handleDesktopBrowserBridgeResponse(
  response: DesktopBrowserBridgeResponseInput,
): void {
  const pending = pendingRequests.get(response.requestId);
  if (!pending) return;
  clearTimeout(pending.timeout);
  pendingRequests.delete(response.requestId);
  if (response.status === "error") {
    pending.reject(
      bridgeErrorWithDetails(
        response.error?.message ?? "Electron visible browser runtime bridge failed.",
        response.error?.code ?? "desktop-bridge-error",
        response.error?.details,
      ),
    );
    return;
  }
  if (
    pending.kind === "openSession" &&
    response.result &&
    typeof response.result === "object" &&
    "sessionId" in response.result
  ) {
    sessionOwnerClientIds.set(String(response.result.sessionId), pending.clientId);
  }
  pending.resolve(response.result);
}

export function clearDesktopBrowserBridgePendingRequests(reason: string): void {
  for (const [requestId, pending] of pendingRequests) {
    clearTimeout(pending.timeout);
    pending.reject(bridgeError(reason, "desktop-bridge-disconnected"));
    pendingRequests.delete(requestId);
  }
}

export const DesktopBrowserBridgeBrokerLive = Layer.succeed(DesktopBrowserBridge, {
  openSession: (input) =>
    requestDesktopBrowserBridge("openSession", input).pipe(Effect.flatMap(decodeObservationResult)),
  observeSession: (input) =>
    requestDesktopBrowserBridge("observeSession", input).pipe(
      Effect.flatMap(decodeObservationResult),
    ),
  inspectSession: (input) =>
    requestDesktopBrowserBridge("inspectSession", input).pipe(Effect.flatMap(decodeInspectResult)),
  resolveTargetSession: (input) =>
    requestDesktopBrowserBridge("resolveTargetSession", input).pipe(
      Effect.flatMap(decodeResolveTargetResult),
    ),
  resolveAnnotationTargetAtPoint: (input) =>
    requestDesktopBrowserBridge("resolveAnnotationTargetAtPoint", input).pipe(
      Effect.flatMap(decodeResolveAnnotationTargetAtPointResult),
    ),
  actSession: (input: BrowserActInput) =>
    requestDesktopBrowserBridge("actSession", input).pipe(Effect.flatMap(decodeObservationResult)),
  closeSession: (input) =>
    requestDesktopBrowserBridge("closeSession", input).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          sessionOwnerClientIds.delete(String(input.sessionId));
        }),
      ),
      Effect.asVoid,
    ),
  getSessionOwnerClientId: (sessionId) =>
    Effect.sync(() => sessionOwnerClientIds.get(sessionId) ?? null),
} satisfies DesktopBrowserBridgeShape);
