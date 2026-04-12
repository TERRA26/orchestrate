# Orchestrator as Real Agent Thread — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the client-side orchestrator routing logic with a real agent thread where the LLM reasons visibly and acts via tool calls (spawn_agent, wait_all, etc.), making the orchestrator feel like chatting with an agent.

**Architecture:** Add `threadType` field to thread creation, inject ORCHESTRATOR.md + orchestration tools into provider sessions for orchestrator threads, intercept orchestration tool calls in both adapters, simplify the send function to a plain `thread.turn.start` dispatch, and add sidebar buttons for both thread types.

**Tech Stack:** Effect.ts (server), Schema (contracts), React/Zustand (web), Claude Agent SDK, Codex app-server JSON-RPC

**Spec:** `docs/superpowers/specs/2026-04-12-orchestrator-as-real-agent-design.md`

---

## File Map

### Contracts
- **Modify:** `packages/contracts/src/orchestration.ts` — Add `threadType` field to ThreadCreateCommand and OrchestrationThread

### Server
- **Modify:** `apps/server/src/provider/Layers/ClaudeAdapter.ts` — Inject orchestrator system prompt and tools, intercept orchestration tool calls
- **Modify:** `apps/server/src/codexAppServerManager.ts` — Add orchestrator developer instructions, pass threadType through
- **Modify:** `apps/server/src/provider/Layers/CodexAdapter.ts` — Intercept orchestration tool calls from Codex events
- **Modify:** `apps/server/src/orchestration/decider.ts` — Store threadType in thread.created event
- **Modify:** `apps/server/src/orchestration/projector.ts` — Project threadType onto thread read model

### Web
- **Modify:** `apps/web/src/components/orchestrator/useOrchestratorEngine.ts` — Replace send function, remove client-side routing
- **Modify:** `apps/web/src/components/OrchestratorPanel.tsx` — Render real agent messages via ChatView
- **Modify:** `apps/web/src/components/Sidebar.tsx` — Add "New Orchestrator" and "New Agent" buttons
- **Modify:** `apps/web/src/hooks/useHandleNewThread.ts` — Accept threadType parameter

---

## Task 1: Contracts — Add threadType to Thread Schema

**Files:**
- Modify: `packages/contracts/src/orchestration.ts`

- [ ] **Step 1: Add ThreadType schema**

Find the area near ThreadCreateCommand (around line 413) and add:

```typescript
export const ThreadType = Schema.Literal("orchestrator", "agent");
export type ThreadType = typeof ThreadType.Type;
```

- [ ] **Step 2: Add threadType to ThreadCreateCommand**

Find `ThreadCreateCommand` and add the field after `interactionMode`:

```typescript
threadType: Schema.optionalWith(ThreadType, { default: () => "orchestrator" as const }),
```

- [ ] **Step 3: Add threadType to OrchestrationThread read model**

Find the `OrchestrationThread` schema (the read model entity with fields like id, projectId, title, etc.) and add:

```typescript
threadType: Schema.optionalWith(ThreadType, { default: () => "orchestrator" as const }),
```

- [ ] **Step 4: Add threadType to thread.created event payload**

Find the thread created event payload schema and add the same field.

- [ ] **Step 5: Build and verify**

Run: `cd packages/contracts && bun run build && bun typecheck`

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/orchestration.ts
git commit -m "feat(contracts): add threadType field to thread creation and read model"
```

---

## Task 2: Server — Store and Project threadType

**Files:**
- Modify: `apps/server/src/orchestration/decider.ts`
- Modify: `apps/server/src/orchestration/projector.ts`

- [ ] **Step 1: Update decider thread.create handler**

Find the `case "thread.create"` handler in decider.ts. In the event payload, add:

```typescript
threadType: command.threadType ?? "orchestrator",
```

- [ ] **Step 2: Update projector thread.created handler**

Find the `case "thread.created"` handler in projector.ts. When creating the thread object in the read model, add:

```typescript
threadType: payload.threadType ?? "orchestrator",
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/server && bun typecheck`

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/orchestration/decider.ts apps/server/src/orchestration/projector.ts
git commit -m "feat(server): store and project threadType through event sourcing"
```

