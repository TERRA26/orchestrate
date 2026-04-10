import { Maximize2, Minimize2 } from "lucide-react";

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
// Component — compact, chrome-free browser embed for orchestrator panel
// ---------------------------------------------------------------------------

export function OrchestratorBrowserWorkspace({
  session,
  url,
  sessionMode = "stale",
  stepProgress,
  isCollapsed,
  onToggleCollapse,
}: BrowserWorkspaceProps) {
  if (!session && !url && sessionMode === "stale") return null;

  const displayedAddress =
    (session && "url" in session ? session.url : null) ?? session?.title ?? url ?? "";

  return (
    <div className="border-b border-border/10">
      {/* Minimal status line */}
      <div className="flex items-center gap-2 px-3 py-1">
        <span className="truncate font-mono text-[10px] text-muted-foreground/35">
          {displayedAddress || sessionMode}
        </span>
        {stepProgress && (
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground/40">
            {stepProgress.current}/{stepProgress.total}
          </span>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="ml-auto shrink-0 text-muted-foreground/30 hover:text-muted-foreground/60"
        >
          {isCollapsed ? <Maximize2 className="size-3" /> : <Minimize2 className="size-3" />}
        </button>
      </div>

      {/* Browser content — clean, no chrome */}
      {!isCollapsed && (
        <div className="h-28 bg-black/20">
          {session?.kind === "automation" && session.screenshotDataUrl ? (
            <img
              src={session.screenshotDataUrl}
              alt={session.title}
              className="h-full w-full object-contain object-top"
            />
          ) : session?.kind === "url" || (session && "url" in session) ? (
            <iframe
              title={session.title ?? "Browser preview"}
              src={displayedAddress || undefined}
              className="h-full w-full border-0 bg-background"
              sandbox="allow-downloads allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-scripts"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground/30">
              {sessionMode === "idle" ? "Ready" : "No session"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
