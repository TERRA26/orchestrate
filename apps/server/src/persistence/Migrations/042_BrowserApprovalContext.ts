import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = (yield* sql`PRAGMA table_info(browser_approval_requests)`) as Array<{
    name: string;
  }>;
  const names = new Set(columns.map((column) => column.name));

  if (!names.has("desktop_client_id")) {
    yield* sql`ALTER TABLE browser_approval_requests ADD COLUMN desktop_client_id TEXT`;
  }
  if (!names.has("action_hash")) {
    yield* sql`ALTER TABLE browser_approval_requests ADD COLUMN action_hash TEXT NOT NULL DEFAULT ''`;
  }
  if (!names.has("pre_approval_observation_ref")) {
    yield* sql`ALTER TABLE browser_approval_requests ADD COLUMN pre_approval_observation_ref TEXT`;
  }
  if (!names.has("observed_url")) {
    yield* sql`ALTER TABLE browser_approval_requests ADD COLUMN observed_url TEXT`;
  }
  if (!names.has("origin")) {
    yield* sql`ALTER TABLE browser_approval_requests ADD COLUMN origin TEXT`;
  }
});
