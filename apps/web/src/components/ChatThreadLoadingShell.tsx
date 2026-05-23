/**
 * Loading state for thread hydration introduced by ORC-177.
 *
 * Previously the `_chat.$threadId.tsx` route rendered `null` while
 * the WS snapshot populated the threads store, which was visually
 * indistinguishable from a blank/broken page. This shell shows the
 * user that something is happening and surfaces the offending
 * threadId so a stale link is debuggable from the UI alone.
 *
 * @see ORC-177
 */

import { Skeleton } from "./ui/skeleton";

export interface ChatThreadLoadingShellProps {
  readonly threadId: string;
}

export function ChatThreadLoadingShell({ threadId }: ChatThreadLoadingShellProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="flex h-dvh min-h-0 min-w-0 flex-1 flex-col bg-background"
      data-testid="chat-thread-loading-shell"
    >
      <header className="flex h-12 items-center gap-3 border-b border-border/40 px-4">
        <Skeleton className="size-2.5 rounded-full" />
        <Skeleton className="h-3 w-44 rounded-full" />
        <span className="ml-auto text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/65">
          Loading thread...
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-6">
        <Skeleton className="h-4 w-2/3 rounded-md" />
        <Skeleton className="h-4 w-1/2 rounded-md" />
        <div className="mt-2 h-px bg-border/30" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-12 w-3/4 rounded-xl" />
      </div>

      <span className="sr-only">
        Loading thread {threadId}. Waiting for the server snapshot to populate.
      </span>
    </div>
  );
}
