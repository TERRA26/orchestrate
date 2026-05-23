# dpcode Merge #2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge 9 dpcode commits (provider-specific slash commands, disposable threads, split view, terminal UX, workspace handoff) into the orchestrate fork while preserving orchestrator-specific code.

**Architecture:** Same replace-and-re-integrate strategy as merge #1. Bulk copy all files, then surgically re-add orchestrator code to 4 conflict files. Migrations renumbered (dpcode 021-023 → orchestrate 024-026).

**Tech Stack:** TypeScript, React, Effect, TanStack Router, Zustand, Vitest, Bun

**Source:** `/Users/christophe/Documents/Orchestrate/dpcode` (commits `bbdacdd`..`c21ccd8`)
**Target:** `/Users/christophe/Documents/Orchestrate/orchestrate`

---

## File Map

### New files (33 — copy from dpcode)

**Disposable threads:**

- `apps/web/src/lib/disposableThread.ts`, `*.test.ts`
- `apps/web/src/hooks/useDisposableThreadLifecycle.ts`
- `apps/web/src/hooks/useIsDisposableThread.ts`
- `apps/web/src/temporaryThreadStore.ts`

**Split view:**

- `apps/web/src/splitView.logic.ts`, `*.test.ts`
- `apps/web/src/splitViewStore.ts`, `*.test.ts`
- `apps/web/src/splitViewRoute.ts`

**Workspace handoff:**

- `apps/web/src/components/ThreadWorktreeHandoffDialog.tsx`
- `apps/web/src/hooks/useThreadWorkspaceHandoff.ts`
- `packages/shared/src/worktreeHandoff.ts`
- `packages/shared/src/threadWorkspace.ts`

**Terminal:**

- `apps/web/src/components/TerminalSearch.tsx`
- `apps/web/src/components/TerminalScrollToBottom.tsx`
- `apps/web/src/lib/suppressQueryResponses.ts`

**UI/utilities:**

- `apps/web/src/components/ProjectSidebarIcon.tsx`
- `apps/web/src/components/chat/composerPickerStyles.ts`
- `apps/web/src/components/ui/toastRouteVisibility.ts`, `*.test.ts`
- `apps/web/src/confirmDialogFallback.ts`
- `apps/web/src/editorMetadata.ts`, `*.test.ts`
- `apps/web/src/focusedChatContext.ts`, `*.test.ts`
- `apps/web/src/global.d.ts`
- `apps/web/src/hooks/useUIFont.ts`
- `apps/web/src/lib/toolCallLabel.ts`, `*.test.ts`

**Migrations (renumbered):**

- dpcode `021` → orchestrate `024_ProjectionThreadsAssociatedWorktree.ts`
- dpcode `022` → orchestrate `025_ProjectionThreadsAssociatedWorktreeBranch.ts`
- dpcode `023` → orchestrate `026_ProjectionThreadsAssociatedWorktreeRef.ts`

### Replace files (~90 — no orchestrator code, safe to overwrite)

**Server:**

- `apps/server/src/codexAppServerManager.ts`, `*.test.ts`
- `apps/server/src/git/Layers/GitCore.ts`, `GitManager.ts`
- `apps/server/src/git/Services/GitCore.ts`, `GitManager.ts`
- `apps/server/src/open.ts`, `*.test.ts`
- `apps/server/src/orchestration/Layers/ProjectionPipeline.ts`, `ProjectionSnapshotQuery.ts`, `ProviderCommandReactor.ts`
- `apps/server/src/orchestration/decider.ts`, `projector.ts`
- `apps/server/src/persistence/Layers/ProjectionRepositories.test.ts`, `ProjectionThreads.ts`
- `apps/server/src/persistence/Services/ProjectionThreads.ts`
- `apps/server/src/projectFaviconRoute.ts`, `*.test.ts`
- `apps/server/src/provider/Layers/ClaudeAdapter.ts`, `*.test.ts`, `CodexAdapter.ts`
- `apps/server/src/terminal/Layers/BunPTY.ts`, `Manager.ts`, `*.test.ts`, `NodePTY.ts`
- `apps/server/src/terminal/Services/Manager.ts`, `PTY.ts`
- `apps/server/src/wsServer.test.ts`

