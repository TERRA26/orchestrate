import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS orchestrator_evidence (
      evidence_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      worker_id TEXT,
      type TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      content TEXT NOT NULL,
      content_truncated INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_orchestrator_evidence_task_id
    ON orchestrator_evidence(task_id)
  `;
});
