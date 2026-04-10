import { useCallback, useEffect, useMemo } from "react";
import {
  CircleIcon,
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
import { formatElapsedTime, getRunStatusDotColor, getTaskStatusConfig } from "./controlRoomHelpers";
import { OrchestratorLeftRail } from "./OrchestratorLeftRail";
import { OrchestratorInspector } from "./OrchestratorInspector";
import {
  OrchestratorBrowserWorkspace,
  type BrowserWorkspaceProps,
} from "./OrchestratorBrowserWorkspace";
import { WorkerCanvas } from "./WorkerCanvas";
import { WorkerChip } from "./WorkerPanel";
import { usePanelStateStore } from "./panelStateStore";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface OrchestratorControlRoomProps {
  run: OrchestratorRun | null;
  tasks: ReadonlyArray<OrchestratorTask>;
  workers: ReadonlyArray<OrchestratorWorker>;
  panelWidth: number;
  /** Browser workspace state — omit or pass undefined when no session exists */
  browserWorkspace?: Omit<BrowserWorkspaceProps, "isCollapsed" | "onToggleCollapse">;
  /** Slot for the existing transcript/messages view */
  children?: React.ReactNode;
}

function CompactSelectionCard({ selectedEntity }: { selectedEntity: SelectedEntity | null }) {
  if (!selectedEntity) {
    return null;
  }

  if (selectedEntity.type === "task") {
    const task = selectedEntity.data;
    const statusConfig = getTaskStatusConfig(task.status);
    const passedCount = task.checklist.filter((item) => item.status === "passed").length;

    return (
      <div className="rounded-xl border border-border/30 bg-background/70 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded-sm text-[9px] font-bold text-white",
              statusConfig.color,
            )}
          >
            {statusConfig.label}
          </span>
          <p className="truncate text-[11px] font-medium text-foreground/90">{task.title}</p>
          <span className="ml-auto text-[10px] text-muted-foreground/50">
            {passedCount}/{task.checklist.length || task.acceptanceCriteria.length || 0} verified
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground/70">
          {task.objective}
        </p>
      </div>
    );
  }

  const worker = selectedEntity.data;
  return (
    <div className="rounded-xl border border-border/30 bg-background/70 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <CircleIcon className={cn("size-2.5 fill-current", getRunStatusDotColor("active"))} />
        <p className="truncate text-[11px] font-medium text-foreground/90">
          Worker {worker.workerId.slice(-6)}
        </p>
        {worker.modelBinding ? (
          <span className="ml-auto text-[9px] uppercase tracking-wider text-muted-foreground/40">
            {worker.modelBinding.provider === "codex" ? "GPT" : "Claude"} ·{" "}
            {worker.modelBinding.model.split("-").pop()}
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground/60">
        <span className="capitalize">{worker.status}</span>
        {worker.activeTaskId ? (
          <span className="font-mono">task {worker.activeTaskId.slice(-6)}</span>
        ) : null}
      </div>
    </div>
  );
}

function CompactRunHeader({
  run,
  tasks,
  workers,
  selectedEntityId,
  onSelectTask,
  onSelectWorker,
}: {
  run: OrchestratorRun | null;
  tasks: ReadonlyArray<OrchestratorTask>;
  workers: ReadonlyArray<OrchestratorWorker>;
  selectedEntityId: OrchestratorTaskId | OrchestratorWorkerId | null;
  onSelectTask: (taskId: OrchestratorTaskId) => void;
  onSelectWorker: (workerId: OrchestratorWorkerId) => void;
}) {
  return (
    <div className="shrink-0 border-b border-border/20 bg-gradient-to-b from-background/95 to-background/70 px-3 py-2">
      <div className="flex items-start gap-2">
        <CircleIcon
          className={cn(
            "mt-0.5 size-2 shrink-0 fill-current",
            getRunStatusDotColor(run?.status ?? "idle"),
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/55">
              {run ? run.status : "Orchestrator"}
            </p>
            {run ? (
              <span className="text-[10px] font-mono text-muted-foreground/45">
                {formatElapsedTime(run.createdAt)}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 line-clamp-1 text-[12px] leading-snug text-foreground/80">
            {run?.userRequest ?? "Active orchestrator run"}
          </p>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-2">
        {tasks.slice(0, 3).map((task) => (
          <button
            key={task.taskId}
            type="button"
            onClick={() => onSelectTask(task.taskId)}
            className={cn(
              "border-b pb-0.5 text-[10px] transition-colors",
              selectedEntityId === task.taskId
                ? "border-foreground/30 font-medium text-foreground"
                : "border-transparent text-muted-foreground/40 hover:text-muted-foreground/60",
            )}
          >
            {task.title}
          </button>
        ))}
        {workers.map((worker) => (
          <button
            key={worker.workerId}
            type="button"
            onClick={() => onSelectWorker(worker.workerId)}
            className={cn(
              "border-b pb-0.5 text-[10px] transition-colors",
              selectedEntityId === worker.workerId
                ? "border-foreground/30 font-medium text-foreground"
                : "border-transparent text-muted-foreground/40 hover:text-muted-foreground/60",
            )}
          >
            W-{worker.workerId.slice(-4)}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OrchestratorControlRoom({
  run,
  tasks,
  workers,
  panelWidth,
  browserWorkspace,
  children,
}: OrchestratorControlRoomProps) {
  const panelState = usePanelStateStore();
  const compactMode = panelWidth < 680;
  const defaultSelectedEntityId = useMemo(() => {
    const prioritizedWorker =
      workers.find(
        (worker) =>
          worker.status === "running" || worker.status === "submitted" || worker.status === "stuck",
      ) ?? workers[0];
    if (prioritizedWorker) {
      return prioritizedWorker.workerId;
    }

    const prioritizedTask =
      tasks.find(
        (task) =>
          task.status === "running" || task.status === "submitted" || task.status === "blocked",
      ) ?? tasks[0];
    return prioritizedTask?.taskId ?? null;
  }, [tasks, workers]);

  const selectedEntityId = (panelState.focusedPanelId ?? defaultSelectedEntityId) as
    | OrchestratorTaskId
    | OrchestratorWorkerId
    | null;

  useEffect(() => {
    if (!panelState.focusedPanelId && defaultSelectedEntityId) {
      panelState.focus(defaultSelectedEntityId);
    }
  }, [defaultSelectedEntityId, panelState]);

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
    panelState.focus(null);
    if (!panelState.inspectorCollapsed) {
      panelState.toggleInspector();
    }
  }, [panelState]);

  // Determine whether we have orchestration data to show
  const hasOrchestrationData =
    run !== null || tasks.length > 0 || workers.length > 0 || browserWorkspace !== undefined;

  // When no orchestration data, fall through to the simple transcript view
  if (!hasOrchestrationData) {
    return <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">{children}</div>;
  }

  if (compactMode) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-gradient-to-b from-background to-background/92">
        <CompactRunHeader
          run={run}
          tasks={tasks}
          workers={workers}
          selectedEntityId={selectedEntityId}
          onSelectTask={handleSelectTask}
          onSelectWorker={handleSelectWorker}
        />

        <OrchestratorBrowserWorkspace
          {...browserWorkspace}
          isCollapsed={panelState.browserCollapsed}
          onToggleCollapse={panelState.toggleBrowser}
        />

        {workers.length > 0 ? (
          <div className="shrink-0 border-b border-border/20 bg-background/35 px-3 py-1.5">
            <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/45">
                Workers
              </span>
              {workers.map((worker) => (
                <WorkerChip
                  key={worker.workerId}
                  worker={worker}
                  selected={selectedEntityId === worker.workerId}
                  onClick={() => handleSelectWorker(worker.workerId)}
                />
              ))}
            </div>
          </div>
        ) : null}

        {selectedEntity?.type === "task" ? (
          <div className="max-h-20 shrink-0 overflow-y-auto border-b border-border/20 bg-background/40 px-3 py-1.5">
            <CompactSelectionCard selectedEntity={selectedEntity} />
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 overflow-hidden">
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
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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

        {/* Worker panels grid — capped height to preserve transcript/composer space */}
        {workers.length > 0 && (
          <div
            className={cn(
              "shrink-0 border-b border-border/20",
              workers.length === 1 ? "h-32" : workers.length <= 2 ? "h-28" : "h-36",
            )}
          >
            <WorkerCanvas workers={workers} tasks={tasks} />
          </div>
        )}

        {/* Transcript / existing messages (passed as children) */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
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
