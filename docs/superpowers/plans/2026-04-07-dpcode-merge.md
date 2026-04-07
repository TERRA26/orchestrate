# dpcode → orchestrate Merge Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge 4 dpcode commits (slash commands, fork/review flows, plugin library, terminal cleanup) into the orchestrate fork while preserving all orchestrator-specific code (OrchestratorPanel, EmbeddedBrowserPane, browser automation).

**Architecture:** Replace-and-re-integrate strategy. Most files can be copied directly from dpcode. A small set of 5 files contain orchestrator-specific code that must be surgically re-added after replacement. Migrations must be renumbered to avoid conflicts with orchestrate's existing 019-021.

**Tech Stack:** TypeScript, React, Effect, TanStack Router, Zustand, Vitest, Bun

**Source:** `/Users/christophe/Documents/Orchestrate/dpcode` (commits `780b7f5` through `bbdacdd`)
**Target:** `/Users/christophe/Documents/Orchestrate/orchestrate`

---

## File Map

### New files (copy from dpcode)

- `apps/web/src/composerSlashCommands.ts` (286 lines) — Slash command definitions
- `apps/web/src/composerSlashCommands.test.ts` — Tests
- `apps/web/src/hooks/useComposerSlashCommands.ts` (637 lines) — Slash command execution hook
- `apps/web/src/hooks/useComposerCommandMenuItems.ts` (177 lines) — Command menu items hook
- `apps/web/src/components/PluginLibrary.tsx` (620 lines) — Plugin browser UI
- `apps/web/src/components/chat/ComposerSlashStatusDialog.tsx` (187 lines) — Status dialog
- `apps/web/src/components/chat/RateLimitBanner.tsx` (72 lines) — Rate limit banner
- `apps/web/src/lib/threadEnvironment.ts` (65 lines) — Fork thread environment helpers
- `apps/web/src/lib/threadEnvironment.test.ts` — Tests
- `apps/web/src/lib/providerDiscovery.ts` (75 lines) — Provider discovery helpers
- `apps/web/src/providerModelOptions.ts` — Model options
- `apps/web/src/routes/_chat.plugins.tsx` — Plugin library route
- `apps/web/src/browserStateStore.test.ts` — Browser state tests
- `apps/web/public/dpcode.png` — Asset
- `packages/shared/src/terminalThreads.ts` (5 lines) — Terminal thread title helpers
- `packages/shared/src/threadEnvironment.ts` — Thread environment shared logic
- `packages/shared/src/threadEnvironment.test.ts` — Tests
- `apps/server/src/persistence/Migrations/022_ProjectionThreadsEnvMode.ts` — Migration (renumbered from dpcode's 019)
- `apps/server/src/persistence/Migrations/023_ProjectionThreadsForkSource.ts` — Migration (renumbered from dpcode's 020)

### Replace files (no orchestrator code — safe to overwrite)

- `apps/web/src/components/ChatView.tsx` — dpcode adds slash commands, fork/review UI
- `apps/web/src/components/ChatView.logic.ts` — Extracted logic helpers
- `apps/web/src/components/ChatView.logic.test.ts` — Tests
- `apps/web/src/components/ChatView.browser.tsx` — Browser-specific chat logic
- `apps/web/src/components/BranchToolbar.tsx` — Branch toolbar
- `apps/web/src/components/BranchToolbar.logic.ts` — Branch toolbar logic
- `apps/web/src/components/BranchToolbarBranchSelector.tsx` — Branch selector
- `apps/web/src/components/ComposerPromptEditor.tsx` — Composer editor
- `apps/web/src/components/DiffPanel.tsx` — Diff panel
- `apps/web/src/components/ThreadTerminalDrawer.tsx` — Terminal drawer
- `apps/web/src/components/KeybindingsToast.browser.tsx` — Keybindings toast
- `apps/web/src/components/chat/ChatHeader.tsx` — Chat header
- `apps/web/src/components/chat/ComposerCommandMenu.tsx` — Command menu
- `apps/web/src/components/chat/ContextWindowMeter.tsx` — Context window meter
- `apps/web/src/components/chat/MessagesTimeline.tsx` — Messages timeline
- `apps/web/src/components/chat/MessagesTimeline.test.tsx` — Tests
- `apps/web/src/components/chat/ProviderModelPicker.tsx` — Model picker
- `apps/web/src/components/chat/TraitsPicker.tsx` — Traits picker
- `apps/web/src/components/composerInlineChip.ts` — Inline chip
- `apps/web/src/composer-editor-mentions.ts` — Editor mentions
- `apps/web/src/composer-editor-mentions.test.ts` — Tests
- `apps/web/src/composer-logic.ts` — Composer logic
- `apps/web/src/composer-logic.test.ts` — Tests
- `apps/web/src/hooks/useHandleNewThread.ts` — New thread hook
- `apps/web/src/hooks/useThreadHandoff.ts` — Thread handoff hook
- `apps/web/src/lib/contextWindow.ts` — Context window helpers
- `apps/web/src/lib/threadBootstrap.ts` — Thread bootstrap
- `apps/web/src/lib/threadHandoff.ts` — Thread handoff helpers
- `apps/web/src/lib/gitReactQuery.ts` — Git react query
- `apps/web/src/lib/providerDiscoveryReactQuery.ts` — Provider discovery react query
- `apps/web/src/lib/icons.tsx` — Icons
- `apps/web/src/browserStateStore.ts` — Browser state store
- `apps/web/src/store.ts` — Main store
- `apps/web/src/store.test.ts` — Store tests
- `apps/web/src/session-logic.ts` — Session logic
- `apps/web/src/session-logic.test.ts` — Session logic tests
- `apps/web/src/types.ts` — Type definitions
- `apps/web/src/terminalStateStore.ts` — Terminal state store
- `apps/web/src/terminalStateStore.test.ts` — Terminal state tests
- `apps/web/src/keybindings.test.ts` — Keybindings tests
- `apps/web/src/routeTree.gen.ts` — Auto-generated route tree
- `apps/server/src/checkpointing/Utils.ts` — Checkpointing utils
- `apps/server/src/codexAppServerManager.ts` — Codex app server manager
- `apps/server/src/codexAppServerManager.test.ts` — Tests
- `apps/server/src/orchestration/decider.ts` — Decider
- `apps/server/src/orchestration/handoff.ts` — Handoff logic
- `apps/server/src/orchestration/projector.ts` — Projector
- `apps/server/src/orchestration/Layers/ProjectionPipeline.ts` — Projection pipeline
- `apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts` — Snapshot query
- `apps/server/src/orchestration/Layers/ProviderCommandReactor.ts` — Provider command reactor
- `apps/server/src/orchestration/Layers/ProviderCommandReactor.test.ts` — Tests
- `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts` — Runtime ingestion
- `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.test.ts` — Tests
- `apps/server/src/orchestration/Layers/CheckpointReactor.test.ts` — Tests
- `apps/server/src/persistence/Layers/ProjectionRepositories.test.ts` — Tests
- `apps/server/src/persistence/Layers/ProjectionThreads.ts` — Projection threads
- `apps/server/src/persistence/Services/ProjectionThreads.ts` — Projection threads service
- `apps/server/src/provider/Layers/ClaudeAdapter.ts` — Claude adapter
- `apps/server/src/provider/Layers/CodexAdapter.ts` — Codex adapter
- `apps/server/src/provider/Layers/CodexAdapter.test.ts` — Tests
- `apps/server/src/provider/Layers/ProviderService.ts` — Provider service layer
- `apps/server/src/provider/Layers/ProviderDiscoveryService.ts` — Provider discovery layer
- `apps/server/src/provider/Services/ProviderAdapter.ts` — Provider adapter service
- `apps/server/src/provider/Services/ProviderService.ts` — Provider service
- `apps/server/src/provider/Services/ProviderDiscoveryService.ts` — Provider discovery service
- `apps/server/src/terminal/terminalThreadTitle.ts` — Terminal thread title
- `apps/server/src/git/Layers/GitCore.ts` — Git core
- `apps/server/src/git/Layers/GitCore.test.ts` — Git core tests
- `apps/server/src/keybindings.ts` — Server keybindings
- `apps/server/src/main.ts` — Server main
- `apps/server/src/main.test.ts` — Server main tests
- `apps/server/src/wsServer.test.ts` — WS server tests
- `packages/contracts/src/orchestration.ts` — Orchestration contracts
- `packages/contracts/src/orchestration.test.ts` — Tests
- `packages/contracts/src/provider.ts` — Provider contracts
- `packages/contracts/src/providerDiscovery.ts` — Provider discovery contracts
- `packages/contracts/src/ipc.ts` — IPC contracts
- `apps/desktop/src/main.ts` — Desktop main
- Asset files in `apps/desktop/resources/`, `apps/web/public/`, `assets/`

### Replace + re-integrate files (have orchestrator-specific code)

- `apps/web/src/routes/_chat.tsx` — Must re-add OrchestratorPanel + EmbeddedBrowserPane (4 lines)
- `apps/web/src/components/Sidebar.tsx` — Must re-add embeddedBrowserStateStore import (3 lines)
- `apps/web/src/wsNativeApi.ts` — Must re-add browser API + orchestrator API (~95 lines)
- `apps/server/src/wsServer.ts` — Must re-add BrowserAutomation + orchestrator completion (~350 lines)
- `packages/contracts/src/ws.ts` — Must re-add browser + orchestrator WS methods/schemas (~50 lines)

### Do NOT copy from dpcode

- `apps/server/src/persistence/Migrations.ts` — Different numbering; update manually
- `apps/server/src/persistence/Migrations/017_ThreadHandoffMetadata.ts` — Already in orchestrate as 020
- `apps/server/src/persistence/Migrations/018_ProjectionThreadMessageMentions.ts` — Already in orchestrate as 021

---

### Task 1: Create backup branch

**Files:**

- None modified

- [ ] **Step 1: Create a backup branch in orchestrate**

```bash
cd /Users/christophe/Documents/Orchestrate/orchestrate
git checkout -b backup/pre-dpcode-merge-2026-04-07
git checkout -  # return to previous branch
```

- [ ] **Step 2: Verify backup branch exists**

Run: `cd /Users/christophe/Documents/Orchestrate/orchestrate && git branch --list 'backup/*'`
Expected: `backup/pre-dpcode-merge-2026-04-07`

---

### Task 2: Copy all new files from dpcode

**Files:**

- Create: All files listed in "New files" section above

- [ ] **Step 1: Copy new web app files**

```bash
DPCODE=/Users/christophe/Documents/Orchestrate/dpcode
ORCH=/Users/christophe/Documents/Orchestrate/orchestrate

# Slash commands
cp "$DPCODE/apps/web/src/composerSlashCommands.ts" "$ORCH/apps/web/src/composerSlashCommands.ts"
cp "$DPCODE/apps/web/src/composerSlashCommands.test.ts" "$ORCH/apps/web/src/composerSlashCommands.test.ts"

# Hooks
cp "$DPCODE/apps/web/src/hooks/useComposerSlashCommands.ts" "$ORCH/apps/web/src/hooks/useComposerSlashCommands.ts"
cp "$DPCODE/apps/web/src/hooks/useComposerCommandMenuItems.ts" "$ORCH/apps/web/src/hooks/useComposerCommandMenuItems.ts"

# Components
cp "$DPCODE/apps/web/src/components/PluginLibrary.tsx" "$ORCH/apps/web/src/components/PluginLibrary.tsx"
cp "$DPCODE/apps/web/src/components/chat/ComposerSlashStatusDialog.tsx" "$ORCH/apps/web/src/components/chat/ComposerSlashStatusDialog.tsx"
cp "$DPCODE/apps/web/src/components/chat/RateLimitBanner.tsx" "$ORCH/apps/web/src/components/chat/RateLimitBanner.tsx"

# Libs
cp "$DPCODE/apps/web/src/lib/threadEnvironment.ts" "$ORCH/apps/web/src/lib/threadEnvironment.ts"
cp "$DPCODE/apps/web/src/lib/threadEnvironment.test.ts" "$ORCH/apps/web/src/lib/threadEnvironment.test.ts"
cp "$DPCODE/apps/web/src/lib/providerDiscovery.ts" "$ORCH/apps/web/src/lib/providerDiscovery.ts"

# Other web files
cp "$DPCODE/apps/web/src/providerModelOptions.ts" "$ORCH/apps/web/src/providerModelOptions.ts"
cp "$DPCODE/apps/web/src/routes/_chat.plugins.tsx" "$ORCH/apps/web/src/routes/_chat.plugins.tsx"
cp "$DPCODE/apps/web/src/browserStateStore.test.ts" "$ORCH/apps/web/src/browserStateStore.test.ts"
cp "$DPCODE/apps/web/public/dpcode.png" "$ORCH/apps/web/public/dpcode.png"
```

- [ ] **Step 2: Copy new shared package files**

```bash
cp "$DPCODE/packages/shared/src/terminalThreads.ts" "$ORCH/packages/shared/src/terminalThreads.ts"
cp "$DPCODE/packages/shared/src/threadEnvironment.ts" "$ORCH/packages/shared/src/threadEnvironment.ts"
cp "$DPCODE/packages/shared/src/threadEnvironment.test.ts" "$ORCH/packages/shared/src/threadEnvironment.test.ts"
```

- [ ] **Step 3: Copy and renumber migration files**

```bash
# Copy dpcode's 019 as orchestrate's 022
cp "$DPCODE/apps/server/src/persistence/Migrations/019_ProjectionThreadsEnvMode.ts" \
   "$ORCH/apps/server/src/persistence/Migrations/022_ProjectionThreadsEnvMode.ts"

# Copy dpcode's 020 as orchestrate's 023
cp "$DPCODE/apps/server/src/persistence/Migrations/020_ProjectionThreadsForkSource.ts" \
   "$ORCH/apps/server/src/persistence/Migrations/023_ProjectionThreadsForkSource.ts"
```

- [ ] **Step 4: Verify all new files exist**

Run: `cd /Users/christophe/Documents/Orchestrate/orchestrate && ls apps/web/src/composerSlashCommands.ts apps/web/src/hooks/useComposerSlashCommands.ts apps/web/src/components/PluginLibrary.tsx packages/shared/src/terminalThreads.ts apps/server/src/persistence/Migrations/022_ProjectionThreadsEnvMode.ts apps/server/src/persistence/Migrations/023_ProjectionThreadsForkSource.ts`
Expected: All files listed without errors.

---

### Task 3: Bulk replace files with no orchestrator code

**Files:**

- Modify: All files listed in "Replace files" section above

- [ ] **Step 1: Copy all replaceable server files**

```bash
DPCODE=/Users/christophe/Documents/Orchestrate/dpcode
ORCH=/Users/christophe/Documents/Orchestrate/orchestrate

# Server files
for f in \
  apps/server/src/checkpointing/Utils.ts \
  apps/server/src/codexAppServerManager.ts \
  apps/server/src/codexAppServerManager.test.ts \
  apps/server/src/orchestration/decider.ts \
  apps/server/src/orchestration/handoff.ts \
  apps/server/src/orchestration/projector.ts \
  apps/server/src/orchestration/Layers/ProjectionPipeline.ts \
  apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts \
  apps/server/src/orchestration/Layers/ProviderCommandReactor.ts \
  apps/server/src/orchestration/Layers/ProviderCommandReactor.test.ts \
  apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts \
  apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.test.ts \
  apps/server/src/orchestration/Layers/CheckpointReactor.test.ts \
  apps/server/src/persistence/Layers/ProjectionRepositories.test.ts \
  apps/server/src/persistence/Layers/ProjectionThreads.ts \
  apps/server/src/persistence/Services/ProjectionThreads.ts \
  apps/server/src/provider/Layers/ClaudeAdapter.ts \
  apps/server/src/provider/Layers/CodexAdapter.ts \
  apps/server/src/provider/Layers/CodexAdapter.test.ts \
  apps/server/src/provider/Layers/ProviderService.ts \
  apps/server/src/provider/Layers/ProviderDiscoveryService.ts \
  apps/server/src/provider/Services/ProviderAdapter.ts \
  apps/server/src/provider/Services/ProviderService.ts \
  apps/server/src/provider/Services/ProviderDiscoveryService.ts \
  apps/server/src/terminal/terminalThreadTitle.ts \
  apps/server/src/git/Layers/GitCore.ts \
  apps/server/src/git/Layers/GitCore.test.ts \
  apps/server/src/keybindings.ts \
  apps/server/src/main.ts \
  apps/server/src/main.test.ts \
  apps/server/src/wsServer.test.ts; do
  cp "$DPCODE/$f" "$ORCH/$f"
done
```

- [ ] **Step 2: Copy all replaceable web files**

```bash
for f in \
  apps/web/src/components/ChatView.tsx \
  apps/web/src/components/ChatView.logic.ts \
  apps/web/src/components/ChatView.logic.test.ts \
  apps/web/src/components/ChatView.browser.tsx \
  apps/web/src/components/BranchToolbar.tsx \
  apps/web/src/components/BranchToolbar.logic.ts \
  apps/web/src/components/BranchToolbarBranchSelector.tsx \
  apps/web/src/components/ComposerPromptEditor.tsx \
  apps/web/src/components/DiffPanel.tsx \
  apps/web/src/components/ThreadTerminalDrawer.tsx \
  apps/web/src/components/KeybindingsToast.browser.tsx \
  apps/web/src/components/chat/ChatHeader.tsx \
  apps/web/src/components/chat/ComposerCommandMenu.tsx \
  apps/web/src/components/chat/ContextWindowMeter.tsx \
  apps/web/src/components/chat/MessagesTimeline.tsx \
  apps/web/src/components/chat/MessagesTimeline.test.tsx \
  apps/web/src/components/chat/ProviderModelPicker.tsx \
  apps/web/src/components/chat/TraitsPicker.tsx \
  apps/web/src/components/composerInlineChip.ts \
  apps/web/src/composer-editor-mentions.ts \
  apps/web/src/composer-editor-mentions.test.ts \
  apps/web/src/composer-logic.ts \
  apps/web/src/composer-logic.test.ts \
  apps/web/src/hooks/useHandleNewThread.ts \
  apps/web/src/hooks/useThreadHandoff.ts \
  apps/web/src/lib/contextWindow.ts \
  apps/web/src/lib/threadBootstrap.ts \
  apps/web/src/lib/threadHandoff.ts \
  apps/web/src/lib/gitReactQuery.ts \
  apps/web/src/lib/providerDiscoveryReactQuery.ts \
  apps/web/src/lib/icons.tsx \
  apps/web/src/browserStateStore.ts \
  apps/web/src/store.ts \
  apps/web/src/store.test.ts \
  apps/web/src/session-logic.ts \
  apps/web/src/session-logic.test.ts \
  apps/web/src/types.ts \
  apps/web/src/terminalStateStore.ts \
  apps/web/src/terminalStateStore.test.ts \
  apps/web/src/keybindings.test.ts \
  apps/web/src/routeTree.gen.ts; do
  cp "$DPCODE/$f" "$ORCH/$f"
done
```

- [ ] **Step 3: Copy replaceable contract files**

```bash
for f in \
  packages/contracts/src/orchestration.ts \
  packages/contracts/src/orchestration.test.ts \
  packages/contracts/src/provider.ts \
  packages/contracts/src/providerDiscovery.ts \
  packages/contracts/src/ipc.ts; do
  cp "$DPCODE/$f" "$ORCH/$f"
done
```

- [ ] **Step 4: Copy replaceable desktop and asset files**

```bash
cp "$DPCODE/apps/desktop/src/main.ts" "$ORCH/apps/desktop/src/main.ts"

# Asset files (binary) - copy all changed ones
for f in \
  apps/desktop/resources/icon.icns \
  apps/desktop/resources/icon.ico \
  apps/desktop/resources/icon.png \
  apps/web/public/apple-touch-icon.png \
  apps/web/public/favicon-16x16.png \
  apps/web/public/favicon-32x32.png \
  apps/web/public/favicon.ico; do
  cp "$DPCODE/$f" "$ORCH/$f" 2>/dev/null || true
done

# Dev/prod assets - create dirs if needed
mkdir -p "$ORCH/assets/dev" "$ORCH/assets/prod"
for f in \
  assets/dev/blueprint-ios-1024.png \
  assets/dev/blueprint-macos-1024.png \
  assets/dev/blueprint-universal-1024.png \
  assets/dev/blueprint-web-apple-touch-180.png \
  assets/dev/blueprint-web-favicon-16x16.png \
  assets/dev/blueprint-web-favicon-32x32.png \
  assets/dev/blueprint-web-favicon.ico \
  assets/prod/black-ios-1024.png \
  assets/prod/black-macos-1024.png \
  assets/prod/black-universal-1024.png \
  assets/prod/t3-black-web-apple-touch-180.png \
  assets/prod/t3-black-web-favicon-16x16.png \
  assets/prod/t3-black-web-favicon-32x32.png \
  assets/prod/t3-black-web-favicon.ico \
  assets/prod/t3-black-windows.ico \
  assets/dev/blueprint-windows.ico; do
  cp "$DPCODE/$f" "$ORCH/$f" 2>/dev/null || true
done
```

- [ ] **Step 5: Commit bulk copy**

```bash
cd /Users/christophe/Documents/Orchestrate/orchestrate
git add -A
git commit -m "chore: bulk copy dpcode files (pre-reintegration)"
```

---

### Task 4: Re-integrate `_chat.tsx` (OrchestratorPanel + EmbeddedBrowserPane)

**Files:**

- Modify: `apps/web/src/routes/_chat.tsx`

The dpcode version of `_chat.tsx` was already copied in Task 3. Now we must re-add the orchestrator components.

- [ ] **Step 1: Read the current (dpcode) version of `_chat.tsx`**

Read `apps/web/src/routes/_chat.tsx` and identify:

1. Where imports are declared (top of file)
2. Where the main layout JSX is (look for `ChatRouteLayout` or similar component with `<Outlet />`)

- [ ] **Step 2: Add OrchestratorPanel and EmbeddedBrowserPane imports**

Add these two imports near the other component imports at the top of the file:

```typescript
import { EmbeddedBrowserPane } from "../components/EmbeddedBrowserPane";
import { OrchestratorPanel } from "../components/OrchestratorPanel";
```

- [ ] **Step 3: Add OrchestratorPanel and EmbeddedBrowserPane to the layout JSX**

In the layout component, find the `<Outlet />` and wrap the area so `OrchestratorPanel` renders before the main content and `EmbeddedBrowserPane` renders after:

```tsx
<OrchestratorPanel />;
{
  /* ... existing layout with <Outlet /> ... */
}
<EmbeddedBrowserPane currentThreadId={null} />;
```

The exact placement: `OrchestratorPanel` goes as a sibling before the main content `<div>` containing `<Outlet />`. `EmbeddedBrowserPane` goes as the last sibling after that `<div>`.

- [ ] **Step 4: Verify the file compiles**

Run: `cd /Users/christophe/Documents/Orchestrate/orchestrate && bunx tsc --noEmit apps/web/src/routes/_chat.tsx 2>&1 | head -20`

---

### Task 5: Re-integrate `Sidebar.tsx` (embeddedBrowserStateStore import)

**Files:**

- Modify: `apps/web/src/components/Sidebar.tsx`

- [ ] **Step 1: Read the current (dpcode) Sidebar.tsx**

Read `apps/web/src/components/Sidebar.tsx` and check if `embeddedBrowserStateStore` or `createLearnAiEmbeddedBrowserSession` are referenced anywhere in the file. If they are NOT referenced in any logic or JSX, skip this task — the import may have been removed in our fork's evolution.

If they ARE used somewhere, add the import:

```typescript
import {
  createLearnAiEmbeddedBrowserSession,
  useEmbeddedBrowserStateStore,
} from "../embeddedBrowserStateStore";
```

---

### Task 6: Re-integrate `wsNativeApi.ts` (browser + orchestrator API)

**Files:**

- Modify: `apps/web/src/wsNativeApi.ts`

- [ ] **Step 1: Read the current (dpcode) wsNativeApi.ts**

Read the file. Identify the structure — it returns an object with property groups like `provider`, `git`, `terminal`, `server`, etc. We need to add `browser` and `orchestration`/`orchestrator` property groups.

- [ ] **Step 2: Add browser import to ws.ts contracts import**

In the imports from `@t3tools/contracts`, ensure `ORCHESTRATION_WS_CHANNELS` and `ORCHESTRATION_WS_METHODS` are imported (they may already be there from the base orchestration support). If not, add them.

- [ ] **Step 3: Add browser API methods**

Add this property group to the returned API object (after the terminal or server section):

```typescript
browser: {
  open: (input: any) =>
    transport.request(WS_METHODS.browserOpenSession, input, { timeoutMs: 90_000 }) as any,
  close: (input: any) => transport.request(WS_METHODS.browserCloseSession, input) as any,
  hide: async () => {},
  getState: async () => ({
    threadId: "" as any,
    open: false,
    visible: false,
    tabs: [],
    activeTabId: null,
    panelBounds: null,
    lastError: null,
  }),
  setPanelBounds: async () => ({}),
  navigate: async () => ({}),
  reload: async () => ({}),
  goBack: async () => ({}),
  goForward: async () => ({}),
  newTab: async () => ({}),
  closeTab: async () => ({}),
  selectTab: async () => ({}),
  openDevTools: async () => {},
  onState: () => () => {},
  openSession: (input: unknown) =>
    transport.request(WS_METHODS.browserOpenSession, input as any, { timeoutMs: 90_000 }),
  act: (input: unknown) =>
    transport.request(WS_METHODS.browserAct, input as any, { timeoutMs: 90_000 }),
  closeSession: (input: unknown) =>
    transport.request(WS_METHODS.browserCloseSession, input as any),
},
```

- [ ] **Step 4: Add orchestration and orchestrator API methods**

Add these property groups to the returned API object:

```typescript
orchestration: {
  getSnapshot: () => transport.request(ORCHESTRATION_WS_METHODS.getSnapshot),
  dispatchCommand: (command) =>
    transport.request(ORCHESTRATION_WS_METHODS.dispatchCommand, { command }),
  getTurnDiff: (input) => transport.request(ORCHESTRATION_WS_METHODS.getTurnDiff, input),
  getFullThreadDiff: (input) =>
    transport.request(ORCHESTRATION_WS_METHODS.getFullThreadDiff, input),
  replayEvents: (fromSequenceExclusive) =>
    transport.request(ORCHESTRATION_WS_METHODS.replayEvents, { fromSequenceExclusive }),
  onDomainEvent: (callback) =>
    transport.subscribe(ORCHESTRATION_WS_CHANNELS.domainEvent, (message) =>
      callback(message.data),
    ),
  complete: (input) =>
    transport.request(WS_METHODS.orchestratorComplete, input, { timeoutMs: 150_000 }),
},
orchestrator: {
  complete: (input) =>
    transport.request(WS_METHODS.orchestratorComplete, input, { timeoutMs: 150_000 }),
},
```

- [ ] **Step 5: Verify no type errors**

Run: `cd /Users/christophe/Documents/Orchestrate/orchestrate && bunx tsc --noEmit apps/web/src/wsNativeApi.ts 2>&1 | head -20`

---

### Task 7: Re-integrate `packages/contracts/src/ws.ts` (browser + orchestrator WS schemas)

**Files:**

- Modify: `packages/contracts/src/ws.ts`

- [ ] **Step 1: Read the current (dpcode) ws.ts**

Read `packages/contracts/src/ws.ts`. Identify:

1. The `WS_METHODS` const object
2. The `WebSocketRequestBody` union
3. The imports section

- [ ] **Step 2: Add browser contract import**

Add at the top with other imports:

```typescript
import { BrowserActInput, BrowserCloseSessionInput, BrowserOpenSessionInput } from "./browser";
```

- [ ] **Step 3: Add browser methods to WS_METHODS**

In the `WS_METHODS` object, add after shell methods:

```typescript
// Browser automation methods
browserOpenSession: "browser.openSession",
browserAct: "browser.act",
browserCloseSession: "browser.closeSession",
```

- [ ] **Step 4: Add orchestratorComplete to WS_METHODS**

In the `WS_METHODS` object, add at the end:

```typescript
// Orchestrator
orchestratorComplete: "orchestrator.complete",
```

- [ ] **Step 5: Add OrchestratorCompleteInput/Result schemas**

Add before the `WebSocketRequestBody` definition:

```typescript
import { ClaudeModelOptions, CodexModelOptions } from "./model";

export const OrchestratorCompleteInput = Schema.Struct({
  provider: ProviderKind,
  model: TrimmedNonEmptyString,
  modelOptions: Schema.optionalKey(Schema.Union([CodexModelOptions, ClaudeModelOptions])),
  messages: Schema.Array(
    Schema.Struct({
      role: Schema.Literals(["user", "assistant", "system"]),
      content: Schema.String,
    }),
  ),
});
export type OrchestratorCompleteInput = typeof OrchestratorCompleteInput.Type;

export const OrchestratorCompleteResult = Schema.Struct({
  text: Schema.String,
});
export type OrchestratorCompleteResult = typeof OrchestratorCompleteResult.Type;
```

Note: `ProviderKind` is imported from `./orchestration` — ensure it's in the existing imports. `TrimmedNonEmptyString` should already be imported from `./baseSchemas`.

- [ ] **Step 6: Add browser + orchestrator entries to WebSocketRequestBody union**

In the `WebSocketRequestBody = Schema.Union([...])`, add:

```typescript
// Browser automation methods
tagRequestBody(WS_METHODS.browserOpenSession, BrowserOpenSessionInput),
tagRequestBody(WS_METHODS.browserAct, BrowserActInput),
tagRequestBody(WS_METHODS.browserCloseSession, BrowserCloseSessionInput),

// Orchestrator
tagRequestBody(WS_METHODS.orchestratorComplete, OrchestratorCompleteInput),
```

---

### Task 8: Re-integrate `apps/server/src/wsServer.ts` (BrowserAutomation + orchestrator completion)

**Files:**

- Modify: `apps/server/src/wsServer.ts`

This is the largest re-integration. Read the FULL orchestrate backup version from git to extract the orchestrator-specific code.

- [ ] **Step 1: Get the orchestrator code from the backup branch**

```bash
cd /Users/christophe/Documents/Orchestrate/orchestrate
git show backup/pre-dpcode-merge-2026-04-07:apps/server/src/wsServer.ts > /tmp/wsServer_backup.ts
```

Read `/tmp/wsServer_backup.ts` and extract:

1. The `BrowserAutomation` import
2. The `BrowserAutomation` in the service type union and `yield*` injection
3. The `buildOrchestratorCompletionPrompt` helper function
4. The `resolveCodexCliReasoningEffort` helper function
5. The `completeOrchestratorWithCodexProvider` function
6. The browser route handlers (`WS_METHODS.browserOpenSession/Act/CloseSession`)
7. The orchestrator completion route handler (`WS_METHODS.orchestratorComplete`)

- [ ] **Step 2: Read the current (dpcode) wsServer.ts**

Read the file and identify:

1. Where service dependencies are declared (the type union and `yield*` lines)
2. Where route handlers are in the `switch` statement
3. Where helper functions can be placed (before or after the main handler)

- [ ] **Step 3: Add BrowserAutomation import**

Add near the top imports:

```typescript
import { BrowserAutomation } from "./browser/Services/BrowserAutomation.ts";
```

- [ ] **Step 4: Add BrowserAutomation to service dependencies**

In the service type union (where other services like `ProviderService`, `GitManager` etc. are listed), add:

```typescript
| BrowserAutomation
```

In the `yield*` section where services are destructured, add:

```typescript
const browserAutomation = yield * BrowserAutomation;
```

- [ ] **Step 5: Add helper functions**

Add before the main route handler function:

```typescript
function buildOrchestratorCompletionPrompt(input: {
  systemPrompt: string;
  userPrompt: string;
}): string {
  const sections: string[] = [];
  const systemPrompt = input.systemPrompt.trim();
  const userPrompt = input.userPrompt.trim();

  if (systemPrompt.length > 0) {
    sections.push(`System instructions:\n${systemPrompt}`);
  }
  if (userPrompt.length > 0) {
    sections.push(`User request:\n${userPrompt}`);
  }

  return sections.join("\n\n");
}

function resolveCodexCliReasoningEffort(
  effort: string | null | undefined,
): "minimal" | "low" | "medium" | "high" {
  if (effort === "low" || effort === "medium" || effort === "high" || effort === "minimal") {
    return effort;
  }
  if (effort === "xhigh") {
    return "high";
  }
  return "high";
}
```

- [ ] **Step 6: Add browser route handlers**

In the `switch` statement (where route handlers are), add cases for browser automation:

```typescript
case WS_METHODS.browserOpenSession: {
  const body = stripRequestTag(request.body);
  return yield* browserAutomation.openSession(body).pipe(
    Effect.mapError(
      (cause) =>
        new RouteRequestError({
          message: cause.message,
        }),
    ),
  );
}

case WS_METHODS.browserAct: {
  const body = stripRequestTag(request.body);
  return yield* browserAutomation.act(body).pipe(
    Effect.mapError(
      (cause) =>
        new RouteRequestError({
          message: cause.message,
        }),
    ),
  );
}

case WS_METHODS.browserCloseSession: {
  const body = stripRequestTag(request.body);
  return yield* browserAutomation.closeSession(body).pipe(
    Effect.mapError(
      (cause) =>
        new RouteRequestError({
          message: cause.message,
        }),
    ),
  );
}
```

- [ ] **Step 7: Add orchestrator completion route handler**

This is the longest block. Extract the full `case WS_METHODS.orchestratorComplete:` handler from the backup file at `/tmp/wsServer_backup.ts` and add it to the switch statement. The handler includes:

- Message parsing (system vs. conversation messages)
- Claude agent provider path (spawns `claude` CLI)
- Codex provider path (spawns `codex` CLI with reasoning effort handling)
- The `completeOrchestratorWithCodexProvider` function (if it exists as a separate function, add it as well)

Read the backup file to get the exact code. Do NOT guess — copy the exact implementation.

- [ ] **Step 8: Verify the necessary imports exist**

Check that `WS_METHODS` imported from contracts includes `browserOpenSession`, `browserAct`, `browserCloseSession`, `orchestratorComplete`. These were added in Task 7.

Also check for any other imports needed by the orchestrator completion handler (e.g., model capability helpers, `runProcess`, `CodexModelOptions`, `ClaudeModelOptions`). Add any missing imports.

---

### Task 9: Update migrations registry and shared package.json

**Files:**

- Modify: `apps/server/src/persistence/Migrations.ts`
- Modify: `packages/shared/package.json`

- [ ] **Step 1: Add migration 022 and 023 to Migrations.ts**

Read `apps/server/src/persistence/Migrations.ts`. Add the new migration imports and entries.

Add imports after the existing Migration0021 import:

```typescript
import Migration0022 from "./Migrations/022_ProjectionThreadsEnvMode.ts";
import Migration0023 from "./Migrations/023_ProjectionThreadsForkSource.ts";
```

Add entries to the `migrationEntries` array:

```typescript
[22, "ProjectionThreadsEnvMode", Migration0022],
[23, "ProjectionThreadsForkSource", Migration0023],
```

- [ ] **Step 2: Update shared package.json exports**

Read `packages/shared/package.json`. The dpcode version adds `./terminalThreads` and `./threadEnvironment` exports. Our version has `./KeyedCoalescingWorker`, `./Struct`, `./String` that dpcode doesn't.

We need BOTH sets. Add the dpcode exports while keeping orchestrate's existing ones. The final exports should include all of:

```json
{
  "./model": { "types": "./src/model.ts", "import": "./src/model.ts" },
  "./git": { "types": "./src/git.ts", "import": "./src/git.ts" },
  "./logging": { "types": "./src/logging.ts", "import": "./src/logging.ts" },
  "./shell": { "types": "./src/shell.ts", "import": "./src/shell.ts" },
  "./Net": { "types": "./src/Net.ts", "import": "./src/Net.ts" },
  "./DrainableWorker": {
    "types": "./src/DrainableWorker.ts",
    "import": "./src/DrainableWorker.ts"
  },
  "./KeyedCoalescingWorker": {
    "types": "./src/KeyedCoalescingWorker.ts",
    "import": "./src/KeyedCoalescingWorker.ts"
  },
  "./schemaJson": { "types": "./src/schemaJson.ts", "import": "./src/schemaJson.ts" },
  "./Struct": { "types": "./src/Struct.ts", "import": "./src/Struct.ts" },
  "./String": { "types": "./src/String.ts", "import": "./src/String.ts" },
  "./terminalThreads": {
    "types": "./src/terminalThreads.ts",
    "import": "./src/terminalThreads.ts"
  },
  "./threadEnvironment": {
    "types": "./src/threadEnvironment.ts",
    "import": "./src/threadEnvironment.ts"
  }
}
```

- [ ] **Step 3: Verify migration files compile**

Run: `cd /Users/christophe/Documents/Orchestrate/orchestrate && bunx tsc --noEmit apps/server/src/persistence/Migrations.ts 2>&1 | head -20`

---

### Task 10: Validate and fix

**Files:**

- Potentially modify: any file with type errors or lint issues

- [ ] **Step 1: Run formatter**

```bash
cd /Users/christophe/Documents/Orchestrate/orchestrate && bun fmt
```

- [ ] **Step 2: Run linter**

```bash
cd /Users/christophe/Documents/Orchestrate/orchestrate && bun lint
```

Fix any lint errors.

- [ ] **Step 3: Run typecheck**

```bash
cd /Users/christophe/Documents/Orchestrate/orchestrate && bun typecheck
```

This is the critical step. Common type errors to expect and fix:

- Missing imports for new types introduced by dpcode (e.g., `ForkThreadTarget`, `RateLimitStatus`)
- Import paths that reference dpcode-specific migration numbers (017/018 vs our 020/021)
- The `ProviderKind` import in ws.ts may need adjustment
- `browser.ts` contract import in ws.ts (ensure the file exists in orchestrate's contracts)

Fix all type errors iteratively.

- [ ] **Step 4: Run tests**

```bash
cd /Users/christophe/Documents/Orchestrate/orchestrate && bun run test
```

Investigate and fix any test failures. Common issues:

- Test snapshots may need updating
- Import paths in test files may reference old locations
- Mock shapes may need updating for new schemas

- [ ] **Step 5: Final commit**

```bash
cd /Users/christophe/Documents/Orchestrate/orchestrate
git add -A
git commit -m "feat: merge dpcode slash commands, fork/review, plugins, terminal cleanup

Ported 4 dpcode commits (780b7f5..bbdacdd):
- Slash commands system (/clear, /model, /plan, /fork, /review, /status, /fast)
- Fork and review composer flows
- Plugin library browser
- Terminal drawer refinements and empty thread cleanup
- Rate limit banner and context window meter
- Migrations 022-023 (env mode, fork source)

Preserved orchestrate-specific code:
- OrchestratorPanel and EmbeddedBrowserPane in route layout
- Browser automation WS routes and API
- Orchestrator completion endpoint"
```

---

### Task 11: Post-merge database update

**Files:**

- None (database operation)

- [ ] **Step 1: Update workspace_root in state database (if needed)**

If the app fails to start because the database `projection_projects.workspace_root` still points to an old path, update it:

```bash
sqlite3 ~/.t3/dev/state.sqlite "UPDATE projection_projects SET workspace_root = '/Users/christophe/Documents/Orchestrate/orchestrate' WHERE workspace_root LIKE '%t3code%' OR workspace_root LIKE '%dpcode%';"
```

- [ ] **Step 2: Smoke test the application**

```bash
cd /Users/christophe/Documents/Orchestrate/orchestrate && bun dev
```

Verify:

- App starts without errors
- Slash command menu appears when typing `/` in composer
- OrchestratorPanel is visible in the layout
- EmbeddedBrowserPane renders without errors
- Plugin library route (`/plugins`) loads
