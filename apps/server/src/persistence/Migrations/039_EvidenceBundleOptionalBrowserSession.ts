import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS evidence_bundles_v2 (
      bundle_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      workflow_run_id TEXT NOT NULL,
      preview_target_id TEXT NOT NULL,
      task_spec_id TEXT NOT NULL,
      acceptance_criteria_id TEXT NOT NULL,
      permission_policy_id TEXT NOT NULL,
      browser_session_id TEXT,
      code_state_json TEXT NOT NULL,
      artifact_refs_json TEXT NOT NULL,
      event_refs_json TEXT NOT NULL,
      bundle_snapshot_json TEXT,
      created_at TEXT NOT NULL
    )
  `;

  yield* sql`
    INSERT OR IGNORE INTO evidence_bundles_v2 (
      bundle_id, session_id, workflow_run_id, preview_target_id,
      task_spec_id, acceptance_criteria_id, permission_policy_id,
      browser_session_id, code_state_json, artifact_refs_json,
      event_refs_json, bundle_snapshot_json, created_at
    )
    SELECT
      bundle_id, session_id, workflow_run_id, preview_target_id,
      task_spec_id, acceptance_criteria_id, permission_policy_id,
      browser_session_id, code_state_json, artifact_refs_json,
      event_refs_json, bundle_snapshot_json, created_at
    FROM evidence_bundles
  `.pipe(Effect.catchTag("SqlError", () => Effect.void));

  yield* sql`DROP TABLE IF EXISTS evidence_bundles`;
  yield* sql`ALTER TABLE evidence_bundles_v2 RENAME TO evidence_bundles`;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_evidence_bundles_session_id
    ON evidence_bundles(session_id)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_evidence_bundles_workflow_run_id
    ON evidence_bundles(workflow_run_id)
  `;
});
