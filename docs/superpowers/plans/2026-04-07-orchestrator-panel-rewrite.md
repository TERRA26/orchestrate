# OrchestratorPanel Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the 2300-line OrchestratorPanel monolith into focused modules with a working input system, preserving all orchestrator logic (router, delegation, review cycles, browser validation).

**Architecture:** Extract async orchestration workflows into a `useOrchestratorEngine` hook. Split UI into OrchestratorHeader, OrchestratorMessages, and OrchestratorComposer components. The engine hook owns all state transitions and exposes a simple `send(text)` API. UI components are pure renderers.

**Tech Stack:** React, TypeScript, Zustand, TanStack Router/Query, Lucide icons, Tailwind CSS

**Source file:** `apps/web/src/components/OrchestratorPanel.tsx` (current 2300-line monolith)
**Logic file:** `apps/web/src/components/OrchestratorPanel.logic.ts` (untouched — all parsers, prompts, builders)
**State store:** `apps/web/src/orchestratorStateStore.ts` (untouched)

---

## File Structure

| File                                                            | Responsibility                                                                                                                                                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/components/orchestrator/useOrchestratorEngine.ts` | All async orchestration: send, router, delegation, review, browser validation, thread management. Exposes `{ send, status, statusDetail, messages, requirementsChecklist, isBusy, canSend, ... }` |
| `apps/web/src/components/orchestrator/OrchestratorComposer.tsx` | Textarea input + model picker + send button. Calls `engine.send(text)` on Enter/click                                                                                                             |
| `apps/web/src/components/orchestrator/OrchestratorMessages.tsx` | ScrollArea with message list, checklist card, empty state, inline browser preview                                                                                                                 |
| `apps/web/src/components/orchestrator/OrchestratorHeader.tsx`   | Title, browser preview toggle, new chat button, agent status                                                                                                                                      |
| `apps/web/src/components/OrchestratorPanel.tsx`                 | Thin shell: resize, width, composes Header + Messages + Composer. ~100 lines                                                                                                                      |

---

### Task 1: Create the engine hook

**Files:**

- Create: `apps/web/src/components/orchestrator/useOrchestratorEngine.ts`

This is the core — all 1400 lines of async orchestration logic extracted from OrchestratorPanel.tsx into a single hook.

- [ ] **Step 1: Create the orchestrator directory**

```bash
mkdir -p apps/web/src/components/orchestrator
```

- [ ] **Step 2: Write the engine hook**

Create `apps/web/src/components/orchestrator/useOrchestratorEngine.ts`. This hook:

1. Reads the current OrchestratorPanel.tsx (lines 357-2058)
2. Extracts ALL hook calls, state, callbacks, and effects from the OrchestratorPanel function body EXCEPT the JSX return and UI-only handlers (resize, scroll)
3. Returns an interface that the UI components consume

The hook must include:

- All store selectors (`useOrchestratorStateStore`, `useEmbeddedBrowserStateStore`, `useStore`)
- `serverConfigQuery` and `providers` derivation
- Model selection state (`selectedProvider`, `selectedModel`, `selectedModelSelection`, etc.)
- Thread resolution (`currentThreadId`, `managedThread`, `agentPhase`)
- Status tracking (`status`, `statusDetail`, `isBusy`)
- ALL helper functions: `addMessage`, `sendToThread`, `addProgressMessage`, `callOrchestratorLLM`, `createThread`
- ALL async workflows: `collectReviewArtifacts`, `runBrowserValidation`, `runDirectBrowserValidation`, `reviewAgentOutput`, `handleSend`
- The review-trigger `useEffect` (the one that monitors `agentPhase` and calls `reviewAgentOutput`)
- Browser session state (`threadBrowserSession`, `isThreadBrowserSessionVisible`)
- `handleStartNewOrchestratorChat`, `handleToggleThreadBrowserPreviewVisibility`

**Return type:**

```typescript
interface OrchestratorEngine {
  // State
  currentThreadId: ThreadId;
  messages: OrchestratorMessage[];
  input: string;
  status: OrchestratorStatus;
  statusDetail: string | null;
  isBusy: boolean;
  canSend: boolean;
  requirementsChecklist: OrchestratorChecklistItem[];
  activeRun: ActiveOrchestratorRun | null;

