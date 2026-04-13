import { useEffect } from "react";
import { ORCHESTRATION_TOOL_NAMES } from "@t3tools/contracts";
import { useOrchestratorPaneStore } from "~/lib/orchestratorPaneStore";

interface OrchestrationToolCallCardProps {
  toolName: string;
  input: unknown;
  result: unknown;
  isLoading?: boolean;
}

export function isOrchestrationToolCall(toolName: string): boolean {
  return ORCHESTRATION_TOOL_NAMES.has(toolName);
}

export function OrchestrationToolCallCard({
  toolName,
  input,
  result,
  isLoading,
}: OrchestrationToolCallCardProps) {
  const { focusAgent, collapseAgent } = useOrchestratorPaneStore();

  useEffect(() => {
    if (!result || isLoading) return;
    const res = result as Record<string, unknown>;

    if (toolName === "focus_agent" && res.threadId) {
      focusAgent(String(res.threadId));
    }
    if (toolName === "collapse_panel" && res.threadId) {
      collapseAgent(String(res.threadId));
    }
    if (toolName === "spawn_agent" && res.threadId) {
      const inp = input as Record<string, unknown>;
      if (inp.mode !== "background") {
        focusAgent(String(res.threadId));
      }
    }
  }, [toolName, input, result, isLoading, focusAgent, collapseAgent]);
  const parsed = input as Record<string, unknown>;

  switch (toolName) {
    case "spawn_agent": {
      const role = String(parsed.role ?? "agent");
      const model = String(parsed.model ?? "unknown");
      const mode = String(parsed.mode ?? "foreground");
      return (
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm">
          <span className="text-emerald-400">+</span>
          <span className="font-medium">Spawned {role}</span>
          <span className="text-muted-foreground">on</span>
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{model}</span>
          {mode === "background" && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              background
            </span>
          )}
          {isLoading && <span className="animate-pulse text-muted-foreground">...</span>}
        </div>
      );
    }
    case "terminate_agent": {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
          <span className="text-destructive">x</span>
          <span>Terminated agent</span>
          <span className="text-muted-foreground">{String(parsed.reason ?? "")}</span>
        </div>
      );
    }
    case "accept_work": {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm">
          <span className="text-emerald-400">{"\u2713"}</span>
          <span className="font-medium">Work accepted</span>
        </div>
      );
    }
    case "reject_work": {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
          <span className="text-amber-400">{"\u21BB"}</span>
          <span className="font-medium">Revision requested</span>
          <span className="text-xs text-muted-foreground">{String(parsed.reason ?? "")}</span>
        </div>
      );
    }
    case "wait_all":
    case "wait_agent": {
      if (isLoading) {
        return (
          <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm">
            <span className="animate-pulse text-blue-400">{"\u23F3"}</span>
            <span className="text-muted-foreground">Waiting for agents to complete...</span>
          </div>
        );
      }
      return (
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm">
          <span className="text-blue-400">{"\u2713"}</span>
          <span>All agents completed</span>
        </div>
      );
    }
    case "get_all_status":
    case "get_agent_status": {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">{"\uD83D\uDCCA"}</span>
          <span className="text-muted-foreground">Checked agent status</span>
        </div>
      );
    }
    case "review_agent_work": {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">{"\uD83D\uDD0D"}</span>
          <span>Reviewing agent work</span>
          {isLoading && <span className="animate-pulse text-muted-foreground">...</span>}
        </div>
      );
    }
    case "send_to_agent":
    case "broadcast": {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">{"\u2192"}</span>
          <span>Sent instruction to agent</span>
        </div>
      );
    }
    case "focus_agent":
    case "promote_to_foreground":
    case "promote_panel": {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-sm">
          <span className="text-sky-400">{"\u25A3"}</span>
          <span className="font-medium">Brought agent panel to the front</span>
          {isLoading && <span className="animate-pulse text-muted-foreground">...</span>}
        </div>
      );
    }
    default: {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">{"\u2699"}</span>
          <span className="font-mono text-xs">{toolName}</span>
          {isLoading && <span className="animate-pulse text-muted-foreground">...</span>}
        </div>
      );
    }
  }
}
