import type { OrchestratorTask, OrchestratorWorker } from "@t3tools/contracts";

import { cn } from "~/lib/utils";
import { useThreadById } from "~/storeSelectors";
import { getWorkerStatusStyle } from "./controlRoomHelpers";

// ---------------------------------------------------------------------------
// WorkerStatusIndicator (small dot)
// ---------------------------------------------------------------------------

export function WorkerStatusIndicator({ status }: { status: string }) {
  const isStuck = status === "stuck";
  return (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full bg-foreground/40",
        isStuck && "animate-pulse bg-foreground/30",
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// ProviderBadge
// ---------------------------------------------------------------------------

function ProviderBadge({
  provider,
  model,
}: {
  provider: string | undefined;
  model: string | undefined;
}) {
  const label = provider === "codex" ? "GPT" : "Claude";

  return (
    <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">
      {label}
      {model && <span className="ml-0.5 font-normal opacity-70">{model.split("-").pop()}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// WorkerChip (collapsed representation for overflow workers)
// ---------------------------------------------------------------------------

export function WorkerChip({
  worker,
  selected = false,
  onClick,
}: {
  worker: OrchestratorWorker;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1.5 transition-colors",
        selected
          ? "text-[10px] font-medium text-foreground"
          : "text-[10px] text-foreground/60 hover:text-foreground/80",
      )}
    >
      <WorkerStatusIndicator status={worker.status} />
      <span>W-{worker.workerId.slice(-4)}</span>
      {worker.modelBinding ? (
        <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/40">
          {worker.modelBinding.provider === "codex" ? "GPT" : "CLD"}
        </span>
      ) : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// WorkerPanel
// ---------------------------------------------------------------------------

export interface WorkerPanelProps {
  worker: OrchestratorWorker;
  task?: OrchestratorTask | undefined;
  compact?: boolean;
  isFocused: boolean;
  isPromoted: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}

export function WorkerPanel({
  worker,
  task,
  compact = false,
  isFocused,
  isPromoted,
  onClick,
  onDoubleClick,
}: WorkerPanelProps) {
  const statusStyle = getWorkerStatusStyle(worker.status);
  const thread = useThreadById(worker.threadId);
  const latestActivity = thread?.activities.at(-1) ?? null;
  const latestTurn = thread?.latestTurn ?? null;
  const primaryLabel = task?.title ?? thread?.title ?? `Worker ${worker.workerId.slice(-6)}`;
  const supportingCopy =
    task?.objective ??
    latestActivity?.summary ??
    (worker.status === "terminated"
      ? (worker.terminationReason ?? "Worker terminated")
      : "Working from the orchestrator brief.");

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={cn(
        "flex flex-col overflow-hidden rounded-md border transition-all duration-200",
        isFocused ? "border-accent/50 shadow-sm" : "border-border/20",
        isPromoted && !compact && "col-span-full row-span-full",
        statusStyle.border,
        compact && "h-full bg-background/55",
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center gap-2 border-b border-border/15 px-2.5 py-1.5",
          compact && "px-2 py-1.5",
          statusStyle.headerBg,
        )}
      >
        <ProviderBadge
          provider={worker.modelBinding?.provider}
          model={worker.modelBinding?.model}
        />
        <span className="truncate font-mono text-[11px] font-medium text-foreground/80">
          W-{worker.workerId.slice(-6)}
        </span>
        <div className="ml-auto">
          <WorkerStatusIndicator status={worker.status} />
        </div>
      </div>

      {/* Content area */}
      <div
        className={cn(
          "flex-1 overflow-y-auto bg-background/20 p-2.5 text-[11px] text-foreground/70",
          compact && "p-2",
        )}
      >
        <div className="space-y-2">
          <div>
            <p className="truncate text-[11px] font-medium text-foreground/85">{primaryLabel}</p>
            <p
              className={cn(
                "mt-1 line-clamp-3 text-[10px] leading-relaxed text-muted-foreground/65",
                compact && "line-clamp-2",
              )}
            >
              {supportingCopy}
            </p>
          </div>

          <dl
            className={cn("grid gap-1 text-[10px] text-muted-foreground/55", compact && "gap-1.5")}
          >
            {thread ? (
              <div className="flex items-center justify-between gap-2">
                <dt className="uppercase tracking-wider text-muted-foreground/40">Thread</dt>
                <dd className="truncate font-mono">{thread.title}</dd>
              </div>
            ) : null}
            {task ? (
              <div className="flex items-center justify-between gap-2">
                <dt className="uppercase tracking-wider text-muted-foreground/40">Task</dt>
                <dd className="truncate font-mono">{task.taskId.slice(-8)}</dd>
              </div>
            ) : null}
            {latestTurn ? (
              <div className="flex items-center justify-between gap-2">
                <dt className="uppercase tracking-wider text-muted-foreground/40">Turn</dt>
                <dd className="truncate font-mono">
                  {latestTurn.completedAt ? "Completed" : "In progress"}
                </dd>
              </div>
            ) : null}
            {latestActivity ? (
              <div className="rounded border border-border/10 bg-background/30 px-2 py-1.5">
                <dt className="text-[9px] uppercase tracking-wider text-muted-foreground/35">
                  Latest activity
                </dt>
                <dd
                  className={cn(
                    "mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-foreground/65",
                    compact && "line-clamp-1",
                  )}
                >
                  {latestActivity.summary}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
        {worker.terminationReason && (
          <p className="mt-1 truncate text-[10px] text-muted-foreground/50">
            {worker.terminationReason}
          </p>
        )}
      </div>
    </div>
  );
}
