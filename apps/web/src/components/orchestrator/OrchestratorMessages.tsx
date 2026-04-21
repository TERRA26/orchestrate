import { Fragment, useCallback, useMemo, useState } from "react";
import {
  CheckIcon,
  ExternalLinkIcon,
  LoaderIcon,
  Maximize2Icon,
  Minimize2Icon,
} from "lucide-react";

import { cn } from "~/lib/utils";
import ChatMarkdown from "~/components/ChatMarkdown";
import { InlineEmbeddedBrowserCard } from "~/components/EmbeddedBrowserPane";
import type { WorkLogEntry } from "~/session-logic";
import { WorkEntryRow } from "../chat/WorkEntryRow";

import {
  countOrchestratorChecklistItems,
  type OrchestratorChecklistItem,
} from "~/orchestratorTypes";
import type { EmbeddedBrowserSession } from "~/embeddedBrowserStateStore";
import type { OrchestratorMessage } from "~/orchestratorStateStore";
import { DecisionCard, VerdictBanner } from "./OrchestratorBlockRenderer";
import { DELEGATION_MARKER } from "~/components/OrchestratorPanel.logic";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const HIDDEN_WORK_ENTRY_LABELS = new Set(["turn", "rate limits updated", "item", "tool call"]);

export function shouldHideWorkEntry(workEntry: WorkLogEntry): boolean {
  // Hide only truly empty/generic entries. If the entry carries real content
  // (tool name, command, changed files, or non-trivial detail), surface it —
  // otherwise the orchestrator panel becomes a black box where users can't
  // see tool calls like orchestrate_spawn_agent / orchestrate_get_all_status.
  const hasRealContent =
    (typeof workEntry.toolName === "string" && workEntry.toolName.trim().length > 0) ||
    (typeof workEntry.command === "string" && workEntry.command.trim().length > 0) ||
    (workEntry.changedFiles && workEntry.changedFiles.length > 0) ||
    (typeof workEntry.detail === "string" && workEntry.detail.trim().length > 0);
  if (hasRealContent) {
    return false;
  }
  const candidates = [workEntry.toolTitle, workEntry.label]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toLowerCase());
  return candidates.some((candidate) => HIDDEN_WORK_ENTRY_LABELS.has(candidate));
}

