/**
 * Migration integrity helpers (ORC-216).
 *
 * Effect's Migrator runs each migration in its own transaction. If
 * migration N+1 throws, its body rolls back and the migrations log
 * does NOT record it; the DB stays at version N. That's already safe
 * per-migration. The remaining concern is operator-facing: when the
 * Effect runtime crashes the server with the bare underlying error
 * (often a cryptic "no such column" or "syntax error near"), there's
 * no structured signal of which migration failed or how to recover.
 *
 * These helpers produce a clear MigrationFailureError with a recovery
 * hint and a way to compare executed vs expected migrations so future
 * boot paths can fail with a clear message before any code that
 * expects the latest schema runs.
 */
import { Data } from "effect";

export class MigrationFailureError extends Data.TaggedError("MigrationFailureError")<{
  readonly attemptedId?: number;
  readonly attemptedName?: string;
  readonly cause: unknown;
  readonly message: string;
}> {}

export type ExpectedMigration = readonly [id: number, name: string];

export interface MigrationIntegrityResult {
  readonly ok: boolean;
  readonly missing: ReadonlyArray<ExpectedMigration>;
  readonly highestApplied: number;
  readonly highestExpected: number;
}

/**
 * Compare the set of executed migration IDs to the expected set. Returns
 * an `ok: true` outcome if every expected migration is present in the
 * executed list; otherwise reports the missing ones plus the highest
 * applied/expected IDs.
 */
export function computeMigrationIntegrity(input: {
  readonly executed: ReadonlyArray<ExpectedMigration>;
  readonly expected: ReadonlyArray<ExpectedMigration>;
}): MigrationIntegrityResult {
  const executedIds = new Set(input.executed.map(([id]) => id));
  const missing = input.expected.filter(([id]) => !executedIds.has(id));
  const highestApplied = input.executed.reduce((max, [id]) => (id > max ? id : max), 0);
  const highestExpected = input.expected.reduce((max, [id]) => (id > max ? id : max), 0);
  return {
    ok: missing.length === 0,
    missing,
    highestApplied,
    highestExpected,
  };
}

/**
 * Format a clear, recovery-oriented message for a migration failure.
 * The message is intended to be the top-line operator log when the
 * server cannot start because a migration failed mid-run.
 */
export function formatMigrationFailureMessage(input: {
  readonly attemptedId?: number;
  readonly attemptedName?: string;
  readonly cause: unknown;
}): string {
  const causeStr = input.cause instanceof Error ? input.cause.message : String(input.cause);
  const what =
    input.attemptedId !== undefined && input.attemptedName !== undefined
      ? `migration ${input.attemptedId}_${input.attemptedName} failed`
      : "migration failed";
  return [
    `DB schema migration aborted: ${what}.`,
    `Reason: ${causeStr}.`,
    "The migration's transaction was rolled back; the DB is at the previous",
    "schema version. To recover: 1) read the server logs for the SQL error,",
    "2) fix the migration script (or the data that triggered the failure),",
    "3) restart the server. If the migration is unrecoverable, drop the DB",
    "file and let the server re-run all migrations from scratch.",
  ].join(" ");
}

/**
 * Build the canonical set of expected migrations from a list of
 * migrationEntries tuples. Exported separately so tests and the runner
 * can use the same computation.
 */
export function projectExpectedMigrations<T extends readonly [number, string, unknown]>(
  entries: ReadonlyArray<T>,
): ReadonlyArray<ExpectedMigration> {
  return entries.map(([id, name]) => [id, name] as const);
}