---

## Task 3: Server — Claude Adapter Orchestrator Integration

**Files:**
- Modify: `apps/server/src/provider/Layers/ClaudeAdapter.ts`
- Modify: `apps/server/src/orchestration/orchestratorSystemPrompt.ts`

This is the most complex task. The Claude adapter uses the Claude Agent SDK. We need to:
1. Detect when a session is for an orchestrator thread
2. Inject ORCHESTRATOR.md content into the system prompt
3. Register orchestration tools alongside normal tools
4. Intercept orchestration tool calls before they reach the normal tool handling

- [ ] **Step 1: Read ClaudeAdapter thoroughly**

Read the full ClaudeAdapter.ts to understand:
- How `createQuery()` builds the SDK query options
- How tools are registered (the `canUseTool` callback or tools array)
- How tool calls are processed in the response stream
- How the session context carries thread metadata

- [ ] **Step 2: Pass threadType into the adapter context**

The adapter needs to know if the current thread is an orchestrator thread. Find where session/thread context is passed to the adapter (likely in the session start or query creation flow). Ensure `threadType` from the thread's read model data is accessible.

Look at how the adapter gets thread information — it likely receives a context object with threadId, projectId, etc. Add `threadType` to that context.

- [ ] **Step 3: Inject orchestrator system prompt**

Find where the system prompt or developer instructions are constructed for the Claude SDK query. For orchestrator threads, prepend the ORCHESTRATOR.md content.

Import and use the existing `buildOrchestratorSystemPrompt` function:

```typescript
import { buildOrchestratorSystemPrompt } from "../../orchestration/orchestratorSystemPrompt.js";
```

In the query creation flow, if `threadType === "orchestrator"`:
- Call `buildOrchestratorSystemPrompt({ projectRoot })` to get the orchestrator instructions
- Prepend this to the system prompt / instructions

- [ ] **Step 4: Register orchestration tools**

The Claude SDK likely has a way to register custom tools. For orchestrator threads, add the 38 orchestration tools as tool definitions alongside existing tools.

Create a function that converts the orchestration tool definitions into the Claude SDK tool format:

```typescript
function buildOrchestrationToolDefinitions(): Array<{ name: string; description: string; input_schema: object }> {
  // Convert each tool from TOOL_DEFINITIONS in orchestratorSystemPrompt.ts
  // into Claude API tool format with JSON Schema input definitions
}
```

- [ ] **Step 5: Intercept orchestration tool calls**

Find where tool call responses from the Claude SDK are processed. This is where the adapter handles `tool_use` blocks from the API response. Add interception:

```typescript
import { ORCHESTRATION_TOOL_NAMES } from "@t3tools/contracts";

// In the tool call processing loop:
if (ORCHESTRATION_TOOL_NAMES.has(toolCall.name)) {
  // Route to OrchestrationToolRouter instead of normal tool execution
  const result = yield* orchestrationToolRouter.executeTool({
    toolName: toolCall.name,
    toolInput: toolCall.input,
    threadId: context.threadId,
    runId: null, // Will be set from context if available
  });
  // Return result as tool_result to the LLM
  return { type: "tool_result", tool_use_id: toolCall.id, content: JSON.stringify(result) };
}
```

- [ ] **Step 6: Wire OrchestrationToolRouter into the adapter's dependency injection**

The adapter gets its dependencies through Effect Layers. Add `OrchestrationToolRouter` as a dependency:

```typescript
import { OrchestrationToolRouter } from "../../orchestration/Services/OrchestrationToolRouter.js";
```

Access it via `yield* OrchestrationToolRouter` in the adapter's Effect context.

- [ ] **Step 7: Typecheck**

