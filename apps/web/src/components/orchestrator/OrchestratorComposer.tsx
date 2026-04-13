import { useCallback, useMemo, useRef, useState } from "react";
import type {
  ProviderKind,
  ProviderMentionReference,
  ProviderNativeCommandDescriptor,
  ServerProviderModel,
  ThreadId,
} from "@t3tools/contracts";
import { useQuery } from "@tanstack/react-query";

import { cn } from "~/lib/utils";
import type { ProviderOptions } from "~/providerModelOptions";
import { Separator } from "~/components/ui/separator";
import { ProviderModelPicker } from "~/components/chat/ProviderModelPicker";
import { TraitsPicker } from "~/components/chat/TraitsPicker";
import {
  ComposerCommandMenu,
  type ComposerCommandItem,
} from "~/components/chat/ComposerCommandMenu";
import {
  ComposerPromptEditor,
  type ComposerPromptEditorHandle,
} from "~/components/ComposerPromptEditor";
import { useComposerCommandMenuItems } from "~/hooks/useComposerCommandMenuItems";
import {
  type ComposerTrigger,
  type ComposerTriggerKind,
  detectComposerTrigger,
  stripComposerTriggerText,
} from "~/composer-logic";
import {
  providerPluginsQueryOptions,
  providerSkillsQueryOptions,
  providerCommandsQueryOptions,
  supportsNativeSlashCommandDiscovery,
  providerComposerCapabilitiesQueryOptions,
} from "~/lib/providerDiscoveryReactQuery";
import { useTheme } from "~/hooks/useTheme";

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
// Constants
// ---------------------------------------------------------------------------

type ComposerPluginSuggestion = {
  plugin: import("@t3tools/contracts").ProviderPluginDescriptor;
  mention: ProviderMentionReference;
};

