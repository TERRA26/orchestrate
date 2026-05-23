import { CheckCircle, XCircle } from "lucide-react";

import { cn } from "~/lib/utils";
import ChatMarkdown from "~/components/ChatMarkdown";
import { getTaskStatusConfig } from "./controlRoomHelpers";

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
  label: string | null;
  textColor: string;
  borderColor: string;
  bg: string;
}

const DECISION_TYPE_MAP: Record<string, DecisionTypeConfig> = {
  answered: {
    label: "Answered",
    textColor: "text-foreground/70",
    borderColor: "border-l-border/20",
    bg: "bg-transparent",
  },
  inspected: {
    label: "Inspected",
    textColor: "text-foreground/70",
    borderColor: "border-l-border/20",
    bg: "bg-transparent",
  },
  delegated: {
    label: null,
    textColor: "text-foreground/70",
    borderColor: "border-l-border/20",
    bg: "bg-transparent",
  },
  decomposed: {
    label: "Decomposed",
    textColor: "text-foreground/70",
    borderColor: "border-l-border/20",
    bg: "bg-transparent",
  },
  "spawned-worker": {
    label: "Spawned Worker",
    textColor: "text-foreground/70",
    borderColor: "border-l-border/20",
    bg: "bg-transparent",
  },
  "terminated-worker": {
    label: "Terminated Worker",
    textColor: "text-foreground/70",
    borderColor: "border-l-border/20",
    bg: "bg-transparent",
  },
  "accepted-work": {
    label: "Accepted",
    textColor: "text-foreground/70",
    borderColor: "border-l-border/20",
    bg: "bg-transparent",
  },
  "rejected-work": {
    label: "Rejected",
    textColor: "text-foreground/70",
    borderColor: "border-l-border/20",
    bg: "bg-transparent",
  },
  "requested-rework": {
    label: "Rework",
    textColor: "text-foreground/70",
    borderColor: "border-l-border/20",
    bg: "bg-transparent",
  },
};

const DEFAULT_DECISION_CONFIG: DecisionTypeConfig = {
  label: "Decision",
  textColor: "text-muted-foreground",
  borderColor: "border-l-border/20",
  bg: "bg-transparent",
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
    <div className={cn("rounded-md border-l px-3 py-2", config.borderColor, config.bg)}>
      <div className="flex items-center gap-2">
        {config.label ? (
          <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">
            {config.label}
          </span>
        ) : null}
        <span className="font-mono text-[10px] text-muted-foreground/40">
          {formatTime(decision.createdAt)}
        </span>
      </div>
      <div className="mt-1">
        <ChatMarkdown text={decision.reason} cwd={undefined} />
      </div>
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
      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">
        {type}
      </span>
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
    <div className="rounded-md border border-border/10 bg-muted/5 px-3 py-2">
      <div className="flex items-center gap-2">
        {accepted ? (
          <CheckCircle className="size-3.5 text-muted-foreground/60" />
        ) : (
          <XCircle className="size-3.5 text-muted-foreground/60" />
        )}
        <span className="text-[11px] font-semibold text-foreground/70">
          {accepted ? "Accepted" : "Rejected"}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground/50">
          {evidenceCount} evidence
        </span>
      </div>
      <div className="mt-1">
        <ChatMarkdown text={summary} cwd={undefined} />
      </div>
    </div>
  );
}

export function WorkerMention({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-0.5 rounded bg-accent/5 px-1 py-0.5 text-[10px] font-medium text-foreground/70 hover:bg-accent/10"
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
