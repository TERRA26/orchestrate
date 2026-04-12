# Orchestrator as Real Agent Thread

## Overview

Replace the client-side orchestrator routing logic with a real agent thread. The orchestrator becomes a provider session (Claude or Codex) with ORCHESTRATOR.md injected as system prompt and 38 orchestration tools registered alongside normal coding tools. The LLM reasons, shows its thinking, and emits tool calls — all visible in the chat transcript like any agent conversation.

## Core Principles

- **The orchestrator is an agent.** It has a real provider session, streams reasoning to the chat, and acts via tool calls. No client-side routing, no manual progress messages, no JSON parsing of router decisions.
- **ORCHESTRATOR.md shapes behavior, not code.** The orchestrator's personality, routing preferences, review process, and coordination patterns are defined in markdown. Iterate on behavior by editing the doc, not the codebase.
- **Both providers supported.** The orchestrator can run on Claude (tool_use protocol) or Codex (tool call interception at event stream level). Workers can use any provider independently.
- **Two thread types.** Orchestrator threads (default) get ORCHESTRATOR.md + orchestration tools. Agent threads (explicit choice) get standard coding tools only.

## What Changes

### Deleted (client-side orchestrator brain)

All of these in `useOrchestratorEngine.ts`:
- `callOrchestratorLLM()` — no more client-side LLM calls
- `ORCHESTRATOR_ROUTER_SYSTEM_PROMPT` — replaced by real system prompt injection
- `parseOrchestratorRouterDecision()` — LLM acts directly via tool calls
- `buildDelegationInstruction()` — LLM writes its own instructions to workers
- `buildRouterUserPrompt()` — not needed
- `buildFallbackOrchestratorRouterDecision()` — not needed
- The giant `send` function's routing/delegation logic — replaced by `thread.turn.start`

### Kept

- `OrchestratorMessages` / `OrchestratorComposer` UI — renders real agent messages
- Multi-agent layout (rail + panels) — triggered by `spawn_agent` tool calls
- Sidebar, background chips, model icons — driven by domain events
- Review/accept/reject flow — driven by LLM calling `review_agent_work`, `accept_work`, etc.
- `OrchestratorControlRoom` — still displays run/task/worker state

### New

- System prompt injection in provider adapters (both Claude and Codex)
- Tool call interception for orchestration tools in both adapters
- Thread type field (`"orchestrator"` | `"agent"`) on thread creation
- Sidebar buttons: "New Orchestrator" (default) + "New Agent Thread"
- Visual styling distinction between orchestrator and agent threads

## System Prompt Injection

### On thread creation

When a provider session starts for an orchestrator thread:

1. Read `docs/ORCHESTRATOR.md` fresh from disk (not cached — changes take effect on next thread)
2. Prepend to the system prompt before the provider's default instructions
3. Register the 38 orchestration tools as available tools alongside normal coding tools

### Claude adapter

Add orchestration tools to the `tools` array in the Claude API request alongside MCP tools and built-in tools. ORCHESTRATOR.md goes into the system prompt. The LLM sees both coding tools and orchestration tools and decides which to use.

### Codex adapter

Codex app-server manages its own tool registry. Orchestration tools are injected via `developer_instructions` in the session config as structured tool descriptions. When the LLM emits a function call matching an orchestration tool name:

1. `CodexAdapter` receives the `codex/event/agent_tool_call` JSON-RPC event
2. Checks if tool name is in `ORCHESTRATION_TOOL_NAMES`
3. If yes: execute via `OrchestrationToolRouter.executeTool()`, inject result back to the session
4. If no: handle normally (file edit, terminal, approval flow)

This is the same interception pattern used for Codex subagent tools.

## Tool Call Interception Flow

```
LLM turn running
  → LLM emits tool_use: spawn_agent({ role: "backend", model: "codex", ... })
  → Provider adapter receives tool call
  → Is tool name in ORCHESTRATION_TOOL_NAMES?
    → Yes: route to OrchestrationToolRouter.executeTool()
      → Router dispatches orchestrator.worker.spawn command
      → Event emitted, projector updates read model
      → UI receives domain event, panels update
      → tool_result { workerId, threadId, status: "spawned" } returned to LLM
    → No: handle normally (file edit, terminal, etc.)
  → LLM receives tool_result, continues reasoning
  → LLM emits next tool call or final response
```

The chat transcript shows the full flow: the LLM's reasoning, each tool call with its result, and the final summary.

## Thread Types

### Orchestrator Thread (default)

- System prompt: ORCHESTRATOR.md + orchestration tool definitions + normal coding tools
- Behavior: prefers delegating to workers, manages task graph, reviews work
- Can spawn agents, monitor them, accept/reject work, merge branches
- Can also read files, run commands, edit code (but ORCHESTRATOR.md discourages this)
- Visual: subtle header badge "Orchestrator", composer placeholder "Ask the orchestrator..."

### Agent Thread (explicit choice)