**Web:**

- `apps/web/src/appSettings.ts`
- `apps/web/src/components/BranchToolbar.tsx`, `BranchToolbarBranchSelector.tsx`
- `apps/web/src/components/ChatView.tsx`, `ChatView.logic.ts`, `ChatView.browser.tsx`
- `apps/web/src/components/DiffPanel.tsx`, `GitActionsControl.tsx`, `PluginLibrary.tsx`
- `apps/web/src/components/Sidebar.tsx`, `ThreadTerminalDrawer.tsx`
- `apps/web/src/components/chat/ChatHeader.tsx`, `ComposerCommandMenu.tsx`, `ComposerPendingUserInputPanel.tsx`
- `apps/web/src/components/chat/ContextWindowMeter.tsx`, `MessagesTimeline.tsx`, `*.logic.ts`, `*.test.tsx`
- `apps/web/src/components/chat/OpenInPicker.tsx`, `ProviderModelPicker.tsx`
- `apps/web/src/components/composerInlineChip.ts`, `timelineHeight.ts`, `*.test.ts`
- `apps/web/src/components/ui/button.tsx`, `input.tsx`, `menu.tsx`, `select.tsx`, `sidebar.tsx`, `toast.tsx`, `toggle.tsx`
- `apps/web/src/composer-editor-mentions.ts`, `*.test.ts`
- `apps/web/src/composerDraftStore.ts`, `*.test.ts`
- `apps/web/src/composerSlashCommands.ts`, `*.test.ts`
- `apps/web/src/contextMenuFallback.ts`, `diffRouteSearch.ts`, `*.test.ts`
- `apps/web/src/hooks/useComposerCommandMenuItems.ts`, `useComposerSlashCommands.ts`
- `apps/web/src/hooks/useHandleNewThread.ts`, `useThreadHandoff.ts`
- `apps/web/src/index.css`
- `apps/web/src/lib/gitReactQuery.ts`, `icons.tsx`, `threadBootstrap.ts`, `*.test.ts`, `threadEnvironment.ts`
- `apps/web/src/notifications/taskCompletion.tsx`
- `apps/web/src/pendingUserInput.ts`, `*.test.ts`
- `apps/web/src/routes/_chat.$threadId.tsx`, `_chat.settings.tsx`
- `apps/web/src/session-logic.ts`, `*.test.ts`
- `apps/web/src/store.ts`, `*.test.ts`
- `apps/web/src/types.ts`

**Contracts:**

- `packages/contracts/src/editor.ts`, `git.ts`, `ipc.ts`, `orchestration.ts`, `ws.ts`

### Replace + re-integrate (4 files — have orchestrator code)

- `apps/web/src/routes/_chat.tsx` — re-add OrchestratorPanel + EmbeddedBrowserPane
- `apps/web/src/wsNativeApi.ts` — re-add browser + orchestrator API methods
- `apps/server/src/wsServer.ts` — re-add BrowserAutomation + orchestrator completion
- `packages/contracts/src/ws.ts` — re-add browser + orchestrator WS schemas

### Manual merge (do NOT copy directly)

- `apps/server/src/persistence/Migrations.ts` — add 024-026 entries only
- `packages/shared/package.json` — add threadWorkspace + worktreeHandoff exports
- `apps/server/package.json` — merge new deps, keep orchestrate-specific deps
- `apps/web/package.json` — merge new deps, keep orchestrate-specific deps (react-icons)
- `bun.lock` — copy from dpcode then run `bun install`

---

### Task 1: Backup orchestrator code and bulk copy

**Files:** All files listed above

- [ ] **Step 1: Save orchestrator code from conflict files**

```bash
cd /Users/christophe/Documents/Orchestrate/orchestrate

# Save current versions of files with orchestrator code
mkdir -p /tmp/orchestrate-backup
for f in apps/web/src/routes/_chat.tsx apps/web/src/wsNativeApi.ts apps/server/src/wsServer.ts packages/contracts/src/ws.ts; do
  cp "$f" "/tmp/orchestrate-backup/$(basename $f)"
done
```

