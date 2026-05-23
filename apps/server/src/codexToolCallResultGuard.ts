/**
 * Tool call result guard introduced by ORC-221.
 *
 * The `CodexToolCallHandler` returns `Promise<unknown>` and the result
 * is forwarded back to the Codex app-server as a JSON-RPC response.
 * If the handler returns a value that is not JSON-serializable
 * (circular reference, symbol, function, undefined nested deep, etc.),
 * the JSON.stringify in `writeMessage` either drops parts or throws,
 * leaving Codex with a corrupted or missing response. The downstream
 * crash is cryptic and disconnected from the actual tool that
 * misbehaved.
 *
 * `validateToolCallResult` does a defensive serialize-roundtrip check
 * and returns a structured outcome:
 *  - `{ ok: true, value }` when the result is JSON-safe.
 *  - `{ ok: false, error }` with a structured `tool_result_invalid`
 *    payload that the caller can forward as a JSON-RPC error instead
 *    of a malformed response.
 *
 * The guard does NOT validate per-tool Schemas. Per-tool Schema
 * validation requires a tool-name -> Schema map and is left for a
 * follow-up (ORC-221b). This shipping guard catches the worst-case
 * crash class today.
 *
 * @see ORC-221
 */

export interface ToolResultInvalid {
  readonly code: "tool_result_invalid";
  readonly toolName: string;
  readonly reason: "non-serializable" | "non-finite-number" | "exception";
  readonly detail: string;
}

export type ToolResultGuardOutcome =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: ToolResultInvalid };

/**
 * Roundtrip the value through JSON.stringify/JSON.parse to confirm
 * it is fully serializable AND contains no NaN / Infinity values
 * (which JSON converts to `null`, silently corrupting the result).
 */
export function validateToolCallResult(
  toolName: string,
  value: unknown,
): ToolResultGuardOutcome {
  if (value === undefined) {
    return { ok: true, value };
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "tool_result_invalid",
        toolName,
        reason: "exception",
        detail:
          error instanceof Error ? error.message : "JSON.stringify threw",
      },
    };
  }
  if (serialized === undefined) {
    return {
      ok: false,
      error: {
        code: "tool_result_invalid",
        toolName,
        reason: "non-serializable",
        detail: "Value contains only function/symbol/undefined",
      },
    };
  }

  let reparsed: unknown;
  try {
    reparsed = JSON.parse(serialized);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "tool_result_invalid",
        toolName,
        reason: "exception",
        detail:
          error instanceof Error ? error.message : "JSON.parse threw on roundtrip",
      },
    };
  }

  if (containsNonFiniteNumber(value)) {
    return {
      ok: false,
      error: {
        code: "tool_result_invalid",
        toolName,
        reason: "non-finite-number",
        detail: "Value contains NaN or Infinity which JSON cannot encode",
      },
    };
  }

  return { ok: true, value: reparsed };
}

function containsNonFiniteNumber(value: unknown, depth = 0): boolean {
  if (depth > 64) return false;
  if (typeof value === "number" && !Number.isFinite(value)) return true;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (containsNonFiniteNumber(item, depth + 1)) return true;
    }
    return false;
  }
  if (value !== null && typeof value === "object") {
    for (const [, nested] of Object.entries(value as Record<string, unknown>)) {
      if (containsNonFiniteNumber(nested, depth + 1)) return true;
    }
  }
  return false;
}
