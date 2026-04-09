import { useCallback, useMemo } from "react";
import {
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
} from "lucide-react";
import type {
  OrchestratorRun,
  OrchestratorTask,
  OrchestratorTaskId,
  OrchestratorWorker,
  OrchestratorWorkerId,
} from "@t3tools/contracts";

import { cn } from "~/lib/utils";
import type { SelectedEntity } from "./controlRoomTypes";
import { OrchestratorLeftRail } from "./OrchestratorLeftRail";
import { OrchestratorInspector } from "./OrchestratorInspector";
import {
  OrchestratorBrowserWorkspace,
  type BrowserWorkspaceProps,
} from "./OrchestratorBrowserWorkspace";
import { WorkerCanvas } from "./WorkerCanvas";
import { usePanelStateStore } from "./panelStateStore";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface OrchestratorControlRoomProps {
  run: OrchestratorRun | null;
  tasks: ReadonlyArray<OrchestratorTask>;
  workers: ReadonlyArray<OrchestratorWorker>;
  /** Browser workspace state — omit or pass undefined when no session exists */
  browserWorkspace?: Omit<BrowserWorkspaceProps, "isCollapsed" | "onToggleCollapse">;
  /** Slot for the existing transcript/messages view */
  children?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OrchestratorControlRoom({
  run,
  tasks,
  workers,
  browserWorkspace,
  children,
}: OrchestratorControlRoomProps) {
  const panelState = usePanelStateStore();

  // Derive a selected entity ID from the panel-state focused panel.
  // The focused panel may be a task or worker ID.
  const selectedEntityId = panelState.focusedPanelId as
    | OrchestratorTaskId
    | OrchestratorWorkerId
    | null;

  // Resolve the currently selected entity from its ID
  const selectedEntity = useMemo((): SelectedEntity | null => {
    if (!selectedEntityId) return null;
    const task = tasks.find((t) => t.taskId === selectedEntityId);
    if (task) return { type: "task", id: task.taskId, data: task };
    const worker = workers.find((w) => w.workerId === selectedEntityId);
    if (worker) return { type: "worker", id: worker.workerId, data: worker };
    return null;
  }, [selectedEntityId, tasks, workers]);

  const handleSelectTask = useCallback(
    (taskId: OrchestratorTaskId) => {
      panelState.focus(taskId);
      if (panelState.inspectorCollapsed) {
        panelState.toggleInspector();
      }
    },
    [panelState],
  );

  const handleSelectWorker = useCallback(
    (workerId: OrchestratorWorkerId) => {
      panelState.focus(workerId);
      if (panelState.inspectorCollapsed) {
        panelState.toggleInspector();
      }
    },
    [panelState],
  );

  const handleCloseInspector = useCallback(() => {
    panelState.focus(null as unknown as string);
    if (!panelState.inspectorCollapsed) {
      panelState.toggleInspector();
    }
  }, [panelState]);

  // Determine whether we have orchestration data to show
  const hasOrchestrationData = run !== null || tasks.length > 0 || workers.length > 0;

  // When no orchestration data, fall through to the simple transcript view
  if (!hasOrchestrationData) {
    return <div className="flex h-full w-full flex-col">{children}</div>;
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* ---- Left Rail ---- */}
      {!panelState.leftRailCollapsed && (
        <div className="flex w-60 shrink-0 flex-col border-r border-border/20 bg-background/40">
          <OrchestratorLeftRail
            run={run}
            tasks={tasks}
            workers={workers}
            selectedEntityId={selectedEntityId}
            onSelectTask={handleSelectTask}
            onSelectWorker={handleSelectWorker}
          />
        </div>
      )}

      {/* ---- Main Canvas ---- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Canvas toolbar */}
        <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border/20 px-1.5">
          <button
            type="button"
            onClick={panelState.toggleLeftRail}
            className="rounded p-1 text-muted-foreground/50 transition-colors hover:bg-accent/15 hover:text-muted-foreground"
            title={panelState.leftRailCollapsed ? "Show left rail" : "Hide left rail"}
          >
            {panelState.leftRailCollapsed ? (
              <PanelLeftOpenIcon className="size-3.5" />
            ) : (
              <PanelLeftCloseIcon className="size-3.5" />
            )}
          </button>

          <div className="flex-1" />

          <button
            type="button"
            onClick={() => {
              if (panelState.inspectorCollapsed) {
                panelState.toggleInspector();
              } else {
                handleCloseInspector();
              }
            }}
            className="rounded p-1 text-muted-foreground/50 transition-colors hover:bg-accent/15 hover:text-muted-foreground"
            title={panelState.inspectorCollapsed ? "Show inspector" : "Hide inspector"}
          >
            {panelState.inspectorCollapsed ? (
              <PanelRightOpenIcon className="size-3.5" />
            ) : (
              <PanelRightCloseIcon className="size-3.5" />
            )}
          </button>
        </div>

        {/* Browser workspace ribbon */}
        <OrchestratorBrowserWorkspace
          {...browserWorkspace}
          isCollapsed={panelState.browserCollapsed}
          onToggleCollapse={panelState.toggleBrowser}
        />

        {/* Worker panels grid */}
        {workers.length > 0 && (
          <div
            className={cn(
              "shrink-0 border-b border-border/20",
              workers.length <= 2 ? "h-40" : "h-56",
            )}
          >
            <WorkerCanvas workers={workers} />
          </div>
        )}

        {/* Transcript / existing messages (passed as children) */}
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>

      {/* ---- Right Inspector ---- */}
      {!panelState.inspectorCollapsed && (
        <div className="flex w-72 shrink-0 flex-col border-l border-border/20 bg-background/40">
          <OrchestratorInspector selectedEntity={selectedEntity} onClose={handleCloseInspector} />
        </div>
      )}
    </div>
  );
}
