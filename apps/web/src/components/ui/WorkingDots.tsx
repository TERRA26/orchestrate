// FILE: WorkingDots.tsx
// Purpose: Three staggered pulsing dots used to signal a long-running, in-flight
//          step. Calmer than a spinning loader and visually consistent with the
//          dpcode pattern of pulse-dot indicators.
// Layer: UI primitive

import { cn } from "~/lib/utils";

export function WorkingDots({
  className,
  size = "default",
  tone = "muted",
}: {
  className?: string;
  /** Dot size — "sm" pairs well with inline text, "default" with row indicators. */
  size?: "sm" | "default";
  /** Color tone — "muted" for low-emphasis spots, "accent" for active focus. */
  tone?: "muted" | "accent";
}) {
  const dotClass = cn(
    "rounded-full animate-pulse",
    size === "sm" ? "h-1 w-1" : "h-1.5 w-1.5",
    tone === "accent" ? "bg-foreground/55" : "bg-muted-foreground/40",
  );
  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      role="status"
      aria-label="Working"
    >
      <span className={dotClass} />
      <span className={cn(dotClass, "[animation-delay:200ms]")} />
      <span className={cn(dotClass, "[animation-delay:400ms]")} />
    </span>
  );
}