const EMPTY_PLUGINS: ComposerPluginSuggestion[] = [];
const EMPTY_NATIVE_COMMANDS: ProviderNativeCommandDescriptor[] = [];
const EMPTY_SKILLS: import("@t3tools/contracts").ProviderSkillDescriptor[] = [];
const EMPTY_TERMINAL_CONTEXTS: never[] = [];

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
  const composerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ComposerPromptEditorHandle>(null);
  const { resolvedTheme } = useTheme();

  // ── Editor state ───────────────────────────────────────────────────────
  const [composerCursor, setComposerCursor] = useState(0);

  // ── Trigger detection ──────────────────────────────────────────────────
  const [composerTrigger, setComposerTrigger] = useState<ComposerTrigger | null>(null);
  const [activeMenuItemId, setActiveMenuItemId] = useState<string | null>(null);

  const composerTriggerKind: ComposerTriggerKind | null = composerTrigger?.kind ?? null;

  // ── Discovery queries (same as main chat) ──────────────────────────────
  const capabilitiesQuery = useQuery(providerComposerCapabilitiesQueryOptions(selectedProvider));
  const isSlashTrigger =
    composerTriggerKind === "slash-command" || composerTriggerKind === "slash-model";

  const providerCommandsQuery = useQuery(
    providerCommandsQueryOptions({
      provider: selectedProvider,
      cwd: null,
      threadId: undefined,
      query: isSlashTrigger ? (composerTrigger?.query ?? "") : "",
      enabled: isSlashTrigger && supportsNativeSlashCommandDiscovery(capabilitiesQuery.data),
    }),
  );
  const providerSkillsQuery = useQuery(
    providerSkillsQueryOptions({
      provider: selectedProvider,
      cwd: null,
      threadId: undefined,
      query: composerTrigger?.query ?? "",
      enabled: true,
    }),
  );
  const providerPluginsQuery = useQuery(
    providerPluginsQueryOptions({
      provider: selectedProvider,
      cwd: null,
      threadId: undefined,
      enabled: true,
    }),
  );

  const providerPlugins = useMemo<ComposerPluginSuggestion[]>(
    () =>
      providerPluginsQuery.data?.marketplaces.flatMap((m) =>
        m.plugins.map((plugin) => ({
          plugin,
          mention: {
            name: plugin.name,
            path: `plugin://${plugin.name}@${m.name}`,
          } satisfies ProviderMentionReference,
        })),
      ) ?? EMPTY_PLUGINS,
    [providerPluginsQuery.data],
  );
  const providerNativeCommands = providerCommandsQuery.data?.commands ?? EMPTY_NATIVE_COMMANDS;
  const providerSkills = providerSkillsQuery.data?.skills ?? EMPTY_SKILLS;

  // ── Build menu items (same hook as main chat) ──────────────────────────
  const composerMenuItems = useComposerCommandMenuItems({
    composerTrigger,
    provider: selectedProvider,
    providerPlugins,
    providerNativeCommands,
    providerSkills,
    workspaceEntries: [],
    searchableModelOptions: [],
    supportsFastSlashCommand: selectedProvider === "codex",
    canOfferReviewCommand: selectedProvider === "codex",
    canOfferForkCommand: selectedProvider === "codex",
  });

  const composerMenuOpen = composerMenuItems.length > 0 && composerTrigger !== null;

  // ── Menu item selection ────────────────────────────────────────────────
  const handleSelectMenuItem = useCallback(
    (item: ComposerCommandItem) => {
      if (!composerTrigger) return;
      const stripped = stripComposerTriggerText(input, composerTrigger);
      const insertAt = composerTrigger.rangeStart;

      let insertText: string;
      if (item.type === "slash-command" || item.type === "provider-native-command") {
        insertText = `/${item.command} `;
      } else if (item.type === "skill") {
        // `$skillname ` gets rendered as an inline chip by Lexical.
        insertText = `$${item.skill.name} `;
      } else if (item.type === "plugin") {
        // `@pluginname ` gets rendered as an inline mention chip by Lexical.
        insertText = `@${item.mention.path} `;
      } else {
        insertText = `${item.label} `;
      }

      const next = `${stripped.slice(0, insertAt)}${insertText}${stripped.slice(insertAt)}`;
      onInputChange(next);
      setComposerTrigger(null);
      setActiveMenuItemId(null);
      requestAnimationFrame(() => {
        editorRef.current?.focusAt(insertAt + insertText.length);
      });
    },
    [composerTrigger, input, onInputChange],
  );

  // ── Keyboard navigation ────────────────────────────────────────────────
  const handleCommandKey = useCallback(
    (key: "ArrowDown" | "ArrowUp" | "Enter" | "Tab", event: KeyboardEvent): boolean => {
      if (composerMenuOpen) {
        event.preventDefault();
        if (key === "ArrowDown") {
          const idx = composerMenuItems.findIndex((i) => i.id === activeMenuItemId);
          const next = (idx + 1) % composerMenuItems.length;
          setActiveMenuItemId(composerMenuItems[next]?.id ?? null);
          return true;
        }
        if (key === "ArrowUp") {
          const idx = composerMenuItems.findIndex((i) => i.id === activeMenuItemId);
          const next = (idx - 1 + composerMenuItems.length) % composerMenuItems.length;
          setActiveMenuItemId(composerMenuItems[next]?.id ?? null);
          return true;
        }
        if (key === "Enter" || key === "Tab") {
          const active =
            composerMenuItems.find((i) => i.id === activeMenuItemId) ?? composerMenuItems[0];
          if (active) handleSelectMenuItem(active);
          return true;
        }
      }
      if (key === "Enter" && !event.shiftKey) {
        const trimmed = input.trim();
        if (!trimmed || !canSend || isBusy) {
          return true;
        }
        void onSend(trimmed);
        return true;
      }
      return false;
    },
    [
      activeMenuItemId,
      canSend,
      composerMenuItems,
      composerMenuOpen,
      handleSelectMenuItem,
      input,
      isBusy,
      onSend,
    ],
  );

  // ── Editor change handler ──────────────────────────────────────────────
  const handleEditorChange = useCallback(
    (
      nextValue: string,
      _nextCursor: number,
      expandedCursor: number,
      _cursorAdjacentToMention: boolean,
      _terminalContextIds: string[],
    ) => {
      onInputChange(nextValue);
      setComposerCursor(expandedCursor);
      setComposerTrigger(detectComposerTrigger(nextValue, expandedCursor));
    },
    [onInputChange],
  );

  // ── Submit ─────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || !canSend || isBusy) return;
      void onSend(trimmed);
    },
    [input, canSend, isBusy, onSend],
  );

  const hasSendableContent = input.trim().length > 0;

  return (
    <div className={cn("px-3 pt-4 sm:px-5 sm:pt-4", "pb-2.5 sm:pb-3")}>
      <form onSubmit={handleSubmit} className="w-full min-w-0">
        <div
          ref={composerRef}
          className={cn(
            "group relative rounded-2xl p-px transition-colors duration-200",
            composerProviderState.composerFrameClassName,
          )}
        >
          {/* Command menu — same component as main chat */}
          {composerMenuOpen && (
            <div className="absolute bottom-full left-0 right-0 z-50 mb-1.5 px-1">
              <ComposerCommandMenu
                items={composerMenuItems}
                resolvedTheme={resolvedTheme === "dark" ? "dark" : "light"}
                isLoading={providerSkillsQuery.isLoading || providerPluginsQuery.isLoading}
                triggerKind={composerTriggerKind}
                activeItemId={activeMenuItemId}
                onHighlightedItemChange={setActiveMenuItemId}
                onSelect={handleSelectMenuItem}
              />
            </div>
          )}
          <div
            className={cn(
              "rounded-md border bg-card transition-colors duration-200 focus-within:border-neutral-500/15",
              isBusy ? "border-border/40 opacity-60" : "border-border/60",
              composerProviderState.composerSurfaceClassName,
            )}
          >
            {/* Lexical editor — same component as main chat */}
            <div className="relative px-4 pb-1 pt-3.5">
              <ComposerPromptEditor
                ref={editorRef}
                value={input}
                cursor={composerCursor}
                terminalContexts={EMPTY_TERMINAL_CONTEXTS}
                onRemoveTerminalContext={() => {}}
                onChange={handleEditorChange}
                onCommandKeyDown={handleCommandKey}
                onPaste={() => {}}
                placeholder={
                  isBusy ? "Working..." : "Ask anything, @tag plugins, or use / for commands"
                }
                disabled={isBusy}
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
              </div>

              {/* Send button */}
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
