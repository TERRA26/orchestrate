import { TurnId } from "@orchestrate/contracts";

export type ChatRightPanel = "browser" | "diff";

export interface DiffRouteSearch {
  splitViewId?: string | undefined;
  panel?: ChatRightPanel | undefined;
  diff?: "1" | undefined;
  diffTurnId?: TurnId | undefined;
  diffFilePath?: string | undefined;
}

/**
 * Per-field parse errors surfaced by `parseDiffRouteSearchStrict`.
 *
 * Each entry names the offending param key and a short reason so the
 * caller can decide whether to redirect, render a 404, or surface a
 * toast. Without these, stale URLs (`?diffTurnId=NaN`,
 * `?diffTurnId=A&diffTurnId=B`, `?count=Infinity`) silently produced
 * empty state with no signal.
 *
 * @see ORC-170
 */
export type DiffRouteParseError = {
  readonly key: keyof DiffRouteSearch | "panel" | "diff";
  readonly reason:
    | "duplicated"
    | "non-string"
    | "empty"
    | "invalid-shape"
    | "out-of-range";
  readonly received: string;
};

export interface DiffRouteParseResult {
  readonly value: DiffRouteSearch;
  readonly errors: readonly DiffRouteParseError[];
}

function isDiffOpenValue(value: unknown): boolean {
  return value === "1" || value === 1 || value === true;
}

function normalizeSearchString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

const ID_SHAPE = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Validate the shape of an identifier-style search param value. Only
 * accepts a plain trimmed string that fits the `[A-Za-z0-9._:-]{1,128}`
 * pattern used by branded ids. Returns a structured outcome instead
 * of silently dropping bad input.
 */
function parseId(
  key: DiffRouteParseError["key"],
  value: unknown,
): { readonly value: string | undefined; readonly error?: DiffRouteParseError } {
  if (value === undefined || value === null) return { value: undefined };
  if (Array.isArray(value)) {
    return {
      value: undefined,
      error: { key, reason: "duplicated", received: JSON.stringify(value).slice(0, 64) },
    };
  }
  if (typeof value !== "string") {
    return {
      value: undefined,
      error: { key, reason: "non-string", received: typeof value },
    };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { value: undefined, error: { key, reason: "empty", received: "''" } };
  }
  if (!ID_SHAPE.test(trimmed)) {
    return {
      value: undefined,
      error: { key, reason: "invalid-shape", received: trimmed.slice(0, 64) },
    };
  }
  return { value: trimmed };
}

export function stripDiffSearchParams<T extends Record<string, unknown>>(
  params: T,
): Omit<T, "panel" | "diff" | "diffTurnId" | "diffFilePath"> {
  const {
    panel: _panel,
    diff: _diff,
    diffTurnId: _diffTurnId,
    diffFilePath: _diffFilePath,
    ...rest
  } = params;
  return rest as Omit<T, "panel" | "diff" | "diffTurnId" | "diffFilePath">;
}

export function parseDiffRouteSearch(search: Record<string, unknown>): DiffRouteSearch {
  return parseDiffRouteSearchStrict(search).value;
}

/**
 * Strict variant that returns both the parsed search params and a
 * list of per-field errors describing what was dropped. Callers can
 * use the error list to decide whether to redirect to a clean URL,
 * render a 404, or surface a toast warning that the URL was rewritten.
 *
 * @see ORC-170
 */
export function parseDiffRouteSearchStrict(
  search: Record<string, unknown>,
): DiffRouteParseResult {
  const errors: DiffRouteParseError[] = [];

  const splitView = parseId("splitViewId", search.splitViewId);
  if (splitView.error) errors.push(splitView.error);

  const panelRaw = normalizeSearchString(search.panel);
  if (
    typeof search.panel === "string" &&
    search.panel.trim().length > 0 &&
    panelRaw !== "browser" &&
    panelRaw !== "diff"
  ) {
    errors.push({
      key: "panel",
      reason: "invalid-shape",
      received: panelRaw ?? "",
    });
  }
  const panel: ChatRightPanel | undefined =
    panelRaw === "browser" ? "browser" : panelRaw === "diff" ? "diff" : undefined;
  const diff = panel === "diff" || isDiffOpenValue(search.diff) ? "1" : undefined;
  const resolvedPanel = panel ?? (diff ? "diff" : undefined);

  const diffTurnIdParse = diff
    ? parseId("diffTurnId", search.diffTurnId)
    : { value: undefined };
  if (diffTurnIdParse.error) errors.push(diffTurnIdParse.error);
  const diffTurnId = diffTurnIdParse.value
    ? TurnId.makeUnsafe(diffTurnIdParse.value)
    : undefined;

  const diffFilePath =
    diff && diffTurnId ? normalizeSearchString(search.diffFilePath) : undefined;

  const value: DiffRouteSearch = {
    ...(splitView.value ? { splitViewId: splitView.value } : {}),
    ...(resolvedPanel ? { panel: resolvedPanel } : {}),
    ...(diff ? { diff } : {}),
    ...(diffTurnId ? { diffTurnId } : {}),
    ...(diffFilePath ? { diffFilePath } : {}),
  };

  return { value, errors };
}
