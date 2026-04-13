import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE orchestrator_workers
    ADD COLUMN visibility TEXT NOT NULL DEFAULT 'foreground'
  `.pipe(
    // SQLite throws if the column already exists during repeated local bootstraps.
    Effect.orElseSucceed(() => undefined),
  );

  yield* sql`
    UPDATE orchestrator_workers
    SET visibility = 'foreground'
    WHERE visibility IS NULL OR TRIM(visibility) = ''
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_orchestrator_workers_visibility
    ON orchestrator_workers(visibility)
  `;
});
