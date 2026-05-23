import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS orchestrator_runs (
      run_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      user_request TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      root_task_id TEXT NOT NULL,
      goals_json TEXT NOT NULL DEFAULT '[]',
      constraints_json TEXT,
      spawn_budget_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      completion_summary TEXT
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_orchestrator_runs_project_id
    ON orchestrator_runs(project_id)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_orchestrator_runs_status
    ON orchestrator_runs(status)
  `;
});
