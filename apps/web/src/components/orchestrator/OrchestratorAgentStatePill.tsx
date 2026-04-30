import { cn } from "~/lib/utils";
import type { OrchestratorStatus } from "./useOrchestratorEngine";

export function agentStatePillLabel(status: OrchestratorStatus): string {
  if (status === "thinking" || status === "sending") return "thinking";
  if (status === "reviewing") return "working";
  if (status === "waiting") return "waiting";
  if (status === "completed" || status === "idle") return "ready";
  return "blocked";
}

export function AgentStatePill({ status }: { status: OrchestratorStatus }) {
  const label = agentStatePillLabel(status);
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded border px-2 text-[10px] font-medium lowercase",
        label === "blocked"
          ? "border-rose-500/25 text-rose-300"
          : label === "waiting"
            ? "border-amber-500/30 text-amber-300"
            : label === "ready"
              ? "border-border/40 text-muted-foreground"
              : "border-border/50 text-muted-foreground",
      )}
      data-agent-state-pill={label}
    >
      {label}
    </span>
  );
}
