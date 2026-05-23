import { createHash, randomUUID } from "node:crypto";

import {
  type BrowserActResult,
  type BrowserAction,
  type BrowserAnnotationResolveTargetAtPointInput,
  type BrowserAnnotationResolveTargetAtPointResult,
  type BrowserElementSummary,
  BrowserApprovalId,
  type BrowserApprovalRequest,
  type BrowserApprovalRisk,
  type BrowserInspectionArtifact,
  type BrowserInspectResult,
  type BrowserInspectSessionInput,
  type BrowserObservation,
  type BrowserOpenSessionInput,
  type BrowserOpenSessionResult,
  type BrowserRuntimeTruth,
  type BrowserRuntimeTruthKind,
  type BrowserSurfaceMode,
  type BrowserTargetFailure,
  type BrowserTargetResolution,
  EvidenceArtifactId,
  PreviewTargetId,
  type PreviewTarget,
  SessionEventId,
} from "@orchestrate/contracts";
import { Effect, Layer, Match, Option } from "effect";

import { BrowserAutomation } from "../../browser/Services/BrowserAutomation.ts";
import {
  BrowserControlLeaseHeldError,
  BrowserControlLeaseService,
  BrowserControlSnapshotRequiredError,
} from "../../browserControl/Services/BrowserControlLeaseService.ts";
import { BrowserEvidenceRecorder } from "../../browserEvidence/Services/BrowserEvidenceRecorder.ts";
import { BrowserOrchestrationEvidenceRepository } from "../../persistence/Services/BrowserOrchestrationEvidence.ts";
import { browserClaimGateForObservation } from "../BrowserClaimGate.ts";
import { BrowserActionPolicy } from "../BrowserActionPolicy.ts";
import { PlaywrightHeadlessBrowserRuntime } from "../PlaywrightHeadlessBrowserRuntime.ts";
import {
  BrowserRuntimeService,
  type BrowserRuntimeServiceShape,
} from "../Services/BrowserRuntimeService.ts";
import { DesktopBrowserBridge } from "../Services/DesktopBrowserBridge.ts";

const RUNTIME_KIND: BrowserRuntimeTruthKind = "playwright-headless";
const SURFACE_MODE: BrowserSurfaceMode = "headless-validation-mirror";
const ATTACHED_SURFACE_MODE: BrowserSurfaceMode = "playwright-attached";
const USER_FACING_DEFAULT_RUNTIME_KIND: BrowserRuntimeTruthKind = "electron-visible";

type RuntimeSessionRecord = {
  readonly previewTarget: PreviewTarget;
  readonly runtimeKind: BrowserRuntimeTruthKind;
  readonly surfaceMode: BrowserSurfaceMode;
};

function isDirectElectronSession(session: RuntimeSessionRecord): boolean {
  return (
    session.runtimeKind === "electron-visible" && session.surfaceMode === "live-shared-browser"
  );
}

function isAttachedPlaywrightSession(session: RuntimeSessionRecord): boolean {
  return session.runtimeKind === RUNTIME_KIND && session.surfaceMode === ATTACHED_SURFACE_MODE;
}

