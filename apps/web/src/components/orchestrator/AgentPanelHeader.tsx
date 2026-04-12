// FILE: AgentPanelHeader.tsx
// Purpose: Header bar for an individual agent panel showing model, role, status, and close action.
// Layer: Presentational component
// Exports: AgentPanelHeader

import { XIcon } from "lucide-react";

import type { AgentPanelState } from "~/lib/multiAgentLayoutStore";
import { cn } from "~/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ModelIcon({ model }: { model: string }) {
  const isCodex = model.startsWith("gpt") || model.startsWith("o") || model.includes("codex");
  const letter = isCodex ? "X" : "C";
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-bold",
        isCodex ? "bg-foreground/10 text-foreground/70" : "bg-foreground/10 text-foreground/70",
      )}
    >
      {letter}
    </span>
  );
}

function StatusLabel({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider",
        status === "running" && "bg-foreground/10 text-foreground/60",
        status === "idle" && "bg-muted-foreground/10 text-muted-foreground/50",
        status === "submitted" && "bg-foreground/10 text-foreground/50",
        status === "stuck" && "animate-pulse bg-foreground/15 text-foreground/60",
        status === "paused" && "bg-muted-foreground/10 text-muted-foreground/40",
        status === "terminated" && "bg-muted-foreground/10 text-muted-foreground/30",
      )}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface AgentPanelHeaderProps {
  agent: AgentPanelState;
  onClose?: () => void;
}

export function AgentPanelHeader({ agent, onClose }: AgentPanelHeaderProps) {
  return (
    <div
      className="flex shrink-0 items-center gap-2 border-b border-border/20 px-2.5 py-1.5"
      style={{ borderLeftColor: agent.color, borderLeftWidth: 3 }}
    >
      <ModelIcon model={agent.model} />
      <span className="truncate text-[11px] font-medium text-foreground/80">
        {agent.role ?? `Worker ${agent.workerId.slice(-6)}`}
      </span>
      <StatusLabel status={agent.status} />
      <div className="flex-1" />
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-muted-foreground/40 transition-colors hover:bg-accent/15 hover:text-muted-foreground"
          title="Close panel"
        >
          <XIcon className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
