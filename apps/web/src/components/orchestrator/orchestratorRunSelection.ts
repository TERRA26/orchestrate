import type { OrchestratorRun } from "@orchestrate/contracts";

function byNewestActivity(a: OrchestratorRun, b: OrchestratorRun): number {
  return b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt);
}

export function selectVisibleOrchestratorRun(
  runs: ReadonlyArray<OrchestratorRun> | undefined,
  trackedRunId: OrchestratorRun["runId"] | null,
): OrchestratorRun | null {
  if (!runs || runs.length === 0) {
    return null;
  }

  if (trackedRunId) {
    const tracked = runs.find((run) => run.runId === trackedRunId) ?? null;
    if (tracked) {
      return tracked;
    }
  }

  const activeRuns = runs.filter((run) => run.status === "active").toSorted(byNewestActivity);
  if (activeRuns.length > 0) {
    return activeRuns[0] ?? null;
  }

  return runs.toSorted(byNewestActivity)[0] ?? null;
}
