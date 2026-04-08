# Orchestrator Contract Design

## Purpose

The orchestrator is a durable task scheduler, reviewer, workspace manager, browser operator, and evidence-based closer for a tree of agents. It owns the user request end-to-end and is the only actor allowed to declare a run complete.

This document defines the contract — what the orchestrator is, what it can do, how it delegates, how it accepts work, and how it recovers from failure. The implementation plan follows from this contract.

## Authority Model: V1c — Full Capability, Bounded Authority

The root orchestrator is a first-class tool-using actor. The default runtime policy keeps it in bounded control-plane mode.

**Direct root work is allowed when:**
- The work is short and interruptible
- The scope is narrow (small file set, no destructive git)
- No separate worktree or branch isolation is needed
- No active worker already owns that scope
- The result is needed on the critical path right now

**The root must delegate when:**
- The task is multi-file or open-ended
- It needs sustained editing effort
- It benefits from parallel execution
- It needs workspace isolation
- It has a disjoint ownership boundary
- It would block the control plane from supervising other workers

**The missing deeper rule:** scheduler duties win. If direct work expands past its execution budget, the root stops and converts in-progress execution into a delegated task (self-demotion).

**V1 policy defaults:**
- Root direct write budget: single semantic unit, small file set, no destructive git, no overlapping active ownership
- Root direct time budget: short and interruptible
- If budget exceeded: convert to worker
- Max visible active workers: 4
- Max total active workers: 8
- Max delegation depth: 3
- Max children per worker: 4
- Control plane must remain responsive at all times

---

## Core Objects

### Run

One user request, owned end-to-end by the root orchestrator.

```
Run {
  runId: string
  projectId: string
  userRequest: string
  status: "active" | "completed" | "failed" | "cancelled"
  rootTaskId: string
  goals: string[]
  constraints: string[]
  spawnBudget: SpawnBudget
  createdAt: datetime
  updatedAt: datetime
  completedAt: datetime | null
  completionSummary: string | null
}
```

### Task

A unit of work with objective, dependencies, acceptance criteria, evidence requirements, scope, and owner.

```
Task {
  taskId: string
  runId: string
  parentTaskId: string | null          // null = root task
  title: string
  objective: string
  status: "pending" | "assigned" | "running" | "submitted" | "accepted"
        | "needs-rework" | "blocked" | "cancelled" | "failed"
  owner: "root" | workerId             // who is executing
  ownerKind: "orchestrator" | "worker"

  // Delegation contract
  stopCondition: string                // when should the worker stop
  readScope: string[]                  // paths/patterns worker can read
  writeScope: string[]                 // paths/patterns worker can write
  allowedTools: string[]               // tools the worker may use
  evidenceRequired: EvidenceRequirement[]
  escalationRules: string              // when to escalate to parent

  // Acceptance
  acceptanceCriteria: string[]
  checklist: ChecklistItem[]

  // Dependencies
  dependsOn: string[]                  // taskIds that must complete first
  blockedBy: string | null             // reason if status=blocked

  // Lifecycle
  assignedWorkerId: string | null
  iteration: number
  maxIterations: number
  createdAt: datetime
  updatedAt: datetime
  submittedAt: datetime | null
  acceptedAt: datetime | null
}
```

### Worker

A live agent thread assigned to exactly one active task at a time.

```
Worker {
  workerId: string
  runId: string
  threadId: string                     // the agent thread
  status: "idle" | "running" | "submitted" | "stuck" | "terminated"
  activeTaskId: string | null
  parentWorkerId: string | null        // null = spawned by root
  spawnBudget: SpawnBudget             // inherited from parent, may narrow
  workspace: Workspace

  createdAt: datetime
  updatedAt: datetime
  terminatedAt: datetime | null
  terminationReason: string | null
}
```

### Workspace

Branch/worktree/runtime/browser/session context attached to a worker.

```
Workspace {
  mode: "local" | "worktree"
  branch: string | null
  worktreePath: string | null
  cwd: string
  terminalIds: string[]
  browserSessionId: string | null
}
```

