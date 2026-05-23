import type { OrchestratorWorker } from "@orchestrate/contracts";

/**
 * Worker statuses that imply an in-flight or paused provider session.
 *
 * On a fresh server boot every provider session is gone (they died
 * with the previous process). Any worker persisted in one of these
 * states is therefore orphaned and must be terminated so the
 * orchestrator's spawn loop can re-plan and dependent tasks can
 * unblock.
 *
 * - `running`: actively streaming events.
 * - `submitted`: emitted REPORT but acceptance had not landed.
 * - `paused`: temporarily halted (lease lost) but holding state.
 * - `stuck`: detected by detectStuckWorkers; was never resolved.
 *
 * `idle` and `terminated` are NOT orphan candidates: idle holds no
 * active task, and terminated is already terminal. We leave them
 * alone.
 *
 * @see ORC-275
 */
const ORPHANED_STATUSES_ON_RECOVERY = new Set<OrchestratorWorker["status"]>([
  "running",
  "submitted",
  "paused",
  "stuck",
]);

/**
 * Returns the subset of `workers` that should be auto-terminated at
 * recovery time. Pure function; the caller is responsible for the
 * dispatch.
 *
 * @see ORC-275
 */
export function findOrphanedWorkersOnRecovery(
  workers: ReadonlyArray<OrchestratorWorker>,
): ReadonlyArray<OrchestratorWorker> {
  return workers.filter((w) => ORPHANED_STATUSES_ON_RECOVERY.has(w.status));
}

/**
 * Stable reason string for the terminate event so logs and alerts
 * can group orphan terminations distinct from user-initiated ones.
 *
 * @see ORC-275
 */
export const ORPHAN_RECOVERY_REASON =
  "recovery: orphaned by server restart, no live provider session";
