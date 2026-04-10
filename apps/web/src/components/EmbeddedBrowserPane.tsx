import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRightIcon,
  GlobeIcon,
  Maximize2Icon,
  MinusIcon,
  Minimize2Icon,
  RefreshCcwIcon,
  SparklesIcon,
} from "lucide-react";
import { type ThreadId } from "@t3tools/contracts";
import { Schema } from "effect";

import { useMediaQuery } from "~/hooks/useMediaQuery";
import { getLocalStorageItem, setLocalStorageItem } from "~/hooks/useLocalStorage";
import { cn } from "~/lib/utils";
import { readNativeApi } from "~/nativeApi";
import {
  getEmbeddedBrowserAddress,
  resolveEmbeddedBrowserAbsoluteUrl,
  resolveEmbeddedBrowserSession,
  useEmbeddedBrowserStateStore,
  type EmbeddedBrowserSession,
} from "~/embeddedBrowserStateStore";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPopup,
  SheetTitle,
} from "~/components/ui/sheet";
import { LearnAiExperience } from "./LearnAiExperience";
import { ResizeEdgeHandle } from "./ResizeEdgeHandle";

const EMBEDDED_BROWSER_WIDTH_STORAGE_KEY = "embedded_browser_panel_width";
const EMBEDDED_BROWSER_DEFAULT_WIDTH = 520;
const EMBEDDED_BROWSER_MIN_WIDTH = 360;
const EMBEDDED_BROWSER_MAX_WIDTH = 1_400;
const EMBEDDED_BROWSER_SHEET_MEDIA_QUERY = "(max-width: 1360px)";

function resolveIframeSource(session: EmbeddedBrowserSession | null): string | null {
  if (!session || session.kind !== "url") {
    return null;
  }

  if (/^https?:\/\//i.test(session.url)) {
    return session.url;
  }

  if (/^(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/.*)?$/i.test(session.url)) {
    return `http://${session.url}`;
  }

  if (session.url.startsWith("/")) {
    return session.url;
  }

  return null;
}

function resolveDisplayedAddress(session: EmbeddedBrowserSession | null): string {
  if (!session) {
    return "";
  }

  const address = getEmbeddedBrowserAddress(session);
  return resolveEmbeddedBrowserAbsoluteUrl(address) ?? address;
}

