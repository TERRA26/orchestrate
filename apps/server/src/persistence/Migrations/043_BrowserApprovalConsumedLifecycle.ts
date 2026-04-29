import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = (yield* sql`PRAGMA table_info(browser_approval_requests)`) as Array<{
    name: string;
  }>;
  const names = new Set(columns.map((column) => column.name));

  if (!names.has("consumed_at")) {
    yield* sql`ALTER TABLE browser_approval_requests ADD COLUMN consumed_at TEXT`;
  }
  if (!names.has("executed_action_ref")) {
    yield* sql`ALTER TABLE browser_approval_requests ADD COLUMN executed_action_ref TEXT`;
  }
});