### Evidence

Immutable review artifact captured at a specific point in time.

```
Evidence {
  evidenceId: string
  taskId: string
  workerId: string
  type: "diff" | "file-snapshot" | "test-result" | "command-result"
      | "browser-trace" | "screenshot" | "log" | "aria-snapshot"
      | "computed-style" | "evaluate-result"
  capturedAt: datetime
  content: string                      // the actual evidence data
  contentTruncated: boolean
  metadata: Record<string, string>     // action, url, selector, etc.
}
```

### ChecklistItem

A requirement with typed evidence tracking.

```
ChecklistItem {
  id: string
  label: string
  status: "pending" | "passed" | "failed"
  evidenceType: "dom" | "interaction" | "computed-style" | "visual"
             | "test" | "command" | "diff" | "inferred" | null
  evidenceRefs: string[]               // evidenceIds backing this verdict
  notes: string | null
  verifiedAt: datetime | null
}
```

### Decision

A durable orchestrator event recording what the orchestrator decided and why.

```
Decision {
  decisionId: string
  runId: string
  taskId: string | null
  type: "answered" | "inspected" | "delegated" | "decomposed"
      | "spawned-worker" | "reassigned" | "accepted" | "rejected"
      | "blocked" | "cancelled" | "completed" | "self-demoted"
      | "budget-exceeded" | "stuck-detected" | "escalated"
  reason: string
  inputs: string                       // what the orchestrator considered
  createdAt: datetime
}
```

### SpawnBudget

Inherited constraints that narrow as delegation deepens.

```
SpawnBudget {
  maxDepth: number                     // remaining delegation depth
  maxChildren: number                  // max children this actor can spawn
  maxConcurrentWriters: number         // max parallel writers under this subtree
  maxTotalWorkers: number              // max workers in this subtree
  allowedTools: string[]               // tools this subtree may use
  writeScope: string[]                 // paths this subtree may write
}
```

---

## Routing Contract

The orchestrator decides among four actions for every new message:

### answer
Respond directly from available context. Used for status questions, clarification, reasoning about current evidence, or explaining orchestrator decisions.

### inspect
The orchestrator does direct work: reads files, runs a command, checks computed styles, operates the browser. Short, bounded, interruptible. No delegation. Results inform the next routing decision.

### delegate
Send a bounded task to a worker. The delegation contract includes objective, stop condition, scope, tools, evidence requirements, and escalation rules. A child worker may narrow scope but never broaden it.

### decompose
Break the request into multiple tasks with dependency ordering. Creates a task DAG. Independent tasks may be assigned to parallel workers. Dependent tasks are queued.

**Malformed routing output:** safe failure into `answer` with "I couldn't parse that routing decision. Could you rephrase?" Never blind delegation.

**Capability-classified routing:** The orchestrator declares a capability manifest. If the request fits within manifest bounds (short, narrow scope, critical path), route to `inspect`. If it exceeds bounds, route to `delegate` or `decompose`. The manifest is typed and auditable — not a prompt contract.

---

## Delegation Tree

- Recursive delegation is supported. A child worker may request child workers within its inherited spawn budget.
- Every spawn is registered and enforced by the root orchestrator, even if triggered by a child.
- Each delegation contract includes: objective, stop condition, read scope, write scope, allowed tools, evidence required, and escalation rules.
- A child may only narrow scope, never broaden beyond the parent's authority.
- The parent remains accountable for child outputs until root acceptance.

**Default V1 guardrails:**
- Max delegation depth: 3
- Max children per worker: 4
- Max concurrent writers: 4
- Max total active workers: 8
- Recursive delegation most useful for bounded explorer/reviewer/browser tasks

---

## Scheduling Rules

