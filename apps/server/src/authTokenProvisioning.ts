/**
 * Provision and consume short-lived auth-token files (ORC-188, ORC-002).
 *
 * The orchestrator must hand the WS auth token (and identifying metadata
 * like the parent thread id) to its child Codex agent process so the
 * bundled MCP server can authenticate back to us with the correct
 * identity. Putting these in env was a leak: /proc/PID/environ (Linux)
 * and `ps -E` (macOS) expose env to other same-user processes, and any
 * tool the subprocess shells out to inherited the secrets in its own env.
 * Worse, env values are trivially overridden so a local rogue process
 * could plant a forged ORCHESTRATE_PARENT_THREAD_ID and impersonate.
 *
 * Instead we write a JSON document to a one-shot file with mode 0o600
 * pointed at by `ORCHESTRATE_AUTH_TOKEN_FILE`. The MCP server
 * `resolveOrchestrateSpawnEnvelope()` reads-and-unlinks it. The file is
 * only readable by our user so the parent thread id and token cannot be
 * spoofed by a different same-user process without first compromising
 * the file system.
 *
 * The legacy plain-text token format is still accepted for backward
 * compatibility (envelopes without a parent thread id).
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

export interface SpawnEnvelope {
  readonly token: string;
  readonly parentThreadId?: string;
}

const FILE_PREFIX = "orchestrate-auth-";

function buildFileBody(envelope: SpawnEnvelope): string {
  // Always write JSON. Legacy readers fall back to "treat as raw token"
  // if the body fails to parse, so older MCP servers still work; new
  // readers get the structured fields.
  return JSON.stringify({
    token: envelope.token,
    ...(envelope.parentThreadId ? { parentThreadId: envelope.parentThreadId } : {}),
  });
}

/**
 * Write the spawn envelope to a fresh file under `dir` with mode 0o600
 * and return its path. The caller passes the path to the subprocess via
 * env and is responsible for invoking the returned cleanup when the
 * subprocess exits.
 *
 * Backward-compatible signature: a single string is interpreted as a
 * token-only envelope.
 */
export function provisionAuthTokenFile(
  envelopeOrToken: SpawnEnvelope | string,
  dir: string,
): ProvisionedAuthToken {
  const envelope: SpawnEnvelope =
    typeof envelopeOrToken === "string" ? { token: envelopeOrToken } : envelopeOrToken;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const filePath = `${dir}/${FILE_PREFIX}${randomUUID()}.token`;
  // mode 0o600 ensures only our user can read the file.
  writeFileSync(filePath, buildFileBody(envelope), { mode: 0o600, encoding: "utf8" });
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
 * Parse the envelope from raw file bytes. Tolerates the legacy
 * plain-text token format (the entire body is the token).
 */
export function parseSpawnEnvelopeBody(body: string): SpawnEnvelope {
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        if (typeof obj.token === "string") {
          return {
            token: obj.token,
            ...(typeof obj.parentThreadId === "string" && obj.parentThreadId.length > 0
              ? { parentThreadId: obj.parentThreadId }
              : {}),
          };
        }
      }
    } catch {
      // fall through to legacy interpretation
    }
  }
  return { token: trimmed };
}

/**
 * Read the envelope from `path`, then unlink the file. Throws if the
 * file is missing or unreadable.
 */
export function consumeAuthTokenFile(path: string): SpawnEnvelope {
  const body = readFileSync(path, { encoding: "utf8" });
  try {
    unlinkSync(path);
  } catch {
    // best-effort cleanup; the file is mode 0o600 either way
  }
  return parseSpawnEnvelopeBody(body);
}

/**
 * Convenience consumer used by the MCP server at startup. Returns just
 * the token string for backward compat with callers that only want the
 * token. Use `resolveOrchestrateSpawnEnvelope` for the full envelope.
 */
export function resolveOrchestrateAuthToken(env: NodeJS.ProcessEnv): string | undefined {
  return resolveOrchestrateSpawnEnvelope(env)?.token;
}

/**
 * Resolve the full spawn envelope from env. Prefer the file path; fall
 * back to legacy direct env vars for both the token and parent thread id.
 */
export function resolveOrchestrateSpawnEnvelope(
  env: NodeJS.ProcessEnv,
): SpawnEnvelope | undefined {
  const filePath = env.ORCHESTRATE_AUTH_TOKEN_FILE;
  if (filePath && filePath.length > 0) {
    try {
      const envelope = consumeAuthTokenFile(filePath);
      if (envelope.token.length > 0) {
        return envelope;
      }
    } catch {
      // fall through to legacy env (defense in depth)
    }
  }
  const directToken = env.ORCHESTRATE_AUTH_TOKEN;
  if (directToken && directToken.length > 0) {
    const directParent = env.ORCHESTRATE_PARENT_THREAD_ID;
    return {
      token: directToken,
      ...(directParent && directParent.length > 0 ? { parentThreadId: directParent } : {}),
    };
  }
  return undefined;
}

// Internal helper just to make `dirname` available without requiring
// callers to import path themselves; not exported to the public surface.
export const _dirname = dirname;
