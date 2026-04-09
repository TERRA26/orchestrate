import { XIcon } from "lucide-react";
import type { OrchestratorTask, OrchestratorWorker } from "@t3tools/contracts";

import { cn } from "~/lib/utils";
import type { SelectedEntity } from "./controlRoomTypes";
import { getTaskStatusConfig, getWorkerStatusStyle, formatElapsedTime } from "./controlRoomHelpers";

// ---------------------------------------------------------------------------
// Task inspector
// ---------------------------------------------------------------------------

function TaskInspector({ task }: { task: OrchestratorTask }) {
  const statusConfig = getTaskStatusConfig(task.status);

  return (
    <div className="space-y-3 p-3">
      {/* Title & status */}
      <div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded-sm text-[9px] font-bold text-white",
              statusConfig.color,
            )}
          >
            {statusConfig.label}
          </span>
          <span className="text-xs font-medium text-foreground/90">{task.title}</span>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/60">{task.objective}</p>
      </div>

      {/* Metadata */}
      <div className="space-y-1.5 border-t border-border/15 pt-2">
        <InspectorField label="Status" value={task.status} />
        <InspectorField label="Owner" value={task.ownerKind} />
        {task.assignedWorkerId && (
          <InspectorField label="Worker" value={task.assignedWorkerId.slice(-8)} mono />
        )}
        <InspectorField label="Iteration" value={`${task.iteration} / ${task.maxIterations}`} />
        <InspectorField label="Created" value={formatElapsedTime(task.createdAt) + " ago"} />
        {task.submittedAt && (
          <InspectorField label="Submitted" value={formatElapsedTime(task.submittedAt) + " ago"} />
        )}
      </div>

      {/* Acceptance criteria */}
      {task.acceptanceCriteria.length > 0 && (
        <div className="border-t border-border/15 pt-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            Acceptance criteria
          </p>
          <ul className="space-y-0.5">
            {task.acceptanceCriteria.map((criterion) => (
              <li
                key={criterion}
                className="flex gap-1.5 text-[11px] leading-relaxed text-foreground/60"
              >
                <span className="shrink-0 text-muted-foreground/30">{"\u2022"}</span>
                <span>{criterion}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Checklist */}
      {task.checklist.length > 0 && (
        <div className="border-t border-border/15 pt-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            Checklist
          </p>
          <ul className="space-y-0.5">
            {task.checklist.map((item) => (
              <li key={item.id} className="flex items-center gap-1.5 text-[11px]">
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    item.status === "passed"
                      ? "bg-emerald-400"
                      : item.status === "failed"
                        ? "bg-rose-400"
                        : "bg-muted-foreground/30",
                  )}
                />
                <span className="text-foreground/60">{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Blocked reason */}
      {task.blockedBy && (
        <div className="rounded border border-rose-500/20 bg-rose-500/5 px-2 py-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-400/80">
            Blocked by
          </p>
          <p className="mt-0.5 text-[11px] text-rose-300/70">{task.blockedBy}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Worker inspector
// ---------------------------------------------------------------------------

function WorkerInspector({ worker }: { worker: OrchestratorWorker }) {
  const statusStyle = getWorkerStatusStyle(worker.status);

  return (
    <div className="space-y-3 p-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium",
            statusStyle.border,
            statusStyle.headerBg,
          )}
        >
          W-{worker.workerId.slice(-6)}
        </span>
        <span className="text-[11px] capitalize text-foreground/70">{worker.status}</span>
      </div>

      {/* Metadata */}
      <div className="space-y-1.5 border-t border-border/15 pt-2">
        <InspectorField label="Status" value={worker.status} />
        {worker.modelBinding && (
          <>
            <InspectorField label="Provider" value={worker.modelBinding.provider} />
            <InspectorField label="Model" value={worker.modelBinding.model} mono />
            <InspectorField label="Selected by" value={worker.modelBinding.selectedBy} />
          </>
        )}
        {worker.activeTaskId && (
          <InspectorField label="Active task" value={worker.activeTaskId.slice(-8)} mono />
        )}
        <InspectorField label="Created" value={formatElapsedTime(worker.createdAt) + " ago"} />
        {worker.terminatedAt && (
          <InspectorField
            label="Terminated"
            value={formatElapsedTime(worker.terminatedAt) + " ago"}
          />
        )}
      </div>

      {/* Workspace */}
      <div className="border-t border-border/15 pt-2">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
          Workspace
        </p>
        <InspectorField label="Mode" value={worker.workspace.mode} />
        {worker.workspace.branch && (
          <InspectorField label="Branch" value={worker.workspace.branch} mono />
        )}
        <InspectorField label="CWD" value={worker.workspace.cwd} mono />
      </div>

      {/* Termination reason */}
      {worker.terminationReason && (
        <div className="rounded border border-rose-500/20 bg-rose-500/5 px-2 py-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-400/80">
            Termination reason
          </p>
          <p className="mt-0.5 text-[11px] text-rose-300/70">{worker.terminationReason}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared field component
// ---------------------------------------------------------------------------

function InspectorField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="shrink-0 text-[10px] text-muted-foreground/50">{label}</span>
      <span
        className={cn("truncate text-right text-[11px] text-foreground/70", mono && "font-mono")}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OrchestratorInspector
// ---------------------------------------------------------------------------

export interface OrchestratorInspectorProps {
  selectedEntity: SelectedEntity | null;
  onClose: () => void;
}

export function OrchestratorInspector({ selectedEntity, onClose }: OrchestratorInspectorProps) {
  if (!selectedEntity) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-[11px] text-muted-foreground/50">
        Select a task or worker to inspect
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Inspector header */}
      <div className="flex items-center justify-between border-b border-border/20 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
          {selectedEntity.type === "task" ? "Task" : "Worker"} Inspector
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-muted-foreground/40 transition-colors hover:bg-accent/15 hover:text-muted-foreground"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {selectedEntity.type === "task" ? (
          <TaskInspector task={selectedEntity.data} />
        ) : (
          <WorkerInspector worker={selectedEntity.data} />
        )}
      </div>
    </div>
  );
}
