import { browserRuntimeTruthLabel, browserScreenshotDataUrls } from "~/browserWorkLog";
import { BrowserScreenshotImage } from "~/components/BrowserScreenshotImage";
import { WorkingDots } from "~/components/ui/WorkingDots";
import { cn } from "~/lib/utils";
import { phaseForToolEvent } from "~/orchestratorPresentation";
import type { WorkLogEntry } from "~/session-logic";

// Per-worker accent palette (kept in sync with WorkerPanel.tsx). The
// orchestrator's compact activity rows often reference workers by their
// `@workerId.slice(-8)` suffix; coloring the suffix with the worker's
// accent gives a visual link between the work log and the worker pane.
const WORKER_ACCENT_TEXT_BY_HUE: ReadonlyArray<string> = [
  "text-violet-400/85",
  "text-fuchsia-400/85",
  "text-teal-400/85",
  "text-cyan-400/85",
  "text-amber-400/85",
  "text-orange-400/85",
  "text-sky-400/85",
  "text-rose-400/85",
];

function workerAccentTextClass(workerId: string | undefined): string | null {
  if (!workerId) return null;
  let hash = 0;
  for (let i = 0; i < workerId.length; i++) hash = (hash * 31 + workerId.charCodeAt(i)) | 0;
  return WORKER_ACCENT_TEXT_BY_HUE[Math.abs(hash) % WORKER_ACCENT_TEXT_BY_HUE.length] ?? null;
}

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

  // Split the label so the @workerId tag (if any) can be rendered as a
  // separately-styled span — colored by the per-worker accent palette and
  // used as the click-target to focus that worker's pane.
  const workerTag = workEntry.workerId
    ? `@${workEntry.workerId.slice(-8)}`
    : workEntry.threadId
      ? `@${workEntry.threadId.slice(-8)}`
      : null;
  const workerAccentClass = workerAccentTextClass(workEntry.workerId);

  const label = (() => {
    if (workEntry.command) {
      return `$ ${workEntry.command.split(" ").slice(0, 4).join(" ")}`;
    }
    if (hasRawOrchestrationSelection) {
      return "Selecting orchestration tools";
    }
    if (phase) {
      // Note: the worker tag is rendered as a separate span below — keep it
      // out of the plain label so the accent color and click handler can
      // attach to just the tag.
      return phase;
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

  // "thinking" tone marks an in-flight tool call — surface a working-dots
  // glyph next to the label so users can see at a glance which row is the
  // currently-running step. Once the tool completes, tone shifts to "tool"
  // (or "error") and the glyph disappears.
  const isInFlight = workEntry.tone === "thinking";

  return (
    <div data-activity-row={isOrchTool ? "orchestration" : (rawToolName ?? "x")}>
      <div className="flex items-baseline gap-2 px-3 py-0.5">
        {isInFlight ? (
          <span className="shrink-0 self-center" aria-hidden>
            <WorkingDots size="sm" tone="accent" />
          </span>
        ) : null}
        <span
          className={cn(
            "shrink-0 font-mono text-[10px] leading-[1.5] whitespace-nowrap",
            toneClass,
          )}
          title={workEntry.command ? workEntry.command : undefined}
        >
          {label}
        </span>
        {/* Per-worker accent tag — clicking jumps to the worker pane.
            The dispatch is a window event so the handler can live in a
            sibling component without prop drilling through the work log. */}
        {workerTag && phase ? (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (workEntry.workerId) {
                window.dispatchEvent(
                  new CustomEvent("orchestrate:focus-worker", {
                    detail: { workerId: workEntry.workerId },
                  }),
                );
              } else if (workEntry.threadId) {
                window.dispatchEvent(
                  new CustomEvent("orchestrate:focus-thread", {
                    detail: { threadId: workEntry.threadId },
                  }),
                );
              }
            }}
            className={cn(
              "shrink-0 rounded font-mono text-[10px] leading-[1.5] whitespace-nowrap underline-offset-2 hover:underline",
              workerAccentClass ?? "text-muted-foreground/55",
            )}
            title={
              workEntry.workerId
                ? `Focus worker ${workEntry.workerId.slice(-8)}`
                : `Focus thread ${workEntry.threadId?.slice(-8) ?? ""}`
            }
          >
            {workerTag}
          </button>
        ) : null}
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
