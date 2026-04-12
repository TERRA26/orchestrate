// FILE: AgentPanel.tsx
// Purpose: Full agent panel with header, scrollable content area, and direct message input.
// Layer: Presentational component
// Exports: AgentPanel

import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import { SendHorizonalIcon } from "lucide-react";

import type { AgentPanelState } from "~/lib/multiAgentLayoutStore";
import { AgentPanelHeader } from "./AgentPanelHeader";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface AgentPanelProps {
  agent: AgentPanelState;
  onClose?: () => void;
  onDirectMessage?: (message: string) => void;
  children?: React.ReactNode;
}

export function AgentPanel({ agent, onClose, onDirectMessage, children }: AgentPanelProps) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || !onDirectMessage) return;
    onDirectMessage(trimmed);
    setInputValue("");
  }, [inputValue, onDirectMessage]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border/20 bg-background/40">
      <AgentPanelHeader agent={agent} onClose={onClose} />

      {/* Scrollable content area */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2.5">{children}</div>

      {/* Direct message input */}
      {onDirectMessage ? (
        <div className="flex shrink-0 items-center gap-1.5 border-t border-border/15 px-2 py-1.5">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send message to agent..."
            className="min-w-0 flex-1 bg-transparent text-[11px] text-foreground/80 placeholder:text-muted-foreground/30 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!inputValue.trim()}
            className="rounded p-0.5 text-muted-foreground/40 transition-colors hover:text-muted-foreground disabled:opacity-30"
            title="Send message"
          >
            <SendHorizonalIcon className="size-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
