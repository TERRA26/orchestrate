# Dpcode Merge Design Spec

## Context

Merge all improvements from the dpcode fork (Emanuele-web04/dpcode) into the orchestrate platform. Both codebases forked from the same upstream t3code but diverged: dpcode added thread handoff, terminal-first drafts, provider discovery, plugin mentions, and terminal workspace refactoring; our fork added orchestrator panel, browser automation (Playwright), quality gates, and ARIA snapshot validation.

## Strategy: Replace and Re-integrate

Use dpcode's file versions as the new base for conflicting files, then surgically re-add our orchestrator/browser/quality-gate code.

## Phase 1: Copy New Files (no conflicts)

Copy these 19 new files from dpcode directly:

### Server

- `apps/server/src/orchestration/handoff.ts`
- `apps/server/src/terminal/terminalThreadTitle.ts`
- `apps/server/src/terminal/terminalThreadTitle.test.ts`
- `apps/server/src/terminal/terminalThreadTitleTracker.ts`
- `apps/server/src/provider/Layers/ProviderDiscoveryService.ts`
- `apps/server/src/provider/Services/ProviderDiscoveryService.ts`

### Web

- `apps/web/src/lib/threadBootstrap.ts` + test
- `apps/web/src/lib/threadHandoff.ts`
- `apps/web/src/hooks/useThreadHandoff.ts`
- `apps/web/src/lib/icons.tsx`
- `apps/web/src/lib/providerDiscoveryReactQuery.ts`
- `apps/web/src/components/TerminalWorkspaceTabs.tsx`
- `apps/web/src/components/chat/ChatEmptyStateHero.tsx`
- `apps/web/src/components/BrowserPanel.tsx` + `BrowserPanel.logic.ts` + test
- `apps/web/src/browserStateStore.ts`

### Contracts

- `packages/contracts/src/providerDiscovery.ts`

### Desktop

- `apps/desktop/src/browserManager.ts`

## Phase 2: Database Migrations (renumbered)

Our fork has migrations 001-019. Dpcode's 017 and 018 become:

- `020_ThreadHandoffMetadata.ts` — Adds `handoff_json` to projection_threads, `source` to projection_thread_messages
- `021_ProjectionThreadMessageMentions.ts` — Adds `skills_json` and `mentions_json` to projection_thread_messages

Register both in `Migrations.ts`.

## Phase 3: Replace Conflicting Files + Re-integrate

### Tier 1: Critical (most divergence, most risk)

**`ChatView.tsx`** (2756 diff lines)

- Replace with dpcode version
- Re-add: orchestrator direct browser validation detection (`shouldHandleAsDirectBrowserValidationRequest`), browser preview URL detection
- Re-add: orchestrator panel references if ChatView interacts with it

**`Sidebar.tsx`** (2010 diff lines)

- Replace with dpcode version
- Re-add: orchestrator panel toggle button, embedded browser show/hide button, orchestrator state references

**`wsServer.ts`** (756 diff lines)

- Replace with dpcode version
- Re-add: browser automation routes (`browserOpenSession`, `browserAct`, `browserCloseSession`), `orchestrator.complete` handler, `BrowserAutomation` service import

**`wsNativeApi.ts`** (281 diff lines)

- Replace with dpcode version
- Re-add: `browser` API methods (openSession, act, closeSession with 90s timeouts), `orchestrator` API methods (complete with 150s timeout)

### Tier 2: Medium (moderate divergence)

**`composerDraftStore.ts`** (406 diff lines) — Replace with dpcode's v4 format (entryPoint field)

**`store.ts`** (1141 diff lines) — Replace, re-add any custom orchestrator store extensions

**`keybindings.ts`** (267 diff lines) — Replace with dpcode's version (includes terminal shortcuts)

**`ChatHeader.tsx`** (368 diff lines) — Replace with dpcode's handoff badge support

**`AppSidebarLayout.tsx`** — Replace, re-add OrchestratorPanel + EmbeddedBrowserPane in layout

### Tier 3: Lower risk

All other modified files — replace with dpcode versions. These are mostly:

- Test files (updated mocks)
- UI component refinements
- Terminal drawer, traits picker, model picker
- Desktop main.ts, routes, CSS

## Phase 4: Preserve Our Custom Files (untouched)

These files are unique to our fork and stay as-is:

- `OrchestratorPanel.tsx` + `OrchestratorPanel.logic.ts` + tests
- `EmbeddedBrowserPane.tsx`
- `embeddedBrowserStateStore.ts`
- `orchestratorStateStore.ts` + `orchestratorTypes.ts`
- `apps/server/src/browser/*` (Playwright automation layer)
- `packages/contracts/src/browser.ts`
- `apps/web/src/notifications/taskCompletion.*` (already merged)

## Phase 5: Icon Import Migration

Dpcode centralizes icon imports through `~/lib/icons.tsx`. After replacing files, update any remaining `lucide-react` imports to use `~/lib/icons` for consistency with dpcode's pattern.

## Phase 6: Validation

After each tier:

- `bun fmt`
- `bun lint`
- `bun typecheck` (contracts, server, web)
- `bun run test` (relevant test files)

## Migration Numbering

| ID  | Name                             | Source           |
| --- | -------------------------------- | ---------------- |
| 017 | ProjectionThreadsArchivedAt      | Our fork         |
| 018 | ProjectionThreadsArchivedAtIndex | Our fork         |
| 019 | ProjectionSnapshotLookupIndexes  | Our fork         |
| 020 | ThreadHandoffMetadata            | Dpcode (was 017) |
| 021 | ProjectionThreadMessageMentions  | Dpcode (was 018) |

## Risk Mitigations

- Replace files one tier at a time, validate between tiers
- Keep our orchestrator/browser files untouched — they're self-contained
- Re-integration is surgical: grep for our custom hooks/imports in the old files, add them to the new versions
- Both browser systems coexist: dpcode's BrowserPanel (Electron) + our EmbeddedBrowserPane (Playwright)