- [ ] **Step 2: Copy all 33 new files**

```bash
DPCODE=/Users/christophe/Documents/Orchestrate/dpcode
ORCH=/Users/christophe/Documents/Orchestrate/orchestrate

# Disposable threads
for f in \
  apps/web/src/lib/disposableThread.ts \
  apps/web/src/lib/disposableThread.test.ts \
  apps/web/src/hooks/useDisposableThreadLifecycle.ts \
  apps/web/src/hooks/useIsDisposableThread.ts \
  apps/web/src/temporaryThreadStore.ts; do
  cp "$DPCODE/$f" "$ORCH/$f"
done

# Split view
for f in \
  apps/web/src/splitView.logic.ts \
  apps/web/src/splitView.logic.test.ts \
  apps/web/src/splitViewStore.ts \
  apps/web/src/splitViewStore.test.ts \
  apps/web/src/splitViewRoute.ts; do
  cp "$DPCODE/$f" "$ORCH/$f"
done

# Workspace handoff
for f in \
  apps/web/src/components/ThreadWorktreeHandoffDialog.tsx \
  apps/web/src/hooks/useThreadWorkspaceHandoff.ts \
  packages/shared/src/worktreeHandoff.ts \
  packages/shared/src/threadWorkspace.ts; do
  cp "$DPCODE/$f" "$ORCH/$f"
done

# Terminal
for f in \
  apps/web/src/components/TerminalSearch.tsx \
  apps/web/src/components/TerminalScrollToBottom.tsx \
  apps/web/src/lib/suppressQueryResponses.ts; do
  cp "$DPCODE/$f" "$ORCH/$f"
done

# UI/utilities
for f in \
  apps/web/src/components/ProjectSidebarIcon.tsx \
  apps/web/src/components/chat/composerPickerStyles.ts \
  apps/web/src/components/ui/toastRouteVisibility.ts \
  apps/web/src/components/ui/toastRouteVisibility.test.ts \
  apps/web/src/confirmDialogFallback.ts \
  apps/web/src/editorMetadata.ts \
  apps/web/src/editorMetadata.test.ts \
  apps/web/src/focusedChatContext.ts \
  apps/web/src/focusedChatContext.test.ts \
  apps/web/src/global.d.ts \
  apps/web/src/hooks/useUIFont.ts \
  apps/web/src/lib/toolCallLabel.ts \
  apps/web/src/lib/toolCallLabel.test.ts; do
  cp "$DPCODE/$f" "$ORCH/$f"
done

# Migrations (renumbered)
cp "$DPCODE/apps/server/src/persistence/Migrations/021_ProjectionThreadsAssociatedWorktree.ts" \
   "$ORCH/apps/server/src/persistence/Migrations/024_ProjectionThreadsAssociatedWorktree.ts"
cp "$DPCODE/apps/server/src/persistence/Migrations/022_ProjectionThreadsAssociatedWorktreeBranch.ts" \
   "$ORCH/apps/server/src/persistence/Migrations/025_ProjectionThreadsAssociatedWorktreeBranch.ts"
cp "$DPCODE/apps/server/src/persistence/Migrations/023_ProjectionThreadsAssociatedWorktreeRef.ts" \
   "$ORCH/apps/server/src/persistence/Migrations/026_ProjectionThreadsAssociatedWorktreeRef.ts"
```

- [ ] **Step 3: Bulk replace all existing files (no orchestrator code)**

