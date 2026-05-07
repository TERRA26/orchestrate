import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ProviderKind,
  ProviderMentionReference,
  ProviderNativeCommandDescriptor,
  ServerProviderModel,
  ThreadId,
} from "@orchestrate/contracts";
import { useQuery } from "@tanstack/react-query";

import { cn } from "~/lib/utils";
import type { ProviderOptions } from "~/providerModelOptions";
import { Separator } from "~/components/ui/separator";
import { BenchmarksPicker } from "~/components/benchmarks/BenchmarksPicker";
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
import type { OrchestratorStatus } from "./useOrchestratorEngine";
import { AgentStatePill } from "./OrchestratorAgentStatePill";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface OrchestratorComposerProps {
  input: string;
  canSend: boolean;
  isBusy: boolean;
  agentState: OrchestratorStatus;
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
  plugin: import("@orchestrate/contracts").ProviderPluginDescriptor;
  mention: ProviderMentionReference;
};

const EMPTY_PLUGINS: ComposerPluginSuggestion[] = [];
const EMPTY_NATIVE_COMMANDS: ProviderNativeCommandDescriptor[] = [];
const EMPTY_SKILLS: import("@orchestrate/contracts").ProviderSkillDescriptor[] = [];
const EMPTY_TERMINAL_CONTEXTS: never[] = [];

