import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS rework_tasks (
      rework_task_id TEXT PRIMARY KEY,
      parent_decision_id TEXT,
      workflow_run_id TEXT,
      thread_id TEXT NOT NULL,
      orchestrator_task_id TEXT,
      worker_id TEXT,
      status TEXT NOT NULL,
      annotation_targets_json TEXT NOT NULL,
      evidence_refs_json TEXT NOT NULL,
      before_evidence_refs_json TEXT NOT NULL,
      after_evidence_refs_json TEXT NOT NULL,
      instruction TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      submitted_at TEXT,
      reviewed_at TEXT
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_rework_tasks_parent_decision_id
    ON rework_tasks(parent_decision_id, created_at DESC)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_rework_tasks_orchestrator_task_id
    ON rework_tasks(orchestrator_task_id)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_rework_tasks_status
    ON rework_tasks(status, updated_at DESC)
  `;
});
