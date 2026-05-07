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

