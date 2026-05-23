# Multi-Agent Orchestration Design

## Overview

Extend the Orchestrate orchestrator to programmatically spawn, manage, and coordinate multiple coding agents through tool calls. The orchestrator LLM decomposes tasks, assigns them to specialized agents running in parallel panels, monitors progress, reviews work, and merges results.

## Core Principles

- **Every thread is an orchestrator.** No separate mode. The orchestrator reads ORCHESTRATOR.md at session start and decides whether to answer directly or spawn agents.
- **Agents belong to their parent thread.** Spawned agents are children of the orchestrator thread, visible in the sidebar as a single expandable entry.
- **Model independence.** The orchestrator, each foreground agent, each background agent, and each subagent can run different models. The orchestrator selects models based on task characteristics.
- **Three-tier agent hierarchy.** Foreground agents (visible panels), background agents (silent, status chips), subagents (children of workers, invisible to user).
- **Configurable limits.** All budget constraints are configurable via ORCHESTRATOR.md and overridable per-thread.
- **Event-sourced.** All durable state changes flow through the existing orchestration engine as commands → events → projections.

## Agent Hierarchy

| Level             | Max (default)              | Visibility                           | Use Case                     |
| ----------------- | -------------------------- | ------------------------------------ | ---------------------------- |
| Foreground agents | 2                          | Full interactive panels side-by-side | Primary implementation tasks |
| Background agents | 6                          | Status chips in orchestrator rail    | Research, audits, test runs  |
| Subagents         | Per worker budget, depth 3 | Invisible (nested inside parent)     | Worker-spawned helpers       |

All limits configurable. Total workers per run: 12 (default).

## Interaction Model

**Orchestrator + direct access (Option B).** The user primarily talks to the orchestrator, which drives all agents. The user can also click into any foreground agent panel and send messages directly (override, nudge, clarify). The orchestrator remains aware of direct interventions.

## Layout

**Orchestrator Rail + Agent Panels (Option A).**

- No agents spawned: normal full-width chat view
- 1 agent: orchestrator rail (left, ~320px resizable) + 1 agent panel
- 2 agents: orchestrator rail + 2 agent panels (50/50, draggable divider)
- 3+ agents: rail + 2 foreground panels + background chips in rail

Transition from single-pane to rail+panels is automatic on first `spawn_agent`.

### Orchestrator Rail (top to bottom)

- Thread title + model icons
- Orchestrator chat transcript (scrollable, compact)
- Active run status bar (task count, worker count, elapsed time)
- Background agent chips (click to expand, double-click to promote)
- Composer (talk to orchestrator)

### Agent Panel

- Header: agent name/role, model icon, status indicator, task title
- Chat transcript: agent's conversation (tool calls, reasoning, output)
- Terminal output (collapsible)
- Footer: direct message composer (for user intervention)
- Border color matches agent's assigned color

### Transition Back

When all agents terminate and the run completes, the rail collapses and the view returns to full-width chat showing the orchestrator's summary.

## Sidebar Thread Display

Each thread shows model icons for active agents. Icons update in real-time.

**Collapsed (default):** Thread title + model icons + aggregate status.

**Expanded:** Shows child agents with individual status indicators.

```
[C][X] Build a todo app
 ├ Backend API (Codex) ⟳
 └ Frontend UI (Claude) ⟳
```

**Icon deduplication:** 3 Claude + 1 Codex = `[C×3][X]`

**Status indicators:**

- `⟳` running
- `✓` completed/accepted
- `✗` failed
- `⏳` waiting/queued
- `⏸` paused
- `!` stuck

## Tool Call Architecture

### Flow

```
User message → Orchestrator LLM turn
  → LLM emits orchestration tool calls (can be parallel)
  → Server intercepts, classifies as orchestration_tool_call
  → For each: dispatch command → event emitted → projector updates read model
  → tool_result returned to LLM
  → UI receives orchestration.domainEvent push → panels update
  → LLM continues reasoning with results
```

