import { useCallback, useMemo, useState } from "react";
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

function MessageBubble({
  message,
  isActiveThinking,
}: {
  message: OrchestratorMessage;
  isActiveThinking?: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="pb-4" data-message-role="user">
        <div className="flex w-full justify-end">
          <div className="group flex max-w-[80%] flex-col items-end gap-1">
            <div className="w-max max-w-full min-w-0 self-end rounded-xl border border-border/70 bg-secondary px-[14px] py-1.5">
              <div className="inline-block max-w-full min-w-0 wrap-break-word whitespace-pre-wrap font-system-ui text-sm leading-relaxed text-foreground">
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
      <div className="pb-3">
        <div className="flex items-start gap-2 text-muted-foreground/70">
          {isActiveThinking ? (
            <LoaderIcon className="mt-0.5 size-3.5 shrink-0 animate-spin" />
          ) : (
            <CheckIcon className="mt-0.5 size-3.5 shrink-0" />
          )}
          <span className="text-xs leading-relaxed">{message.content}</span>
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
    // Delegated instruction — muted white bubble to distinguish from orchestrator's own responses
    return (
      <div className="pb-4" data-message-role="delegation">
        <div className="rounded-lg border border-border/15 bg-foreground/[0.06] px-4 py-3">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40">
            Delegated to agent
          </p>
          <div className="chat-markdown prose prose-sm max-w-none text-sm leading-relaxed text-foreground/85">
            <ChatMarkdown text={displayContent} cwd={undefined} />
          </div>
        </div>
      </div>
    );
  }

  // orchestrator or agent-result — rendered like assistant messages
  return (
    <div className="pb-4" data-message-role="assistant">
      <div className="chat-markdown prose prose-sm max-w-none text-sm leading-relaxed text-foreground">
        <ChatMarkdown text={displayContent} cwd={undefined} />
      </div>
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

function TranscriptEntry({ message }: { message: OrchestratorMessage }) {
  switch (message.role) {
    case "user":
      return (
        <div className="flex justify-end px-3 py-1.5">
          <div className="max-w-[80%] rounded-lg border border-border/20 bg-secondary/50 px-3 py-1.5 text-[12px] text-foreground/90">
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

  // Control room mode: dense transcript with decision cards
  if (controlRoomMode) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain py-2"
        >
          {hasContent ? (
            messages.map((message) => <TranscriptEntry key={message.id} message={message} />)
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
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-3 py-3 sm:px-5 sm:py-4"
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
              {timelineEntries.map((entry) =>
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
                ),
              )}
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