  // Managed thread
  managedThread: Thread | undefined;
  agentPhase: ReturnType<typeof derivePhase>;
  latestActivity: { summary: string } | null;

  // Browser
  threadBrowserSession: any;
  isThreadBrowserSessionVisible: boolean;

  // Model
  selectedProvider: ProviderKind;
  selectedModel: string;
  selectedProviderModels: Array<{ slug: string; name: string }>;
  modelOptionsByProvider: Record<ProviderKind, ReadonlyArray<{ slug: string; name: string }>>;
  composerModelOptions: Record<string, any> | null;
  composerProviderState: ReturnType<typeof getComposerProviderState>;
  providers: ReadonlyArray<ServerProvider>;

  // Actions
  send: (text: string) => Promise<void>;
  setInput: (text: string) => void;
  handleModelChange: (provider: ProviderKind, model: string) => void;
  handleStartNewChat: () => Promise<void>;
  handleToggleBrowserPreview: () => void;
  handlePromptChangeFromTraits: (prompt: string) => void;

  // Refs
  scrollRef: React.RefObject<HTMLDivElement>;
}
```

The `send` function is `handleSend` renamed. The `setInput` function calls `setOrchestratorPrompt(currentThreadId, text)`.

Read the FULL original OrchestratorPanel.tsx to extract every piece of logic. Do NOT paraphrase — copy the exact logic. The only change is wrapping it in a hook that returns the interface above.

- [ ] **Step 3: Verify the file compiles**

```bash
cd apps/web && bun run typecheck 2>&1 | grep "useOrchestratorEngine" | head -10
```

Fix any type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/orchestrator/useOrchestratorEngine.ts
git commit -m "refactor: extract orchestrator engine hook from panel monolith"
```

---

### Task 2: Create OrchestratorComposer

**Files:**

- Create: `apps/web/src/components/orchestrator/OrchestratorComposer.tsx`

A focused input component. Takes engine props and renders a textarea with model picker and send button.

- [ ] **Step 1: Write the composer component**

Create `apps/web/src/components/orchestrator/OrchestratorComposer.tsx`:

```tsx
import { useCallback, useRef, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUpIcon } from "lucide-react";
import type { ProviderKind, ThreadId } from "@t3tools/contracts";

import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { ProviderModelPicker } from "~/components/chat/ProviderModelPicker";
import { TraitsPicker } from "~/components/chat/TraitsPicker";

interface OrchestratorComposerProps {
  input: string;
  canSend: boolean;
  isBusy: boolean;
  selectedProvider: ProviderKind;
  selectedModel: string;
  selectedProviderModels: Array<{ slug: string; name: string }>;
  modelOptionsByProvider: Record<ProviderKind, ReadonlyArray<{ slug: string; name: string }>>;
  composerModelOptions: Record<string, any> | null;
  composerProviderState: { composerSurfaceClassName?: string; modelPickerIconClassName?: string };
  providers: ReadonlyArray<unknown>;
  onInputChange: (text: string) => void;
  onSend: (text: string) => Promise<void>;
  onModelChange: (provider: ProviderKind, model: string) => void;
  onPromptChangeFromTraits: (prompt: string) => void;
}

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
    (event: FormEvent) => {
      event.preventDefault();
      const text = input.trim();
      if (text && canSend && !isBusy) {
        void onSend(text);
      }
    },
    [input, canSend, isBusy, onSend],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const text = input.trim();
        if (text && canSend && !isBusy) {
          void onSend(text);
        }
      }
    },
    [input, canSend, isBusy, onSend],
  );

  const hasInput = input.trim().length > 0;

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
                  ? { activeProviderIconClassName: composerProviderState.modelPickerIconClassName }
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
                hasInput && !isBusy && canSend
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "text-muted-foreground/40",
              )}
              disabled={!hasInput || !canSend || isBusy}
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/orchestrator/OrchestratorComposer.tsx
git commit -m "feat: add OrchestratorComposer component"
```