```bash
# Server files
for f in \
  apps/server/src/codexAppServerManager.ts \
  apps/server/src/codexAppServerManager.test.ts \
  apps/server/src/git/Layers/GitCore.ts \
  apps/server/src/git/Layers/GitManager.ts \
  apps/server/src/git/Services/GitCore.ts \
  apps/server/src/git/Services/GitManager.ts \
  apps/server/src/open.ts \
  apps/server/src/open.test.ts \
  apps/server/src/orchestration/Layers/ProjectionPipeline.ts \
  apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts \
  apps/server/src/orchestration/Layers/ProviderCommandReactor.ts \
  apps/server/src/orchestration/decider.ts \
  apps/server/src/orchestration/projector.ts \
  apps/server/src/persistence/Layers/ProjectionRepositories.test.ts \
  apps/server/src/persistence/Layers/ProjectionThreads.ts \
  apps/server/src/persistence/Services/ProjectionThreads.ts \
  apps/server/src/projectFaviconRoute.ts \
  apps/server/src/projectFaviconRoute.test.ts \
  apps/server/src/provider/Layers/ClaudeAdapter.ts \
  apps/server/src/provider/Layers/ClaudeAdapter.test.ts \
  apps/server/src/provider/Layers/CodexAdapter.ts \
  apps/server/src/terminal/Layers/BunPTY.ts \
  apps/server/src/terminal/Layers/Manager.ts \
  apps/server/src/terminal/Layers/Manager.test.ts \
  apps/server/src/terminal/Layers/NodePTY.ts \
  apps/server/src/terminal/Services/Manager.ts \
  apps/server/src/terminal/Services/PTY.ts \
  apps/server/src/wsServer.test.ts; do
  cp "$DPCODE/$f" "$ORCH/$f"
done

# Web files
for f in \
  apps/web/src/appSettings.ts \
  apps/web/src/components/BranchToolbar.tsx \
  apps/web/src/components/BranchToolbarBranchSelector.tsx \
  apps/web/src/components/ChatView.tsx \
  apps/web/src/components/ChatView.logic.ts \
  apps/web/src/components/ChatView.browser.tsx \
  apps/web/src/components/DiffPanel.tsx \
  apps/web/src/components/GitActionsControl.tsx \
  apps/web/src/components/PluginLibrary.tsx \
  apps/web/src/components/Sidebar.tsx \
  apps/web/src/components/ThreadTerminalDrawer.tsx \
  apps/web/src/components/chat/ChatHeader.tsx \
  apps/web/src/components/chat/ComposerCommandMenu.tsx \
  apps/web/src/components/chat/ComposerPendingUserInputPanel.tsx \
  apps/web/src/components/chat/ContextWindowMeter.tsx \
  apps/web/src/components/chat/MessagesTimeline.tsx \
  apps/web/src/components/chat/MessagesTimeline.logic.ts \
  apps/web/src/components/chat/MessagesTimeline.test.tsx \
  apps/web/src/components/chat/OpenInPicker.tsx \
  apps/web/src/components/chat/ProviderModelPicker.tsx \
  apps/web/src/components/composerInlineChip.ts \
  apps/web/src/components/timelineHeight.ts \
  apps/web/src/components/timelineHeight.test.ts \
  apps/web/src/components/ui/button.tsx \
  apps/web/src/components/ui/input.tsx \
  apps/web/src/components/ui/menu.tsx \
  apps/web/src/components/ui/select.tsx \
  apps/web/src/components/ui/sidebar.tsx \
  apps/web/src/components/ui/toast.tsx \
  apps/web/src/components/ui/toggle.tsx \
  apps/web/src/composer-editor-mentions.ts \
  apps/web/src/composer-editor-mentions.test.ts \
  apps/web/src/composerDraftStore.ts \
  apps/web/src/composerDraftStore.test.ts \
  apps/web/src/composerSlashCommands.ts \
  apps/web/src/composerSlashCommands.test.ts \
  apps/web/src/contextMenuFallback.ts \
  apps/web/src/diffRouteSearch.ts \
  apps/web/src/diffRouteSearch.test.ts \
  apps/web/src/hooks/useComposerCommandMenuItems.ts \
  apps/web/src/hooks/useComposerSlashCommands.ts \
  apps/web/src/hooks/useHandleNewThread.ts \
  apps/web/src/hooks/useThreadHandoff.ts \
  apps/web/src/index.css \
  apps/web/src/lib/gitReactQuery.ts \
  apps/web/src/lib/icons.tsx \
  apps/web/src/lib/threadBootstrap.ts \
  apps/web/src/lib/threadBootstrap.test.ts \
  apps/web/src/lib/threadEnvironment.ts \
  apps/web/src/notifications/taskCompletion.tsx \
  apps/web/src/pendingUserInput.ts \
  apps/web/src/pendingUserInput.test.ts \
  apps/web/src/routes/_chat.\$threadId.tsx \
  apps/web/src/routes/_chat.settings.tsx \
  apps/web/src/session-logic.ts \
  apps/web/src/session-logic.test.ts \
  apps/web/src/store.ts \
  apps/web/src/store.test.ts \
  apps/web/src/types.ts; do
  cp "$DPCODE/$f" "$ORCH/$f"
done

# Contracts (NOT ws.ts — that needs re-integration)
for f in \
  packages/contracts/src/editor.ts \
  packages/contracts/src/git.ts \
  packages/contracts/src/ipc.ts \
  packages/contracts/src/orchestration.ts; do
  cp "$DPCODE/$f" "$ORCH/$f"
done

# Conflict files — replace with dpcode, will re-integrate orchestrator code next
for f in \
  apps/web/src/routes/_chat.tsx \
  apps/web/src/wsNativeApi.ts \
  apps/server/src/wsServer.ts \
  packages/contracts/src/ws.ts; do
  cp "$DPCODE/$f" "$ORCH/$f"
done

# bun.lock
cp "$DPCODE/bun.lock" "$ORCH/bun.lock"
```

