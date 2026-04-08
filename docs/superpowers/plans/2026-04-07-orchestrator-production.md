# Orchestrator Production Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the orchestrator defined in `docs/superpowers/specs/2026-04-07-orchestrator-contract-design.md` — a durable, multi-worker, multi-model, evidence-based task scheduler with a control-room UI.

**Architecture:** Replace the current client-side prompt loop with a server-canonical orchestration runtime. The server owns runs, tasks, workers, evidence, browser sessions, and decisions. The client is a projection/cache. The domain model follows the existing event-sourced pattern (commands → events → projections). Multi-model orchestration is per-task with typed policies. The UI is a control room with pinned browser workspace, worker panel canvas, task tree sidebar, and evidence inspector.

**Tech Stack:** TypeScript, Effect, Zustand, SQLite, Vitest, Bun, Tailwind CSS, Lucide, TanStack Router/Query

**Contract spec:** `docs/superpowers/specs/2026-04-07-orchestrator-contract-design.md`

---

## Plan Structure

Four workstreams executed in dependency order. Each workstream contains multiple tasks.

```
Workstream A: Hygiene (no architecture changes, execute first)
  Task 1: Security defaults
  Task 2: Branding
  Task 3: Server typecheck fixes
  Task 4: Lint cleanup
  Task 5: Test fixes
  Task 6: Documentation

Workstream B: Domain Contract + Runtime (the linchpin)
  Task 7: Core domain schemas in contracts
  Task 8: Multi-model schemas in contracts
  Task 9: Database migrations
  Task 10: Decider — command → event translation
  Task 11: Projector — event → read model
  Task 12: Persistence layer (repositories)
  Task 13: OrchestratorRuntime service
  Task 14: Routing protocol (answer/inspect/delegate/decompose)
  Task 15: Worker lifecycle (spawn, terminate, stuck detection)
  Task 16: Evidence capture pipeline
  Task 17: Cancellation, resume, crash recovery
  Task 18: WS API — expose orchestrator commands to client

Workstream C: Multi-Model Execution
  Task 19: Capability profiles and model registry
  Task 20: Task-level model selection engine
  Task 21: Cross-model review policy
  Task 22: Fallback and retry semantics
  Task 23: Root authority policy and self-demotion

Workstream D: Control-Room UI
  Task 24: Layout shell — left rail, canvas, inspector
  Task 25: Task tree sidebar
  Task 26: Worker panel canvas (1-4 grid, promote/demote/collapse)
  Task 27: Pinned browser workspace
  Task 28: Evidence inspector panel
  Task 29: Rich markdown block system
  Task 30: Orchestrator transcript with decision cards
  Task 31: Panel state machine (focus, collapse, bring-forward, compare)
  Task 32: Connect UI to server-canonical state
  Task 33: Final validation
```

---

## Workstream A: Hygiene

No architecture changes. Clean the codebase before building on it.

---

### Task 1: Security — loopback default + auth warning

**Files:**
- Modify: `apps/server/src/main.ts`
- Modify: `apps/server/src/wsServer.ts`

- [ ] **Step 1: Default all modes to 127.0.0.1**

In `apps/server/src/main.ts`, change the host fallback so web mode no longer binds to all interfaces:

```typescript
// Before:
host = Option.getOrUndefined(input.host) ?? env.host ?? (mode === "desktop" ? "127.0.0.1" : undefined)

// After:
host = Option.getOrUndefined(input.host) ?? env.host ?? "127.0.0.1"
```

- [ ] **Step 2: Log auth warning at server startup**

In `apps/server/src/wsServer.ts`, in the server creation Effect (before the connection handler loop), add:

```typescript
if (!serverConfig.authToken) {
  yield* Effect.log(
    "WARNING: No auth token configured. WebSocket connections are unauthenticated. " +
    "Set T3CODE_AUTH_TOKEN for production use."
  );
}
```

- [ ] **Step 3: Commit**

```bash
git commit -m "security: default to loopback binding, warn when auth disabled"
```

---

### Task 2: Branding — align to "Orchestrate"

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `apps/server/src/main.ts`

- [ ] **Step 1: Audit current branding**

```bash
grep -rn "T3 Code\|DP Code\|dpcode" README.md CLAUDE.md apps/server/src/main.ts
```

- [ ] **Step 2: Update README.md**

Change title and description from "T3 Code" to "Orchestrate". Describe the project accurately: a multi-agent orchestrator for coding agents with browser validation, built on an event-sourced runtime.

- [ ] **Step 3: Update CLAUDE.md**

Change "T3 Code is a minimal web GUI" to describe the orchestrate project. Keep technical details (package roles, Codex integration) accurate.

- [ ] **Step 4: Fix server startup log**

Find any "DP Code" or "T3 Code" strings in `apps/server/src/main.ts` startup log and change to "Orchestrate".

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: align branding to Orchestrate"
```

---

### Task 3: Fix server typecheck errors

**Files:**
- Modify: `apps/server/src/git/Layers/GitManager.test.ts`

- [ ] **Step 1: Fix all 17 Effect context type mismatches**

All errors are "Missing 'unknown' in the expected Effect context" in test layer setup. Add missing services to test layers. Follow the pattern from `CheckpointReactor.test.ts` (already fixed during merge #1).

- [ ] **Step 2: Verify**

```bash
cd apps/server && bun run typecheck 2>&1 | grep "error TS" | head -5
```

- [ ] **Step 3: Commit**

```bash
git commit -m "fix: resolve Effect context type errors in GitManager tests"
```

---

### Task 4: Clean all lint warnings

- [ ] **Step 1: Remove all unused imports**

```bash
bun lint 2>&1 | grep "Unused"
```

Remove each flagged import/variable.

- [ ] **Step 2: Verify 0 warnings**

```bash
bun lint
```

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: clear all lint warnings"
```

---

### Task 5: Fix failing web tests

- [ ] **Step 1: Fix each failure properly**

For each known failure:
- `terminalStateStore.test.ts` — mock the xterm module or provide a test shim, do not skip
- `ThreadTerminalDrawer.test.ts` — provide `self` global in test setup via `globalThis.self = globalThis`
- `Sidebar.logic.test.ts` — update CSS class assertions to match dpcode's current output
- `threadEnvironment.test.ts` — add missing properties to test fixtures
- `MessagesTimeline.test.tsx` — update icon class assertions (tabler → lucide)

Do NOT skip tests. Either fix the test or fix the runtime assumption.

- [ ] **Step 2: Verify**