---

### Task 3: Create OrchestratorMessages

**Files:**

- Create: `apps/web/src/components/orchestrator/OrchestratorMessages.tsx`

Renders the message list, quality gate checklist, inline browser preview, and empty state.

- [ ] **Step 1: Write the messages component**

Extract `MessageBubble`, `RequirementsChecklistCard`, and the messages ScrollArea from the current OrchestratorPanel.tsx (lines 213-354 for sub-components, lines 2204-2230 for the ScrollArea).

The component receives messages, checklist items, browser session state, and a scroll ref. It renders them. No logic.

Read the original OrchestratorPanel.tsx to get the exact MessageBubble, RequirementsChecklistCard, and InlineEmbeddedBrowserCard rendering code. Copy it exactly (with the current styling updates already applied — secondary bg for user, inline for assistant).

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/orchestrator/OrchestratorMessages.tsx
git commit -m "feat: add OrchestratorMessages component"
```

---

### Task 4: Create OrchestratorHeader

**Files:**

- Create: `apps/web/src/components/orchestrator/OrchestratorHeader.tsx`

Header bar with orchestrator title, browser preview toggle, new chat button, and agent context bar.

- [ ] **Step 1: Write the header component**

Extract `AgentStatusBadge` and `OrchestratorStatusBar` from the current OrchestratorPanel.tsx (lines 176-287), plus the header JSX (lines 2149-2217).

The component receives: managedThread, agentPhase, latestActivity, status, statusDetail, threadBrowserSession, isThreadBrowserSessionVisible, isBusy, and action callbacks (onToggleBrowserPreview, onStartNewChat).

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/orchestrator/OrchestratorHeader.tsx
git commit -m "feat: add OrchestratorHeader component"
```

---

### Task 5: Rewrite OrchestratorPanel as thin shell

**Files:**

- Modify: `apps/web/src/components/OrchestratorPanel.tsx` (replace 2300 lines with ~100)

- [ ] **Step 1: Rewrite the panel**

Replace the entire OrchestratorPanel.tsx with a thin composition shell that:

1. Manages resize state (width, handleResize, persistWidth) — ~30 lines
2. Calls `useOrchestratorEngine()` to get all state and actions
3. Renders: `<OrchestratorHeader>`, `<OrchestratorMessages>`, `<OrchestratorComposer>`
4. Wraps in a React error boundary so render errors don't kill the panel silently

The file should be approximately 100-120 lines. ALL logic lives in the engine hook. ALL sub-components are imported.

