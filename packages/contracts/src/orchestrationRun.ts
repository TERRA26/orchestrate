/**
 * Canonical constants governing a single orchestrator run's lifecycle.
 *
 * These were previously duplicated (or implicit) across apps/web, apps/server
 * and ad-hoc tests. Consolidating here so server and UI agree on budgets,
 * truncation thresholds, and review context sizing.
 *
 * All values are intentionally plain numeric constants (not Schemas) — they
 * describe runtime limits, not serialized contracts.
 */

/** Maximum reviewer↔agent round-trips per orchestrator run before escalation. */
export const ORCHESTRATOR_MAX_ITERATIONS = 6;

/** Upper bound on how many modified-file snapshots the reviewer can inspect in one turn. */
export const ORCHESTRATOR_MAX_REVIEW_FILE_SNAPSHOTS = 12;

/** Character cap for the aggregate diff payload sent to the reviewer. */
export const ORCHESTRATOR_MAX_REVIEW_DIFF_CHARS = 40_000;

/** Character cap per individual reviewed file's contents slice. */
export const ORCHESTRATOR_MAX_REVIEW_FILE_CHARS = 12_000;

/** Number of recent work-log entries the reviewer sees. */
export const ORCHESTRATOR_MAX_REVIEW_WORK_LOG_ENTRIES = 8;

/** Character cap per work-log entry detail. */
export const ORCHESTRATOR_MAX_REVIEW_WORK_LOG_DETAIL_CHARS = 4_000;
