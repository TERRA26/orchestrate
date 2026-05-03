import { browserRuntimeTruthLabel, browserScreenshotDataUrls } from "~/browserWorkLog";
import { BrowserScreenshotImage } from "~/components/BrowserScreenshotImage";
import { cn } from "~/lib/utils";
import { phaseForToolEvent } from "~/orchestratorPresentation";
import type { WorkLogEntry } from "~/session-logic";

function extractToolArgsPreview(detail: string | undefined): string {
  if (!detail) return "";
  if (containsRawOrchestrationSelection(detail)) return "";
  const colonIdx = detail.indexOf(":");
  const argsText = colonIdx >= 0 ? detail.slice(colonIdx + 1).trim() : detail;
  if (!argsText.startsWith("{")) return argsText.slice(0, 120).replace(/\s+/g, " ").trim();
  const preferredKeys = [
    "task",
    "message",
    "command",
    "instruction",
    "reason",
    "title",
    "objective",
    "query",
  ];
  try {
    const parsed = JSON.parse(argsText) as Record<string, unknown>;
    for (const key of preferredKeys) {
      const value = parsed[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.replace(/\s+/g, " ").trim().slice(0, 140);
      }
    }
    const wid =
      (typeof parsed.workerId === "string" && parsed.workerId) ||
      (typeof parsed.agentId === "string" && parsed.agentId) ||
      "";
    if (wid) return String(wid).slice(-8);
  } catch {
    // fall through to regex
  }
  for (const key of preferredKeys) {
    const match = argsText.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)`, ""));
    if (match && match[1]) {
      return match[1].replace(/\\n/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
    }
  }
  const widMatch = argsText.match(/"(?:workerId|agentId)"\s*:\s*"([^"]*)/);
  if (widMatch && widMatch[1]) return widMatch[1].slice(-8);
  return argsText.slice(0, 120).replace(/\s+/g, " ").trim();
}

function containsRawOrchestrationSelection(value: string | undefined): boolean {
  return (
    typeof value === "string" &&
    /(?:^|\s|:)select\s*:/i.test(value) &&
    /\bmcp__orchestrate__orchestrate_[\w-]+\b/.test(value)
  );
}

function BrowserScreenshotThumb({
  screenshot,
}: {
  screenshot: { thumbnailDataUrl: string; fullDataUrl?: string };
}) {
  return (
    <div className="px-3 pb-2">
      <BrowserScreenshotImage
        thumbnailDataUrl={screenshot.thumbnailDataUrl}
        {...(screenshot.fullDataUrl ? { fullDataUrl: screenshot.fullDataUrl } : {})}
        className="h-24 w-40"
      />
    </div>
  );
}

export function CompactActivityRow({ workEntry }: { workEntry: WorkLogEntry }) {
  const rawToolName = workEntry.toolName?.replace(/^mcp__orchestrate__/, "");
  const isOrchTool = rawToolName?.startsWith("orchestrate_") ?? false;
  const hasRawOrchestrationSelection =
    containsRawOrchestrationSelection(workEntry.detail) ||
    containsRawOrchestrationSelection(workEntry.toolTitle) ||
    containsRawOrchestrationSelection(workEntry.output);
  const screenshot = browserScreenshotDataUrls(workEntry);
  const runtimeTruthLabel = browserRuntimeTruthLabel(workEntry);
  const phase = phaseForToolEvent({
    toolName: workEntry.toolName,
    itemType: workEntry.itemType,
    requestKind: workEntry.requestKind,
    label: workEntry.label,
    tone: workEntry.tone,
    command: workEntry.command,
    changedFiles: workEntry.changedFiles,
  });

  const label = (() => {
    if (workEntry.command) {
      return `$ ${workEntry.command.split(" ").slice(0, 4).join(" ")}`;
    }
    if (hasRawOrchestrationSelection) {
      return "Selecting orchestration tools";
    }
    if (phase) {
      const target = workEntry.workerId
        ? ` @${workEntry.workerId.slice(-8)}`
        : workEntry.threadId
          ? ` @${workEntry.threadId.slice(-8)}`
          : "";
      return `${phase}${target}`;
    }
    if (rawToolName === "orchestrate_open_browser_preview") {
      return "Browser preview";
    }
    if (rawToolName === "orchestrate_browser_open_session") {
      return "Checking browser";
    }
    if (rawToolName === "orchestrate_browser_act") {
      const detail = workEntry.detail ?? "";
      if (detail.includes('"kind":"scroll"') || detail.includes('"kind": "scroll"')) {
        return "Scrolling browser";
      }
      if (detail.includes('"kind":"evaluate"') || detail.includes('"kind": "evaluate"')) {
        return "Evaluating page";
      }
      return "Checking browser";
    }
    if (rawToolName === "orchestrate_browser_close_session") {
      return "Closing browser";
    }
    return workEntry.label ?? workEntry.toolTitle ?? "activity";
  })();

  const preview = (() => {
    if (workEntry.command) {
      return "";
    }
    const extracted = extractToolArgsPreview(workEntry.detail);
    if (containsRawOrchestrationSelection(extracted) || extracted.includes("mcp__orchestrate__")) {
      return "";
    }
    const trimmedWorker = workEntry.workerId?.slice(-8);
    if (trimmedWorker && extracted === trimmedWorker) {
      return "";
    }
    return extracted;
  })();

  const toneClass =
    workEntry.tone === "error"
      ? "text-rose-300/80"
      : isOrchTool
        ? "text-amber-400/85"
        : workEntry.tone === "tool"
          ? "text-muted-foreground/65"
          : "text-muted-foreground/50";

  return (
    <div data-activity-row={isOrchTool ? "orchestration" : (rawToolName ?? "x")}>
      <div className="flex items-baseline gap-2 px-3 py-0.5">
        <span
          className={cn(
            "shrink-0 font-mono text-[10px] leading-[1.5] whitespace-nowrap",
            toneClass,
          )}
        >
          {label}
        </span>
        {preview ? (
          <span className="min-w-0 flex-1 truncate font-mono text-[10px] leading-[1.5] text-muted-foreground/35">
            {preview}
          </span>
        ) : null}
      </div>
      {runtimeTruthLabel ? (
        <div className="px-3 pb-1 font-mono text-[10px] leading-[1.4] text-muted-foreground/45">
          {runtimeTruthLabel}
        </div>
      ) : null}
      {screenshot ? <BrowserScreenshotThumb screenshot={screenshot} /> : null}
    </div>
  );
}
