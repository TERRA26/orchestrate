// FILE: _chat.$threadId.tsx
// Purpose: Resolves the active thread route into either a single chat surface or a persisted split view.
// Layer: Route container
// Depends on: ChatView, splitViewStore, and pane-scoped browser/diff panels

import {
  type ProjectId,
  ThreadId,
  type ThreadId as ThreadIdType,
  type TurnId,
} from "@orchestrate/contracts";
import { createFileRoute, retainSearchParams, useNavigate } from "@tanstack/react-router";
import {
  Fragment,
  Suspense,
  lazy,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Schema } from "effect";
import { TbExchange } from "react-icons/tb";

import ChatView from "../components/ChatView";
import BrowserPanel from "../components/BrowserPanel";
import { ClaudeAI, OpenAI } from "../components/Icons";
import { DiffWorkerPoolProvider } from "../components/DiffWorkerPoolProvider";
import { OrchestratorPanel } from "../components/OrchestratorPanel";
import {
  shouldAutoFocusOrchestratorBrowserPane,
  shouldRenderOrchestratorBrowserPane,
  useOrchestratorPaneStore,
} from "../lib/orchestratorPaneStore";
import {
  DiffPanelHeaderSkeleton,
  DiffPanelLoadingState,
  DiffPanelShell,
  type DiffPanelMode,
} from "../components/DiffPanelShell";
import { useComposerDraftStore } from "../composerDraftStore";
import {
  type ChatRightPanel,
  type DiffRouteSearch,
  parseDiffRouteSearch,
  stripDiffSearchParams,
} from "../diffRouteSearch";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { resolveActiveSplitView, isSplitRoute } from "../splitViewRoute";
import { classifyCrossProjectNavigation, filterThreadsForProject } from "../splitViewProjectGuard";
import {
  resolveSplitViewFocusedThreadId,
  selectSplitView,
  type SplitView,
  type SplitViewId,
  type SplitViewPane,
  type SplitViewPanePanelState,
  useSplitViewStore,
} from "../splitViewStore";
import { useStore } from "../store";
import { selectThreadTerminalState, useTerminalStateStore } from "../terminalStateStore";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../components/ui/dialog";
import { Sheet, SheetPopup } from "../components/ui/sheet";
import { getLocalStorageItem, setLocalStorageItem } from "~/hooks/useLocalStorage";
import { cn } from "~/lib/utils";
import { Sidebar, SidebarInset, SidebarProvider, SidebarRail } from "~/components/ui/sidebar";
import { onBrowserOpenRequested } from "../wsNativeApi";
import { readNativeApi } from "../nativeApi";
import { ChatThreadLoadingShell } from "../components/ChatThreadLoadingShell";

const DiffPanel = lazy(() => import("../components/DiffPanel"));
const DIFF_INLINE_LAYOUT_MEDIA_QUERY = "(max-width: 1180px)";
const DIFF_INLINE_DEFAULT_WIDTH = "clamp(28rem,48vw,44rem)";
const SPLIT_PANE_PANEL_DEFAULT_WIDTH_PX = 22 * 16;
const SPLIT_PANE_CHAT_MIN_WIDTH = 20 * 16;
const SINGLE_PANEL_MIN_WIDTH = 26 * 16;
const COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX = 208;
const RIGHT_PANEL_SIDEBAR_WIDTH_STORAGE_KEY = "chat_right_panel_width";

const RightPanelSheet = (props: {
  children: ReactNode;
  panelOpen: boolean;
  onClosePanel: () => void;
}) => {
  return (
    <Sheet
      open={props.panelOpen}
      onOpenChange={(open) => {
        if (!open) {
          props.onClosePanel();
        }
      }}
    >
      <SheetPopup
        side="right"
        showCloseButton={false}
        keepMounted
        className="w-[min(88vw,820px)] max-w-[820px] p-0"
      >
        {props.children}
      </SheetPopup>
    </Sheet>
  );
};

const DiffLoadingFallback = (props: { mode: DiffPanelMode }) => {
  return (
    <DiffPanelShell mode={props.mode} header={<DiffPanelHeaderSkeleton />}>
      <DiffPanelLoadingState label="Loading diff viewer..." />
    </DiffPanelShell>
  );
};

const LazyDiffPanel = (props: {
  mode: DiffPanelMode;
  threadId?: ThreadIdType | null;
  panelState?: Pick<SplitViewPanePanelState, "panel" | "diffTurnId" | "diffFilePath">;
  onUpdatePanelState?: (
    patch: Partial<Pick<SplitViewPanePanelState, "panel" | "diffTurnId" | "diffFilePath">>,
  ) => void;
}) => {
  return (
    <DiffWorkerPoolProvider>
      <Suspense fallback={<DiffLoadingFallback mode={props.mode} />}>
        <DiffPanel
          mode={props.mode}
          {...(props.threadId !== undefined ? { threadId: props.threadId } : {})}
          {...(props.panelState ? { panelState: props.panelState } : {})}
          {...(props.onUpdatePanelState ? { onUpdatePanelState: props.onUpdatePanelState } : {})}
        />
      </Suspense>
    </DiffWorkerPoolProvider>
  );
};

function canComposerHandlePanelWidth(input: {
  nextWidth: number;
  paneScopeId?: string;
  applyWidth: (width: number) => void;
  resetWidth: () => void;
}) {
  const scopeSelector = input.paneScopeId
    ? `[data-chat-composer-form='true'][data-chat-pane-scope='${input.paneScopeId}']`
    : "[data-chat-composer-form='true']";
  const composerForm = document.querySelector<HTMLElement>(scopeSelector);
  if (!composerForm) return true;

  const composerViewport = composerForm.parentElement;
  if (!composerViewport) return true;

  input.applyWidth(input.nextWidth);

  const viewportStyle = window.getComputedStyle(composerViewport);
  const viewportPaddingLeft = Number.parseFloat(viewportStyle.paddingLeft) || 0;
  const viewportPaddingRight = Number.parseFloat(viewportStyle.paddingRight) || 0;
  const viewportContentWidth = Math.max(
    0,
    composerViewport.clientWidth - viewportPaddingLeft - viewportPaddingRight,
  );
  const formRect = composerForm.getBoundingClientRect();
  const composerFooter = composerForm.querySelector<HTMLElement>(
    "[data-chat-composer-footer='true']",
  );
  const composerRightActions = composerForm.querySelector<HTMLElement>(
    "[data-chat-composer-actions='right']",
  );
  const composerRightActionsWidth = composerRightActions?.getBoundingClientRect().width ?? 0;
  const composerFooterGap = composerFooter
    ? Number.parseFloat(window.getComputedStyle(composerFooter).columnGap) ||
      Number.parseFloat(window.getComputedStyle(composerFooter).gap) ||
      0
    : 0;
  const minimumComposerWidth =
    COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX + composerRightActionsWidth + composerFooterGap;
  const hasComposerOverflow = composerForm.scrollWidth > composerForm.clientWidth + 0.5;
  const overflowsViewport = formRect.width > viewportContentWidth + 0.5;
  const violatesMinimumComposerWidth = composerForm.clientWidth + 0.5 < minimumComposerWidth;

  input.resetWidth();

  return !hasComposerOverflow && !overflowsViewport && !violatesMinimumComposerWidth;
}

