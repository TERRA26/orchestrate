# Subthread Architecture Design

## Overview

Replace the custom multi-agent layout (rail + panels) with a subthread model that reuses the existing thread infrastructure. When the orchestrator's `spawn_agent` tool fires, it creates a real thread with a `parentThreadId` linking it to the orchestrator. Agent threads appear nested under their parent in the sidebar, and the orchestrator controls visibility via `focus_agent` / `collapse_panel` tool calls. The layout adapts from 1 to 3 panes.

## Core Principles

- **Agent threads are real threads.** Same as any thread — own provider session, own messages, own terminal. The only difference is `parentThreadId`.
- **Reuse existing infrastructure.** No custom layout components. Agent threads render with the same `ChatView` as any thread. The split-view system extends to support 3 panes.
- **Orchestrator controls everything.** The orchestrator decides when to create agents, which are visible, and when to background them — all via tool calls. No auto-opening magic.
- **Orchestrator is always visible.** When agents are focused, the orchestrator is always one of the visible panes. Max 2 agent panes alongside it.

## Adaptive Layout

| Agents focused | Orchestrator | Agent 1 | Agent 2 |
| -------------- | ------------ | ------- | ------- |
| 0              | 100%         | —       | —       |
| 1              | 50%          | 50%     | —       |
| 2              | 30%          | 35%     | 35%     |

Layout transitions are driven by `focus_agent` and `collapse_panel` tool calls from the orchestrator. The client manages pane sizing.

## spawn_agent Flow

When the orchestrator LLM calls `spawn_agent({ role, task, model, ... })`:

1. Server creates a new thread via `thread.create` with:
   - `parentThreadId`: the orchestrator's thread ID
   - `threadType`: `"agent"`
   - `modelSelection`: provider/model from the tool input
   - `title`: the role name (e.g., "Backend API")
2. Server starts a provider session on the new thread
3. Server sends the task description as `thread.turn.start` (first message)
4. Server returns `{ workerId, threadId, status: "spawned" }` to the orchestrator LLM

The orchestrator then decides whether to call `focus_agent` to make it visible.

## focus_agent Flow

When the orchestrator LLM calls `focus_agent({ workerId })`:

1. Server resolves the worker's threadId
2. Server pushes a UI directive to the client: `orchestrator.ui.focus`
3. Client adds the thread to visible panes
4. Layout adapts (1-pane → 2-pane → 3-pane)

If 2 agents are already focused and the orchestrator focuses a third, the least-recently-focused agent is removed from view (but keeps running).

## collapse_panel Flow

When the orchestrator calls `collapse_panel({ workerId })`:

1. Server pushes UI directive to remove the thread from visible panes
2. Layout adapts (3-pane → 2-pane → 1-pane)
3. The thread continues running — it's just not visible

## Sidebar Nesting

Orchestrator threads show child agent threads in a collapsible dropdown:

```
Sidebar:
  v Orchestrator: Build YouTube clone
    ├ Backend API (Codex) ⟳
    └ Frontend UI (Claude) ✓
  > Orchestrator: Fix auth bug
  > Agent: Quick script (standalone, no parent)
```

- Orchestrator threads are collapsible. Click chevron to expand/collapse children.
- Child threads show status indicators (running, completed, stuck).
- Standalone agent threads (from "New Agent" button) appear at the top level.
- Thread model icons (ThreadModelIcons) show on each entry.

## Contracts Changes

### New field on ThreadCreateCommand and OrchestrationThread

```typescript
parentThreadId: Schema.optional(Schema.NullOr(ThreadId)),
```

When present, this thread is a child of the parent thread. The sidebar uses this to build the nesting tree.

### Thread created event payload

Add `parentThreadId` so the read model can track the relationship.

## What Gets Deleted

These custom components from the earlier implementation are no longer needed:

- `apps/web/src/components/orchestrator/MultiAgentLayout.tsx`
- `apps/web/src/components/orchestrator/OrchestratorRail.tsx`
- `apps/web/src/components/orchestrator/AgentPanel.tsx`
- `apps/web/src/components/orchestrator/AgentPanelHeader.tsx`
- `apps/web/src/components/orchestrator/BackgroundAgentChip.tsx`
- `apps/web/src/lib/multiAgentLayoutStore.ts`

## What Stays

- `OrchestrationToolRouter` — routes tool calls to the engine
- `OrchestrationToolCallCard` — renders spawn/accept/reject in the orchestrator chat
- `ThreadModelIcons` — model badges in sidebar
- All contracts, decider, projector extensions
- System prompt injection in Claude and Codex adapters
- The simplified `send` function
- `orchestratorSystemPrompt.ts`

## What's New

### Server

- `spawn_agent` tool handler in `OrchestrationToolRouter` must:
  1. Dispatch `thread.create` with `parentThreadId`
  2. Start a provider session on the new thread
  3. Send the task as the first turn
  4. Return the thread ID to the orchestrator LLM

- `focus_agent` and `collapse_panel` handlers push UI directives via WebSocket

### Web

- Extend `splitViewStore.ts` (or create a new store) to support 3-pane layout with adaptive sizing
- Modify `Sidebar.tsx` to group child threads under parent threads using `parentThreadId`
- Add a WebSocket listener for `orchestrator.ui.focus` / `orchestrator.ui.collapse-panel` directives that update the pane layout
- The main chat route renders the orchestrator thread + 0-2 agent threads based on the pane state

### Contracts

- Add `parentThreadId` to `ThreadCreateCommand`, `OrchestrationThread`, and thread created event payload

## spawn_agent Tool Handler (Key Implementation Detail)

The current `OrchestrationToolRouter` handler for `spawn_agent` only dispatches `orchestrator.worker.spawn`. It needs to also:

```
1. Generate threadId and workerId
2. Dispatch thread.create {
     threadId,
     projectId: (from orchestrator thread),
     parentThreadId: orchestratorThreadId,
     threadType: "agent",
     title: input.role,
     modelSelection: { provider: input.model.includes("codex") ? "codex" : "claudeAgent", model: input.model },
     runtimeMode: "full-access",
     interactionMode: "default",
   }
3. Dispatch orchestrator.worker.spawn {
     workerId, threadId, runId, ...
   }
4. Dispatch thread.turn.start {
     threadId,
     message: { role: "user", text: input.task },
     modelSelection: ...
   }
5. Return { workerId, threadId, status: "spawned" }
```

This creates a real thread, links it to the orchestrator, starts the agent working, and returns control to the orchestrator LLM.

## Success Criteria

1. User sends "Using 2 agents, build a YouTube clone with backend and frontend"
2. Orchestrator reasons in its chat, calls `spawn_agent` twice
3. Two real threads appear nested under the orchestrator in the sidebar
4. Orchestrator calls `focus_agent` for both — layout becomes 3-pane (30/35/35)
5. Both agent threads are working independently with their own provider sessions
6. User can click any thread in the sidebar to navigate
7. When agents complete, orchestrator calls `review_agent_work`, `accept_work`
8. Orchestrator calls `collapse_panel` to background completed agents — layout adapts back
