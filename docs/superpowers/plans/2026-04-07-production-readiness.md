# Orchestrator Production Readiness Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address all audit findings to make the orchestrator production-grade: security defaults, branding, test hygiene, durable server-side run state, provider integration, immutable review artifacts, and observability.

**Architecture:** Extend the existing event-sourced orchestration domain model (commands → events → projections) with orchestrator run entities. Move run state from browser localStorage to the server. Route orchestrator LLM calls through a dedicated completion service instead of ad-hoc CLI spawning. Capture review artifacts as immutable snapshots at turn completion.

**Tech Stack:** TypeScript, Effect, Zustand, SQLite, Vitest, Bun

**Codebase patterns to follow:**
- Commands: `packages/contracts/src/orchestration.ts` (schema definitions)
- Decider: `apps/server/src/orchestration/decider.ts` (command → event translation)
- Projector: `apps/server/src/orchestration/projector.ts` (event → read model)
- Migrations: `apps/server/src/persistence/Migrations/` (Effect.gen + SqlClient)
- Services: `apps/server/src/orchestration/Services/` (ServiceMap.Service pattern)
- Layers: `apps/server/src/orchestration/Layers/` (Effect.gen implementations)

---

## Task Overview

| # | Task | Scope |
|---|------|-------|
| 1 | Security: loopback default + auth warning | Server config |
| 2 | Branding: align to "Orchestrate" | Docs, server, README |
| 3 | Fix GitManager.test.ts typecheck errors | Server tests |
| 4 | Clean all lint warnings | Multiple files |
| 5 | Update architecture docs | .docs/ |
| 6 | Fix failing web tests | Web tests |
| 7 | Define orchestrator run domain model (contracts) | Contracts |
| 8 | Server-side orchestrator run persistence | Server: decider, projector, migrations, services |
| 9 | Migrate orchestrator engine to server-backed runs | Web: useOrchestratorEngine, orchestratorStateStore |
| 10 | Route orchestrator LLM through dedicated completion service | Server: new service, replace CLI spawning |
| 11 | Immutable review artifact capture | Server: capture at turn completion |
| 12 | Observability: run-level metrics and tracing | Server: logging, metrics |
| 13 | Pinned browser workspace in orchestrator panel | Web: OrchestratorPanel layout, new OrchestratorBrowserWorkspace component |
| 14 | Browser validation truthfulness + explicit session management | Web: useOrchestratorEngine, OrchestratorPanel.logic |
| 15 | Checklist evidence types + browser-use reliability | Web: OrchestratorPanel.logic, OrchestratorMessages |
| 16 | Final validation | All packages |

---

### Task 1: Security — default to loopback binding

**Files:**
- Modify: `apps/server/src/main.ts`
- Modify: `apps/server/src/wsServer.ts`

- [ ] **Step 1: Read current host logic**

Read `apps/server/src/main.ts` lines 170-180.

- [ ] **Step 2: Default all modes to 127.0.0.1**

Change the host fallback so web mode no longer binds to all interfaces:

```typescript
// Before:
host = Option.getOrUndefined(input.host) ?? env.host ?? (mode === "desktop" ? "127.0.0.1" : undefined)

// After:
host = Option.getOrUndefined(input.host) ?? env.host ?? "127.0.0.1"
```

- [ ] **Step 3: Log auth warning at server startup**

In `wsServer.ts`, in the server creation function (before the connection handler), add:

```typescript
if (!serverConfig.authToken) {
  yield* Effect.log("WARNING: No auth token configured. WebSocket connections are unauthenticated. Set T3CODE_AUTH_TOKEN for production use.");
}
```

- [ ] **Step 4: Commit**

```bash
git commit -m "security: default to loopback binding, warn when auth disabled"
```

---

### Task 2: Branding consistency

**Files:**
- Modify: `README.md`, `CLAUDE.md`, `apps/server/src/main.ts`

- [ ] **Step 1: Audit branding**

```bash
grep -rn "T3 Code\|DP Code\|dpcode" README.md CLAUDE.md apps/server/src/main.ts
```

- [ ] **Step 2: Update all references**

