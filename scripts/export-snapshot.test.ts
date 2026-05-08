import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { exportSqliteSnapshot, parseCliArgs } from "./export-snapshot";

/**
 * Pins the SQLite snapshot exporter introduced by ORC-192.
 *
 * @see ORC-192
 */

describe("exportSqliteSnapshot (ORC-192)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "orc-192-test-"));
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  function makeFixtureDb(): string {
    const dbPath = path.join(tempDir, "source.sqlite");
    const db = new DatabaseSync(dbPath);
    db.exec(
      "CREATE TABLE messages (id INTEGER PRIMARY KEY, body TEXT NOT NULL, created_at TEXT NOT NULL)",
    );
    db.prepare("INSERT INTO messages (body, created_at) VALUES (?1, ?2)").run(
      "first message",
      "2026-05-08T00:00:00.000Z",
    );
    db.prepare("INSERT INTO messages (body, created_at) VALUES (?1, ?2)").run(
      "second message",
      "2026-05-08T00:00:01.000Z",
    );
    db.close();
    return dbPath;
  }

  it("writes a gzipped SQLite snapshot to the output path", () => {
    const sourceDb = makeFixtureDb();
    const outputPath = path.join(tempDir, "snapshot.db.gz");

    const result = exportSqliteSnapshot({ dbPath: sourceDb, outputPath });

    expect(result.outputPath).toBe(outputPath);
    expect(result.bytesWritten).toBeGreaterThan(0);

    // The output file should start with the gzip magic bytes.
    const raw = readFileSync(outputPath);
    expect(raw[0]).toBe(0x1f);
    expect(raw[1]).toBe(0x8b);
  });

  it("produces a snapshot whose data round-trips via gunzip + sqlite open", () => {
    const sourceDb = makeFixtureDb();
    const outputPath = path.join(tempDir, "snapshot.db.gz");

    exportSqliteSnapshot({ dbPath: sourceDb, outputPath });

    const restoredPath = path.join(tempDir, "restored.sqlite");
    const decompressed = gunzipSync(readFileSync(outputPath));
    writeFileSync(restoredPath, decompressed);

    const restored = new DatabaseSync(restoredPath, { readOnly: true });
    try {
      const rows = restored
        .prepare("SELECT id, body, created_at AS createdAt FROM messages ORDER BY id ASC")
        .all() as Array<{ id: number; body: string; createdAt: string }>;
      expect(rows).toHaveLength(2);
      expect(rows[0]?.body).toBe("first message");
      expect(rows[1]?.body).toBe("second message");
    } finally {
      restored.close();
    }
  });

  it("creates the output directory if it does not exist", () => {
    const sourceDb = makeFixtureDb();
    const outputPath = path.join(tempDir, "nested", "deep", "snapshot.db.gz");

    const result = exportSqliteSnapshot({ dbPath: sourceDb, outputPath });

    expect(result.outputPath).toBe(outputPath);
    const raw = readFileSync(outputPath);
    expect(raw.length).toBeGreaterThan(0);
  });

  it("does not corrupt the source DB (open the source again after export)", () => {
    const sourceDb = makeFixtureDb();
    exportSqliteSnapshot({
      dbPath: sourceDb,
      outputPath: path.join(tempDir, "out.db.gz"),
    });

    const reopened = new DatabaseSync(sourceDb, { readOnly: true });
    try {
      const rows = reopened
        .prepare("SELECT COUNT(*) AS count FROM messages")
        .all() as Array<{ count: number }>;
      expect(rows[0]?.count).toBe(2);
    } finally {
      reopened.close();
    }
  });

  it("rejects a missing source db with a SQLite error", () => {
    expect(() =>
      exportSqliteSnapshot({
        dbPath: path.join(tempDir, "does-not-exist.sqlite"),
        outputPath: path.join(tempDir, "out.db.gz"),
      }),
    ).toThrow();
  });
});

describe("parseCliArgs (ORC-192)", () => {
  it("returns defaults when no flags are supplied", () => {
    const args = parseCliArgs([]);
    expect(typeof args.dbPath).toBe("string");
    expect(args.dbPath.endsWith("state.sqlite")).toBe(true);
    expect(typeof args.outputPath).toBe("string");
    expect(args.outputPath.endsWith(".db.gz")).toBe(true);
  });

  it("respects --db <path>", () => {
    const args = parseCliArgs(["--db", "/custom/path/state.sqlite"]);
    expect(args.dbPath).toBe("/custom/path/state.sqlite");
  });

  it("respects --output <path>", () => {
    const args = parseCliArgs(["--output", "/tmp/orchestrate.db.gz"]);
    expect(args.outputPath).toBe("/tmp/orchestrate.db.gz");
  });

  it("ignores unknown flags rather than throwing", () => {
    const args = parseCliArgs(["--unknown", "value", "--db", "/p"]);
    expect(args.dbPath).toBe("/p");
  });
});
