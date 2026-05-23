/**
 * Standalone SQLite snapshot exporter introduced by ORC-192.
 *
 * Produces a gzipped portable snapshot of the orchestrate state DB by
 * running `VACUUM INTO` on a fresh temp file, then gzipping it. The
 * source DB must NOT be exclusively locked by another process; the
 * orchestrate server uses WAL mode so readers do not block writers,
 * and `VACUUM INTO` operates against a read snapshot.
 *
 * Usage:
 *   bun run export-snapshot --db <path> --output <path>
 *
 * Defaults:
 *   --db     <state-dir>/state.sqlite
 *   --output <state-dir>/orchestrate-snapshot-<ISO timestamp>.db.gz
 *
 * Restore:
 *   gunzip -c <output>.db.gz > restored.sqlite
 *   then point ORCHESTRATE_DATA_DIR or replace the in-place state.sqlite.
 *   The restored file is a valid SQLite database; no schema migration
 *   is required if the build version is the same as when the snapshot
 *   was taken.
 *
 * @see ORC-192
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";

export interface ExportSnapshotInput {
  readonly dbPath: string;
  readonly outputPath: string;
}

export interface ExportSnapshotResult {
  readonly outputPath: string;
  readonly bytesWritten: number;
  readonly sourceDbPath: string;
}

/**
 * Run VACUUM INTO against the source database, gzip the result, and
 * write it to the output path. The temp file is removed on both
 * success and failure.
 */
export function exportSqliteSnapshot(input: ExportSnapshotInput): ExportSnapshotResult {
  const tempDir = mkdtempSync(path.join(tmpdir(), "orchestrate-snapshot-"));
  const tempVacuumPath = path.join(tempDir, "snapshot.sqlite");
  const db = new DatabaseSync(input.dbPath, { readOnly: true });
  try {
    // VACUUM INTO is atomic and produces a clean, defragmented copy
    // of the database with no WAL or shm sidecar files. The path is
    // bound through a parameter to defend against shell-style
    // injection (the user controls dbPath via CLI in production).
    db.prepare("VACUUM INTO ?1").run(tempVacuumPath);
  } finally {
    db.close();
  }

  let raw: Buffer;
  try {
    raw = readFileSync(tempVacuumPath);
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }

  const gzipped = gzipSync(raw, { level: 9 });

  mkdirSync(path.dirname(input.outputPath), { recursive: true });
  writeFileSync(input.outputPath, gzipped, { mode: 0o600 });

  return {
    outputPath: input.outputPath,
    bytesWritten: gzipped.length,
    sourceDbPath: input.dbPath,
  };
}

interface CliArgs {
  readonly dbPath: string;
  readonly outputPath: string;
}

function defaultStateDir(): string {
  const fromEnv = process.env.ORCHESTRATE_DATA_DIR ?? process.env.T3_DATA_DIR;
  if (typeof fromEnv === "string" && fromEnv.length > 0) return fromEnv;
  return path.join(homedir(), ".orchestrate", "userdata");
}

function defaultOutputPath(stateDir: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(stateDir, `orchestrate-snapshot-${stamp}.db.gz`);
}

export function parseCliArgs(argv: readonly string[]): CliArgs {
  const stateDir = defaultStateDir();
  let dbPath = path.join(stateDir, "state.sqlite");
  let outputPath = defaultOutputPath(stateDir);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--db" && typeof argv[i + 1] === "string") {
      dbPath = argv[i + 1] as string;
      i += 1;
    } else if (arg === "--output" && typeof argv[i + 1] === "string") {
      outputPath = argv[i + 1] as string;
      i += 1;
    }
  }
  return { dbPath, outputPath };
}

if (import.meta.main) {
  const args = parseCliArgs(process.argv.slice(2));
  const result = exportSqliteSnapshot(args);
  process.stdout.write(
    "snapshot written: " +
      result.outputPath +
      " (" +
      result.bytesWritten +
      " bytes gzipped) from " +
      result.sourceDbPath +
      "\n",
  );
}
