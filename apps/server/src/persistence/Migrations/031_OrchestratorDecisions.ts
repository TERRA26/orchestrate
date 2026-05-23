import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS orchestrator_decisions (
      decision_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      task_id TEXT,
      type TEXT NOT NULL,
      reason TEXT NOT NULL,
      inputs TEXT,
      created_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_orchestrator_decisions_run_id
    ON orchestrator_decisions(run_id)
  `;
});
