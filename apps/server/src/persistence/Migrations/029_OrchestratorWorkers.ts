import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS orchestrator_workers (
      worker_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      active_task_id TEXT,
      parent_worker_id TEXT,
      spawn_budget_json TEXT NOT NULL,
      workspace_json TEXT NOT NULL,
      model_binding_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      terminated_at TEXT,
      termination_reason TEXT
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_orchestrator_workers_run_id
    ON orchestrator_workers(run_id)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_orchestrator_workers_thread_id
    ON orchestrator_workers(thread_id)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_orchestrator_workers_status
    ON orchestrator_workers(status)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_orchestrator_workers_parent_worker_id
    ON orchestrator_workers(parent_worker_id)
  `;
});