const PanePanelInlineSidebar = (props: {
  panelOpen: boolean;
  onClosePanel: () => void;
  onOpenPanel: () => void;
  renderPanelContent: boolean;
  panel: ChatRightPanel | null | undefined;
  threadId: ThreadIdType | null;
  paneScopeId?: string;
  panelState?: Pick<SplitViewPanePanelState, "panel" | "diffTurnId" | "diffFilePath">;
  onUpdatePanelState?: (
    patch: Partial<Pick<SplitViewPanePanelState, "panel" | "diffTurnId" | "diffFilePath">>,
  ) => void;
}) => {
  const {
    panelOpen,
    onClosePanel,
    onOpenPanel,
    renderPanelContent,
    panel,
    threadId,
    paneScopeId,
    panelState,
    onUpdatePanelState,
  } = props;
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        onOpenPanel();
        return;
      }
      onClosePanel();
    },
    [onClosePanel, onOpenPanel],
  );
  const shouldAcceptInlineSidebarWidth = useCallback(
    ({ nextWidth, wrapper }: { nextWidth: number; wrapper: HTMLElement }) => {
      const previousSidebarWidth = wrapper.style.getPropertyValue("--sidebar-width");
      return canComposerHandlePanelWidth({
        nextWidth,
        applyWidth: (width) => {
          wrapper.style.setProperty("--sidebar-width", `${width}px`);
        },
        resetWidth: () => {
          if (previousSidebarWidth.length > 0) {
            wrapper.style.setProperty("--sidebar-width", previousSidebarWidth);
          } else {
            wrapper.style.removeProperty("--sidebar-width");
          }
        },
        ...(paneScopeId ? { paneScopeId } : {}),
      });
    },
    [paneScopeId],
  );

  return (
    <SidebarProvider
      defaultOpen={false}
      open={panelOpen}
      onOpenChange={onOpenChange}
      className="w-auto min-h-0 flex-none bg-transparent"
      style={{ "--sidebar-width": DIFF_INLINE_DEFAULT_WIDTH } as CSSProperties}
    >
      <Sidebar
        side="right"
        collapsible="offcanvas"
        className="border-l border-border/50 bg-card text-foreground"
        resizable={{
          minWidth: SINGLE_PANEL_MIN_WIDTH,
          shouldAcceptWidth: shouldAcceptInlineSidebarWidth,
          storageKey: RIGHT_PANEL_SIDEBAR_WIDTH_STORAGE_KEY,
        }}
      >
        {renderPanelContent && threadId ? (
          panel === "browser" ? (
            <BrowserPanel mode="sidebar" threadId={threadId} onClosePanel={onClosePanel} />
          ) : (
            <LazyDiffPanel
              mode="sidebar"
              threadId={threadId}
              {...(panelState ? { panelState } : {})}
              {...(onUpdatePanelState ? { onUpdatePanelState } : {})}
            />
          )
        ) : null}
        <SidebarRail />
      </Sidebar>
    </SidebarProvider>
  );
};

// Split panes cannot reuse the desktop Sidebar primitive because it positions the panel
// against the viewport. This embedded shell keeps browser/diff content anchored to the pane.
function SplitPaneEmbeddedPanel(props: {
  splitViewId: SplitViewId;
  pane: SplitViewPane;
  paneScopeId: string;
  panelOpen: boolean;
  panel: ChatRightPanel | null | undefined;
  threadId: ThreadIdType | null;
  onClosePanel: () => void;
  panelState: Pick<SplitViewPanePanelState, "panel" | "diffTurnId" | "diffFilePath">;
  onUpdatePanelState: (
    patch: Partial<Pick<SplitViewPanePanelState, "panel" | "diffTurnId" | "diffFilePath">>,
  ) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const storageKey = `${RIGHT_PANEL_SIDEBAR_WIDTH_STORAGE_KEY}:${props.splitViewId}:${props.pane}`;
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    return getLocalStorageItem(storageKey, Schema.Finite) ?? SPLIT_PANE_PANEL_DEFAULT_WIDTH_PX;
  });

  useEffect(() => {
    setPanelWidth(
      getLocalStorageItem(storageKey, Schema.Finite) ?? SPLIT_PANE_PANEL_DEFAULT_WIDTH_PX,
    );
  }, [storageKey]);

  const shouldAcceptEmbeddedWidth = useCallback(
    (nextWidth: number) => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return true;
      return canComposerHandlePanelWidth({
        nextWidth,
        paneScopeId: props.paneScopeId,
        applyWidth: (width) => {
          wrapper.style.width = `${width}px`;
        },
        resetWidth: () => {
          wrapper.style.width = `${panelWidth}px`;
        },
      });
    },
    [panelWidth, props.paneScopeId],
  );

  const startResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const wrapper = wrapperRef.current;
      const parent = wrapper?.parentElement;
      if (!wrapper || !parent) return;

      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = panelWidth;
      const maxWidth = Math.max(
        SINGLE_PANEL_MIN_WIDTH,
        parent.clientWidth - SPLIT_PANE_CHAT_MIN_WIDTH,
      );

      const onPointerMove = (moveEvent: PointerEvent) => {
        const delta = startX - moveEvent.clientX;
        const nextWidth = Math.max(SINGLE_PANEL_MIN_WIDTH, Math.min(maxWidth, startWidth + delta));
        if (!shouldAcceptEmbeddedWidth(nextWidth)) {
          return;
        }
        setPanelWidth(nextWidth);
        setLocalStorageItem(storageKey, nextWidth, Schema.Finite);
      };

      const onPointerUp = () => {
        document.body.style.removeProperty("user-select");
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };

      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [panelWidth, shouldAcceptEmbeddedWidth, storageKey],
  );

  if (!props.panelOpen || !props.threadId) {
    return null;
  }

  return (
    <div
      ref={wrapperRef}
      className="relative flex h-full min-h-0 min-w-0 flex-none border-l border-border/50 bg-card text-foreground"
      style={{ width: `${panelWidth}px` } as CSSProperties}
    >
      <div
        className="absolute inset-y-0 left-0 z-20 w-2 -translate-x-1/2 cursor-col-resize bg-transparent before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-border/65"
        onPointerDown={startResize}
      />
      {props.panel === "browser" ? (
        <BrowserPanel mode="sidebar" threadId={props.threadId} onClosePanel={props.onClosePanel} />
      ) : (
        <LazyDiffPanel
          mode="sidebar"
          threadId={props.threadId}
          panelState={props.panelState}
          onUpdatePanelState={props.onUpdatePanelState}
        />
      )}
    </div>
  );
}

function resolveSingleProjectId(input: {
  threadProjectId: ProjectId | null;
  draftProjectId: ProjectId | null;
}): ProjectId | null {
  return input.threadProjectId ?? input.draftProjectId ?? null;
}

function normalizeSingleSearchFromPane(panelState: SplitViewPanePanelState): DiffRouteSearch {
  if (panelState.panel === "browser") {
    return { panel: "browser" };
  }
  if (panelState.panel === "diff") {
    return {
      panel: "diff",
      diff: "1",
      ...(panelState.diffTurnId ? { diffTurnId: panelState.diffTurnId } : {}),
      ...(panelState.diffTurnId && panelState.diffFilePath
        ? { diffFilePath: panelState.diffFilePath }
        : {}),
    };
  }
  return {};
}