1. Identify the critical path and keep one owner on it.
2. Delegate independent sidecars in parallel: testing, browser validation, code search, docs, integration review.
3. Do not delegate urgent blocking work if the next action depends immediately on that result.
4. Avoid duplicate exploration across workers.
5. Prefer disjoint write scopes for parallel coders.
6. Assign a dedicated integration task when multiple coding workers converge.
7. While one worker runs, the root keeps reviewing, validating, or preparing downstream tasks.
8. Detect stuck workers (no progress for configurable timeout) and intervene, reroute, or escalate.
9. If root direct work expands past budget, self-demote into a worker assignment.

---

## Task Lifecycle

```
pending → assigned → running → submitted → accepted
                            ↘ needs-rework → running (iteration++)
                            ↘ blocked (waiting on dependency or external)
                            ↘ failed (unrecoverable)
                            ↘ cancelled (by root or user)
```

- Workers do not mark tasks `accepted`. They mark them `submitted`.
- Acceptance requires evidence matching the task's acceptance criteria.
- Every checklist item carries an evidence type and evidence refs.
- A run completes only when all required tasks are `accepted` and any integration task is `accepted`.

---

## Completion Logic

- A task ends in `accepted`, `needs-rework`, `blocked`, `cancelled`, or `failed`.
- `needs-rework` increments iteration and sends follow-up instruction.
- Max iterations per task: configurable (default 6).
- A run ends in `completed` when all leaf tasks are accepted.
- A run ends in `failed` when a critical-path task fails and no reroute is possible.
- A run ends in `cancelled` when the user explicitly cancels.
- The root answers directly when the user asks about status, reasoning, browser activity, or current evidence.

---

## Browser Model

The browser is a first-class orchestrator workspace.

**UI contract:**
- Pinned directly under the orchestrator header, above the message transcript.
- Collapsible like a dropdown, but anchored at the top when collapsed.
- Shows: current URL, mode (live/automation/stale), last action, step progress.
- The transcript scrolls independently beneath it.
- When the orchestrator is using browser automation, the user can watch it work.

**Validation contract:**
- Browser validation only counts if a session was actually opened and evidence was captured.
- Structural checks use ARIA snapshots and DOM. Valid evidence type: `dom`.
- Interactive checks use click/type/navigate actions. Valid evidence type: `interaction`.
- Visual/style claims require screenshots or `evaluate(getComputedStyle(...))`. Valid evidence type: `computed-style` or `visual`.
- Responsive claims require explicit `resize` plus post-resize verification.
- The orchestrator must never claim "browser validated" unless a browser session was opened.
- Browser actions are persistently logged as `Evidence` records, not transient UI.

**Session contract:**
- Preview sessions are durable per thread and reused across validation iterations.
- Direct "validate in browser" requests always open a real browser run.
- The orchestrator uses the active preview session URL when available, falling back to URL discovery only when no active session exists.
- "Using computer use..." message appears only AFTER `browser.openSession` succeeds.

---

## Panel and Window Model

**Worker panels:**
- Top-level active workers open as equal-sized panels by default.
- 2 workers: 50/50 split. 3-4 workers: equal grid.
- More than 4: active set plus overflow strip.
- Nested child workers appear grouped under parent unless promoted.
- A child becomes a peer panel when it is critical-path, user-pinned, blocked, or actively being reviewed.
- Completed workers collapse into summary cards, not disappear.

**Dual views:**
- The UI shows both a worker grid and a task tree.
- Pane layout is not the same as orchestration topology.
- The task tree shows the full DAG with status, ownership, and evidence.
- The worker grid shows the active execution surfaces.

---

## Workspace Isolation

- Parallel writers get separate branches or worktrees by default.
- The orchestrator prevents overlapping write scopes unless explicitly allowed.
- Browser/reviewer workers can share the main workspace (read-only).
- Integration work is owned by a specific worker or by the root in a controlled merge phase.
- Worker workspaces are created on assignment and cleaned up on termination (configurable retention).

---

## Recovery and Observability

**Server-canonical state:**
- Runs, tasks, workers, browser sessions, and evidence are all server-owned.
- The client is a projection/cache only.
- Refreshing the UI restores: run tree, panel layout, selected preview, active statuses.