Run: `cd apps/server && bun typecheck`

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/provider/Layers/ClaudeAdapter.ts apps/server/src/orchestration/orchestratorSystemPrompt.ts
git commit -m "feat(server): inject orchestrator prompt and intercept tool calls in Claude adapter"
```

---

## Task 4: Server — Codex Adapter Orchestrator Integration

**Files:**
- Modify: `apps/server/src/codexAppServerManager.ts`
- Modify: `apps/server/src/provider/Layers/CodexAdapter.ts`

- [ ] **Step 1: Read codexAppServerManager.ts**

Understand how developer_instructions are set per interaction mode. Find the section that selects between `CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS` and `CODEX_DEFAULT_MODE_DEVELOPER_INSTRUCTIONS`.

- [ ] **Step 2: Add orchestrator developer instructions**

Create a new constant `CODEX_ORCHESTRATOR_DEVELOPER_INSTRUCTIONS` in `codexAppServerManager.ts`. This should include:
- The content of ORCHESTRATOR.md (read from disk at startup or inline)
- Tool definitions formatted as function descriptions that Codex can understand
- Instructions for the LLM to emit function calls with orchestration tool names

```typescript
function buildCodexOrchestratorInstructions(orchestratorMd: string): string {
  return [
    "# Orchestrator Mode",
    "",
    "You are running as an orchestrator agent with special tools for managing other agents.",
    "",
    orchestratorMd,
    "",
    "# Available Orchestration Tools",
    "",
    "Call these as functions. The system will intercept and execute them.",
    "",
    // ... tool definitions formatted for Codex
  ].join("\n");
}
```

- [ ] **Step 3: Select orchestrator instructions based on threadType**

In the section that selects developer_instructions (around line 485), add a check for threadType:

```typescript
if (threadType === "orchestrator") {
  developer_instructions = orchestratorInstructions;
} else if (input.interactionMode === "plan") {
  developer_instructions = CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS;
} else {
  developer_instructions = CODEX_DEFAULT_MODE_DEVELOPER_INSTRUCTIONS;
}
```

Ensure threadType is passed through from the thread creation to session start.

- [ ] **Step 4: Intercept orchestration tool calls in CodexAdapter**

Find where CodexAdapter processes tool call events from the Codex app-server. This is where `codex/event/agent_tool_call` or similar events are received.

Add interception logic:

```typescript
import { ORCHESTRATION_TOOL_NAMES } from "@t3tools/contracts";

// When a tool call event is received:
const toolName = extractToolName(event);
if (ORCHESTRATION_TOOL_NAMES.has(toolName)) {
  const input = extractToolInput(event);
  const result = yield* orchestrationToolRouter.executeTool({
    toolName,
    toolInput: input,
    threadId: context.threadId,
    runId: null,
  });
  // Send result back to Codex app-server via JSON-RPC
  yield* sendToolResult(context, event.id, result);
  return; // Don't process as normal tool call
}
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/server && bun typecheck`

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/codexAppServerManager.ts apps/server/src/provider/Layers/CodexAdapter.ts
git commit -m "feat(server): inject orchestrator instructions and intercept tool calls in Codex adapter"
```

---

## Task 5: Web — Simplify the Send Function

**Files:**
- Modify: `apps/web/src/components/orchestrator/useOrchestratorEngine.ts`

This is the core change — replacing the giant client-side routing logic with a simple turn dispatch.

- [ ] **Step 1: Read the current send function**

Read the full `send` function (starts around line 1891, ~300 lines). Understand everything it does:
- Client-side LLM routing call
- JSON parsing of router decision
- Manual progress messages
- Thread creation for delegation
- Server run creation
- Instruction sending to managed thread

All of this gets replaced.

- [ ] **Step 2: Replace the send function**

Replace the entire `send` callback with:

```typescript
const send = useCallback(
  async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!selectedModel) {
      addMessage(
        currentThreadId,
        "orchestrator",
        "No model selected. Pick a model in the composer toolbar.",
      );
      return;
    }
    const api = readNativeApi();
    if (!api) {
      addMessage(
        currentThreadId,
        "orchestrator",
        "Server connection not available. Try refreshing.",
      );
      return;
    }

    setOrchestratorPrompt(currentThreadId, "");

    // The orchestrator is a real agent thread — just send the turn.
    // The LLM will reason, call tools (spawn_agent, etc.), and stream
    // its response to the chat transcript via domain events.
    await api.orchestration.dispatchCommand({
      type: "thread.turn.start",
      commandId: newCommandId(),
      threadId: currentThreadId,
      message: {
        messageId: newMessageId(),
        role: "user",
        text: trimmed,
        attachments: [],
      },
      modelSelection: selectedModelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      createdAt: new Date().toISOString(),
    });
  },
  [currentThreadId, selectedModel, selectedModelSelection, addMessage, setOrchestratorPrompt],
);
```

