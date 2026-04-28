import { createHash, randomUUID } from "node:crypto";

import {
  type BrowserActResult,
  type BrowserObservation,
  type BrowserOpenSessionInput,
  type BrowserOpenSessionResult,
  type BrowserRuntimeTruth,
  type BrowserRuntimeTruthKind,
  type BrowserSurfaceMode,
  EvidenceArtifactId,
  PreviewTargetId,
  type PreviewTarget,
} from "@orchestrate/contracts";
import { Effect, Layer } from "effect";

import { BrowserAutomation } from "../../browser/Services/BrowserAutomation.ts";
import { BrowserEvidenceRecorder } from "../../browserEvidence/Services/BrowserEvidenceRecorder.ts";
import { browserClaimGateForObservation } from "../BrowserClaimGate.ts";
import { PlaywrightHeadlessBrowserRuntime } from "../PlaywrightHeadlessBrowserRuntime.ts";
import {
  BrowserRuntimeService,
  type BrowserRuntimeServiceShape,
} from "../Services/BrowserRuntimeService.ts";

const RUNTIME_KIND: BrowserRuntimeTruthKind = "playwright-headless";
const SURFACE_MODE: BrowserSurfaceMode = "headless-validation-mirror";

type RuntimeSessionRecord = {
  readonly previewTarget: PreviewTarget;
};

function now() {
  return new Date().toISOString();
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "about:blank";
  }
}

function targetKindForUrl(url: string): PreviewTarget["kind"] {
  const origin = safeOrigin(url);
  if (
    origin.startsWith("http://localhost") ||
    origin.startsWith("http://127.0.0.1") ||
    origin.startsWith("http://[::1]")
  ) {
    return "local-dev-server";
  }
  return "public-unauthenticated";
}

function permissionTierForUrl(url: string): PreviewTarget["permissionTier"] {
  return targetKindForUrl(url) === "local-dev-server"
    ? "isolated-local-preview"
    : "approved-public";
}

function syntheticArtifactId(kind: string, value: string | undefined): EvidenceArtifactId {
  const digest = createHash("sha256")
    .update(value ?? `${kind}:${randomUUID()}`)
    .digest("hex");
  return EvidenceArtifactId.makeUnsafe(`${kind}-${digest.slice(0, 24)}`);
}

function createPreviewTarget(input: BrowserOpenSessionInput): PreviewTarget {
  const origin = safeOrigin(input.url);
  const width = input.viewportWidth ?? 1440;
  const height = input.viewportHeight ?? 900;
  const targetId = PreviewTargetId.makeUnsafe(`preview-target-${randomUUID()}`);
  const readinessEvidenceRef = syntheticArtifactId("readiness", input.url);
  return {
    id: targetId,
    version: 1,
    sessionId: input.threadId ?? `browser-runtime-${randomUUID()}`,
    kind: targetKindForUrl(input.url),
    canonicalUrl: input.url,
    baseUrl: origin === "about:blank" ? input.url : `${origin}/`,
    initialRoute: "/",
    allowedOrigins: origin === "about:blank" ? [] : [origin],
    deniedOrigins: [],
    authMode: "none",
    permissionTier: permissionTierForUrl(input.url),
    viewports: [
      {
        id: "browser-runtime-viewport",
        label: `${width}x${height}`,
        width,
        height,
        deviceScaleFactor: 1,
      },
    ],
    readinessEvidenceRef,
    serverLogRefs: [],
    createdAt: now(),
  };
}

function normalizeComparableUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return trimmed.replace(/\/$/, "");
  }
}

function urlAgreement(
  observedUrl: string,
  visiblePanelUrl?: string,
): BrowserRuntimeTruth["urlAgreement"] {
  const observed = normalizeComparableUrl(observedUrl);
  const visible = normalizeComparableUrl(visiblePanelUrl);
  if (!observed || !visible) return "unknown";
  return observed === visible ? "same" : "different";
}

function screenshotDataUrlFor(observation: BrowserObservation): string | undefined {
  return (
    observation.previewScreenshotDataUrl ??
    observation.screenshotDataUrl ??
    observation.fullPageScreenshotDataUrl
  );
}

