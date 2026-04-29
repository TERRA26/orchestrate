// FILE: BrowserPanel.tsx
// Purpose: Renders the in-app browser chrome and mirrors the native Electron view.
// Layer: Desktop-only React component
// Depends on: browserStateStore, nativeApi browser bridge, DiffPanelShell

import {
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useStore } from "zustand";
import {
  EvidenceArtifactId,
  type BrowserAction,
  type BrowserAnnotation,
  type BrowserElementSummary,
  type BrowserApprovalRequest,
  type HumanControlLease,
  type BrowserObservation,
  type BrowserObservedTarget,
  type ThreadBrowserState,
  type ThreadId,
} from "@orchestrate/contracts";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ExternalLinkIcon,
  GlobeIcon,
  LoaderCircleIcon,
  LockIcon,
  LockOpenIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  SquarePenIcon,
  XIcon,
} from "~/lib/icons";

import { readNativeApi } from "~/nativeApi";
import { cn } from "~/lib/utils";
import { fetchEvidenceArtifactImageDataUrl } from "~/browserEvidenceArtifacts";

import {
  useBrowserStateStore,
  selectThreadBrowserHistory,
  selectThreadBrowserState,
} from "../browserStateStore";
import {
  createEmbeddedBrowserAutomationSession,
  useEmbeddedBrowserStateStore,
} from "../embeddedBrowserStateStore";
import {
  browserAddressDisplayValue,
  buildBrowserAddressSuggestions,
  normalizeBrowserAddressInput,
  resolveBrowserAddressSync,
  shouldOpenFallbackAutomationMirror,
  type BrowserAddressSuggestion,
} from "./BrowserPanel.logic";
import { DiffPanelLoadingState, DiffPanelShell, type DiffPanelMode } from "./DiffPanelShell";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

const FALLBACK_TYPE_FLUSH_DELAY_MS = 160;
const FALLBACK_MIN_VIEWPORT_WIDTH = 360;
const FALLBACK_MIN_VIEWPORT_HEIGHT = 480;
const FALLBACK_MAX_VIEWPORT_WIDTH = 1440;
const FALLBACK_MAX_VIEWPORT_HEIGHT = 1200;

interface BrowserPanelProps {
  mode: DiffPanelMode;
  threadId: ThreadId;
  onClosePanel: () => void;
}

interface BrowserPanelAutomationSession {
  sessionId: string;
  observation: BrowserObservation;
  lastActionSummary: string;
}

interface BrowserAnnotationDraft {
  kind?: "point" | "rect";
  x: number;
  y: number;
  width?: number;
  height?: number;
  targetId?: string;
  targetLabel?: string;
  targetElement?: BrowserElementSummary;
}

export function browserPanelControlStatusLabel(input: {
  usesNativeBrowserSurface: boolean;
  activeBrowserSessionId: string | null;
  controlSessionIdIsServerKnown: boolean;
  controlLease: HumanControlLease | null;
}): string {
  if (input.usesNativeBrowserSurface && !input.activeBrowserSessionId) {
    return "Control unavailable";
  }
  if (input.activeBrowserSessionId && !input.controlSessionIdIsServerKnown) {
    return "Control unavailable";
  }
  if (input.controlLease?.holder === "human") {
    return "Human control active";
  }
  if (input.controlLease?.state === "paused") {
    return "Agent paused";
  }
  if (
    input.controlLease?.requiredSnapshotAfterRelease &&
    !input.controlLease.snapshotAfterReleaseRef
  ) {
    return "Fresh observation required";
  }
  if (input.controlLease?.holder === "agent") {
    return "Agent control active";
  }
  return "Agent ready";
}