- `README.md`: Change title and description from "T3 Code" to "Orchestrate"
- `CLAUDE.md`: Update project snapshot description
- `apps/server/src/main.ts`: Fix any startup log strings

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: align branding to Orchestrate"
```

---

### Task 3: Fix GitManager.test.ts typecheck errors

**Files:**
- Modify: `apps/server/src/git/Layers/GitManager.test.ts`

- [ ] **Step 1: Read errors and fix Effect context mismatches**

All 17 errors are "Missing 'unknown' in the expected Effect context" in test layer setup. Fix by adding missing services to test layers. Follow the pattern from `CheckpointReactor.test.ts` (already fixed).

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

- [ ] **Step 1: Remove all unused imports flagged by oxlint**

```bash
bun lint 2>&1 | grep "Unused"
```

Remove each unused import/variable.

- [ ] **Step 2: Verify 0 warnings**

```bash
bun lint
```

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: clear all lint warnings"
```

---

### Task 5: Update architecture documentation

**Files:**
- Modify: `.docs/architecture.md`, `.docs/provider-architecture.md`

- [ ] **Step 1: Document Claude provider in provider-architecture.md**

Update "Codex is the only implemented provider" → both Codex and Claude Agent are supported.

- [ ] **Step 2: Add orchestrator architecture section**

Add section to `architecture.md` describing the orchestrator loop: router → delegate → review → iterate. Note current client-side state with plan to move server-side.

- [ ] **Step 3: Commit**

```bash
git commit -m "docs: update architecture for Claude provider and orchestrator"
```

---

### Task 6: Fix failing web tests

- [ ] **Step 1: Run tests, fix each failure**

Known failures (all from dpcode merge — fix mock shapes, CSS assertions, or skip module resolution issues):
- `terminalStateStore.test.ts` — xterm unavailable → skip
- `ThreadTerminalDrawer.test.ts` — `self` undefined → skip
- `Sidebar.logic.test.ts` — CSS class mismatch → update assertions
- `threadEnvironment.test.ts` — missing properties → add fields
- `MessagesTimeline.test.tsx` — icon class → update assertion

- [ ] **Step 2: Verify**

```bash
cd /Users/christophe/Documents/Orchestrate/orchestrate && bun run test
```

- [ ] **Step 3: Commit**

```bash
git commit -m "fix: resolve failing web tests"
```

---

### Task 7: Define orchestrator run domain model (contracts)

**Files:**
- Modify: `packages/contracts/src/orchestration.ts`

This is the foundation. Define the schemas for orchestrator runs as first-class domain entities alongside threads and projects.

- [ ] **Step 1: Add OrchestratorRun schemas to orchestration.ts**

Add these schemas to `packages/contracts/src/orchestration.ts`:

```typescript
// ── Orchestrator Run ──────────────────────────────────────
export const OrchestratorRunId = Schema.String.pipe(Schema.brand("OrchestratorRunId"));
export type OrchestratorRunId = typeof OrchestratorRunId.Type;

export const OrchestratorRunStatus = Schema.Literals([
  "routing",      // Router LLM deciding
  "delegating",   // Sending instruction to agent
  "waiting",      // Agent working
  "reviewing",    // Reviewer LLM inspecting output
  "validating",   // Browser validation running
  "iterating",    // Sending follow-up to agent
  "completed",    // Run finished successfully
  "failed",       // Run failed
  "cancelled",    // User cancelled
]);
export type OrchestratorRunStatus = typeof OrchestratorRunStatus.Type;

export const OrchestratorRunStep = Schema.Struct({
  stepId: Schema.String,
  type: Schema.Literals(["route", "delegate", "review", "browser-validate", "iterate", "complete", "fail"]),
  status: OrchestratorRunStatus,
  detail: Schema.optionalKey(Schema.String),
  startedAt: IsoDateTime,
  completedAt: Schema.optionalKey(IsoDateTime),
  llmInput: Schema.optionalKey(Schema.String),
  llmOutput: Schema.optionalKey(Schema.String),
});
export type OrchestratorRunStep = typeof OrchestratorRunStep.Type;

export const OrchestratorChecklistItemSchema = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  status: Schema.Literals(["pending", "passed", "failed"]),
  notes: Schema.optionalKey(Schema.String),
});

export const OrchestratorRun = Schema.Struct({
  runId: OrchestratorRunId,
  threadId: ThreadId,
  projectId: ProjectId,
  userRequest: Schema.String,
  delegatedInstruction: Schema.optionalKey(Schema.String),
  status: OrchestratorRunStatus,
  iteration: Schema.Number,
  maxIterations: Schema.Number,
  requirementsChecklist: Schema.Array(OrchestratorChecklistItemSchema),
  steps: Schema.Array(OrchestratorRunStep),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  completedAt: Schema.optionalKey(IsoDateTime),
});
export type OrchestratorRun = typeof OrchestratorRun.Type;
```