export function EmbeddedBrowserSurface({
  activeSession,
  activeScopeLabel,
  onCollapseToggle,
  onExpandToggle,
  collapsed,
  expanded,
  expandDisabled,
  collapseDisabled,
  reloadCount,
  onReload,
}: {
  activeSession: EmbeddedBrowserSession;
  activeScopeLabel: string;
  onCollapseToggle: () => void;
  onExpandToggle: () => void;
  collapsed: boolean;
  expanded: boolean;
  expandDisabled: boolean;
  collapseDisabled: boolean;
  reloadCount: number;
  onReload: () => void;
}) {
  const iframeSource = useMemo(() => resolveIframeSource(activeSession), [activeSession]);
  const displayedAddress = useMemo(() => resolveDisplayedAddress(activeSession), [activeSession]);
  const canOpenExternal = activeSession.kind === "url" || activeSession.kind === "automation";
  const canReload = activeSession.kind === "url";
  const handleOpenExternal = useCallback(() => {
    const absoluteUrl = resolveEmbeddedBrowserAbsoluteUrl(displayedAddress);
    if (!absoluteUrl) {
      return;
    }
    const api = readNativeApi();
    if (!api) {
      return;
    }
    void api.shell.openExternal(absoluteUrl);
  }, [displayedAddress]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(19,21,28,0.94),rgba(12,14,18,0.82))] text-foreground shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-2xl">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/8 bg-white/[0.03] px-3.5 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/[0.06] text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            {activeSession.kind === "url" ? (
              <GlobeIcon className="size-3.5" />
            ) : (
              <SparklesIcon className="size-3.5 text-primary" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-[-0.01em]">
              {activeSession.title}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">{activeScopeLabel}</p>
          </div>
        </div>
        <div className="flex min-w-0 flex-[999] items-center gap-1.5">
          <Input
            readOnly
            value={displayedAddress}
            className="h-9 min-w-0 rounded-full border-white/10 bg-black/20 text-xs text-foreground/90 placeholder:text-muted-foreground/60"
          />
          {canReload ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-9 shrink-0 rounded-full border border-transparent bg-white/[0.03] text-muted-foreground transition-colors hover:border-white/8 hover:bg-white/[0.08] hover:text-foreground"
              onClick={onReload}
              title="Reload preview"
            >
              <RefreshCcwIcon className="size-3.5" />
              <span className="sr-only">Reload preview</span>
            </Button>
          ) : null}
          {!collapseDisabled ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-9 shrink-0 rounded-full border border-transparent bg-white/[0.03] text-muted-foreground transition-colors hover:border-white/8 hover:bg-white/[0.08] hover:text-foreground"
              onClick={onCollapseToggle}
              title={collapsed ? "Restore preview" : "Minimize preview"}
            >
              {collapsed ? (
                <Maximize2Icon className="size-3.5" />
              ) : (
                <MinusIcon className="size-3.5" />
              )}
              <span className="sr-only">{collapsed ? "Restore preview" : "Minimize preview"}</span>
            </Button>
          ) : null}
          {!expandDisabled ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-9 shrink-0 rounded-full border border-transparent bg-white/[0.03] text-muted-foreground transition-colors hover:border-white/8 hover:bg-white/[0.08] hover:text-foreground"
              onClick={onExpandToggle}
              title={expanded ? "Restore preview size" : "Expand preview"}
            >
              {expanded ? (
                <Minimize2Icon className="size-3.5" />
              ) : (
                <Maximize2Icon className="size-3.5" />
              )}
              <span className="sr-only">
                {expanded ? "Restore preview size" : "Expand preview"}
              </span>
            </Button>
          ) : null}
          {canOpenExternal ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-9 shrink-0 rounded-full border border-transparent bg-white/[0.03] text-muted-foreground transition-colors hover:border-white/8 hover:bg-white/[0.08] hover:text-foreground"
              onClick={handleOpenExternal}
              title="Open in browser"
            >
              <ArrowUpRightIcon className="size-3.5" />
              <span className="sr-only">Open in browser</span>
            </Button>
          ) : null}
        </div>
      </div>
      {collapsed ? (
        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-[11px] text-muted-foreground">
          <div className="min-w-0">
            <p className="truncate text-foreground/88">Preview minimized</p>
            <p className="truncate text-muted-foreground/70">
              Restore to keep following the live browser steps here.
            </p>
          </div>
          <div className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-foreground/80">
            {activeSession.kind === "automation" ? "Computer use" : "Live preview"}
          </div>
        </div>
      ) : null}
      {!collapsed ? (
        <div className="min-h-0 flex-1 bg-background/45">
          {activeSession.kind === "internal" ? (
            <LearnAiExperience embedded />
          ) : activeSession.kind === "automation" ? (
            <div className="flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top,rgba(72,125,255,0.22),transparent_56%),linear-gradient(180deg,rgba(7,11,20,0.98),rgba(11,14,18,0.92))]">
              <div className="min-h-0 flex-1 p-2.5">
                {activeSession.screenshotDataUrl ? (
                  <div className="flex h-full min-h-0 flex-col rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_18px_44px_rgba(0,0,0,0.2)]">
                    <div className="mb-2 flex items-center gap-1.5 px-1">
                      <span className="size-2.5 rounded-full bg-[#ff5f57]/90" />
                      <span className="size-2.5 rounded-full bg-[#febc2e]/90" />
                      <span className="size-2.5 rounded-full bg-[#28c840]/90" />
                      <div className="ml-2 min-w-0 flex-1 truncate rounded-full border border-white/8 bg-black/25 px-3 py-1 text-[10px] text-muted-foreground/90">
                        {displayedAddress}
                      </div>
                    </div>
                    <div className="relative min-h-[320px] flex-1 overflow-hidden rounded-[18px] border border-white/8 bg-[radial-gradient(circle_at_top,rgba(62,88,150,0.18),transparent_58%),rgba(2,5,11,0.96)]">
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/32 via-black/10 to-transparent" />
                      <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-full border border-cyan-400/16 bg-black/42 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-cyan-100/88 backdrop-blur-md">
                        Live browser
                      </div>
                      <img
                        src={activeSession.screenshotDataUrl}
                        alt={`Computer-use preview of ${activeSession.title}`}
                        className="h-full w-full scale-[0.965] object-contain object-top transition-transform duration-200"
                      />
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/36 via-black/10 to-transparent" />
                      {activeSession.lastActionSummary ? (
                        <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-2xl border border-white/12 bg-black/58 px-3 py-2 text-xs text-white/92 shadow-[0_18px_50px_rgba(0,0,0,0.32)] backdrop-blur-md">
                          {activeSession.lastActionSummary}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[320px] items-center justify-center rounded-[22px] border border-dashed border-white/10 bg-black/18 px-6 text-center text-sm text-muted-foreground">
                    Waiting for the automation runtime to capture a browser screenshot.
                  </div>
                )}
              </div>
            </div>
          ) : iframeSource ? (
            <iframe
              key={`${iframeSource}:${reloadCount}`}
              title={activeSession.title}
              src={iframeSource}
              className="h-full w-full border-0 bg-background"
              allow="clipboard-read; clipboard-write; fullscreen"
              allowFullScreen
              sandbox="allow-downloads allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-scripts"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
              This preview target could not be embedded. Use the external-open control instead.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function InlineEmbeddedBrowserCard({
  session,
  scopeLabel,
  className,
}: {
  session: EmbeddedBrowserSession;
  scopeLabel: string;
  className?: string;
}) {
  const [reloadCount, setReloadCount] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const handleExpandToggle = useCallback(() => {
    setIsExpanded((current) => !current);
  }, []);
  const handleCollapseToggle = useCallback(() => {
    setIsCollapsed((current) => !current);
  }, []);
  useEffect(() => {
    setIsCollapsed(false);
  }, [session.kind, session.openedAt, session.title]);
  const content = (
    <EmbeddedBrowserSurface
      activeSession={session}
      activeScopeLabel={scopeLabel}
      onCollapseToggle={handleCollapseToggle}
      onExpandToggle={handleExpandToggle}
      collapsed={isCollapsed}
      expanded={isExpanded}
      expandDisabled={false}
      collapseDisabled={false}
      reloadCount={reloadCount}
      onReload={() => setReloadCount((count) => count + 1)}
    />
  );

  return (
    <>
      <div
        className={cn(
          "min-h-0 overflow-hidden transition-[height] duration-200 ease-out",
          className,
          isCollapsed && "!h-auto",
        )}
      >
        {content}
      </div>
      <Sheet open={isExpanded} onOpenChange={setIsExpanded}>
        <SheetPopup
          side="right"
          showCloseButton={false}
          keepMounted
          className="w-[calc(100vw-1.5rem)] max-w-[1600px] border-none bg-transparent p-3 shadow-none"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{session.title}</SheetTitle>
            <SheetDescription>Embedded browser preview</SheetDescription>
          </SheetHeader>
          <div className="h-full min-h-0">
            <EmbeddedBrowserSurface
              activeSession={session}
              activeScopeLabel={scopeLabel}
              onCollapseToggle={handleCollapseToggle}
              onExpandToggle={handleExpandToggle}
              collapsed={false}
              expanded
              expandDisabled={false}
              collapseDisabled
              reloadCount={reloadCount}
              onReload={() => setReloadCount((count) => count + 1)}
            />
          </div>
        </SheetPopup>
      </Sheet>
    </>
  );
}

export function EmbeddedBrowserPane({ currentThreadId }: { currentThreadId: ThreadId | null }) {
  const shouldUseSheet = useMediaQuery(EMBEDDED_BROWSER_SHEET_MEDIA_QUERY);
  const [width, setWidth] = useState(() => {
    const stored = getLocalStorageItem(EMBEDDED_BROWSER_WIDTH_STORAGE_KEY, Schema.Finite);
    return stored ?? EMBEDDED_BROWSER_DEFAULT_WIDTH;
  });
  const [isExpanded, setIsExpanded] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const closeGlobalSession = useEmbeddedBrowserStateStore((state) => state.closeGlobalSession);
  const closeThreadSession = useEmbeddedBrowserStateStore((state) => state.closeThreadSession);
  const globalSession = useEmbeddedBrowserStateStore((state) => state.globalSession);
  const threadSessionsById = useEmbeddedBrowserStateStore((state) => state.threadSessionsById);

  const activeSessionState = useMemo(
    () =>
      resolveEmbeddedBrowserSession({
        globalSession,
        threadId: currentThreadId,
        threadSessionsById,
      }),
    [currentThreadId, globalSession, threadSessionsById],
  );
  const activeSession = activeSessionState.session;
  const activeScope = activeSessionState.scope;
  const activeSessionAddress = activeSession ? getEmbeddedBrowserAddress(activeSession) : null;

  useEffect(() => {
    setReloadCount(0);
    setIsExpanded(false);
  }, [activeSession?.kind, activeSessionAddress]);

  const handleResize = useCallback((delta: number) => {
    setWidth((previous) => {
      const next = Math.max(
        EMBEDDED_BROWSER_MIN_WIDTH,
        Math.min(EMBEDDED_BROWSER_MAX_WIDTH, previous + delta),
      );
      setLocalStorageItem(EMBEDDED_BROWSER_WIDTH_STORAGE_KEY, next, Schema.Finite);
      return next;
    });
  }, []);

  const handleClose = useCallback(() => {
    if (activeScope === "thread" && currentThreadId) {
      closeThreadSession(currentThreadId);
      return;
    }
    closeGlobalSession();
  }, [activeScope, closeGlobalSession, closeThreadSession, currentThreadId]);

  const handleCollapseExpandedPreview = useCallback(() => {
    setIsExpanded(false);
  }, []);

  const handleExpandPreview = useCallback(() => {
    setIsExpanded(true);
  }, []);

  if (!activeSession) {
    return null;
  }

  const renderInSheet = shouldUseSheet || isExpanded;
  const canToggleExpandedPreview = !shouldUseSheet;

  const content = (
    <EmbeddedBrowserSurface
      activeSession={activeSession}
      activeScopeLabel={activeScope === "thread" ? "Thread preview" : "Shared preview"}
      onCollapseToggle={handleCollapseExpandedPreview}
      onExpandToggle={isExpanded ? handleCollapseExpandedPreview : handleExpandPreview}
      collapsed={false}
      expanded={isExpanded}
      expandDisabled={!canToggleExpandedPreview}
      collapseDisabled
      reloadCount={reloadCount}
      onReload={() => setReloadCount((count) => count + 1)}
    />
  );

  if (renderInSheet) {
    return (
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open) {
            if (shouldUseSheet) {
              handleClose();
              return;
            }
            handleCollapseExpandedPreview();
          }
        }}
      >
        <SheetPopup
          side="right"
          showCloseButton={false}
          keepMounted
          className={cn(
            "border-none bg-transparent p-3 shadow-none",
            shouldUseSheet
              ? "w-[min(92vw,860px)] max-w-[860px]"
              : "w-[calc(100vw-1.5rem)] max-w-[1600px]",
          )}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{activeSession.title}</SheetTitle>
            <SheetDescription>Embedded browser preview</SheetDescription>
          </SheetHeader>
          <div className="h-full min-h-0">{content}</div>
        </SheetPopup>
      </Sheet>
    );
  }

  return (
    <aside
      className="relative hidden h-dvh shrink-0 p-3 pl-0 xl:flex"
      style={{
        width,
        minWidth: EMBEDDED_BROWSER_MIN_WIDTH,
        maxWidth: EMBEDDED_BROWSER_MAX_WIDTH,
      }}
    >
      <ResizeEdgeHandle
        side="left"
        label="Resize embedded browser"
        className={cn("left-0 rounded-l-md", activeSession ? "block" : "hidden")}
        onResize={handleResize}
      />
      <div className="min-w-0 flex-1">{content}</div>
    </aside>
  );
}
