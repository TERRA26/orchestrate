import React from "react";

import { GoGitBranch } from "react-icons/go";

import { useOrchestratorEngine } from "./orchestrator/useOrchestratorEngine";
import { OrchestratorHeader } from "./orchestrator/OrchestratorHeader";
import { OrchestratorMessages } from "./orchestrator/OrchestratorMessages";
import { OrchestratorComposer } from "./orchestrator/OrchestratorComposer";
import { OrchestratorControlRoom } from "./orchestrator/OrchestratorControlRoom";
import { LocalWorkspacePopover } from "./LocalWorkspacePopover";

// ---------------------------------------------------------------------------
// Error boundary
// ---------------------------------------------------------------------------

interface ErrorBoundaryState {
  error: Error | null;
}

// ORC-218: outer boundary catches errors that escaped every inner
// boundary in the orchestrator subtree. Inner boundaries
// (CodeHighlightErrorBoundary in ChatMarkdown, HighlightErrorBoundary
// in FileWrittenRow) are truly local; per React semantics, an error
// caught by the inner boundary STOPS at that boundary and never
// re-throws to the outer one. The outer boundary therefore handles
// truly unhandled rendering bugs (state hook misuse, library crashes
// outside the inner zones, etc.). componentDidCatch logs both the
// error and component stack for postmortem debugging.
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

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("[OrchestratorErrorBoundary] caught", error, info.componentStack);
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

function OrchestratorPanelInner({ hideHeader = false }: { hideHeader?: boolean } = {}) {
  const engine = useOrchestratorEngine();

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col bg-background/80 text-foreground backdrop-blur-xl backdrop-saturate-150 dark:bg-background/80">
      {!hideHeader && (
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
      )}

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
            workLogEntries={engine.workLogEntries}
            requirementsChecklist={engine.requirementsChecklist}
            threadBrowserSession={engine.threadBrowserSession}
            isThreadBrowserSessionVisible={engine.isThreadBrowserSessionVisible}
            isBusy={engine.isBusy}
            scrollRef={engine.scrollRef}
            onOpenWorkerPanel={engine.handleOpenWorkerPanel}
            controlRoomMode
          />

          <OrchestratorComposer
            input={engine.input}
            canSend={engine.canSend}
            isBusy={engine.isBusy}
            agentState={engine.status}
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

          <div className="mx-auto flex h-[34px] w-full max-w-3xl items-center justify-between gap-2 px-3 pb-2 pt-0.5 font-mono">
            <div className="flex min-w-0 flex-1 items-center">
              <LocalWorkspacePopover />
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="inline-flex h-6 cursor-default items-center gap-1 rounded-sm px-2 text-[10px] font-normal text-muted-foreground/55">
                <GoGitBranch className="size-3 shrink-0 opacity-80" />
                main
              </span>
            </div>
          </div>
        </div>
      </OrchestratorControlRoom>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public export (wrapped with error boundary)
// ---------------------------------------------------------------------------

export function OrchestratorPanel({ hideHeader = false }: { hideHeader?: boolean } = {}) {
  return (
    <OrchestratorErrorBoundary>
      <OrchestratorPanelInner hideHeader={hideHeader} />
    </OrchestratorErrorBoundary>
  );
}
