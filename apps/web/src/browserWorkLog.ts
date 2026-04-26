import type {
  EmbeddedBrowserSession,
  EmbeddedBrowserSessionSource,
} from "./embeddedBrowserStateStore";
import type { WorkLogEntry } from "./session-logic";

export interface BrowserScreenshotDataUrls {
  thumbnailDataUrl: string;
  fullDataUrl?: string;
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

function readArray(value: unknown): ReadonlyArray<unknown> {
  return Array.isArray(value) ? value : [];
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
  try {
    const parsed = readRecord(JSON.parse(workEntry.output));
    return readRecord(parsed?.observation);
  } catch {
    return null;
  }
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
  return {
    kind: "automation",
    openedAt: workEntry.createdAt,
    source,
    title,
    url,
    readyState: readString(observation.readyState)?.trim() || "complete",
    observedAt: readString(observation.observedAt) ?? workEntry.createdAt,
    targetCount: readArray(observation.targets).length,
    textSummary: readString(observation.textSummary) ?? "",
    screenshotDataUrl: screenshot.fullDataUrl ?? screenshot.thumbnailDataUrl,
    lastActionSummary: summarizeBrowserWorkEntry(workEntry),
  };
}