```bash
cd /Users/christophe/Documents/Orchestrate/orchestrate && bun run test
```

- [ ] **Step 3: Commit**

```bash
git commit -m "fix: resolve all failing web tests"
```

---

### Task 6: Update architecture documentation

**Files:**
- Modify: `.docs/architecture.md`
- Modify: `.docs/provider-architecture.md`

- [ ] **Step 1: Document the target orchestrator architecture**

Update `.docs/architecture.md` to describe the target system from the contract spec:
- Multi-worker orchestrator with recursive delegation
- Server-canonical run/task/worker/evidence state
- Four routing actions: answer, inspect, delegate, decompose
- Evidence-based acceptance with typed evidence
- Multi-model per-task selection
- Control-room UI

Note what is implemented vs planned.

- [ ] **Step 2: Document both providers**

Update `.docs/provider-architecture.md`: both Codex and Claude Agent are supported. Claude uses the `claude` CLI binary via `ClaudeAdapter.ts`. Provider selection is per-thread via `ModelSelection.provider`.

- [ ] **Step 3: Commit**

```bash
git commit -m "docs: update architecture for target orchestrator and Claude provider"
```

---

## Workstream B: Domain Contract + Runtime

The linchpin. Define the domain model, make the server canonical, implement the runtime.

---

### Task 7: Core domain schemas in contracts

**Files:**
- Modify: `packages/contracts/src/orchestration.ts`

Define all core domain objects from the contract spec as Effect schemas.

- [ ] **Step 1: Add branded ID types**

```typescript
export const OrchestratorRunId = Schema.String.pipe(Schema.brand("OrchestratorRunId"));
export type OrchestratorRunId = typeof OrchestratorRunId.Type;

export const OrchestratorTaskId = Schema.String.pipe(Schema.brand("OrchestratorTaskId"));
export type OrchestratorTaskId = typeof OrchestratorTaskId.Type;

export const OrchestratorWorkerId = Schema.String.pipe(Schema.brand("OrchestratorWorkerId"));
export type OrchestratorWorkerId = typeof OrchestratorWorkerId.Type;

export const OrchestratorEvidenceId = Schema.String.pipe(Schema.brand("OrchestratorEvidenceId"));
export type OrchestratorEvidenceId = typeof OrchestratorEvidenceId.Type;

export const OrchestratorDecisionId = Schema.String.pipe(Schema.brand("OrchestratorDecisionId"));
export type OrchestratorDecisionId = typeof OrchestratorDecisionId.Type;
```

- [ ] **Step 2: Add enums and small schemas**

```typescript
export const OrchestratorRunStatus = Schema.Literals([
  "active", "completed", "failed", "cancelled",
]);

export const OrchestratorTaskStatus = Schema.Literals([
  "pending", "assigned", "running", "submitted",
  "accepted", "needs-rework", "blocked", "cancelled", "failed",
]);

export const OrchestratorWorkerStatus = Schema.Literals([
  "idle", "running", "submitted", "stuck", "terminated",
]);

export const OrchestratorRoutingAction = Schema.Literals([
  "answer", "inspect", "delegate", "decompose",
]);

export const OrchestratorEvidenceType = Schema.Literals([
  "diff", "file-snapshot", "test-result", "command-result",
  "browser-trace", "screenshot", "log", "aria-snapshot",
  "computed-style", "evaluate-result",
]);

export const OrchestratorChecklistEvidenceType = Schema.Literals([
  "dom", "interaction", "computed-style", "visual",
  "test", "command", "diff", "inferred",
]);

export const OrchestratorDecisionType = Schema.Literals([
  "answered", "inspected", "delegated", "decomposed",
  "spawned-worker", "reassigned", "accepted", "rejected",
  "blocked", "cancelled", "completed", "self-demoted",
  "budget-exceeded", "stuck-detected", "escalated",
]);

export const RequiredCapability = Schema.Literals([
  "code-edit", "repo-inspection", "browser-use", "structured-review",
  "planning", "integration", "test-execution", "large-context",
  "fast-response", "low-cost",
]);
```

- [ ] **Step 3: Add SpawnBudget schema**

```typescript
export const SpawnBudget = Schema.Struct({
  maxDepth: Schema.Number,
  maxChildren: Schema.Number,
  maxConcurrentWriters: Schema.Number,
  maxTotalWorkers: Schema.Number,
  allowedTools: Schema.Array(Schema.String),
  writeScope: Schema.Array(Schema.String),
});
export type SpawnBudget = typeof SpawnBudget.Type;
```

- [ ] **Step 4: Add Workspace schema**

```typescript
export const OrchestratorWorkspace = Schema.Struct({
  mode: Schema.Literals(["local", "worktree"]),
  branch: Schema.optionalKey(Schema.String),
  worktreePath: Schema.optionalKey(Schema.String),
  cwd: Schema.String,
  terminalIds: Schema.Array(Schema.String),
  browserSessionId: Schema.optionalKey(Schema.String),
});
export type OrchestratorWorkspace = typeof OrchestratorWorkspace.Type;
```

- [ ] **Step 5: Add ChecklistItem schema**

```typescript
export const OrchestratorChecklistItem = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  status: Schema.Literals(["pending", "passed", "failed"]),
  evidenceType: Schema.optionalKey(OrchestratorChecklistEvidenceType),
  evidenceRefs: Schema.optionalKey(Schema.Array(Schema.String)),
  notes: Schema.optionalKey(Schema.String),
  verifiedAt: Schema.optionalKey(IsoDateTime),
});
export type OrchestratorChecklistItem = typeof OrchestratorChecklistItem.Type;
```

- [ ] **Step 6: Add EvidenceRecord schema**

```typescript
export const OrchestratorEvidenceRecord = Schema.Struct({
  evidenceId: OrchestratorEvidenceId,
  taskId: OrchestratorTaskId,
  workerId: Schema.optionalKey(OrchestratorWorkerId),
  type: OrchestratorEvidenceType,
  capturedAt: IsoDateTime,
  content: Schema.String,
  contentTruncated: Schema.Boolean,
  metadata: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});
export type OrchestratorEvidenceRecord = typeof OrchestratorEvidenceRecord.Type;
```

- [ ] **Step 7: Add Decision schema**

```typescript
export const OrchestratorDecision = Schema.Struct({
  decisionId: OrchestratorDecisionId,
  runId: OrchestratorRunId,
  taskId: Schema.optionalKey(OrchestratorTaskId),
  type: OrchestratorDecisionType,
  reason: Schema.String,
  inputs: Schema.optionalKey(Schema.String),
  createdAt: IsoDateTime,
});
export type OrchestratorDecision = typeof OrchestratorDecision.Type;
```