```tsx
import { useCallback, useState } from "react";
import { Schema } from "effect";

import { getLocalStorageItem, setLocalStorageItem } from "~/hooks/useLocalStorage";
import { ResizeEdgeHandle } from "./ResizeEdgeHandle";
import { useOrchestratorEngine } from "./orchestrator/useOrchestratorEngine";
import { OrchestratorHeader } from "./orchestrator/OrchestratorHeader";
import { OrchestratorMessages } from "./orchestrator/OrchestratorMessages";
import { OrchestratorComposer } from "./orchestrator/OrchestratorComposer";

const ORCHESTRATOR_WIDTH_STORAGE_KEY = "orchestrator_panel_width";
const ORCHESTRATOR_DEFAULT_WIDTH = 380;
const ORCHESTRATOR_MIN_WIDTH = 280;
const ORCHESTRATOR_MAX_WIDTH = 600;

export function OrchestratorPanel() {
  const [width, setWidth] = useState(() => {
    const stored = getLocalStorageItem(ORCHESTRATOR_WIDTH_STORAGE_KEY, Schema.Finite);
    return stored ?? ORCHESTRATOR_DEFAULT_WIDTH;
  });

  const persistWidth = useCallback((w: number) => {
    setLocalStorageItem(ORCHESTRATOR_WIDTH_STORAGE_KEY, w, Schema.Finite);
  }, []);

  const handleResize = useCallback(
    (delta: number) => {
      setWidth((prev) => {
        const next = Math.max(
          ORCHESTRATOR_MIN_WIDTH,
          Math.min(ORCHESTRATOR_MAX_WIDTH, prev + delta),
        );
        persistWidth(next);
        return next;
      });
    },
    [persistWidth],
  );

  const engine = useOrchestratorEngine();

  return (
    <OrchestratorPanelErrorBoundary>
      <div
        className="relative flex h-dvh flex-col border-r border-border/30 bg-background/80 text-foreground backdrop-blur-xl backdrop-saturate-150 dark:border-white/[0.03] dark:bg-background/80"
        style={{ width, minWidth: ORCHESTRATOR_MIN_WIDTH, maxWidth: ORCHESTRATOR_MAX_WIDTH }}
      >
        <ResizeEdgeHandle label="Resize orchestrator panel" onResize={handleResize} />

        <OrchestratorHeader
          managedThread={engine.managedThread}
          agentPhase={engine.agentPhase}
          latestActivity={engine.latestActivity}
          status={engine.status}
          statusDetail={engine.statusDetail}
          activeRun={engine.activeRun}
          threadBrowserSession={engine.threadBrowserSession}
          isThreadBrowserSessionVisible={engine.isThreadBrowserSessionVisible}
          isBusy={engine.isBusy}
          onToggleBrowserPreview={engine.handleToggleBrowserPreview}
          onStartNewChat={engine.handleStartNewChat}
        />

        <OrchestratorMessages
          messages={engine.messages}
          requirementsChecklist={engine.requirementsChecklist}
          threadBrowserSession={engine.threadBrowserSession}
          isThreadBrowserSessionVisible={engine.isThreadBrowserSessionVisible}
          scrollRef={engine.scrollRef}
        />

        <OrchestratorComposer
          input={engine.input}
          canSend={engine.canSend}
          isBusy={engine.isBusy}
          selectedProvider={engine.selectedProvider}
          selectedModel={engine.selectedModel}
          selectedProviderModels={engine.selectedProviderModels}
          modelOptionsByProvider={engine.modelOptionsByProvider}
          composerModelOptions={engine.composerModelOptions}
          composerProviderState={engine.composerProviderState}
          providers={engine.providers}
          onInputChange={engine.setInput}
          onSend={engine.send}
          onModelChange={engine.handleModelChange}
          onPromptChangeFromTraits={engine.handlePromptChangeFromTraits}
        />
      </div>
    </OrchestratorPanelErrorBoundary>
  );
}

class OrchestratorPanelErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-dvh w-[380px] flex-col items-center justify-center gap-3 border-r border-border/30 bg-background/80 p-4 text-center">
          <p className="text-sm font-medium text-destructive">Orchestrator panel error</p>
          <p className="text-xs text-muted-foreground">{this.state.error.message}</p>
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
            onClick={() => this.setState({ error: null })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 2: Verify everything compiles**

```bash
cd apps/web && bun run typecheck 2>&1 | grep "error TS" | head -20
```

Fix all type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/OrchestratorPanel.tsx
git commit -m "refactor: rewrite OrchestratorPanel as thin composition shell"
```

---

### Task 6: Validate and fix

- [ ] **Step 1: Run formatter**

```bash
bun fmt
```

- [ ] **Step 2: Run linter**

```bash
bun lint
```

- [ ] **Step 3: Run typecheck**

```bash
cd packages/contracts && bun run typecheck
cd ../shared && bun run typecheck
cd ../../apps/web && bun run typecheck
cd ../server && bun run typecheck
```

Fix all errors iteratively.

- [ ] **Step 4: Run tests**

```bash
bun run test
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "fix: OrchestratorPanel rewrite — working input, error boundaries, decomposed modules"
```