- System prompt: normal coding tools only, no ORCHESTRATOR.md, no orchestration tools
- Behavior: standard coding agent — reads files, edits code, runs terminals
- Cannot spawn agents or use orchestration tools
- Visual: standard chat view, composer placeholder "Message..."

### Thread creation

The `thread.create` command gets a new optional field:

```typescript
threadType: Schema.optionalWith(
  Schema.Literal("orchestrator", "agent"),
  { default: () => "orchestrator" as const },
)
```

Default is `"orchestrator"`. The sidebar "New Agent Thread" button passes `threadType: "agent"`.

## Sidebar Buttons

The sidebar header gets two creation buttons:

```
[+ Orchestrator]     ← primary, default action
[+ Agent]            ← secondary, smaller/subtle
```

"+ Orchestrator" creates a thread with `threadType: "orchestrator"`.
"+ Agent" creates a thread with `threadType: "agent"`.

Thread entries in the sidebar show a small indicator for thread type (e.g., a tiny orchestrator icon vs agent icon next to the title).

## Simplified `send` Function

The `send` function in `useOrchestratorEngine.ts` becomes trivial:

```typescript
const send = useCallback(async (text: string) => {
  const trimmed = text.trim();
  if (!trimmed || !selectedModel) return;
  
  const api = readNativeApi();
  if (!api) return;
  
  await api.orchestration.dispatchCommand({
    type: "thread.turn.start",
    commandId: newCommandId(),
    threadId: currentThreadId,
    message: { messageId: newMessageId(), role: "user", text: trimmed, attachments: [] },
    modelSelection: selectedModelSelection,
    runtimeMode: "full-access",
    interactionMode: "default",
    createdAt: new Date().toISOString(),
  });
}, [currentThreadId, selectedModel, selectedModelSelection]);
```

That's it. The provider session handles everything. The LLM reasons, calls tools, spawns agents — all streamed to the chat transcript via domain events.

## Visual Distinction

Minimal differences between orchestrator and agent threads:

| Element | Orchestrator Thread | Agent Thread |
|---|---|---|
| Header badge | "Orchestrator" with grid icon | "Agent" with terminal icon |
| Composer placeholder | "Ask the orchestrator..." | "Message..." |
| `spawn_agent` tool calls | Render as "Agent Spawned" card with role/model | N/A (tool not available) |
| `accept_work` / `reject_work` | Render as review decision cards | N/A |
| Background color | Same | Same |
| Message bubbles | Same | Same |
| Tool call rendering | Same (but orchestration tools get custom icons) | Same |

## End-to-End Example

User opens app. Default view: sidebar + orchestrator chat (full width).

```
User: "Using Claude and Codex, build a YouTube clone and run it on a web server"

[LLM thinking streams to chat...]

Orchestrator: "I'll decompose this into two parallel tasks — a backend API 
and a React frontend. Codex is well-suited for the API layer, and Claude 
Sonnet will handle the frontend quickly."

[tool_use: spawn_agent({ role: "backend", task: "Build an Express API with 
video metadata endpoints, SQLite storage...", model: "codex", mode: "foreground", 
worktree: true })]

[tool_result: { workerId: "w1", threadId: "t1", status: "spawned" }]

[tool_use: spawn_agent({ role: "frontend", task: "Build a React YouTube clone 
UI with Tailwind CSS...", model: "claude-sonnet", mode: "foreground", 
worktree: true })]

[tool_result: { workerId: "w2", threadId: "t2", status: "spawned" }]

[UI transitions to rail + 2 panels]
[Sidebar shows: [X][C] YouTube clone]

Orchestrator: "Both agents are running. I'll monitor their progress."

[tool_use: wait_all({ timeout: 300000 })]

... agents work in their panels ...

[tool_result: { results: [{ workerId: "w1", status: "submitted" }, 
{ workerId: "w2", status: "submitted" }] }]

Orchestrator: "Both agents have submitted. Let me review their work."

[tool_use: review_agent_work({ workerId: "w1" })]
[tool_use: review_agent_work({ workerId: "w2" })]

... review results ...

Orchestrator: "Backend looks good — 5 endpoints, tests passing. Frontend 
has a minor issue with the video grid layout. Accepting backend, requesting 
a revision on frontend."

[tool_use: accept_work({ workerId: "w1" })]
[tool_use: request_revision({ workerId: "w2", changes: ["Fix video grid 
to use CSS grid instead of flexbox for proper 3-column layout"] })]
```

## Success Criteria

- User sends a message, the orchestrator LLM streams reasoning to the chat transcript
- Tool calls (spawn_agent, wait_all, review_agent_work) appear as visible items in the chat
- The orchestrator uses ORCHESTRATOR.md to guide its behavior without client-side routing code
- Both Claude and Codex can serve as the orchestrator's provider
- Sidebar has "New Orchestrator" and "New Agent" buttons
- Thread type persists and determines system prompt injection
- Existing agent thread functionality is unchanged
