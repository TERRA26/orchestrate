import { CheckIcon, LoaderIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import ChatMarkdown from "~/components/ChatMarkdown";
import { InlineEmbeddedBrowserCard } from "~/components/EmbeddedBrowserPane";
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
    <div className="mb-3 border border-border/10 bg-transparent px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-foreground/88">Quality Gate</p>
          <p className="text-[11px] text-muted-foreground">
            {counts.passed}/{items.length} verified
            {counts.failed > 0 ? `, ${counts.failed} failing` : ""}
            {counts.pending > 0 ? `, ${counts.pending} pending` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-foreground/50">{counts.passed} passed</span>
          <span className="text-muted-foreground/40">{counts.pending} pending</span>
          <span className="text-muted-foreground/60">{counts.failed} failed</span>
        </div>
      </div>
      <div className="mt-2 flex flex-col gap-1.5">
        {items.map((item) => (
          <div key={item.id} className="border border-border/10 bg-transparent px-2.5 py-2">
            <div className="flex items-start gap-2">
              <span
                className={cn(
                  "mt-1 shrink-0 text-[11px] leading-none",
                  item.status === "passed"
                    ? "text-foreground/50"
                    : item.status === "failed"
                      ? "text-muted-foreground/60"
                      : "text-muted-foreground/40",
                )}
              >
                {item.status === "passed"
                  ? "\u2713"
                  : item.status === "failed"
                    ? "\u2717"
                    : "\u00b7"}
              </span>
              <div className="min-w-0">
                <p className="text-xs leading-4 text-foreground/90">{item.label}</p>
                {item.notes ? (
                  <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{item.notes}</p>
                ) : null}
              </div>
            </div>
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
            <div className="mb-4">
              <InlineEmbeddedBrowserCard
                session={threadBrowserSession}
                scopeLabel="Browser preview"
                className="h-[clamp(360px,48vh,540px)]"
              />
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