### Tool Classification

The server classifies tool calls from the orchestrator LLM. A new classification `orchestration_tool_call` routes to the orchestration engine instead of the provider. Regular coding tools (file edit, terminal) pass through unchanged.

### System Prompt Injection

When a thread starts:

1. Read `docs/ORCHESTRATOR.md` fresh from disk
2. Inject into system prompt after base prompt, before tool definitions
3. Append 38 orchestration tool definitions
4. Include project context (cwd, git state, available models)

## Tool Vocabulary (38 tools)

### Spawning & Lifecycle (8 tools)

**spawn_agent**

- Params: `role: string`, `task: string`, `model: string`, `mode: "foreground" | "background"`, `worktree: boolean`, `scope: { read?: string[], write?: string[], tools?: string[] }`
- Returns: `{ workerId, threadId, status }`
- Command: `orchestrator.worker.spawn`

**terminate_agent**

- Params: `workerId: string`, `reason: string`
- Returns: `{ success }`
- Command: `orchestrator.worker.terminate`

**restart_agent**

- Params: `workerId: string`, `model?: string`, `task?: string`
- Returns: `{ newWorkerId, threadId }`
- Commands: `orchestrator.worker.terminate` + `orchestrator.worker.spawn`

**clone_agent**

- Params: `workerId: string`, `mode: "foreground" | "background"`
- Returns: `{ newWorkerId, threadId }`
- Command: `orchestrator.worker.spawn` (new thread seeded with source worker's task description, acceptance criteria, and current diff as context — not conversation history)

**pause_agent**

- Params: `workerId: string`
- Returns: `{ success }`
- Command: `orchestrator.worker.pause` (new)

**resume_agent**

- Params: `workerId: string`, `instructions?: string`
- Returns: `{ success }`
- Command: `orchestrator.worker.resume` (new)

**promote_to_foreground**

- Params: `workerId: string`
- Returns: `{ success, panelSlot }`
- Command: `orchestrator.worker.promote` (new)

**demote_to_background**

- Params: `workerId: string`
- Returns: `{ success }`
- Command: `orchestrator.worker.demote` (new)

### Communication (5 tools)

**send_to_agent**

- Params: `workerId: string`, `message: string`, `priority: "normal" | "urgent"`
- Returns: `{ delivered }`
- Command: `orchestrator.message.send` (new)

**broadcast**

- Params: `message: string`, `filter?: { status?: string[], role?: string[] }`
- Returns: `{ delivered: string[] }`
- Command: `orchestrator.message.broadcast` (new)

**transfer_context**

- Params: `fromWorkerId: string`, `toWorkerId: string`, `content: { files?: string[], diff?: boolean, message?: string }`
- Returns: `{ success }`
- Command: `orchestrator.context.transfer` (new)

**ask_agent**

- Params: `workerId: string`, `question: string`, `timeout?: number`
- Returns: `{ response: string }`
- Synchronous: blocks until agent responds
- Command: `orchestrator.message.send` + wait for response event

**share_file**

- Params: `filePath: string`, `workerIds: string[]`
- Returns: `{ success }`
- Command: `orchestrator.context.transfer` (per worker)

### Monitoring (6 tools)

**get_agent_status**

- Params: `workerId: string`
- Returns: `{ status, activeTask, model, lastActivity, diffSummary }`
- Read-only: queries read model

**get_all_status**

- Params: none
- Returns: `{ agents: [...], foregroundCount, backgroundCount, completedCount }`
- Read-only: queries read model

**get_agent_diff**

- Params: `workerId: string`
- Returns: `{ filesChanged, insertions, deletions, diff }`
- Read-only: queries git diff in worker's worktree

**get_agent_logs**

- Params: `workerId: string`, `lines?: number`
- Returns: `{ output: string }`
- Read-only: queries terminal history

**get_background_results**

- Params: `workerId: string`
- Returns: `{ output, summary, artifacts }`
- Read-only: queries completed background worker

**get_spawn_tree**

- Params: none
- Returns: `{ tree: nested worker/subagent hierarchy }`
- Read-only: queries read model

### Coordination (5 tools)

**wait_agent**

- Params: `workerId: string`, `timeout?: number`
- Returns: `{ status, result }`
- Blocks until worker status is "submitted" or "terminated"

**wait_all**

- Params: `workerIds?: string[]`, `timeout?: number`
- Returns: `{ results: Array<{ workerId, status, result }> }`
- Blocks until all specified workers (or all if omitted) complete

**set_dependency**

- Params: `workerId: string`, `dependsOn: string[]`
- Returns: `{ success }`
- Command: `orchestrator.dependency.set` (new)

**merge_work**

- Params: `workerIds: string[]`, `targetBranch: string`, `strategy: "sequential" | "octopus"`
- Returns: `{ success, conflicts?: string[] }`
- Command: `orchestrator.work.merge-requested` (new)

**set_spawn_budget**

- Params: `workerId: string`, `budget: SpawnBudget`
- Returns: `{ success }`
- Modifies worker's inherited spawn budget

### Review & Quality (5 tools)

**review_agent_work**

- Params: `workerId: string`
- Returns: `{ diff, summary, checklistStatus }`
- Read-only: pulls diff and checklist from worker's task

**run_tests**

- Params: `workerId: string`, `command?: string`
- Returns: `{ passed: number, failed: number, output: string }`
- Executes test command in worker's worktree

**accept_work**

- Params: `workerId: string`, `evidence?: object`
- Returns: `{ success }`
- Command: `orchestrator.task.accept`

**reject_work**

- Params: `workerId: string`, `reason: string`, `instructions: string`
- Returns: `{ success }`
- Command: `orchestrator.task.reject`

**request_revision**

- Params: `workerId: string`, `changes: string[]`
- Returns: `{ success }`
- Command: `orchestrator.task.reject` (with specific rework items)

### UI & Panel Control (6 tools)

**focus_agent**

- Params: `workerId: string`
- Returns: `{ success }`
- Ephemeral: pushed to client, not persisted

**arrange_panels**

- Params: `layout: "side-by-side" | "stacked" | "grid"`
- Returns: `{ success }`
- Ephemeral: pushed to client, not persisted

**promote_panel**

- Params: `workerId: string`
- Returns: `{ success }`
- Ephemeral: expands panel to full width

**collapse_panel**

- Params: `workerId: string`
- Returns: `{ success }`
- Ephemeral: minimizes to chip in rail

**open_diff_view**

- Params: `workerId: string`, `filePath?: string`
- Returns: `{ success }`
- Ephemeral: opens diff panel for worker

**open_browser_preview**

- Params: `workerId: string`, `url?: string`
- Returns: `{ success }`
- Ephemeral: opens browser validation for worker

### Workspace & Resources (4 tools)

**assign_worktree**

- Params: `workerId: string`, `branch?: string`
- Returns: `{ worktreePath: string }`
- Creates git worktree for worker isolation

**set_model**

- Params: `workerId: string`, `model: string`, `reason?: string`
- Returns: `{ success }`
- Switches worker's provider session to a different model

**set_scope**

- Params: `workerId: string`, `scope: { read?: string[], write?: string[], tools?: string[] }`
- Returns: `{ success }`
- Replaces worker's scope constraints

**restrict_scope**

- Params: `workerId: string`, `remove: { tools?: string[], writePaths?: string[] }`
- Returns: `{ success }`
- Narrows worker's scope (cannot broaden)

## Event-Sourced Integration

### New Commands & Events

```
orchestrator.worker.pause       → orchestrator.worker.paused
orchestrator.worker.resume      → orchestrator.worker.resumed
orchestrator.worker.promote     → orchestrator.worker.promoted
orchestrator.worker.demote      → orchestrator.worker.demoted
orchestrator.message.send       → orchestrator.message.sent
orchestrator.message.broadcast  → orchestrator.message.broadcast-sent
orchestrator.context.transfer   → orchestrator.context.transferred
orchestrator.dependency.set     → orchestrator.dependency.set
orchestrator.work.merge-requested → orchestrator.work.merge-completed / merge-failed
```

### UI Directives (Ephemeral, Not Persisted)

```
orchestrator.ui.focus
orchestrator.ui.arrange
orchestrator.ui.promote-panel
orchestrator.ui.collapse-panel
orchestrator.ui.open-diff
orchestrator.ui.open-browser
```

Pushed to client via WebSocket but not stored in event store. Panel layout is client-side state. On reload, panels reset to default layout based on active workers.

### Read Model Extensions

```typescript
// New fields on OrchestrationReadModel
messages: Map<MessageId, OrchestratorMessage>;
dependencies: Map<WorkerId, Set<WorkerId>>;
workerVisibility: Map<WorkerId, "foreground" | "background">;
```

### Worker Status Extension

```typescript
// Current: "idle" | "running" | "submitted" | "stuck" | "terminated"
// New:     "idle" | "running" | "submitted" | "stuck" | "terminated" | "paused"
```

### Sequence Guarantee

All commands serialized through the single-writer orchestration engine. Parallel tool calls are serialized at the event store. Each event gets a monotonic sequence number. Clients replay in order for consistent state.

## ORCHESTRATOR.md Updates

New sections to add:

### Agent Tool Usage

- When to use foreground vs background agents
- Maximum 2 foreground for visual tasks, background for research/auditing
- Subagents for worker-spawned helpers (test writing, file searching)

### Model Selection Guide

- Opus: complex reasoning, architecture decisions, code review
- Codex: large repository edits, multi-file refactors
- Sonnet: fast implementation, frontend work, straightforward tasks
- Haiku: cheap research, dependency audits, documentation

### Panel Management

- Promote background agents when they need user attention
- Demote foreground agents when they're waiting on dependencies
- Auto-arrange on spawn, manual override via tool calls

### Coordination Patterns

- **Parallel independent:** spawn 2+ agents with no dependencies (backend + frontend)
- **Pipeline:** set_dependency so agent B waits for agent A (API first, then client)
- **Research-then-build:** background research agent feeds context to foreground builder
- **Review swarm:** multiple background agents review different aspects of a PR

### Budget Defaults

```
max_foreground_agents: 2
max_background_agents: 6
max_subagent_depth: 3
max_total_workers: 12
max_concurrent_writers: 4
```

## End-to-End Example

User: "Using 2 agents, create a todo app with a backend API and React frontend"

1. **Route:** Orchestrator classifies as `decompose`
2. **Decompose:** Two independent tasks identified
3. **Spawn (parallel):**
   - `spawn_agent({ role: "backend", task: "Express API...", model: "codex", mode: "foreground", worktree: true })`
   - `spawn_agent({ role: "frontend", task: "React UI...", model: "claude-sonnet", mode: "foreground", worktree: true })`
4. **UI transitions:** Rail + 2 panels. Sidebar shows `[X][C] Build a todo app`
5. **Monitor:** `wait_all()` blocks until both submit
6. **Review:** `review_agent_work()` + `run_tests()` for each
7. **Accept/Reject:** `accept_work()` or `reject_work()` with rework instructions
8. **Merge:** `merge_work(["w1", "w2"], "main", "sequential")`
9. **Report:** Orchestrator summarizes results to user. UI transitions back to single-pane.

## Success Criteria

- User says "Using 2 agents, create a backend and frontend of an app"
- Orchestrator decomposes, spawns 2 foreground agents with appropriate models
- Both agents work in parallel in visible side-by-side panels
- Orchestrator monitors progress, reviews work, runs tests
- Work is accepted and merged
- User can intervene by clicking into any agent panel and sending a direct message
- Sidebar shows the thread with both model icons and expandable agent list