function StepIndicator({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="pb-2" data-step-indicator={active ? "active" : "done"}>
      <div className={cn("orch-think-row", active ? "orch-think-live" : "")}>
        {active ? (
          <span className="orch-think-spin">
            <LoaderIcon className="size-3 animate-spin" />
          </span>
        ) : (
          <span className="orch-think-check">
            <CheckIcon className="size-2.5" />
          </span>
        )}
        <span>{label}</span>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  isActiveThinking,
}: {
  message: OrchestratorMessage;
  isActiveThinking?: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="pb-3" data-message-role="user">
        <div className="flex w-full justify-end">
          <div className="group flex max-w-[82%] flex-col items-end gap-1">
            <div className="w-max max-w-full min-w-0 self-end rounded-lg border border-border/50 bg-secondary/60 px-2.5 py-1.5">
              <div className="inline-block max-w-full min-w-0 wrap-break-word whitespace-pre-wrap font-system-ui text-[12px] leading-relaxed text-foreground @[380px]/pane:text-[12.5px] @[520px]/pane:text-[13px]">
                {message.content}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (message.role === "thinking") {
    return (
      <div className="pb-2" data-message-role="thinking">
        <div className={cn("orch-think-row", isActiveThinking ? "orch-think-live" : "")}>
          {isActiveThinking ? (
            <span className="orch-think-spin">
              <LoaderIcon className="size-3 animate-spin" />
            </span>
          ) : (
            <span className="orch-think-check">
              <CheckIcon className="size-2.5" />
            </span>
          )}
          <span>{message.content}</span>
        </div>
      </div>
    );
  }
  // Detect delegated instructions (prefixed with DELEGATION_MARKER)
  const isDelegation = message.content.startsWith(DELEGATION_MARKER);
  const displayContent = isDelegation
    ? message.content.slice(DELEGATION_MARKER.length)
    : message.content;

  if (isDelegation) {
    return (
      <div className="pb-3" data-message-role="delegation">
        <div className="border-l-2 border-amber-500/40 bg-amber-500/[0.03] py-2 pl-3 pr-1">
          <p className="mb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-amber-400/70">
            Delegated
          </p>
          <ChatMarkdown text={displayContent} cwd={undefined} />
        </div>
      </div>
    );
  }

  // orchestrator or agent-result — flat transcript block with orch-tag header
  const tagLabel = message.role === "agent-result" ? "AGENT" : "ORCHESTRATOR";
  return (
    <div className="pb-3" data-message-role="assistant">
      <div className="flex items-center gap-2 pb-1">
        <span className="orch-tag">
          <span className="orch-tag-dot" />
          {tagLabel}
        </span>
      </div>
      <ChatMarkdown text={displayContent} cwd={undefined} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact browser preview — left-aligned thumbnail with action icons
// ---------------------------------------------------------------------------

function CompactBrowserPreview({ session }: { session: EmbeddedBrowserSession }) {
  const [expanded, setExpanded] = useState(false);
  const url = "url" in session ? session.url : null;

  const handleOpenExternal = useCallback(() => {
    if (url) window.open(url, "_blank", "noopener");
  }, [url]);

  // Expanded: use the full InlineEmbeddedBrowserCard
  if (expanded) {
    return (
      <div className="relative mb-3">
        <div className="absolute right-2 top-2 z-10 flex gap-1">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="rounded bg-black/50 p-1 text-white/60 backdrop-blur transition-colors hover:text-white/90"
            title="Minimize preview"
          >
            <Minimize2Icon className="size-3.5" />
          </button>
        </div>
        <InlineEmbeddedBrowserCard
          session={session}
          scopeLabel="Browser preview"
          className="h-[clamp(280px,40vh,420px)]"
        />
      </div>
    );
  }

  // Compact: small left-aligned thumbnail with action icons on the right
  return (
    <div className="mb-3 flex items-start gap-2">
      {/* Thumbnail */}
      <div className="h-20 w-32 shrink-0 overflow-hidden rounded bg-black/20">
        {session.kind === "automation" && session.screenshotDataUrl ? (
          <img
            src={session.screenshotDataUrl}
            alt={session.title}
            className="h-full w-full object-cover object-top"
          />
        ) : session.kind === "url" ? (
          <iframe
            title={session.title}
            src={session.url}
            className="h-full w-full scale-[0.5] origin-top-left border-0 bg-background"
            style={{ width: "200%", height: "200%" }}
            sandbox="allow-scripts"
            tabIndex={-1}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[9px] text-muted-foreground/25">
            Preview
          </div>
        )}
      </div>

      {/* Action icons */}
      <div className="flex flex-col gap-1 pt-0.5">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded p-1 text-muted-foreground/30 transition-colors hover:bg-accent/10 hover:text-muted-foreground/60"
          title="Expand preview"
        >
          <Maximize2Icon className="size-3.5" />
        </button>
        {url ? (
          <button
            type="button"
            onClick={handleOpenExternal}
            className="rounded p-1 text-muted-foreground/30 transition-colors hover:bg-accent/10 hover:text-muted-foreground/60"
            title="Open in new tab"
          >
            <ExternalLinkIcon className="size-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function RequirementsChecklistCard({ items }: { items: ReadonlyArray<OrchestratorChecklistItem> }) {
  const counts = countOrchestratorChecklistItems(items);

  return (
    <div className="mb-3 px-1">
      <p className="mb-1.5 text-[10px] text-muted-foreground/40">
        {counts.passed}/{items.length} verified
      </p>
      <div className="flex flex-col gap-0.5">
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-1.5 py-0.5">
            <span
              className={cn(
                "mt-0.5 shrink-0 text-[11px] leading-none",
                item.status === "passed"
                  ? "text-foreground/45"
                  : item.status === "failed"
                    ? "text-muted-foreground/50"
                    : "text-muted-foreground/25",
              )}
            >
              {item.status === "passed" ? "\u2713" : item.status === "failed" ? "\u2717" : "\u00b7"}
            </span>
            <p
              className={cn(
                "text-[11px] leading-4",
                item.status === "passed" ? "text-foreground/50" : "text-foreground/70",
              )}
            >
              {item.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChangedFilesSummaryCard({ filePaths }: { filePaths: ReadonlyArray<string> }) {
  if (filePaths.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 rounded-xl border border-border/30 bg-background/35 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55">
          Files changed
        </p>
        <span className="text-[10px] text-muted-foreground/45">
          {filePaths.length} {filePaths.length === 1 ? "file" : "files"}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {filePaths.slice(0, 12).map((filePath) => (
          <span
            key={filePath}
            className="rounded-md border border-border/45 bg-background/75 px-2 py-1 font-mono text-[10px] text-foreground/75"
            title={filePath}
          >
            {filePath}
          </span>
        ))}
        {filePaths.length > 12 ? (
          <span className="px-1 text-[10px] text-muted-foreground/55">
            +{filePaths.length - 12} more
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transcript entry (control room mode)
// ---------------------------------------------------------------------------

// Gap G: compact one-line row for orchestrator activities in control-room
// mode. Surfaces spawns, sends, waits, reviews, and generic tool calls as a
// dense strip so the user can follow what the orchestrator is doing without
// the heavy work-log cards swamping the transcript.
function CompactActivityRow({ workEntry }: { workEntry: WorkLogEntry }) {
  const toolName = workEntry.toolName?.replace(/^mcp__orchestrate__/, "");
  const isOrchTool = toolName?.startsWith("orchestrate_") ?? false;

  const label = (() => {
    if (isOrchTool && toolName) {
      // Human-friendly verb form
      const verb = toolName.replace(/^orchestrate_/, "").replace(/_/g, " ");
      const target = workEntry.workerId
        ? ` @${workEntry.workerId.slice(-8)}`
        : workEntry.threadId
          ? ` @${workEntry.threadId.slice(-8)}`
          : "";
      return `→ ${verb}${target}`;
    }
    if (workEntry.tone === "thinking" || workEntry.itemType === undefined) {
      return workEntry.label ?? workEntry.toolTitle ?? "thinking";
    }
    if (workEntry.command) {
      return `$ ${workEntry.command}`;
    }
    if (workEntry.toolName) {
      return `· ${workEntry.toolName}`;
    }
    return workEntry.label ?? workEntry.toolTitle ?? "activity";
  })();

  const preview = workEntry.detail?.trim() ?? "";
  const toneClass =
    workEntry.tone === "error"
      ? "text-rose-300/80"
      : isOrchTool
        ? "text-amber-400/80"
        : workEntry.tone === "tool"
          ? "text-muted-foreground/65"
          : "text-muted-foreground/50";

  return (
    <div className="flex items-start gap-1.5 px-3 py-0.5" data-activity-row={toolName ?? "x"}>
      <span className={cn("shrink-0 font-mono text-[10px] leading-[1.5]", toneClass)}>
        {label}
      </span>
      {preview && preview !== workEntry.label ? (
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] leading-[1.5] text-muted-foreground/35">
          {preview}
        </span>
      ) : null}
    </div>
  );
}

function TranscriptEntry({ message }: { message: OrchestratorMessage }) {
  switch (message.role) {
    case "user":
      return (
        <div className="flex justify-end px-3 py-1.5">
          <div
            className="max-w-[80%] bg-card px-2.5 py-1.5 text-[13px] leading-snug text-foreground/92 border border-border/40"
            style={{ borderRadius: "9px 9px 3px 9px" }}
          >
            {message.content}
          </div>
        </div>
      );

    case "orchestrator":
      return (
        <div className="px-3 py-1">
          <DecisionCard
            decision={{
              type: "delegated",
              reason: message.content,
              createdAt: message.timestamp,
            }}
          />
        </div>
      );

    case "thinking":
      return (
        <div className="flex items-center gap-2 px-3 py-0.5">
          <div className="size-1.5 shrink-0 animate-pulse rounded-full bg-foreground/30" />
          <span className="truncate text-[10px] italic text-muted-foreground/40">
            {message.content}
          </span>
        </div>
      );

    case "agent-result":
      return (
        <div className="px-3 py-1">
          <VerdictBanner
            accepted={
              message.content.toLowerCase().includes("accepted") ||
              message.content.toLowerCase().includes("passed")
            }
            summary={message.content}
            evidenceCount={0}
          />
        </div>
      );

    default:
      return <div className="px-3 py-1 text-[11px] text-foreground/60">{message.content}</div>;
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface OrchestratorMessagesProps {
  messages: ReadonlyArray<OrchestratorMessage>;
  workLogEntries?: ReadonlyArray<WorkLogEntry>;
  requirementsChecklist: ReadonlyArray<OrchestratorChecklistItem>;
  threadBrowserSession: EmbeddedBrowserSession | null;
  isThreadBrowserSessionVisible: boolean;
  suppressInlineBrowserPreview?: boolean;
  isBusy: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onOpenWorkerPanel?: (input: { workerId?: string; threadId?: string }) => void;
  /** When true, renders the decision-aware transcript instead of the default bubbles. */
  controlRoomMode?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OrchestratorMessages({
  messages,
  workLogEntries = [],
  requirementsChecklist,
  threadBrowserSession,
  isThreadBrowserSessionVisible,
  suppressInlineBrowserPreview = false,
  isBusy,
  scrollRef,
  onOpenWorkerPanel,
  controlRoomMode = false,
}: OrchestratorMessagesProps) {
  const hasContent =
    messages.length > 0 || workLogEntries.length > 0 || requirementsChecklist.length > 0;

  // Find the index of the last "thinking" message — only that one should spin (and only if busy)
  const lastThinkingIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === "thinking") return i;
    }
    return -1;
  })();
  const lastThinkingMessageId = lastThinkingIndex >= 0 ? messages[lastThinkingIndex]?.id : null;
  const timelineEntries = useMemo(
    () =>
      [
        ...messages.map((message) => ({
          id: `message:${message.id}`,
          createdAt: message.timestamp,
          kind: "message" as const,
          message,
        })),
        ...workLogEntries.map((workEntry) => ({
          id: `work:${workEntry.id}`,
          createdAt: workEntry.createdAt,
          kind: "work" as const,
          workEntry,
        })),
      ].toSorted((left, right) => {
        const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
        if (createdAtComparison !== 0) {
          return createdAtComparison;
        }
        return left.id.localeCompare(right.id);
      }),
    [messages, workLogEntries],
  );
  const changedFiles = useMemo(() => {
    const collected = new Set<string>();
    for (const entry of workLogEntries) {
      for (const filePath of entry.changedFiles ?? []) {
        collected.add(filePath);
      }
    }
    return [...collected];
  }, [workLogEntries]);

  // Control room mode: dense transcript — messages + compact activity rows
  // interleaved by timestamp so the user can follow orchestrator actions
  // (spawn_agent, send_to_agent, wait_all, tool calls, thinking) without
  // the heavy work-log cards.
  if (controlRoomMode) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain py-2"
        >
          {hasContent ? (
            timelineEntries.map((entry) => {
              if (entry.kind === "message") {
                return <TranscriptEntry key={entry.id} message={entry.message} />;
              }
              if (shouldHideWorkEntry(entry.workEntry)) {
                return null;
              }
              return <CompactActivityRow key={entry.id} workEntry={entry.workEntry} />;
            })
          ) : (
            <div className="flex min-h-[20vh] items-center justify-center">
              <p className="text-[11px] text-muted-foreground/40">No transcript entries yet</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Default mode: rich message bubbles
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-2.5 py-2.5 @[380px]/pane:px-4 @[380px]/pane:py-3.5 @[520px]/pane:px-5 @[520px]/pane:py-4"
      >
        <div className="mx-auto w-full max-w-3xl">
          {requirementsChecklist.length > 0 ? (
            <RequirementsChecklistCard items={requirementsChecklist} />
          ) : null}
          {threadBrowserSession &&
          isThreadBrowserSessionVisible &&
          !suppressInlineBrowserPreview ? (
            <CompactBrowserPreview session={threadBrowserSession} />
          ) : null}
          {hasContent ? (
            <>
              {timelineEntries.map((entry, index) => {
                if (entry.kind === "work" && shouldHideWorkEntry(entry.workEntry)) {
                  return null;
                }

                const node =
                  entry.kind === "message" ? (
                    <MessageBubble
                      key={entry.id}
                      message={entry.message}
                      isActiveThinking={isBusy && entry.message.id === lastThinkingMessageId}
                    />
                  ) : (
                    <div key={entry.id} className="pb-2">
                      <WorkEntryRow
                        workEntry={entry.workEntry}
                        onOpenWorkerPanel={onOpenWorkerPanel}
                      />
                    </div>
                  );

                // Show an active "Understanding request…" step after a user
                // message only while nothing else follows; hide it once the
                // orchestrator starts emitting a response.
                if (entry.kind === "message" && entry.message.role === "user") {
                  const hasFollowUp = timelineEntries
                    .slice(index + 1)
                    .some(
                      (later) =>
                        (later.kind === "work" && !shouldHideWorkEntry(later.workEntry)) ||
                        (later.kind === "message" && later.message.role !== "user"),
                    );
                  if (!hasFollowUp) {
                    return (
                      <Fragment key={entry.id}>
                        {node}
                        <StepIndicator label="Understanding request…" active={isBusy} />
                      </Fragment>
                    );
                  }
                }

                return node;
              })}
              <ChangedFilesSummaryCard filePaths={changedFiles} />
            </>
          ) : (
            <div className="flex min-h-[40vh] items-center justify-center">
              <p className="text-sm text-muted-foreground/60">Describe what you want built.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
