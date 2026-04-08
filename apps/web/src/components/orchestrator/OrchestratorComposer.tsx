import { useCallback, useRef } from "react";
import type { ProviderKind, ServerProviderModel, ThreadId } from "@t3tools/contracts";

import { cn } from "~/lib/utils";
import type { ProviderOptions } from "~/providerModelOptions";
import { Separator } from "~/components/ui/separator";
import { ProviderModelPicker } from "~/components/chat/ProviderModelPicker";
import { TraitsPicker } from "~/components/chat/TraitsPicker";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface OrchestratorComposerProps {
  input: string;
  canSend: boolean;
  isBusy: boolean;
  selectedProvider: ProviderKind;
  selectedModel: string;
  selectedProviderModels: ReadonlyArray<ServerProviderModel>;
  modelOptionsByProvider: Record<ProviderKind, ReadonlyArray<{ slug: string; name: string }>>;
  composerModelOptions: Record<string, ProviderOptions> | null;
  composerProviderState: {
    composerFrameClassName?: string;
    composerSurfaceClassName?: string;
    modelPickerIconClassName?: string;
  };
  onInputChange: (text: string) => void;
  onSend: (text: string) => Promise<void>;
  onModelChange: (provider: ProviderKind, model: string) => void;
  onPromptChangeFromTraits: (prompt: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OrchestratorComposer({
  input,
  canSend,
  isBusy,
  selectedProvider,
  selectedModel,
  selectedProviderModels,
  modelOptionsByProvider,
  composerModelOptions,
  composerProviderState,
  onInputChange,
  onSend,
  onModelChange,
  onPromptChangeFromTraits,
}: OrchestratorComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || !canSend || isBusy) return;
      void onSend(trimmed);
    },
    [input, canSend, isBusy, onSend],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const trimmed = input.trim();
        if (!trimmed || !canSend || isBusy) return;
        void onSend(trimmed);
      }
    },
    [input, canSend, isBusy, onSend],
  );

  const hasSendableContent = input.trim().length > 0;

  return (
    <div className={cn("px-3 pt-4 sm:px-5 sm:pt-4", "pb-2.5 sm:pb-3")}>
      <form onSubmit={handleSubmit} className="w-full min-w-0">
        <div
          className={cn(
            "group rounded-2xl p-px transition-colors duration-200",
            composerProviderState.composerFrameClassName,
          )}
        >
          <div
            className={cn(
              "rounded-md border bg-card transition-colors duration-200 focus-within:border-neutral-500/15",
              isBusy ? "border-border/40 opacity-60" : "border-border/60",
              composerProviderState.composerSurfaceClassName,
            )}
          >
            {/* Text area */}
            <div className="relative px-4 pb-1 pt-3.5">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => onInputChange(event.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isBusy}
                placeholder={isBusy ? "Working..." : "Describe what you want built..."}
                rows={1}
                className="block w-full resize-none bg-transparent text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                style={
                  {
                    minHeight: "3.5rem",
                    maxHeight: "200px",
                    fieldSizing: "content",
                  } as React.CSSProperties
                }
              />
            </div>

            {/* Bottom toolbar */}
            <div className="flex items-end justify-between px-3 pb-2.5 gap-1.5 sm:flex-nowrap sm:gap-0">
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <ProviderModelPicker
                  compact
                  provider={selectedProvider}
                  model={selectedModel}
                  lockedProvider={null}
                  modelOptionsByProvider={modelOptionsByProvider}
                  disabled={isBusy}
                  {...(composerProviderState.modelPickerIconClassName
                    ? {
                        activeProviderIconClassName: composerProviderState.modelPickerIconClassName,
                      }
                    : {})}
                  onProviderModelChange={onModelChange}
                />
                {selectedProviderModels.length > 0 ? (
                  <>
                    <Separator orientation="vertical" className="mx-0.5 h-4 shrink-0" />
                    <TraitsPicker
                      provider={selectedProvider}
                      threadId={"orchestrator" as unknown as ThreadId}
                      models={selectedProviderModels}
                      model={selectedModel}
                      prompt={input}
                      modelOptions={composerModelOptions?.[selectedProvider]}
                      onPromptChange={onPromptChangeFromTraits}
                    />
                  </>
                ) : null}
              </div>

              {/* Send button — matches main chat style */}
              <div className="flex shrink-0 items-center">
                <button
                  type="submit"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground/80 text-background transition-all duration-150 hover:bg-foreground hover:scale-105 disabled:opacity-20 disabled:hover:scale-100 sm:h-7 sm:w-7"
                  disabled={!hasSendableContent || !canSend || isBusy}
                  aria-label={isBusy ? "Working" : "Send message"}
                >
                  {isBusy ? (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      className="animate-spin"
                      aria-hidden="true"
                    >
                      <circle
                        cx="7"
                        cy="7"
                        r="5.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeDasharray="20 12"
                      />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path
                        d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
