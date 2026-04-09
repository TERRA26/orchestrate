import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { OrchestratorTask, OrchestratorTaskId } from "@t3tools/contracts";

import { cn } from "~/lib/utils";
import { getTaskStatusConfig } from "./controlRoomHelpers";

// ---------------------------------------------------------------------------
// TaskStatusBadge
// ---------------------------------------------------------------------------

function TaskStatusBadge({ status }: { status: string }) {
  const config = getTaskStatusConfig(status);
  return (
    <span
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-sm text-[9px] font-bold text-white",
        config.color,
      )}
    >
      {config.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// TaskTreeNode
// ---------------------------------------------------------------------------

function TaskTreeNode({
  task,
  allTasks,
  depth,
  selectedTaskId,
  onSelect,
}: {
  task: OrchestratorTask;
  allTasks: ReadonlyArray<OrchestratorTask>;
  depth: number;
  selectedTaskId: OrchestratorTaskId | null;
  onSelect: (taskId: OrchestratorTaskId) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const children = allTasks.filter((t) => t.parentTaskId === task.taskId);

  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(task.taskId)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] transition-colors",
          selectedTaskId === task.taskId
            ? "bg-accent/30 text-foreground"
            : "text-foreground/70 hover:bg-accent/15 hover:text-foreground/90",
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {children.length > 0 ? (
          <ChevronRight
            className={cn(
              "size-3 shrink-0 cursor-pointer transition-transform",
              expanded && "rotate-90",
            )}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          />
        ) : (
          <span className="size-3 shrink-0" />
        )}
        <TaskStatusBadge status={task.status} />
        <span className="truncate">{task.title}</span>
      </button>

      {expanded &&
        children.map((child) => (
          <TaskTreeNode
            key={child.taskId}
            task={child}
            allTasks={allTasks}
            depth={depth + 1}
            selectedTaskId={selectedTaskId}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TaskTreeView
// ---------------------------------------------------------------------------

export interface TaskTreeViewProps {
  tasks: ReadonlyArray<OrchestratorTask>;
  selectedTaskId: OrchestratorTaskId | null;
  onSelect: (taskId: OrchestratorTaskId) => void;
}

export function TaskTreeView({ tasks, selectedTaskId, onSelect }: TaskTreeViewProps) {
  const rootTasks = tasks.filter((t) => !t.parentTaskId);

  if (rootTasks.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-[11px] text-muted-foreground/50">No tasks yet</div>
    );
  }

  return (
    <div className="space-y-0.5">
      {rootTasks.map((task) => (
        <TaskTreeNode
          key={task.taskId}
          task={task}
          allTasks={tasks}
          depth={0}
          selectedTaskId={selectedTaskId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
