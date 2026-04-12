// FILE: BackgroundAgentChip.tsx
// Purpose: Compact pill representation of a background agent with status icon and role.
// Layer: Presentational component
// Exports: BackgroundAgentChip

import type { AgentPanelState } from "~/lib/multiAgentLayoutStore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_ICONS: Record<string, string> = {
  running: "\u27F3", // ⟳
  idle: "\u25CB", // ○
  submitted: "\u2713", // ✓
  stuck: "!",
  paused: "\u23F8", // ⏸
  terminated: "\u2717", // ✗
};

function getStatusIcon(status: string): string {
  return STATUS_ICONS[status] ?? "\u25CB";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface BackgroundAgentChipProps {
  agent: AgentPanelState;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

export function BackgroundAgentChip({ agent, onClick, onDoubleClick }: BackgroundAgentChipProps) {
  const roleLabel = agent.role ?? `W-${agent.workerId.slice(-4)}`;
  const tooltip = [
    `Worker: ${agent.workerId.slice(-6)}`,
    `Model: ${agent.model}`,
    `Status: ${agent.status}`,
    agent.role ? `Role: ${agent.role}` : null,
    "Double-click to promote",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={tooltip}
      className="flex shrink-0 items-center gap-1 rounded-full border border-border/15 px-2 py-0.5 text-[10px] text-foreground/60 transition-colors hover:bg-accent/10 hover:text-foreground/80"
      style={{ borderLeftColor: agent.color, borderLeftWidth: 2 }}
    >
      <span className="shrink-0">{getStatusIcon(agent.status)}</span>
      <span className="max-w-[80px] truncate">{roleLabel}</span>
    </button>
  );
}