- [ ] **Step 8: Add Task schema**

```typescript
export const OrchestratorTask = Schema.Struct({
  taskId: OrchestratorTaskId,
  runId: OrchestratorRunId,
  parentTaskId: Schema.optionalKey(OrchestratorTaskId),
  title: Schema.String,
  objective: Schema.String,
  status: OrchestratorTaskStatus,
  ownerKind: Schema.Literals(["orchestrator", "worker"]),
  ownerId: Schema.optionalKey(Schema.String),

  // Delegation contract
  stopCondition: Schema.optionalKey(Schema.String),
  readScope: Schema.optionalKey(Schema.Array(Schema.String)),
  writeScope: Schema.optionalKey(Schema.Array(Schema.String)),
  allowedTools: Schema.optionalKey(Schema.Array(Schema.String)),
  evidenceRequired: Schema.optionalKey(Schema.Array(OrchestratorEvidenceType)),
  escalationRules: Schema.optionalKey(Schema.String),

  // Acceptance
  acceptanceCriteria: Schema.Array(Schema.String),
  checklist: Schema.Array(OrchestratorChecklistItem),

  // Dependencies
  dependsOn: Schema.optionalKey(Schema.Array(OrchestratorTaskId)),
  blockedBy: Schema.optionalKey(Schema.String),

  // Model policy
  modelPolicy: Schema.optionalKey(Schema.suspend(() => OrchestratorModelPolicy)),

  // Lifecycle
  assignedWorkerId: Schema.optionalKey(OrchestratorWorkerId),
  iteration: Schema.Number,
  maxIterations: Schema.Number,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  submittedAt: Schema.optionalKey(IsoDateTime),
  acceptedAt: Schema.optionalKey(IsoDateTime),
});
export type OrchestratorTask = typeof OrchestratorTask.Type;
```

- [ ] **Step 9: Add Worker schema**

```typescript
export const OrchestratorWorker = Schema.Struct({
  workerId: OrchestratorWorkerId,
  runId: OrchestratorRunId,
  threadId: ThreadId,
  status: OrchestratorWorkerStatus,
  activeTaskId: Schema.optionalKey(OrchestratorTaskId),
  parentWorkerId: Schema.optionalKey(OrchestratorWorkerId),
  spawnBudget: SpawnBudget,
  workspace: OrchestratorWorkspace,
  modelBinding: Schema.optionalKey(Schema.suspend(() => OrchestratorWorkerModelBinding)),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  terminatedAt: Schema.optionalKey(IsoDateTime),
  terminationReason: Schema.optionalKey(Schema.String),
});
export type OrchestratorWorker = typeof OrchestratorWorker.Type;
```

- [ ] **Step 10: Add Run schema**

```typescript
export const OrchestratorRun = Schema.Struct({
  runId: OrchestratorRunId,
  projectId: ProjectId,
  userRequest: Schema.String,
  status: OrchestratorRunStatus,
  rootTaskId: OrchestratorTaskId,
  goals: Schema.Array(Schema.String),
  constraints: Schema.optionalKey(Schema.Array(Schema.String)),
  spawnBudget: SpawnBudget,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  completedAt: Schema.optionalKey(IsoDateTime),
  completionSummary: Schema.optionalKey(Schema.String),
});
export type OrchestratorRun = typeof OrchestratorRun.Type;
```

- [ ] **Step 11: Verify contracts typecheck**

```bash
cd packages/contracts && bun run typecheck
```

- [ ] **Step 12: Commit**

```bash
git commit -m "feat: core orchestrator domain schemas — Run, Task, Worker, Workspace, Evidence, Decision, SpawnBudget"
```

---

### Task 8: Multi-model schemas in contracts

**Files:**
- Modify: `packages/contracts/src/orchestration.ts`

- [ ] **Step 1: Add ModelCandidate schema**

```typescript
export const OrchestratorModelCandidate = Schema.Struct({
  provider: ProviderKind,
  model: Schema.String,
  weight: Schema.Number,
  reason: Schema.String,
});
```

- [ ] **Step 2: Add ModelPolicy schema**

```typescript
export const OrchestratorModelPolicy = Schema.Struct({
  executionMode: Schema.Literals(["root-direct", "worker"]),
  preferredModels: Schema.Array(OrchestratorModelCandidate),
  fallbackModels: Schema.optionalKey(Schema.Array(OrchestratorModelCandidate)),
  requiredCapabilities: Schema.Array(RequiredCapability),
  switchPolicy: Schema.Literals(["forbidden", "allow-on-retry", "allow-on-boundary"]),
  reviewMode: Schema.Literals([
    "same-model", "same-provider-different-model", "cross-provider", "root-decides",
  ]),
  maxRetriesPerModel: Schema.optionalKey(Schema.Number),
});
export type OrchestratorModelPolicy = typeof OrchestratorModelPolicy.Type;
```

- [ ] **Step 3: Add WorkerModelBinding schema**

```typescript
export const OrchestratorWorkerModelBinding = Schema.Struct({
  workerId: OrchestratorWorkerId,
  provider: ProviderKind,
  model: Schema.String,
  selectedAt: IsoDateTime,
  selectedBy: Schema.Literals([
    "root-policy", "root-override", "parent-request", "retry-policy",
  ]),
  selectionReason: Schema.String,
  inheritedFromTaskPolicy: Schema.Boolean,
  supersedesBindingId: Schema.optionalKey(Schema.String),
});
export type OrchestratorWorkerModelBinding = typeof OrchestratorWorkerModelBinding.Type;
```

- [ ] **Step 4: Add CapabilityProfile schema**

```typescript
export const OrchestratorCapabilityProfile = Schema.Struct({
  provider: ProviderKind,
  model: Schema.String,
  supports: Schema.Array(RequiredCapability),
  costTier: Schema.Literals(["low", "medium", "high"]),
  latencyTier: Schema.Literals(["low", "medium", "high"]),
});
export type OrchestratorCapabilityProfile = typeof OrchestratorCapabilityProfile.Type;
```

- [ ] **Step 5: Add FallbackPolicy schema**

