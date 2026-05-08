# Blocker Log

Issues that could not be fixed after 3 honest attempts inside verified-build. Records attempted approaches, why each failed, and what would unblock it.

## Entries

### ORC-001 (deferred 2026-05-07, iter 39)

**Issue**: spawn_agent in scripts/orchestrate-mcp-server.ts makes 5 sequential wsRequest dispatches (run.create, task.create, thread.create, worker.spawn, turn.start) with no compensating-events on partial failure. If dispatch 4 fails after 1-3 succeeded, an orphan run/task/thread is left in the system.

**Audit-vs-reality clarification**: The audit's claim that "dispatch 5 starts a turn on a dead thread" is technically incorrect: in JS sequential `await`, if dispatch 4 throws, dispatch 5 never runs. The actual bug is orphan-state from successful early dispatches when a later one fails — still a P0 state-leak issue.

**Why deferred**:

1. The MCP server script runs as a separate stdio process. There is no existing test file for it (`scripts/orchestrate-mcp-server.test.ts` does not exist).
2. Verified-build bugfix-mode mandates a failing test that pins the bug BEFORE implementing the fix. Without a test harness for the stdio process, the discipline cannot be honored.
3. Building a test harness requires either (a) a stdio mock layer, or (b) a real WebSocket roundtrip with injected failure at a specific dispatch step. Both are substantive infrastructure work outside the scope of a single Phase B iteration.

**What would unblock**:

- A small test harness in scripts/ that spawns the MCP server, sends a spawn_agent tool call, and lets us inject a failure at a chosen step (e.g. via a controllable mock WS server).
- OR refactor: collapse the 5 dispatches into a single `orchestrator.spawnAgent` server-side handler (handleSpawnAgent already exists in OrchestrationToolRouter.ts; the MCP script would forward to it). The transactional concern moves server-side where tests already exist.
- The cleanup commands themselves are NOT blocked — decider already supports thread.delete, orchestrator.run.cancel, orchestrator.task.cancel, orchestrator.worker.terminate.

**Attempted approaches (1)**:

- Inline try/catch with backwards walk + cleanup dispatches: viable but cannot be tested without the harness above.

**Next action**: Either build the test harness (separate effort) or refactor to consolidate the dispatch chain server-side. Track as a follow-up issue.

### ORC-043 (deferred 2026-05-07, iter 69)

**Issue**: `dispatchCommand` and `getSnapshot` in wsServer.ts have no per-caller resource ownership check. Today's deployment is single-user with one shared auth token, but the API does not enforce or even model the concept of "this caller owns this thread/project/run". A future multi-tenant deployment would expose every user's data to every authenticated caller.

