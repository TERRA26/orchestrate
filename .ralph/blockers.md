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
