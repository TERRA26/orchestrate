import { Globe, Maximize2, Minimize2, MousePointer } from "lucide-react";

import { InlineEmbeddedBrowserCard } from "~/components/EmbeddedBrowserPane";
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
// Mode config
// ---------------------------------------------------------------------------

const MODE_CONFIG = {
  live: { label: "Live" },
  automation: { label: "Automation" },
  idle: { label: "Idle" },
  stale: { label: "Stale" },
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OrchestratorBrowserWorkspace({
  session,
  url,
  sessionMode = "stale",
  lastAction,
  stepProgress,
  isCollapsed,
  onToggleCollapse,
}: BrowserWorkspaceProps) {
  if (!session && !url && sessionMode === "stale") return null;

  const modeConfig = MODE_CONFIG[sessionMode];

  return (
    <div className="border-b border-border/20">
      {/* Status ribbon - always visible */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <Globe className="size-3.5 text-muted-foreground/60" />
        <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">
          {modeConfig.label}
        </span>
        {stepProgress && (
          <span className="font-mono text-[10px] text-muted-foreground/50">
            Step {stepProgress.current}/{stepProgress.total}
          </span>
        )}
        {lastAction && (
          <>
            <span className="text-muted-foreground/30">&middot;</span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
              <MousePointer className="size-2.5" />
              {lastAction}
            </span>
          </>
        )}
        {url && (
          <>
            <span className="text-muted-foreground/30">&middot;</span>
            <span className="truncate font-mono text-[10px] text-muted-foreground/40">{url}</span>
          </>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="ml-auto text-muted-foreground/40 hover:text-muted-foreground/70"
        >
          {isCollapsed ? <Maximize2 className="size-3" /> : <Minimize2 className="size-3" />}
        </button>
      </div>

      {/* Browser content - only when expanded */}
      {!isCollapsed && (
        <div className="h-48 border-t border-border/10 bg-background/20">
          {session ? (
            <InlineEmbeddedBrowserCard
              session={session}
              scopeLabel="Browser workspace"
              className="h-full"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1.5 px-4 text-center">
              <p className="text-xs font-medium text-foreground/60">
                {sessionMode === "idle"
                  ? "Browser workspace is ready"
                  : "Browser viewport unavailable"}
              </p>
              <p className="text-[11px] text-muted-foreground/40">
                {sessionMode === "idle"
                  ? "A live browser session will appear here when preview validation starts or a preview is attached to this thread."
                  : "No browser session is attached to this orchestrator thread yet."}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