```typescript
export const FailureClass = Schema.Literals([
  "timeout", "tool-failure", "malformed-output", "review-rejected",
  "capability-mismatch", "provider-unavailable",
]);

export const FallbackAction = Schema.Struct({
  action: Schema.Literals([
    "retry-same-model", "retry-same-provider", "switch-provider", "escalate",
  ]),
  maxAttempts: Schema.Number,
});

export const OrchestratorFallbackPolicy = Schema.Struct({
  onTimeout: FallbackAction,
  onToolFailure: FallbackAction,
  onMalformedOutput: FallbackAction,
  onReviewRejected: FallbackAction,
  onCapabilityMismatch: FallbackAction,
  onProviderUnavailable: FallbackAction,
});
export type OrchestratorFallbackPolicy = typeof OrchestratorFallbackPolicy.Type;
```

- [ ] **Step 6: Verify and commit**

```bash
cd packages/contracts && bun run typecheck
git commit -m "feat: multi-model schemas — ModelPolicy, WorkerModelBinding, CapabilityProfile, FallbackPolicy"
```

---

### Task 9: Orchestrator commands and events in contracts

**Files:**
- Modify: `packages/contracts/src/orchestration.ts`

- [ ] **Step 1: Add orchestrator commands**

Add these command schemas and include them in `DispatchableClientOrchestrationCommand` and `ClientOrchestrationCommand` unions:

```typescript
// Run lifecycle
"orchestrator.run.create"      // → creates Run + root Task
"orchestrator.run.cancel"      // → cancels Run and all active tasks/workers

// Task lifecycle
"orchestrator.task.create"     // → creates Task in a Run
"orchestrator.task.assign"     // → assigns Task to a Worker (or root)
"orchestrator.task.submit"     // → worker marks task submitted
"orchestrator.task.accept"     // → root accepts submitted task
"orchestrator.task.reject"     // → root rejects with rework instruction
"orchestrator.task.block"      // → marks task blocked with reason
"orchestrator.task.cancel"     // → cancels a task
"orchestrator.task.fail"       // → marks task failed

// Worker lifecycle
"orchestrator.worker.spawn"    // → creates Worker with thread + workspace
"orchestrator.worker.terminate" // → terminates Worker

// Evidence and decisions
"orchestrator.evidence.capture" // → persists immutable Evidence record
"orchestrator.decision.record"  // → persists Decision event
"orchestrator.checklist.update" // → updates task checklist with evidence refs
```

Each command needs a Schema.Struct with the appropriate fields from the domain schemas. Follow the existing pattern (e.g., `ProjectCreateCommand` in the same file).

- [ ] **Step 2: Add corresponding events**

Add event types to `OrchestrationEventType` and payload schemas to `OrchestrationEvent`:

```typescript
"orchestrator.run.created"
"orchestrator.run.cancelled"
"orchestrator.run.completed"
"orchestrator.run.failed"
"orchestrator.task.created"
"orchestrator.task.assigned"
"orchestrator.task.submitted"
"orchestrator.task.accepted"
"orchestrator.task.rejected"
"orchestrator.task.blocked"
"orchestrator.task.cancelled"
"orchestrator.task.failed"
"orchestrator.worker.spawned"
"orchestrator.worker.terminated"
"orchestrator.evidence.captured"
"orchestrator.decision.recorded"
"orchestrator.checklist.updated"
```

- [ ] **Step 3: Add to OrchestrationReadModel**

```typescript
// Add to OrchestrationReadModel struct:
orchestratorRuns: Schema.Array(OrchestratorRun),
orchestratorTasks: Schema.Array(OrchestratorTask),
orchestratorWorkers: Schema.Array(OrchestratorWorker),
```

Evidence and decisions are queried separately (too large for the snapshot).

- [ ] **Step 4: Verify and commit**

```bash
cd packages/contracts && bun run typecheck
git commit -m "feat: orchestrator commands, events, and read model extensions"
```

---

### Task 10: Database migrations

**Files:**
- Create: `apps/server/src/persistence/Migrations/027_OrchestratorRuns.ts`
- Create: `apps/server/src/persistence/Migrations/028_OrchestratorTasks.ts`
- Create: `apps/server/src/persistence/Migrations/029_OrchestratorWorkers.ts`
- Create: `apps/server/src/persistence/Migrations/030_OrchestratorEvidence.ts`
- Create: `apps/server/src/persistence/Migrations/031_OrchestratorDecisions.ts`
- Modify: `apps/server/src/persistence/Migrations.ts`

- [ ] **Step 1: Create each migration**

Follow the existing pattern (Effect.gen + SqlClient). Each migration creates one table with appropriate columns and indexes. Use `TEXT` for JSON-serialized fields (checklist, spawnBudget, modelPolicy, workspace). Use `TEXT` for branded IDs. Add indexes on `run_id`, `thread_id`, `status`, `parent_task_id`, `parent_worker_id`.

- [ ] **Step 2: Register all migrations in Migrations.ts**

Add imports and entries `[27, ...], [28, ...], [29, ...], [30, ...], [31, ...]`.

- [ ] **Step 3: Verify and commit**

```bash
cd apps/server && bun run typecheck
git commit -m "feat: database migrations for orchestrator runs, tasks, workers, evidence, decisions"
```

---

### Task 11: Decider — orchestrator command handlers

**Files:**
- Modify: `apps/server/src/orchestration/decider.ts`

- [ ] **Step 1: Add command handlers for all 15 orchestrator commands**

Follow the existing pattern in the decider's exhaustive switch. Each handler:
1. Validates state invariants (e.g., run exists, task belongs to run, worker owns task)
2. Returns one or more events using `withEventBase`
3. Uses `requireRun`, `requireTask`, `requireWorker` helpers (create these)

Key invariants:
- `orchestrator.run.create`: project must exist, no duplicate runId
- `orchestrator.task.assign`: task must be pending, worker must be idle or root
- `orchestrator.task.submit`: only the assigned worker can submit
- `orchestrator.task.accept`: only root can accept, task must be submitted
- `orchestrator.worker.spawn`: run must be active, spawn budget not exceeded
- `orchestrator.checklist.update`: task must exist, evidence refs must exist

- [ ] **Step 2: Update the exhaustive switch default to include new command types**

The decider uses `satisfies never` for exhaustiveness. Add all new command types.

- [ ] **Step 3: Verify and commit**

```bash
cd apps/server && bun run typecheck
git commit -m "feat: decider handlers for orchestrator run/task/worker/evidence commands"
```

---

### Task 12: Projector — orchestrator event handlers

**Files:**
- Modify: `apps/server/src/orchestration/projector.ts`

