import { useEffect } from "react";
import { ORCHESTRATION_TOOL_NAMES } from "@orchestrate/contracts";
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

    if (toolName === "orchestrate_focus_agent" && res.threadId) {
      focusAgent(String(res.threadId));
    }
    if (toolName === "orchestrate_collapse_panel" && res.threadId) {
      collapseAgent(String(res.threadId));
    }
    if (toolName === "orchestrate_spawn_agent" && res.threadId) {
      const inp = input as Record<string, unknown>;
      if (inp.mode !== "background") {
        focusAgent(String(res.threadId));
      }
    }
  }, [toolName, input, result, isLoading, focusAgent, collapseAgent]);
  const parsed = input as Record<string, unknown>;

  switch (toolName) {
    case "orchestrate_spawn_agent": {
      const task = String(parsed.task ?? parsed.objective ?? "Agent task");
      const model = String(parsed.model ?? "");
      const provider = String(parsed.provider ?? "");
      const mode = String(parsed.mode ?? "foreground");
      const res = (result ?? {}) as Record<string, unknown>;
      const workerId =
        typeof res.workerId === "string"
          ? res.workerId.slice(-8)
          : typeof res.agentId === "string"
            ? res.agentId.slice(-8)
            : null;
      const statusLabel = isLoading ? "running" : res.agentId || res.workerId ? "done" : "queued";
      const statusClass = isLoading
        ? "orch-status-running"
        : statusLabel === "done"
          ? "orch-status-done"
          : "";
      return (
        <div className="orch-spawn-card">
          <div className="orch-spawn-head">
            <span className="orch-spawn-tool">orchestrate_spawn_agent</span>
            <span className={`orch-spawn-status ${statusClass}`}>
              <span
                className={`orch-status-dot ${isLoading ? "orch-pulsing" : ""}`}
                aria-hidden="true"
              />
              {statusLabel}
            </span>
          </div>
          <div className="orch-spawn-body">
            <div className="orch-spawn-worker-id">
              {workerId ? <span className="orch-worker-badge">{workerId}</span> : null}
              <span className="orch-spawn-title">{task}</span>
            </div>
            <div className="orch-spawn-params">
              {model ? <span className="orch-id-chip">{model}</span> : null}
              {provider ? <span className="orch-id-chip">{provider}</span> : null}
              {mode ? (
                <>
                  <span className="orch-sep">·</span>
                  <span>{mode}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>
      );
    }
    case "orchestrate_terminate_agent": {
      return (
        <div className="orch-accept-card" style={{ borderColor: "var(--destructive)" }}>
          <div className="orch-accept-head">
            <span className="orch-accept-icon" style={{ background: "var(--destructive)" }}>
              {"\u00D7"}
            </span>
            <span className="orch-accept-label" style={{ color: "var(--destructive)" }}>
              Agent terminated
            </span>
          </div>
          {parsed.reason ? (
            <div className="text-xs text-muted-foreground">{String(parsed.reason)}</div>
          ) : null}
        </div>
      );
    }
    case "orchestrate_accept_work": {
      return (
        <div className="orch-accept-card">
          <div className="orch-accept-head">
            <span className="orch-accept-icon">{"\u2713"}</span>
            <span className="orch-accept-label">Work accepted</span>
          </div>
        </div>
      );
    }
    case "orchestrate_reject_work": {
      return (
        <div className="orch-accept-card" style={{ borderColor: "var(--warning)" }}>
          <div className="orch-accept-head">
            <span className="orch-accept-icon" style={{ background: "var(--warning)" }}>
              {"\u21BB"}
            </span>
            <span className="orch-accept-label" style={{ color: "var(--warning)" }}>
              Revision requested
            </span>
          </div>
          {parsed.reason ? (
            <div className="text-xs text-muted-foreground">{String(parsed.reason)}</div>
          ) : null}
        </div>
      );
    }
    case "orchestrate_wait_all":
    case "orchestrate_wait_agent": {
      return (
        <div className={`orch-think-row ${isLoading ? "orch-think-live" : ""}`}>
          {isLoading ? (
            <span className="orch-think-spin">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                aria-hidden="true"
                className="animate-spin"
              >
                <path d="M21 12a9 9 0 1 1-9-9" />
              </svg>
            </span>
          ) : (
            <span className="orch-think-check">{"\u2713"}</span>
          )}
          <span>{isLoading ? "Waiting for agent…" : "Agent idle"}</span>
        </div>
      );
    }
    case "orchestrate_get_all_status":
    case "orchestrate_get_agent_status": {
      return (
        <div className="orch-think-row">
          <span className="orch-section-label">Status</span>
          <span className="text-muted-foreground">Checked agent status</span>
        </div>
      );
    }
    case "orchestrate_review_agent_work": {
      return (
        <div className={`orch-think-row ${isLoading ? "orch-think-live" : ""}`}>
          <span className="orch-section-label">Review</span>
          <span className="text-muted-foreground">Reviewing agent work</span>
          {isLoading ? <span className="animate-pulse text-muted-foreground">…</span> : null}
        </div>
      );
    }
    case "orchestrate_send_to_agent":
    case "orchestrate_broadcast": {
      return (
        <div className="orch-think-row">
          <span className="orch-section-label">Msg</span>
          <span>Sent instruction to agent</span>
        </div>
      );
    }
    case "orchestrate_focus_agent":
    case "orchestrate_promote_to_foreground":
    case "orchestrate_promote_panel": {
      return (
        <div className="orch-think-row">
          <span className="orch-section-label">Focus</span>
          <span>Brought agent panel to the front</span>
          {isLoading ? <span className="animate-pulse text-muted-foreground">…</span> : null}
        </div>
      );
    }
    default: {
      return (
        <div className="orch-think-row">
          <span className="orch-section-label">Tool</span>
          <span className="font-mono text-[11.5px]">{toolName}</span>
          {isLoading ? <span className="animate-pulse text-muted-foreground">…</span> : null}
        </div>
      );
    }
  }
}