- [ ] **Step 4: Commit bulk copy**

```bash
cd /Users/christophe/Documents/Orchestrate/orchestrate
git add -A
git commit -m "chore: bulk copy dpcode merge #2 files (pre-reintegration)"
```

---

### Task 2: Re-integrate orchestrator code into conflict files

**Files:**

- Modify: `apps/web/src/routes/_chat.tsx`
- Modify: `apps/web/src/wsNativeApi.ts`
- Modify: `apps/server/src/wsServer.ts`
- Modify: `packages/contracts/src/ws.ts`

For each file, read the backup at `/tmp/orchestrate-backup/` and the current dpcode version, then add back the orchestrator-specific code.

- [ ] **Step 1: Re-integrate `_chat.tsx`**

Read `apps/web/src/routes/_chat.tsx`. Add these imports near other component imports:

```typescript
import { EmbeddedBrowserPane } from "../components/EmbeddedBrowserPane";
import { OrchestratorPanel } from "../components/OrchestratorPanel";
```

In the layout JSX, add `<OrchestratorPanel />` before the main content div and `<EmbeddedBrowserPane currentThreadId={null} />` after it.

- [ ] **Step 2: Re-integrate `ws.ts`**

Read `/tmp/orchestrate-backup/ws.ts` and the current `packages/contracts/src/ws.ts`. Add back:

A. Import: `import { BrowserActInput, BrowserCloseSessionInput, BrowserOpenSessionInput } from "./browser";`
B. Import: `import { ClaudeModelOptions, CodexModelOptions } from "./model";`
C. Ensure `ProviderKind` is imported from `./orchestration`
D. Add to WS_METHODS: `browserOpenSession`, `browserAct`, `browserCloseSession`, `orchestratorComplete`
E. Add `OrchestratorCompleteInput` and `OrchestratorCompleteResult` schemas
F. Add tagged request body entries for browser + orchestrator

- [ ] **Step 3: Re-integrate `wsNativeApi.ts`**

Read `/tmp/orchestrate-backup/wsNativeApi.ts` and the current `apps/web/src/wsNativeApi.ts`. Add back:

A. `browser.openSession`, `browser.act`, `browser.closeSession` methods (use string literals for now)
B. `orchestration.complete` method
C. `orchestrator.complete` method

- [ ] **Step 4: Re-integrate `wsServer.ts`**

Read `/tmp/orchestrate-backup/wsServer.ts` and the current `apps/server/src/wsServer.ts`. Add back:

A. Import `BrowserAutomation` from `./browser/Services/BrowserAutomation.ts`
B. Import `runProcess` from `./processRunner.ts`
C. Add `BrowserAutomation` to service type union and yield injection
D. Add `buildOrchestratorCompletionPrompt` and `resolveCodexCliReasoningEffort` helper functions
E. Add browser route handlers (openSession, act, closeSession)
F. Add orchestratorComplete route handler (Claude + Codex CLI paths)

