import { Globe, Maximize2, Minimize2, MousePointer } from "lucide-react";

import { cn } from "~/lib/utils";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BrowserWorkspaceProps {
  readonly url?: string;
  readonly sessionMode?: "live" | "automation" | "stale";
  readonly lastAction?: string;
  readonly stepProgress?: { current: number; total: number };
  readonly isCollapsed: boolean;
  readonly onToggleCollapse: () => void;
}

// ---------------------------------------------------------------------------
// Mode config
// ---------------------------------------------------------------------------

const MODE_CONFIG = {
  live: { label: "Live", className: "text-emerald-400 bg-emerald-500/10" },
  automation: { label: "Automation", className: "text-sky-400 bg-sky-500/10" },
  stale: { label: "Stale", className: "text-muted-foreground/60 bg-muted/10" },
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OrchestratorBrowserWorkspace({
  url,
  sessionMode = "stale",
  lastAction,
  stepProgress,
  isCollapsed,
  onToggleCollapse,
}: BrowserWorkspaceProps) {
  if (!url && sessionMode === "stale") return null;

  const modeConfig = MODE_CONFIG[sessionMode];

  return (
    <div className="border-b border-border/20">
      {/* Status ribbon - always visible */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <Globe className="size-3.5 text-muted-foreground/60" />
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
            modeConfig.className,
          )}
        >
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
          {/* Placeholder for actual browser rendering */}
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground/30">
            Browser viewport
          </div>
        </div>
      )}
    </div>
  );
}
