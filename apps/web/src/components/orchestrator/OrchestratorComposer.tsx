import { useCallback, useRef } from "react";
import { ArrowUpIcon } from "lucide-react";
import type { ProviderKind, ServerProviderModel, ThreadId } from "@t3tools/contracts";

import { cn } from "~/lib/utils";
import type { ProviderOptions } from "~/providerModelOptions";
import { Button } from "~/components/ui/button";
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
  composerProviderState: { composerSurfaceClassName?: string; modelPickerIconClassName?: string };
  providers: ReadonlyArray<unknown>;
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
  providers,
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

  return (
    <div className="shrink-0 border-t border-border/30 px-3 pb-3 pt-2 dark:border-white/[0.03]">
      <form onSubmit={handleSubmit} className="w-full min-w-0">
        <div
          className={cn(
            "rounded-md border bg-card transition-colors duration-200 focus-within:border-neutral-500/15",
            isBusy ? "border-border/40 opacity-60" : "border-border/60",
            composerProviderState.composerSurfaceClassName,
          )}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!canSend || isBusy}
            placeholder={
              !canSend
                ? "Select a model to start"
                : isBusy
                  ? "Working..."
                  : "Describe what you want built..."
            }
            rows={1}
            className="block w-full resize-none bg-transparent px-3.5 pt-3 pb-1.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            style={
              {
                minHeight: "3.5rem",
                maxHeight: "200px",
                fieldSizing: "content",
              } as React.CSSProperties
            }
          />
          <div className="flex min-w-0 flex-nowrap items-center justify-between gap-2 overflow-hidden px-3 pb-2.5">
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <ProviderModelPicker
                compact
                provider={selectedProvider}
                model={selectedModel}
                lockedProvider={null}
                modelOptionsByProvider={modelOptionsByProvider}
                disabled={isBusy || providers.length === 0}
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
            <Button
              size="icon"
              variant="ghost"
              type="submit"
              className={cn(
                "size-7 shrink-0 rounded-full transition-colors",
                input.trim() && !isBusy && canSend
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "text-muted-foreground/40",
              )}
              disabled={!input.trim() || !canSend || isBusy}
            >
              <ArrowUpIcon className="size-3.5" />
              <span className="sr-only">Send</span>
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
