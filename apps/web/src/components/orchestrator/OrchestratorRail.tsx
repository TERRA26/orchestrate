// FILE: OrchestratorRail.tsx
// Purpose: Left rail containing orchestrator chat, run status bar, and background agent chips.
// Layer: Layout component
// Exports: OrchestratorRail

import type { AgentPanelState } from "~/lib/multiAgentLayoutStore";
import { cn } from "~/lib/utils";
import { BackgroundAgentChip } from "./BackgroundAgentChip";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActiveRunStatus {
  taskCount: number;
  workerCount: number;
  elapsedTime: string;
}

export interface OrchestratorRailProps {
  width: number;
  backgroundAgents: AgentPanelState[];
  activeRunStatus?: ActiveRunStatus;
  onPromoteAgent?: (workerId: string) => void;
  children?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OrchestratorRail({
  width,
  backgroundAgents,
  activeRunStatus,
  onPromoteAgent,
  children,
}: OrchestratorRailProps) {
  return (
    <div
      className="flex shrink-0 flex-col border-r border-border/20 bg-background/40"
      style={{ width }}
    >
      {/* Run status bar */}
      {activeRunStatus ? (
        <div className="flex shrink-0 items-center gap-3 border-b border-border/15 px-3 py-1.5">
          <span className="text-[10px] font-medium text-foreground/60">
            {activeRunStatus.taskCount} {activeRunStatus.taskCount === 1 ? "task" : "tasks"}
          </span>
          <span className="text-[10px] text-muted-foreground/40">
            {activeRunStatus.workerCount} {activeRunStatus.workerCount === 1 ? "worker" : "workers"}
          </span>
          <span className="ml-auto font-mono text-[10px] text-muted-foreground/35">
            {activeRunStatus.elapsedTime}
          </span>
        </div>
      ) : null}

      {/* Scrollable orchestrator chat content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>

      {/* Background agent chips */}
      {backgroundAgents.length > 0 ? (
        <div
          className={cn(
            "shrink-0 border-t border-border/15 px-2 py-1.5",
            "flex flex-wrap items-center gap-1.5",
          )}
        >
          <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/40">
            Background
          </span>
          {backgroundAgents.map((agent) => (
            <BackgroundAgentChip
              key={agent.workerId}
              agent={agent}
              onClick={() => onPromoteAgent?.(agent.workerId)}
              onDoubleClick={() => onPromoteAgent?.(agent.workerId)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
