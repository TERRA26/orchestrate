import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS browser_control_states (
      browser_session_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      lease_id TEXT,
      holder TEXT NOT NULL,
      state TEXT NOT NULL,
      reason TEXT NOT NULL,
      last_observation_ref TEXT,
      snapshot_after_release_ref TEXT,
      fresh_observation_required INTEGER NOT NULL DEFAULT 0,
      desktop_client_id TEXT,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_browser_control_states_session_id
    ON browser_control_states(session_id)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS browser_approval_requests (
      approval_id TEXT PRIMARY KEY,
      browser_session_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      desktop_client_id TEXT,
      action_json TEXT NOT NULL,
      action_hash TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL,
      risk TEXT NOT NULL,
      pre_approval_observation_ref TEXT,
      observed_url TEXT,
      origin TEXT,
      status TEXT NOT NULL,
      evidence_refs_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT,
      consumed_at TEXT,
      executed_action_ref TEXT,
      decision_reason TEXT
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_browser_approval_requests_browser_session
    ON browser_approval_requests(browser_session_id, status)
  `;
});
