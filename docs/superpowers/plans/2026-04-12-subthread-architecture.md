# Subthread Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `spawn_agent` create real child threads with provider sessions that appear nested in the sidebar, and extend the split-view to a 3-pane adaptive layout (orchestrator + up to 2 agents).

**Architecture:** Add `parentThreadId` to thread creation contracts. Update `spawn_agent` tool handler to create real threads, start provider sessions, and send the first turn. Extend the 2-pane split-view store to support a 3rd pane. Modify the sidebar to nest child threads under parent threads. Delete the unused custom layout components.

**Tech Stack:** Effect.ts (server), Schema (contracts), React/Zustand (web), existing split-view system

**Spec:** `docs/superpowers/specs/2026-04-12-subthread-architecture-design.md`

---

## File Map

### Contracts

- **Modify:** `packages/contracts/src/orchestration.ts` — Add `parentThreadId` to ThreadCreateCommand, OrchestrationThread, and thread.created payload

### Server

- **Modify:** `apps/server/src/orchestration/decider.ts` — Pass parentThreadId through thread.created event
- **Modify:** `apps/server/src/orchestration/projector.ts` — Project parentThreadId onto thread read model
- **Modify:** `apps/server/src/orchestration/Layers/OrchestrationToolRouter.ts` — Update spawn_agent to create real thread + start turn
- **Modify:** `apps/server/src/wsServer.ts` — Add UI directive push channel for focus/collapse

### Web

- **Modify:** `apps/web/src/splitViewStore.ts` — Extend to 3-pane with adaptive ratios
- **Modify:** `apps/web/src/components/Sidebar.tsx` — Nest child threads under parents
- **Modify:** `apps/web/src/routes/_chat.$threadId.tsx` — Render 3-pane layout
- **Create:** `apps/web/src/lib/orchestratorPaneStore.ts` — Track which agent threads are focused (driven by UI directives)
- **Delete:** `apps/web/src/components/orchestrator/MultiAgentLayout.tsx`
- **Delete:** `apps/web/src/components/orchestrator/OrchestratorRail.tsx`
- **Delete:** `apps/web/src/components/orchestrator/AgentPanel.tsx`
- **Delete:** `apps/web/src/components/orchestrator/AgentPanelHeader.tsx`
- **Delete:** `apps/web/src/components/orchestrator/BackgroundAgentChip.tsx`
- **Delete:** `apps/web/src/lib/multiAgentLayoutStore.ts`

---

## Task 1: Contracts — Add parentThreadId

**Files:**

- Modify: `packages/contracts/src/orchestration.ts`

- [ ] **Step 1: Add parentThreadId to ThreadCreateCommand**

Find `ThreadCreateCommand` (around line 419). Add after `threadType`:

```typescript
parentThreadId: Schema.optional(Schema.NullOr(ThreadId)),
```

- [ ] **Step 2: Add parentThreadId to OrchestrationThread read model**

Find `OrchestrationThread` (around line 329). Add after `threadType`:

```typescript
parentThreadId: Schema.optional(Schema.NullOr(ThreadId)).pipe(
  Schema.withDecodingDefault(() => null),
),
```

- [ ] **Step 3: Add parentThreadId to thread.created event payload**

Find the thread created payload schema (search for `"thread.created"` near the payload definitions). Add the same field.

- [ ] **Step 4: Build and verify**

Run: `cd packages/contracts && bun run build && bun typecheck`

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/orchestration.ts
git commit -m "feat(contracts): add parentThreadId for subthread relationships"
```

---

## Task 2: Server — Decider + Projector for parentThreadId

**Files:**

- Modify: `apps/server/src/orchestration/decider.ts`
- Modify: `apps/server/src/orchestration/projector.ts`

- [ ] **Step 1: Pass parentThreadId in decider**

Find `case "thread.create"` in decider.ts. In the event payload, add:

```typescript
parentThreadId: command.parentThreadId ?? null,
```

- [ ] **Step 2: Project parentThreadId in projector**

Find `case "thread.created"` in projector.ts. When building the thread object, add:

```typescript
parentThreadId: payload.parentThreadId ?? null,
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/server && bun typecheck`

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/orchestration/decider.ts apps/server/src/orchestration/projector.ts
git commit -m "feat(server): pass parentThreadId through event sourcing"
```

