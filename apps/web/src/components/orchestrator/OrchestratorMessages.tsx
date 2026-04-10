import { CheckIcon, LoaderIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import ChatMarkdown from "~/components/ChatMarkdown";

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
              {item.status === "passed"
                ? "\u2713"
                : item.status === "failed"
                  ? "\u2717"
                  : "\u00b7"}
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
  requirementsChecklist: ReadonlyArray<OrchestratorChecklistItem>;
  threadBrowserSession: EmbeddedBrowserSession | null;
  isThreadBrowserSessionVisible: boolean;
  suppressInlineBrowserPreview?: boolean;
  isBusy: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** When true, renders the decision-aware transcript instead of the default bubbles. */
  controlRoomMode?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OrchestratorMessages({
  messages,
  requirementsChecklist,
  threadBrowserSession,
  isThreadBrowserSessionVisible,
  suppressInlineBrowserPreview = false,
  isBusy,
  scrollRef,
  controlRoomMode = false,
}: OrchestratorMessagesProps) {
  const hasContent = messages.length > 0 || requirementsChecklist.length > 0;

  // Find the index of the last "thinking" message — only that one should spin (and only if busy)
  const lastThinkingIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === "thinking") return i;
    }
    return -1;
  })();

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
            <div className="mb-3 h-36 overflow-hidden rounded bg-black/20">
              {threadBrowserSession.kind === "automation" &&
              threadBrowserSession.screenshotDataUrl ? (
                <img
                  src={threadBrowserSession.screenshotDataUrl}
                  alt={threadBrowserSession.title}
                  className="h-full w-full object-contain object-top"
                />
              ) : threadBrowserSession.kind === "url" ? (
                <iframe
                  title={threadBrowserSession.title}
                  src={threadBrowserSession.url}
                  className="h-full w-full border-0 bg-background"
                  sandbox="allow-downloads allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-scripts"
                />
              ) : null}
            </div>
          ) : null}
          {hasContent ? (
            messages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                isActiveThinking={isBusy && index === lastThinkingIndex}
              />
            ))
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
