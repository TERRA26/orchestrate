import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownIcon,
  CheckIcon,
  ExternalLinkIcon,
  LoaderIcon,
  Maximize2Icon,
  Minimize2Icon,
} from "lucide-react";

import { cn } from "~/lib/utils";
import { getScrollContainerDistanceFromBottom } from "~/chat-scroll";
import ChatMarkdown from "~/components/ChatMarkdown";
import { InlineEmbeddedBrowserCard } from "~/components/EmbeddedBrowserPane";
import { WorkingDots } from "~/components/ui/WorkingDots";
import { WorkingTimer } from "~/components/ui/WorkingTimer";
import type { WorkLogEntry } from "~/session-logic";
import { WorkEntryRow } from "../chat/WorkEntryRow";

import {
  countOrchestratorChecklistItems,
  type OrchestratorChecklistItem,
} from "~/orchestratorTypes";
import type { EmbeddedBrowserSession } from "~/embeddedBrowserStateStore";
import type { OrchestratorMessage } from "~/orchestratorStateStore";
import { DecisionCard, VerdictBanner } from "./OrchestratorBlockRenderer";
import { CompactActivityRow } from "./CompactActivityRow";
import { DELEGATION_MARKER } from "~/components/OrchestratorPanel.logic";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// Concrete starter prompts shown on the empty orchestrator pane. Picked to
// cover the breadth of what the orchestrator is good at: build, refactor,
// debug, and review — so first-time users see real options instead of a
// blank canvas. Keep these short so they read at a glance.
const ORCHESTRATOR_SAMPLE_PROMPTS: ReadonlyArray<{ title: string; prompt: string }> = [
  {
    title: "Build a SaaS dashboard",
    prompt: "Build a small SaaS dashboard with KPI cards, a plan-mix chart, and an accounts table.",
  },
  {
    title: "Find every TODO",
    prompt: "Search the workspace for TODO comments and group them by file with line numbers.",
  },
  {
    title: "Plan a refactor",
    prompt:
      "Plan how to extract the auth middleware into its own package without breaking callers.",
  },
  {
    title: "Review a branch",
    prompt:
      "Review the last 5 commits on this branch for regressions, edge cases, and missing tests.",
  },
];

