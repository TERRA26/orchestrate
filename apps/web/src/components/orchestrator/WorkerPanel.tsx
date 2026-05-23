import type { OrchestratorTask, OrchestratorWorker } from "@orchestrate/contracts";

import { cn } from "~/lib/utils";
import { useThreadById } from "~/storeSelectors";
import { getWorkerStatusStyle } from "./controlRoomHelpers";

// ---------------------------------------------------------------------------
// Worker accent color from ID hash — gives every worker a visually distinct
// identity so users can scan a multi-worker grid and tell them apart at a
// glance instead of having to read the W-abc123 suffix on every card.
// Pattern lifted from dpcode's `subagentPresentation.ts:206-210`.
// ---------------------------------------------------------------------------
const WORKER_ACCENT_PALETTE = [
  { hue: "violet", border: "border-violet-500/40", bg: "bg-violet-500/[0.06]" },
  { hue: "fuchsia", border: "border-fuchsia-500/40", bg: "bg-fuchsia-500/[0.06]" },
  { hue: "teal", border: "border-teal-500/40", bg: "bg-teal-500/[0.06]" },
  { hue: "cyan", border: "border-cyan-500/40", bg: "bg-cyan-500/[0.06]" },
  { hue: "amber", border: "border-amber-500/40", bg: "bg-amber-500/[0.06]" },
  { hue: "orange", border: "border-orange-500/40", bg: "bg-orange-500/[0.06]" },
  { hue: "sky", border: "border-sky-500/40", bg: "bg-sky-500/[0.06]" },
  { hue: "rose", border: "border-rose-500/40", bg: "bg-rose-500/[0.06]" },
] as const;

function hashWorkerId(workerId: string): number {
  let hash = 0;
  for (let i = 0; i < workerId.length; i++) {
    hash = (hash * 31 + workerId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function workerAccent(workerId: string): (typeof WORKER_ACCENT_PALETTE)[number] {
  const palette = WORKER_ACCENT_PALETTE;
  return palette[hashWorkerId(workerId) % palette.length] ?? palette[0]!;
}

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

  // Per-worker color hash (dpcode parity). Renders as a subtle border accent
  // on the panel + a colored dot in the header so two parallel workers don't
  // look interchangeable at a glance.
  const accent = workerAccent(worker.workerId);

  // Task progress badge — surfaces "X/Y verified" right in the header so the
  // user doesn't have to open the inspector to see how far along the worker is.
  const checklistCount = task?.checklist.length ?? 0;
  const passedCount = task?.checklist.filter((item) => item.status === "passed").length ?? 0;
  const hasProgress = checklistCount > 0;
  const progressLabel = hasProgress ? `${passedCount}/${checklistCount}` : null;

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      data-worker-id={worker.workerId}
      data-worker-accent={accent.hue}
      className={cn(
        "flex flex-col overflow-hidden rounded-md border transition-all duration-200",
        isFocused ? "border-accent/50 shadow-sm" : accent.border,
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
          accent.bg,
        )}
      >
        {/* Per-worker accent dot — visual identity at a glance. */}
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            `bg-${accent.hue}-400`,
            "shadow-[0_0_4px_currentColor]",
          )}
          style={{ color: `var(--color-${accent.hue}-400, currentColor)` }}
          aria-hidden
        />
        <ProviderBadge
          provider={worker.modelBinding?.provider}
          model={worker.modelBinding?.model}
        />
        <span className="truncate font-mono text-[11px] font-medium text-foreground/80">
          W-{worker.workerId.slice(-6)}
        </span>
        {/* Task progress badge — only shown when the task has a checklist. */}
        {progressLabel ? (
          <span
            className="ml-auto rounded bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[9.5px] tabular-nums text-foreground/65"
            title={`${passedCount} of ${checklistCount} acceptance items verified`}
          >
            {progressLabel}
          </span>
        ) : (
          <div className="ml-auto">
            <WorkerStatusIndicator status={worker.status} />
          </div>
        )}
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
