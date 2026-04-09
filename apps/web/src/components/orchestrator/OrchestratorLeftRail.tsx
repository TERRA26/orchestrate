import { CircleIcon } from "lucide-react";
import type {
  OrchestratorRun,
  OrchestratorTask,
  OrchestratorTaskId,
  OrchestratorWorker,
  OrchestratorWorkerId,
} from "@t3tools/contracts";

import { cn } from "~/lib/utils";
import { formatElapsedTime, getRunStatusDotColor } from "./controlRoomHelpers";
import { TaskTreeView } from "./TaskTreeView";
import { WorkerStatusIndicator } from "./WorkerPanel";

// ---------------------------------------------------------------------------
// StatusDot
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: string }) {
  return (
    <CircleIcon className={cn("size-2 shrink-0 fill-current", getRunStatusDotColor(status))} />
  );
}

// ---------------------------------------------------------------------------
// WorkerListItem
// ---------------------------------------------------------------------------

function WorkerListItem({
  worker,
  isSelected,
  onSelect,
}: {
  worker: OrchestratorWorker;
  isSelected: boolean;
  onSelect: (workerId: OrchestratorWorkerId) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(worker.workerId)}
      className={cn(
        "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] transition-colors",
        isSelected
          ? "bg-accent/30 text-foreground"
          : "text-foreground/70 hover:bg-accent/15 hover:text-foreground/90",
      )}
    >
      <WorkerStatusIndicator status={worker.status} />
      <span className="truncate font-mono">W-{worker.workerId.slice(-6)}</span>
      {worker.modelBinding && (
        <span
          className={cn(
            "ml-auto shrink-0 rounded px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wider",
            worker.modelBinding.provider === "codex"
              ? "bg-emerald-500/10 text-emerald-400/70"
              : "bg-violet-500/10 text-violet-400/70",
          )}
        >
          {worker.modelBinding.provider === "codex" ? "GPT" : "CLD"}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// OrchestratorLeftRail
// ---------------------------------------------------------------------------

export interface OrchestratorLeftRailProps {
  run: OrchestratorRun | null;
  tasks: ReadonlyArray<OrchestratorTask>;
  workers: ReadonlyArray<OrchestratorWorker>;
  selectedEntityId: OrchestratorTaskId | OrchestratorWorkerId | null;
  onSelectTask: (taskId: OrchestratorTaskId) => void;
  onSelectWorker: (workerId: OrchestratorWorkerId) => void;
}

export function OrchestratorLeftRail({
  run,
  tasks,
  workers,
  selectedEntityId,
  onSelectTask,
  onSelectWorker,
}: OrchestratorLeftRailProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Run header */}
      <div className="border-b border-border/20 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <StatusDot status={run?.status ?? "idle"} />
          <span className="truncate text-xs font-medium text-foreground/90">
            {run?.userRequest ?? "No active run"}
          </span>
        </div>
        {run && (
          <span className="mt-1 block font-mono text-[10px] text-muted-foreground/60">
            {formatElapsedTime(run.createdAt)}
          </span>
        )}
      </div>

      {/* Task tree */}
      <div className="flex-1 overflow-y-auto px-1 py-1.5">
        <div className="mb-1 px-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
            Tasks
          </span>
        </div>
        <TaskTreeView
          tasks={tasks}
          selectedTaskId={selectedEntityId as OrchestratorTaskId | null}
          onSelect={onSelectTask}
        />
      </div>

      {/* Worker list */}
      {workers.length > 0 && (
        <div className="border-t border-border/20 px-1 py-1.5">
          <div className="mb-1 px-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/40">
              Workers
            </span>
          </div>
          {workers.map((worker) => (
            <WorkerListItem
              key={worker.workerId}
              worker={worker}
              isSelected={selectedEntityId === worker.workerId}
              onSelect={onSelectWorker}
            />
          ))}
        </div>
      )}
    </div>
  );
}
