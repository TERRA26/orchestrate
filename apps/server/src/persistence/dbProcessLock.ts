import { closeSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * SQLite WAL allows concurrent readers and one writer per process,
 * but two distinct processes pointing at the same DB file produce
 * subtly broken WAL frame chains (especially across `bun dev`
 * restarts). This helper acquires an exclusive sentinel lock at
 * startup and refuses to start if a live PID already holds it.
 *
 * The sentinel file lives next to the DB (default `<dbPath>.lock`)
 * so its lifecycle tracks the DB itself.
 *
 * @see ORC-196
 */

export type AcquireResult =
  | {
      readonly ok: true;
      readonly sentinelPath: string;
      readonly release: () => void;
    }
  | {
      readonly ok: false;
      readonly reason:
        | "held-by-live-process"
        | "stat-failed"
        | "write-failed";
      readonly heldByPid?: number;
      readonly detail?: string;
    };

export interface AcquireOptions {
  /** Override the default sentinel path (defaults to `dbPath + ".lock"`). */
  readonly sentinelPath?: string;
  /**
   * Optional PID-liveness probe. Defaults to `process.kill(pid, 0)`.
   * Tests can inject their own to simulate dead/alive PIDs without
   * touching real processes.
   */
  readonly isProcessAlive?: (pid: number) => boolean;
  /** PID to record in the sentinel. Defaults to `process.pid`. */
  readonly pid?: number;
}

const SIDECAR_FILE_MODE = 0o600;

function defaultIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Acquire an exclusive process-level lock for a SQLite database.
 *
 * Returns `{ ok: true, release }` on success. The caller must invoke
 * `release()` on shutdown. Returns `{ ok: false, reason }` if the
 * sentinel is held by a live process.
 *
 * Stale sentinels (PID is dead) are reclaimed by overwriting; this
 * preserves recovery after a crash. The reclaim is logged via the
 * return shape (`reason: "held-by-live-process"` is the ONLY failure
 * mode that prevents startup; everything else attempts a recovery).
 */
export function acquireDatabaseLock(
  dbPath: string,
  options: AcquireOptions = {},
): AcquireResult {
  const sentinelPath = options.sentinelPath ?? `${dbPath}.lock`;
  const isProcessAlive = options.isProcessAlive ?? defaultIsAlive;
  const pid = options.pid ?? process.pid;

  // Try the optimistic path first: O_EXCL create.
  try {
    const fd = openSync(sentinelPath, "wx", SIDECAR_FILE_MODE);
    try {
      writeFileSync(fd, String(pid));
    } finally {
      closeSync(fd);
    }
    return makeOkResult(sentinelPath, pid);
  } catch (error) {
    // EEXIST falls through to the reclaim branch below; other errors
    // surface as write-failed.
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "";
    if (code !== "EEXIST") {
      return {
        ok: false,
        reason: "write-failed",
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Sentinel exists; check if the recorded PID is alive.
  let heldByPid: number | undefined;
  try {
    const raw = readFileSync(sentinelPath, "utf-8").trim();
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      heldByPid = parsed;
    }
  } catch (error) {
    return {
      ok: false,
      reason: "stat-failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  if (heldByPid !== undefined && isProcessAlive(heldByPid)) {
    return { ok: false, reason: "held-by-live-process", heldByPid };
  }

  // PID is dead (or no valid PID). Reclaim the sentinel.
  try {
    writeFileSync(sentinelPath, String(pid), {
      mode: SIDECAR_FILE_MODE,
    });
  } catch (error) {
    return {
      ok: false,
      reason: "write-failed",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  return makeOkResult(sentinelPath, pid);
}

function makeOkResult(sentinelPath: string, pid: number): AcquireResult {
  void pid;
  return {
    ok: true,
    sentinelPath,
    release: () => {
      try {
        rmSync(sentinelPath, { force: true });
      } catch {
        /* best-effort cleanup */
      }
    },
  };
}

/**
 * Convenience wrapper that throws on lock-acquisition failure.
 * Intended for the server bootstrap flow where the inability to
 * start is fatal.
 */
export function acquireDatabaseLockOrThrow(
  dbPath: string,
  options: AcquireOptions = {},
): { readonly sentinelPath: string; readonly release: () => void } {
  const result = acquireDatabaseLock(dbPath, options);
  if (result.ok) {
    return { sentinelPath: result.sentinelPath, release: result.release };
  }
  if (result.reason === "held-by-live-process") {
    throw new Error(
      `Cannot acquire database lock at ${path.dirname(dbPath)}: held by live process ${result.heldByPid ?? "(unknown pid)"}. ` +
        "Stop the other orchestrate instance or remove the sentinel file if you are sure no other process is running.",
    );
  }
  throw new Error(
    `Failed to acquire database lock for ${dbPath}: ${result.reason}` +
      (result.detail ? ` (${result.detail})` : ""),
  );
}