function withRuntimeTruth(
  observation: BrowserObservation,
  input: {
    readonly previewTarget: PreviewTarget;
    readonly visiblePanelUrl?: string;
    readonly screenshotArtifactRef?: EvidenceArtifactId;
    readonly evidenceRefs?: ReadonlyArray<EvidenceArtifactId>;
  },
): BrowserObservation {
  const screenshotDataUrl = screenshotDataUrlFor(observation);
  const truth: BrowserRuntimeTruth = {
    runtimeKind: RUNTIME_KIND,
    surfaceMode: SURFACE_MODE,
    isUserVisibleSurface: false,
    browserSessionId: observation.sessionId,
    previewTargetId: input.previewTarget.id,
    observationId: `browser-observation-${randomUUID()}`,
    ...(input.screenshotArtifactRef ? { screenshotArtifactRef: input.screenshotArtifactRef } : {}),
    ...(input.evidenceRefs ? { evidenceRefs: [...input.evidenceRefs] } : {}),
    ...(screenshotDataUrl ? { screenshotDataUrl } : {}),
    observedUrl: observation.url,
    ...(input.visiblePanelUrl ? { visiblePanelUrl: input.visiblePanelUrl } : {}),
    urlAgreement: urlAgreement(observation.url, input.visiblePanelUrl),
  };
  return {
    ...observation,
    runtimeKind: truth.runtimeKind,
    surfaceMode: truth.surfaceMode,
    isUserVisibleSurface: truth.isUserVisibleSurface,
    ...(truth.screenshotArtifactRef ? { screenshotArtifactRef: truth.screenshotArtifactRef } : {}),
    ...(truth.evidenceRefs ? { evidenceRefs: truth.evidenceRefs } : {}),
    observedUrl: truth.observedUrl,
    ...(truth.visiblePanelUrl ? { visiblePanelUrl: truth.visiblePanelUrl } : {}),
    urlAgreement: truth.urlAgreement,
    runtimeTruth: truth,
  };
}