---

## Task 3: Server — spawn_agent Creates Real Thread + Starts Turn

**Files:**

- Modify: `apps/server/src/orchestration/Layers/OrchestrationToolRouter.ts`

This is the critical task. The current `handleSpawnAgent` function dispatches `orchestrator.worker.spawn` but doesn't create an actual thread or start a provider session. We need it to:

1. Dispatch `thread.create` with `parentThreadId` pointing to the orchestrator thread
2. Dispatch `orchestrator.worker.spawn` linking the worker to the new thread
3. Dispatch `thread.turn.start` to send the task as the first message

- [ ] **Step 1: Read the current handleSpawnAgent**

Read `apps/server/src/orchestration/Layers/OrchestrationToolRouter.ts` lines 397-556 to understand the current spawn flow.

- [ ] **Step 2: Add thread.create dispatch to spawn flow**

In `handleSpawnAgent`, BEFORE the `orchestrator.worker.spawn` dispatch, add a `thread.create` dispatch:

```typescript
// Create the agent's thread as a child of the orchestrator thread
yield *
  dispatch({
    type: "thread.create",
    commandId: crypto.randomUUID(),
    threadId: workerThreadId,
    projectId: resolvedProjectId, // from the orchestrator thread's project
    title: input.task?.slice(0, 50) ?? input.role ?? "Agent",
    modelSelection: {
      provider: resolvedProvider,
      model: resolvedModel,
    },
    runtimeMode: "full-access",
    interactionMode: "default",
    threadType: "agent",
    parentThreadId: orchestratorThreadId, // the threadId passed to executeTool
    branch: input.branch ?? null,
    worktreePath: input.worktreePath ?? null,
    createdAt: new Date().toISOString(),
  });
```

- [ ] **Step 3: Add thread.turn.start dispatch after worker spawn**

After `orchestrator.worker.spawn`, send the task as the first message to the new thread:

```typescript
// Send the task as the first turn on the agent thread
const taskMessage = input.task ?? input.objective ?? "Begin working on the assigned task.";
yield *
  dispatch({
    type: "thread.turn.start",
    commandId: crypto.randomUUID(),
    threadId: workerThreadId,
    message: {
      messageId: crypto.randomUUID(),
      role: "user",
      text: taskMessage,
      attachments: [],
    },
    modelSelection: {
      provider: resolvedProvider,
      model: resolvedModel,
    },
    runtimeMode: "full-access",
    interactionMode: "default",
    createdAt: new Date().toISOString(),
  });
```

- [ ] **Step 4: Verify dispatch function supports these command types**

The `dispatch` function in the tool router receives the engine's dispatch method. Verify it can handle `thread.create` and `thread.turn.start` commands — these are standard orchestration commands already handled by the decider. Read the dispatch type signature to confirm.

- [ ] **Step 5: Typecheck**

Run: `cd apps/server && bun typecheck`

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/orchestration/Layers/OrchestrationToolRouter.ts
git commit -m "feat(server): spawn_agent creates real thread with parentThreadId and sends first turn"
```

---

## Task 4: Server — UI Directive Push Channel

**Files:**

- Modify: `apps/server/src/wsServer.ts`
- Modify: `apps/server/src/orchestration/Layers/OrchestrationToolRouter.ts`

The `focus_agent` and `collapse_panel` tools need to push UI directives to the client. These are ephemeral (not persisted) — just WebSocket pushes.

- [ ] **Step 1: Add UI directive channel constant**

In `packages/contracts/src/orchestration.ts`, find `ORCHESTRATION_WS_CHANNELS` and add:

```typescript
export const ORCHESTRATION_WS_CHANNELS = {
  domainEvent: "orchestration.domainEvent",
  uiDirective: "orchestration.uiDirective",
};
```

- [ ] **Step 2: Update focus_agent handler to emit via push**

In `OrchestrationToolRouter.ts`, the `focus_agent` and `collapse_panel` handlers currently return `{ success: true }`. They need to also publish a UI directive.

The tool router doesn't currently have access to the push bus. Add it as a dependency, or emit the directive as a domain event that the wsServer converts to a push. The simpler approach: have the tool router return a structured result that the wsServer knows to push.

For now, the tool router returns the directive info in the result:

```typescript
case "focus_agent": {
  const input = yield* decodeInput(ToolSchemas.FocusAgentInput, toolInput);
  // Find the worker's threadId
  const readModel = yield* engine.getReadModel();
  const worker = (readModel.orchestratorWorkers ?? []).find(w => w.workerId === input.workerId);
  const threadId = worker?.threadId ?? null;
  return {
    success: true,
    directive: "focus",
    threadId,
    workerId: input.workerId,
  };
}