- [ ] **Step 1: Add event handlers for all 17 orchestrator events**

Follow the existing pattern. Each handler:
1. Decodes the event payload
2. Updates the read model immutably (add/update arrays for runs, tasks, workers)
3. Uses helper functions for array updates (similar to existing `updateThread`)

Key projections:
- `orchestrator.run.created`: add run to `orchestratorRuns[]`
- `orchestrator.task.created`: add task to `orchestratorTasks[]`
- `orchestrator.task.assigned`: update task status + assignedWorkerId
- `orchestrator.task.submitted`: update task status + submittedAt
- `orchestrator.task.accepted`: update task status + acceptedAt, check if run completes
- `orchestrator.worker.spawned`: add worker to `orchestratorWorkers[]`
- `orchestrator.evidence.captured`: store in evidence table (not in read model snapshot)
- `orchestrator.decision.recorded`: store in decisions table (not in read model snapshot)
- `orchestrator.checklist.updated`: update task's checklist items with evidence refs

- [ ] **Step 2: Verify and commit**

```bash
cd apps/server && bun run typecheck
git commit -m "feat: projector handlers for orchestrator events"
```

---

### Task 13: Persistence layer — orchestrator repositories

**Files:**
- Create: `apps/server/src/persistence/Services/OrchestratorRuns.ts`
- Create: `apps/server/src/persistence/Layers/OrchestratorRuns.ts`
- Modify: `apps/server/src/persistence/Layers/ProjectionPipeline.ts`

- [ ] **Step 1: Create repository service interface**

Define `OrchestratorRunsShape` with methods:
- `upsertRun`, `upsertTask`, `upsertWorker`
- `insertEvidence`, `insertDecision`
- `getRunById`, `getTasksByRunId`, `getWorkersByRunId`
- `getEvidenceByTaskId`, `getDecisionsByRunId`
- `getActiveRuns`

- [ ] **Step 2: Create SQLite implementation**

Follow the pattern in `ProjectionThreads.ts`. Map domain schemas to SQL rows. Serialize JSON fields.

- [ ] **Step 3: Wire into ProjectionPipeline**

Add orchestrator projections to the pipeline so events are persisted to the new tables.

- [ ] **Step 4: Verify and commit**

```bash
cd apps/server && bun run typecheck
git commit -m "feat: orchestrator persistence repositories"
```

---

### Task 14: OrchestratorRuntime service

**Files:**
- Create: `apps/server/src/orchestration/Services/OrchestratorRuntime.ts`
- Create: `apps/server/src/orchestration/Layers/OrchestratorRuntime.ts`

- [ ] **Step 1: Define the service interface**

```typescript
interface OrchestratorRuntimeShape {
  // Run lifecycle
  createRun(input: CreateRunInput): Effect<OrchestratorRun>
  cancelRun(runId: OrchestratorRunId): Effect<void>

  // Task lifecycle
  createTask(input: CreateTaskInput): Effect<OrchestratorTask>
  assignTask(taskId, assignee): Effect<void>
  submitTask(taskId, workerId): Effect<void>
  acceptTask(taskId): Effect<void>
  rejectTask(taskId, instruction): Effect<void>
  blockTask(taskId, reason): Effect<void>

  // Worker lifecycle
  spawnWorker(input: SpawnWorkerInput): Effect<OrchestratorWorker>
  terminateWorker(workerId, reason): Effect<void>
  detectStuckWorkers(timeout): Effect<OrchestratorWorkerId[]>

  // Evidence
  captureEvidence(input): Effect<OrchestratorEvidenceRecord>

  // Decisions
  recordDecision(input): Effect<OrchestratorDecision>

  // Queries
  getRun(runId): Effect<OrchestratorRun | null>
  getActiveRuns(): Effect<OrchestratorRun[]>
  getTaskTree(runId): Effect<OrchestratorTask[]>
  getWorkers(runId): Effect<OrchestratorWorker[]>
}
```

- [ ] **Step 2: Implement the service layer**

The implementation dispatches orchestration commands through `OrchestrationEngineService.dispatch()` — same pattern as the existing system. Each method:
1. Builds the appropriate command
2. Dispatches via the engine
3. Returns the projected state

- [ ] **Step 3: Add to server layers**

Register `OrchestratorRuntimeLive` in `serverLayers.ts`.

- [ ] **Step 4: Verify and commit**

```bash
cd apps/server && bun run typecheck
git commit -m "feat: OrchestratorRuntime service — run/task/worker lifecycle"
```

---

### Task 15: Routing protocol

**Files:**
- Create: `apps/server/src/orchestration/Services/OrchestratorRouter.ts`
- Create: `apps/server/src/orchestration/Layers/OrchestratorRouter.ts`

- [ ] **Step 1: Define typed routing protocol**

Replace the prompt-only router with a typed protocol:

```typescript
type RoutingInput = {
  userMessage: string
  activeRun: OrchestratorRun | null
  activeTasks: OrchestratorTask[]
  activeWorkers: OrchestratorWorker[]
  recentDecisions: OrchestratorDecision[]
  rootCapabilities: RequiredCapability[]
}

type RoutingDecision =
  | { action: "answer"; response: string; shouldContinueRun: boolean }
  | { action: "inspect"; plan: InspectionPlan }
  | { action: "delegate"; taskDraft: TaskDraft }
  | { action: "decompose"; subtasks: TaskDraft[] }

interface OrchestratorRouterShape {
  route(input: RoutingInput): Effect<RoutingDecision>
}
```

- [ ] **Step 2: Implement with capability classification**

The router:
1. Classifies the request against root capabilities
2. Checks if the request fits within direct-execution budgets (short, narrow scope, critical path)
3. Falls back to LLM routing for ambiguous cases
4. On malformed LLM output: returns `{ action: "answer", response: "Could not parse..." }`
5. Never defaults to delegate on malformed output

- [ ] **Step 3: Verify and commit**

```bash
cd apps/server && bun run typecheck
git commit -m "feat: typed routing protocol — answer/inspect/delegate/decompose"
```

---

### Task 16: Worker lifecycle

**Files:**
- Modify: `apps/server/src/orchestration/Layers/OrchestratorRuntime.ts`
- Modify: `apps/server/src/orchestration/Layers/ProviderCommandReactor.ts`

- [ ] **Step 1: Implement worker spawn with workspace isolation**

When spawning a worker:
1. Create a new thread via `thread.create`
2. If task requires worktree isolation: create worktree via git manager
3. Initialize workspace with cwd, branch, worktree path
4. Bind model per task's ModelPolicy
5. Register worker with root-enforced spawn budget
6. Record spawn decision

