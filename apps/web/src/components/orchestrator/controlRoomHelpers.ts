// ---------------------------------------------------------------------------
// Shared helpers for Control Room status styling and formatting
// ---------------------------------------------------------------------------

/** Elapsed-time formatter relative to a given ISO date string. */
export function formatElapsedTime(createdAt: string): string {
  const elapsed = Date.now() - new Date(createdAt).getTime();
  if (elapsed < 0) return "0s";
  const seconds = Math.floor(elapsed / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

// ---------------------------------------------------------------------------
// Task status config
// ---------------------------------------------------------------------------

export interface TaskStatusConfig {
  color: string;
  label: string;
}

const TASK_STATUS_MAP: Record<string, TaskStatusConfig> = {
  pending: { color: "bg-muted-foreground/40", label: "P" },
  assigned: { color: "bg-sky-400/60", label: "A" },
  running: { color: "bg-sky-400", label: "R" },
  submitted: { color: "bg-amber-400", label: "S" },
  accepted: { color: "bg-emerald-400", label: "\u2713" },
  "needs-rework": { color: "bg-amber-500", label: "!" },
  blocked: { color: "bg-rose-400", label: "B" },
  cancelled: { color: "bg-muted-foreground/30", label: "\u00d7" },
  failed: { color: "bg-rose-500", label: "\u2717" },
};

const DEFAULT_TASK_STATUS: TaskStatusConfig = {
  color: "bg-muted-foreground/40",
  label: "?",
};

export function getTaskStatusConfig(status: string): TaskStatusConfig {
  return TASK_STATUS_MAP[status] ?? DEFAULT_TASK_STATUS;
}

// ---------------------------------------------------------------------------
// Worker status style
// ---------------------------------------------------------------------------

export interface WorkerStatusStyle {
  border: string;
  headerBg: string;
}

export function getWorkerStatusStyle(status: string): WorkerStatusStyle {
  switch (status) {
    case "running":
      return { border: "border-sky-500/30", headerBg: "bg-sky-500/5" };
    case "submitted":
      return { border: "border-amber-500/30", headerBg: "bg-amber-500/5" };
    case "stuck":
      return { border: "border-orange-500/30 animate-pulse", headerBg: "bg-orange-500/5" };
    case "terminated":
      return { border: "border-muted-foreground/20", headerBg: "bg-muted/10" };
    default:
      return { border: "border-border/20", headerBg: "bg-background/30" };
  }
}

// ---------------------------------------------------------------------------
// Run status dot config
// ---------------------------------------------------------------------------

export function getRunStatusDotColor(status: string): string {
  switch (status) {
    case "active":
      return "bg-sky-400";
    case "completed":
      return "bg-emerald-400";
    case "failed":
      return "bg-rose-400";
    case "cancelled":
      return "bg-muted-foreground/40";
    default:
      return "bg-muted-foreground/30";
  }
}