**Crash-and-recover semantics:**
- Completed steps are permanent and never re-executed.
- An interrupted step is retried from scratch on resume.
- On reconnect, the server replays run state and the client resumes from last completed step.
- User can explicitly cancel any active run.
- New task while active: confirm abandon or queue.

**Observability requirements:**
- Each run has a durable timeline with task IDs, worker IDs, spawn parentage, timestamps, actions, and stop reasons.
- The system exposes why it answered, delegated, spawned children, and stopped.
- Track: stuck runs, repeated rework loops, browser session failures, merge conflicts, evidence gaps.
- Every decision is a persisted `Decision` event with inputs and reason.
- Every LLM call is logged with: provider, model, prompt length, response length, elapsed time, run/task/step context.

---

## Command/Event Lifecycle

This system extends the existing event-sourced orchestration domain model.

### New Commands

```
orchestrator.run.create        → creates Run + root Task
orchestrator.run.cancel        → cancels Run and all active tasks/workers
orchestrator.task.create       → creates Task in a Run
orchestrator.task.assign       → assigns Task to a Worker
orchestrator.task.submit       → worker marks task submitted
orchestrator.task.accept       → root accepts submitted task
orchestrator.task.reject       → root rejects with rework instruction
orchestrator.task.block        → marks task blocked with reason
orchestrator.task.cancel       → cancels a task
orchestrator.task.fail         → marks task failed
orchestrator.worker.spawn      → creates Worker with thread + workspace
orchestrator.worker.terminate  → terminates Worker
orchestrator.evidence.capture  → persists immutable Evidence record
orchestrator.decision.record   → persists Decision event
orchestrator.checklist.update  → updates task checklist with evidence refs
```

### New Events

Each command produces a corresponding event following the existing `decider → event → projector` pattern:

```
orchestrator.run.created
orchestrator.run.cancelled
orchestrator.run.completed
orchestrator.run.failed
orchestrator.task.created
orchestrator.task.assigned
orchestrator.task.submitted
orchestrator.task.accepted
orchestrator.task.rejected
orchestrator.task.blocked
orchestrator.task.cancelled
orchestrator.task.failed
orchestrator.worker.spawned
orchestrator.worker.terminated
orchestrator.evidence.captured
orchestrator.decision.recorded
orchestrator.checklist.updated
```

### New Read Model Additions

Add to `OrchestrationReadModel`:
```
runs: OrchestratorRun[]
tasks: OrchestratorTask[]
workers: OrchestratorWorker[]
evidence: OrchestratorEvidence[]       // recent, not full history
decisions: OrchestratorDecision[]      // recent, not full history
```

### New Database Tables

```
projection_orchestrator_runs
projection_orchestrator_tasks
projection_orchestrator_workers
projection_orchestrator_evidence
projection_orchestrator_decisions
```

---

## V1 Recommended Shape

- One root orchestrator per run.
- Up to 4 visible active worker panels.
- Up to 8 total active workers.
- Recursive delegation allowed, root-enforced spawn budgets.
- Root-owned browser workspace pinned at the top.
- Server-owned run/task/worker/evidence state.
- Evidence-based acceptance with explicit evidence types.
- Full tool capability for the root, bounded by authority policy.
- Capability-classified routing with safe failure defaults.
- Crash-and-recover with completed steps permanent.
- Every decision and LLM call persisted for observability.

---

## What This Replaces

The current system has:
- Client-side run state in localStorage (`orchestratorStateStore.ts`)
- A React effect watching `agentPhase` to trigger review (`useOrchestratorEngine.ts`)
- A two-option router (answer/delegate) with malformed→delegate fallback
- Single managed thread, no fan-out
- Ad-hoc CLI spawning for LLM calls (`handleOrchestratorComplete` in `wsServer.ts`)
- Browser preview as inline message card
- Checklist with no evidence types or refs
- No cancellation, resume, or stuck detection
- No persistent decisions or LLM call logging

All of the above is replaced by this contract. The existing event-sourced engine, checkpoint/diff flow, provider adapters, browser automation service, and terminal manager are retained and extended.