- [ ] **Step 2: Implement stuck detection**

A worker is stuck when:
- No turn completion for configurable timeout (default 10 minutes)
- No activity appended for configurable timeout
- Worker enters error loop (3+ consecutive failures)

Detection runs on a timer. When stuck:
1. Record `stuck-detected` decision
2. Options: reroute task to new worker, escalate to root, escalate to user

- [ ] **Step 3: Implement worker termination**

When terminating:
1. Stop provider session if active
2. Clean up worktree if policy says so (configurable retention)
3. Update worker status to `terminated`
4. If active task: mark blocked or reassign

- [ ] **Step 4: Wire into ProviderCommandReactor**

The reactor needs to know which workers are orchestrator-managed so it can:
- Route turn completions to the orchestrator runtime
- Trigger review when a worker's turn completes

- [ ] **Step 5: Verify and commit**

```bash
cd apps/server && bun run typecheck
git commit -m "feat: worker lifecycle — spawn, stuck detection, termination, workspace isolation"
```

---

### Task 17: Evidence capture pipeline

**Files:**
- Modify: `apps/server/src/orchestration/Layers/CheckpointReactor.ts`
- Create: `apps/server/src/orchestration/Layers/EvidenceCapture.ts`

- [ ] **Step 1: Capture immutable file snapshots at turn completion**

In `CheckpointReactor.ts`, when processing `thread.turn-diff-completed`:
1. Read changed files at that moment
2. Create `OrchestratorEvidenceRecord` entries for each file snapshot
3. Persist via `orchestrator.evidence.capture` command
4. Store diff as evidence too

This makes review artifacts immutable — captured at the exact turn completion, not read later from disk.

- [ ] **Step 2: Capture browser validation evidence**

When browser validation runs:
1. Each browser action + observation → evidence record
2. Screenshots → evidence records
3. ARIA snapshots → evidence records
4. Final validation summary → evidence record

All keyed to the task and worker.

- [ ] **Step 3: Verify and commit**

```bash
cd apps/server && bun run typecheck
git commit -m "feat: evidence capture pipeline — immutable file snapshots and browser traces"
```

---

### Task 18: Cancellation, resume, crash recovery

**Files:**
- Modify: `apps/server/src/orchestration/Layers/OrchestratorRuntime.ts`

- [ ] **Step 1: Implement cancellation**

`orchestrator.run.cancel`:
1. Set run status to `cancelled`
2. Cancel all active tasks (set to `cancelled`)
3. Terminate all active workers
4. Record cancellation decision

`orchestrator.task.cancel`:
1. Set task status to `cancelled`
2. If worker is assigned: terminate or reassign
3. If dependent tasks exist: block them

- [ ] **Step 2: Implement resume on reconnect**

When the server starts or a client reconnects:
1. Query `getActiveRuns()` from persistence
2. For each active run: check worker health, resume monitoring
3. Completed steps are permanent — never re-execute
4. Interrupted steps (run was active, no completion event): retry from scratch
5. Emit run state to client via existing `orchestration.domainEvent` channel

- [ ] **Step 3: Verify and commit**

```bash
cd apps/server && bun run typecheck
git commit -m "feat: cancellation, resume, crash recovery for orchestrator runs"
```

---

### Task 19: WS API — expose orchestrator commands to client

**Files:**
- Modify: `packages/contracts/src/ws.ts`
- Modify: `apps/server/src/wsServer.ts`
- Modify: `apps/web/src/wsNativeApi.ts`

- [ ] **Step 1: Add WS methods for orchestrator**

Add to `WS_METHODS`:
```typescript
orchestratorCreateRun: "orchestrator.createRun",
orchestratorCancelRun: "orchestrator.cancelRun",
orchestratorGetRun: "orchestrator.getRun",
orchestratorGetActiveRuns: "orchestrator.getActiveRuns",
orchestratorGetTaskTree: "orchestrator.getTaskTree",
orchestratorGetWorkers: "orchestrator.getWorkers",
orchestratorGetEvidence: "orchestrator.getEvidence",
```

- [ ] **Step 2: Add route handlers in wsServer.ts**

Each handler delegates to `OrchestratorRuntime` service.

- [ ] **Step 3: Add client API in wsNativeApi.ts**

Add `orchestrator` namespace with typed methods.

- [ ] **Step 4: Verify and commit**

```bash
cd packages/contracts && bun run typecheck
cd ../../apps/server && bun run typecheck
cd ../web && bun run typecheck
git commit -m "feat: WS API for orchestrator run/task/worker queries"
```

---

## Workstream C: Multi-Model Execution

---

### Task 20: Capability profiles and model registry

**Files:**
- Create: `apps/server/src/orchestration/Services/ModelRegistry.ts`
- Create: `apps/server/src/orchestration/Layers/ModelRegistry.ts`

- [ ] **Step 1: Define static capability profiles**

Create a registry of known models with their capability profiles:

```typescript
const CAPABILITY_PROFILES: OrchestratorCapabilityProfile[] = [
  { provider: "codex", model: "gpt-5.4", supports: ["code-edit", "planning", ...], costTier: "high", latencyTier: "medium" },
  { provider: "claudeAgent", model: "claude-opus-4-6", supports: ["code-edit", "structured-review", ...], costTier: "high", latencyTier: "medium" },
  // ... more models
];
```

- [ ] **Step 2: Implement ModelRegistry service**

```typescript
interface ModelRegistryShape {
  getProfiles(): Effect<OrchestratorCapabilityProfile[]>
  findCandidates(required: RequiredCapability[]): Effect<OrchestratorModelCandidate[]>
  resolveBinding(policy: OrchestratorModelPolicy): Effect<WorkerModelBinding>
}
```

- [ ] **Step 3: Verify and commit**

```bash
cd apps/server && bun run typecheck
git commit -m "feat: model registry with capability profiles"
```

---

### Task 21: Task-level model selection engine

**Files:**
- Modify: `apps/server/src/orchestration/Layers/OrchestratorRuntime.ts`

- [ ] **Step 1: Implement model selection in worker spawn**

When spawning a worker:
1. Read task's `modelPolicy`
2. Filter candidates by required capabilities
3. Rank by weight, cost tier, latency tier
4. Bind top candidate
5. Record selection reason in `WorkerModelBinding`
6. Persist binding event

- [ ] **Step 2: Verify and commit**

