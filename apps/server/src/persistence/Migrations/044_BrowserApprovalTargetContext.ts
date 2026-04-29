import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = (yield* sql`PRAGMA table_info(browser_approval_requests)`) as Array<{
    name: string;
  }>;
  if (!columns.some((column) => column.name === "target_context_json")) {
    yield* sql`ALTER TABLE browser_approval_requests ADD COLUMN target_context_json TEXT`;
  }
});