case "collapse_panel": {
  const input = yield* decodeInput(ToolSchemas.CollapsePanelInput, toolInput);
  const readModel = yield* engine.getReadModel();
  const worker = (readModel.orchestratorWorkers ?? []).find(w => w.workerId === input.workerId);
  const threadId = worker?.threadId ?? null;
  return {
    success: true,
    directive: "collapse",
    threadId,
    workerId: input.workerId,
  };
}
```

The client-side tool call rendering can read the `directive` field and update the pane store.

- [ ] **Step 3: Typecheck**

Run: `cd apps/server && bun typecheck`

- [ ] **Step 4: Commit**

```bash
git add packages/contracts/src/orchestration.ts apps/server/src/orchestration/Layers/OrchestrationToolRouter.ts
git commit -m "feat(server): add UI directive results for focus_agent and collapse_panel"
```

---

## Task 5: Web — Orchestrator Pane Store

**Files:**

- Create: `apps/web/src/lib/orchestratorPaneStore.ts`

A simple Zustand store that tracks which agent threads the orchestrator has focused. Separate from the existing splitViewStore (which handles user-initiated splits). This store is driven by the orchestrator's tool call results.

- [ ] **Step 1: Create the store**

```typescript
// apps/web/src/lib/orchestratorPaneStore.ts
import { create } from "zustand";

interface OrchestratorPaneStore {
  // The orchestrator thread ID (set when an orchestrator thread is active)
  orchestratorThreadId: string | null;
  // Agent thread IDs currently focused (max 2)
  focusedAgentThreadIds: string[];

  setOrchestratorThread: (threadId: string | null) => void;
  focusAgent: (threadId: string) => void;
  collapseAgent: (threadId: string) => void;
  clearAll: () => void;
}

export const useOrchestratorPaneStore = create<OrchestratorPaneStore>((set) => ({
  orchestratorThreadId: null,
  focusedAgentThreadIds: [],

  setOrchestratorThread: (threadId) => set({ orchestratorThreadId: threadId }),

  focusAgent: (threadId) =>
    set((state) => {
      const current = state.focusedAgentThreadIds.filter((id) => id !== threadId);
      // Max 2 focused agents — evict the oldest if full
      const next = [...current, threadId].slice(-2);
      return { focusedAgentThreadIds: next };
    }),

  collapseAgent: (threadId) =>
    set((state) => ({
      focusedAgentThreadIds: state.focusedAgentThreadIds.filter((id) => id !== threadId),
    })),

  clearAll: () => set({ orchestratorThreadId: null, focusedAgentThreadIds: [] }),
}));
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && bun typecheck`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/orchestratorPaneStore.ts
git commit -m "feat(web): add orchestrator pane store for tracking focused agent threads"
```

---

## Task 6: Web — 3-Pane Layout in Thread Route

**Files:**

- Modify: `apps/web/src/routes/_chat.$threadId.tsx`

The thread route currently renders either a single thread or a 2-pane split. We need to add a 3-pane mode when the orchestrator has focused agents.

- [ ] **Step 1: Read the full \_chat.$threadId.tsx**

Read the entire file to understand:

- How it decides between single thread and split view
- How panes are rendered (ChatView components)
- How the ratio/divider works

- [ ] **Step 2: Import the orchestrator pane store**

```typescript
import { useOrchestratorPaneStore } from "~/lib/orchestratorPaneStore";
```

- [ ] **Step 3: Add 3-pane rendering logic**

In the component, after the existing split-view logic, add orchestrator multi-pane rendering. When `focusedAgentThreadIds.length > 0` and the current thread is an orchestrator thread:

```typescript
const { orchestratorThreadId, focusedAgentThreadIds } = useOrchestratorPaneStore();
const isOrchestratorActive = orchestratorThreadId === threadId;
const agentCount = focusedAgentThreadIds.length;

if (isOrchestratorActive && agentCount > 0) {
  // Adaptive widths
  const orchestratorWidth = agentCount === 1 ? "50%" : "30%";
  const agentWidth = agentCount === 1 ? "50%" : "35%";

  return (
    <div className="flex h-dvh w-full">
      {/* Orchestrator pane */}
      <div style={{ width: orchestratorWidth }} className="h-full overflow-hidden border-r border-border/30">
        <ChatView threadId={threadId} /* ...existing props */ />
      </div>
      {/* Agent panes */}
      {focusedAgentThreadIds.map((agentThreadId) => (
        <div key={agentThreadId} style={{ width: agentWidth }} className="h-full overflow-hidden border-r border-border/30 last:border-r-0">
          <ChatView threadId={agentThreadId} /* ...existing props */ />
        </div>
      ))}
    </div>
  );
}
```

This renders the orchestrator thread + focused agent threads side by side with adaptive widths.

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && bun typecheck`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/_chat.$threadId.tsx
git commit -m "feat(web): add 3-pane adaptive layout for orchestrator + agent threads"
```

---

## Task 7: Web — Sidebar Thread Nesting

**Files:**

- Modify: `apps/web/src/components/Sidebar.tsx`

- [ ] **Step 1: Read how threads are grouped and rendered**

Read the sidebar's thread grouping logic. Understand how `visibleEntries` is built from threads. Find where threads are filtered and sorted for display.

- [ ] **Step 2: Group child threads under parents**

Before rendering, group threads by parentThreadId:

```typescript
// Build parent-child map
const childThreadsByParent = new Map<string, Thread[]>();
const topLevelThreads: Thread[] = [];

for (const thread of threads) {
  const parentId = (thread as any).parentThreadId;
  if (parentId) {
    const children = childThreadsByParent.get(parentId) ?? [];
    children.push(thread);
    childThreadsByParent.set(parentId, children);
  } else {
    topLevelThreads.push(thread);
  }
}
```

- [ ] **Step 3: Render nested children**

Modify `renderThreadRow` to accept an optional `children` parameter. After rendering the parent thread row, render child threads indented underneath with a collapsible chevron:

```tsx
function renderThreadRow(thread: Thread, orderedProjectThreadIds: readonly ThreadId[]) {
  const children = childThreadsByParent.get(thread.id) ?? [];
  const hasChildren = children.length > 0;

  return (
    <React.Fragment key={thread.id}>
      {/* Existing thread row rendering */}
      <SidebarMenuSubItem>
        {hasChildren && <ChevronIcon />}
        <SidebarMenuSubButton /* ...existing props */ />
      </SidebarMenuSubItem>

      {/* Nested children */}
      {hasChildren && (
        <div className="ml-4">
          {children.map((child) => (
            <SidebarMenuSubItem key={child.id}>
              <SidebarMenuSubButton /* render child thread */ />
            </SidebarMenuSubItem>
          ))}
        </div>
      )}
    </React.Fragment>
  );
}
```

Add status indicators to child threads (running, completed, stuck) based on thread session status.

- [ ] **Step 4: Filter child threads from top-level list**

Ensure child threads don't appear at the top level. Only render threads where `parentThreadId` is null or undefined in the main thread list.

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && bun typecheck`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/Sidebar.tsx
git commit -m "feat(web): nest child agent threads under parent orchestrator in sidebar"
```

---

## Task 8: Web — Wire Tool Call Results to Pane Store

**Files:**

- Modify: `apps/web/src/components/orchestrator/OrchestrationToolCallCard.tsx`

When the orchestrator's `spawn_agent` or `focus_agent` tool calls complete, their results contain thread IDs and directives. The `OrchestrationToolCallCard` component renders these tool calls — it also needs to update the pane store when it sees focus/collapse directives.

- [ ] **Step 1: Import pane store in OrchestrationToolCallCard**