```bash
git commit -m "feat: task-level model selection in worker spawn"
```

---

### Task 22: Cross-model review policy

**Files:**
- Modify: `apps/server/src/orchestration/Layers/OrchestratorRuntime.ts`

- [ ] **Step 1: Implement review model selection**

When reviewing a submitted task:
1. Read task's `modelPolicy.reviewMode`
2. If `cross-provider`: select a reviewer model from a different provider than the implementation model
3. If `same-model`: use the same model
4. Record review model binding

- [ ] **Step 2: Verify and commit**

```bash
git commit -m "feat: cross-model review policy"
```

---

### Task 23: Fallback and retry semantics

**Files:**
- Modify: `apps/server/src/orchestration/Layers/OrchestratorRuntime.ts`

- [ ] **Step 1: Implement structured retry**

On worker failure:
1. Classify failure (timeout, tool-failure, malformed-output, etc.)
2. Look up `FallbackPolicy.onFailure[class]`
3. Execute action (retry-same-model, retry-same-provider, switch-provider, escalate)
4. Track attempts per model
5. Record fallback decision

- [ ] **Step 2: Verify and commit**

```bash
git commit -m "feat: structured fallback and retry with failure classification"
```

---

### Task 24: Root authority policy and self-demotion

**Files:**
- Create: `apps/server/src/orchestration/Services/AuthorityPolicy.ts`
- Create: `apps/server/src/orchestration/Layers/AuthorityPolicy.ts`

- [ ] **Step 1: Define authority policy service**

```typescript
interface AuthorityPolicyShape {
  canExecuteDirectly(input: {
    taskObjective: string
    estimatedScope: "tiny" | "small" | "medium" | "large"
    estimatedDuration: "instant" | "short" | "medium" | "long"
    writeScope: string[]
    activeWorkers: OrchestratorWorker[]
  }): Effect<{ allowed: boolean; reason: string }>

  shouldSelfDemote(input: {
    startedAt: datetime
    elapsedMs: number
    filesModified: number
    activeWorkers: OrchestratorWorker[]
  }): Effect<{ demote: boolean; reason: string }>
}
```

- [ ] **Step 2: Implement V1 defaults**

- Direct work allowed: tiny/small scope, instant/short duration, no overlapping ownership, <=2 files
- Self-demotion trigger: elapsed > 30s, or files modified > 3, or active workers waiting
- On self-demotion: convert in-progress work to a delegated task, spawn worker

- [ ] **Step 3: Verify and commit**

```bash
cd apps/server && bun run typecheck
git commit -m "feat: root authority policy with self-demotion"
```

---

## Workstream D: Control-Room UI

---

### Task 25: Layout shell — left rail, canvas, inspector

**Files:**
- Create: `apps/web/src/components/orchestrator/OrchestratorControlRoom.tsx`
- Create: `apps/web/src/components/orchestrator/OrchestratorLeftRail.tsx`
- Create: `apps/web/src/components/orchestrator/OrchestratorInspector.tsx`
- Modify: `apps/web/src/components/OrchestratorPanel.tsx`

- [ ] **Step 1: Create the control room layout shell**

Replace the current single-column OrchestratorPanel with a three-column layout:
- Left rail (collapsible, ~240px): run tree, task hierarchy, worker list, filters
- Main canvas (flex-1): pinned browser workspace + worker panels + transcript
- Right inspector (collapsible, ~280px): selected task details, evidence, model binding, retries

Use CSS Grid or Flexbox with resizable dividers.

- [ ] **Step 2: Create OrchestratorLeftRail**

Shows:
- Current run info (title, status, elapsed time)
- Task tree (hierarchy with status badges, click to inspect)
- Active workers (name, status, provider badge)
- Filters: blocked, needs-review, browser, completed

- [ ] **Step 3: Create OrchestratorInspector**

Shows details of the selected entity (task, worker, or evidence):
- Task: objective, status, checklist, model policy, evidence refs
- Worker: thread, provider/model, workspace, active task
- Evidence: content viewer, metadata, timestamp

- [ ] **Step 4: Verify and commit**

```bash
cd apps/web && bun run typecheck
git commit -m "feat: control room layout shell — left rail, canvas, inspector"
```

---

### Task 26: Task tree sidebar

**Files:**
- Create: `apps/web/src/components/orchestrator/TaskTreeView.tsx`

- [ ] **Step 1: Implement recursive task tree**

Render the task DAG as a collapsible tree:
- Each node: title, status badge, owner badge, model badge
- Expand/collapse children
- Click to select (opens in inspector)
- Visual hierarchy: root task → subtasks → sub-subtasks
- Status colors: pending=gray, running=blue, submitted=amber, accepted=green, failed=red, blocked=orange

- [ ] **Step 2: Verify and commit**

```bash
git commit -m "feat: task tree sidebar with recursive rendering"
```

---

### Task 27: Worker panel canvas

**Files:**
- Create: `apps/web/src/components/orchestrator/WorkerCanvas.tsx`
- Create: `apps/web/src/components/orchestrator/WorkerPanel.tsx`

- [ ] **Step 1: Implement worker canvas with grid layout**

| Workers | Layout |
|---------|--------|
| 1 | Centered large panel |
| 2 | 50/50 horizontal split |
| 3 | 2+1 (top row 50/50, bottom row centered) |
| 4 | 2x2 grid |
| 5+ | 4 visible + overflow strip at bottom |

Each `WorkerPanel` shows:
- Provider/model badge in header
- Task title and status
- Live thread transcript (reuse existing chat rendering)
- Status indicator (active/waiting/blocked/reviewing)

- [ ] **Step 2: Implement panel states**

| State | Visual |
|-------|--------|
| active | Default, prominent border |
| waiting | Dimmed, subtle pulse |
| blocked | Amber/red edge + auto-promote to first position |
| reviewing | Moving accent on header |
| accepted | Desaturated + summary ribbon |
| stale | Lowered contrast |

- [ ] **Step 3: Implement promote/demote/bring-forward**

- Click panel: focus (subtle highlight)
- Double-click or keyboard shortcut: promote to dominant (other panels shrink to strips)
- "Bring forward": stage-manager model, not modal takeover
- Completed panels: collapse to summary card in overflow

- [ ] **Step 4: Verify and commit**

```bash
git commit -m "feat: worker panel canvas with grid layout and state machine"
```

---

### Task 28: Pinned browser workspace

**Files:**
- Create: `apps/web/src/components/orchestrator/OrchestratorBrowserWorkspace.tsx`