export function BrowserPanelApprovalList({
  approvals,
  approvalBusyId,
  onRespond,
}: {
  approvals: readonly BrowserApprovalRequest[];
  approvalBusyId: string | null;
  onRespond: (approvalId: string, decision: "approved" | "rejected") => void;
}) {
  if (approvals.length === 0) return null;
  return (
    <>
      {approvals.slice(0, 2).map((approval) => {
        const isPending = approval.status === "pending";
        const heading =
          approval.status === "approved"
            ? "Approved"
            : approval.status === "rejected"
              ? "Rejected"
              : approval.status === "expired"
                ? "Approval expired"
                : approval.status === "consumed"
                  ? "Approved action executed"
                  : "Approval required";
        return (
          <div key={approval.id} className="space-y-2 border-b border-border/40 py-2 last:border-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-foreground">{heading}</span>
              <span className="rounded border border-border/60 px-1.5 py-0.5 text-muted-foreground">
                {approval.status}
              </span>
            </div>
            <div className="text-muted-foreground">
              Risk: {approval.risk}
              {approval.origin ? ` · ${approval.origin}` : ""}
            </div>
            <div className="truncate text-muted-foreground" title={JSON.stringify(approval.action)}>
              Action {approval.action.kind} · {approval.actionHash.slice(0, 10)}
            </div>
            <div className="truncate text-muted-foreground/75">
              {approval.evidenceRefs.length} evidence ref(s)
            </div>
            {isPending ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={approvalBusyId === approval.id}
                  onClick={() => onRespond(approval.id, "approved")}
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={approvalBusyId === approval.id}
                  onClick={() => onRespond(approval.id, "rejected")}
                >
                  Reject
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

export function shouldRefreshBrowserPanelForEvent(
  event: unknown,
  activeBrowserSessionId: string | null,
): "approval" | "control" | "annotation" | null {
  if (!activeBrowserSessionId) return null;
  const eventRecord =
    event && typeof event === "object" ? (event as Record<string, unknown>) : null;
  const payload =
    eventRecord?.payload && typeof eventRecord.payload === "object"
      ? (eventRecord.payload as Record<string, unknown>)
      : eventRecord?.payloadJson && typeof eventRecord.payloadJson === "string"
        ? (() => {
            try {
              return JSON.parse(eventRecord.payloadJson as string) as Record<string, unknown>;
            } catch {
              return null;
            }
          })()
        : eventRecord;
  const type =
    (typeof eventRecord?.type === "string" ? eventRecord.type : null) ??
    (typeof eventRecord?.eventType === "string" ? eventRecord.eventType : null);
  const sessionId =
    (typeof payload?.browserSessionId === "string" ? payload.browserSessionId : null) ??
    (payload?.lease &&
    typeof payload.lease === "object" &&
    typeof (payload.lease as Record<string, unknown>).browserSessionId === "string"
      ? ((payload.lease as Record<string, unknown>).browserSessionId as string)
      : null) ??
    (payload?.approval &&
    typeof payload.approval === "object" &&
    typeof (payload.approval as Record<string, unknown>).browserSessionId === "string"
      ? ((payload.approval as Record<string, unknown>).browserSessionId as string)
      : null) ??
    (payload?.annotation &&
    typeof payload.annotation === "object" &&
    typeof (payload.annotation as Record<string, unknown>).browserSessionId === "string"
      ? ((payload.annotation as Record<string, unknown>).browserSessionId as string)
      : null);
  if (sessionId && sessionId !== activeBrowserSessionId) return null;
  if (type?.startsWith("BrowserApproval")) return "approval";
  if (type?.startsWith("BrowserControl")) return "control";
  if (type?.startsWith("BrowserAnnotation")) return "annotation";
  return null;
}

export function browserPanelHumanInputRequest(input: {
  browserSessionId: string | null;
  kind: "manual" | "mouse" | "keyboard" | "focus" | "navigation";
  url: string;
  now?: () => string;
}) {
  if (!input.browserSessionId) return null;
  return {
    browserSessionId: input.browserSessionId,
    kind: input.kind,
    url: input.url,
    occurredAt: input.now?.() ?? new Date().toISOString(),
  };
}

export function browserPanelApprovalResponseRequest(
  approvalId: string,
  decision: "approved" | "rejected",
) {
  return { approvalId, decision };
}

export function browserPanelControlRequest(input: {
  browserSessionId: string | null;
  action: "release" | "pauseAgent" | "resumeAgent" | "observeFresh";
  leaseId?: HumanControlLease["id"];
  snapshotAfterReleaseRef?: string | null;
}) {
  if (!input.browserSessionId) return null;
  if (input.action === "release") {
    if (!input.leaseId) return null;
    return {
      action: input.action,
      input: {
        browserSessionId: input.browserSessionId,
        leaseId: input.leaseId,
        ...(input.snapshotAfterReleaseRef
          ? {
              snapshotAfterReleaseRef: EvidenceArtifactId.makeUnsafe(input.snapshotAfterReleaseRef),
            }
          : {}),
      },
    };
  }
  if (input.action === "pauseAgent") {
    return {
      action: input.action,
      input: {
        browserSessionId: input.browserSessionId,
        reason: "manual-pause" as const,
      },
    };
  }
  return {
    action: input.action,
    input: {
      browserSessionId: input.browserSessionId,
    },
  };
}

function closeButtonClassName(isActive: boolean) {
  return cn(
    "ml-1 size-5 shrink-0 rounded-sm p-0 text-muted-foreground/70 hover:bg-background/80 hover:text-foreground",
    isActive ? "hover:bg-background" : "hover:bg-card",
  );
}

function formatBrowserActionError(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return "Couldn't complete that browser action.";
  }
  if (/ERR_ABORTED|\(-3\)/i.test(error.message)) {
    return null;
  }
  return "Couldn't complete that browser action.";
}

function normalizeComparableBrowserUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "about:blank") {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return trimmed.replace(/\/$/, "");
  }
}

function browserUrlsLikelyMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const normalizedLeft = normalizeComparableBrowserUrl(left);
  const normalizedRight = normalizeComparableBrowserUrl(right);
  if (!normalizedLeft && !normalizedRight) {
    return true;
  }
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) {
    return true;
  }

  try {
    return new URL(normalizedLeft).host === new URL(normalizedRight).host;
  } catch {
    return false;
  }
}

function browserUrlsExactlyMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const normalizedLeft = normalizeComparableBrowserUrl(left);
  const normalizedRight = normalizeComparableBrowserUrl(right);
  if (!normalizedLeft && !normalizedRight) {
    return true;
  }
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  return normalizedLeft === normalizedRight;
}

function browserObservationScreenshotDataUrl(
  observation: BrowserObservation | null,
): string | null {
  return (
    observation?.screenshotDataUrl ??
    observation?.previewScreenshotDataUrl ??
    observation?.fullPageScreenshotDataUrl ??
    null
  );
}

function shortEvidenceRef(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.replace(/^artifact:\/\//, "").replace(/^evidence:\/\//, "");
  return normalized.length > 18 ? `${normalized.slice(0, 18)}...` : normalized;
}

function findBrowserTargetAtPoint(
  targets: readonly BrowserObservedTarget[],
  x: number,
  y: number,
): BrowserObservedTarget | null {
  const candidates = targets
    .filter((target) => {
      const padding = Math.max(
        4,
        Math.min(14, Math.round(Math.min(target.width, target.height) / 4)),
      );
      return (
        x >= target.x - padding &&
        x <= target.x + target.width + padding &&
        y >= target.y - padding &&
        y <= target.y + target.height + padding
      );
    })
    .toSorted((left, right) => left.width * left.height - right.width * right.height);
  return candidates[0] ?? null;
}

function fallbackBrowserTitleFromUrl(url: string): string {
  try {
    return new URL(url).hostname || "Browser";
  } catch {
    return "Browser";
  }
}

function browserStateFromFallbackObservation(input: {
  currentState: ThreadBrowserState | null | undefined;
  observation: BrowserObservation;
  threadId: ThreadId;
}): ThreadBrowserState {
  const currentActiveTab =
    input.currentState?.tabs.find((tab) => tab.id === input.currentState?.activeTabId) ??
    input.currentState?.tabs[0] ??
    null;
  const fallbackTabId = currentActiveTab?.id ?? "fallback-browser-tab";
  const observedTab = {
    ...(currentActiveTab ?? {
      id: fallbackTabId,
      canGoBack: false,
      canGoForward: false,
      faviconUrl: null,
    }),
    url: input.observation.url,
    title: input.observation.title || fallbackBrowserTitleFromUrl(input.observation.url),
    status: "live" as const,
    isLoading: false,
    lastCommittedUrl: input.observation.url,
    lastError: input.observation.navigationError ?? null,
  };
  const tabs =
    input.currentState && input.currentState.tabs.length > 0
      ? input.currentState.tabs.map((tab) => (tab.id === fallbackTabId ? observedTab : tab))
      : [observedTab];

  return {
    threadId: input.threadId,
    open: true,
    activeTabId: fallbackTabId,
    tabs,
    lastError: input.observation.navigationError ?? null,
  };
}

export function BrowserPanel({ mode, threadId, onClosePanel }: BrowserPanelProps) {
  const api = readNativeApi();
  const threadBrowserState = useStore(useBrowserStateStore, selectThreadBrowserState(threadId));
  const recentHistory = useStore(useBrowserStateStore, selectThreadBrowserHistory(threadId));
  const threadAutomationBrowserSession = useEmbeddedBrowserStateStore((store) => {
    const session = store.threadSessionsById[threadId];
    return session?.kind === "automation" && session.screenshotDataUrl ? session : null;
  });
  const openThreadBrowserSession = useEmbeddedBrowserStateStore((store) => store.openThreadSession);
  const upsertThreadState = useBrowserStateStore((store) => store.upsertThreadState);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const browserViewportRef = useRef<HTMLDivElement>(null);
  const browserPanelFrameRef = useRef<HTMLDivElement>(null);
  const fallbackAutomationViewportRef = useRef<HTMLDivElement>(null);
  const addressDraftsByTabIdRef = useRef(new Map<string, string>());
  const lastSyncedAddressByTabIdRef = useRef(new Map<string, string>());
  const previousActiveTabIdRef = useRef<string | null>(null);
  const lastSentBoundsRef = useRef<string | null>(null);
  const isAddressEditingRef = useRef(false);
  const resizeFrameRef = useRef<number | null>(null);
  const boundsBurstFrameRef = useRef<number | null>(null);
  const fallbackAutomationSessionIdRef = useRef<string | null>(null);
  const lastAutoOpenedFallbackUrlRef = useRef<string | null>(null);
  const fallbackActionQueueRef = useRef<Promise<BrowserObservation | null>>(Promise.resolve(null));
  const fallbackTypeBufferRef = useRef("");
  const fallbackTypeFlushTimerRef = useRef<number | null>(null);
  const [addressValue, setAddressValue] = useState("");
  const [isAddressFocused, setIsAddressFocused] = useState(false);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [fallbackAutomationSession, setFallbackAutomationSession] =
    useState<BrowserPanelAutomationSession | null>(null);
  const [artifactScreenshot, setArtifactScreenshot] = useState<{
    ref: string;
    dataUrl: string | null;
    error: string | null;
  } | null>(null);
  const [fallbackAutomationBusy, setFallbackAutomationBusy] = useState(false);
  const [browserAnnotations, setBrowserAnnotations] = useState<BrowserAnnotation[]>([]);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [annotationDraft, setAnnotationDraft] = useState<BrowserAnnotationDraft | null>(null);
  const [annotationComment, setAnnotationComment] = useState("");
  const [annotationDragStart, setAnnotationDragStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [controlLease, setControlLease] = useState<HumanControlLease | null>(null);
  const [controlBusy, setControlBusy] = useState(false);
  const [approvalRequests, setApprovalRequests] = useState<BrowserApprovalRequest[]>([]);
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);
  const activeTab =
    threadBrowserState?.tabs.find((tab) => tab.id === threadBrowserState.activeTabId) ??
    threadBrowserState?.tabs[0] ??
    null;
  const loading = activeTab?.isLoading ?? false;
  const activeTabStatus = activeTab?.status ?? "suspended";
  const activeTabDisplayUrl = browserAddressDisplayValue(activeTab);
  const browserAddressSuggestions = buildBrowserAddressSuggestions({
    query: addressValue,
    activeTabId: activeTab?.id ?? null,
    tabs: threadBrowserState?.tabs ?? [],
    recentHistory,
  });
  const showBrowserAddressSuggestions =
    isAddressFocused && browserAddressSuggestions.length > 0 && workspaceReady;
  const usesNativeBrowserSurface =
    typeof window !== "undefined" && window.desktopBridge !== undefined;
  const activeTabUrl = activeTab?.lastCommittedUrl ?? activeTab?.url ?? "";
  const activeElectronBrowserSessionId = usesNativeBrowserSurface
    ? (threadBrowserState?.activeBrowserSessionId ?? null)
    : null;
  const controlSessionIdIsServerKnown = Boolean(threadBrowserState?.activeBrowserSessionId);
  const restorableAutomationUrl = threadAutomationBrowserSession?.url ?? "";
  const prefersThreadAutomationSession = threadAutomationBrowserSession?.source === "orchestrator";
  const orchestratorAutomationSessionId =
    prefersThreadAutomationSession && threadAutomationBrowserSession?.kind === "automation"
      ? (threadAutomationBrowserSession.sessionId ?? null)
      : null;
  const fallbackFrameUrl =
    !usesNativeBrowserSurface && prefersThreadAutomationSession && restorableAutomationUrl
      ? restorableAutomationUrl
      : !usesNativeBrowserSurface && activeTabUrl && activeTabUrl !== "about:blank"
        ? activeTabUrl
        : !usesNativeBrowserSurface && restorableAutomationUrl
          ? restorableAutomationUrl
          : null;
  const hasActiveComparableBrowserUrl = normalizeComparableBrowserUrl(activeTabUrl) !== null;
  const fallbackScreenshotSession =
    !usesNativeBrowserSurface &&
    threadAutomationBrowserSession &&
    (prefersThreadAutomationSession ||
      (!fallbackAutomationSession &&
        (!hasActiveComparableBrowserUrl ||
          browserUrlsLikelyMatch(threadAutomationBrowserSession.url, activeTabUrl))))
      ? threadAutomationBrowserSession
      : null;
  const hasFallbackScreenshotSession = fallbackScreenshotSession !== null;
  const fallbackAutomationObservation = fallbackAutomationSession?.observation ?? null;
  const showStaticThreadEvidence =
    prefersThreadAutomationSession && fallbackScreenshotSession !== null;
  const fallbackAutomationObservationMatchesFrame =
    !fallbackFrameUrl ||
    browserUrlsExactlyMatch(fallbackAutomationObservation?.url, fallbackFrameUrl);
  const displayedFallbackAutomationObservation =
    fallbackAutomationObservation &&
    !showStaticThreadEvidence &&
    (!prefersThreadAutomationSession ||
      fallbackAutomationObservationMatchesFrame ||
      !fallbackScreenshotSession)
      ? fallbackAutomationObservation
      : null;
  const legacyFallbackAutomationScreenshotDataUrl = browserObservationScreenshotDataUrl(
    displayedFallbackAutomationObservation,
  );
  const displayedEvidenceRef =
    displayedFallbackAutomationObservation?.screenshotArtifactRef ??
    displayedFallbackAutomationObservation?.runtimeTruth?.screenshotArtifactRef ??
    fallbackScreenshotSession?.screenshotArtifactRef ??
    null;
  const displayedEvidenceLabel = shortEvidenceRef(displayedEvidenceRef);
  const artifactScreenshotDataUrl =
    artifactScreenshot?.ref === displayedEvidenceRef ? artifactScreenshot.dataUrl : null;
  const artifactScreenshotError =
    artifactScreenshot?.ref === displayedEvidenceRef ? artifactScreenshot.error : null;
  const fallbackAutomationScreenshotDataUrl =
    artifactScreenshotDataUrl ?? legacyFallbackAutomationScreenshotDataUrl;
  const fallbackStaticScreenshotDataUrl =
    artifactScreenshotDataUrl ?? fallbackScreenshotSession?.screenshotDataUrl ?? null;
  const browserSurfaceModeLabel = usesNativeBrowserSurface
    ? "Live shared browser"
    : showStaticThreadEvidence
      ? "Static screenshot evidence"
      : fallbackAutomationScreenshotDataUrl
        ? "Headless validation mirror"
        : fallbackScreenshotSession
          ? "Static screenshot evidence"
          : null;
  const evidenceStatusLabel = displayedEvidenceLabel
    ? artifactScreenshotDataUrl
      ? `artifact ${displayedEvidenceLabel}`
      : artifactScreenshotError
        ? `artifact unavailable ${displayedEvidenceLabel}`
        : `artifact loading ${displayedEvidenceLabel}`
    : "legacy screenshot";

  const refreshControlStatus = useCallback(async () => {
    if (!api || !activeElectronBrowserSessionId) {
      setControlLease(null);
      return;
    }
    try {
      const result = await api.browser.control.status({
        browserSessionId: activeElectronBrowserSessionId,
      });
      setControlLease(result.lease);
    } catch {
      setControlLease(null);
    }
  }, [activeElectronBrowserSessionId, api]);

  const refreshApprovalRequests = useCallback(async () => {
    if (!api || !activeElectronBrowserSessionId) {
      setApprovalRequests([]);
      return;
    }
    try {
      const result = await api.browser.approval.list({
        browserSessionId: activeElectronBrowserSessionId,
      });
      setApprovalRequests(result.approvals.toReversed());
    } catch {
      setApprovalRequests([]);
    }
  }, [activeElectronBrowserSessionId, api]);

  useEffect(() => {
    void refreshControlStatus();
  }, [refreshControlStatus]);

  useEffect(() => {
    void refreshApprovalRequests();
  }, [refreshApprovalRequests]);

  const runControlAction = useCallback(
    async (action: () => Promise<unknown>) => {
      if (!api || !activeElectronBrowserSessionId) return;
      setControlBusy(true);
      setLocalError(null);
      try {
        await action();
        await refreshControlStatus();
        await refreshApprovalRequests();
      } catch (error) {
        setLocalError(error instanceof Error ? error.message : String(error));
      } finally {
        setControlBusy(false);
      }
    },
    [activeElectronBrowserSessionId, api, refreshApprovalRequests, refreshControlStatus],
  );

  const respondToApproval = useCallback(
    async (approvalId: string, decision: "approved" | "rejected") => {
      if (!api) return;
      setApprovalBusyId(approvalId);
      setLocalError(null);
      try {
        await api.browser.approval.respond(
          browserPanelApprovalResponseRequest(approvalId, decision),
        );
        await refreshApprovalRequests();
      } catch (error) {
        setLocalError(error instanceof Error ? error.message : String(error));
      } finally {
        setApprovalBusyId(null);
      }
    },
    [api, refreshApprovalRequests],
  );

  const controlStatusLabel = browserPanelControlStatusLabel({
    usesNativeBrowserSurface,
    activeBrowserSessionId: activeElectronBrowserSessionId,
    controlSessionIdIsServerKnown,
    controlLease,
  });
  const activeBrowserUrl =
    displayedFallbackAutomationObservation?.url ?? fallbackScreenshotSession?.url ?? activeTabUrl;
  const reportPointerHumanInput = useCallback(() => {
    if (!api || !activeElectronBrowserSessionId || !controlSessionIdIsServerKnown) return;
    const request = browserPanelHumanInputRequest({
      browserSessionId: activeElectronBrowserSessionId,
      kind: "mouse",
      url: activeBrowserUrl,
    });
    if (!request) return;
    void api.browser.control
      .humanInput(request)
      .then(() => {
        void refreshControlStatus();
      })
      .catch(() => undefined);
  }, [
    activeBrowserUrl,
    activeElectronBrowserSessionId,
    api,
    controlSessionIdIsServerKnown,
    refreshControlStatus,
  ]);
  const activeBrowserTitle =
    displayedFallbackAutomationObservation?.title ??
    fallbackScreenshotSession?.title ??
    activeTab?.title ??
    fallbackBrowserTitleFromUrl(activeBrowserUrl);
  const visibleBrowserAnnotations = browserAnnotations.filter((annotation) =>
    browserUrlsLikelyMatch(annotation.url, activeBrowserUrl),
  );

  useEffect(() => {
    if (!api || !activeElectronBrowserSessionId) return;
    return api.browser.onSessionEvent((event) => {
      const refreshKind = shouldRefreshBrowserPanelForEvent(event, activeElectronBrowserSessionId);
      if (refreshKind === "approval") {
        void refreshApprovalRequests();
      } else if (refreshKind === "control") {
        void refreshControlStatus();
      }
    });
  }, [activeElectronBrowserSessionId, api, refreshApprovalRequests, refreshControlStatus]);

  useEffect(() => {
    if (!displayedEvidenceRef) {
      setArtifactScreenshot(null);
      return;
    }

    let cancelled = false;
    setArtifactScreenshot({ ref: displayedEvidenceRef, dataUrl: null, error: null });
    if (!api) {
      setArtifactScreenshot({
        ref: displayedEvidenceRef,
        dataUrl: null,
        error: "Native API unavailable.",
      });
      return;
    }
    void fetchEvidenceArtifactImageDataUrl(api, displayedEvidenceRef)
      .then((dataUrl) => {
        if (cancelled) return;
        setArtifactScreenshot({
          ref: displayedEvidenceRef,
          dataUrl,
          error: dataUrl ? null : "Artifact content is not a renderable image.",
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setArtifactScreenshot({
          ref: displayedEvidenceRef,
          dataUrl: null,
          error: error instanceof Error ? error.message : "Artifact fetch failed.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [api, displayedEvidenceRef]);

  const runBrowserAction = useCallback(async <T,>(action: () => Promise<T>): Promise<T | null> => {
    try {
      const result = await action();
      setLocalError(null);
      return result;
    } catch (error) {
      setLocalError(formatBrowserActionError(error));
      return null;
    }
  }, []);

  const refreshBrowserAnnotations = useCallback(async () => {
    if (!api) {
      return;
    }
    try {
      const result = await api.browser.listAnnotations({ threadId });
      setBrowserAnnotations([...result.annotations]);
    } catch {
      // Annotation state should never block the browser itself.
    }
  }, [api, threadId]);

  useEffect(() => {
    if (!api || !activeElectronBrowserSessionId) return;
    return api.browser.onSessionEvent((event) => {
      const refreshKind = shouldRefreshBrowserPanelForEvent(event, activeElectronBrowserSessionId);
      if (refreshKind === "annotation") {
        void refreshBrowserAnnotations();
      }
    });
  }, [activeElectronBrowserSessionId, api, refreshBrowserAnnotations]);

  const getFallbackAutomationViewportSize = useCallback(() => {
    const element = fallbackAutomationViewportRef.current ?? browserPanelFrameRef.current;
    const rect = element?.getBoundingClientRect();
    const width = Math.round(rect?.width ?? 0);
    const height = Math.round(rect?.height ?? 0);
    return {
      width: Math.min(
        FALLBACK_MAX_VIEWPORT_WIDTH,
        Math.max(FALLBACK_MIN_VIEWPORT_WIDTH, width || FALLBACK_MAX_VIEWPORT_WIDTH),
      ),
      height: Math.min(
        FALLBACK_MAX_VIEWPORT_HEIGHT,
        Math.max(FALLBACK_MIN_VIEWPORT_HEIGHT, height || 900),
      ),
    };
  }, []);

  const publishFallbackAutomationObservation = useCallback(
    (
      observation: BrowserObservation,
      lastActionSummary: string,
      source: "orchestrator" | "sidebar" = "sidebar",
    ) => {
      const previousObservation =
        source === "sidebar" ? (fallbackAutomationSession?.observation ?? null) : null;
      const nextObservation: BrowserObservation =
        browserObservationScreenshotDataUrl(observation) || !previousObservation
          ? observation
          : {
              ...observation,
              ...(previousObservation.screenshotDataUrl
                ? { screenshotDataUrl: previousObservation.screenshotDataUrl }
                : {}),
              ...(previousObservation.previewScreenshotDataUrl
                ? { previewScreenshotDataUrl: previousObservation.previewScreenshotDataUrl }
                : {}),
              ...(previousObservation.fullPageScreenshotDataUrl
                ? { fullPageScreenshotDataUrl: previousObservation.fullPageScreenshotDataUrl }
                : {}),
            };
      if (source === "sidebar") {
        fallbackAutomationSessionIdRef.current = observation.sessionId;
        setFallbackAutomationSession({
          sessionId: observation.sessionId,
          observation: nextObservation,
          lastActionSummary,
        });
      }
      openThreadBrowserSession(
        threadId,
        createEmbeddedBrowserAutomationSession({
          source,
          title: nextObservation.title || fallbackBrowserTitleFromUrl(nextObservation.url),
          observation: nextObservation,
          lastActionSummary,
        }),
      );
      const currentBrowserState = useBrowserStateStore.getState().threadStatesByThreadId[threadId];
      upsertThreadState(
        browserStateFromFallbackObservation({
          currentState: currentBrowserState,
          observation: nextObservation,
          threadId,
        }),
      );
      void refreshBrowserAnnotations();
    },
    [
      fallbackAutomationSession?.observation,
      openThreadBrowserSession,
      refreshBrowserAnnotations,
      threadId,
      upsertThreadState,
    ],
  );

  const runFallbackAutomationAction = useCallback(
    async (action: BrowserAction, lastActionSummary: string) => {
      if (!api) {
        return null;
      }
      const queuedAction = fallbackActionQueueRef.current
        .catch(() => null)
        .then(async () => {
          const sessionId = fallbackAutomationSessionIdRef.current;
          if (!sessionId) {
            return null;
          }
          setFallbackAutomationBusy(true);
          try {
            const result = await api.browser.act({ sessionId, action });
            publishFallbackAutomationObservation(result.observation, lastActionSummary);
            setLocalError(null);
            return result.observation;
          } catch (error) {
            setLocalError(formatBrowserActionError(error));
            return null;
          } finally {
            setFallbackAutomationBusy(false);
          }
        });
      fallbackActionQueueRef.current = queuedAction;
      return queuedAction;
    },
    [api, publishFallbackAutomationObservation],
  );

  const flushFallbackTypeBuffer = useCallback(() => {
    const bufferedText = fallbackTypeBufferRef.current;
    if (fallbackTypeFlushTimerRef.current !== null) {
      window.clearTimeout(fallbackTypeFlushTimerRef.current);
      fallbackTypeFlushTimerRef.current = null;
    }
    if (bufferedText.length === 0) {
      return;
    }
    fallbackTypeBufferRef.current = "";
    void runFallbackAutomationAction(
      { kind: "typeFocused", text: bufferedText },
      "Typed into page",
    );
  }, [runFallbackAutomationAction]);

  const queueFallbackTypedText = useCallback(
    (text: string, lastActionSummary = "Typed into page") => {
      if (text.length === 0) {
        return;
      }
      fallbackTypeBufferRef.current += text;
      if (fallbackTypeFlushTimerRef.current !== null) {
        window.clearTimeout(fallbackTypeFlushTimerRef.current);
      }
      fallbackTypeFlushTimerRef.current = window.setTimeout(() => {
        const bufferedText = fallbackTypeBufferRef.current;
        fallbackTypeBufferRef.current = "";
        fallbackTypeFlushTimerRef.current = null;
        if (bufferedText.length === 0) {
          return;
        }
        void runFallbackAutomationAction(
          { kind: "typeFocused", text: bufferedText },
          lastActionSummary,
        );
      }, FALLBACK_TYPE_FLUSH_DELAY_MS);
    },
    [runFallbackAutomationAction],
  );

  const openFallbackAutomationUrl = useCallback(
    async (url: string) => {
      if (!api) {
        return null;
      }
      setFallbackAutomationBusy(true);
      try {
        const activeSessionId = fallbackAutomationSessionIdRef.current;
        const viewportSize = getFallbackAutomationViewportSize();
        const observation = activeSessionId
          ? (
              await api.browser.act({
                sessionId: activeSessionId,
                action: { kind: "navigate", url },
              })
            ).observation
          : (
              await api.browser.openSession({
                url,
                viewportWidth: viewportSize.width,
                viewportHeight: viewportSize.height,
              })
            ).observation;
        publishFallbackAutomationObservation(observation, "Navigated browser");
        setLocalError(null);
        return observation;
      } catch (error) {
        setLocalError(formatBrowserActionError(error));
        return null;
      } finally {
        setFallbackAutomationBusy(false);
      }
    },
    [api, getFallbackAutomationViewportSize, publishFallbackAutomationObservation],
  );

  const beginAnnotationAtPoint = useCallback((input: BrowserAnnotationDraft) => {
    setAnnotationDraft(input);
    setAnnotationComment("");
    setAnnotationMode(true);
  }, []);

  const submitBrowserAnnotation = useCallback(async () => {
    if (!api || !annotationDraft || activeBrowserUrl.trim().length === 0) {
      return;
    }
    const comment = annotationComment.trim();
    if (comment.length === 0) {
      return;
    }
    const observation = fallbackAutomationSession?.observation;
    const viewportWidth =
      observation?.pageMetrics?.viewportWidth ??
      Math.round(browserPanelFrameRef.current?.getBoundingClientRect().width ?? 0);
    const viewportHeight =
      observation?.pageMetrics?.viewportHeight ??
      Math.round(browserPanelFrameRef.current?.getBoundingClientRect().height ?? 0);
    const point = {
      x: Math.round(annotationDraft.x * Math.max(1, viewportWidth)),
      y: Math.round(annotationDraft.y * Math.max(1, viewportHeight)),
    };
    const rect =
      annotationDraft.kind === "rect" &&
      annotationDraft.width !== undefined &&
      annotationDraft.height !== undefined
        ? {
            x: Math.round(annotationDraft.x * Math.max(1, viewportWidth)),
            y: Math.round(annotationDraft.y * Math.max(1, viewportHeight)),
            width: Math.round(annotationDraft.width * Math.max(1, viewportWidth)),
            height: Math.round(annotationDraft.height * Math.max(1, viewportHeight)),
          }
        : undefined;
    const screenshotPixelSize =
      viewportWidth > 0 && viewportHeight > 0
        ? {
            width: Math.round(viewportWidth * (window.devicePixelRatio || 1)),
            height: Math.round(viewportHeight * (window.devicePixelRatio || 1)),
          }
        : undefined;
    const geometry = {
      coordinateSpace: "css-pixels" as const,
      ...(rect ? { rect } : { point }),
      viewport: {
        width: viewportWidth,
        height: viewportHeight,
        deviceScaleFactor: window.devicePixelRatio || 1,
      },
      scroll: {
        x: 0,
        y: observation?.pageMetrics?.scrollTop ?? 0,
      },
      ...(screenshotPixelSize ? { screenshotPixelSize } : {}),
    };
    try {
      const resolvedTarget =
        !rect && activeElectronBrowserSessionId
          ? await api.browser
              .resolveAnnotationTargetAtPoint({
                browserSessionId: activeElectronBrowserSessionId,
                point,
                geometryContext: {
                  viewport: geometry.viewport,
                  scroll: geometry.scroll,
                  ...(screenshotPixelSize ? { screenshotPixelSize } : {}),
                },
                includeDomSnippet: true,
                includeComputedStyle: true,
              })
              .catch(() => null)
          : null;
      const targetElement = resolvedTarget?.element ?? annotationDraft.targetElement;
      const targetResolution = resolvedTarget?.targetResolution;
      const targetGeometry = resolvedTarget?.geometry ?? geometry;
      const targetKind = targetElement ? "element" : rect ? "region" : "point";
      const result = await api.browser.addAnnotation({
        threadId,
        ...(observation?.sessionId ? { sessionId: observation.sessionId } : {}),
        ...((activeElectronBrowserSessionId ?? observation?.sessionId)
          ? { browserSessionId: activeElectronBrowserSessionId ?? observation?.sessionId }
          : {}),
        url: activeBrowserUrl,
        title: activeBrowserTitle,
        comment,
        kind: rect ? "rect" : "point",
        x: annotationDraft.x,
        y: annotationDraft.y,
        ...(observation?.pageMetrics?.viewportWidth !== undefined
          ? { viewportWidth: observation.pageMetrics.viewportWidth }
          : {}),
        ...(observation?.pageMetrics?.viewportHeight !== undefined
          ? { viewportHeight: observation.pageMetrics.viewportHeight }
          : {}),
        ...(observation?.pageMetrics?.scrollTop !== undefined
          ? { scrollTop: observation.pageMetrics.scrollTop }
          : {}),
        ...(annotationDraft.targetId ? { targetId: annotationDraft.targetId } : {}),
        ...(annotationDraft.targetLabel ? { targetLabel: annotationDraft.targetLabel } : {}),
        target: {
          kind: targetKind,
          ...(targetElement ? { element: targetElement } : {}),
          ...(targetResolution ? { targetResolution } : {}),
          geometry: targetGeometry,
          ...(resolvedTarget?.domSnippet ? { domSnippet: resolvedTarget.domSnippet } : {}),
          ...(resolvedTarget?.computedStyle ? { computedStyle: resolvedTarget.computedStyle } : {}),
        },
        ...(resolvedTarget?.screenshotArtifactRef
          ? { fullScreenshotArtifactRef: resolvedTarget.screenshotArtifactRef }
          : {}),
        ...(resolvedTarget?.evidenceRefs?.[0]
          ? { browserInspectionRef: resolvedTarget.evidenceRefs[0] }
          : {}),
        ...(observation?.previewScreenshotDataUrl
          ? { screenshotDataUrl: observation.previewScreenshotDataUrl }
          : {}),
      });
      setBrowserAnnotations([...result.annotations]);
      setAnnotationDraft(null);
      setAnnotationComment("");
      setAnnotationDragStart(null);
      setAnnotationMode(false);
    } catch (error) {
      setLocalError(formatBrowserActionError(error));
    }
  }, [
    activeBrowserTitle,
    activeBrowserUrl,
    activeElectronBrowserSessionId,
    annotationComment,
    annotationDraft,
    api,
    fallbackAutomationSession?.observation,
    threadId,
  ]);

  const annotationPointFromEvent = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  }, []);

  const onBrowserAnnotationPointerDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!annotationMode || event.target !== event.currentTarget) return;
      const point = annotationPointFromEvent(event);
      if (!point) return;
      setAnnotationDragStart(point);
      beginAnnotationAtPoint({ kind: "point", ...point });
    },
    [annotationMode, annotationPointFromEvent, beginAnnotationAtPoint],
  );

  const onBrowserAnnotationPointerMove = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!annotationMode || !annotationDragStart || event.target !== event.currentTarget) return;
      const point = annotationPointFromEvent(event);
      if (!point) return;
      const width = Math.abs(point.x - annotationDragStart.x);
      const height = Math.abs(point.y - annotationDragStart.y);
      if (width < 0.01 && height < 0.01) return;
      setAnnotationDraft({
        kind: "rect",
        x: Math.min(point.x, annotationDragStart.x),
        y: Math.min(point.y, annotationDragStart.y),
        width,
        height,
      });
    },
    [annotationDragStart, annotationMode, annotationPointFromEvent],
  );

  const onBrowserAnnotationPointerUp = useCallback(() => {
    setAnnotationDragStart(null);
  }, []);

  useEffect(() => {
    if (!api) {
      return;
    }

    return api.browser.onState((state) => {
      upsertThreadState(state);
    });
  }, [api, upsertThreadState]);

  useEffect(() => {
    if (!api) {
      return;
    }

    return api.browser.onObservation((payload) => {
      if (payload.threadId !== threadId) {
        return;
      }
      openThreadBrowserSession(
        threadId,
        createEmbeddedBrowserAutomationSession({
          source: "orchestrator",
          title: payload.observation.title || fallbackBrowserTitleFromUrl(payload.observation.url),
          observation: payload.observation,
          lastActionSummary: payload.actionSummary,
        }),
      );
    });
  }, [api, openThreadBrowserSession, threadId]);

  useEffect(() => {
    if (!api) {
      return;
    }

    let cancelled = false;
    setWorkspaceReady(false);
    setLocalError(null);

    void runBrowserAction(() => api.browser.open({ threadId })).then((state) => {
      if (cancelled) {
        return;
      }
      if (!state) {
        setWorkspaceReady(true);
        return;
      }
      upsertThreadState(state);
      setWorkspaceReady(true);
    });

    return () => {
      cancelled = true;
      void api.browser.hide({ threadId });
    };
  }, [api, runBrowserAction, threadId, upsertThreadState]);

  useEffect(() => {
    void refreshBrowserAnnotations();
  }, [refreshBrowserAnnotations]);

  useEffect(() => {
    return () => {
      const sessionId = fallbackAutomationSessionIdRef.current;
      if (sessionId && api) {
        void api.browser.closeSession({ sessionId });
      }
      if (fallbackTypeFlushTimerRef.current !== null) {
        window.clearTimeout(fallbackTypeFlushTimerRef.current);
        fallbackTypeFlushTimerRef.current = null;
      }
      fallbackAutomationSessionIdRef.current = null;
    };
  }, [api]);

  useEffect(() => {
    if (
      usesNativeBrowserSurface ||
      !api ||
      !workspaceReady ||
      !prefersThreadAutomationSession ||
      !orchestratorAutomationSessionId ||
      !hasFallbackScreenshotSession
    ) {
      return;
    }

    let cancelled = false;
    let inFlight = false;

    const refreshCurrentObservation = async () => {
      if (inFlight) {
        return;
      }
      inFlight = true;
      try {
        const result = await api.browser.act({
          sessionId: orchestratorAutomationSessionId,
          action: { kind: "wait", ms: 250 },
        });
        if (!cancelled) {
          publishFallbackAutomationObservation(
            result.observation,
            "Refreshed screenshot evidence",
            "orchestrator",
          );
        }
      } catch {
        // The orchestrator-owned browser session may have been closed after the evidence was
        // captured. Keep the last screenshot visible rather than surfacing noisy polling errors.
      } finally {
        inFlight = false;
      }
    };

    void refreshCurrentObservation();
    const intervalId = window.setInterval(refreshCurrentObservation, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    api,
    hasFallbackScreenshotSession,
    orchestratorAutomationSessionId,
    prefersThreadAutomationSession,
    publishFallbackAutomationObservation,
    usesNativeBrowserSurface,
    workspaceReady,
  ]);

  useEffect(() => {
    if (
      !shouldOpenFallbackAutomationMirror({
        usesNativeBrowserSurface,
        hasApi: Boolean(api),
        workspaceReady,
        fallbackFrameUrl,
        prefersThreadAutomationSession,
        hasFallbackScreenshotSession: Boolean(fallbackScreenshotSession),
      })
    ) {
      return;
    }
    if (!fallbackFrameUrl) {
      return;
    }
    if (
      fallbackAutomationSession &&
      browserUrlsExactlyMatch(fallbackAutomationSession.observation.url, fallbackFrameUrl)
    ) {
      return;
    }
    if (lastAutoOpenedFallbackUrlRef.current === fallbackFrameUrl) {
      return;
    }
    lastAutoOpenedFallbackUrlRef.current = fallbackFrameUrl;
    void openFallbackAutomationUrl(fallbackFrameUrl);
  }, [
    api,
    fallbackAutomationSession,
    fallbackFrameUrl,
    fallbackScreenshotSession,
    openFallbackAutomationUrl,
    prefersThreadAutomationSession,
    usesNativeBrowserSurface,
    workspaceReady,
  ]);

  useEffect(() => {
    if (usesNativeBrowserSurface || !api || !workspaceReady) {
      return;
    }
    const element = browserPanelFrameRef.current;
    if (!element) {
      return;
    }

    let resizeFrame: number | null = null;
    let lastSentSizeKey: string | null = null;
    const scheduleResize = () => {
      if (resizeFrame !== null) {
        window.cancelAnimationFrame(resizeFrame);
      }
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        const sessionId = fallbackAutomationSessionIdRef.current;
        if (!sessionId) {
          return;
        }
        const nextSize = getFallbackAutomationViewportSize();
        const nextSizeKey = `${nextSize.width}x${nextSize.height}`;
        const currentMetrics = fallbackAutomationSession?.observation.pageMetrics;
        const currentSizeKey = currentMetrics
          ? `${currentMetrics.viewportWidth}x${currentMetrics.viewportHeight}`
          : null;
        if (lastSentSizeKey === nextSizeKey || currentSizeKey === nextSizeKey) {
          return;
        }
        lastSentSizeKey = nextSizeKey;
        void runFallbackAutomationAction(
          { kind: "resize", width: nextSize.width, height: nextSize.height },
          "Resized browser viewport",
        );
      });
    };

    const observer = new ResizeObserver(scheduleResize);
    observer.observe(element);
    scheduleResize();

    return () => {
      observer.disconnect();
      if (resizeFrame !== null) {
        window.cancelAnimationFrame(resizeFrame);
      }
    };
  }, [
    api,
    fallbackAutomationSession?.observation.pageMetrics,
    getFallbackAutomationViewportSize,
    runFallbackAutomationAction,
    usesNativeBrowserSurface,
    workspaceReady,
  ]);

  useEffect(() => {
    const activeTabId = activeTab?.id ?? null;
    const nextDisplayValue =
      fallbackScreenshotSession?.source === "orchestrator"
        ? fallbackScreenshotSession.url
        : activeTab && normalizeComparableBrowserUrl(browserAddressDisplayValue(activeTab))
          ? browserAddressDisplayValue(activeTab)
          : (fallbackScreenshotSession?.url ?? browserAddressDisplayValue(activeTab));
    const decision = resolveBrowserAddressSync({
      activeTabId,
      previousActiveTabId: previousActiveTabIdRef.current,
      savedDraft: activeTabId ? addressDraftsByTabIdRef.current.get(activeTabId) : undefined,
      nextDisplayValue,
      lastSyncedValue: activeTabId
        ? lastSyncedAddressByTabIdRef.current.get(activeTabId)
        : undefined,
      isEditing: isAddressEditingRef.current,
    });

    if (decision.type === "replace") {
      setAddressValue(decision.value);
      if (activeTabId) {
        addressDraftsByTabIdRef.current.set(activeTabId, decision.value);
        if (decision.syncedValue !== undefined) {
          lastSyncedAddressByTabIdRef.current.set(activeTabId, decision.syncedValue);
        }
      }
    }

    previousActiveTabIdRef.current = activeTabId;
  }, [activeTab, fallbackScreenshotSession?.source, fallbackScreenshotSession?.url]);

  useEffect(() => {
    const liveTabIds = new Set(threadBrowserState?.tabs.map((tab) => tab.id) ?? []);
    for (const tabId of addressDraftsByTabIdRef.current.keys()) {
      if (!liveTabIds.has(tabId)) {
        addressDraftsByTabIdRef.current.delete(tabId);
        lastSyncedAddressByTabIdRef.current.delete(tabId);
      }
    }
  }, [threadBrowserState?.tabs]);

  const syncPanelBounds = useCallback(
    (options: { force?: boolean } = {}) => {
      if (!api) {
        return;
      }
      const element = browserViewportRef.current;
      if (!element) {
        return;
      }
      const rect = element.getBoundingClientRect();
      const bounds =
        rect.width > 0 && rect.height > 0
          ? {
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height,
            }
          : null;
      const nextKey = bounds
        ? `${Math.round(bounds.x)}:${Math.round(bounds.y)}:${Math.round(bounds.width)}:${Math.round(bounds.height)}`
        : "hidden";
      if (!options.force && lastSentBoundsRef.current === nextKey) {
        return;
      }
      lastSentBoundsRef.current = nextKey;
      void runBrowserAction(() => api.browser.setPanelBounds({ threadId, bounds }));
    },
    [api, runBrowserAction, threadId],
  );

  const schedulePanelBoundsSync = useCallback(
    (frames = 2) => {
      let remaining = Math.max(1, frames);
      const tick = () => {
        syncPanelBounds({ force: remaining === Math.max(1, frames) });
        remaining -= 1;
        if (remaining > 0) {
          window.requestAnimationFrame(tick);
        }
      };
      window.requestAnimationFrame(tick);
    },
    [syncPanelBounds],
  );

  useLayoutEffect(() => {
    if (!api) {
      return;
    }

    const element = browserViewportRef.current;
    if (!element) {
      return;
    }

    // The right panel opens with an off-canvas slide animation, so the viewport's
    // x/y position changes for a few frames without triggering ResizeObserver.
    const syncBoundsBurst = (frames = 18) => {
      if (boundsBurstFrameRef.current !== null) {
        cancelAnimationFrame(boundsBurstFrameRef.current);
      }

      let framesRemaining = frames;
      const tick = () => {
        syncPanelBounds();
        framesRemaining -= 1;
        if (framesRemaining > 0) {
          boundsBurstFrameRef.current = window.requestAnimationFrame(tick);
          return;
        }
        boundsBurstFrameRef.current = null;
      };

      boundsBurstFrameRef.current = window.requestAnimationFrame(tick);
    };

    const scheduleSyncBounds = () => {
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
      }
      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        syncPanelBounds();
      });
    };

    const transitionTargets = [
      element.closest<HTMLElement>("[data-slot='sidebar-container']"),
      element.closest<HTMLElement>("[data-slot='sheet-popup']"),
    ].filter((target): target is HTMLElement => target !== null);
    const handleTransitionBounds = () => {
      scheduleSyncBounds();
      syncBoundsBurst();
    };

    scheduleSyncBounds();
    syncBoundsBurst();
    const observer = new ResizeObserver(() => {
      scheduleSyncBounds();
    });
    observer.observe(element);
    window.addEventListener("resize", scheduleSyncBounds);
    for (const target of transitionTargets) {
      target.addEventListener("transitionrun", handleTransitionBounds);
      target.addEventListener("transitionend", handleTransitionBounds);
      target.addEventListener("transitioncancel", handleTransitionBounds);
    }

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleSyncBounds);
      for (const target of transitionTargets) {
        target.removeEventListener("transitionrun", handleTransitionBounds);
        target.removeEventListener("transitionend", handleTransitionBounds);
        target.removeEventListener("transitioncancel", handleTransitionBounds);
      }
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      if (boundsBurstFrameRef.current !== null) {
        cancelAnimationFrame(boundsBurstFrameRef.current);
        boundsBurstFrameRef.current = null;
      }
      void api.browser.hide({ threadId });
    };
  }, [api, syncPanelBounds, threadId]);

  const onSubmitAddress = useCallback(() => {
    if (!api || !activeTab) {
      return;
    }
    isAddressEditingRef.current = false;
    setIsAddressFocused(false);
    const normalizedAddress = normalizeBrowserAddressInput(addressValue);
    addressDraftsByTabIdRef.current.set(activeTab.id, normalizedAddress);
    setAddressValue(normalizedAddress);
    if (!usesNativeBrowserSurface) {
      void api.browser
        .navigate({ threadId, tabId: activeTab.id, url: normalizedAddress })
        .then((state) => {
          upsertThreadState(state);
          schedulePanelBoundsSync();
        });
      void openFallbackAutomationUrl(normalizedAddress);
      return;
    }
    void runBrowserAction(() =>
      api.browser.navigate({ threadId, tabId: activeTab.id, url: normalizedAddress }),
    ).then((state) => {
      if (state) {
        upsertThreadState(state);
      }
      schedulePanelBoundsSync();
    });
  }, [
    activeTab,
    addressValue,
    api,
    openFallbackAutomationUrl,
    runBrowserAction,
    schedulePanelBoundsSync,
    threadId,
    upsertThreadState,
    usesNativeBrowserSurface,
  ]);

  const onChooseSuggestion = useCallback(
    (suggestion: BrowserAddressSuggestion) => {
      if (!api) {
        return;
      }

      isAddressEditingRef.current = false;
      setIsAddressFocused(false);
      setAddressValue(suggestion.url);

      const tabId = suggestion.tabId;
      if (suggestion.kind === "tab" && typeof tabId === "string") {
        void runBrowserAction(() => api.browser.selectTab({ threadId, tabId })).then((state) => {
          if (state) {
            upsertThreadState(state);
          }
          window.requestAnimationFrame(() => {
            addressInputRef.current?.focus();
            addressInputRef.current?.select();
          });
        });
        return;
      }

      if (activeTab) {
        addressDraftsByTabIdRef.current.set(activeTab.id, suggestion.url);
      }

      if (!usesNativeBrowserSurface && activeTab) {
        void api.browser
          .navigate({
            threadId,
            url: suggestion.url,
            tabId: activeTab.id,
          })
          .then((state) => {
            upsertThreadState(state);
            schedulePanelBoundsSync();
          });
        void openFallbackAutomationUrl(suggestion.url);
        return;
      }

      void runBrowserAction(() =>
        api.browser.navigate({
          threadId,
          url: suggestion.url,
          ...(activeTab ? { tabId: activeTab.id } : {}),
        }),
      ).then((state) => {
        if (state) {
          upsertThreadState(state);
        }
        schedulePanelBoundsSync();
      });
    },
    [
      activeTab,
      api,
      openFallbackAutomationUrl,
      runBrowserAction,
      schedulePanelBoundsSync,
      threadId,
      upsertThreadState,
      usesNativeBrowserSurface,
    ],
  );

  const onCreateTab = useCallback(() => {
    if (!api) {
      return;
    }
    void runBrowserAction(() => api.browser.newTab({ threadId, activate: true })).then((state) => {
      if (state) {
        upsertThreadState(state);
      }
      window.requestAnimationFrame(() => {
        addressInputRef.current?.focus();
        addressInputRef.current?.select();
      });
    });
  }, [api, runBrowserAction, threadId, upsertThreadState]);

  const onCloseTab = useCallback(
    (tabId: string) => {
      if (!api) {
        return;
      }
      void runBrowserAction(() => api.browser.closeTab({ threadId, tabId })).then((state) => {
        if (!state) {
          return;
        }
        upsertThreadState(state);
        if (!state.open && state.tabs.length === 0) {
          onClosePanel();
        }
      });
    },
    [api, onClosePanel, runBrowserAction, threadId, upsertThreadState],
  );

  const onFallbackAutomationImageClick = useCallback(
    (event: ReactMouseEvent<HTMLImageElement>) => {
      const observation = fallbackAutomationSession?.observation;
      if (!observation) {
        return;
      }
      flushFallbackTypeBuffer();
      const image = event.currentTarget;
      const rect = image.getBoundingClientRect();
      const naturalWidth = image.naturalWidth || rect.width;
      const naturalHeight = image.naturalHeight || rect.height;
      const naturalRatio = naturalWidth / naturalHeight;
      const elementRatio = rect.width / rect.height;
      let contentWidth = rect.width;
      let contentHeight = rect.height;
      let offsetX = 0;
      let offsetY = 0;
      if (elementRatio > naturalRatio) {
        contentWidth = rect.height * naturalRatio;
        offsetX = (rect.width - contentWidth) / 2;
      } else {
        contentHeight = rect.width / naturalRatio;
        offsetY = (rect.height - contentHeight) / 2;
      }

      const localX = event.clientX - rect.left - offsetX;
      const localY = event.clientY - rect.top - offsetY;
      if (localX < 0 || localY < 0 || localX > contentWidth || localY > contentHeight) {
        return;
      }

      const viewportWidth = observation.pageMetrics?.viewportWidth ?? 1440;
      const viewportHeight = observation.pageMetrics?.viewportHeight ?? 900;
      const viewportX = (localX / contentWidth) * viewportWidth;
      const viewportY = (localY / contentHeight) * viewportHeight;
      const roundedX = Math.round(viewportX);
      const roundedY = Math.round(viewportY);
      const target = findBrowserTargetAtPoint(observation.targets, roundedX, roundedY);
      if (annotationMode) {
        const targetLabel = target?.label || target?.text;
        beginAnnotationAtPoint({
          x: Math.min(1, Math.max(0, viewportX / viewportWidth)),
          y: Math.min(1, Math.max(0, viewportY / viewportHeight)),
          ...(target ? { targetId: target.id } : {}),
          ...(targetLabel ? { targetLabel } : {}),
          ...(target
            ? {
                targetElement: {
                  id: target.id,
                  tagName: target.tagName,
                  role: target.role,
                  ...(targetLabel ? { name: targetLabel } : {}),
                  ...(target.text ? { text: target.text } : {}),
                  visible: true,
                  enabled: !target.disabled,
                  box: {
                    x: target.x,
                    y: target.y,
                    width: target.width,
                    height: target.height,
                    coordinateSpace: "css-pixels",
                  },
                },
              }
            : {}),
        });
        return;
      }
      fallbackAutomationViewportRef.current?.focus();
      void runFallbackAutomationAction(
        target
          ? {
              kind: "clickTargetOrAt",
              targetId: target.id,
              x: roundedX,
              y: roundedY,
            }
          : { kind: "clickAt", x: roundedX, y: roundedY },
        "Clicked page",
      );
    },
    [
      annotationMode,
      beginAnnotationAtPoint,
      fallbackAutomationSession?.observation,
      flushFallbackTypeBuffer,
      runFallbackAutomationAction,
    ],
  );

  const onFallbackAutomationKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!fallbackAutomationSession || event.metaKey || event.ctrlKey) {
        return;
      }

      if (event.key.length === 1) {
        event.preventDefault();
        queueFallbackTypedText(event.key);
        return;
      }

      const supportedKeys = new Set([
        "Enter",
        "Backspace",
        "Delete",
        "Tab",
        "Escape",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
        "PageUp",
        "PageDown",
      ]);
      if (!supportedKeys.has(event.key)) {
        return;
      }
      event.preventDefault();
      flushFallbackTypeBuffer();
      void runFallbackAutomationAction({ kind: "press", key: event.key }, "Pressed key");
    },
    [
      fallbackAutomationSession,
      flushFallbackTypeBuffer,
      queueFallbackTypedText,
      runFallbackAutomationAction,
    ],
  );

  const onFallbackAutomationWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      if (!fallbackAutomationSession) {
        return;
      }
      event.preventDefault();
      flushFallbackTypeBuffer();
      const amount = Math.min(1200, Math.max(240, Math.round(Math.abs(event.deltaY) * 2)));
      void runFallbackAutomationAction(
        {
          kind: "scroll",
          direction: event.deltaY >= 0 ? "down" : "up",
          amount,
        },
        "Scrolled page",
      );
    },
    [fallbackAutomationSession, flushFallbackTypeBuffer, runFallbackAutomationAction],
  );

  const onFallbackAutomationPaste = useCallback(
    (event: ReactClipboardEvent<HTMLDivElement>) => {
      if (!fallbackAutomationSession) {
        return;
      }
      const text = event.clipboardData.getData("text");
      if (text.length === 0) {
        return;
      }
      event.preventDefault();
      queueFallbackTypedText(text, "Pasted into page");
    },
    [fallbackAutomationSession, queueFallbackTypedText],
  );

  const header = (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div className="relative flex min-w-0 flex-1 items-center gap-2">
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-7 shrink-0"
            disabled={!activeTab?.canGoBack}
            onClick={() => {
              if (!api || !activeTab) return;
              void runBrowserAction(() =>
                api.browser.goBack({ threadId, tabId: activeTab.id }),
              ).then((state) => {
                if (state) {
                  upsertThreadState(state);
                }
              });
            }}
          >
            <ArrowLeftIcon className="size-3.5" />
            <span className="sr-only">Go back</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-7 shrink-0"
            disabled={!activeTab?.canGoForward}
            onClick={() => {
              if (!api || !activeTab) return;
              void runBrowserAction(() =>
                api.browser.goForward({ threadId, tabId: activeTab.id }),
              ).then((state) => {
                if (state) {
                  upsertThreadState(state);
                }
              });
            }}
          >
            <ArrowRightIcon className="size-3.5" />
            <span className="sr-only">Go forward</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-7 shrink-0"
            disabled={!activeTab}
            onClick={() => {
              if (!api || !activeTab) return;
              if (!usesNativeBrowserSurface && fallbackAutomationSession) {
                void openFallbackAutomationUrl(fallbackAutomationSession.observation.url);
                return;
              }
              void runBrowserAction(() =>
                api.browser.reload({ threadId, tabId: activeTab.id }),
              ).then((state) => {
                if (state) {
                  upsertThreadState(state);
                }
              });
            }}
          >
            {loading ? (
              <LoaderCircleIcon className="size-3.5 animate-spin" />
            ) : (
              <RefreshCwIcon className="size-3.5" />
            )}
            <span className="sr-only">Reload</span>
          </Button>
        </div>
        <form
          className="min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmitAddress();
          }}
        >
          <Input
            ref={addressInputRef}
            value={addressValue}
            onChange={(event) => {
              const nextValue = event.target.value;
              isAddressEditingRef.current = true;
              setAddressValue(nextValue);
              if (activeTab) {
                addressDraftsByTabIdRef.current.set(activeTab.id, nextValue);
              }
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") {
                return;
              }
              event.preventDefault();
              onSubmitAddress();
            }}
            onFocus={() => {
              isAddressEditingRef.current = true;
            }}
            onBlur={() => {
              isAddressEditingRef.current = false;
              setIsAddressFocused(false);
            }}
            placeholder="Search or enter a URL"
            className="font-mono h-8 min-w-0 bg-background/70 text-xs tracking-tight"
          />
        </form>
        {browserSurfaceModeLabel ? (
          <span className="hidden max-w-40 shrink-0 truncate rounded-md border border-border/70 bg-background/70 px-2 py-1 text-[11px] text-muted-foreground md:inline">
            {browserSurfaceModeLabel}
          </span>
        ) : null}
        {activeElectronBrowserSessionId ? (
          <div className="hidden shrink-0 items-center gap-1 md:flex">
            <span className="max-w-36 truncate rounded-md border border-border/70 bg-background/70 px-2 py-1 text-[11px] text-muted-foreground">
              {controlStatusLabel}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-7 shrink-0"
              disabled={controlBusy || !controlSessionIdIsServerKnown}
              onClick={() =>
                void runControlAction(() => {
                  const request = browserPanelHumanInputRequest({
                    browserSessionId: activeElectronBrowserSessionId,
                    kind: "manual",
                    url: activeBrowserUrl,
                  });
                  if (!request) return Promise.resolve(null);
                  return api!.browser.control.humanInput(request);
                })
              }
              title="Take browser control"
            >
              <LockIcon className="size-3.5" />
              <span className="sr-only">Take control</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-7 shrink-0"
              disabled={controlBusy || !controlSessionIdIsServerKnown || !controlLease}
              onClick={() => {
                if (!controlLease) return;
                void runControlAction(() => {
                  const request = browserPanelControlRequest({
                    browserSessionId: activeElectronBrowserSessionId,
                    action: "release",
                    leaseId: controlLease.id,
                    snapshotAfterReleaseRef: displayedEvidenceRef,
                  });
                  if (!request || request.action !== "release") return Promise.resolve(null);
                  return api!.browser.control.release(request.input);
                });
              }}
              title="Release browser control"
            >
              <LockOpenIcon className="size-3.5" />
              <span className="sr-only">Release control</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-7 shrink-0"
              disabled={controlBusy || !controlSessionIdIsServerKnown}
              onClick={() =>
                void runControlAction(() => {
                  const request = browserPanelControlRequest({
                    browserSessionId: activeElectronBrowserSessionId,
                    action: "pauseAgent",
                  });
                  if (!request || request.action !== "pauseAgent") return Promise.resolve(null);
                  return api!.browser.control.pauseAgent(request.input);
                })
              }
              title="Pause agent"
            >
              <LockIcon className="size-3.5" />
              <span className="sr-only">Pause agent</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-7 shrink-0"
              disabled={controlBusy || !controlSessionIdIsServerKnown}
              onClick={() =>
                void runControlAction(() => {
                  const request = browserPanelControlRequest({
                    browserSessionId: activeElectronBrowserSessionId,
                    action: "resumeAgent",
                  });
                  if (!request || request.action !== "resumeAgent") return Promise.resolve(null);
                  return api!.browser.control.resumeAgent(request.input);
                })
              }
              title="Resume agent"
            >
              <PlayIcon className="size-3.5" />
              <span className="sr-only">Resume agent</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-7 shrink-0"
              disabled={controlBusy || !controlSessionIdIsServerKnown}
              onClick={() => {
                void runControlAction(() => {
                  const request = browserPanelControlRequest({
                    browserSessionId: activeElectronBrowserSessionId,
                    action: "observeFresh",
                  });
                  if (!request || request.action !== "observeFresh") return Promise.resolve(null);
                  return api!.browser.control.observeFresh(request.input);
                });
              }}
              title="Refresh observation"
            >
              <RefreshCwIcon className="size-3.5" />
              <span className="sr-only">Refresh observation</span>
            </Button>
          </div>
        ) : null}
        {activeElectronBrowserSessionId && approvalRequests.length > 0 ? (
          <div className="absolute right-2 top-[calc(100%+6px)] z-30 w-80 rounded-md border border-border bg-popover p-3 text-xs shadow-lg">
            <BrowserPanelApprovalList
              approvals={approvalRequests}
              approvalBusyId={approvalBusyId}
              onRespond={(approvalId, decision) => void respondToApproval(approvalId, decision)}
            />
          </div>
        ) : null}
        {showBrowserAddressSuggestions ? (
          <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
            <div className="max-h-64 overflow-auto p-1">
              {browserAddressSuggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onChooseSuggestion(suggestion);
                  }}
                >
                  <span className="flex size-4 shrink-0 items-center justify-center rounded-sm bg-background/80">
                    {suggestion.kind === "navigate" ? (
                      <ExternalLinkIcon className="size-3 text-muted-foreground" />
                    ) : suggestion.faviconUrl ? (
                      <img alt="" src={suggestion.faviconUrl} className="size-3 rounded-[2px]" />
                    ) : (
                      <GlobeIcon className="size-3 text-muted-foreground" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{suggestion.title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {suggestion.detail}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-7"
          onClick={onCreateTab}
        >
          <PlusIcon className="size-3.5" />
          <span className="sr-only">New tab</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-7"
          disabled={!activeTab}
          onClick={() => {
            if (!api || !activeTab) return;
            void api.shell.openExternal(activeTab.url);
          }}
        >
          <ExternalLinkIcon className="size-3.5" />
          <span className="sr-only">Open in external browser</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-7"
          onClick={onClosePanel}
        >
          <XIcon className="size-3.5" />
          <span className="sr-only">Close browser panel</span>
        </Button>
      </div>
    </div>
  );

  if (!api) {
    return (
      <DiffPanelShell mode={mode} header={header}>
        <DiffPanelLoadingState label="Browser is unavailable." />
      </DiffPanelShell>
    );
  }

  return (
    <DiffPanelShell mode={mode} header={header}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-2 py-1.5">
          {threadBrowserState?.tabs.map((tab) => {
            const isActive = tab.id === activeTab?.id;
            return (
              <div
                key={tab.id}
                className={cn(
                  "group flex h-8 min-w-0 max-w-[14rem] items-center rounded-md border px-2 text-left text-xs transition-colors",
                  isActive
                    ? "border-border bg-card text-foreground shadow-sm"
                    : "border-transparent bg-background/40 text-muted-foreground hover:bg-card/60",
                  tab.status === "suspended" ? "opacity-75" : "",
                )}
              >
                <span className="mr-2 flex size-4 shrink-0 items-center justify-center rounded-sm bg-background/80">
                  {tab.faviconUrl ? (
                    <img alt="" src={tab.faviconUrl} className="size-3 rounded-[2px]" />
                  ) : (
                    <GlobeIcon className="size-3 text-muted-foreground" />
                  )}
                </span>
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left"
                  onClick={() => {
                    void runBrowserAction(() =>
                      api.browser.selectTab({ threadId, tabId: tab.id }),
                    ).then((state) => {
                      if (state) {
                        upsertThreadState(state);
                      }
                    });
                  }}
                >
                  {tab.title || "Untitled"}
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className={closeButtonClassName(isActive)}
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                >
                  <XIcon className="size-3" />
                  <span className="sr-only">Close tab</span>
                </Button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground">
          <div className="min-w-0 flex-1 truncate">
            {localError ? (
              <span className="text-destructive">{localError}</span>
            ) : threadBrowserState?.lastError ? (
              <span className="text-destructive">{threadBrowserState.lastError}</span>
            ) : activeTabStatus === "suspended" ? (
              "Restoring tab..."
            ) : activeTab ? (
              activeTabDisplayUrl || "New tab"
            ) : workspaceReady ? (
              "No tabs open"
            ) : (
              "Starting browser..."
            )}
          </div>
          {workspaceReady && activeBrowserUrl ? (
            <Button
              type="button"
              variant={annotationMode ? "secondary" : "ghost"}
              size="sm"
              className="h-7 gap-1.5 px-2 text-[11px]"
              onClick={() => {
                setAnnotationDraft(null);
                setAnnotationComment("");
                setAnnotationMode((current) => !current);
              }}
              title="Annotate browser for orchestrator"
            >
              <SquarePenIcon className="size-3.5" />
              Annotate
              {browserAnnotations.length > 0 ? (
                <span className="ml-0.5 rounded-full bg-primary/12 px-1.5 text-[10px] text-primary">
                  {browserAnnotations.length}
                </span>
              ) : null}
            </Button>
          ) : null}
        </div>
        <div ref={browserPanelFrameRef} className="relative min-h-0 flex-1 bg-background">
          {!workspaceReady ? (
            <div className="absolute inset-0 z-10">
              <DiffPanelLoadingState label="Starting browser..." />
            </div>
          ) : null}
          {usesNativeBrowserSurface ? (
            <div
              ref={browserViewportRef}
              className="absolute inset-0"
              onPointerDown={reportPointerHumanInput}
            >
              {browserSurfaceModeLabel ? (
                <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[calc(100%-1.5rem)] rounded-md border border-border/70 bg-background/90 px-2 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
                  {browserSurfaceModeLabel}
                </div>
              ) : null}
            </div>
          ) : fallbackAutomationScreenshotDataUrl ? (
            <div
              ref={fallbackAutomationViewportRef}
              className="absolute inset-0 flex flex-col bg-black"
              data-browser-automation-viewport
              tabIndex={0}
              onKeyDown={onFallbackAutomationKeyDown}
              onPaste={onFallbackAutomationPaste}
              onWheel={onFallbackAutomationWheel}
            >
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
                <img
                  alt="Live browser view"
                  src={fallbackAutomationScreenshotDataUrl}
                  className="h-full w-full cursor-pointer object-contain object-top"
                  onClick={onFallbackAutomationImageClick}
                />
              </div>
              <div className="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] rounded-md border border-border/70 bg-background/90 px-2 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
                {browserSurfaceModeLabel}
                {displayedFallbackAutomationObservation &&
                fallbackAutomationSession?.lastActionSummary
                  ? ` · ${fallbackAutomationSession.lastActionSummary}`
                  : ""}
                {evidenceStatusLabel ? ` · ${evidenceStatusLabel}` : ""}
                {fallbackAutomationBusy ? " · updating" : ""}
              </div>
            </div>
          ) : fallbackScreenshotSession && fallbackStaticScreenshotDataUrl ? (
            <div className="absolute inset-0 flex flex-col bg-black">
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
                <img
                  alt="Captured browser view"
                  src={fallbackStaticScreenshotDataUrl}
                  className="h-full w-full object-contain object-top"
                />
              </div>
              <div className="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] rounded-md border border-border/70 bg-background/90 px-2 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
                {browserSurfaceModeLabel}
                {fallbackScreenshotSession.lastActionSummary
                  ? ` · ${fallbackScreenshotSession.lastActionSummary}`
                  : ""}
                {evidenceStatusLabel ? ` · ${evidenceStatusLabel}` : ""}
              </div>
            </div>
          ) : fallbackFrameUrl ? (
            <div className="absolute inset-0 z-10">
              <DiffPanelLoadingState label="Loading browser preview..." />
            </div>
          ) : workspaceReady ? (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
              Enter a URL to open a browser preview.
            </div>
          ) : null}
          {visibleBrowserAnnotations.map((annotation) => (
            <div
              key={annotation.id}
              className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full"
              style={{ left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%` }}
            >
              <div className="max-w-56 rounded-md border border-primary/40 bg-background/95 px-2 py-1.5 text-[11px] text-foreground shadow-lg backdrop-blur">
                <div className="mb-1 font-medium text-primary">User note</div>
                <div className="line-clamp-3">{annotation.comment}</div>
              </div>
              <div className="mx-auto h-3 w-px bg-primary/70" />
              <div className="mx-auto size-3 rounded-full border-2 border-background bg-primary shadow" />
            </div>
          ))}
          {annotationMode ? (
            <div
              className="absolute inset-0 z-30 cursor-crosshair bg-primary/5"
              onMouseDown={onBrowserAnnotationPointerDown}
              onMouseMove={onBrowserAnnotationPointerMove}
              onMouseUp={onBrowserAnnotationPointerUp}
            >
              {!annotationDraft ? (
                <div className="absolute left-3 top-3 rounded-md border border-primary/30 bg-background/95 px-3 py-2 text-xs text-foreground shadow-lg">
                  Click the page to leave precise feedback for the orchestrator.
                </div>
              ) : (
                <>
                  {annotationDraft.kind === "rect" ? (
                    <div
                      className="pointer-events-none absolute rounded border border-primary bg-primary/10"
                      style={{
                        left: `${annotationDraft.x * 100}%`,
                        top: `${annotationDraft.y * 100}%`,
                        width: `${(annotationDraft.width ?? 0) * 100}%`,
                        height: `${(annotationDraft.height ?? 0) * 100}%`,
                      }}
                    />
                  ) : null}
                  <div
                    className="absolute w-72 max-w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-md border border-border bg-background p-2 shadow-xl"
                    style={{
                      left: `${annotationDraft.x * 100}%`,
                      top: `min(calc(${annotationDraft.y * 100}% + ${(annotationDraft.height ?? 0) * 100}% + 14px), calc(100% - 9rem))`,
                    }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="mb-2 text-xs font-medium text-foreground">
                      Browser annotation
                    </div>
                    {annotationDraft.targetLabel ? (
                      <div className="mb-2 truncate rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                        Target: {annotationDraft.targetLabel}
                      </div>
                    ) : annotationDraft.kind === "rect" ? (
                      <div className="mb-2 truncate rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                        Region comment
                      </div>
                    ) : null}
                    <textarea
                      value={annotationComment}
                      onChange={(event) => setAnnotationComment(event.target.value)}
                      className="min-h-20 w-full resize-none rounded border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
                      placeholder="Tell the orchestrator what to inspect or change here..."
                      autoFocus
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setAnnotationDraft(null);
                          setAnnotationComment("");
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={annotationComment.trim().length === 0}
                        onClick={() => void submitBrowserAnnotation()}
                      >
                        Send note
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </DiffPanelShell>
  );
}

export default BrowserPanel;
