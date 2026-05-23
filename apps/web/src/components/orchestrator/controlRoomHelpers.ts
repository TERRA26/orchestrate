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
  pending: { color: "bg-muted-foreground/10", label: "P" },
  assigned: { color: "bg-foreground/40", label: "A" },
  running: { color: "bg-foreground/60", label: "R" },
  submitted: { color: "bg-foreground/40", label: "S" },
  accepted: { color: "bg-foreground/20", label: "\u2713" },
  "needs-rework": { color: "bg-foreground/40", label: "!" },
  blocked: { color: "bg-muted-foreground/20", label: "B" },
  cancelled: { color: "bg-muted-foreground/10", label: "\u00d7" },
  failed: { color: "bg-muted-foreground/30", label: "\u2717" },
};

const DEFAULT_TASK_STATUS: TaskStatusConfig = {
  color: "bg-muted-foreground/10",
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
      return { border: "border-border/15", headerBg: "bg-transparent" };
    case "submitted":
      return { border: "border-border/15", headerBg: "bg-transparent" };
    case "stuck":
      return { border: "border-border/20 animate-pulse", headerBg: "bg-transparent" };
    case "terminated":
      return { border: "border-border/10", headerBg: "bg-transparent" };
    default:
      return { border: "border-border/10", headerBg: "bg-transparent" };
  }
}

// ---------------------------------------------------------------------------
// Run status dot config
// ---------------------------------------------------------------------------

export function getRunStatusDotColor(status: string): string {
  switch (status) {
    case "active":
      return "text-foreground/70";
    case "completed":
      return "text-foreground/40";
    case "failed":
      return "text-muted-foreground/50";
    case "cancelled":
      return "text-muted-foreground/25";
    default:
      return "text-muted-foreground/20";
  }
}
