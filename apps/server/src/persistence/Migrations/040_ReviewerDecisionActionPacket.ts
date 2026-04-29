import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE browser_reviewer_decisions
    ADD COLUMN purpose TEXT NOT NULL DEFAULT 'manual-review'
  `.pipe(Effect.catchTag("SqlError", () => Effect.void));

  yield* sql`
    ALTER TABLE browser_reviewer_decisions
    ADD COLUMN action_packet_json TEXT
  `.pipe(Effect.catchTag("SqlError", () => Effect.void));
});
