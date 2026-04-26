import type { OrchestratorWorker, ProviderKind } from "@orchestrate/contracts";

// ---------------------------------------------------------------------------
// ThreadModelIcons
// ---------------------------------------------------------------------------
// Renders compact provider badges for active workers on a thread.
//
// Integration point: add this next to the thread title inside
// `renderThreadRow()` in `apps/web/src/components/Sidebar.tsx`.
// The sidebar currently does not have access to orchestrator worker data
// (workers are fetched per-run in `useOrchestratorEngine`). To wire this up:
//   1. Expose a per-thread workers lookup (e.g. via the orchestrator state
//      store or a dedicated react-query hook).
//   2. In `renderThreadRow`, resolve workers for the thread and render:
//      `<ThreadModelIcons workers={workersForThread} />`
//      right after the `<span>` that shows `thread.title`.
// ---------------------------------------------------------------------------

/** Visual config per provider. */
const PROVIDER_BADGE: Record<ProviderKind | "unknown", { label: string; bg: string }> = {
  codex: { label: "X", bg: "#4d96ff" },
  claudeAgent: { label: "C", bg: "#64ffda" },
  unknown: { label: "?", bg: "#888" },
};

export interface ThreadModelIconsProps {
  workers: ReadonlyArray<Pick<OrchestratorWorker, "modelBinding" | "status">>;
}

/**
 * Compact multi-model badges for a sidebar thread entry.
 *
 * Displays one badge per provider with an active (non-terminated) worker,
 * including a multiplier when more than one worker uses the same provider.
 */
export function ThreadModelIcons({ workers }: ThreadModelIconsProps) {
  const active = workers.filter((w) => w.status !== "terminated");
  if (active.length === 0) return null;

  const counts = new Map<string, number>();
  for (const w of active) {
    const provider: string = w.modelBinding?.provider ?? "unknown";
    counts.set(provider, (counts.get(provider) ?? 0) + 1);
  }

  return (
    <div className="flex items-center gap-0.5">
      {[...counts.entries()].map(([provider, count]) => {
        const badge = PROVIDER_BADGE[provider as ProviderKind] ?? PROVIDER_BADGE.unknown;
        return (
          <span
            key={provider}
            className="flex h-4 items-center rounded px-1 text-[10px] font-bold"
            style={{
              backgroundColor: badge.bg,
              color: "#0d1b2a",
            }}
          >
            {badge.label}
            {count > 1 ? `\u00d7${count}` : ""}
          </span>
        );
      })}
    </div>
  );
}
