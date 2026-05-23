import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS evidence_artifact_contents (
      artifact_id TEXT PRIMARY KEY,
      content_text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(artifact_id) REFERENCES evidence_artifacts(artifact_id)
    )
  `;
});
