// FILE: WorkingTimer.tsx
// Purpose: Live "Working for Xs / Xm Ys" elapsed-time readout. Lives as a leaf
//          component with its own setInterval so the parent transcript doesn't
//          re-render every tick. Pattern lifted from dpcode's MessagesTimeline.
// Layer: UI primitive

import { useEffect, useState } from "react";
import { cn } from "~/lib/utils";
import { WorkingDots } from "./WorkingDots";

function formatElapsed(ms: number): string {
  if (ms < 1000) return "<1s";
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function WorkingTimer({
  startedAt,
  label = "Working",
  className,
}: {
  /** ISO timestamp or epoch-ms when the work started. */
  startedAt: string | number | Date;
  label?: string;
  className?: string;
}) {
  const startedAtMs =
    typeof startedAt === "number"
      ? startedAt
      : startedAt instanceof Date
        ? startedAt.getTime()
        : Date.parse(startedAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!Number.isFinite(startedAtMs)) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAtMs]);

  if (!Number.isFinite(startedAtMs)) {
    return null;
  }

  const elapsed = Math.max(0, now - startedAtMs);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-[11px] text-muted-foreground/75",
        className,
      )}
      data-working-timer
    >
      <WorkingDots size="sm" />
      <span>
        {label} for{" "}
        <span className="font-mono tabular-nums text-foreground/75">{formatElapsed(elapsed)}</span>
      </span>
    </span>
  );
}