export const BrowserRuntimeServiceLive = Layer.effect(
  BrowserRuntimeService,
  Effect.gen(function* () {
    const browserAutomation = yield* BrowserAutomation;
    const evidenceRecorder = yield* BrowserEvidenceRecorder;
    const runtime = new PlaywrightHeadlessBrowserRuntime(browserAutomation);
    const sessions = new Map<string, RuntimeSessionRecord>();

    const openSession: BrowserRuntimeServiceShape["openSession"] = (input) =>
      Effect.tryPromise({
        try: async () => {
          const previewTarget =
            (input.previewTarget as PreviewTarget | undefined) ?? createPreviewTarget(input);
          const session = await runtime.openSession({ previewTarget });
          sessions.set(session.browserSessionId, { previewTarget });
          const sessionEvidence = await Effect.runPromise(
            evidenceRecorder.recordSessionOpened({
              browserSessionId: session.browserSessionId,
              previewTarget,
            }),
          );
          const legacyResult = await Effect.runPromise(
            browserAutomation.act({
              sessionId: session.browserSessionId,
              action: { kind: "wait", ms: 0 },
            }),
          );
          const provisionalObservation = withRuntimeTruth(legacyResult.observation, {
            previewTarget,
            evidenceRefs: sessionEvidence.evidenceRefs,
          });
          const observationEvidence = await Effect.runPromise(
            evidenceRecorder.recordObservation({
              browserSessionId: session.browserSessionId,
              previewTarget,
              observation: provisionalObservation,
              runtimeTruth: provisionalObservation.runtimeTruth,
            }),
          );
          const evidenceRefs = [
            ...sessionEvidence.evidenceRefs,
            ...observationEvidence.evidenceRefs,
          ];
          const enrichedObservation = withRuntimeTruth(legacyResult.observation, {
            previewTarget,
            ...(observationEvidence.screenshotArtifactRef
              ? { screenshotArtifactRef: observationEvidence.screenshotArtifactRef }
              : {}),
            evidenceRefs,
          });
          const runtimeTruth = enrichedObservation.runtimeTruth;
          const claimGate = browserClaimGateForObservation({
            observation: enrichedObservation,
            runtimeTruth,
          });
          const claimGateEvidence = await Effect.runPromise(
            evidenceRecorder.recordClaimGate({
              browserSessionId: session.browserSessionId,
              previewTarget,
              observation: enrichedObservation,
              reports: claimGate,
            }),
          );
          const allEvidenceRefs = [...evidenceRefs, ...claimGateEvidence.evidenceRefs];
          const finalObservation = withRuntimeTruth(legacyResult.observation, {
            previewTarget,
            ...(observationEvidence.screenshotArtifactRef
              ? { screenshotArtifactRef: observationEvidence.screenshotArtifactRef }
              : {}),
            evidenceRefs: allEvidenceRefs,
          });
          return {
            sessionId: session.browserSessionId,
            observation: finalObservation,
            ...(finalObservation.runtimeTruth
              ? { runtimeTruth: finalObservation.runtimeTruth }
              : {}),
            evidenceRefs: allEvidenceRefs,
            claimGate,
          } satisfies BrowserOpenSessionResult;
        },
        catch: (cause) => cause as never,
      });

    const act: BrowserRuntimeServiceShape["act"] = (input) =>
      Effect.tryPromise({
        try: async () => {
          const session = sessions.get(input.sessionId);
          if (!session) {
            throw new Error(`Unknown browser runtime session: ${input.sessionId}`);
          }
          const result = await runtime.act({
            browserSessionId: input.sessionId,
            action: input.action,
          });
          if (!result.ok) {
            await Effect.runPromise(
              evidenceRecorder.recordAction({
                browserSessionId: input.sessionId,
                previewTarget: session.previewTarget,
                action: input.action,
                policyDecision: result.policyDecision,
              }),
            );
            throw new Error(result.policyDecision.reason);
          }
          const actionEvidence = await Effect.runPromise(
            evidenceRecorder.recordAction({
              browserSessionId: input.sessionId,
              previewTarget: session.previewTarget,
              action: input.action,
              policyDecision: { outcome: "allow" },
            }),
          );
          const legacyResult = await Effect.runPromise(
            browserAutomation.act({
              sessionId: input.sessionId,
              action: { kind: "wait", ms: 0 },
            }),
          );
          const provisionalObservation = withRuntimeTruth(legacyResult.observation, {
            previewTarget: session.previewTarget,
            evidenceRefs: actionEvidence.evidenceRefs,
          });
          const observationEvidence = await Effect.runPromise(
            evidenceRecorder.recordObservation({
              browserSessionId: input.sessionId,
              previewTarget: session.previewTarget,
              observation: provisionalObservation,
              runtimeTruth: provisionalObservation.runtimeTruth,
            }),
          );
          const evidenceRefs = [
            ...actionEvidence.evidenceRefs,
            ...observationEvidence.evidenceRefs,
          ];
          const observation = withRuntimeTruth(legacyResult.observation, {
            previewTarget: session.previewTarget,
            ...(observationEvidence.screenshotArtifactRef
              ? { screenshotArtifactRef: observationEvidence.screenshotArtifactRef }
              : {}),
            evidenceRefs,
          });
          const runtimeTruth = observation.runtimeTruth;
          const claimGate = browserClaimGateForObservation({ observation, runtimeTruth });
          const claimGateEvidence = await Effect.runPromise(
            evidenceRecorder.recordClaimGate({
              browserSessionId: input.sessionId,
              previewTarget: session.previewTarget,
              observation,
              reports: claimGate,
            }),
          );
          const allEvidenceRefs = [...evidenceRefs, ...claimGateEvidence.evidenceRefs];
          const finalObservation = withRuntimeTruth(legacyResult.observation, {
            previewTarget: session.previewTarget,
            ...(observationEvidence.screenshotArtifactRef
              ? { screenshotArtifactRef: observationEvidence.screenshotArtifactRef }
              : {}),
            evidenceRefs: allEvidenceRefs,
          });
          return {
            observation: finalObservation,
            ...(finalObservation.runtimeTruth
              ? { runtimeTruth: finalObservation.runtimeTruth }
              : {}),
            evidenceRefs: allEvidenceRefs,
            claimGate,
          } satisfies BrowserActResult;
        },
        catch: (cause) => cause as never,
      });

    const closeSession: BrowserRuntimeServiceShape["closeSession"] = (input) =>
      Effect.tryPromise({
        try: async () => {
          await runtime.closeSession({ browserSessionId: input.sessionId });
        },
        catch: (cause) => cause as never,
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            sessions.delete(input.sessionId);
          }),
        ),
      );

    return { openSession, act, closeSession } satisfies BrowserRuntimeServiceShape;
  }),
);