function SplitPaneEmptyState(props: {
  isFocused: boolean;
  onFocus: () => void;
  threads: readonly {
    id: ThreadIdType;
    title: string | null;
    projectId: ProjectId;
    modelSelection: { provider: "codex" | "claudeAgent" };
  }[];
  projects: readonly { id: ProjectId; name: string }[];
  otherPaneThreadId: ThreadIdType | null;
  onSelectThread: (threadId: ThreadIdType) => void;
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col items-center bg-background px-6 pt-16",
        props.isFocused ? "ring-1 ring-inset ring-primary/25" : "",
      )}
      onMouseDown={props.onFocus}
    >
      <div className="w-full max-w-sm space-y-4">
        <p className="text-center text-sm font-medium text-foreground/70">Select a chat</p>
        <div className="max-h-[60vh] space-y-1 overflow-y-auto">
          {props.threads.map((thread) => {
            const isUsed = thread.id === props.otherPaneThreadId;
            const projectName =
              props.projects.find((p) => p.id === thread.projectId)?.name ?? "Project";
            return (
              <button
                key={thread.id}
                type="button"
                disabled={isUsed}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                  isUsed
                    ? "cursor-default border-border/30 opacity-35"
                    : "border-border/55 hover:bg-accent/40",
                )}
                onClick={() => {
                  if (!isUsed) props.onSelectThread(thread.id);
                }}
              >
                <PickerProviderGlyph
                  provider={thread.modelSelection.provider}
                  className="size-4 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {thread.title || "New chat"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{projectName}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PickerProviderGlyph(props: { provider: "codex" | "claudeAgent"; className?: string }) {
  if (props.provider === "claudeAgent") {
    return <ClaudeAI aria-hidden="true" className={cn("orch-prov-claude", props.className)} />;
  }

  return <OpenAI aria-hidden="true" className={cn("text-muted-foreground/60", props.className)} />;
}

function SplitPaneSurface(props: {
  splitView: SplitView;
  pane: SplitViewPane;
  threadId: ThreadIdType | null;
  isFocused: boolean;
  threads: readonly {
    id: ThreadIdType;
    title: string | null;
    projectId: ProjectId;
    modelSelection: { provider: "codex" | "claudeAgent" };
  }[];
  projects: readonly { id: ProjectId; name: string }[];
  onFocus: () => void;
  onToggleDiff: () => void;
  onToggleBrowser: () => void;
  onOpenTurnDiff: (turnId: TurnId, filePath?: string) => void;
  onClosePanel: () => void;
  onUpdatePanelState: (
    patch: Partial<Pick<SplitViewPanePanelState, "panel" | "diffTurnId" | "diffFilePath">>,
  ) => void;
  onMaximize: () => void;
  onChooseThread: () => void;
  onSelectThread: (threadId: ThreadIdType) => void;
}) {
  const paneScopeId = `${props.splitView.id}:${props.pane}`;
  const panelState = props.pane === "left" ? props.splitView.leftPanel : props.splitView.rightPanel;
  const panelOpen = panelState.panel !== null;
  const shouldRenderPanelContent = panelOpen || panelState.hasOpenedPanel;
  const otherPaneThreadId =
    props.pane === "left" ? props.splitView.rightThreadId : props.splitView.leftThreadId;

  return (
    <div className="group relative flex min-h-0 min-w-0 flex-1 bg-background">
      {props.threadId ? (
        <div className="pointer-events-none absolute right-3 top-[3.75rem] z-20 sm:right-5 sm:top-[4.25rem]">
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label={`Choose chat for the ${props.pane} split pane`}
            title="Choose chat"
            className={cn(
              "pointer-events-auto transition-opacity",
              !props.isFocused ? "opacity-0 group-hover:opacity-100" : "",
            )}
            onClick={(event) => {
              event.stopPropagation();
              props.onChooseThread();
            }}
          >
            <TbExchange className="size-4" />
          </Button>
        </div>
      ) : null}
      <SidebarInset
        className={cn(
          "min-h-0 min-w-0 overflow-hidden overscroll-y-none rounded-none bg-background text-foreground transition-shadow",
          props.isFocused ? "ring-1 ring-inset ring-primary/25" : "",
        )}
        onMouseDown={props.onFocus}
      >
        {props.threadId ? (
          <ChatView
            key={`${props.splitView.id}:${props.pane}:${props.threadId}`}
            threadId={props.threadId}
            paneScopeId={paneScopeId}
            surfaceMode="split"
            isFocusedPane={props.isFocused}
            panelState={panelState}
            onToggleDiffPanel={props.onToggleDiff}
            onToggleBrowserPanel={props.onToggleBrowser}
            onOpenTurnDiffPanel={props.onOpenTurnDiff}
            onMaximizeSurface={props.onMaximize}
          />
        ) : (
          <SplitPaneEmptyState
            isFocused={props.isFocused}
            onFocus={props.onFocus}
            threads={props.threads}
            projects={props.projects}
            otherPaneThreadId={otherPaneThreadId}
            onSelectThread={props.onSelectThread}
          />
        )}
      </SidebarInset>
      <SplitPaneEmbeddedPanel
        splitViewId={props.splitView.id}
        pane={props.pane}
        paneScopeId={paneScopeId}
        panelOpen={panelOpen && shouldRenderPanelContent}
        panel={panelState.panel}
        threadId={props.threadId}
        onClosePanel={props.onClosePanel}
        panelState={panelState}
        onUpdatePanelState={props.onUpdatePanelState}
      />
    </div>
  );
}

function SplitChatSurface(props: { splitViewId: SplitViewId; routeThreadId: ThreadIdType }) {
  const navigate = useNavigate();
  const threads = useStore((store) => store.threads);
  const projects = useStore((store) => store.projects);
  const splitView = useSplitViewStore(selectSplitView(props.splitViewId));
  const setFocusedPane = useSplitViewStore((store) => store.setFocusedPane);
  const setRatio = useSplitViewStore((store) => store.setRatio);
  const setPanePanelState = useSplitViewStore((store) => store.setPanePanelState);
  const replacePaneThread = useSplitViewStore((store) => store.replacePaneThread);
  const removeSplitView = useSplitViewStore((store) => store.removeSplitView);
  const rootRef = useRef<HTMLDivElement>(null);
  const [threadPickerPane, setThreadPickerPane] = useState<SplitViewPane | null>(null);
  const {
    splitView: activeSplitView,
    focusedThreadId,
    routePane,
  } = resolveActiveSplitView({
    splitView,
    routeThreadId: props.routeThreadId,
  });

  useEffect(() => {
    if (!activeSplitView) {
      void navigate({
        to: "/$threadId",
        params: { threadId: props.routeThreadId },
        replace: true,
        search: (previous) => ({ ...stripDiffSearchParams(previous), splitViewId: undefined }),
      });
      return;
    }

    if (
      activeSplitView.leftThreadId &&
      activeSplitView.rightThreadId &&
      activeSplitView.leftThreadId === activeSplitView.rightThreadId
    ) {
      replacePaneThread(activeSplitView.id, "right", null);
      setFocusedPane(activeSplitView.id, "left");
      return;
    }

    const focusedPaneThreadId =
      activeSplitView.focusedPane === "left"
        ? activeSplitView.leftThreadId
        : activeSplitView.rightThreadId;
    const normalizedFocusedThreadId = resolveSplitViewFocusedThreadId(activeSplitView);
    if (routePane && routePane !== activeSplitView.focusedPane && focusedPaneThreadId !== null) {
      setFocusedPane(activeSplitView.id, routePane);
      return;
    }

    if (normalizedFocusedThreadId && props.routeThreadId !== normalizedFocusedThreadId) {
      void navigate({
        to: "/$threadId",
        params: { threadId: normalizedFocusedThreadId },
        replace: true,
        search: (previous) => ({
          ...stripDiffSearchParams(previous),
          splitViewId: activeSplitView.id,
        }),
      });
    }
  }, [
    activeSplitView,
    navigate,
    props.routeThreadId,
    replacePaneThread,
    routePane,
    setFocusedPane,
  ]);

  const setPaneFocus = useCallback(
    (pane: SplitViewPane) => {
      if (!activeSplitView) return;
      setFocusedPane(activeSplitView.id, pane);
      const nextThreadId =
        pane === "left"
          ? (activeSplitView.leftThreadId ?? activeSplitView.rightThreadId)
          : (activeSplitView.rightThreadId ?? activeSplitView.leftThreadId);
      if (!nextThreadId || nextThreadId === props.routeThreadId) {
        return;
      }
      void navigate({
        to: "/$threadId",
        params: { threadId: nextThreadId },
        replace: true,
        search: (previous) => ({
          ...stripDiffSearchParams(previous),
          splitViewId: activeSplitView.id,
        }),
      });
    },
    [activeSplitView, navigate, props.routeThreadId, setFocusedPane],
  );

  const updatePanePanelState = useCallback(
    (
      pane: SplitViewPane,
      patch: Partial<Pick<SplitViewPanePanelState, "panel" | "diffTurnId" | "diffFilePath">>,
    ) => {
      if (!activeSplitView) return;
      const previousState =
        pane === "left" ? activeSplitView.leftPanel : activeSplitView.rightPanel;
      setPanePanelState(activeSplitView.id, pane, {
        ...patch,
        hasOpenedPanel:
          previousState.hasOpenedPanel || (patch.panel ?? previousState.panel) !== null,
        lastOpenPanel:
          patch.panel === "browser" || patch.panel === "diff"
            ? patch.panel
            : previousState.lastOpenPanel,
      });
    },
    [activeSplitView, setPanePanelState],
  );

  const togglePanePanel = useCallback(
    (pane: SplitViewPane, panel: ChatRightPanel) => {
      if (!activeSplitView) return;
      const paneThreadId =
        pane === "left" ? activeSplitView.leftThreadId : activeSplitView.rightThreadId;
      if (!paneThreadId) {
        return;
      }
      const previousState =
        pane === "left" ? activeSplitView.leftPanel : activeSplitView.rightPanel;
      updatePanePanelState(pane, {
        panel: previousState.panel === panel ? null : panel,
        diffTurnId: panel === "diff" ? previousState.diffTurnId : null,
        diffFilePath: panel === "diff" ? previousState.diffFilePath : null,
      });
    },
    [activeSplitView, updatePanePanelState],
  );

  useEffect(() => {
    const onMenuAction = window.desktopBridge?.onMenuAction;
    if (typeof onMenuAction !== "function" || !activeSplitView) {
      return;
    }

    const unsubscribe = onMenuAction((action) => {
      if (action !== "toggle-browser") return;
      togglePanePanel(activeSplitView.focusedPane, "browser");
    });

    return () => {
      unsubscribe?.();
    };
  }, [activeSplitView, togglePanePanel]);

  const closePanePanel = useCallback(
    (pane: SplitViewPane) => {
      updatePanePanelState(pane, {
        panel: null,
      });
    },
    [updatePanePanelState],
  );

  const openPaneTurnDiff = useCallback(
    (pane: SplitViewPane, turnId: TurnId, filePath?: string) => {
      updatePanePanelState(pane, {
        panel: "diff",
        diffTurnId: turnId,
        diffFilePath: filePath ?? null,
      });
    },
    [updatePanePanelState],
  );

  const maximizeFocusedPane = useCallback(() => {
    if (!activeSplitView) return;
    const nextThreadId = focusedThreadId;
    const focusedPanelState =
      activeSplitView.focusedPane === "left"
        ? activeSplitView.leftPanel
        : activeSplitView.rightPanel;
    removeSplitView(activeSplitView.id);
    if (!nextThreadId) {
      void navigate({ to: "/", replace: true });
      return;
    }
    void navigate({
      to: "/$threadId",
      params: { threadId: nextThreadId },
      replace: true,
      search: () => normalizeSingleSearchFromPane(focusedPanelState),
    });
  }, [activeSplitView, focusedThreadId, navigate, removeSplitView]);

  const activeSplitViewIdRef = useRef<SplitViewId | null>(null);
  activeSplitViewIdRef.current = activeSplitView?.id ?? null;

  useEffect(() => {
    const root = rootRef.current;
    const splitViewId = activeSplitViewIdRef.current;
    if (!root || !splitViewId) return;

    const divider = root.querySelector<HTMLElement>("[data-split-divider='true']");
    if (!divider) return;

    const handlePointerMove = (event: PointerEvent) => {
      const rect = root.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const id = activeSplitViewIdRef.current;
      if (!id) return;
      setRatio(id, (event.clientX - rect.left) / rect.width);
    };

    const handlePointerUp = () => {
      document.body.style.removeProperty("user-select");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    const onPointerDown = (event: PointerEvent) => {
      event.preventDefault();
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    };

    divider.addEventListener("pointerdown", onPointerDown);
    return () => {
      divider.removeEventListener("pointerdown", onPointerDown);
      handlePointerUp();
    };
  }, [activeSplitView?.id, setRatio]);

  if (!activeSplitView) {
    return null;
  }

  const leftBasis = `${activeSplitView.ratio * 100}%`;
  const rightBasis = `${(1 - activeSplitView.ratio) * 100}%`;
  // ORC-005: only offer threads that belong to this split-view's owning
  // project. Cross-project navigation inside a split view used to confuse
  // both the orchestrator scope (each project has its own runs/agents)
  // and the user (a single split-view should not span project boundaries).
  const selectableThreads = filterThreadsForProject(
    threads,
    activeSplitView.ownerProjectId,
  ).toSorted(
    (left, right) =>
      Date.parse(right.updatedAt ?? right.createdAt) - Date.parse(left.updatedAt ?? left.createdAt),
  );
  const chooseThreadForPane = (threadId: ThreadIdType, paneOverride?: SplitViewPane) => {
    const pane = paneOverride ?? threadPickerPane;
    if (!pane) {
      return;
    }
    // ORC-005: defense in depth. Even if the picker offered a foreign-
    // project thread (refactor regression, programmatic call), refuse to
    // navigate cross-project. Picker filtering prevents this from being
    // user-visible; the guard surfaces the bug if it ever happens.
    const guard = classifyCrossProjectNavigation({
      targetThreadId: threadId,
      paneOwnerProjectId: activeSplitView.ownerProjectId,
      threads,
    });
    if (!guard.ok) {
      console.warn(guard.reason);
      setThreadPickerPane(null);
      return;
    }
    const otherPane: SplitViewPane = pane === "left" ? "right" : "left";
    const currentPaneThreadId =
      pane === "left" ? activeSplitView.leftThreadId : activeSplitView.rightThreadId;
    const otherPaneThreadId =
      otherPane === "left" ? activeSplitView.leftThreadId : activeSplitView.rightThreadId;

    setThreadPickerPane(null);

    if (threadId === otherPaneThreadId) {
      setPaneFocus(otherPane);
      return;
    }

    setFocusedPane(activeSplitView.id, pane);
    if (threadId !== currentPaneThreadId) {
      replacePaneThread(activeSplitView.id, pane, threadId);
      setPanePanelState(activeSplitView.id, pane, {
        diffTurnId: null,
        diffFilePath: null,
      });
    }

    void navigate({
      to: "/$threadId",
      params: { threadId },
      replace: true,
      search: (previous) => ({
        ...stripDiffSearchParams(previous),
        splitViewId: activeSplitView.id,
      }),
    });
  };

  return (
    <>
      <div
        ref={rootRef}
        className="flex h-dvh min-h-0 min-w-0 flex-1 overflow-hidden bg-background"
      >
        <div
          className="flex min-h-0 min-w-0"
          style={{ flexBasis: leftBasis, flexGrow: 0, flexShrink: 1 }}
        >
          <SplitPaneSurface
            splitView={activeSplitView}
            pane="left"
            threadId={activeSplitView.leftThreadId}
            isFocused={activeSplitView.focusedPane === "left"}
            threads={selectableThreads}
            projects={projects}
            onFocus={() => setPaneFocus("left")}
            onToggleDiff={() => togglePanePanel("left", "diff")}
            onToggleBrowser={() => togglePanePanel("left", "browser")}
            onOpenTurnDiff={(turnId, filePath) => openPaneTurnDiff("left", turnId, filePath)}
            onClosePanel={() => closePanePanel("left")}
            onUpdatePanelState={(patch) => updatePanePanelState("left", patch)}
            onMaximize={maximizeFocusedPane}
            onChooseThread={() => {
              setPaneFocus("left");
              setThreadPickerPane("left");
            }}
            onSelectThread={(threadId) => chooseThreadForPane(threadId, "left")}
          />
        </div>
        <div
          data-split-divider="true"
          className="relative z-10 w-px shrink-0 cursor-col-resize bg-border/70 before:absolute before:inset-y-0 before:-left-1 before:w-2 before:bg-transparent"
        />
        <div
          className="flex min-h-0 min-w-0 flex-1"
          style={{ flexBasis: rightBasis, flexGrow: 1, flexShrink: 1 }}
        >
          <SplitPaneSurface
            splitView={activeSplitView}
            pane="right"
            threadId={activeSplitView.rightThreadId}
            isFocused={activeSplitView.focusedPane === "right"}
            threads={selectableThreads}
            projects={projects}
            onFocus={() => setPaneFocus("right")}
            onToggleDiff={() => togglePanePanel("right", "diff")}
            onToggleBrowser={() => togglePanePanel("right", "browser")}
            onOpenTurnDiff={(turnId, filePath) => openPaneTurnDiff("right", turnId, filePath)}
            onClosePanel={() => closePanePanel("right")}
            onUpdatePanelState={(patch) => updatePanePanelState("right", patch)}
            onMaximize={maximizeFocusedPane}
            onChooseThread={() => {
              setPaneFocus("right");
              setThreadPickerPane("right");
            }}
            onSelectThread={(threadId) => chooseThreadForPane(threadId, "right")}
          />
        </div>
      </div>
      <Dialog
        open={threadPickerPane !== null}
        onOpenChange={(open) => {
          if (!open) {
            setThreadPickerPane(null);
          }
        }}
      >
        <DialogPopup className="max-w-lg">
          <DialogHeader className="items-center text-center">
            <DialogTitle>Choose Chat</DialogTitle>
            <DialogDescription className="max-w-sm text-center">
              Pick which chat should appear in the {threadPickerPane ?? "focused"} split pane.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-3">
            <div className="max-h-[56vh] space-y-1 overflow-y-auto">
              {selectableThreads.map((thread) => {
                const projectName =
                  projects.find((project) => project.id === thread.projectId)?.name ?? "Project";
                const isSelected =
                  threadPickerPane === "left"
                    ? activeSplitView.leftThreadId === thread.id
                    : activeSplitView.rightThreadId === thread.id;
                return (
                  <button
                    key={thread.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                      isSelected
                        ? "border-primary/35 bg-accent/55"
                        : "border-border/55 hover:bg-accent/40",
                    )}
                    onClick={() => chooseThreadForPane(thread.id)}
                  >
                    <PickerProviderGlyph
                      provider={thread.modelSelection.provider}
                      className="size-4 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">
                        {thread.title}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{projectName}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <DialogFooter variant="bare">
              <Button type="button" variant="outline" onClick={() => setThreadPickerPane(null)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </>
  );
}

function SingleChatSurface(props: {
  threadId: ThreadIdType;
  search: DiffRouteSearch;
  projectId: ProjectId | null;
}) {
  const navigate = useNavigate();
  const shouldUseDiffSheet = useMediaQuery(DIFF_INLINE_LAYOUT_MEDIA_QUERY);
  const createSplitView = useSplitViewStore((store) => store.createFromThread);
  const activePanel = props.search.panel;
  const panelOpen = activePanel !== undefined;
  const [hasOpenedPanel, setHasOpenedPanel] = useState(panelOpen);
  const [lastOpenPanel, setLastOpenPanel] = useState<ChatRightPanel>(activePanel ?? "browser");
  const closePanel = useCallback(() => {
    void navigate({
      to: "/$threadId",
      params: { threadId: props.threadId },
      search: (previous) => ({ ...stripDiffSearchParams(previous), panel: undefined }),
    });
  }, [navigate, props.threadId]);
  const openPanel = useCallback(() => {
    void navigate({
      to: "/$threadId",
      params: { threadId: props.threadId },
      search: (previous) => {
        const rest = stripDiffSearchParams(previous);
        return lastOpenPanel === "browser"
          ? { ...rest, panel: "browser" }
          : { ...rest, panel: "diff", diff: "1" };
      },
    });
  }, [lastOpenPanel, navigate, props.threadId]);
  const handleSplitSurface = useCallback(() => {
    if (!props.projectId) return;
    const splitViewId = createSplitView({
      sourceThreadId: props.threadId,
      ownerProjectId: props.projectId,
    });
    void navigate({
      to: "/$threadId",
      params: { threadId: props.threadId },
      replace: true,
      search: () => ({ splitViewId }),
    });
  }, [createSplitView, navigate, props.projectId, props.threadId]);

  useEffect(() => {
    if (panelOpen) {
      setHasOpenedPanel(true);
    }
  }, [panelOpen]);

  useEffect(() => {
    if (activePanel) {
      setLastOpenPanel(activePanel);
    }
  }, [activePanel]);

  useEffect(() => {
    return onBrowserOpenRequested((request) => {
      if (request.threadId !== props.threadId) {
        return;
      }

      const api = readNativeApi();
      if (api) {
        void api.browser
          .open({
            threadId: props.threadId,
            ...(request.url ? { initialUrl: request.url } : {}),
          })
          .then((state) => {
            if (!request.url) {
              return;
            }
            const tabId = state.activeTabId ?? state.tabs[0]?.id;
            void api.browser.navigate({
              threadId: props.threadId,
              url: request.url,
              ...(tabId ? { tabId } : {}),
            });
          });
      }

      void navigate({
        to: "/$threadId",
        params: { threadId: props.threadId },
        replace: true,
        search: (previous) => ({
          ...stripDiffSearchParams(previous),
          panel: "browser",
        }),
      });
    });
  }, [navigate, props.threadId]);

  useEffect(() => {
    const onMenuAction = window.desktopBridge?.onMenuAction;
    if (typeof onMenuAction !== "function") {
      return;
    }

    const unsubscribe = onMenuAction((action) => {
      if (action !== "toggle-browser") return;
      void navigate({
        to: "/$threadId",
        params: { threadId: props.threadId },
        replace: true,
        search: (previous) => {
          const rest = stripDiffSearchParams(previous);
          return activePanel === "browser"
            ? { ...rest, panel: undefined }
            : { ...rest, panel: "browser" };
        },
      });
    });

    return () => {
      unsubscribe?.();
    };
  }, [activePanel, navigate, props.threadId]);

  const shouldRenderPanelContent = activePanel !== undefined && (panelOpen || hasOpenedPanel);

  if (!shouldUseDiffSheet) {
    return (
      <div className="flex h-dvh min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
        <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none rounded-none bg-background text-foreground">
          <ChatView
            key={props.threadId}
            threadId={props.threadId}
            onSplitSurface={handleSplitSurface}
          />
        </SidebarInset>
        <PanePanelInlineSidebar
          panelOpen={panelOpen}
          onClosePanel={closePanel}
          onOpenPanel={openPanel}
          renderPanelContent={shouldRenderPanelContent}
          panel={activePanel}
          threadId={props.threadId}
        />
      </div>
    );
  }

  return (
    <>
      <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none rounded-none bg-background text-foreground">
        <ChatView
          key={props.threadId}
          threadId={props.threadId}
          onSplitSurface={handleSplitSurface}
        />
      </SidebarInset>
      <RightPanelSheet panelOpen={panelOpen} onClosePanel={closePanel}>
        {shouldRenderPanelContent ? (
          activePanel === "browser" ? (
            <BrowserPanel mode="sheet" threadId={props.threadId} onClosePanel={closePanel} />
          ) : (
            <LazyDiffPanel mode="sheet" />
          )
        ) : null}
      </RightPanelSheet>
    </>
  );
}

// ---------------------------------------------------------------------------
// Orchestrator 3-pane layout: orchestrator panel + up to 2 agent ChatViews
// ---------------------------------------------------------------------------

const EMPTY_AGENT_IDS: readonly string[] = Object.freeze([]);

const PANE_SIZES_STORAGE_KEY = "orchestrate:multiPaneSizes:v1";

function readStoredPaneSizes(agentCount: number): number[] | null {
  try {
    const raw = window.localStorage.getItem(`${PANE_SIZES_STORAGE_KEY}:${agentCount}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== agentCount + 1) return null;
    if (!parsed.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredPaneSizes(agentCount: number, sizes: number[]): void {
  try {
    window.localStorage.setItem(`${PANE_SIZES_STORAGE_KEY}:${agentCount}`, JSON.stringify(sizes));
  } catch {}
}

function OrchestratorMultiPaneSurface(props: {
  agentThreadIds: readonly string[];
  browserOpen: boolean;
  onOpenBrowserPane: () => void;
  onCloseBrowserPane: () => void;
}) {
  const { agentThreadIds, browserOpen, onCloseBrowserPane, onOpenBrowserPane } = props;
  const agentCount = agentThreadIds.length;
  const collapseAgent = useOrchestratorPaneStore((state) => state.collapseAgent);
  const closeBrowser = useOrchestratorPaneStore((state) => state.closeBrowser);
  const focusBrowser = useOrchestratorPaneStore((state) => state.focusBrowser);
  const orchestratorThreadId = useOrchestratorPaneStore((state) => state.orchestratorThreadId);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const orchestratorSessionStatus = useStore(
    (store) => store.threads.find((t) => t.id === orchestratorThreadId)?.session?.status ?? null,
  );
  const isOrchestratorRunning = orchestratorSessionStatus === "running";
  const paneCount = 1 + agentCount + (browserOpen ? 1 : 0);

  // Flex-basis percentages for [orchestrator, ...agents, browser].
  // Defaults keep the orchestrator readable while side panes share the rest.
  const defaultSizes = useMemo(() => {
    if (paneCount === 1) return [100];
    if (paneCount === 2) return [50, 50];
    if (paneCount === 3) return [30, 35, 35];
    const sidePaneSize = 70 / (paneCount - 1);
    return [30, ...Array.from({ length: paneCount - 1 }, () => sidePaneSize)];
  }, [paneCount]);

  const [sizes, setSizes] = useState<number[]>(() => {
    const stored = typeof window !== "undefined" ? readStoredPaneSizes(paneCount) : null;
    return stored ?? defaultSizes;
  });

  // Reset stored sizes when pane count changes (different pane layout).
  useEffect(() => {
    const stored = readStoredPaneSizes(paneCount);
    setSizes(stored ?? defaultSizes);
  }, [paneCount, defaultSizes]);

  useEffect(() => {
    if (!orchestratorThreadId) {
      return;
    }
    return onBrowserOpenRequested((request) => {
      if (request.threadId !== orchestratorThreadId) {
        return;
      }
      focusBrowser(orchestratorThreadId);
      onOpenBrowserPane();
      const api = readNativeApi();
      if (api) {
        void api.browser
          .open({
            threadId: orchestratorThreadId as ThreadIdType,
            ...(request.url ? { initialUrl: request.url } : {}),
          })
          .then((state) => {
            if (!request.url) {
              return;
            }
            const tabId = state.activeTabId ?? state.tabs[0]?.id;
            void api.browser.navigate({
              threadId: orchestratorThreadId as ThreadIdType,
              url: request.url,
              ...(tabId ? { tabId } : {}),
            });
          });
      }
    });
  }, [focusBrowser, onOpenBrowserPane, orchestratorThreadId]);

  const startDrag = useCallback(
    (dividerIndex: number) => (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      const startX = event.clientX;
      const startSizes = [...sizes];
      const totalWidth = container.getBoundingClientRect().width;
      // Minimum pane size (in %) so panes never collapse to zero.
      const minPct = 12;

      const onMove = (e: PointerEvent) => {
        const deltaPx = e.clientX - startX;
        const deltaPct = (deltaPx / totalWidth) * 100;
        const next = [...startSizes];
        const leftIdx = dividerIndex;
        const rightIdx = dividerIndex + 1;
        let nextLeft = (next[leftIdx] ?? defaultSizes[leftIdx] ?? 50) + deltaPct;
        let nextRight = (next[rightIdx] ?? defaultSizes[rightIdx] ?? 50) - deltaPct;
        if (nextLeft < minPct) {
          nextRight -= minPct - nextLeft;
          nextLeft = minPct;
        }
        if (nextRight < minPct) {
          nextLeft -= minPct - nextRight;
          nextRight = minPct;
        }
        next[leftIdx] = nextLeft;
        next[rightIdx] = nextRight;
        setSizes(next);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        setSizes((current) => {
          writeStoredPaneSizes(paneCount, current);
          return current;
        });
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [defaultSizes, sizes, paneCount],
  );

  const closeBrowserPane = useCallback(() => {
    closeBrowser();
    onCloseBrowserPane();
  }, [closeBrowser, onCloseBrowserPane]);

  return (
    <div ref={containerRef} className="flex h-dvh min-w-0 flex-1 overflow-hidden bg-background">
      {/* Orchestrator pane */}
      <div
        style={{ flexBasis: `${sizes[0]}%`, minWidth: 0 }}
        className="@container/pane relative flex h-full flex-col overflow-hidden"
      >
        <div className="flex h-8 items-center gap-2 border-b border-border/40 pl-4 pr-2">
          <span
            className={`inline-flex size-1.5 shrink-0 rounded-full ${
              isOrchestratorRunning
                ? "bg-emerald-400/85 shadow-[0_0_6px_rgba(52,211,153,0.55)] animate-pulse"
                : "bg-foreground"
            }`}
            style={
              !isOrchestratorRunning
                ? { boxShadow: "0 0 0 3px color-mix(in srgb, currentColor 15%, transparent)" }
                : undefined
            }
            aria-hidden
          />
          <span className="shrink-0 font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-foreground">
            Orchestrator
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <span className="hidden text-[10px] font-medium text-muted-foreground/45 @[460px]/pane:inline">
              {agentCount}
              <span className="mx-0.5 text-muted-foreground/30">×</span>
              <span className="uppercase tracking-[0.14em] text-muted-foreground/55">agent</span>
            </span>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col [&>div]:h-full [&>div]:flex-1">
          <OrchestratorPanel hideHeader />
        </div>
      </div>
      {/* Divider after orchestrator — only when another pane follows so the
          single-pane layout doesn't expose a stranded resize handle on the right. */}
      {(agentCount > 0 || browserOpen) && <PaneDivider onPointerDown={startDrag(0)} />}
      {/* Agent panes with dividers */}
      {agentThreadIds.map((agentThreadId, i) => (
        <Fragment key={agentThreadId}>
          <AgentPane
            agentThreadId={agentThreadId}
            paneIndex={i}
            flexBasis={`${sizes[i + 1] ?? defaultSizes[i + 1] ?? 50}%`}
            showRightBorder={false}
            onClose={() => collapseAgent(agentThreadId)}
          />
          {i < agentCount - 1 && <PaneDivider onPointerDown={startDrag(i + 1)} />}
        </Fragment>
      ))}
      {browserOpen && orchestratorThreadId ? (
        <>
          {agentCount > 0 && <PaneDivider onPointerDown={startDrag(agentCount)} />}
          <BrowserPane
            threadId={orchestratorThreadId as ThreadIdType}
            flexBasis={`${sizes[agentCount + 1] ?? defaultSizes[agentCount + 1] ?? 50}%`}
            onClose={closeBrowserPane}
          />
        </>
      ) : null}
    </div>
  );
}

function PaneDivider(props: {
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={props.onPointerDown}
      className="group relative w-px shrink-0 cursor-col-resize touch-none select-none bg-foreground/10 hover:bg-foreground/35 transition-colors"
    >
      <div className="pointer-events-none absolute inset-y-0 -left-1.5 -right-1.5" />
    </div>
  );
}

function AgentPane(props: {
  agentThreadId: string;
  paneIndex: number;
  flexBasis: string;
  showRightBorder: boolean;
  onClose: () => void;
}) {
  // Each selector must return a primitive so zustand v5's Object.is compare
  // works without re-render loops.
  const sessionStatus = useStore(
    (store) => store.threads.find((t) => t.id === props.agentThreadId)?.session?.status ?? null,
  );
  const isRunning = sessionStatus === "running";
  const statusDot = isRunning
    ? "bg-emerald-400/85 shadow-[0_0_6px_rgba(52,211,153,0.55)] animate-pulse"
    : sessionStatus === "error"
      ? "bg-rose-400/80"
      : "bg-muted-foreground/40";
  return (
    <div
      style={{ flexBasis: props.flexBasis, minWidth: 0 }}
      className={`@container/pane group/agent-pane relative flex h-full flex-col overflow-hidden border-x border-foreground/8 transition-colors duration-150 hover:border-foreground/25 ${props.showRightBorder ? "border-r border-border/40" : ""}`}
    >
      <div className="flex h-8 items-center gap-2 border-b border-border/40 px-3">
        <span className={`inline-flex size-1.5 shrink-0 rounded-full ${statusDot}`} aria-hidden />
        <span className="shrink-0 font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-foreground">
          Agent
        </span>
        <span className="min-w-0 flex-1" />
        <button
          type="button"
          onClick={props.onClose}
          className="inline-flex size-5 shrink-0 items-center justify-center text-muted-foreground/50 transition-colors hover:text-foreground/85"
          title="Close this agent pane"
          aria-label="Close agent pane"
        >
          <span aria-hidden className="text-base leading-none">
            ×
          </span>
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col [&>div]:h-full [&>div]:flex-1">
        <ChatView
          threadId={props.agentThreadId as ThreadIdType}
          paneScopeId={`orchestrator-agent:${props.agentThreadId}`}
          surfaceMode="split"
        />
      </div>
    </div>
  );
}

function BrowserPane(props: { threadId: ThreadIdType; flexBasis: string; onClose: () => void }) {
  return (
    <div
      style={{ flexBasis: props.flexBasis, minWidth: 0 }}
      className="@container/pane relative flex h-full flex-col overflow-hidden border-x border-foreground/8"
    >
      <div className="flex h-8 items-center gap-2 border-b border-border/40 px-3">
        <span className="inline-flex size-1.5 shrink-0 rounded-full bg-sky-400/85" aria-hidden />
        <span className="shrink-0 font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-foreground">
          Browser
        </span>
        <span className="min-w-0 flex-1" />
        <button
          type="button"
          onClick={props.onClose}
          className="inline-flex size-5 shrink-0 items-center justify-center text-muted-foreground/50 transition-colors hover:text-foreground/85"
          title="Close browser pane"
          aria-label="Close browser pane"
        >
          <span aria-hidden className="text-base leading-none">
            ×
          </span>
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col [&>div]:h-full [&>div]:flex-1">
        <BrowserPanel mode="sidebar" threadId={props.threadId} onClosePanel={props.onClose} />
      </div>
    </div>
  );
}

function ChatThreadRouteView() {
  const threadsHydrated = useStore((store) => store.threadsHydrated);
  const threadId = Route.useParams({
    select: (params) => ThreadId.makeUnsafe(params.threadId),
  });
  const search = Route.useSearch();
  const threadProjectId = useStore(
    (store) => store.threads.find((thread) => thread.id === threadId)?.projectId ?? null,
  );
  // ORC-248: read the thread title and project name so we can update
  // document.title on every navigation. Screen-reader users rely on
  // the window/page title to know what context they are in.
  const threadTitle = useStore(
    (store) => store.threads.find((thread) => thread.id === threadId)?.title ?? null,
  );
  const projectName = useStore((store) => {
    const projectId = store.threads.find((thread) => thread.id === threadId)?.projectId ?? null;
    if (!projectId) return null;
    return store.projects.find((p) => p.id === projectId)?.name ?? null;
  });
  useDocumentTitle([threadTitle, projectName, "Orchestrate"]);
  const threadType = useStore(
    (store) => store.threads.find((thread) => thread.id === threadId)?.threadType ?? null,
  );
  const threadExists = useStore((store) => store.threads.some((thread) => thread.id === threadId));
  const draftThreadState = useComposerDraftStore(
    (store) => store.draftThreadsByThreadId[threadId] ?? null,
  );
  const terminalEntryPoint = useTerminalStateStore(
    (store) => selectThreadTerminalState(store.terminalStateByThreadId, threadId).entryPoint,
  );
  const draftThreadExists = draftThreadState !== null;
  const routeThreadExists = threadExists || draftThreadExists;
  const resolvedThreadType = draftThreadState?.threadType ?? threadType ?? "orchestrator";
  const showOrchestratorSurface =
    routeThreadExists && terminalEntryPoint !== "terminal" && resolvedThreadType === "orchestrator";
  const splitView = useSplitViewStore(selectSplitView(search.splitViewId ?? null));
  const activeProjectId = resolveSingleProjectId({
    threadProjectId,
    draftProjectId: draftThreadState?.projectId ?? null,
  });
  const navigate = useNavigate();

  // Orchestrator pane store: track orchestrator thread and focused agent panes
  const {
    orchestratorThreadId,
    focusedAgentThreadIds,
    focusedBrowserThreadId,
    setOrchestratorThread,
    focusAgent,
    focusBrowser,
  } = useOrchestratorPaneStore();

  // Up to two most-recently-created agent children — used to auto-focus on
  // orchestrator open. We sort by createdAt (not updatedAt) so the order is
  // stable: ongoing activity must NOT reshuffle the agent panes.
  // Return a JSON-stable key so zustand v5's Object.is equality works.
  const recentAgentThreadIdsKey = useStore((store) => {
    if (!showOrchestratorSurface) return "";
    const candidates = store.threads
      .filter(
        (t) =>
          t.threadType === "agent" &&
          t.parentThreadId === threadId &&
          t.session?.status !== "error",
      )
      .sort((a, b) => {
        // Newest first.
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return bTime - aTime;
      })
      .slice(0, 2)
      .map((t) => t.id);
    return candidates.join(",");
  });
  const recentAgentThreadIds = useMemo(
    () => (recentAgentThreadIdsKey ? recentAgentThreadIdsKey.split(",") : EMPTY_AGENT_IDS),
    [recentAgentThreadIdsKey],
  );

  useEffect(() => {
    if (showOrchestratorSurface) {
      setOrchestratorThread(threadId);
      // Auto-focus only when NO agents are currently focused — keeps the
      // pane order stable once the user has started a session. Otherwise
      // tool-call cards and live events will handle new spawns.
      const focused = useOrchestratorPaneStore.getState().focusedAgentThreadIds;
      if (focused.length === 0 && recentAgentThreadIds.length > 0) {
        // Reverse so oldest-of-top-2 ends up as pane 1 (matches focusAgent's
        // append-to-tail ordering).
        for (const candidate of [...recentAgentThreadIds].reverse()) {
          focusAgent(candidate);
        }
      }
    }
    return () => {
      if (showOrchestratorSurface) {
        setOrchestratorThread(null);
      }
    };
  }, [threadId, showOrchestratorSurface, setOrchestratorThread, focusAgent, recentAgentThreadIds]);

  useEffect(() => {
    if (
      shouldAutoFocusOrchestratorBrowserPane({
        showOrchestratorSurface,
        routeThreadId: threadId,
        orchestratorThreadId,
        focusedBrowserThreadId,
      })
    ) {
      focusBrowser(threadId);
    }
  }, [
    focusedBrowserThreadId,
    focusBrowser,
    orchestratorThreadId,
    showOrchestratorSurface,
    threadId,
  ]);

  const isOrchestratorThread = orchestratorThreadId === threadId;
  const hasOrchestratorAgentPanes = isOrchestratorThread && focusedAgentThreadIds.length > 0;
  const hasOrchestratorBrowserPane = shouldRenderOrchestratorBrowserPane({
    isOrchestratorThread,
    routePanel: search.panel,
    focusedBrowserThreadId,
    orchestratorThreadId,
  });

  const openOrchestratorBrowserPane = useCallback(() => {
    void navigate({
      to: "/$threadId",
      params: { threadId },
      replace: true,
      search: (previous) => {
        const rest = stripDiffSearchParams(previous);
        return { ...rest, panel: "browser" };
      },
    });
  }, [navigate, threadId]);

  const closeOrchestratorBrowserPane = useCallback(() => {
    void navigate({
      to: "/$threadId",
      params: { threadId },
      replace: true,
      search: (previous) => {
        const rest = stripDiffSearchParams(previous);
        return { ...rest, panel: undefined };
      },
    });
  }, [navigate, threadId]);

  useEffect(() => {
    if (!threadsHydrated) {
      return;
    }

    if (isSplitRoute(search)) {
      if (!splitView) {
        void navigate({
          to: "/$threadId",
          params: { threadId },
          replace: true,
          search: (previous) => ({ ...stripDiffSearchParams(previous), splitViewId: undefined }),
        });
      }
      return;
    }

    if (!routeThreadExists) {
      void navigate({ to: "/", replace: true });
    }
  }, [navigate, routeThreadExists, search, splitView, threadId, threadsHydrated]);

  if (!threadsHydrated) {
    return <ChatThreadLoadingShell threadId={threadId} />;
  }

  if (splitView && search.splitViewId) {
    return <SplitChatSurface splitViewId={search.splitViewId} routeThreadId={threadId} />;
  }

  if (!routeThreadExists) {
    return null;
  }

  if (showOrchestratorSurface) {
    if (hasOrchestratorAgentPanes || hasOrchestratorBrowserPane) {
      return (
        <OrchestratorMultiPaneSurface
          agentThreadIds={focusedAgentThreadIds}
          browserOpen={hasOrchestratorBrowserPane}
          onOpenBrowserPane={openOrchestratorBrowserPane}
          onCloseBrowserPane={closeOrchestratorBrowserPane}
        />
      );
    }
    return (
      <OrchestratorMultiPaneSurface
        agentThreadIds={EMPTY_AGENT_IDS}
        browserOpen={false}
        onOpenBrowserPane={openOrchestratorBrowserPane}
        onCloseBrowserPane={closeOrchestratorBrowserPane}
      />
    );
  }

  return <SingleChatSurface threadId={threadId} search={search} projectId={activeProjectId} />;
}

export const Route = createFileRoute("/_chat/$threadId")({
  validateSearch: (search) => parseDiffRouteSearch(search),
  search: {
    middlewares: [retainSearchParams<DiffRouteSearch>(["panel", "diff"])],
  },
  component: ChatThreadRouteView,
});
