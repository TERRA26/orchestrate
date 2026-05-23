import { cn } from "~/lib/utils";
import type { OrchestratorStatus } from "./useOrchestratorEngine";

export function agentStatePillLabel(status: OrchestratorStatus): string {
  if (status === "thinking" || status === "sending") return "thinking";
  if (status === "reviewing") return "working";
  if (status === "waiting") return "waiting";
  if (status === "completed" || status === "idle") return "ready";
  return "blocked";
}

export function shouldShowOrchestratorComposerAgentState(_status: OrchestratorStatus): boolean {
  return false;
}

export function AgentStatePill({ status }: { status: OrchestratorStatus }) {
  const label = agentStatePillLabel(status);
  // Animated dot reinforces the state at a glance: pulsing emerald when the
  // agent is actively working, amber when waiting on user input, rose on
  // failure, and a still neutral dot when idle/ready.
  const dotClass =
    label === "blocked"
      ? "bg-rose-400/85 animate-pulse"
      : label === "waiting"
        ? "bg-amber-400/85"
        : label === "thinking" || label === "working"
          ? "bg-emerald-400/85 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.55)]"
          : "bg-muted-foreground/45";
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded border px-2 text-[10px] font-medium lowercase transition-all duration-300",
        label === "blocked"
          ? "border-rose-500/30 bg-rose-500/[0.04] text-rose-300"
          : label === "waiting"
            ? "border-amber-500/30 bg-amber-500/[0.04] text-amber-300"
            : label === "thinking" || label === "working"
              ? "border-emerald-500/25 bg-emerald-500/[0.04] text-emerald-200"
              : label === "ready"
                ? "border-border/40 text-muted-foreground"
                : "border-border/50 text-muted-foreground",
      )}
      data-agent-state-pill={label}
      title={
        label === "blocked"
          ? "Agent is blocked — review the latest message and unblock"
          : label === "waiting"
            ? "Agent is waiting on user input"
            : label === "thinking" || label === "working"
              ? "Agent is actively working"
              : "Agent is ready for the next instruction"
      }
    >
      <span className={cn("size-1.5 rounded-full transition-colors", dotClass)} aria-hidden />
      {label}
    </span>
  );
}