function OrchestratorEmptyState() {
  return (
    <div className="mx-auto flex min-h-[40vh] w-full max-w-2xl flex-col items-center justify-center gap-5 px-6 py-10 text-center">
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground/85">What should the orchestrator do?</p>
        <p className="text-xs text-muted-foreground/70">
          Describe a task in plain English. Try one of these to start:
        </p>
      </div>
      <div className="grid w-full grid-cols-1 gap-1.5 sm:grid-cols-2">
        {ORCHESTRATOR_SAMPLE_PROMPTS.map((suggestion) => (
          <button
            key={suggestion.title}
            type="button"
            onClick={() => {
              const event = new CustomEvent("orchestrate:insert-prompt", {
                detail: { prompt: suggestion.prompt },
              });
              window.dispatchEvent(event);
            }}
            className="group flex flex-col gap-0.5 rounded-md border border-border/40 bg-card/40 px-3 py-2 text-left transition-colors hover:border-border/70 hover:bg-card/70"
          >
            <span className="text-[11px] font-medium text-foreground/80 group-hover:text-foreground">
              {suggestion.title}
            </span>
            <span className="line-clamp-2 text-[10.5px] text-muted-foreground/65">
              {suggestion.prompt}
            </span>
          </button>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground/45">
        Press <kbd className="rounded bg-muted/50 px-1 py-0.5 font-mono text-[9px]">↵</kbd> to send,{" "}
        <kbd className="rounded bg-muted/50 px-1 py-0.5 font-mono text-[9px]">/</kbd> for commands,{" "}
        <kbd className="rounded bg-muted/50 px-1 py-0.5 font-mono text-[9px]">@</kbd> to mention
      </p>
    </div>
  );
}

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

/**
 * Decide whether to render the tail-of-timeline "Thinking…" indicator.
 *
 * We suppress it when the most recent visible entry is already conveying
 * "something is in flight" — a thinking-role assistant message, a streaming
 * assistant message, or an in-flight tool call (work entry with `tone:
 * "thinking"`). Otherwise the user sees doubled-up indicators stacked at
 * the tail, which reads as confused redundancy. In every other case
 * (silent gap between actions, pause between turns, fresh user-message we
 * already covered with the per-message indicator above) we WANT the
 * thinking pulse to be visible so the chat doesn't look frozen.
 *
 * Returns true to render the indicator, false to skip it.
 */
function shouldShowTailThinkingIndicator(
  entries: ReadonlyArray<{ kind: string } & Record<string, unknown>>,
): boolean {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (!entry) continue;
    if (entry.kind === "work") {
      const workEntry = (entry as { workEntry?: WorkLogEntry }).workEntry;
      if (!workEntry) continue;
      if (shouldHideWorkEntry(workEntry)) continue;
      // An in-flight tool call already shows a spinner; don't double-up.
      return workEntry.tone !== "thinking";
    }
    if (entry.kind === "message") {
      const message = (entry as { message?: OrchestratorMessage }).message;
      if (!message) continue;
      // A live thinking-role message OR a streaming assistant message is
      // already showing motion of its own; skip the tail indicator.
      if (message.role === "thinking") return false;
      if (message.role === "user") return true;
      if (message.streaming === true) return false;
      return true;
    }
  }
  // No visible entries yet — show the indicator as a "starting up" hint.
  return true;
}

function StepIndicator({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="pb-2" data-step-indicator={active ? "active" : "done"}>
      <div className={cn("orch-think-row", active ? "orch-think-live" : "")}>
        {active ? (
          <span className="orch-think-spin">
            <WorkingDots size="sm" tone="accent" />
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
          <ChatMarkdown
            text={displayContent}
            cwd={undefined}
            isStreaming={message.streaming === true}
          />
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

// ---------------------------------------------------------------------------
// Floating "↓ jump to latest" button — appears only when the user has
// scrolled away from the bottom of the transcript. Clicking it resumes
// auto-scroll. Pattern lifted from dpcode's ChatTranscriptPane.
//
// Defined ABOVE OrchestratorMessagesInner so Vite's module transform doesn't
// turn the function declaration into a TDZ-trapped const at runtime — when
// these helpers were below the consumer, the rendered tree threw
// `ReferenceError: ScrollToBottomButton is not defined` on first paint.
// ---------------------------------------------------------------------------
function ScrollToBottomButton({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-3 left-1/2 z-10 inline-flex h-7 -translate-x-1/2 items-center gap-1.5 rounded-full border border-border/60 bg-background/95 px-3 text-[11px] font-medium text-foreground/80 shadow-[0_4px_14px_rgba(0,0,0,0.18)] backdrop-blur-md transition-colors hover:border-border hover:text-foreground"
      aria-label="Jump to latest message"
    >
      <ArrowDownIcon className="size-3" />
      Jump to latest
    </button>
  );
}

// Live "Working for Xs" footer rendered while a turn is in flight. The actual
// elapsed counter lives inside WorkingTimer (its own setInterval) so the
// transcript doesn't re-render every second. The "started at" anchor is the
// latest user/agent-result message timestamp — that's when the turn began.
function ActiveWorkFooter({ messages }: { messages: ReadonlyArray<OrchestratorMessage> }) {
  // Anchor on the most recent user message timestamp; that's when the user
  // submitted the work that's now in flight.
  const anchor = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg && msg.role === "user") return msg.timestamp;
    }
    return messages[messages.length - 1]?.timestamp ?? null;
  }, [messages]);
  if (!anchor) return null;
  return (
    <div className="px-3 pb-1 pt-2" data-active-work-footer>
      <WorkingTimer startedAt={anchor} />
    </div>
  );
}

function OrchestratorMessagesInner({
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
  const keepPinnedToBottomRef = useRef(true);
  const ignoreScrollEventsUntilRef = useRef(0);
  const latestMessage = messages.at(-1);
  const latestWorkEntry = workLogEntries.at(-1);
  const autoScrollKey = [
    messages.length,
    latestMessage?.id ?? "",
    latestMessage?.content.length ?? 0,
    workLogEntries.length,
    latestWorkEntry?.id ?? "",
    latestWorkEntry?.detail?.length ?? 0,
    latestWorkEntry?.command?.length ?? 0,
    latestWorkEntry?.output?.length ?? 0,
    requirementsChecklist.length,
    isBusy ? "busy" : "idle",
  ].join(":");

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    if (!isBusy && !keepPinnedToBottomRef.current) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      ignoreScrollEventsUntilRef.current = Date.now() + 250;
      keepPinnedToBottomRef.current = true;
      container.scrollTop = container.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [autoScrollKey, isBusy, scrollRef]);

  // Tracks whether the scroll-to-bottom button should appear. Threshold higher
  // than the auto-pin threshold (128px) so brief auto-scroll lag doesn't flash
  // the button — only an intentional scroll-up reveals it.
  const [showScrollToBottomButton, setShowScrollToBottomButton] = useState(false);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    const handleScroll = () => {
      if (Date.now() < ignoreScrollEventsUntilRef.current) {
        return;
      }
      const distanceFromBottom = getScrollContainerDistanceFromBottom({
        scrollTop: container.scrollTop,
        clientHeight: container.clientHeight,
        scrollHeight: container.scrollHeight,
      });
      keepPinnedToBottomRef.current = isBusy || distanceFromBottom <= 128;
      setShowScrollToBottomButton(distanceFromBottom > 240);
    };
    const scrollToBottom = () => {
      if (!keepPinnedToBottomRef.current && !isBusy) {
        return;
      }
      ignoreScrollEventsUntilRef.current = Date.now() + 250;
      keepPinnedToBottomRef.current = true;
      container.scrollTop = container.scrollHeight;
      setShowScrollToBottomButton(false);
    };
    const observer = new MutationObserver(() => {
      requestAnimationFrame(scrollToBottom);
    });

    container.addEventListener("scroll", handleScroll, { passive: true });
    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => {
      container.removeEventListener("scroll", handleScroll);
      observer.disconnect();
    };
  }, [isBusy, scrollRef]);

  const handleJumpToLatest = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    keepPinnedToBottomRef.current = true;
    ignoreScrollEventsUntilRef.current = Date.now() + 250;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    setShowScrollToBottomButton(false);
  }, [scrollRef]);

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
            <>
              {timelineEntries.map((entry) => {
                if (entry.kind === "message") {
                  return <TranscriptEntry key={entry.id} message={entry.message} />;
                }
                if (shouldHideWorkEntry(entry.workEntry)) {
                  return null;
                }
                return <CompactActivityRow key={entry.id} workEntry={entry.workEntry} />;
              })}
              {/* Live working indicator at the foot of the transcript. Anchors
                  user attention while the agent is mid-turn and silent. The
                  WorkingTimer is a leaf component with its own setInterval so
                  the elapsed counter doesn't trigger transcript redraws. */}
              {isBusy ? <ActiveWorkFooter messages={messages} /> : null}
            </>
          ) : (
            <OrchestratorEmptyState />
          )}
        </div>
        <ScrollToBottomButton visible={showScrollToBottomButton} onClick={handleJumpToLatest} />
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
                        {...(onOpenWorkerPanel ? { onOpenWorkerPanel } : {})}
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
              {/*
                Tail thinking indicator. The per-user-message StepIndicator
                above only fires when nothing has followed the latest user
                message — so once the orchestrator emits its first piece of
                work (a tool call or assistant text) the indicator vanishes.
                But the orchestrator can still be reasoning between that
                first emission and its next visible action: a tool call
                wrapping up, awaiting an LLM continuation, or just composing
                the next message. Without a tail indicator the chat looks
                idle, which the user reads as "stuck." This shows a
                "Thinking…" pulse whenever the orchestrator is busy and
                neither the most-recent timeline entry nor the live message
                stream is already showing one.
              */}
              {isBusy && shouldShowTailThinkingIndicator(timelineEntries) ? (
                <StepIndicator label="Thinking…" active={true} />
              ) : null}
            </>
          ) : (
            <div className="flex min-h-[40vh] items-center justify-center">
              <p className="text-sm text-muted-foreground/60">Describe what you want built.</p>
            </div>
          )}
        </div>
      </div>
      <ScrollToBottomButton visible={showScrollToBottomButton} onClick={handleJumpToLatest} />
    </div>
  );
}

// Memoize the transcript so composer keystrokes (which lift `input` state
// in the parent) don't trigger a full transcript redraw on every character.
// Re-renders are still triggered when messages, work-log entries, or the
// active browser session change.
export const OrchestratorMessages = memo(OrchestratorMessagesInner);
