import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { SqlitePersistenceMemory } from "./Sqlite.ts";

const layer = it.layer(SqlitePersistenceMemory);

layer("Sqlite pragmas (ORC-016)", (it) => {
  it.effect("sets journal_mode = WAL (or memory for in-memory dbs)", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const rows = yield* sql<{ readonly journal_mode: string }>`PRAGMA journal_mode;`;
      // For an in-memory database SQLite reports "memory" rather than
      // upgrading to WAL. For a file-backed DB this would be "wal". Either
      // is correct; the negative case is "delete" (the default) which is
      // what we explicitly avoid.
      const mode = rows[0]?.journal_mode?.toLowerCase();
      assert.ok(mode === "wal" || mode === "memory", `unexpected journal_mode: ${mode ?? "(none)"}`);
    }),
  );

  it.effect("sets foreign_keys = ON", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const rows = yield* sql<{ readonly foreign_keys: number }>`PRAGMA foreign_keys;`;
      assert.equal(rows[0]?.foreign_keys, 1);
    }),
  );

  it.effect("sets synchronous = NORMAL (1)", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const rows = yield* sql<{ readonly synchronous: number }>`PRAGMA synchronous;`;
      // SQLite encodes synchronous as integer: 0=OFF, 1=NORMAL, 2=FULL, 3=EXTRA.
      assert.equal(rows[0]?.synchronous, 1);
    }),
  );

  it.effect("sets busy_timeout = 5000ms", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const rows = yield* sql<{ readonly timeout: number }>`PRAGMA busy_timeout;`;
      assert.equal(rows[0]?.timeout, 5000);
    }),
  );

  it.effect("sets temp_store = MEMORY (2)", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const rows = yield* sql<{ readonly temp_store: number }>`PRAGMA temp_store;`;
      // 0=DEFAULT, 1=FILE, 2=MEMORY.
      assert.equal(rows[0]?.temp_store, 2);
    }),
  );

  it.effect("sets cache_size = -64000 (64 MB; negative means KB)", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const rows = yield* sql<{ readonly cache_size: number }>`PRAGMA cache_size;`;
      assert.equal(rows[0]?.cache_size, -64000);
    }),
  );
});
