import { useState, useCallback } from "react";
import type { OrchestratorWorker, OrchestratorWorkerId } from "@t3tools/contracts";

import { cn } from "~/lib/utils";
import { WorkerPanel, WorkerChip } from "./WorkerPanel";

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
}

export function WorkerCanvas({ workers }: WorkerCanvasProps) {
  const [focusedWorkerId, setFocusedWorkerId] = useState<OrchestratorWorkerId | null>(null);
  const [promotedWorkerId, setPromotedWorkerId] = useState<OrchestratorWorkerId | null>(null);

  const handleFocus = useCallback((workerId: OrchestratorWorkerId) => {
    setFocusedWorkerId(workerId);
  }, []);

  const handlePromote = useCallback((workerId: OrchestratorWorkerId) => {
    setPromotedWorkerId((prev) => (prev === workerId ? null : workerId));
  }, []);

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