function requestedRuntimeKind(input: Pick<BrowserOpenSessionInput, "preferredRuntimeKind">) {
  return input.preferredRuntimeKind ?? USER_FACING_DEFAULT_RUNTIME_KIND;
}

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
): Exclude<BrowserRuntimeTruth["urlAgreement"], undefined> {
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

function originForPolicy(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function stableActionHash(action: BrowserAction): string {
  return createHash("sha256").update(JSON.stringify(action)).digest("hex");
}

function approvalExpiresAt(createdAt: string): string {
  return new Date(Date.parse(createdAt) + 5 * 60_000).toISOString();
}

function isExpired(value: string | undefined): boolean {
  return value ? Date.parse(value) <= Date.now() : false;
}

const CONSEQUENTIAL_ACTION_PATTERN =
  /(?:submit|send|post|delete|remove|purchase|buy|checkout|upload|export|login|sign[-_ ]?in|auth)/i;

function consequentialActionReason(action: BrowserAction): string | null {
  const inspectable =
    action.kind === "click" || action.kind === "clickTargetOrAt" || action.kind === "type"
      ? action.targetId
      : action.kind === "press"
        ? action.key
        : action.kind === "clickTarget" || action.kind === "fillTarget"
          ? browserElementTargetPolicyText(action.target)
          : null;
  if (inspectable && CONSEQUENTIAL_ACTION_PATTERN.test(inspectable)) {
    return `Electron visible ${action.kind} appears consequential and requires approval.`;
  }
  return null;
}

function browserElementTargetPolicyText(
  target: Extract<BrowserAction, { kind: "clickTarget" | "fillTarget" }>["target"],
): string {
  switch (target.kind) {
    case "selector":
      return target.selector;
    case "test-id":
      return target.testId;
    case "role-name":
      return `${target.role} ${target.name}`;
    case "text":
      return target.text;
    case "element-ref":
      return target.elementId;
    case "point":
      return "";
  }
}

function isTargetedAction(
  action: BrowserAction,
): action is Extract<BrowserAction, { kind: "clickTarget" | "fillTarget" }> {
  return action.kind === "clickTarget" || action.kind === "fillTarget";
}

function targetFailureCode(
  status: BrowserTargetResolution["status"],
): BrowserTargetFailure["code"] {
  if (status === "not-actionable") return "target-not-actionable";
  if (status === "ambiguous") return "target-ambiguous";
  return "target-not-found";
}

function readTargetFailure(error: unknown): BrowserTargetFailure | null {
  const details = (error as { details?: unknown })?.details;
  const record =
    details && typeof details === "object" ? (details as Record<string, unknown>) : null;
  const targetResolution = record?.targetResolution as BrowserTargetResolution | undefined;
  if (!targetResolution) return null;
  const code = record?.code;
  return {
    code:
      typeof code === "string"
        ? (code as BrowserTargetFailure["code"])
        : targetFailureCode(targetResolution.status),
    targetResolution,
    ...(record?.resolvedTarget
      ? { resolvedTarget: record.resolvedTarget as BrowserElementSummary }
      : {}),
  };
}

function electronActionPolicy(
  action: BrowserAction,
  previewTarget: PreviewTarget,
  context: {
    readonly resolvedTarget?: BrowserElementSummary;
    readonly targetResolution?: BrowserTargetResolution;
  } = {},
): {
  readonly status: "allow" | "blocked" | "requires-approval";
  readonly reason?: string;
  readonly risk?: BrowserApprovalRisk;
} {
  const consequentialReason = consequentialActionReason(action);
  if (consequentialReason) {
    return {
      status: "requires-approval",
      reason: consequentialReason,
      risk: "consequential-action",
    };
  }

  switch (action.kind) {
    case "wait":
    case "waitFor":
    case "scroll":
    case "press":
    case "clickAt":
    case "clickTargetOrAt":
    case "clickTarget":
    case "fillTarget":
      {
        const decision = BrowserActionPolicy.validate(action, previewTarget, context);
        if (decision.outcome === "requires-approval") {
          return {
            status: "requires-approval",
            reason: decision.reason,
            risk: decision.approvalKind === "authenticate" ? "auth" : "consequential-action",
          };
        }
        if (decision.outcome === "deny") {
          return { status: "blocked", reason: decision.reason };
        }
      }
      return { status: "allow" };
    case "typeFocused":
      return { status: "allow" };
    case "navigate": {
      const targetOrigin = originForPolicy(action.url);
      const allowed =
        targetOrigin !== null &&
        (previewTarget.allowedOrigins.includes(targetOrigin) ||
          originForPolicy(previewTarget.canonicalUrl) === targetOrigin);
      return allowed
        ? { status: "allow" }
        : {
            status: "requires-approval",
            reason: "Electron visible navigation outside the preview target requires approval.",
            risk: "external-navigation",
          };
    }
    case "click":
    case "type":
    case "resize":
    case "evaluate":
      return {
        status: "blocked",
        reason: `Electron visible runtime does not support ${action.kind} yet.`,
      };
  }
}

function electronVisibleObservation(
  observation: BrowserObservation,
  input: {
    readonly previewTarget: PreviewTarget;
    readonly screenshotArtifactRef?: EvidenceArtifactId;
    readonly evidenceRefs?: ReadonlyArray<EvidenceArtifactId>;
  },
): BrowserObservation {
  return withRuntimeTruth(observation, {
    previewTarget: input.previewTarget,
    runtimeKind: "electron-visible",
    surfaceMode: "live-shared-browser",
    isUserVisibleSurface: true,
    visiblePanelUrl: observation.visiblePanelUrl ?? observation.url,
    ...(input.screenshotArtifactRef ? { screenshotArtifactRef: input.screenshotArtifactRef } : {}),
    ...(input.evidenceRefs ? { evidenceRefs: input.evidenceRefs } : {}),
  });
}

function withRuntimeTruth(
  observation: BrowserObservation,
  input: {
    readonly previewTarget: PreviewTarget;
    readonly runtimeKind?: BrowserRuntimeTruthKind;
    readonly surfaceMode?: BrowserSurfaceMode;
    readonly isUserVisibleSurface?: boolean;
    readonly visiblePanelUrl?: string;
    readonly screenshotArtifactRef?: EvidenceArtifactId;
    readonly evidenceRefs?: ReadonlyArray<EvidenceArtifactId>;
  },
): BrowserObservation {
  const screenshotDataUrl = screenshotDataUrlFor(observation);
  const visiblePanelUrl = input.visiblePanelUrl;
  const truthBase: BrowserRuntimeTruth = {
    runtimeKind: input.runtimeKind ?? RUNTIME_KIND,
    surfaceMode: input.surfaceMode ?? SURFACE_MODE,
    isUserVisibleSurface: input.isUserVisibleSurface ?? false,
    browserSessionId: observation.sessionId,
    previewTargetId: input.previewTarget.id,
    observationId: `browser-observation-${randomUUID()}`,
    ...(input.screenshotArtifactRef ? { screenshotArtifactRef: input.screenshotArtifactRef } : {}),
    ...(input.evidenceRefs ? { evidenceRefs: [...input.evidenceRefs] } : {}),
    ...(screenshotDataUrl ? { screenshotDataUrl } : {}),
    observedUrl: observation.observedUrl ?? observation.url,
  };
  const truth: BrowserRuntimeTruth = visiblePanelUrl
    ? {
        ...truthBase,
        visiblePanelUrl,
        urlAgreement: urlAgreement(observation.url, visiblePanelUrl),
      }
    : truthBase;
  return {
    ...observation,
    runtimeKind: truth.runtimeKind,
    surfaceMode: truth.surfaceMode,
    isUserVisibleSurface: truth.isUserVisibleSurface,
    ...(truth.screenshotArtifactRef ? { screenshotArtifactRef: truth.screenshotArtifactRef } : {}),
    ...(truth.evidenceRefs ? { evidenceRefs: truth.evidenceRefs } : {}),
    observedUrl: observation.url,
    ...(truth.visiblePanelUrl ? { visiblePanelUrl: truth.visiblePanelUrl } : {}),
    ...(truth.urlAgreement ? { urlAgreement: truth.urlAgreement } : {}),
    runtimeTruth: truth,
  };
}

export const BrowserRuntimeServiceLive = Layer.effect(
  BrowserRuntimeService,
  Effect.gen(function* () {
    const browserAutomation = yield* BrowserAutomation;
    const evidenceRecorder = yield* BrowserEvidenceRecorder;
    const desktopBridge = yield* DesktopBrowserBridge;
    const controlLeases = yield* BrowserControlLeaseService;
    const repository = yield* BrowserOrchestrationEvidenceRepository;
    const runtime = new PlaywrightHeadlessBrowserRuntime(browserAutomation);
    const sessions = new Map<string, RuntimeSessionRecord>();
    const sessionActionLocks = new Map<string, Promise<void>>();

    const approvalFromRow = (row: {
      readonly approvalId: BrowserApprovalId;
      readonly browserSessionId: string;
      readonly desktopClientId: string | null;
      readonly actionJson: string;
      readonly targetContextJson: string | null;
      readonly actionHash: string;
      readonly reason: string;
      readonly risk: BrowserApprovalRisk;
      readonly preApprovalObservationRef: EvidenceArtifactId | null;
      readonly observedUrl: string | null;
      readonly origin: string | null;
      readonly status: BrowserApprovalRequest["status"];
      readonly evidenceRefsJson: string;
      readonly createdAt: string;
      readonly updatedAt: string;
      readonly expiresAt: string | null;
      readonly consumedAt: string | null;
      readonly executedActionRef: EvidenceArtifactId | null;
      readonly decisionReason: string | null;
    }): BrowserApprovalRequest => {
      const targetContext = row.targetContextJson
        ? (JSON.parse(row.targetContextJson) as {
            resolvedTarget?: BrowserElementSummary;
            targetResolution?: BrowserTargetResolution;
          })
        : {};
      return {
        id: row.approvalId,
        browserSessionId: row.browserSessionId,
        ...(row.desktopClientId ? { desktopClientId: row.desktopClientId } : {}),
        action: JSON.parse(row.actionJson) as BrowserAction,
        ...(targetContext.resolvedTarget ? { resolvedTarget: targetContext.resolvedTarget } : {}),
        ...(targetContext.targetResolution
          ? { targetResolution: targetContext.targetResolution }
          : {}),
        actionHash: row.actionHash || stableActionHash(JSON.parse(row.actionJson) as BrowserAction),
        reason: row.reason,
        risk: row.risk,
        ...(row.preApprovalObservationRef
          ? { preApprovalObservationRef: row.preApprovalObservationRef }
          : {}),
        ...(row.observedUrl ? { observedUrl: row.observedUrl } : {}),
        ...(row.origin ? { origin: row.origin } : {}),
        status: row.status,
        evidenceRefs: JSON.parse(row.evidenceRefsJson) as string[],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        ...(row.expiresAt ? { expiresAt: row.expiresAt } : {}),
        ...(row.consumedAt ? { consumedAt: row.consumedAt } : {}),
        ...(row.executedActionRef ? { executedActionRef: row.executedActionRef } : {}),
        ...(row.decisionReason ? { decisionReason: row.decisionReason } : {}),
      };
    };

    const withSessionActionLock = async <T>(browserSessionId: string, task: () => Promise<T>) => {
      const previous = sessionActionLocks.get(browserSessionId) ?? Promise.resolve();
      let release!: () => void;
      const current = new Promise<void>((resolve) => {
        release = resolve;
      });
      sessionActionLocks.set(
        browserSessionId,
        previous.catch(() => undefined).then(() => current),
      );
      const queued = sessionActionLocks.get(browserSessionId);
      await previous.catch(() => undefined);
      try {
        return await task();
      } finally {
        release();
        if (sessionActionLocks.get(browserSessionId) === queued) {
          sessionActionLocks.delete(browserSessionId);
        }
      }
    };

    const approvedForAction = async (
      approvalRef: BrowserApprovalId | undefined,
      input: {
        readonly sessionId: string;
        readonly action: BrowserAction;
        readonly previewTarget: PreviewTarget;
      },
    ) => {
      if (!approvalRef) return false;
      const row = await Effect.runPromise(
        repository.getBrowserApprovalRequest({ approvalId: approvalRef }),
      );
      if (Option.isNone(row)) return false;
      const approval = approvalFromRow(row.value);
      if (approval.status !== "approved") return false;
      if (isExpired(approval.expiresAt)) {
        await Effect.runPromise(
          repository.updateBrowserApprovalStatus({
            approvalId: approval.id,
            status: "expired",
            updatedAt: now(),
            decisionReason: "Approval expired before retry.",
          }),
        );
        return false;
      }
      if (approval.browserSessionId !== input.sessionId) return false;
      if (approval.actionHash !== stableActionHash(input.action)) return false;
      const currentDesktopClientId = await Effect.runPromise(
        desktopBridge.getSessionOwnerClientId(input.sessionId),
      );
      if (!approval.desktopClientId || !currentDesktopClientId) return false;
      if (approval.desktopClientId !== currentDesktopClientId) return false;
      const controlState = await Effect.runPromise(
        repository.getBrowserControlState({ browserSessionId: input.sessionId }),
      );
      if (
        Option.isSome(controlState) &&
        (controlState.value.freshObservationRequired ||
          controlState.value.holder === "human" ||
          (controlState.value.desktopClientId !== null &&
            controlState.value.desktopClientId !== currentDesktopClientId))
      ) {
        return false;
      }
      const currentObservation = await Effect.runPromise(
        desktopBridge.observeSession({ sessionId: input.sessionId }),
      );
      const currentOrigin = originForPolicy(currentObservation.url);
      const approvedOrigin = approval.origin ?? originForPolicy(approval.observedUrl ?? "");
      const actionTargetOrigin =
        input.action.kind === "navigate" ? originForPolicy(input.action.url) : null;
      return (
        JSON.stringify(approval.action) === JSON.stringify(input.action) &&
        (actionTargetOrigin !== null || approvedOrigin === null || currentOrigin === approvedOrigin)
      );
    };

    const createApprovalRequest = async (input: {
      readonly browserSessionId: string;
      readonly action: BrowserAction;
      readonly reason: string;
      readonly risk: BrowserApprovalRisk;
      readonly resolvedTarget?: BrowserElementSummary;
      readonly targetResolution?: BrowserTargetResolution;
      readonly evidenceRefs: ReadonlyArray<EvidenceArtifactId>;
      readonly preApprovalObservationRef?: EvidenceArtifactId;
      readonly observedUrl?: string;
    }) => {
      const createdAt = now();
      const approvalId = BrowserApprovalId.makeUnsafe(`browser-approval-${randomUUID()}`);
      const actionHash = stableActionHash(input.action);
      const origin = input.observedUrl ? originForPolicy(input.observedUrl) : null;
      const desktopClientId = await Effect.runPromise(
        desktopBridge.getSessionOwnerClientId(input.browserSessionId),
      );
      await Effect.runPromise(
        repository.createBrowserApprovalRequest({
          approvalId,
          browserSessionId: input.browserSessionId,
          sessionId: input.browserSessionId,
          desktopClientId,
          actionJson: JSON.stringify(input.action),
          targetContextJson:
            input.resolvedTarget || input.targetResolution
              ? JSON.stringify({
                  ...(input.resolvedTarget ? { resolvedTarget: input.resolvedTarget } : {}),
                  ...(input.targetResolution ? { targetResolution: input.targetResolution } : {}),
                })
              : null,
          actionHash,
          reason: input.reason,
          risk: input.risk,
          preApprovalObservationRef: input.preApprovalObservationRef ?? null,
          observedUrl: input.observedUrl ?? null,
          origin,
          status: "pending",
          evidenceRefsJson: JSON.stringify(input.evidenceRefs),
          createdAt,
          updatedAt: createdAt,
          expiresAt: approvalExpiresAt(createdAt),
          consumedAt: null,
          executedActionRef: null,
          decisionReason: null,
        }),
      );
      await Effect.runPromise(
        repository.appendSessionEvent({
          eventId: SessionEventId.makeUnsafe(`browser-approval-event-${randomUUID()}`),
          sessionId: input.browserSessionId,
          workflowRunId: null,
          type: "BrowserApprovalRequestCreated",
          actor: "agent",
          artifactRefsJson: JSON.stringify(input.evidenceRefs),
          payloadJson: JSON.stringify({
            approvalId,
            browserSessionId: input.browserSessionId,
            action: input.action,
            ...(input.resolvedTarget ? { resolvedTarget: input.resolvedTarget } : {}),
            ...(input.targetResolution ? { targetResolution: input.targetResolution } : {}),
            actionHash,
            reason: input.reason,
            risk: input.risk,
            desktopClientId,
            observedUrl: input.observedUrl,
            origin,
            status: "pending",
            evidenceRefs: input.evidenceRefs,
          }),
          occurredAt: createdAt,
        }),
      );
      return approvalId;
    };

    const consumeApprovalRequest = async (input: {
      readonly approvalId: BrowserApprovalId;
      readonly browserSessionId: string;
      readonly action: BrowserAction;
      readonly actionEvidenceRef?: EvidenceArtifactId;
    }) => {
      const consumedAt = now();
      await Effect.runPromise(
        repository.updateBrowserApprovalStatus({
          approvalId: input.approvalId,
          status: "consumed",
          updatedAt: consumedAt,
          consumedAt,
          ...(input.actionEvidenceRef ? { executedActionRef: input.actionEvidenceRef } : {}),
          decisionReason: "Approved browser action executed.",
        }),
      );
      await Effect.runPromise(
        repository.appendSessionEvent({
          eventId: SessionEventId.makeUnsafe(`browser-approval-event-${randomUUID()}`),
          sessionId: input.browserSessionId,
          workflowRunId: null,
          type: "BrowserApprovalConsumed",
          actor: "agent",
          artifactRefsJson: JSON.stringify(
            input.actionEvidenceRef ? [input.actionEvidenceRef] : [],
          ),
          payloadJson: JSON.stringify({
            approvalId: input.approvalId,
            browserSessionId: input.browserSessionId,
            action: input.action,
            actionHash: stableActionHash(input.action),
            executedActionRef: input.actionEvidenceRef,
            status: "consumed",
            evidenceRefs: input.actionEvidenceRef ? [input.actionEvidenceRef] : [],
          }),
          occurredAt: consumedAt,
        }),
      );
    };

    const recordElectronObservation = async (input: {
      readonly previewTarget: PreviewTarget;
      readonly observation: BrowserObservation;
      readonly sessionEvidenceRefs?: ReadonlyArray<EvidenceArtifactId>;
    }) => {
      const provisionalObservation = electronVisibleObservation(input.observation, {
        previewTarget: input.previewTarget,
        evidenceRefs: input.sessionEvidenceRefs ?? [],
      });
      const observationEvidence = await Effect.runPromise(
        evidenceRecorder.recordObservation({
          browserSessionId: provisionalObservation.sessionId,
          previewTarget: input.previewTarget,
          observation: provisionalObservation,
          runtimeTruth: provisionalObservation.runtimeTruth,
        }),
      );
      const evidenceRefs = [
        ...(input.sessionEvidenceRefs ?? []),
        ...observationEvidence.evidenceRefs,
      ];
      const observation = electronVisibleObservation(input.observation, {
        previewTarget: input.previewTarget,
        ...(observationEvidence.screenshotArtifactRef
          ? { screenshotArtifactRef: observationEvidence.screenshotArtifactRef }
          : {}),
        evidenceRefs,
      });
      const claimGate = browserClaimGateForObservation({
        observation,
        runtimeTruth: observation.runtimeTruth,
      });
      const claimGateEvidence = await Effect.runPromise(
        evidenceRecorder.recordClaimGate({
          browserSessionId: observation.sessionId,
          previewTarget: input.previewTarget,
          observation,
          reports: claimGate,
        }),
      );
      const allEvidenceRefs = [...evidenceRefs, ...claimGateEvidence.evidenceRefs];
      return {
        observation: electronVisibleObservation(input.observation, {
          previewTarget: input.previewTarget,
          ...(observationEvidence.screenshotArtifactRef
            ? { screenshotArtifactRef: observationEvidence.screenshotArtifactRef }
            : {}),
          evidenceRefs: allEvidenceRefs,
        }),
        evidenceRefs: allEvidenceRefs,
        claimGate,
      };
    };

    const openSession: BrowserRuntimeServiceShape["openSession"] = (input) =>
      Effect.tryPromise({
        try: async () => {
          const previewTarget =
            (input.previewTarget as PreviewTarget | undefined) ?? createPreviewTarget(input);
          if (input.preferredRuntimeKind === undefined) {
            await Effect.runPromise(
              Effect.logWarning(
                "BrowserRuntimeService applied user-facing default; upstream caller did not specify preferredRuntimeKind",
                {
                  threadId: input.threadId ?? null,
                  url: input.url,
                },
              ),
            );
          }
          const runtimeKind = requestedRuntimeKind(input);
          return await Match.value(runtimeKind).pipe(
            Match.when("electron-visible", async () => {
              const rawObservation = await Effect.runPromise(desktopBridge.openSession(input));
              sessions.set(rawObservation.sessionId, {
                previewTarget,
                runtimeKind: "electron-visible",
                surfaceMode: "live-shared-browser",
              });
              const openedObservation = electronVisibleObservation(rawObservation, {
                previewTarget,
              });
              const sessionEvidence = await Effect.runPromise(
                evidenceRecorder.recordSessionOpened({
                  browserSessionId: rawObservation.sessionId,
                  previewTarget,
                  runtimeTruth: openedObservation.runtimeTruth,
                }),
              );
              const recorded = await recordElectronObservation({
                previewTarget,
                observation: rawObservation,
                sessionEvidenceRefs: sessionEvidence.evidenceRefs,
              });
              return {
                sessionId: rawObservation.sessionId,
                observation: recorded.observation,
                ...(recorded.observation.runtimeTruth
                  ? { runtimeTruth: recorded.observation.runtimeTruth }
                  : {}),
                evidenceRefs: recorded.evidenceRefs,
                claimGate: recorded.claimGate,
              } satisfies BrowserOpenSessionResult;
            }),
            Match.when("playwright-headless", async () => {
              const visibleObservation = await Effect.runPromise(
                desktopBridge.openSession({
                  ...input,
                  preferredRuntimeKind: "electron-visible",
                }),
              );
              const cdpEndpoint = await Effect.runPromise(desktopBridge.getCdpEndpoint());
              const attachedSession = cdpEndpoint.sessions.find(
                (candidate) => candidate.sessionId === visibleObservation.sessionId,
              );
              if (!attachedSession?.targetId) {
                throw new Error(
                  "Electron CDP endpoint did not expose a targetId for the requested visible browser session; refusing to launch a separate browser.",
                );
              }
              const session = await runtime.openSession({
                previewTarget,
                cdpEndpointUrl: cdpEndpoint.endpointUrl,
                cdpTargetId: attachedSession.targetId,
                attachedBrowserSessionId: visibleObservation.sessionId,
              });
              sessions.set(session.browserSessionId, {
                previewTarget,
                runtimeKind: RUNTIME_KIND,
                surfaceMode: ATTACHED_SURFACE_MODE,
              });
              const sessionEvidence = await Effect.runPromise(
                evidenceRecorder.recordSessionOpened({
                  browserSessionId: session.browserSessionId,
                  previewTarget,
                  runtimeTruth: {
                    runtimeKind: RUNTIME_KIND,
                    surfaceMode: ATTACHED_SURFACE_MODE,
                    isUserVisibleSurface: true,
                    browserSessionId: session.browserSessionId,
                    previewTargetId: previewTarget.id,
                    observationId: `browser-observation-${randomUUID()}`,
                    observedUrl: attachedSession.url,
                    visiblePanelUrl: visibleObservation.url,
                    urlAgreement: "same",
                  },
                }),
              );
              const rawObservation = await runtime.observeObservation({
                browserSessionId: session.browserSessionId,
              });
              const provisionalObservation = withRuntimeTruth(rawObservation, {
                previewTarget,
                surfaceMode: ATTACHED_SURFACE_MODE,
                isUserVisibleSurface: true,
                visiblePanelUrl: visibleObservation.url,
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
              const enrichedObservation = withRuntimeTruth(rawObservation, {
                previewTarget,
                surfaceMode: ATTACHED_SURFACE_MODE,
                isUserVisibleSurface: true,
                visiblePanelUrl: visibleObservation.url,
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
              const finalObservation = withRuntimeTruth(rawObservation, {
                previewTarget,
                surfaceMode: ATTACHED_SURFACE_MODE,
                isUserVisibleSurface: true,
                visiblePanelUrl: visibleObservation.url,
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
            }),
            Match.when("chrome-extension", (kind) => {
              throw new Error(`Unsupported browser runtime kind: ${kind}`);
            }),
            Match.exhaustive,
          );
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
          if (isDirectElectronSession(session)) {
            return await withSessionActionLock(input.sessionId, async () => {
              const agentLease = await Effect.runPromiseExit(
                controlLeases.acquire({
                  browserSessionId: input.sessionId,
                  requestedBy: "agent",
                  reason: "agent-action",
                }),
              );
              if (agentLease._tag === "Failure") {
                const cause = agentLease.cause;
                const reason =
                  String(cause).includes(BrowserControlSnapshotRequiredError.name) ||
                  String(cause).includes("requires a fresh snapshot")
                    ? "Fresh observation required after human control."
                    : String(cause).includes(BrowserControlLeaseHeldError.name) ||
                        String(cause).includes("held by human")
                      ? "Human is currently controlling the browser."
                      : "Browser control lease prevented the action.";
                const policyEvidence = await Effect.runPromise(
                  evidenceRecorder.recordAction({
                    browserSessionId: input.sessionId,
                    previewTarget: session.previewTarget,
                    action: input.action,
                    policyDecision: { outcome: "deny", reason },
                  }),
                );
                const rawObservation = await Effect.runPromise(
                  desktopBridge.observeSession({ sessionId: input.sessionId }),
                );
                const recorded = await recordElectronObservation({
                  previewTarget: session.previewTarget,
                  observation: rawObservation,
                  sessionEvidenceRefs: policyEvidence.evidenceRefs,
                });
                return {
                  actionId: `browser-action-${randomUUID()}`,
                  status: "blocked",
                  reason,
                  observation: recorded.observation,
                  ...(recorded.observation.runtimeTruth
                    ? { runtimeTruth: recorded.observation.runtimeTruth }
                    : {}),
                  evidenceRefs: recorded.evidenceRefs,
                  ...(policyEvidence.evidenceRefs[0]
                    ? { policyDecisionRef: String(policyEvidence.evidenceRefs[0]) }
                    : {}),
                  claimGate: recorded.claimGate,
                } satisfies BrowserActResult;
              }
              let snapshotAfterReleaseRef: EvidenceArtifactId | undefined;
              try {
                let resolvedTarget: BrowserElementSummary | undefined;
                let targetResolution: BrowserTargetResolution | undefined;
                if (isTargetedAction(input.action)) {
                  try {
                    const resolved = await Effect.runPromise(
                      desktopBridge.resolveTargetSession({
                        sessionId: input.sessionId,
                        target: input.action.target,
                        actionKind: input.action.kind,
                      }),
                    );
                    resolvedTarget = resolved.resolvedTarget;
                    targetResolution = resolved.targetResolution;
                    if (targetResolution.status !== "resolved") {
                      const policyEvidence = await Effect.runPromise(
                        evidenceRecorder.recordAction({
                          browserSessionId: input.sessionId,
                          previewTarget: session.previewTarget,
                          action: input.action,
                          policyDecision: {
                            outcome: "deny",
                            reason:
                              targetResolution.reason ?? "Browser target could not be resolved.",
                          },
                          ...(resolvedTarget ? { resolvedTarget } : {}),
                          targetResolution,
                        }),
                      );
                      const rawObservation = await Effect.runPromise(
                        desktopBridge.observeSession({ sessionId: input.sessionId }),
                      );
                      const recorded = await recordElectronObservation({
                        previewTarget: session.previewTarget,
                        observation: rawObservation,
                        sessionEvidenceRefs: policyEvidence.evidenceRefs,
                      });
                      snapshotAfterReleaseRef = recorded.observation.screenshotArtifactRef
                        ? EvidenceArtifactId.makeUnsafe(recorded.observation.screenshotArtifactRef)
                        : undefined;
                      return {
                        actionId: `browser-action-${randomUUID()}`,
                        status: "failed",
                        reason: targetResolution.reason ?? "Browser target could not be resolved.",
                        observation: recorded.observation,
                        ...(recorded.observation.runtimeTruth
                          ? { runtimeTruth: recorded.observation.runtimeTruth }
                          : {}),
                        evidenceRefs: recorded.evidenceRefs,
                        ...(recorded.observation.screenshotArtifactRef
                          ? { screenshotArtifactRef: recorded.observation.screenshotArtifactRef }
                          : {}),
                        ...(policyEvidence.evidenceRefs[0]
                          ? { policyDecisionRef: String(policyEvidence.evidenceRefs[0]) }
                          : {}),
                        claimGate: recorded.claimGate,
                        targetResolution,
                      } satisfies BrowserActResult;
                    }
                  } catch (error) {
                    const targetFailure = readTargetFailure(error);
                    if (targetFailure) {
                      const policyEvidence = await Effect.runPromise(
                        evidenceRecorder.recordAction({
                          browserSessionId: input.sessionId,
                          previewTarget: session.previewTarget,
                          action: input.action,
                          policyDecision: {
                            outcome: "deny",
                            reason:
                              targetFailure.targetResolution.reason ??
                              "Browser target could not be resolved.",
                          },
                          ...(targetFailure.resolvedTarget
                            ? { resolvedTarget: targetFailure.resolvedTarget }
                            : {}),
                          targetResolution: targetFailure.targetResolution,
                        }),
                      );
                      const rawObservation = await Effect.runPromise(
                        desktopBridge.observeSession({ sessionId: input.sessionId }),
                      );
                      const recorded = await recordElectronObservation({
                        previewTarget: session.previewTarget,
                        observation: rawObservation,
                        sessionEvidenceRefs: policyEvidence.evidenceRefs,
                      });
                      snapshotAfterReleaseRef = recorded.observation.screenshotArtifactRef
                        ? EvidenceArtifactId.makeUnsafe(recorded.observation.screenshotArtifactRef)
                        : undefined;
                      return {
                        actionId: `browser-action-${randomUUID()}`,
                        status: "failed",
                        reason:
                          targetFailure.targetResolution.reason ??
                          "Browser target could not be resolved.",
                        observation: recorded.observation,
                        ...(recorded.observation.runtimeTruth
                          ? { runtimeTruth: recorded.observation.runtimeTruth }
                          : {}),
                        evidenceRefs: recorded.evidenceRefs,
                        ...(recorded.observation.screenshotArtifactRef
                          ? { screenshotArtifactRef: recorded.observation.screenshotArtifactRef }
                          : {}),
                        ...(policyEvidence.evidenceRefs[0]
                          ? { policyDecisionRef: String(policyEvidence.evidenceRefs[0]) }
                          : {}),
                        claimGate: recorded.claimGate,
                        targetResolution: targetFailure.targetResolution,
                        ...(targetFailure.resolvedTarget
                          ? {
                              target: targetFailure.resolvedTarget,
                              resolvedTarget: targetFailure.resolvedTarget,
                            }
                          : {}),
                      } satisfies BrowserActResult;
                    }
                    throw error;
                  }
                }
                const policy = electronActionPolicy(input.action, session.previewTarget, {
                  ...(resolvedTarget ? { resolvedTarget } : {}),
                  ...(targetResolution ? { targetResolution } : {}),
                });
                if (policy.status !== "allow") {
                  const reason =
                    policy.reason ??
                    `Electron visible runtime blocked unsupported action: ${input.action.kind}`;
                  const approved =
                    policy.status === "requires-approval"
                      ? await approvedForAction(input.approvalRef, {
                          sessionId: input.sessionId,
                          action: input.action,
                          previewTarget: session.previewTarget,
                        })
                      : false;
                  if (approved) {
                    const rawObservation = await Effect.runPromise(desktopBridge.actSession(input));
                    const actionEvidence = await Effect.runPromise(
                      evidenceRecorder.recordAction({
                        browserSessionId: input.sessionId,
                        previewTarget: session.previewTarget,
                        action: input.action,
                        policyDecision: { outcome: "allow" },
                        ...(rawObservation.resolvedTarget
                          ? { resolvedTarget: rawObservation.resolvedTarget }
                          : {}),
                        ...(rawObservation.targetResolution
                          ? { targetResolution: rawObservation.targetResolution }
                          : {}),
                      }),
                    );
                    const recorded = await recordElectronObservation({
                      previewTarget: session.previewTarget,
                      observation: rawObservation,
                      sessionEvidenceRefs: actionEvidence.evidenceRefs,
                    });
                    await consumeApprovalRequest({
                      approvalId: input.approvalRef!,
                      browserSessionId: input.sessionId,
                      action: input.action,
                      ...(actionEvidence.evidenceRefs[0]
                        ? { actionEvidenceRef: actionEvidence.evidenceRefs[0] }
                        : {}),
                    });
                    snapshotAfterReleaseRef = recorded.observation.screenshotArtifactRef
                      ? EvidenceArtifactId.makeUnsafe(recorded.observation.screenshotArtifactRef)
                      : undefined;
                    return {
                      actionId: `browser-action-${randomUUID()}`,
                      status: "ok",
                      observation: recorded.observation,
                      ...(recorded.observation.runtimeTruth
                        ? { runtimeTruth: recorded.observation.runtimeTruth }
                        : {}),
                      evidenceRefs: recorded.evidenceRefs,
                      policyDecisionRef: String(actionEvidence.evidenceRefs[0] ?? ""),
                      claimGate: recorded.claimGate,
                      ...(rawObservation.resolvedTarget
                        ? { target: rawObservation.resolvedTarget }
                        : {}),
                      ...(rawObservation.resolvedTarget
                        ? { resolvedTarget: rawObservation.resolvedTarget }
                        : {}),
                      ...(rawObservation.targetResolution
                        ? { targetResolution: rawObservation.targetResolution }
                        : {}),
                    } satisfies BrowserActResult;
                  }
                  const policyEvidence = await Effect.runPromise(
                    evidenceRecorder.recordAction({
                      browserSessionId: input.sessionId,
                      previewTarget: session.previewTarget,
                      action: input.action,
                      policyDecision: { outcome: "deny", reason },
                      ...(resolvedTarget ? { resolvedTarget } : {}),
                      ...(targetResolution ? { targetResolution } : {}),
                    }),
                  );
                  const rawObservation = await Effect.runPromise(
                    desktopBridge.observeSession({ sessionId: input.sessionId }),
                  );
                  const recorded = await recordElectronObservation({
                    previewTarget: session.previewTarget,
                    observation: rawObservation,
                    sessionEvidenceRefs: policyEvidence.evidenceRefs,
                  });
                  snapshotAfterReleaseRef = recorded.observation.screenshotArtifactRef
                    ? EvidenceArtifactId.makeUnsafe(recorded.observation.screenshotArtifactRef)
                    : undefined;
                  const approvalRequestId =
                    policy.status === "requires-approval"
                      ? await createApprovalRequest({
                          browserSessionId: input.sessionId,
                          action: input.action,
                          reason,
                          risk: policy.risk ?? "unknown",
                          ...(resolvedTarget ? { resolvedTarget } : {}),
                          ...(targetResolution ? { targetResolution } : {}),
                          evidenceRefs: policyEvidence.evidenceRefs,
                          ...(recorded.observation.screenshotArtifactRef
                            ? {
                                preApprovalObservationRef: EvidenceArtifactId.makeUnsafe(
                                  recorded.observation.screenshotArtifactRef,
                                ),
                              }
                            : {}),
                          observedUrl: recorded.observation.url,
                        })
                      : undefined;
                  return {
                    actionId: `browser-action-${randomUUID()}`,
                    status: policy.status === "requires-approval" ? "requires-approval" : "blocked",
                    reason,
                    observation: recorded.observation,
                    ...(recorded.observation.runtimeTruth
                      ? { runtimeTruth: recorded.observation.runtimeTruth }
                      : {}),
                    evidenceRefs: recorded.evidenceRefs,
                    policyDecisionRef: String(policyEvidence.evidenceRefs[0] ?? ""),
                    ...(approvalRequestId ? { approvalRequestId } : {}),
                    claimGate: recorded.claimGate,
                  } satisfies BrowserActResult;
                }
                const rawObservation = await Effect.runPromise(desktopBridge.actSession(input));
                const actionEvidence = await Effect.runPromise(
                  evidenceRecorder.recordAction({
                    browserSessionId: input.sessionId,
                    previewTarget: session.previewTarget,
                    action: input.action,
                    policyDecision: { outcome: "allow" },
                    ...(rawObservation.resolvedTarget
                      ? { resolvedTarget: rawObservation.resolvedTarget }
                      : {}),
                    ...(rawObservation.targetResolution
                      ? { targetResolution: rawObservation.targetResolution }
                      : {}),
                  }),
                );
                const recorded = await recordElectronObservation({
                  previewTarget: session.previewTarget,
                  observation: rawObservation,
                  sessionEvidenceRefs: actionEvidence.evidenceRefs,
                });
                snapshotAfterReleaseRef = recorded.observation.screenshotArtifactRef
                  ? EvidenceArtifactId.makeUnsafe(recorded.observation.screenshotArtifactRef)
                  : undefined;
                return {
                  actionId: `browser-action-${randomUUID()}`,
                  status: "ok",
                  observation: recorded.observation,
                  ...(recorded.observation.runtimeTruth
                    ? { runtimeTruth: recorded.observation.runtimeTruth }
                    : {}),
                  evidenceRefs: recorded.evidenceRefs,
                  policyDecisionRef: String(actionEvidence.evidenceRefs[0] ?? ""),
                  claimGate: recorded.claimGate,
                  ...(rawObservation.resolvedTarget
                    ? { target: rawObservation.resolvedTarget }
                    : {}),
                  ...(rawObservation.resolvedTarget
                    ? { resolvedTarget: rawObservation.resolvedTarget }
                    : {}),
                  ...(rawObservation.targetResolution
                    ? { targetResolution: rawObservation.targetResolution }
                    : {}),
                } satisfies BrowserActResult;
              } finally {
                await Effect.runPromise(
                  controlLeases
                    .release({
                      browserSessionId: input.sessionId,
                      leaseId: agentLease.value.lease.id,
                      ...(snapshotAfterReleaseRef ? { snapshotAfterReleaseRef } : {}),
                    })
                    .pipe(Effect.catch(() => Effect.void)),
                );
              }
            });
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
            throw new Error(
              result.policyDecision.outcome === "allow"
                ? "Browser action was not allowed."
                : result.policyDecision.reason,
            );
          }
          const actionEvidence = await Effect.runPromise(
            evidenceRecorder.recordAction({
              browserSessionId: input.sessionId,
              previewTarget: session.previewTarget,
              action: input.action,
              policyDecision: { outcome: "allow" },
            }),
          );
          const legacyObservation = isAttachedPlaywrightSession(session)
            ? await runtime.observeObservation({ browserSessionId: input.sessionId })
            : (
                await Effect.runPromise(
                  browserAutomation.act({
                    sessionId: input.sessionId,
                    action: { kind: "wait", ms: 0 },
                  }),
                )
              ).observation;
          const provisionalObservation = withRuntimeTruth(legacyObservation, {
            previewTarget: session.previewTarget,
            ...(isAttachedPlaywrightSession(session)
              ? {
                  surfaceMode: ATTACHED_SURFACE_MODE,
                  isUserVisibleSurface: true,
                  visiblePanelUrl: legacyObservation.url,
                }
              : {}),
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
          const observation = withRuntimeTruth(legacyObservation, {
            previewTarget: session.previewTarget,
            ...(isAttachedPlaywrightSession(session)
              ? {
                  surfaceMode: ATTACHED_SURFACE_MODE,
                  isUserVisibleSurface: true,
                  visiblePanelUrl: legacyObservation.url,
                }
              : {}),
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
          const finalObservation = withRuntimeTruth(legacyObservation, {
            previewTarget: session.previewTarget,
            ...(isAttachedPlaywrightSession(session)
              ? {
                  surfaceMode: ATTACHED_SURFACE_MODE,
                  isUserVisibleSurface: true,
                  visiblePanelUrl: legacyObservation.url,
                }
              : {}),
            ...(observationEvidence.screenshotArtifactRef
              ? { screenshotArtifactRef: observationEvidence.screenshotArtifactRef }
              : {}),
            evidenceRefs: allEvidenceRefs,
          });
          return {
            status: "ok",
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
          const session = sessions.get(input.sessionId);
          if (!session) {
            throw new Error(`Unknown browser runtime session: ${input.sessionId}`);
          }
          if (isDirectElectronSession(session)) {
            await Effect.runPromise(desktopBridge.closeSession(input));
            return;
          }
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

    const observe: BrowserRuntimeServiceShape["observe"] = (input) =>
      Effect.tryPromise({
        try: async () => {
          const session = sessions.get(input.sessionId);
          if (!session) {
            throw new Error(`Unknown browser runtime session: ${input.sessionId}`);
          }

          if (isDirectElectronSession(session)) {
            const rawObservation = await Effect.runPromise(desktopBridge.observeSession(input));
            const recorded = await recordElectronObservation({
              previewTarget: session.previewTarget,
              observation: rawObservation,
            });
            return {
              actionId: `browser-observe-${randomUUID()}`,
              status: "ok",
              observation: recorded.observation,
              ...(recorded.observation.runtimeTruth
                ? { runtimeTruth: recorded.observation.runtimeTruth }
                : {}),
              evidenceRefs: recorded.evidenceRefs,
              claimGate: recorded.claimGate,
            } satisfies BrowserActResult;
          }

          const legacyObservation = isAttachedPlaywrightSession(session)
            ? await runtime.observeObservation({ browserSessionId: input.sessionId })
            : (
                await Effect.runPromise(
                  browserAutomation.act({
                    sessionId: input.sessionId,
                    action: { kind: "wait", ms: 0 },
                  }),
                )
              ).observation;
          const provisionalObservation = withRuntimeTruth(legacyObservation, {
            previewTarget: session.previewTarget,
            ...(isAttachedPlaywrightSession(session)
              ? {
                  surfaceMode: ATTACHED_SURFACE_MODE,
                  isUserVisibleSurface: true,
                  visiblePanelUrl: legacyObservation.url,
                }
              : {}),
          });
          const observationEvidence = await Effect.runPromise(
            evidenceRecorder.recordObservation({
              browserSessionId: input.sessionId,
              previewTarget: session.previewTarget,
              observation: provisionalObservation,
              runtimeTruth: provisionalObservation.runtimeTruth,
            }),
          );
          const evidenceRefs = [...observationEvidence.evidenceRefs];
          const observation = withRuntimeTruth(legacyObservation, {
            previewTarget: session.previewTarget,
            ...(isAttachedPlaywrightSession(session)
              ? {
                  surfaceMode: ATTACHED_SURFACE_MODE,
                  isUserVisibleSurface: true,
                  visiblePanelUrl: legacyObservation.url,
                }
              : {}),
            ...(observationEvidence.screenshotArtifactRef
              ? { screenshotArtifactRef: observationEvidence.screenshotArtifactRef }
              : {}),
            evidenceRefs,
          });
          const claimGate = browserClaimGateForObservation({
            observation,
            runtimeTruth: observation.runtimeTruth,
          });
          const claimGateEvidence = await Effect.runPromise(
            evidenceRecorder.recordClaimGate({
              browserSessionId: input.sessionId,
              previewTarget: session.previewTarget,
              observation,
              reports: claimGate,
            }),
          );
          const allEvidenceRefs = [...evidenceRefs, ...claimGateEvidence.evidenceRefs];
          const finalObservation = withRuntimeTruth(legacyObservation, {
            previewTarget: session.previewTarget,
            ...(isAttachedPlaywrightSession(session)
              ? {
                  surfaceMode: ATTACHED_SURFACE_MODE,
                  isUserVisibleSurface: true,
                  visiblePanelUrl: legacyObservation.url,
                }
              : {}),
            ...(observationEvidence.screenshotArtifactRef
              ? { screenshotArtifactRef: observationEvidence.screenshotArtifactRef }
              : {}),
            evidenceRefs: allEvidenceRefs,
          });
          return {
            actionId: `browser-observe-${randomUUID()}`,
            status: "ok",
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

    const inspect: BrowserRuntimeServiceShape["inspect"] = (input: BrowserInspectSessionInput) =>
      Effect.tryPromise({
        try: async (): Promise<BrowserInspectResult> => {
          const session = sessions.get(input.sessionId);
          if (!session) {
            throw new Error(`Unknown browser runtime session: ${input.sessionId}`);
          }
          if (!isDirectElectronSession(session)) {
            throw new Error(
              "DOM/AX element inspection is only available for Electron visible sessions.",
            );
          }
          const rawInspect = await Effect.runPromise(desktopBridge.inspectSession(input));
          const rawObservation = await Effect.runPromise(
            desktopBridge.observeSession({ sessionId: input.sessionId }),
          );
          const recorded = await recordElectronObservation({
            previewTarget: session.previewTarget,
            observation: rawObservation,
          });
          const runtimeTruth = recorded.observation.runtimeTruth ?? rawInspect.runtimeTruth;
          const screenshotArtifactRef =
            recorded.observation.screenshotArtifactRef ?? rawInspect.screenshotArtifactRef;
          const inspection: BrowserInspectionArtifact = {
            browserSessionId: input.sessionId,
            runtimeTruth,
            url: rawInspect.url,
            ...(rawInspect.title ? { title: rawInspect.title } : {}),
            ...(recorded.observation.pageMetrics
              ? {
                  viewport: {
                    width: recorded.observation.pageMetrics.viewportWidth,
                    height: recorded.observation.pageMetrics.viewportHeight,
                  },
                  scroll: { x: 0, y: recorded.observation.pageMetrics.scrollTop },
                }
              : {}),
            elements: rawInspect.elements,
            ...(screenshotArtifactRef ? { screenshotArtifactRef } : {}),
            capturedAt: new Date().toISOString(),
          };
          const inspectionEvidence = await Effect.runPromise(
            evidenceRecorder.recordInspection({
              browserSessionId: input.sessionId,
              previewTarget: session.previewTarget,
              runtimeTruth,
              inspection,
            }),
          );
          return {
            browserSessionId: input.sessionId,
            runtimeTruth,
            url: rawInspect.url,
            ...(rawInspect.title ? { title: rawInspect.title } : {}),
            elements: rawInspect.elements,
            ...(screenshotArtifactRef ? { screenshotArtifactRef } : {}),
            evidenceRefs: [
              ...new Set([
                ...rawInspect.evidenceRefs,
                ...recorded.evidenceRefs,
                ...inspectionEvidence.evidenceRefs,
              ]),
            ],
          };
        },
        catch: (cause) => cause as never,
      });

    const resolveAnnotationTargetAtPoint: BrowserRuntimeServiceShape["resolveAnnotationTargetAtPoint"] =
      (input: BrowserAnnotationResolveTargetAtPointInput) =>
        Effect.tryPromise({
          try: async (): Promise<BrowserAnnotationResolveTargetAtPointResult> => {
            const session = sessions.get(input.browserSessionId);
            if (!session) {
              throw new Error(`Unknown browser runtime session: ${input.browserSessionId}`);
            }
            if (!isDirectElectronSession(session)) {
              throw new Error(
                "Annotation target resolution is only available for Electron visible sessions.",
              );
            }
            const rawResolution = await Effect.runPromise(
              desktopBridge.resolveAnnotationTargetAtPoint(input),
            );
            const rawObservation = await Effect.runPromise(
              desktopBridge.observeSession({ sessionId: input.browserSessionId }),
            );
            const recorded = await recordElectronObservation({
              previewTarget: session.previewTarget,
              observation: rawObservation,
            });
            const screenshotArtifactRef =
              recorded.observation.screenshotArtifactRef ?? rawResolution.screenshotArtifactRef;
            return {
              ...rawResolution,
              runtimeTruth: recorded.observation.runtimeTruth ?? rawResolution.runtimeTruth,
              ...(screenshotArtifactRef ? { screenshotArtifactRef } : {}),
              evidenceRefs: [...new Set([...rawResolution.evidenceRefs, ...recorded.evidenceRefs])],
            };
          },
          catch: (cause) => cause as never,
        });

    return {
      openSession,
      act,
      closeSession,
      observe,
      inspect,
      resolveAnnotationTargetAtPoint,
    } satisfies BrowserRuntimeServiceShape;
  }),
);