```typescript
import { useOrchestratorPaneStore } from "~/lib/orchestratorPaneStore";
```

- [ ] **Step 2: Add useEffect for focus directives**

In the `OrchestrationToolCallCard` component, when `toolName === "focus_agent"` and the result contains a `threadId`, call `focusAgent`:

```typescript
const { focusAgent, collapseAgent, setOrchestratorThread } = useOrchestratorPaneStore();

useEffect(() => {
  if (!result || isLoading) return;
  const res = result as Record<string, unknown>;

  if (toolName === "focus_agent" && res.threadId) {
    focusAgent(String(res.threadId));
  }
  if (toolName === "collapse_panel" && res.threadId) {
    collapseAgent(String(res.threadId));
  }
  if (toolName === "spawn_agent" && res.threadId) {
    // Auto-focus foreground agents when spawned
    const input = parsed as Record<string, unknown>;
    if (input.mode !== "background") {
      focusAgent(String(res.threadId));
    }
  }
}, [toolName, result, isLoading]);
```

- [ ] **Step 3: Add useEffect import**

Add `useEffect` to the React imports if not already present.

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && bun typecheck`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/orchestrator/OrchestrationToolCallCard.tsx
git commit -m "feat(web): wire orchestration tool call results to pane store"
```

---

## Task 9: Cleanup — Delete Unused Custom Layout Components

**Files:**

- Delete: `apps/web/src/components/orchestrator/MultiAgentLayout.tsx`
- Delete: `apps/web/src/components/orchestrator/OrchestratorRail.tsx`
- Delete: `apps/web/src/components/orchestrator/AgentPanel.tsx`
- Delete: `apps/web/src/components/orchestrator/AgentPanelHeader.tsx`
- Delete: `apps/web/src/components/orchestrator/BackgroundAgentChip.tsx`
- Delete: `apps/web/src/lib/multiAgentLayoutStore.ts`
- Modify: `apps/web/src/components/OrchestratorPanel.tsx` — Remove imports of deleted components

- [ ] **Step 1: Delete the 6 files**

```bash
rm apps/web/src/components/orchestrator/MultiAgentLayout.tsx
rm apps/web/src/components/orchestrator/OrchestratorRail.tsx
rm apps/web/src/components/orchestrator/AgentPanel.tsx
rm apps/web/src/components/orchestrator/AgentPanelHeader.tsx
rm apps/web/src/components/orchestrator/BackgroundAgentChip.tsx
rm apps/web/src/lib/multiAgentLayoutStore.ts
```

- [ ] **Step 2: Remove imports from OrchestratorPanel.tsx**

Open `apps/web/src/components/OrchestratorPanel.tsx`. Remove:

```typescript
import { MultiAgentLayout } from "./orchestrator/MultiAgentLayout";
import { useMultiAgentLayoutStore } from "~/lib/multiAgentLayoutStore";
```

Remove any conditional rendering that references `layoutMode` or `MultiAgentLayout`.

- [ ] **Step 3: Remove imports from useOrchestratorEngine.ts**

If `useOrchestratorEngine.ts` imports `useMultiAgentLayoutStore` or calls `syncWithWorkers`, remove those references.

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && bun typecheck`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "cleanup(web): delete unused custom multi-agent layout components"
```

---

## Task 10: Verification — End-to-End

- [ ] **Step 1: Typecheck all packages**

Run: `bun typecheck`
Expected: All packages pass.

- [ ] **Step 2: Start dev server**

Run: `bun run dev -- --home-dir ./.orchestrate-dev`
Expected: Server starts, web loads.

- [ ] **Step 3: Test thread creation**

1. Click "New Orchestrator" in sidebar — creates an orchestrator thread
2. Click "New Agent" in sidebar — creates a standalone agent thread
3. Verify both render correctly

- [ ] **Step 4: Test subthread relationship**

1. In an orchestrator thread with Codex model, ask it to spawn an agent
2. Verify the agent thread appears nested under the orchestrator in the sidebar
3. Verify the agent thread is a real thread with its own provider session

- [ ] **Step 5: Commit final state**

```bash
git add -A
git commit -m "feat: subthread architecture — real child threads, sidebar nesting, adaptive 3-pane layout"
```
