import { Effect, Layer, FileSystem, Path } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import { ServerConfig } from "../../config.ts";

type RuntimeSqliteLayerConfig = {
  readonly filename: string;
};

type Loader = {
  layer: (config: RuntimeSqliteLayerConfig) => Layer.Layer<SqlClient.SqlClient>;
};
const defaultSqliteClientLoaders = {
  bun: () => import("@effect/sql-sqlite-bun/SqliteClient"),
  node: () => import("../NodeSqliteClient.ts"),
} satisfies Record<string, () => Promise<Loader>>;

const makeRuntimeSqliteLayer = (
  config: RuntimeSqliteLayerConfig,
): Layer.Layer<SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const runtime = process.versions.bun !== undefined ? "bun" : "node";
    const loader = defaultSqliteClientLoaders[runtime];
    const clientModule = yield* Effect.promise<Loader>(loader);
    return clientModule.layer(config);
  }).pipe(Layer.unwrap);

const setup = Layer.effectDiscard(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    // ORC-016: pragma tuning. Each value is the SQLite-recommended default
    // for a WAL-mode database used as application state.
    //
    // - journal_mode = WAL: writers do not block readers; required by the
    //   ORC-015 transaction-serialization model.
    // - foreign_keys = ON: enforce FK constraints (off by default per
    //   SQLite history; we want them).
    // - synchronous = NORMAL: with WAL, fsync only at WAL checkpoint
    //   (not per commit). FULL is paranoid-durable but ~10x slower.
    //   NORMAL is the SQLite docs' recommendation for WAL.
    // - busy_timeout = 5000ms: under write contention, retry for up to
    //   5 seconds before returning SQLITE_BUSY. Without this, a write
    //   that races a checkpoint or another writer fails immediately.
    // - temp_store = MEMORY: keep temporary tables/indexes in RAM rather
    //   than spilling to /tmp (faster + avoids leaving stale temp files).
    // - cache_size = -64000: 64 MB page cache. Negative means KB; the
    //   SQLite default is 2 MB which is too small for our event-store +
    //   projection workload.
    yield* sql`PRAGMA journal_mode = WAL;`;
    yield* sql`PRAGMA foreign_keys = ON;`;
    yield* sql`PRAGMA synchronous = NORMAL;`;
    yield* sql`PRAGMA busy_timeout = 5000;`;
    yield* sql`PRAGMA temp_store = MEMORY;`;
    yield* sql`PRAGMA cache_size = -64000;`;
    yield* runMigrations();
  }),
);

export const makeSqlitePersistenceLive = (dbPath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(path.dirname(dbPath), { recursive: true });

    return Layer.provideMerge(setup, makeRuntimeSqliteLayer({ filename: dbPath }));
  }).pipe(Layer.unwrap);

export const SqlitePersistenceMemory = Layer.provideMerge(
  setup,
  makeRuntimeSqliteLayer({ filename: ":memory:" }),
);

export const layerConfig = Layer.unwrap(
  Effect.map(Effect.service(ServerConfig), ({ dbPath }) => makeSqlitePersistenceLive(dbPath)),
);
