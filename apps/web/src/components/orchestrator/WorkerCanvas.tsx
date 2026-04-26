import { useCallback, useMemo } from "react";
import type {
  OrchestratorTask,
  OrchestratorWorker,
  OrchestratorWorkerId,
} from "@orchestrate/contracts";

import { cn } from "~/lib/utils";
import { WorkerPanel, WorkerChip } from "./WorkerPanel";
import { usePanelStateStore } from "./panelStateStore";

// ---------------------------------------------------------------------------
// Grid class helper
// ---------------------------------------------------------------------------

function getGridClass(count: number, hasPromoted: boolean): string {
  if (hasPromoted) return "grid-cols-1";
  if (count <= 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-2";
  if (count === 3) return "grid-cols-2";
  return "grid-cols-2 grid-rows-2";
}

// ---------------------------------------------------------------------------
// WorkerCanvas
// ---------------------------------------------------------------------------

export interface WorkerCanvasProps {
  workers: ReadonlyArray<OrchestratorWorker>;
  tasks?: ReadonlyArray<OrchestratorTask>;
}

export function WorkerCanvas({ workers, tasks }: WorkerCanvasProps) {
  const focusedPanelId = usePanelStateStore((s) => s.focusedPanelId);
  const promotedPanelId = usePanelStateStore((s) => s.promotedPanelId);
  const focus = usePanelStateStore((s) => s.focus);
  const promote = usePanelStateStore((s) => s.promote);

  const taskByWorkerId = useMemo(() => {
    if (!tasks || tasks.length === 0) return new Map<OrchestratorWorkerId, OrchestratorTask>();
    const byId = new Map<string, OrchestratorTask>();
    for (const task of tasks) {
      byId.set(task.taskId as unknown as string, task);
    }
    const result = new Map<OrchestratorWorkerId, OrchestratorTask>();
    for (const worker of workers) {
      const taskId = worker.taskId as unknown as string | undefined;
      if (!taskId) continue;
      const task = byId.get(taskId);
      if (task) result.set(worker.workerId, task);
    }
    return result;
  }, [tasks, workers]);

  const focusedWorkerId = focusedPanelId as OrchestratorWorkerId | null;
  const promotedWorkerId = promotedPanelId as OrchestratorWorkerId | null;

  const handleFocus = useCallback(
    (workerId: OrchestratorWorkerId) => {
      focus(workerId);
    },
    [focus],
  );

  const handlePromote = useCallback(
    (workerId: OrchestratorWorkerId) => {
      promote(workerId);
    },
    [promote],
  );

  if (workers.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-[11px] text-muted-foreground/40">
        No active workers
      </div>
    );
  }

  // When a worker is promoted, only show that one in the main grid
  const visibleWorkers = promotedWorkerId
    ? workers.filter((w) => w.workerId === promotedWorkerId)
    : workers.slice(0, 4);

  const overflowWorkers = promotedWorkerId
    ? workers.filter((w) => w.workerId !== promotedWorkerId)
    : workers.slice(4);

  const gridClass = getGridClass(visibleWorkers.length, !!promotedWorkerId);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className={cn("grid flex-1 gap-1 p-1", gridClass)}>
        {visibleWorkers.map((worker) => (
          <WorkerPanel
            key={worker.workerId}
            worker={worker}
            task={taskByWorkerId.get(worker.workerId)}
            isFocused={focusedWorkerId === worker.workerId}
            isPromoted={promotedWorkerId === worker.workerId}
            onClick={() => handleFocus(worker.workerId)}
            onDoubleClick={() => handlePromote(worker.workerId)}
          />
        ))}
      </div>

      {overflowWorkers.length > 0 && (
        <div className="flex gap-1 overflow-x-auto border-t border-border/20 px-1 py-1">
          {overflowWorkers.map((worker) => (
            <WorkerChip key={worker.workerId} worker={worker} />
          ))}
        </div>
      )}
    </div>
  );
}
