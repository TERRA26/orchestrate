import React from "react";

import { useOrchestratorEngine } from "./orchestrator/useOrchestratorEngine";
import { OrchestratorHeader } from "./orchestrator/OrchestratorHeader";
import { OrchestratorMessages } from "./orchestrator/OrchestratorMessages";
import { OrchestratorComposer } from "./orchestrator/OrchestratorComposer";
import { OrchestratorControlRoom } from "./orchestrator/OrchestratorControlRoom";
import { MultiAgentLayout } from "./orchestrator/MultiAgentLayout";
import { useMultiAgentLayoutStore } from "~/lib/multiAgentLayoutStore";

// ---------------------------------------------------------------------------
// Error boundary
// ---------------------------------------------------------------------------

interface ErrorBoundaryState {
  error: Error | null;
}

class OrchestratorErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="flex h-dvh flex-col items-center justify-center gap-3 border-r border-border/30 bg-background/80 p-6 text-center dark:border-white/[0.03]">
          <p className="text-sm font-medium text-destructive">Orchestrator panel crashed</p>
          <p className="text-xs text-muted-foreground">{this.state.error.message}</p>
          <button
            type="button"
            className="mt-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
            onClick={() => this.setState({ error: null })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Panel (inner)
// ---------------------------------------------------------------------------

function OrchestratorPanelInner() {
  const engine = useOrchestratorEngine();
  const layoutMode = useMultiAgentLayoutStore((s) => s.mode);

  const orchestratorContent = (
    <div
      className="relative flex h-dvh flex-1 flex-col bg-background/80 text-foreground backdrop-blur-xl backdrop-saturate-150 dark:bg-background/80"
    >

      <OrchestratorHeader
        status={engine.status}
        statusDetail={engine.statusDetail}
        threadBrowserSession={engine.threadBrowserSession}
        isThreadBrowserSessionVisible={engine.isThreadBrowserSessionVisible}
        hasBrowserContext={engine.threadBrowserSession !== null}
        isBusy={engine.isBusy}
        onToggleBrowserPreview={engine.handleToggleBrowserPreview}
        onStartNewChat={engine.handleStartNewChat}
      />

      {/* Control Room wraps the existing messages+composer.
          When no orchestration data exists (run=null, tasks=[], workers=[]),
          the ControlRoom falls through and renders children directly. */}
      <OrchestratorControlRoom
        run={engine.orchestratorRun}
        tasks={engine.orchestratorTasks}
        workers={engine.orchestratorWorkers}
        panelWidth={0}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <OrchestratorMessages
            messages={engine.messages}
            requirementsChecklist={engine.requirementsChecklist}
            threadBrowserSession={engine.threadBrowserSession}
            isThreadBrowserSessionVisible={engine.isThreadBrowserSessionVisible}
            isBusy={engine.isBusy}
            scrollRef={engine.scrollRef}
          />

          <OrchestratorComposer
            input={engine.input}
            canSend={engine.canSend}
            isBusy={engine.isBusy}
            selectedProvider={engine.selectedProvider}
            selectedModel={engine.selectedModel}
            selectedProviderModels={engine.selectedProviderModels}
            modelOptionsByProvider={engine.modelOptionsByProvider}
            composerModelOptions={engine.composerModelOptions}
            composerProviderState={engine.composerProviderState}
            onInputChange={engine.setInput}
            onSend={engine.send}
            onModelChange={engine.handleModelChange}
            onPromptChangeFromTraits={engine.handlePromptChangeFromTraits}
          />
        </div>
      </OrchestratorControlRoom>
    </div>
  );

  if (layoutMode === "rail-and-panels") {
    return (
      <MultiAgentLayout
        orchestratorContent={orchestratorContent}
        agentContent={(threadId) => (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Agent thread {threadId.slice(0, 8)}... loading
          </div>
        )}
      />
    );
  }

  return orchestratorContent;
}

// ---------------------------------------------------------------------------
// Public export (wrapped with error boundary)
// ---------------------------------------------------------------------------

export function OrchestratorPanel() {
  return (
    <OrchestratorErrorBoundary>
      <OrchestratorPanelInner />
    </OrchestratorErrorBoundary>
  );
}