- [ ] **Step 2: Add orchestrator run commands**

```typescript
// Commands
export const OrchestratorRunCreateCommand = Schema.Struct({
  type: Schema.Literal("orchestrator-run.create"),
  commandId: CommandId,
  runId: OrchestratorRunId,
  threadId: ThreadId,
  projectId: ProjectId,
  userRequest: Schema.String,
  maxIterations: Schema.Number,
  createdAt: IsoDateTime,
});

export const OrchestratorRunStepCommand = Schema.Struct({
  type: Schema.Literal("orchestrator-run.step"),
  commandId: CommandId,
  runId: OrchestratorRunId,
  step: OrchestratorRunStep,
  createdAt: IsoDateTime,
});

export const OrchestratorRunUpdateChecklistCommand = Schema.Struct({
  type: Schema.Literal("orchestrator-run.checklist.update"),
  commandId: CommandId,
  runId: OrchestratorRunId,
  checklist: Schema.Array(OrchestratorChecklistItemSchema),
  createdAt: IsoDateTime,
});

export const OrchestratorRunCompleteCommand = Schema.Struct({
  type: Schema.Literal("orchestrator-run.complete"),
  commandId: CommandId,
  runId: OrchestratorRunId,
  status: Schema.Literals(["completed", "failed", "cancelled"]),
  createdAt: IsoDateTime,
});
```

Add these to `DispatchableClientOrchestrationCommand` and `ClientOrchestrationCommand` unions.

- [ ] **Step 3: Add orchestrator run events**

```typescript
// Events
"orchestrator-run.created",
"orchestrator-run.step-recorded",
"orchestrator-run.checklist-updated",
"orchestrator-run.completed",
```

Add corresponding payload schemas and add to `OrchestrationEventType` and `OrchestrationEvent` union.

- [ ] **Step 4: Add runs to OrchestrationReadModel**

Add `runs: OrchestratorRun[]` to the `OrchestrationReadModel` struct alongside `projects` and `threads`.

- [ ] **Step 5: Verify contracts typecheck**

