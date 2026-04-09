import { CircleIcon } from "lucide-react";
import type { OrchestratorWorker } from "@t3tools/contracts";

import { cn } from "~/lib/utils";
import { getWorkerStatusStyle } from "./controlRoomHelpers";

// ---------------------------------------------------------------------------
// WorkerStatusIndicator (small dot)
// ---------------------------------------------------------------------------

export function WorkerStatusIndicator({ status }: { status: string }) {
  const colorClass =
    {
      idle: "text-muted-foreground/40",
      running: "text-sky-400",
      submitted: "text-amber-400",
      stuck: "text-orange-400 animate-pulse",
      terminated: "text-muted-foreground/30",
    }[status] ?? "text-muted-foreground/40";

  return <CircleIcon className={cn("size-2 shrink-0 fill-current", colorClass)} />;
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
  const badge =
    provider === "codex"
      ? { label: "GPT", className: "bg-emerald-500/15 text-emerald-400" }
      : { label: "Claude", className: "bg-violet-500/15 text-violet-400" };

  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
        badge.className,
      )}
    >
      {badge.label}
      {model && <span className="ml-0.5 font-normal opacity-70">{model.split("-").pop()}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// WorkerChip (collapsed representation for overflow workers)
// ---------------------------------------------------------------------------

export function WorkerChip({ worker }: { worker: OrchestratorWorker }) {
  return (
    <button
      type="button"
      className="flex shrink-0 items-center gap-1 rounded border border-border/20 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent/15"
    >
      <WorkerStatusIndicator status={worker.status} />
      <span>W-{worker.workerId.slice(-4)}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// WorkerPanel
// ---------------------------------------------------------------------------

export interface WorkerPanelProps {
  worker: OrchestratorWorker;
  isFocused: boolean;
  isPromoted: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}

export function WorkerPanel({
  worker,
  isFocused,
  isPromoted,
  onClick,
  onDoubleClick,
}: WorkerPanelProps) {
  const statusStyle = getWorkerStatusStyle(worker.status);

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={cn(
        "flex flex-col overflow-hidden rounded-md border transition-all duration-200",
        isFocused ? "border-accent/50 shadow-sm" : "border-border/20",
        isPromoted && "col-span-full row-span-full",
        statusStyle.border,
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center gap-2 border-b border-border/15 px-2.5 py-1.5",
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
      <div className="flex-1 overflow-y-auto bg-background/20 p-2 text-[11px] text-foreground/70">
        {worker.activeTaskId ? (
          <p className="truncate font-mono text-muted-foreground/60">
            Task {worker.activeTaskId.slice(-8)}
          </p>
        ) : (
          <p className="text-muted-foreground/40">
            {worker.status === "terminated" ? "Terminated" : "Worker transcript"}
          </p>
        )}
        {worker.terminationReason && (
          <p className="mt-1 truncate text-[10px] text-rose-400/70">{worker.terminationReason}</p>
        )}
      </div>
    </div>
  );
}
