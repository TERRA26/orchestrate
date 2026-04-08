import React, { useCallback, useState } from "react";
import { Schema } from "effect";

import { getLocalStorageItem, setLocalStorageItem } from "~/hooks/useLocalStorage";
import { useOrchestratorEngine } from "./orchestrator/useOrchestratorEngine";
import { OrchestratorHeader } from "./orchestrator/OrchestratorHeader";
import { OrchestratorMessages } from "./orchestrator/OrchestratorMessages";
import { OrchestratorComposer } from "./orchestrator/OrchestratorComposer";
import { ResizeEdgeHandle } from "./ResizeEdgeHandle";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORCHESTRATOR_WIDTH_STORAGE_KEY = "orchestrator_panel_width";
const ORCHESTRATOR_DEFAULT_WIDTH = 380;
const ORCHESTRATOR_MIN_WIDTH = 280;
const ORCHESTRATOR_MAX_WIDTH = 600;

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
  // -- Width / resize --
  const [width, setWidth] = useState(() => {
    const stored = getLocalStorageItem(ORCHESTRATOR_WIDTH_STORAGE_KEY, Schema.Finite);
    return stored ?? ORCHESTRATOR_DEFAULT_WIDTH;
  });

  const persistWidth = useCallback((w: number) => {
    setLocalStorageItem(ORCHESTRATOR_WIDTH_STORAGE_KEY, w, Schema.Finite);
  }, []);

  const handleResize = useCallback(
    (delta: number) => {
      setWidth((prev) => {
        const next = Math.max(
          ORCHESTRATOR_MIN_WIDTH,
          Math.min(ORCHESTRATOR_MAX_WIDTH, prev + delta),
        );
        persistWidth(next);
        return next;
      });
    },
    [persistWidth],
  );

  // -- Engine --
  const engine = useOrchestratorEngine();

  return (
    <div
      className="relative flex h-dvh flex-col border-r border-border/30 bg-background/80 text-foreground backdrop-blur-xl backdrop-saturate-150 dark:border-white/[0.03] dark:bg-background/80"
      style={{
        width,
        minWidth: ORCHESTRATOR_MIN_WIDTH,
        maxWidth: ORCHESTRATOR_MAX_WIDTH,
      }}
    >
      <ResizeEdgeHandle label="Resize orchestrator panel" onResize={handleResize} />

      <OrchestratorHeader
        managedThread={engine.managedThread}
        agentPhase={engine.agentPhase}
        latestActivity={engine.latestActivity}
        status={engine.status}
        statusDetail={engine.statusDetail}
        threadBrowserSession={engine.threadBrowserSession}
        isThreadBrowserSessionVisible={engine.isThreadBrowserSessionVisible}
        isBusy={engine.isBusy}
        onToggleBrowserPreview={engine.handleToggleBrowserPreview}
        onStartNewChat={engine.handleStartNewChat}
      />

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
  );
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