---

### Task 3: Update migrations, package files, and install deps

**Files:**

- Modify: `apps/server/src/persistence/Migrations.ts`
- Modify: `packages/shared/package.json`
- Modify: `apps/server/package.json`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Add migrations 024-026 to Migrations.ts**

Read `apps/server/src/persistence/Migrations.ts`. Add imports:

```typescript
import Migration0024 from "./Migrations/024_ProjectionThreadsAssociatedWorktree.ts";
import Migration0025 from "./Migrations/025_ProjectionThreadsAssociatedWorktreeBranch.ts";
import Migration0026 from "./Migrations/026_ProjectionThreadsAssociatedWorktreeRef.ts";
```

Add to `migrationEntries`:

```typescript
[24, "ProjectionThreadsAssociatedWorktree", Migration0024],
[25, "ProjectionThreadsAssociatedWorktreeBranch", Migration0025],
[26, "ProjectionThreadsAssociatedWorktreeRef", Migration0026],
```

- [ ] **Step 2: Update shared package.json**

Add new exports to `packages/shared/package.json`:

```json
"./threadWorkspace": {
  "types": "./src/threadWorkspace.ts",
  "import": "./src/threadWorkspace.ts"
},
"./worktreeHandoff": {
  "types": "./src/worktreeHandoff.ts",
  "import": "./src/worktreeHandoff.ts"
}
```

- [ ] **Step 3: Merge server package.json**

Read both `$DPCODE/apps/server/package.json` and `$ORCH/apps/server/package.json`. Diff them. Add any new dependencies from dpcode while keeping orchestrate-specific dependencies. Key: ensure `@anthropic-ai/sdk` or any browser-related deps are not lost.

- [ ] **Step 4: Merge web package.json**

Read both `$DPCODE/apps/web/package.json` and `$ORCH/apps/web/package.json`. Diff them. Add any new dependencies from dpcode (likely xterm addons for terminal search) while keeping `react-icons` if it exists in orchestrate.

- [ ] **Step 5: Install dependencies**

```bash
cd /Users/christophe/Documents/Orchestrate/orchestrate && bun install
```

---

### Task 4: Validate and fix

**Files:** Potentially any file with type errors

- [ ] **Step 1: Run formatter**

```bash
cd /Users/christophe/Documents/Orchestrate/orchestrate && bun fmt
```

- [ ] **Step 2: Run linter**

```bash
bun lint
```

Fix any lint errors (0 errors expected, warnings OK).

- [ ] **Step 3: Run typecheck per package**

```bash
cd packages/contracts && bun run typecheck
cd ../shared && bun run typecheck
cd ../../apps/web && bun run typecheck
cd ../server && bun run typecheck
```

Fix all type errors iteratively. Expected issues:

- Missing imports for new types from dpcode
- Mock shapes in test files missing new fields
- Service dependency changes (new services needing stubs in tests)

- [ ] **Step 4: Run tests**

```bash
cd /Users/christophe/Documents/Orchestrate/orchestrate && bun run test
```

Fix any NEW test failures (pre-existing dpcode failures are acceptable).

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: merge dpcode #2 — provider slash commands, disposable threads, split view, terminal UX

Ported 9 dpcode commits (bbdacdd..c21ccd8):
- Provider-specific slash commands (Claude vs Codex separation)
- Claude /fast gating and interrupt improvements
- Disposable thread mode with auto-cleanup
- Split view two-pane chat surfaces
- Thread workspace/worktree handoff dialog
- Terminal search, scroll-to-bottom, Shift+Enter newline
- Terminal streaming resilience
- UI polish (picker styles, toast visibility, editor metadata)
- Migrations 024-026 (associated worktree tracking)

Preserved orchestrate-specific code:
- OrchestratorPanel and EmbeddedBrowserPane in route layout
- Browser automation WS routes and API
- Orchestrator completion endpoint"
```
