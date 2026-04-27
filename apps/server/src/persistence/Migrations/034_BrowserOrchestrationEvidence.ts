import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS browser_session_events (
      event_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      workflow_run_id TEXT,
      type TEXT NOT NULL,
      actor TEXT NOT NULL,
      artifact_refs_json TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_browser_session_events_session_time
    ON browser_session_events(session_id, occurred_at)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_browser_session_events_workflow_run_id
    ON browser_session_events(workflow_run_id)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS evidence_artifacts (
      artifact_id TEXT PRIMARY KEY,
      schema_version TEXT NOT NULL,
      kind TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      content_type TEXT NOT NULL,
      storage_uri TEXT NOT NULL,
      sensitivity TEXT NOT NULL,
      access TEXT NOT NULL,
      redacted_artifact_id TEXT,
      superseded_by_artifact_id TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_evidence_artifacts_kind
    ON evidence_artifacts(kind)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_evidence_artifacts_created_at
    ON evidence_artifacts(created_at)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS evidence_bundles (
      bundle_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      workflow_run_id TEXT NOT NULL,
      preview_target_id TEXT NOT NULL,
      task_spec_id TEXT NOT NULL,
      acceptance_criteria_id TEXT NOT NULL,
      permission_policy_id TEXT NOT NULL,
      browser_session_id TEXT NOT NULL,
      code_state_json TEXT NOT NULL,
      artifact_refs_json TEXT NOT NULL,
      event_refs_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_evidence_bundles_session_id
    ON evidence_bundles(session_id)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_evidence_bundles_workflow_run_id
    ON evidence_bundles(workflow_run_id)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS browser_reviewer_decisions (
      decision_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      workflow_run_id TEXT NOT NULL,
      evidence_bundle_id TEXT NOT NULL,
      outcome TEXT NOT NULL,
      confidence TEXT NOT NULL,
      criteria_json TEXT NOT NULL,
      findings_json TEXT NOT NULL,
      unresolved_criteria_json TEXT NOT NULL,
      rework_packet_json TEXT,
      user_visible_summary_ref TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(evidence_bundle_id) REFERENCES evidence_bundles(bundle_id)
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_browser_reviewer_decisions_session_id
    ON browser_reviewer_decisions(session_id)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_browser_reviewer_decisions_workflow_run_id
    ON browser_reviewer_decisions(workflow_run_id)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_browser_reviewer_decisions_evidence_bundle_id
    ON browser_reviewer_decisions(evidence_bundle_id)
  `;
});