- [ ] **Step 3: Remove dead code**

Remove these functions and their usages (they are no longer called):
- `callOrchestratorLLM` (if it exists as a separate function)
- `createServerRun`
- `spawnServerWorker` (if only used by the old send flow)
- `resolveRequestedWorkerModelSelection`
- `buildRouterUserPrompt`
- `parseOrchestratorRouterDecision`
- `buildDelegationInstruction`
- `buildFallbackOrchestratorRouterDecision`
- `formatTaskDraftForDisplay`
- `buildChecklistItemsFromTaskDraft`
- Any imports that are now unused

Do NOT remove:
- `addMessage` — still used for error messages
- `setOrchestratorPrompt` — still used to clear input
- `newCommandId`, `newMessageId` — still used
- `selectedModelSelection` — still used
- The multi-agent layout store sync (`syncWithWorkers`)
- The scroll/auto-scroll logic
- The hook return interface

- [ ] **Step 4: Update the hook return value**

The hook currently returns properties like `status`, `statusDetail`, `isBusy` that were driven by the client-side state machine. These should now be derived from the thread's actual state (turn running = busy, idle = idle). Check what `OrchestratorPanelInner` and other consumers use and ensure they still work.

If consumers rely on `engine.status`, derive it from the thread's session status:
```typescript
const status = useMemo(() => {
  // Derive from thread session state instead of manual status tracking
  const thread = threads.find(t => t.id === currentThreadId);
  if (!thread?.session) return "idle";
  if (thread.session.status === "running") return "thinking";
  return "idle";
}, [threads, currentThreadId]);
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && bun typecheck`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/orchestrator/useOrchestratorEngine.ts
git commit -m "feat(web): replace client-side orchestrator routing with real agent turn dispatch"
```

---

## Task 6: Web — Render Real Agent Messages in Orchestrator

**Files:**
- Modify: `apps/web/src/components/OrchestratorPanel.tsx`
- Modify: `apps/web/src/components/orchestrator/OrchestratorMessages.tsx` (if needed)

The orchestrator panel needs to render real agent messages (thinking, tool calls, tool results, text responses) instead of the manually constructed orchestrator messages.

- [ ] **Step 1: Read how ChatView renders messages**

Read `apps/web/src/components/ChatView.tsx` to understand how regular agent threads render:
- Message items (user messages, assistant messages)
- Tool call blocks (file edits, terminal commands)
- Thinking/reasoning blocks
- Turn boundaries

- [ ] **Step 2: Integrate ChatView message rendering into the orchestrator**

The orchestrator panel should use the same message rendering as ChatView for the agent's responses. The simplest approach: replace `OrchestratorMessages` with the same message rendering components that ChatView uses, pointed at the orchestrator thread's messages from the read model.

If `OrchestratorMessages` currently renders custom `OrchestratorMessage` objects (manually constructed), switch to rendering the thread's actual `OrchestrationMessage` objects from the read model (which include tool calls, thinking, etc.).

The key integration: the orchestrator thread's messages come from `api.orchestration.getSnapshot()` → `readModel.threads.find(t => t.id === orchestratorThreadId)?.messages`.

- [ ] **Step 3: Add custom rendering for orchestration tool calls**

When a tool call is an orchestration tool (spawn_agent, accept_work, etc.), render a custom card instead of the generic tool call block:

```tsx
function OrchestrationToolCallCard({ toolName, input, result }: {
  toolName: string;
  input: unknown;
  result: unknown;
}) {
  if (toolName === "spawn_agent") {
    const { role, model, mode } = input as { role: string; model: string; mode: string };
    return (
      <div className="flex items-center gap-2 rounded-md border border-border/50 p-2 text-sm">
        <span className="text-muted-foreground">Spawned</span>
        <span className="font-medium">{role}</span>
        <span className="text-muted-foreground">agent on</span>
        <span className="font-medium">{model}</span>
        <span className="text-xs text-muted-foreground">({mode})</span>
      </div>
    );
  }
  // ... similar cards for accept_work, reject_work, wait_all, etc.
  // Default: generic tool call rendering
  return <GenericToolCallBlock toolName={toolName} input={input} result={result} />;
}
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && bun typecheck`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/OrchestratorPanel.tsx apps/web/src/components/orchestrator/
git commit -m "feat(web): render real agent messages with custom orchestration tool call cards"
```

