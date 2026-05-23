import { assert, it } from "@effect/vitest";
import { Effect } from "effect";
import * as Migrator from "effect/unstable/sql/Migrator";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { migrationEntries, runMigrations } from "./Migrations.ts";
import { SqlitePersistenceMemory } from "./Layers/Sqlite.ts";

/**
 * Migration runner tests for ORC-103.
 *
 * The persistence layer ships 45+ schema migrations applied via
 * Effect's Migrator (fromRecord). The Live layer auto-runs all
 * migrations on layer construction, but until now no test verified:
 *  - All migrations apply cleanly to an empty database.
 *  - The migration table records exactly the expected number of entries.
 *  - Running the migration set a second time is idempotent (no churn).
 *  - The schema includes the canonical tables we depend on.
 *
 * Down migrations are out of scope — the Effect Migrator does not
 * support automatic rollbacks; rollback is a manual disaster-recovery
 * operation, not a regular code path. Tracked as a follow-up.
 *
 * @see ORC-103
 */

const layer = it.layer(SqlitePersistenceMemory);

interface MigrationRow {
  readonly migration_id: number;
  readonly name: string;
}

interface CountRow {
  readonly count: number;
}

interface TableRow {
  readonly name: string;
}

layer("migration runner (ORC-103)", (it) => {
  it.effect("runs all migrations on a fresh in-memory database", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      // SqlitePersistenceMemory layer already ran all migrations during
      // construction. The tracking table is named effect_sql_migrations.
      const rows = yield* sql<MigrationRow>`
        SELECT migration_id, name FROM effect_sql_migrations ORDER BY migration_id ASC
      `;
      assert.equal(rows.length, migrationEntries.length);
      for (let i = 0; i < migrationEntries.length; i += 1) {
        const expected = migrationEntries[i];
        const actual = rows[i];
        assert.ok(expected, `entry ${i} is undefined`);
        assert.ok(actual, `row ${i} is undefined`);
        assert.equal(actual!.migration_id, expected![0]);
        assert.equal(actual!.name, expected![1]);
      }
    }),
  );

  it.effect("running migrations a second time is idempotent (no new rows)", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const before = yield* sql<CountRow>`SELECT COUNT(*) AS count FROM effect_sql_migrations`;
      const beforeCount = before[0]?.count;
      assert.equal(beforeCount, migrationEntries.length);

      // Replay all migrations; the migrator should detect they're already
      // applied and not insert duplicate tracking rows.
      yield* runMigrations();

      const after = yield* sql<CountRow>`SELECT COUNT(*) AS count FROM effect_sql_migrations`;
      const afterCount = after[0]?.count;
      assert.equal(afterCount, beforeCount);
    }),
  );

  it.effect("creates the orchestration_events table (anchor: migration 001)", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const rows = yield* sql<TableRow>`
        SELECT name FROM sqlite_master
         WHERE type='table' AND name='orchestration_events'
      `;
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.name, "orchestration_events");
    }),
  );

  it.effect("creates the orchestrator_runs table (anchor: migration 027)", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const rows = yield* sql<TableRow>`
        SELECT name FROM sqlite_master
         WHERE type='table' AND name='orchestrator_runs'
      `;
      assert.equal(rows.length, 1);
    }),
  );

  it.effect("creates the orchestrator_tasks table (anchor: migration 028)", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const rows = yield* sql<TableRow>`
        SELECT name FROM sqlite_master
         WHERE type='table' AND name='orchestrator_tasks'
      `;
      assert.equal(rows.length, 1);
    }),
  );

  it.effect("supports running migrations up to a specific id (toMigrationInclusive)", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      // Layer already ran everything. Calling runMigrations with a smaller
      // boundary is a no-op (already past it). The contract: the tracking
      // table should still report the latest applied id, not regress.
      yield* runMigrations({ toMigrationInclusive: 5 });
      const rows = yield* sql<CountRow>`SELECT COUNT(*) AS count FROM effect_sql_migrations`;
      assert.equal(rows[0]?.count, migrationEntries.length);
    }),
  );

  it("the migration entries list is gap-free and monotonic", () => {
    // Pure invariant; lives outside the it.effect harness.
    let previous = 0;
    for (const [id] of migrationEntries) {
      assert.equal(id, previous + 1, `migration ids must increase by 1; saw ${previous} -> ${id}`);
      previous = id;
    }
  });

  // ORC-197: a failing migration must NOT leave the database in a
  // partially-migrated state. Effect's Migrator wraps each migration
  // body in its own transaction; if any statement fails, the rollback
  // discards every change AND the tracking-table row is never written.
  // The next startup either retries the same migration cleanly or
  // surfaces the failure for operator recovery.
  it.effect("a failing synthetic migration leaves the DB at the prior version (ORC-197)", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      // Snapshot the state of effect_sql_migrations BEFORE we attempt
      // the failing migration.
      const beforeRows = yield* sql<CountRow>`
        SELECT COUNT(*) AS count FROM effect_sql_migrations
      `;
      const beforeCount = beforeRows[0]?.count;
      assert.ok(typeof beforeCount === "number");

      const failingMigration = Effect.gen(function* () {
        const innerSql = yield* SqlClient.SqlClient;
        // Step 1: create a table that should be rolled back if step 2 fails.
        yield* innerSql`
          CREATE TABLE orc_197_canary (id INTEGER PRIMARY KEY, body TEXT)
        `;
        // Step 2: deliberately invalid SQL forces a transaction abort.
        // Cast to never to short-circuit the type checker; at runtime
        // SQLite raises a syntax error.
        yield* innerSql`SELECT * FROM does_not_exist_orc_197`;
      });

      const failingLoader = Migrator.fromRecord({
        "9999_OrcOneNineSevenFailingCanary": failingMigration,
      });

      const baseRunner = Migrator.make({});
      const exit = yield* baseRunner({ loader: failingLoader }).pipe(Effect.exit);
      assert.equal(
        exit._tag,
        "Failure",
        "expected failing migration to surface as Failure",
      );

      // The canary table must NOT exist (transaction rolled back).
      const canaryRows = yield* sql<TableRow>`
        SELECT name FROM sqlite_master WHERE type='table' AND name='orc_197_canary'
      `;
      assert.equal(canaryRows.length, 0);

      // The migration tracking row must NOT have been written.
      const afterRows = yield* sql<CountRow>`
        SELECT COUNT(*) AS count FROM effect_sql_migrations
      `;
      assert.equal(afterRows[0]?.count, beforeCount);
    }),
  );
});
