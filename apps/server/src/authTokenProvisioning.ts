/**
 * Provision and consume short-lived auth-token files (ORC-188).
 *
 * The orchestrator must hand the WS auth token to its child Codex agent
 * process so the bundled MCP server can authenticate back to us. Putting
 * the token in `ORCHESTRATE_AUTH_TOKEN` env was a leak: /proc/PID/environ
 * (Linux) and `ps -E` (macOS) expose env to other same-user processes,
 * and every tool the subprocess shells out to (linters, formatters,
 * package managers) inherited the token in its own env.
 *
 * Instead we write the token to a one-shot file with mode 0o600, pass
 * the file path via `ORCHESTRATE_AUTH_TOKEN_FILE`, and let the MCP
 * server `consumeAuthTokenFile()` read and unlink it. The path is
 * harmless to leak (the file is mode 0o600, owned by our user, deleted
 * on first read).
 */
import { mkdirSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

export interface ProvisionedAuthToken {
  /** Absolute path to the token file. Pass this via the env var. */
  readonly filePath: string;
  /** Best-effort cleanup. Idempotent; ignores ENOENT. */
  readonly cleanup: () => void;
}

/**
 * Write `token` to a fresh file under `dir` with mode 0o600 and return its
 * path. The caller passes the path to the subprocess via env and is
 * responsible for invoking the returned cleanup when the subprocess exits.
 */
export function provisionAuthTokenFile(token: string, dir: string): ProvisionedAuthToken {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const filePath = `${dir}/orchestrate-auth-${randomUUID()}.token`;
  // mode 0o600 ensures only our user can read the file. We also write with
  // an explicit byte sequence to avoid any encoding confusion.
  writeFileSync(filePath, token, { mode: 0o600, encoding: "utf8" });
  return {
    filePath,
    cleanup: () => {
      try {
        unlinkSync(filePath);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException | undefined)?.code;
        if (code !== "ENOENT") {
          throw err;
        }
      }
    },
  };
}

/**
 * Read the token from `path`, then unlink the file. Throws if the file is
 * missing or unreadable (the caller almost always wants to fail loud
 * because the token was supposed to be provisioned by the parent process).
 *
 * If the unlink fails we still return the token. The mode 0o600 file is
 * already only readable by our user; a stale copy left behind is no worse
 * than the env-var case it replaces.
 */
export function consumeAuthTokenFile(path: string): string {
  const contents = readFileSync(path, { encoding: "utf8" });
  try {
    unlinkSync(path);
  } catch {
    // best-effort cleanup; the file is mode 0o600 either way
  }
  return contents.trim();
}

// Convenience consumer that handles both the file path env var and the
// legacy direct env var. Used by the MCP server at startup.
export function resolveOrchestrateAuthToken(env: NodeJS.ProcessEnv): string | undefined {
  const filePath = env.ORCHESTRATE_AUTH_TOKEN_FILE;
  if (filePath && filePath.length > 0) {
    try {
      return consumeAuthTokenFile(filePath);
    } catch {
      // fall through to legacy env (defense in depth; should not normally fire)
    }
  }
  const direct = env.ORCHESTRATE_AUTH_TOKEN;
  return direct && direct.length > 0 ? direct : undefined;
}

// Internal helper just to make `dirname` available without requiring
// callers to import path themselves; not exported to the public surface.
export const _dirname = dirname;
