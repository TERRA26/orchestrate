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
  // orchestrator or agent-result — rendered like assistant messages
  return (
    <div className="pb-4" data-message-role="assistant">
      <div className="chat-markdown prose prose-sm max-w-none text-sm leading-relaxed text-foreground">
        <ChatMarkdown text={message.content} cwd={undefined} />
      </div>
    </div>
  );
}

function RequirementsChecklistCard({ items }: { items: ReadonlyArray<OrchestratorChecklistItem> }) {
  const counts = countOrchestratorChecklistItems(items);

  return (
    <div className="mb-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-foreground/88">Quality Gate</p>
          <p className="text-[11px] text-muted-foreground">
            {counts.passed}/{items.length} verified
            {counts.failed > 0 ? `, ${counts.failed} failing` : ""}
            {counts.pending > 0 ? `, ${counts.pending} pending` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-green-600">
            {counts.passed} passed
          </span>
          <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-amber-600">
            {counts.pending} pending
          </span>
          <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-red-600">
            {counts.failed} failed
          </span>
        </div>
      </div>
      <div className="mt-2 flex flex-col gap-1.5">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-md border border-border/40 bg-background/55 px-2.5 py-2"
          >
            <div className="flex items-start gap-2">
              <span
                className={cn(
                  "mt-1 size-2 shrink-0 rounded-full",
                  item.status === "passed"
                    ? "bg-green-500"
                    : item.status === "failed"
                      ? "bg-red-500"
                      : "bg-amber-500",
                )}
              />
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
// Props
// ---------------------------------------------------------------------------

export interface OrchestratorMessagesProps {
  messages: ReadonlyArray<OrchestratorMessage>;
  requirementsChecklist: ReadonlyArray<OrchestratorChecklistItem>;
  threadBrowserSession: EmbeddedBrowserSession | null;
  isThreadBrowserSessionVisible: boolean;
  isBusy: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OrchestratorMessages({
  messages,
  requirementsChecklist,
  threadBrowserSession,
  isThreadBrowserSessionVisible,
  isBusy,
  scrollRef,
}: OrchestratorMessagesProps) {
  const hasContent = messages.length > 0 || requirementsChecklist.length > 0;

  // Find the index of the last "thinking" message — only that one should spin (and only if busy)
  const lastThinkingIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === "thinking") return i;
    }
    return -1;
  })();

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
          {threadBrowserSession && isThreadBrowserSessionVisible ? (
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
