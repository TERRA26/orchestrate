import type {
  EmbeddedBrowserSession,
  EmbeddedBrowserSessionSource,
} from "./embeddedBrowserStateStore";
import type { WorkLogEntry } from "./session-logic";

export interface BrowserScreenshotDataUrls {
  thumbnailDataUrl: string;
  fullDataUrl?: string;
}

export interface BrowserRuntimeTruthSummary {
  runtimeKind: string;
  surfaceMode: string;
  isUserVisibleSurface: boolean;
  urlAgreement?: string;
}

export function stripOrchestrationToolPrefix(toolName: string | undefined): string | null {
  if (!toolName) return null;
  const trimmed = toolName.replace(/^mcp__orchestrate__/, "");
  return trimmed.startsWith("orchestrate_") ? trimmed : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readDataUrl(value: unknown): string | null {
  return typeof value === "string" && value.startsWith("data:image/") ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readArray(value: unknown): ReadonlyArray<unknown> {
  return Array.isArray(value) ? value : [];
}

function parseJsonLikeString(value: string): unknown | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function looksLikeBrowserObservation(value: Record<string, unknown> | null): boolean {
  return (
    typeof value?.url === "string" &&
    (typeof value.sessionId === "string" ||
      typeof value.observedAt === "string" ||
      Array.isArray(value.targets) ||
      typeof value.title === "string")
  );
}

function findBrowserObservation(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): Record<string, unknown> | null {
  if (depth > 8) {
    return null;
  }

  if (typeof value === "string") {
    const parsed = parseJsonLikeString(value);
    return parsed === null ? null : findBrowserObservation(parsed, depth + 1, seen);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const observation = findBrowserObservation(item, depth + 1, seen);
      if (observation) {
        return observation;
      }
    }
    return null;
  }

  const record = readRecord(value);
  if (!record) {
    return null;
  }
  if (seen.has(record)) {
    return null;
  }
  seen.add(record);

  const directObservation = readRecord(record.observation);
  if (looksLikeBrowserObservation(directObservation)) {
    return directObservation;
  }
  if (looksLikeBrowserObservation(record)) {
    return record;
  }

  for (const key of ["result", "data", "payload", "output", "response", "content", "text"]) {
    const observation = findBrowserObservation(record[key], depth + 1, seen);
    if (observation) {
      return observation;
    }
  }

  return null;
}

function browserTitleFromUrl(url: string): string {
  try {
    return new URL(url).hostname || "Browser";
  } catch {
    return "Browser";
  }
}

function summarizeBrowserWorkEntry(workEntry: WorkLogEntry): string {
  const toolName = stripOrchestrationToolPrefix(workEntry.toolName);
  if (toolName === "orchestrate_browser_open_session") {
    return "Opened browser session";
  }
  if (toolName !== "orchestrate_browser_act") {
    return workEntry.label;
  }

  const detail = workEntry.detail ?? "";
  if (detail.includes('"kind":"navigate"') || detail.includes('"kind": "navigate"')) {
    return "Navigated browser";
  }
  if (detail.includes('"kind":"scroll"') || detail.includes('"kind": "scroll"')) {
    return "Scrolled page";
  }
  if (detail.includes('"kind":"resize"') || detail.includes('"kind": "resize"')) {
    return "Resized browser viewport";
  }
  if (detail.includes('"kind":"evaluate"') || detail.includes('"kind": "evaluate"')) {
    return "Evaluated page";
  }
  if (detail.includes('"kind":"click"') || detail.includes('"kind": "click"')) {
    return "Clicked page";
  }
  if (detail.includes('"kind":"type"') || detail.includes('"kind": "type"')) {
    return "Typed into page";
  }
  return "Updated browser observation";
}

function parseBrowserToolObservation(workEntry: WorkLogEntry): Record<string, unknown> | null {
  const toolName = stripOrchestrationToolPrefix(workEntry.toolName);
  if (toolName !== "orchestrate_browser_open_session" && toolName !== "orchestrate_browser_act") {
    return null;
  }
  if (!workEntry.output) {
    return null;
  }
  return findBrowserObservation(workEntry.output);
}

export function browserScreenshotDataUrls(
  workEntry: WorkLogEntry,
): BrowserScreenshotDataUrls | null {
  const observation = parseBrowserToolObservation(workEntry);
  if (!observation) {
    return null;
  }

  const screenshot = readRecord(observation.screenshot);
  const previewDataUrl =
    readDataUrl(observation.previewScreenshotDataUrl) ?? readDataUrl(screenshot?.previewDataUrl);
  const fullDataUrl =
    readDataUrl(observation.screenshotDataUrl) ??
    readDataUrl(observation.fullPageScreenshotDataUrl) ??
    readDataUrl(screenshot?.dataUrl);
  const thumbnailDataUrl = previewDataUrl ?? fullDataUrl;
  if (!thumbnailDataUrl) {
    return null;
  }
  return {
    thumbnailDataUrl,
    ...(fullDataUrl ? { fullDataUrl } : {}),
  };
}

export function browserRuntimeTruthSummary(
  workEntry: WorkLogEntry,
): BrowserRuntimeTruthSummary | null {
  const observation = parseBrowserToolObservation(workEntry);
  if (!observation) {
    return null;
  }
  const runtimeTruth = readRecord(observation.runtimeTruth);
  const runtimeKind = readString(runtimeTruth?.runtimeKind) ?? readString(observation.runtimeKind);
  const surfaceMode = readString(runtimeTruth?.surfaceMode) ?? readString(observation.surfaceMode);
  const isUserVisibleSurface =
    readBoolean(runtimeTruth?.isUserVisibleSurface) ??
    readBoolean(observation.isUserVisibleSurface);
  if (!runtimeKind || !surfaceMode || isUserVisibleSurface === null) {
    return null;
  }
  return {
    runtimeKind,
    surfaceMode,
    isUserVisibleSurface,
    ...((readString(runtimeTruth?.urlAgreement) ?? readString(observation.urlAgreement))
      ? {
          urlAgreement:
            readString(runtimeTruth?.urlAgreement) ?? readString(observation.urlAgreement)!,
        }
      : {}),
  };
}

export function browserRuntimeTruthLabel(workEntry: WorkLogEntry): string | null {
  const truth = browserRuntimeTruthSummary(workEntry);
  if (!truth) {
    return null;
  }
  const surface =
    truth.surfaceMode === "live-shared-browser"
      ? "Live shared browser"
      : truth.surfaceMode === "headless-validation-mirror"
        ? "Headless validation mirror"
        : truth.surfaceMode === "static-screenshot-evidence"
          ? "Static screenshot evidence"
          : truth.surfaceMode;
  const visibility = truth.isUserVisibleSurface ? "same surface" : "not the visible browser";
  const agreement =
    truth.urlAgreement && truth.urlAgreement !== "unknown" ? ` · URL ${truth.urlAgreement}` : "";
  return `${surface} · ${truth.runtimeKind} · ${visibility}${agreement}`;
}

export function embeddedBrowserSessionFromBrowserWorkEntry(
  workEntry: WorkLogEntry,
  source: EmbeddedBrowserSessionSource,
): EmbeddedBrowserSession | null {
  const observation = parseBrowserToolObservation(workEntry);
  const screenshot = browserScreenshotDataUrls(workEntry);
  const url = readString(observation?.url);
  if (!observation || !screenshot || !url) {
    return null;
  }

  const title = readString(observation.title)?.trim() || browserTitleFromUrl(url);
  const sessionId = readString(observation.sessionId)?.trim() ?? "";
  return {
    kind: "automation",
    openedAt: workEntry.createdAt,
    source,
    title,
    ...(sessionId ? { sessionId } : {}),
    url,
    readyState: readString(observation.readyState)?.trim() || "complete",
    observedAt: readString(observation.observedAt) ?? workEntry.createdAt,
    targetCount: readArray(observation.targets).length,
    textSummary: readString(observation.textSummary) ?? "",
    screenshotDataUrl: screenshot.fullDataUrl ?? screenshot.thumbnailDataUrl,
    lastActionSummary: summarizeBrowserWorkEntry(workEntry),
  };
}

export function latestEmbeddedBrowserSessionFromBrowserWorkEntries(
  workLogEntries: readonly WorkLogEntry[],
  source: EmbeddedBrowserSessionSource,
): { entryId: string; session: EmbeddedBrowserSession } | null {
  for (let index = workLogEntries.length - 1; index >= 0; index -= 1) {
    const entry = workLogEntries[index];
    if (!entry) {
      continue;
    }
    const session = embeddedBrowserSessionFromBrowserWorkEntry(entry, source);
    if (session) {
      return { entryId: entry.id, session };
    }
  }
  return null;
}
