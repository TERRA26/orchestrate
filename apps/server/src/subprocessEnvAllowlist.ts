/**
 * Subprocess environment allowlist (ORC-011).
 *
 * `child_process.spawn` and the Claude SDK both default to forwarding the
 * parent's full env to the child. That meant ORCHESTRATE_AUTH_TOKEN, any
 * ANTHROPIC_API_KEY-like secret in our env, AWS/GCP creds, DATABASE_URL,
 * etc. all leaked into the subprocess. From there they were visible to
 * any tool the subprocess shelled out to (linters, formatters, MCP
 * servers it spawned in turn) and via /proc/PID/environ on Linux or
 * `ps -E` on macOS to any same-user process.
 *
 * This helper builds a sanitized env: keep only the keys the subprocess
 * actually needs (PATH, HOME, locale, provider-specific prefixes) plus
 * any explicit additions the caller wants to inject. Everything else is
 * dropped.
 *
 * The allowlist is intentionally generous for provider env (ANTHROPIC_*,
 * CLAUDE_*, OPENAI_*, CODEX_*) because those are often required by the
 * provider SDK at runtime. It does NOT include ORCHESTRATE_* (server-
 * private) or any unbranded credential prefix (AWS_, GCP_, GOOGLE_).
 */

const EXACT_ALLOWED_KEYS: ReadonlySet<string> = new Set([
  "HOME",
  "PATH",
  "USER",
  "USERNAME",
  "LOGNAME",
  "SHELL",
  "TERM",
  "TMPDIR",
  "TEMP",
  "TMP",
  "LANG",
  "LANGUAGE",
  "TZ",
  "PWD",
  "COLUMNS",
  "LINES",
  "NODE_PATH",
  "NODE_OPTIONS",
  "BUN_INSTALL",
  "VOLTA_HOME",
]);

const ALLOWED_PREFIXES: ReadonlyArray<string> = [
  "LC_",
  "ANTHROPIC_",
  "CLAUDE_",
  "OPENAI_",
  "CODEX_",
  "XDG_",
  "MCP_",
];

export function isAllowedSubprocessEnvKey(key: string): boolean {
  if (EXACT_ALLOWED_KEYS.has(key)) return true;
  for (const prefix of ALLOWED_PREFIXES) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Build a sanitized env from `parent` containing only allowed keys, plus
 * any explicit `additions` the caller wants to inject (e.g. paths to
 * provisioned token files, dynamic ports). Additions always win over
 * the parent so callers can override.
 */
export function buildSanitizedSubprocessEnv(
  parent: NodeJS.ProcessEnv,
  additions: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(parent)) {
    if (value !== undefined && isAllowedSubprocessEnvKey(key)) {
      result[key] = value;
    }
  }
  for (const [key, value] of Object.entries(additions)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}
