import util from "node:util";

type LogLevel = "info" | "warn" | "error" | "event";

type LogContext = Record<string, unknown>;

/**
 * ORC-228: PII-redaction keys that the structured logger replaces with
 * `[REDACTED]` before writing the line. Log aggregators index logs;
 * leaving raw user prompts, file paths, or project titles in there
 * exposes PII to anyone with log read access.
 *
 * Defaults to the keys the original bug filing called out plus a few
 * adjacent fields (`text`, `body`, `objective`, `userMessage`,
 * `instruction`). Add additional keys via the
 * `ORCHESTRATE_LOG_REDACT_KEYS` env var (comma-separated). Disable
 * redaction entirely for local debugging via `ORCHESTRATE_LOG_RAW=1`.
 */
const DEFAULT_REDACTED_KEYS: readonly string[] = [
  "prompt",
  "filePath",
  "filepath",
  "file_path",
  "path",
  "projectTitle",
  "project_title",
  "projectName",
  "project_name",
  "title",
  "userMessage",
  "user_message",
  "objective",
  "instruction",
  "instructions",
  "acceptanceCriteria",
  "acceptance_criteria",
  "body",
  "text",
  "summary",
  "submitSummary",
  "submitNotes",
];

function currentRedactedKeySet(): Set<string> {
  const keys = new Set<string>(DEFAULT_REDACTED_KEYS);
  const extra = process.env.ORCHESTRATE_LOG_REDACT_KEYS;
  if (typeof extra === "string" && extra.length > 0) {
    for (const key of extra.split(",").map((k) => k.trim())) {
      if (key.length > 0) keys.add(key);
    }
  }
  return keys;
}

const REDACTED_PLACEHOLDER = "[REDACTED]";

/**
 * ORC-228: redact a single key/value pair if the key matches a known
 * PII key (case-insensitive). Exposed for tests and for callers that
 * want to redact metadata before passing it to a non-logger sink.
 *
 * Reads `process.env.ORCHESTRATE_LOG_RAW` and
 * `process.env.ORCHESTRATE_LOG_REDACT_KEYS` per invocation so the
 * setting can be flipped at runtime (e.g. test fixtures that
 * temporarily disable redaction).
 */
export function redactLogValue(key: string, value: unknown): unknown {
  if (process.env.ORCHESTRATE_LOG_RAW === "1") return value;
  if (value === undefined || value === null) return value;
  const keys = currentRedactedKeySet();
  if (keys.has(key) || keys.has(key.toLowerCase())) {
    if (typeof value === "string") {
      // Preserve length signal so an empty/short field is distinguishable
      // from a long one without leaking the content.
      return value.length > 0 ? `${REDACTED_PLACEHOLDER}(len=${value.length})` : REDACTED_PLACEHOLDER;
    }
    if (Array.isArray(value)) {
      return `${REDACTED_PLACEHOLDER}(array,len=${value.length})`;
    }
    return REDACTED_PLACEHOLDER;
  }
  return value;
}

const ANSI = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
  cyan: "\u001b[36m",
  yellow: "\u001b[33m",
  red: "\u001b[31m",
  magenta: "\u001b[35m",
} as const;

const LEVEL_LABEL: Record<LogLevel, string> = {
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
  event: "EVENT",
};

const LEVEL_COLOR: Record<LogLevel, string> = {
  info: ANSI.cyan,
  warn: ANSI.yellow,
  error: ANSI.red,
  event: ANSI.magenta,
};

function useColors() {
  return Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined;
}

function colorize(value: string, color: string, enabled: boolean) {
  return enabled ? `${color}${value}${ANSI.reset}` : value;
}

function timeStamp() {
  return new Date().toISOString().slice(11, 23);
}

function formatValue(value: unknown) {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null ||
    value === undefined
  ) {
    return String(value);
  }
  return util.inspect(value, {
    depth: 4,
    breakLength: Infinity,
    compact: true,
    maxArrayLength: 25,
    maxStringLength: 320,
  });
}

function formatContext(context: LogContext | undefined) {
  if (!context) return "";
  const entries = Object.entries(context).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return "";
  return entries
    .map(([key, value]) => `${key}=${formatValue(redactLogValue(key, value))}`)
    .join(" ");
}

function write(level: LogLevel, scope: string, message: string, context?: LogContext) {
  const colorEnabled = useColors();
  const ts = colorize(timeStamp(), ANSI.dim, colorEnabled);
  const levelLabel = colorize(LEVEL_LABEL[level], LEVEL_COLOR[level], colorEnabled);
  const contextText = formatContext(context);
  const line = `${ts} ${levelLabel} [${scope}] ${message}${contextText ? ` ${contextText}` : ""}`;

  if (level === "warn") {
    console.warn(line);
    return;
  }
  if (level === "error") {
    console.error(line);
    return;
  }
  console.log(line);
}

export function createLogger(scope: string) {
  return {
    info(message: string, context?: LogContext) {
      write("info", scope, message, context);
    },
    warn(message: string, context?: LogContext) {
      write("warn", scope, message, context);
    },
    error(message: string, context?: LogContext) {
      write("error", scope, message, context);
    },
    event(message: string, context?: LogContext) {
      write("event", scope, message, context);
    },
  };
}
