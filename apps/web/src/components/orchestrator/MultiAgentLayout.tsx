// FILE: MultiAgentLayout.tsx
// Purpose: Top-level layout container that switches between single-pane and rail-and-panels modes.
// Layer: Layout component
// Exports: MultiAgentLayout

import { useMultiAgentLayoutStore } from "~/lib/multiAgentLayoutStore";
import { AgentPanel } from "./AgentPanel";
import { OrchestratorRail, type ActiveRunStatus } from "./OrchestratorRail";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MultiAgentLayoutProps {
  orchestratorContent: React.ReactNode;
  agentContent?: (threadId: string) => React.ReactNode;
  onDirectMessage?: (workerId: string, message: string) => void;
  onTerminateAgent?: (workerId: string) => void;
  onPromoteAgent?: (workerId: string) => void;
  activeRunStatus?: ActiveRunStatus;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MultiAgentLayout({
  orchestratorContent,
  agentContent,
  onDirectMessage,
  onTerminateAgent,
  onPromoteAgent,
  activeRunStatus,
}: MultiAgentLayoutProps) {
  const {
    mode,
    railWidth,
    panelDividerRatio,
    foregroundPanels,
    backgroundAgents,
    promotedPanelWorkerId,
  } = useMultiAgentLayoutStore();

  // Single-pane: render orchestrator content full width
  if (mode === "single-pane") {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        {orchestratorContent}
      </div>
    );
  }

  // Rail-and-panels mode
  const promotedPanel = promotedPanelWorkerId
    ? foregroundPanels.find((p) => p.workerId === promotedPanelWorkerId)
    : null;

  return (
    <div className="flex min-h-0 w-full flex-1 overflow-hidden">
      {/* Left: Orchestrator Rail */}
      <OrchestratorRail
        width={railWidth}
        backgroundAgents={backgroundAgents}
        activeRunStatus={activeRunStatus}
        onPromoteAgent={onPromoteAgent}
      >
        {orchestratorContent}
      </OrchestratorRail>

      {/* Right: Agent panels area */}
      <div className="flex min-h-0 min-w-0 flex-1 gap-px overflow-hidden">
        {promotedPanel ? (
          // Promoted panel: single panel full width
          <AgentPanel
            agent={promotedPanel}
            onClose={() => onTerminateAgent?.(promotedPanel.workerId)}
            onDirectMessage={
              onDirectMessage
                ? (message) => onDirectMessage(promotedPanel.workerId, message)
                : undefined
            }
          >
            {agentContent?.(promotedPanel.threadId)}
          </AgentPanel>
        ) : (
          // Side-by-side foreground panels using panelDividerRatio
          foregroundPanels.map((panel, index) => (
            <div
              key={panel.workerId}
              className="flex min-h-0 min-w-0 overflow-hidden"
              style={{
                flex:
                  foregroundPanels.length === 1
                    ? "1 1 0%"
                    : index === 0
                      ? `${panelDividerRatio} 1 0%`
                      : `${1 - panelDividerRatio} 1 0%`,
              }}
            >
              <AgentPanel
                agent={panel}
                onClose={() => onTerminateAgent?.(panel.workerId)}
                onDirectMessage={
                  onDirectMessage
                    ? (message) => onDirectMessage(panel.workerId, message)
                    : undefined
                }
              >
                {agentContent?.(panel.threadId)}
              </AgentPanel>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
