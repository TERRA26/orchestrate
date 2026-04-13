import { memo } from "react";

import type { WorkLogEntry } from "../../session-logic";
import { cn } from "~/lib/utils";
import { normalizeCompactToolLabel } from "./MessagesTimeline.logic";
import {
  BotIcon,
  CheckIcon,
  CircleAlertIcon,
  EyeIcon,
  GlobeIcon,
  HammerIcon,
  type LucideIcon,
  SquarePenIcon,
  TerminalIcon,
  WrenchIcon,
  ZapIcon,
} from "~/lib/icons";

export interface WorkEntryRowProps {
  workEntry: WorkLogEntry;
  className?: string;
  onOpenWorkerPanel?: (input: { workerId?: string; threadId?: string }) => void;
}

function workToneIcon(tone: WorkLogEntry["tone"]): {
  icon: LucideIcon;
  className: string;
} {
  if (tone === "error") {
    return {
      icon: CircleAlertIcon,
      className: "text-foreground/92",
    };
  }
  if (tone === "thinking") {
    return {
      icon: BotIcon,
      className: "text-foreground/92",
    };
  }
  if (tone === "info") {
    return {
      icon: CheckIcon,
      className: "text-foreground/92",
    };
  }
  return {
    icon: ZapIcon,
    className: "text-foreground/92",
  };
}

function workToneClass(tone: "thinking" | "tool" | "info" | "error"): string {
  if (tone === "error") return "text-rose-300/50 dark:text-rose-300/50";
  if (tone === "tool") return "text-muted-foreground/70";
  if (tone === "thinking") return "text-muted-foreground/50";
  return "text-muted-foreground/40";
}

function compactPreviewText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function workEntryPreview(workEntry: Pick<WorkLogEntry, "detail" | "command" | "changedFiles">) {
  if (workEntry.command) return compactPreviewText(workEntry.command);
  if (workEntry.detail) return compactPreviewText(workEntry.detail);
  if ((workEntry.changedFiles?.length ?? 0) === 0) return null;
  const [firstPath] = workEntry.changedFiles ?? [];
  if (!firstPath) return null;
  return workEntry.changedFiles!.length === 1
    ? firstPath
    : `${firstPath} +${workEntry.changedFiles!.length - 1} more`;
}

function workEntryIcon(workEntry: WorkLogEntry): LucideIcon {
  if (workEntry.requestKind === "command") return TerminalIcon;
  if (workEntry.requestKind === "file-read") return EyeIcon;
  if (workEntry.requestKind === "file-change") return SquarePenIcon;

  if (workEntry.itemType === "command_execution" || workEntry.command) {
    return TerminalIcon;
  }
  if (workEntry.itemType === "file_change" || (workEntry.changedFiles?.length ?? 0) > 0) {
    return SquarePenIcon;
  }
  if (workEntry.itemType === "web_search") return GlobeIcon;
  if (workEntry.itemType === "image_view") return EyeIcon;

  switch (workEntry.itemType) {
    case "mcp_tool_call":
      return WrenchIcon;
    case "dynamic_tool_call":
    case "collab_agent_tool_call":
      return HammerIcon;
  }

  return workToneIcon(workEntry.tone).icon;
}

function capitalizePhrase(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return value;
  }
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

function toolWorkEntryHeading(workEntry: WorkLogEntry): string {
  if (!workEntry.toolTitle) {
    return capitalizePhrase(normalizeCompactToolLabel(workEntry.label));
  }
  return capitalizePhrase(normalizeCompactToolLabel(workEntry.toolTitle));
}

export const WorkEntryRow = memo(function WorkEntryRow({
  workEntry,
  className,
  onOpenWorkerPanel,
}: WorkEntryRowProps) {
  const iconConfig = workToneIcon(workEntry.tone);
  const EntryIcon = workEntryIcon(workEntry);
  const heading = toolWorkEntryHeading(workEntry);
  const preview = workEntryPreview(workEntry);
  const displayText = preview ? `${heading} - ${preview}` : heading;
  const changedFiles = workEntry.changedFiles ?? [];
  const canOpenWorker =
    onOpenWorkerPanel !== undefined &&
    (typeof workEntry.workerId === "string" || typeof workEntry.threadId === "string");

  return (
    <div
      className={cn(
        "rounded-xl border px-2 py-1.5",
        workEntry.tone === "thinking"
          ? "border-transparent bg-transparent"
          : workEntry.tone === "tool"
            ? "border-border/30 bg-background/35"
            : "border-border/20 bg-background/20",
        className,
      )}
      data-work-entry-tone={workEntry.tone}
      data-work-entry-label={workEntry.label}
      data-work-entry-tool-name={workEntry.toolName}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center pt-0.5",
            iconConfig.className,
          )}
        >
          <EntryIcon className="size-3" />
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <p
            className={cn(
              "truncate leading-5",
              workEntry.tone === "thinking" ? "text-[10px]" : "text-[11px]",
              workToneClass(workEntry.tone),
              preview ? "text-muted-foreground/70" : "",
            )}
            title={displayText}
          >
            <span className={cn("text-foreground/80", workToneClass(workEntry.tone))}>
              {heading}
            </span>
            {preview && <span className="text-muted-foreground/55"> - {preview}</span>}
          </p>
        </div>
        {canOpenWorker ? (
          <button
            type="button"
            className="shrink-0 rounded-md border border-border/40 bg-background/60 px-2 py-0.5 text-[10px] text-foreground/75 transition-colors hover:bg-accent/10 hover:text-foreground"
            onClick={() =>
              onOpenWorkerPanel({
                ...(workEntry.workerId ? { workerId: workEntry.workerId } : {}),
                ...(workEntry.threadId ? { threadId: workEntry.threadId } : {}),
              })
            }
          >
            Open agent
          </button>
        ) : null}
      </div>
      {changedFiles.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1 pl-6">
          {changedFiles.slice(0, 8).map((filePath) => (
            <span
              key={`${workEntry.id}:${filePath}`}
              className="rounded-md border border-border/55 bg-background/75 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/75"
              title={filePath}
            >
              {filePath}
            </span>
          ))}
          {changedFiles.length > 8 && (
            <span className="px-1 text-[10px] text-muted-foreground/55">
              +{changedFiles.length - 8}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
