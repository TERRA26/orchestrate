import { CheckCircle, XCircle } from "lucide-react";

import { cn } from "~/lib/utils";
import { getTaskStatusConfig } from "./controlRoomHelpers";
import { EvidenceTypeBadge } from "./OrchestratorInspector";

// ---------------------------------------------------------------------------
// Block types
// ---------------------------------------------------------------------------

export type OrchestratorBlock =
  | { type: "decision"; data: { type: string; reason: string; createdAt: string } }
  | { type: "task"; data: { title: string; status: string; ownerId?: string } }
  | { type: "evidence"; data: { type: string; timestamp: string; onClick?: () => void } }
  | { type: "verdict"; data: { accepted: boolean; summary: string; evidenceCount: number } }
  | { type: "worker-mention"; data: { label: string; onClick?: () => void } }
  | { type: "text"; data: { content: string; role: string } };

// ---------------------------------------------------------------------------
// Decision config
// ---------------------------------------------------------------------------

interface DecisionTypeConfig {
  label: string;
  textColor: string;
  borderColor: string;
  bg: string;
}

const DECISION_TYPE_MAP: Record<string, DecisionTypeConfig> = {
  answered: {
    label: "Answered",
    textColor: "text-emerald-400",
    borderColor: "border-l-emerald-500/40",
    bg: "bg-emerald-500/5",
  },
  inspected: {
    label: "Inspected",
    textColor: "text-sky-400",
    borderColor: "border-l-sky-500/40",
    bg: "bg-sky-500/5",
  },
  delegated: {
    label: "Delegated",
    textColor: "text-violet-400",
    borderColor: "border-l-violet-500/40",
    bg: "bg-violet-500/5",
  },
  decomposed: {
    label: "Decomposed",
    textColor: "text-amber-400",
    borderColor: "border-l-amber-500/40",
    bg: "bg-amber-500/5",
  },
  "spawned-worker": {
    label: "Spawned Worker",
    textColor: "text-teal-400",
    borderColor: "border-l-teal-500/40",
    bg: "bg-teal-500/5",
  },
  "terminated-worker": {
    label: "Terminated Worker",
    textColor: "text-rose-400",
    borderColor: "border-l-rose-500/40",
    bg: "bg-rose-500/5",
  },
  "accepted-work": {
    label: "Accepted",
    textColor: "text-emerald-400",
    borderColor: "border-l-emerald-500/40",
    bg: "bg-emerald-500/5",
  },
  "rejected-work": {
    label: "Rejected",
    textColor: "text-rose-400",
    borderColor: "border-l-rose-500/40",
    bg: "bg-rose-500/5",
  },
  "requested-rework": {
    label: "Rework",
    textColor: "text-amber-400",
    borderColor: "border-l-amber-500/40",
    bg: "bg-amber-500/5",
  },
};

const DEFAULT_DECISION_CONFIG: DecisionTypeConfig = {
  label: "Decision",
  textColor: "text-muted-foreground",
  borderColor: "border-l-muted-foreground/30",
  bg: "bg-muted/5",
};

function getDecisionTypeConfig(type: string): DecisionTypeConfig {
  return DECISION_TYPE_MAP[type] ?? DEFAULT_DECISION_CONFIG;
}

// ---------------------------------------------------------------------------
// Time formatter
// ---------------------------------------------------------------------------

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return isoString;
  }
}

// ---------------------------------------------------------------------------
// Block sub-components
// ---------------------------------------------------------------------------

export function DecisionCard({
  decision,
}: {
  decision: { type: string; reason: string; createdAt: string };
}) {
  const config = getDecisionTypeConfig(decision.type);
  return (
    <div className={cn("rounded-md border-l-2 px-3 py-2", config.borderColor, config.bg)}>
      <div className="flex items-center gap-2">
        <span className={cn("text-[9px] font-semibold uppercase tracking-wider", config.textColor)}>
          {config.label}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/40">
          {formatTime(decision.createdAt)}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-foreground/70">{decision.reason}</p>
    </div>
  );
}

function TaskCard({ task }: { task: { title: string; status: string; ownerId?: string } }) {
  const statusConfig = getTaskStatusConfig(task.status);
  return (
    <div className="flex items-center gap-2 rounded border border-border/20 bg-background/30 px-2.5 py-1.5">
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-sm text-[9px] font-bold text-white",
          statusConfig.color,
        )}
      >
        {statusConfig.label}
      </span>
      <span className="text-[11px] font-medium text-foreground/80">{task.title}</span>
      {task.ownerId && (
        <span className="ml-auto font-mono text-[9px] text-muted-foreground/40">
          {task.ownerId.slice(-6)}
        </span>
      )}
    </div>
  );
}

function EvidenceStrip({
  type,
  timestamp,
  onClick,
}: {
  type: string;
  timestamp: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded border border-border/15 bg-background/20 px-2 py-1 text-[10px] hover:bg-accent/10"
    >
      <EvidenceTypeBadge type={type} />
      <span className="font-mono text-muted-foreground/50">{formatTime(timestamp)}</span>
    </button>
  );
}

export function VerdictBanner({
  accepted,
  summary,
  evidenceCount,
}: {
  accepted: boolean;
  summary: string;
  evidenceCount: number;
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        accepted ? "border-emerald-500/20 bg-emerald-500/5" : "border-rose-500/20 bg-rose-500/5",
      )}
    >
      <div className="flex items-center gap-2">
        {accepted ? (
          <CheckCircle className="size-3.5 text-emerald-400" />
        ) : (
          <XCircle className="size-3.5 text-rose-400" />
        )}
        <span
          className={cn(
            "text-[11px] font-semibold",
            accepted ? "text-emerald-400" : "text-rose-400",
          )}
        >
          {accepted ? "Accepted" : "Rejected"}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground/50">
          {evidenceCount} evidence
        </span>
      </div>
      <p className="mt-1 text-[11px] text-foreground/60">{summary}</p>
    </div>
  );
}

export function WorkerMention({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-0.5 rounded bg-sky-500/10 px-1 py-0.5 text-[10px] font-medium text-sky-400 hover:bg-sky-500/20"
    >
      @{label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------

export function OrchestratorBlockRenderer({ block }: { block: OrchestratorBlock }) {
  switch (block.type) {
    case "decision":
      return <DecisionCard decision={block.data} />;
    case "task":
      return <TaskCard task={block.data} />;
    case "evidence":
      return <EvidenceStrip {...block.data} />;
    case "verdict":
      return <VerdictBanner {...block.data} />;
    case "worker-mention":
      return <WorkerMention {...block.data} />;
    default:
      return null;
  }
}
