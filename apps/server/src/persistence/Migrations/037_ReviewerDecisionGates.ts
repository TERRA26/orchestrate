import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE browser_reviewer_decisions
    ADD COLUMN gates_json TEXT NOT NULL DEFAULT '[]'
  `.pipe(Effect.catchTag("SqlError", () => Effect.void));
});
