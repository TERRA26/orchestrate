import * as SqlClient from "effect/unstable/sql/SqlClient";
import { Effect } from "effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    ALTER TABLE projection_threads ADD COLUMN thread_type TEXT NOT NULL DEFAULT 'orchestrator'
  `.pipe(Effect.orElseSucceed(() => undefined));
  yield* sql`
    ALTER TABLE projection_threads ADD COLUMN parent_thread_id TEXT DEFAULT NULL
  `.pipe(Effect.orElseSucceed(() => undefined));
});