- [ ] **Step 1: Create pinned browser workspace**

Renders directly under the orchestrator header, ABOVE the worker canvas:
- Shows: current URL, session mode (live/automation/stale), last action, step progress
- Collapsible to a compact status ribbon
- Uses `InlineEmbeddedBrowserCard` for the actual browser rendering
- Status bar: `Live automation · Step 3/20 · Last action: click "Submit" · http://localhost:3000`

- [ ] **Step 2: Wire to server-owned browser session state**

Browser sessions are keyed to run/task/worker. The workspace reads from the server state, not from client-only `embeddedBrowserStateStore`.

- [ ] **Step 3: Verify and commit**

```bash
git commit -m "feat: pinned browser workspace in control room"
```

---

### Task 29: Evidence inspector panel

**Files:**
- Modify: `apps/web/src/components/orchestrator/OrchestratorInspector.tsx`

- [ ] **Step 1: Add evidence viewer**

When an evidence record is selected:
- Show type badge (diff, file-snapshot, browser-trace, screenshot, etc.)
- Show content with syntax highlighting for code/diffs
- Show metadata (worker, timestamp, task)
- For browser traces: show action sequence with observations
- For screenshots: render inline image

- [ ] **Step 2: Link checklist items to evidence**

Each checklist item's `evidenceRefs` are clickable links to evidence records in the inspector.

- [ ] **Step 3: Verify and commit**

```bash
git commit -m "feat: evidence inspector with linked checklist items"
```

---

### Task 30: Rich markdown block system

**Files:**
- Create: `apps/web/src/components/orchestrator/OrchestratorBlockRenderer.tsx`

- [ ] **Step 1: Implement custom block types**

Extend markdown rendering in the orchestrator transcript with first-class blocks:

- **Decision card**: framed block with type badge, reason, timestamp
- **Task card**: title, status, owner, model badge, checklist summary
- **Evidence strip**: type, source, timestamp, clickable to inspector
- **Verdict banner**: accepted/rejected with summary and evidence count
- **Worker mention**: `@worker/frontend-2` renders as clickable badge
- **Task ref**: `#task/api-auth` renders as clickable link
- **Evidence ref**: `ev:browser-14` renders as clickable badge

- [ ] **Step 2: Implement chat role styling**

| Role | Treatment |
|------|-----------|
| User request | Clean speech bubble (matches main chat) |
| Orchestrator decision | Framed decision card |
| Thinking/progress | Slim timeline row (check when done) |
| Worker submission | Submission card with model badge |
| Review verdict | Verdict banner |
| Browser validation | Evidence strip |
| System warning | High-signal alert block |

- [ ] **Step 3: Verify and commit**

```bash
git commit -m "feat: rich markdown blocks — decisions, tasks, evidence, verdicts"
```

---

### Task 31: Orchestrator transcript

**Files:**
- Modify: `apps/web/src/components/orchestrator/OrchestratorMessages.tsx`

- [ ] **Step 1: Replace simple message list with decision-aware transcript**

The transcript reads from server-canonical decisions and renders them using the block system from Task 30. Each decision event becomes a block. The transcript is not just chat messages — it's a durable timeline of orchestrator actions with evidence links.

- [ ] **Step 2: Verify and commit**

```bash
git commit -m "feat: decision-aware orchestrator transcript"
```

---

### Task 32: Panel state machine

**Files:**
- Create: `apps/web/src/components/orchestrator/panelStateStore.ts`

- [ ] **Step 1: Implement panel state management**

Zustand store tracking:
- Which panels are visible (max 4 active + overflow)
- Which panel is focused
- Which panel is promoted (dominant mode)
- Collapsed panels (chip representation)
- Panel layout (grid configuration)

State transitions:
- `focus(panelId)`: highlight panel
- `promote(panelId)`: panel becomes dominant, others shrink to strips
- `demote()`: return to grid
- `collapse(panelId)`: panel becomes chip in overflow
- `expand(panelId)`: chip becomes panel (may displace another)
- `compare(panelId1, panelId2)`: side-by-side with evidence inspector

- [ ] **Step 2: Verify and commit**

```bash
git commit -m "feat: panel state machine — focus, promote, collapse, compare"
```

---

### Task 33: Connect UI to server-canonical state

**Files:**
- Modify: `apps/web/src/components/orchestrator/useOrchestratorEngine.ts`
- Modify: `apps/web/src/orchestratorStateStore.ts`

- [ ] **Step 1: Replace client-local state with server projections**

The engine hook should:
1. Read run/task/worker state from server via `orchestrator.getActiveRuns`, `orchestrator.getTaskTree`, etc.
2. Subscribe to `orchestration.domainEvent` for real-time updates
3. Use React Query for caching/invalidation
4. Remove the localStorage-based `orchestratorStateStore` run tracking
5. Keep `orchestratorStateStore` only for UI-local concerns (composer draft, input text)

The server is the single source of truth. The client renders projections.

- [ ] **Step 2: Verify and commit**

```bash
cd apps/web && bun run typecheck
git commit -m "feat: connect UI to server-canonical orchestrator state"
```

---

### Task 34: Final validation

- [ ] **Step 1: Full validation suite**

```bash
export PATH="$HOME/.bun/bin:$PATH"
cd /Users/christophe/Documents/Orchestrate/orchestrate
bun fmt
bun lint
cd packages/contracts && bun run typecheck
cd ../shared && bun run typecheck
cd ../../apps/web && bun run typecheck
cd ../server && bun run typecheck
cd /Users/christophe/Documents/Orchestrate/orchestrate && bun run test
```

ALL must pass with 0 errors, 0 warnings, 0 test failures.

- [ ] **Step 2: Smoke test**

```bash
bun dev
```

Verify:
- Server starts on 127.0.0.1
- Auth warning logged when no token configured
- Orchestrator control room renders: left rail, canvas, inspector
- Can create a run from the orchestrator input
- Router classifies request (answer/inspect/delegate/decompose)
- Worker spawns with correct provider/model binding
- Task tree shows hierarchy
- Worker panel shows live agent transcript
- Browser workspace pinned, shows session status
- Evidence captured at turn completion
- Checklist items linked to evidence
- Cross-model review works (different provider reviews implementation)
- Cancellation stops run and terminates workers
- Page refresh recovers full run state from server
- Completed workers collapse to summary cards
- Panel promote/demote/bring-forward works

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: orchestrator production build — all audit findings addressed"
```
