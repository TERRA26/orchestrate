import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS browser_annotations (
      annotation_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      session_id TEXT,
      status TEXT NOT NULL,
      annotation_json TEXT NOT NULL,
      target_json TEXT,
      geometry_context_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT,
      reopened_at TEXT
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_browser_annotations_thread_id
    ON browser_annotations(thread_id, created_at DESC)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_browser_annotations_session_id
    ON browser_annotations(session_id, created_at DESC)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_browser_annotations_status
    ON browser_annotations(status)
  `;
});
