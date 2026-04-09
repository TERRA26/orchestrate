import { useState, useCallback, useMemo } from "react";
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
import { WorkerCanvas } from "./WorkerCanvas";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface OrchestratorControlRoomProps {
  run: OrchestratorRun | null;
  tasks: ReadonlyArray<OrchestratorTask>;
  workers: ReadonlyArray<OrchestratorWorker>;
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
  children,
}: OrchestratorControlRoomProps) {
  const [leftRailCollapsed, setLeftRailCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(true);
  const [selectedEntityId, setSelectedEntityId] = useState<
    OrchestratorTaskId | OrchestratorWorkerId | null
  >(null);

  // Resolve the currently selected entity from its ID
  const selectedEntity = useMemo((): SelectedEntity | null => {
    if (!selectedEntityId) return null;
    const task = tasks.find((t) => t.taskId === selectedEntityId);
    if (task) return { type: "task", id: task.taskId, data: task };
    const worker = workers.find((w) => w.workerId === selectedEntityId);
    if (worker) return { type: "worker", id: worker.workerId, data: worker };
    return null;
  }, [selectedEntityId, tasks, workers]);

  const handleSelectTask = useCallback((taskId: OrchestratorTaskId) => {
    setSelectedEntityId(taskId);
    setInspectorCollapsed(false);
  }, []);

  const handleSelectWorker = useCallback((workerId: OrchestratorWorkerId) => {
    setSelectedEntityId(workerId);
    setInspectorCollapsed(false);
  }, []);

  const handleCloseInspector = useCallback(() => {
    setSelectedEntityId(null);
    setInspectorCollapsed(true);
  }, []);

  // Determine whether we have orchestration data to show
  const hasOrchestrationData = run !== null || tasks.length > 0 || workers.length > 0;

  // When no orchestration data, fall through to the simple transcript view
  if (!hasOrchestrationData) {
    return <div className="flex h-full w-full flex-col">{children}</div>;
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* ---- Left Rail ---- */}
      {!leftRailCollapsed && (
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
            onClick={() => setLeftRailCollapsed((p) => !p)}
            className="rounded p-1 text-muted-foreground/50 transition-colors hover:bg-accent/15 hover:text-muted-foreground"
            title={leftRailCollapsed ? "Show left rail" : "Hide left rail"}
          >
            {leftRailCollapsed ? (
              <PanelLeftOpenIcon className="size-3.5" />
            ) : (
              <PanelLeftCloseIcon className="size-3.5" />
            )}
          </button>

          <div className="flex-1" />

          <button
            type="button"
            onClick={() => {
              if (inspectorCollapsed) {
                setInspectorCollapsed(false);
              } else {
                handleCloseInspector();
              }
            }}
            className="rounded p-1 text-muted-foreground/50 transition-colors hover:bg-accent/15 hover:text-muted-foreground"
            title={inspectorCollapsed ? "Show inspector" : "Hide inspector"}
          >
            {inspectorCollapsed ? (
              <PanelRightOpenIcon className="size-3.5" />
            ) : (
              <PanelRightCloseIcon className="size-3.5" />
            )}
          </button>
        </div>

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
      {!inspectorCollapsed && (
        <div className="flex w-72 shrink-0 flex-col border-l border-border/20 bg-background/40">
          <OrchestratorInspector selectedEntity={selectedEntity} onClose={handleCloseInspector} />
        </div>
      )}
    </div>
  );
}