```bash
cd packages/contracts && bun run typecheck
```

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: define orchestrator run domain model in contracts"
```

---

### Task 8: Server-side orchestrator run persistence

**Files:**
- Create: `apps/server/src/persistence/Migrations/027_OrchestratorRuns.ts`
- Modify: `apps/server/src/persistence/Migrations.ts`
- Modify: `apps/server/src/orchestration/decider.ts`
- Modify: `apps/server/src/orchestration/projector.ts`
- Modify: `apps/server/src/persistence/Layers/ProjectionThreads.ts` (or new OrchestratorRuns)

- [ ] **Step 1: Create migration 027**

Create `apps/server/src/persistence/Migrations/027_OrchestratorRuns.ts`:

```typescript
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_orchestrator_runs (
      run_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      user_request TEXT NOT NULL,
      delegated_instruction TEXT,
      status TEXT NOT NULL DEFAULT 'routing',
      iteration INTEGER NOT NULL DEFAULT 1,
      max_iterations INTEGER NOT NULL DEFAULT 5,
      requirements_checklist TEXT NOT NULL DEFAULT '[]',
      steps TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_orchestrator_runs_thread
    ON projection_orchestrator_runs(thread_id)
  `;
});
```

- [ ] **Step 2: Register migration in Migrations.ts**

Add import and entry `[27, "OrchestratorRuns", Migration0027]`.

- [ ] **Step 3: Add command handlers to decider.ts**

Add cases for `orchestrator-run.create`, `orchestrator-run.step`, `orchestrator-run.checklist.update`, `orchestrator-run.complete`. Follow the existing pattern — validate state, return events.

- [ ] **Step 4: Add event handlers to projector.ts**

Add cases for `orchestrator-run.created`, `orchestrator-run.step-recorded`, `orchestrator-run.checklist-updated`, `orchestrator-run.completed`. Update the `runs` array in the read model.

- [ ] **Step 5: Add projection repository for runs**

Create persistence layer to read/write `projection_orchestrator_runs` table. Follow the pattern in `apps/server/src/persistence/Layers/ProjectionThreads.ts`.

- [ ] **Step 6: Verify server typecheck**

```bash
cd apps/server && bun run typecheck
```

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: server-side orchestrator run persistence"
```

---

### Task 9: Migrate orchestrator engine to server-backed runs

**Files:**
- Modify: `apps/web/src/components/orchestrator/useOrchestratorEngine.ts`
- Modify: `apps/web/src/orchestratorStateStore.ts`

- [ ] **Step 1: Update orchestrator engine to dispatch run commands**

In `useOrchestratorEngine.ts`, update the `send` function to:
1. Dispatch `orchestrator-run.create` command via `api.orchestration.dispatchCommand` instead of only storing in localStorage
2. Dispatch `orchestrator-run.step` for each phase transition (routing, delegating, reviewing, etc.)
3. Dispatch `orchestrator-run.checklist.update` when checklist changes
4. Dispatch `orchestrator-run.complete` when run finishes or fails

The engine should STILL use local state for UI responsiveness, but also persist to server for durability.

- [ ] **Step 2: Add run recovery from server state**

On component mount, if `orchestratorStateStore` has no active run but the server read model shows an active run for the current thread, recover the run state from the server.

Read runs from the orchestration snapshot: `api.orchestration.getSnapshot()` → `snapshot.runs`.

- [ ] **Step 3: Update orchestratorStateStore to sync with server**

Add a method to hydrate run state from server data. The store remains the source-of-truth for UI rendering, but the server becomes the source-of-truth for durability.

- [ ] **Step 4: Verify web typecheck**

```bash
cd apps/web && bun run typecheck
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: orchestrator engine persists runs to server domain model"
```

---

### Task 10: Route orchestrator LLM through dedicated completion service

**Files:**
- Create: `apps/server/src/orchestration/Services/OrchestratorCompletion.ts`
- Create: `apps/server/src/orchestration/Layers/OrchestratorCompletion.ts`
- Modify: `apps/server/src/wsServer.ts` (replace handleOrchestratorComplete)
- Modify: `apps/server/src/serverLayers.ts` (add service to layer)

- [ ] **Step 1: Define OrchestratorCompletion service interface**

Create `apps/server/src/orchestration/Services/OrchestratorCompletion.ts`:

```typescript
import type { OrchestratorCompleteInput, OrchestratorCompleteResult } from "@t3tools/contracts";
import { Effect, ServiceMap } from "effect";

export class OrchestratorCompletionError extends Schema.TaggedErrorClass<OrchestratorCompletionError>()(
  "OrchestratorCompletionError",
  { message: Schema.String, provider: Schema.String },
) {}

export interface OrchestratorCompletionShape {
  readonly complete: (
    input: OrchestratorCompleteInput,
  ) => Effect.Effect<OrchestratorCompleteResult, OrchestratorCompletionError>;
}

export class OrchestratorCompletion extends ServiceMap.Service<
  OrchestratorCompletion,
  OrchestratorCompletionShape
>()("t3/orchestration/Services/OrchestratorCompletion") {}
```

- [ ] **Step 2: Implement the service layer**

Create `apps/server/src/orchestration/Layers/OrchestratorCompletion.ts`. Move the CLI-spawning logic from `handleOrchestratorComplete` in wsServer.ts into this service. It should:
- Support both Claude and Codex providers
- Use `runProcess` with the correct CWD
- Log the completion request and response for observability
- Return structured results

- [ ] **Step 3: Update wsServer.ts to use the service**

Replace the inline `handleOrchestratorComplete` function with:
```typescript
case WS_METHODS.orchestratorComplete: {
  const body = stripRequestTag(request.body);
  const completionService = yield* OrchestratorCompletion;
  return yield* completionService.complete(body).pipe(
    Effect.mapError((cause) => new RouteRequestError({ message: cause.message })),
  );
}
```

- [ ] **Step 4: Add to server layers**

Register `OrchestratorCompletionLive` in `apps/server/src/serverLayers.ts`.

- [ ] **Step 5: Verify and commit**

```bash
cd apps/server && bun run typecheck
git commit -m "refactor: route orchestrator LLM through dedicated completion service"
```

---

### Task 11: Immutable review artifact capture

**Files:**
- Modify: `apps/web/src/components/orchestrator/useOrchestratorEngine.ts` (collectReviewArtifacts)
- Modify: `apps/server/src/orchestration/Layers/ProviderCommandReactor.ts` (capture on turn complete)

- [ ] **Step 1: Capture file snapshots at turn completion**

In `ProviderCommandReactor.ts`, when processing a `thread.turn-diff-completed` event, read the changed file contents at that moment and store them as part of the turn diff record. This makes the review artifacts immutable — captured at the exact moment the turn completes, not read later.

Add a `fileSnapshots` field to the turn diff completion data:
```typescript
// In the turn-diff-completed handler:
const fileSnapshots = await Promise.all(
  changedFiles.map(file => readFileAtPath(projectCwd, file.path))
);
// Store snapshots alongside diff data
```

- [ ] **Step 2: Update collectReviewArtifacts to prefer immutable snapshots**

In `useOrchestratorEngine.ts`, update `collectReviewArtifacts` to:
1. First try to read immutable file snapshots from the turn diff record
2. Only fall back to live file reads if snapshots aren't available (backward compat)
3. Log when falling back to live reads so we can track migration progress

- [ ] **Step 3: Verify and commit**

```bash
cd apps/web && bun run typecheck
cd ../server && bun run typecheck
git commit -m "feat: capture immutable file snapshots at turn completion for review"
```

---

### Task 12: Observability — run-level metrics and tracing

**Files:**
- Create: `apps/server/src/orchestration/orchestratorMetrics.ts`
- Modify: `apps/server/src/orchestration/Layers/OrchestratorCompletion.ts`
- Modify: `apps/web/src/components/orchestrator/useOrchestratorEngine.ts`

- [ ] **Step 1: Create orchestrator metrics module**

Create `apps/server/src/orchestration/orchestratorMetrics.ts` with structured logging for:
- Run lifecycle events (created, step completed, run completed/failed)
- LLM call duration and token usage (if available from CLI output)
- Review decisions (sufficient/insufficient, iteration count)
- Browser validation results (steps taken, pass/fail)

Use Effect's structured logging:
```typescript
yield* Effect.log("orchestrator.run.step").pipe(
  Effect.annotateLogs({
    runId,
    stepType: "review",
    duration: elapsed,
    decision: "insufficient",
    iteration: 2,
  }),
);
```

- [ ] **Step 2: Add timing to OrchestratorCompletion service**

Wrap each `complete` call with timing:
```typescript
const startTime = Date.now();
const result = yield* runProcess(...);
const elapsed = Date.now() - startTime;
yield* Effect.log("orchestrator.llm.complete").pipe(
  Effect.annotateLogs({ provider, model, elapsed, promptLength: prompt.length }),
);
```

- [ ] **Step 3: Add run summary logging to engine**

In `useOrchestratorEngine.ts`, when a run completes, log a summary via `api.orchestration.dispatchCommand` with a `orchestrator-run.step` recording the final state.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add orchestrator run-level metrics and tracing"
```

---

### Task 13: Pinned browser workspace in orchestrator panel

**Files:**
- Create: `apps/web/src/components/orchestrator/OrchestratorBrowserWorkspace.tsx`
- Modify: `apps/web/src/components/OrchestratorPanel.tsx`
- Modify: `apps/web/src/components/orchestrator/OrchestratorHeader.tsx`
- Modify: `apps/web/src/components/orchestrator/OrchestratorMessages.tsx`

The browser preview is currently an inline card inside the scrollable message transcript. It should be a pinned workspace surface directly under the header that persists as messages scroll beneath it.

- [ ] **Step 1: Create OrchestratorBrowserWorkspace component**

Create `apps/web/src/components/orchestrator/OrchestratorBrowserWorkspace.tsx`. This component:
- Renders directly under the orchestrator header, ABOVE the messages scroll area
- Is collapsible (toggle in header) but stays anchored at the top when visible
- Shows: current URL, session status (live/automation/stale), last browser action, current step number
- Uses `InlineEmbeddedBrowserCard` from `EmbeddedBrowserPane.tsx` for the actual browser rendering
- Has a status bar below the browser showing: `Live automation · Step 3/20 · Last action: click "Submit" · http://localhost:3000`

```tsx
interface OrchestratorBrowserWorkspaceProps {
  session: EmbeddedBrowserSession;
  isVisible: boolean;
  currentStep?: number;
  maxSteps?: number;
  lastAction?: string;
  sessionType: "live" | "automation" | "stale";
  onToggleVisibility: () => void;
}
```

- [ ] **Step 2: Move browser preview from messages to panel layout**

In `OrchestratorPanel.tsx`, insert `OrchestratorBrowserWorkspace` between `OrchestratorHeader` and `OrchestratorMessages`:

```tsx
<OrchestratorHeader ... />
{engine.threadBrowserSession && engine.isThreadBrowserSessionVisible ? (
  <OrchestratorBrowserWorkspace
    session={engine.threadBrowserSession}
    isVisible={engine.isThreadBrowserSessionVisible}
    sessionType={engine.browserSessionType}
    onToggleVisibility={engine.handleToggleBrowserPreview}
  />
) : null}
<OrchestratorMessages ... />
```

- [ ] **Step 3: Remove inline browser preview from OrchestratorMessages**

In `OrchestratorMessages.tsx`, remove the `threadBrowserSession && isThreadBrowserSessionVisible` block that renders `InlineEmbeddedBrowserCard` inline. Remove the `threadBrowserSession` and `isThreadBrowserSessionVisible` props from `OrchestratorMessagesProps`.

- [ ] **Step 4: Update header toggle to feel like a workspace control**

In `OrchestratorHeader.tsx`, update the browser toggle button to show the session status (e.g., "Browser" label with a colored dot for live/stale) instead of just an eye icon.

- [ ] **Step 5: Verify and commit**

```bash
cd apps/web && bun run typecheck
git commit -m "feat: pinned browser workspace in orchestrator panel"
```

---

### Task 14: Browser validation truthfulness + explicit session management

**Files:**
- Modify: `apps/web/src/components/orchestrator/useOrchestratorEngine.ts`
- Modify: `apps/web/src/components/OrchestratorPanel.logic.ts`

Fix the browser validation to be trustworthy as a product primitive.

- [ ] **Step 1: Never claim "Using computer use" before a session is open**

In `useOrchestratorEngine.ts`, find the progress message that says "Using computer use" or similar (around line 1112). Move it to AFTER `api.browser.openSession` succeeds, not before. Currently:

```
addProgressMessage("Using computer use to validate...") // LIE — no session yet
const session = await api.browser.openSession(...)      // session opens here
```

Fix to:
```
const session = await api.browser.openSession(...)      // open first
addProgressMessage("Browser session opened. Validating...") // truth
```

- [ ] **Step 2: Explicit browser-use requests must always open a real browser**

In `OrchestratorPanel.logic.ts`, fix `shouldHandleAsDirectBrowserValidationRequest` (around line 479) to:
1. Always open a real browser session when the user explicitly asks for browser validation
2. Not reuse older context or skip the browser run based on heuristics
3. Use the thread's current preview URL if one is already active, rather than trying to rediscover URLs from logs

- [ ] **Step 3: Prefer active preview session over URL scraping**

In `OrchestratorPanel.logic.ts`, update `selectBrowserValidationCandidate` (around line 915) to:
1. First check if there's an active `threadBrowserSession` with a known URL — use that directly
2. Only fall back to scraping URLs from reports/logs/diffs if no active session exists
3. Store the resolved preview URL on the run state so subsequent iterations reuse it

Pass the active browser session URL into the engine from the `useEmbeddedBrowserStateStore`.

- [ ] **Step 4: Make preview sessions durable per thread**

In `useOrchestratorEngine.ts`, when a browser session is opened during validation:
1. Store the session against the thread ID (already done via `embeddedBrowserStateStore`)
2. On subsequent validation cycles within the same run, reuse the existing session instead of opening a new one
3. Only close the session when the run completes (not after each validation step)

- [ ] **Step 5: Verify and commit**

```bash
cd apps/web && bun run typecheck
git commit -m "fix: browser validation truthfulness — no claims before sessions open, prefer active previews"
```

---

### Task 15: Checklist evidence types + browser-use reliability

**Files:**
- Modify: `packages/contracts/src/orchestration.ts` (or `apps/web/src/orchestratorTypes.ts`)
- Modify: `apps/web/src/components/OrchestratorPanel.logic.ts`
- Modify: `apps/web/src/components/orchestrator/OrchestratorMessages.tsx`

- [ ] **Step 1: Add evidence type to checklist items**

Extend the checklist item schema to include an `evidenceType` field:

```typescript
export const OrchestratorChecklistItemSchema = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  status: Schema.Literals(["pending", "passed", "failed"]),
  notes: Schema.optionalKey(Schema.String),
  evidenceType: Schema.optionalKey(Schema.Literals([
    "dom",              // ARIA snapshot / DOM structure check
    "interaction",      // Click/type/navigate action succeeded
    "computed-style",   // getComputedStyle or evaluate() CSS check
    "visual",           // Screenshot-based visual check
    "inferred",         // LLM inference without direct evidence
    "code-review",      // Source code review
    "test-result",      // Test execution result
  ])),
});
```

- [ ] **Step 2: Populate evidence type during review**

In `OrchestratorPanel.logic.ts`, when the reviewer LLM updates checklist items (`mergeChecklistWithReview`), have the reviewer indicate the evidence type for each item. Update the review prompt to instruct the LLM to classify each checklist verdict with an evidence type.

- [ ] **Step 3: Display evidence type in checklist UI**

In `OrchestratorMessages.tsx` `RequirementsChecklistCard`, show a small badge next to each checklist item indicating the evidence type:

```tsx
{item.evidenceType ? (
  <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
    {item.evidenceType}
  </span>
) : null}
```

- [ ] **Step 4: Never mark "browser validated" without a real session**

In `OrchestratorPanel.logic.ts`, update `mergeChecklistWithReview` to:
1. If an item's evidence type is "dom", "interaction", "computed-style", or "visual", verify that a browser session was actually opened during this review cycle
2. If no browser session was opened, downgrade the evidence type to "inferred" and add a note: "Browser validation was not performed"
3. This prevents the orchestrator from over-claiming browser validation

- [ ] **Step 5: Verify and commit**

```bash
cd packages/contracts && bun run typecheck
cd ../../apps/web && bun run typecheck
git commit -m "feat: checklist evidence types, reliable browser validation claims"
```

---

### Task 16: Final validation

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

ALL must pass with 0 errors, 0 lint warnings, 0 test failures.

- [ ] **Step 2: Manual smoke test**

```bash
bun dev
```

Verify:
- Server starts on 127.0.0.1 (not 0.0.0.0)
- Auth warning logged when no token configured
- Orchestrator panel: can type, select model, see effort picker
- Orchestrator panel: send a message, see router response
- Orchestrator panel: delegate a task, see run steps recorded
- Agent thread: task delegated, agent works, turn completes
- Review cycle: orchestrator reviews, checklist updated
- Run state: refresh page, run state recovered from server
- Browser workspace: pinned above messages, shows session status
- Browser workspace: collapses/expands from header toggle
- Browser validation: no "Using computer use" message before session opens
- Browser validation: checklist items show evidence type badges
- Browser validation: explicit "validate in browser" request opens real session
- Browser validation: active preview session reused across iterations

- [ ] **Step 3: Final commit**

```bash
git commit -m "chore: production readiness — all audit findings addressed"
```
