# Round 3 — downstream gaps from second analysis

Date: 2026-04-21
Branch: fix/orchestrator-remediations (13 commits ahead of main)

## What the second gap-analysis surfaced

After Round 2 shipped (A/B/C+F/D/G), an Explore-agent pass found four concrete downstream cracks the first analysis missed. All four land in `bd233f89`.

### Gap H — orchestrate_get_agent_status returns the submit report

**Broken:** `handleGetAgentStatus` in `apps/server/src/orchestration/Layers/OrchestrationToolRouter.ts:299-318` and the MCP mirror in `scripts/orchestrate-mcp-server.ts:530-548` returned only `{ status, visibility, activeTaskId, threadId, updatedAt }`. The fields I added to `OrchestratorTask` in Round 2's C+F (`submitSummary`, `filesWritten`, `testsRun`, `submitNotes`, `hasChanges`, `diffStats`) were projected but not exposed through the status tool. Orchestrator couldn't read the structured report I told ORCHESTRATOR.md to rely on.

**Fixed:** both handlers now look up the worker's active task and merge its submit-report fields into the status response.

**Test:** new `Gap H` case in `OrchestrationToolRouter.test.ts` asserts all four report fields surface on a worker with a submitted task.

### Gap I — MCP server exposure of get_agent_diff / get_agent_logs

**Broken:** `scripts/orchestrate-mcp-server.ts` declares ~21 tools in its tools array. `orchestrate_get_agent_diff` and `orchestrate_get_agent_logs` were NOT among them. The Codex orchestrator, which consumes this MCP schema over stdio, could not call these tools even though Round 2 / previous commits wired handlers server-side. Falls through to `{ status: "unimplemented" }` at line 826.

**Fixed:** both tools now declared in the tools array with proper JSON-Schema input definitions AND inline handlers that compute against the snapshot (mirror of the router-side implementation so the shape is identical regardless of whether the orchestrator is Claude SDK or Codex).

### Gap J — worker submit-protocol reminder at spawn

**Broken:** `handleSpawnAgent:574-590` dispatches `thread.turn.start` with `text: normalizedObjective`. Workers had no protocol hint telling them to fill `filesWritten` / `testsRun` / `notes` at submit. The C+F contract fields were dead on arrival — workers would continue submitting with just the legacy `summary` string.

**Fixed:** the task message now includes an 8-line protocol reminder enumerating every field the orchestrator expects and why. Workers that ignore it submit with null fields; the updated ORCHESTRATOR.md review protocol rejects those and asks them to resubmit.

**Test:** `Gap J` asserts the dispatched `thread.turn.start` message text contains both `"filesWritten"` and `"testsRun"` alongside the objective.

### Gap K — send_to_agent terminal-state guard

**Broken:** `handleSendToAgent:848-866` wrapped the `thread.turn.start` dispatch in `Effect.ignore`. If the target worker was terminated (thread dead, no provider session), the dispatch failed silently and the tool returned `{ queued: true, messageId, deliveredVia: "thread.turn.start" }` — an outright lie. The orchestrator would believe the message was delivered and never retry / escalate.

**Fixed:** explicit `targetWorker.status === "terminated"` check before dispatch; returns `{ error: "Agent X is terminated; spawn a new agent instead..." }`.

**Test:** `Gap K` sets up a terminated worker, calls `orchestrate_send_to_agent`, asserts `result.error` matches `/terminated/` and zero commands dispatched.

## Test results

| Suite                                                       | Result                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------- |
| `apps/server` OrchestrationToolRouter + decider + ingestion | 54 passed, 3 pre-existing fails (spawn_agent, focus_agent) |
| `apps/web` session-logic                                    | 41 passed                                                  |

## Gaps deliberately NOT shipped this round

1. **`orchestrator.message.delivered` event** — would need a new domain event + projector + subscriber on `thread.turn-started`. Valuable but scoped out; the Gap K guard at least prevents the worst case (lying when terminated), and `{ queued: true }` is accurate semantics for the non-terminal path.
2. **controlRoomMode on the per-worker ChatView** — orchestrator panel is compact; worker panels still render the full WorkEntryRow cards. The user's complaint was about the orchestrator panel specifically, so keeping worker panels rich for now.
3. **`orchestrate_review_agent_work` composite** — get_agent_status now returns the report, get_agent_diff returns the diff, the orchestrator can synthesize review from those two calls. A composite tool is convenience, not blocker.
4. **Remaining 14 unimplemented tools** — restart_agent, clone_agent, ask_agent, share_file, transfer_context, broadcast, request_revision, set_dependency, merge_work, set_spawn_budget, run_tests, assign_worktree, set_model, set_scope, restrict_scope. Each is its own design conversation; none were blockers in the observed transcripts.

## Full branch summary (all 13 commits)

```
bd233f89 fix(orchestrator): gap H/I/J/K downstream fixes from second analysis
7edd1348 feat(web): gap-G polish compact activity row — enable control-room mode by default
30f2c0a0 feat(web): gap-G compact orchestrator activity strip in control-room mode
e01f4b95 fix(orchestrator): gap-D clarify delegation vs operational commands
5f6c1305 fix(orchestrator): gap-C+F structured submit report
ced180aa fix(orchestrator): gap-A bridge send_to_agent via thread.turn.start
47218f92 fix(web): surface orchestrator tool calls and reasoning in work log
013c3e8c fix(orchestrator): gap-2 return queued semantics on send_to_agent
df6bddbe fix(orchestrator): gap-10 implement orchestrate_get_agent_logs
69779d17 fix(orchestrator): gap-7 server-side wait_agent and wait_all
43722e4d fix(orchestrator): gap-5+6 accept invariants for hasChanges / diffStats
5b6d3801 fix(orchestrator): gap-4 collapse tool lifecycle by stable itemId
26ffa68b fix(orchestrator): gap-3 split tool detail into summary + output
```

## Next session priorities (if the user continues)

1. **`orchestrator.message.delivered`** event + subscriber.
2. **`review_agent_work` composite** (simple: calls get_agent_status + get_agent_diff, packages into one decision payload).
3. **run_tests** handler (Gap 8 from the original plan; shells to `bun run test --cwd <worktree>`, truncates output).
4. Repeat the fullstack-build live test and confirm:
   - orchestrator does NOT spawn a worker for `bun run dev`
   - 1-char fix routes through `send_to_agent` (no new worker)
   - review uses `get_agent_diff` + `get_agent_status.submitSummary` (no `ls -la`)
   - compact activity strip shows every spawn / send / wait inline
