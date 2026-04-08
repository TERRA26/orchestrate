import { CheckCircleIcon, LoaderIcon, SendIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import ChatMarkdown from "~/components/ChatMarkdown";
import { ScrollArea } from "~/components/ui/scroll-area";
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

function MessageBubble({ message }: { message: OrchestratorMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex w-full justify-end pb-1">
        <div className="max-w-[85%] rounded-xl border border-border/70 bg-secondary px-3.5 py-2">
          <div className="whitespace-pre-wrap font-system-ui text-sm leading-relaxed text-foreground">
            {message.content}
          </div>
        </div>
      </div>
    );
  }
  if (message.role === "thinking") {
    return (
      <div className="pb-1">
        <div className="flex items-start gap-2 text-muted-foreground">
          <LoaderIcon className="mt-0.5 size-3.5 shrink-0 animate-spin" />
          <span className="text-sm leading-relaxed">{message.content}</span>
        </div>
      </div>
    );
  }
  if (message.role === "agent-result") {
    return (
      <div className="pb-1">
        <div className="chat-markdown text-sm leading-relaxed text-foreground">
          <ChatMarkdown text={message.content} cwd={undefined} />
        </div>
      </div>
    );
  }
  // orchestrator
  return (
    <div className="pb-1">
      <div className="chat-markdown text-sm leading-relaxed text-foreground">
        <ChatMarkdown text={message.content} cwd={undefined} />
      </div>
    </div>
  );
}

function RequirementsChecklistCard({ items }: { items: ReadonlyArray<OrchestratorChecklistItem> }) {
  const counts = countOrchestratorChecklistItems(items);

  return (
    <div className="rounded-[18px] border border-border/60 bg-muted/20 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium text-foreground/88">Quality Gate</p>
          <p className="text-[10px] text-muted-foreground">
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
            className="rounded-[14px] border border-border/40 bg-background/55 px-2.5 py-2"
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
                <p className="text-[11px] leading-4 text-foreground/90">{item.label}</p>
                {item.notes ? (
                  <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{item.notes}</p>
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
  scrollRef,
}: OrchestratorMessagesProps) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div ref={scrollRef} className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-5">
        {requirementsChecklist.length > 0 ? (
          <RequirementsChecklistCard items={requirementsChecklist} />
        ) : null}
        {threadBrowserSession && isThreadBrowserSessionVisible ? (
          <InlineEmbeddedBrowserCard
            session={threadBrowserSession}
            scopeLabel="Browser preview"
            className="h-[clamp(360px,48vh,540px)]"
          />
        ) : null}
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
            <p className="text-sm text-muted-foreground">Describe what you want built.</p>
          </div>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
      </div>
    </ScrollArea>
  );
}