**Why deferred**:
1. **Schema migration**: every projection table that currently has a `projectId` or `threadId` would need an `ownerUserId` column. That's `projection_threads`, `projection_projects`, `projection_turns`, `projection_thread_messages`, `projection_thread_activities`, `projection_thread_proposed_plans`, `projection_thread_checkpoints`, `orchestrator_runs`, `orchestrator_tasks`, `orchestrator_workers` — at least 10 tables, plus their domain events.
2. **Decider invariants**: every command that targets an existing resource (`thread.message-send`, `thread.turn.start`, `orchestrator.task.assign`, etc.) needs an invariant that the caller's userId equals the resource's ownerUserId. That's ~30 commands across decider.ts.
3. **Auth plumbing**: the WS upgrade needs to bind a `userId` to the connection (via the auth token's mapped identity), then handleMessage and routeRequest need that userId in scope to feed dispatchCommand and getSnapshot.
4. **getSnapshot filtering**: the snapshot query needs to JOIN/filter by ownerUserId for every projection it returns. The orchestration engine's read model currently is one big in-memory snapshot; partitioning it by user is invasive.
5. **Single-user back-compat**: per the audit, "user id is 'default' and no behavior changes" for current deployments. That means we need a default-on-creation backfill migration plus a default-when-missing read-side fallback. Doable but spans every entity.

**Why a partial stub is misleading**: Adding a `userId` column without enforcing the invariant would suggest the system is multi-tenant when it is not. Adding the invariant without the schema migration would gate every command on a column that's always NULL. Either half-step risks shipping a security promise we can't keep.

**What would unblock**:
- A separate spec doc capturing: which entities have user ownership, how identity is established at the WS upgrade, what default identity means for legacy data, what migration path takes existing rows to `default`.
- A staged rollout: schema migration first (with default values), then auth plumbing, then the invariant gate, then read-side filtering.
- Each stage would be its own multi-iteration audit item with a verified-build test before/after for every command path.

**Attempted approaches (1)**:
- Considered a minimal `RequestIdentity = { userId: "default" }` plumbing through the upgrade path with no actual filtering. Rejected: it would be infrastructure with no observable behavior, and adding placeholder code for multi-tenancy without the surrounding invariants increases the risk of partial-implementation-feels-complete bugs later.

**Next action**: Capture as a sequence of follow-up issues or a separate "multi-tenant readiness" project. Out of scope for the audit's single-issue fix discipline.


## ORC-179 (deferred at iter 120): per-client domain event scoping

### What was attempted

Surveyed `apps/server/src/wsServer/pushBus.ts` and `apps/server/src/wsServer.ts`. Confirmed the bus uses `publishAll(channel, data)` with no recipient filter; the orchestration domain-event subscription at `wsServer.ts:1078-1080` broadcasts every event to every client via `pushBus.publishAll(ORCHESTRATION_WS_CHANNELS.domainEvent, event)`. Two clients on different projects each see events from the other.

### Why a single-iteration fix is risky

The complete fix needs:

1. **PushBus API extension**: `publishAll<C>(channel, data, recipientFilter?: (client: WebSocket) => boolean)`. Per-client filter applied inside the existing `recipients` loop. Backward-compatible: no filter means broadcast as today.
2. **Per-client subscription state**: `Ref<Map<WebSocket, Set<ProjectId> | "all">>` initialized to `"all"` for new clients. Pruned on disconnect via the existing `clients.delete` path.
3. **New WS message contract**: `orchestration.subscribeToProjects` request type added to `@orchestrate/contracts/ws.ts`, with `projectIds: ReadonlyArray<ProjectId> | "all"`. Schema bump in the contracts package.
4. **wsServer wiring**: orchestration.domainEvent push site (`wsServer.ts:1078-1080`) builds a predicate from the event's `projectId` (extract via a small pure helper) and the per-client subscription map.
5. **Client-side opt-in (apps/web)**: send the subscribe message on project-route mount with the visible projectId set; reset to `"all"` on root-route mount. Optional, since back-compat preserves current behavior for clients that never subscribe.
6. **Tests**: pushBus filter unit tests; integration test that two MockWebSockets with different subscriptions see disjoint event sets; wsServer route handler test for the new message.

That's roughly 5-6 distinct edit groups across pushBus, contracts, wsServer, web, and tests. Cramming all of them into a single iteration risks shipping a half-wired filter where the contract types exist but the wiring is incomplete, exactly the kind of "incomplete work" the project's `feedback_no_incomplete_work.md` rule prohibits.

### What would unblock it

A multi-iteration plan with explicit checkpoints:

- **Step A**: pushBus filter API extension (no behavior change yet) + 3 unit tests on the filter path.
- **Step B**: per-client subscription map + new `orchestration.subscribeToProjects` contract + handler in wsServer; default state still "all" so no behavior change.
- **Step C**: wire the orchestration.domainEvent stream through the predicate + integration test exercising two MockWebSockets with disjoint subscriptions.
- **Step D**: web-side opt-in (subscribe on project route mount) + e2e smoke.

Each step is one iteration. Track as separate ORC ids (ORC-179a..d) when the next sweep picks this up.


## ORC-184 (deferred at iter 123): thread-scoped WS response routing

### What was attempted

Reviewed scripts/orchestrate-mcp-server.ts:615-628 — the cited range is URL parsing (`buildOrchestrationWsUrls` and `redactOrchestrationWsUrlForLog`), NOT request/response routing. The actual `wsRequest` lives at lines 713-726 and the pendingMap at line 651 keys by `wsRequestId`. The MCP server is a one-shot tool dispatcher; it does not have a "navigate between threads" UI concept. The bug as described applies to apps/web/src/wsTransport.ts and the consumers of its responses.

Surveyed apps/web/src/wsTransport.ts. Each request resolves its own promise via the requestId routing. The race condition is in the CONSUMERS: React Query mutations and zustand store actions apply results without checking if the originating thread is still the active one.

### Why a single-iteration fix is risky

The complete fix needs:

1. **Audit pass**: identify every WS-driven mutation in apps/web/src/store.ts, the lib/* React Query options, and per-feature stores (composerDraft, splitView, terminalState, orchestratorPane). Some are inherently safe (replace-all snapshot updates), some are racy (per-thread diff cache, per-thread terminal state).
2. **Decision per call site**: AbortController on navigation OR per-result threadId equality check before applying. Both have tradeoffs.
3. **Contract change**: WS request envelope gains an optional `originatingThreadId`; the response middleware stamps it back on the resolved value so consumers can compare.
4. **Tests**: an integration test that simulates a fast thread-switch and asserts the response of the abandoned thread does NOT mutate the new thread's state.

That's a 5-7 file change spanning transport, contracts, three to five store modules, and tests. Not a one-iteration scope.

### What would unblock it

A staged plan, similar to ORC-179:

- **Step A**: extend the WS request contract with optional `originatingThreadId` (no behavior change).
- **Step B**: add a `useStaleSafeQuery` hook that wraps React Query with an originating-thread check.
- **Step C**: migrate the highest-risk per-thread queries (diff, turn detail, terminal state) one by one, each with a regression test simulating thread switch.
- **Step D**: extend to remaining call sites; add a lint rule banning bare WS-response mutations against thread-scoped state.

Track as ORC-184a..d.