// Rotating placeholder hints — give the user concrete starting prompts so the
// composer doesn't feel like a blank wall on first paint. Cycles every ~6s.
const COMPOSER_PLACEHOLDER_HINTS = [
  "Ask anything, @tag plugins, or use / for commands",
  "Build a small SaaS dashboard with auth and billing",
  "Find every TODO in src/ and group by file",
  "Refactor this module to remove the legacy adapter",
  "Plan the migration to the new event store",
] as const;
const COMPOSER_PLACEHOLDER_ROTATION_MS = 6000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OrchestratorComposer({
  input,
  canSend,
  isBusy,
  agentState,
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

  // Focus the composer when the orchestrator panel mounts so the user can
  // start typing immediately without an extra click. Skip refocusing while
  // the agent is busy — interrupting their typing on a state flip would be
  // worse than the missed initial focus.
  useEffect(() => {
    if (isBusy) return;
    const id = window.requestAnimationFrame(() => editorRef.current?.focusAtEnd());
    return () => window.cancelAnimationFrame(id);
    // Run once on mount; isBusy intentionally not a dep so we don't yank focus
    // every time the run state flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rotate the placeholder hint while the input is empty so first-time users
  // discover what they can ask for. Pause once they start typing.
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  useEffect(() => {
    if (input.trim().length > 0 || isBusy) return;
    const id = window.setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % COMPOSER_PLACEHOLDER_HINTS.length);
    }, COMPOSER_PLACEHOLDER_ROTATION_MS);
    return () => window.clearInterval(id);
  }, [input, isBusy]);
  const composerPlaceholder = isBusy
    ? "Working..."
    : (COMPOSER_PLACEHOLDER_HINTS[placeholderIndex] ?? COMPOSER_PLACEHOLDER_HINTS[0]);

  // Listen for the empty-state suggestion buttons. They emit a window event
  // (decoupled from the messages component) carrying the prompt text — we
  // insert it into the composer and focus so the user can review/edit before
  // sending. Wire this here so the messages tree can stay memo-pure.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string }>).detail;
      if (!detail || typeof detail.prompt !== "string") return;
      onInputChange(detail.prompt);
      requestAnimationFrame(() => editorRef.current?.focusAtEnd());
    };
    window.addEventListener("orchestrate:insert-prompt", handler);
    return () => window.removeEventListener("orchestrate:insert-prompt", handler);
  }, [onInputChange]);

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
      query: isSlashTrigger ? (composerTrigger?.query ?? "") : "",
      enabled: isSlashTrigger && supportsNativeSlashCommandDiscovery(capabilitiesQuery.data),
    }),
  );
  const providerSkillsQuery = useQuery(
    providerSkillsQueryOptions({
      provider: selectedProvider,
      cwd: null,
      query: composerTrigger?.query ?? "",
      enabled: true,
    }),
  );
  const providerPluginsQuery = useQuery(
    providerPluginsQueryOptions({
      provider: selectedProvider,
      cwd: null,
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
      if (key === "Enter") {
        // Enter (no modifier) → send.
        // Cmd/Ctrl+Enter → send too (the explicit "force send" power-user variant).
        // Shift+Enter → newline (let Lexical handle it).
        // Alt+Enter → newline (less common but matches editor convention).
        if (event.shiftKey || event.altKey) {
          return false;
        }
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
    <div className="px-3 pb-1 pt-3">
      <form onSubmit={handleSubmit} className="w-full min-w-0">
        <div
          ref={composerRef}
          className={cn(
            "group relative transition-colors duration-200",
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
              "rounded-[10px] border bg-card/60 backdrop-blur-sm transition-all duration-200 focus-within:border-foreground/30 focus-within:bg-card/80 focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--foreground)_6%,transparent)]",
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
                placeholder={composerPlaceholder}
                disabled={isBusy}
              />
            </div>

            {/* Bottom toolbar */}
            <div className="flex items-end justify-between gap-1.5 px-3 pb-2.5">
              <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <AgentStatePill status={agentState} />
                <Separator orientation="vertical" className="mx-0.5 h-3 shrink-0 bg-border/40" />
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
                <Separator orientation="vertical" className="mx-0.5 h-3 shrink-0 bg-border/40" />
                <TraitsPicker
                  provider={selectedProvider}
                  threadId={"orchestrator" as unknown as ThreadId}
                  models={selectedProviderModels}
                  model={selectedModel}
                  prompt={input}
                  modelOptions={composerModelOptions?.[selectedProvider]}
                  onPromptChange={onPromptChangeFromTraits}
                />
                <Separator orientation="vertical" className="mx-0.5 h-3 shrink-0 bg-border/40" />
                <BenchmarksPicker
                  disabled={isBusy}
                  onInsertPrompt={(prompt) => {
                    const next = input.trim().length > 0 ? `${input}\n\n${prompt}` : prompt;
                    onInputChange(next);
                    requestAnimationFrame(() => {
                      editorRef.current?.focusAtEnd();
                    });
                  }}
                />
              </div>

              {/* Inline shortcut hint — appears once the user has typed real
                  content so first-time users learn the keystroke without
                  cluttering the empty-state composer. */}
              {hasSendableContent && !isBusy ? (
                <span
                  aria-hidden
                  className="hidden shrink-0 items-center gap-1 pr-1 text-[9.5px] text-muted-foreground/60 sm:inline-flex"
                >
                  <kbd className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[8.5px] tracking-tight text-muted-foreground/70">
                    ⌘↵
                  </kbd>
                  <span className="opacity-70">to send</span>
                </span>
              ) : null}

              {/* Send button — distinct visual states for disabled (no input),
                  ready-to-send (sendable content + idle), and busy (in-flight). */}
              <button
                type="submit"
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-md transition-all duration-150",
                  isBusy
                    ? "cursor-progress bg-foreground/30 text-background"
                    : !hasSendableContent || !canSend
                      ? "cursor-not-allowed bg-foreground/15 text-background/60"
                      : "bg-foreground text-background shadow-[0_2px_8px_color-mix(in_srgb,var(--foreground)_25%,transparent)] hover:scale-105 hover:bg-foreground/90 active:scale-95",
                )}
                disabled={!hasSendableContent || !canSend || isBusy}
                aria-label={isBusy ? "Working — send disabled" : "Send message (⌘↵)"}
                title={
                  isBusy
                    ? "Agent is working — send disabled"
                    : !hasSendableContent
                      ? "Type a message"
                      : "Send message (⌘↵)"
                }
              >
                {isBusy ? (
                  <svg
                    width="12"
                    height="12"
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
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
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
      </form>
    </div>
  );
}
