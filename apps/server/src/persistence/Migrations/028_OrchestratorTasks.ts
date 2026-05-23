import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS orchestrator_tasks (
      task_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      parent_task_id TEXT,
      title TEXT NOT NULL,
      objective TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      owner_kind TEXT NOT NULL DEFAULT 'orchestrator',
      owner_id TEXT,
      stop_condition TEXT,
      read_scope_json TEXT,
      write_scope_json TEXT,
      allowed_tools_json TEXT,
      evidence_required_json TEXT,
      escalation_rules TEXT,
      acceptance_criteria_json TEXT NOT NULL DEFAULT '[]',
      checklist_json TEXT NOT NULL DEFAULT '[]',
      depends_on_json TEXT,
      blocked_by TEXT,
      model_policy_json TEXT,
      assigned_worker_id TEXT,
      iteration INTEGER NOT NULL DEFAULT 0,
      max_iterations INTEGER NOT NULL DEFAULT 3,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      submitted_at TEXT,
      accepted_at TEXT
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_orchestrator_tasks_run_id
    ON orchestrator_tasks(run_id)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_orchestrator_tasks_status
    ON orchestrator_tasks(status)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_orchestrator_tasks_parent_task_id
    ON orchestrator_tasks(parent_task_id)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_orchestrator_tasks_assigned_worker_id
    ON orchestrator_tasks(assigned_worker_id)
  `;
});
