import { useState } from "react";
import { ExternalLinkIcon, Maximize2Icon, Minimize2Icon, MonitorIcon } from "lucide-react";

import { EmbeddedBrowserSurface } from "~/components/EmbeddedBrowserPane";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPopup,
  SheetTitle,
} from "~/components/ui/sheet";
import type { EmbeddedBrowserSession } from "~/embeddedBrowserStateStore";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BrowserWorkspaceProps {
  readonly session?: EmbeddedBrowserSession | null;
  readonly url?: string;
  readonly sessionMode?: "live" | "automation" | "stale" | "idle";
  readonly lastAction?: string;
  readonly stepProgress?: { current: number; total: number };
  readonly isCollapsed: boolean;
  readonly onToggleCollapse: () => void;
}

// ---------------------------------------------------------------------------
// Component — compact left-aligned thumbnail with action icons
// ---------------------------------------------------------------------------

export function OrchestratorBrowserWorkspace({
  session,
  url,
  sessionMode = "stale",
  stepProgress,
  isCollapsed,
  onToggleCollapse,
}: BrowserWorkspaceProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);

  if (!session && !url && sessionMode === "stale") return null;

  const displayedAddress =
    (session && "url" in session ? session.url : null) ?? session?.title ?? url ?? "";

  const handleOpenExternal = () => {
    if (displayedAddress) window.open(displayedAddress, "_blank", "noopener");
  };

  return (
    <div className="border-b border-border/10">
      {/* URL + step progress + actions — single compact line */}
      <div className="flex items-center gap-2 px-3 py-1">
        <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground/35">
          {displayedAddress || sessionMode}
        </span>
        {stepProgress ? (
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground/40">
            {stepProgress.current}/{stepProgress.total}
          </span>
        ) : null}

        {/* Action icons — right aligned */}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {session ? (
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="rounded p-1 text-muted-foreground/25 transition-colors hover:bg-accent/10 hover:text-muted-foreground/60"
              title="Open in app"
            >
              <MonitorIcon className="size-3" />
            </button>
          ) : null}
          {displayedAddress ? (
            <button
              type="button"
              onClick={handleOpenExternal}
              className="rounded p-1 text-muted-foreground/25 transition-colors hover:bg-accent/10 hover:text-muted-foreground/60"
              title="Open in new tab"
            >
              <ExternalLinkIcon className="size-3" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onToggleCollapse}
            className="rounded p-1 text-muted-foreground/25 transition-colors hover:bg-accent/10 hover:text-muted-foreground/60"
            title={isCollapsed ? "Show preview" : "Hide preview"}
          >
            {isCollapsed ? (
              <Maximize2Icon className="size-3" />
            ) : (
              <Minimize2Icon className="size-3" />
            )}
          </button>
        </div>
      </div>

      {/* Browser content — left-aligned compact thumbnail */}
      {!isCollapsed && (
        <div className="flex items-start gap-2 px-3 pb-2">
          <div className="h-20 w-32 shrink-0 overflow-hidden rounded bg-black/20">
            {session?.kind === "automation" && session.screenshotDataUrl ? (
              <img
                src={session.screenshotDataUrl}
                alt={session.title}
                className="h-full w-full object-cover object-top"
              />
            ) : session?.kind === "url" ? (
              <iframe
                title={session.title ?? "Browser preview"}
                src={session.url}
                className="h-full w-full origin-top-left scale-50 border-0 bg-background"
                style={{ width: "200%", height: "200%" }}
                sandbox="allow-scripts"
                tabIndex={-1}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[9px] text-muted-foreground/20">
                {sessionMode === "idle" ? "Ready" : "No session"}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Full browser sheet — opens maximized, closing returns to compact workspace */}
      {session ? (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
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
                activeScopeLabel="Browser workspace"
                onCollapseToggle={() => setSheetOpen(false)}
                onExpandToggle={() => setSheetOpen(false)}
                collapsed={false}
                expanded
                expandDisabled
                collapseDisabled={false}
                reloadCount={reloadCount}
                onReload={() => setReloadCount((c) => c + 1)}
              />
            </div>
          </SheetPopup>
        </Sheet>
      ) : null}
    </div>
  );
}