---

## Task 7: Web — Sidebar Thread Type Buttons

**Files:**
- Modify: `apps/web/src/components/Sidebar.tsx`
- Modify: `apps/web/src/hooks/useHandleNewThread.ts`

- [ ] **Step 1: Read useHandleNewThread.ts**

Understand the current flow for creating new threads. Find what parameters it accepts and how it dispatches the `thread.create` command.

- [ ] **Step 2: Add threadType parameter to useHandleNewThread**

```typescript
// In the hook's handleNewThread function, add threadType option:
async function handleNewThread(
  projectId: ProjectId,
  options?: {
    envMode?: ThreadEnvironmentMode;
    threadType?: "orchestrator" | "agent";
  },
) {
  // ... existing logic ...
  await api.orchestration.dispatchCommand({
    type: "thread.create",
    // ... existing fields ...
    threadType: options?.threadType ?? "orchestrator",
    // ...
  });
}
```

- [ ] **Step 3: Update Sidebar new thread button**

Find the new thread button (around line 2350 in Sidebar.tsx). Replace the single button with two:

```tsx
{/* New Orchestrator (default, primary) */}
<SidebarMenuAction
  render={<button
    type="button"
    aria-label={`New orchestrator in ${project.name}`}
    data-testid="new-orchestrator-button"
  />}
  onClick={(event) => {
    event.preventDefault();
    event.stopPropagation();
    void handleNewThread(project.id, {
      envMode: resolveSidebarNewThreadEnvMode({...}),
      threadType: "orchestrator",
    });
  }}
>
  <SquarePenIcon className="size-3.5" />
</SidebarMenuAction>

{/* New Agent Thread (secondary) */}
<SidebarMenuAction
  render={<button
    type="button"
    aria-label={`New agent thread in ${project.name}`}
    data-testid="new-agent-button"
  />}
  onClick={(event) => {
    event.preventDefault();
    event.stopPropagation();
    void handleNewThread(project.id, {
      envMode: resolveSidebarNewThreadEnvMode({...}),
      threadType: "agent",
    });
  }}
>
  <TerminalIcon className="size-3.5" />
</SidebarMenuAction>
```

Import `TerminalIcon` from lucide-react.

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && bun typecheck`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/Sidebar.tsx apps/web/src/hooks/useHandleNewThread.ts
git commit -m "feat(web): add sidebar buttons for new orchestrator and new agent threads"
```

---

## Task 8: Verification — End-to-End

- [ ] **Step 1: Typecheck all packages**

Run: `bun typecheck`
Expected: All 8 packages pass.

- [ ] **Step 2: Start dev server**

Run: `bun run dev -- --home-dir ./.orchestrate-dev`
Expected: Server starts, web UI loads.

- [ ] **Step 3: Test orchestrator thread**

1. Open the app
2. The default view should be the orchestrator (full-width, sidebar + orchestrator)
3. Type a message like "What files are in this project?"
4. The orchestrator LLM should stream its thinking and response in the chat
5. Verify tool calls (if any) appear as visible items

- [ ] **Step 4: Test agent thread**

1. Click the agent thread button in the sidebar
2. Verify a standard agent thread opens
3. Send a message — it should work as a normal coding agent (no orchestration tools)

- [ ] **Step 5: Test multi-agent spawn**

1. In an orchestrator thread, type "Using 2 agents, create a simple hello world app with a backend and frontend"
2. The orchestrator should reason about the request
3. It should emit spawn_agent tool calls
4. Agent panels should appear in the rail+panels layout

- [ ] **Step 6: Commit final state**

```bash
git add -A
git commit -m "feat: orchestrator as real agent thread — complete integration"
```
