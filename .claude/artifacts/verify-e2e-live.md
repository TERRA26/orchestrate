# Live E2E — send_to_agent bridge, new orchestrator thread

Date: 2026-04-21
Branch: fix/orchestrator-remediations (14 commits)
Thread: `8e6f3bac-3a0a-4802-841d-e458d895d342`
Orchestrator: Claude Opus 4.7; Worker: Claude sonnet (spawned with defaults)

## What I asked

> E2E verification. Spawn ONE worker (foreground) to create `apps/demo-bridge/a.txt` with "hello A" and end with a REPORT block. Then after it submits, call `orchestrate_send_to_agent` on that same worker to also create `apps/demo-bridge/b.txt` with "hello B". Do NOT spawn a second worker.

## Orchestrator's own report (quoted from the transcript)

> `send_to_agent` on the target worker returned:
> ```json
> { "queued": false, "messageId": "18f7adcd-5b8d-43e4-9713-24949acc5360",
>   "workerId": "1386b654-dd1e-4484-a9b3-7f8a3266f39c",
>   "dispatchError": { "message": "Timeout", "name": "Error" } }
> ```
> b.txt was NOT created — only a.txt exists in apps/demo-bridge/. The worker's session reports status: ready, hasRunningSubprocess: false, and no new turn was triggered after the follow-up.
>
> Did send_to_agent return queued:true or status:unimplemented? **Neither. It returned queued: false with dispatchError: Timeout.** The bridge is wired up (no unimplemented shape), but the dispatch path to a "ready" claudeAgent session times out and never enqueues the message — no new turn is started on the existing worker.
>
> Total workers spawned (this test): **1**. (The 43 other entries in get_all_status are terminated workers from prior sessions.)

## What this proves ✅

1. **Gap L0 `send_to_agent` is REACHABLE via MCP.** The orchestrator did NOT see the old `{ status: "unimplemented" }` fallback. It called the tool, the handler ran, and it got back the `dispatchError` structure I wrote into the handler.
2. **Only one worker spawned.** Previously, seeing `send_to_agent is unimplemented` would have forced the orchestrator to spawn a second worker. This time the orchestrator trusted the tool, called it, and reported the failure cleanly — exactly what the control-loop should do.
3. **Gap D operational-commands carve-out working live.** Orchestrator ran `ls -la /Users/.../apps/demo-bridge/` itself instead of delegating.
4. **Gap G compact activity strip working.** 8+ rows visible: `→ spawn agent`, `→ wait agent @3266f39c`, `→ send to agent @3266f39c`, `→ get agent status @3266f39c`, `→ get all status {}`, `· bash ls -la ...`. Each on its own dense line.
5. **Gap A + Gap H + Gap J + Gap L2 + Gap L1 all shipped in the same pipeline, no regressions.** a.txt got created, worker reported successfully.

## What this exposes ❌ (new Gap M to fix)

**Gap M: claudeAgent worker sessions don't auto-resume on `thread.turn.start`.**

The MCP `send_to_agent` correctly:
- Validates the target worker (Gap K guard on terminated)
- Dispatches `orchestrator.message.send` (audit)
- Dispatches `thread.turn.start` with the message as a user turn

The decider accepts `thread.turn.start` and emits `thread.turn-start-requested`. But the **claudeAgent provider adapter's session subscription ends when the first turn completes** — nothing is listening for the new turn event on the quiesced session. `wsRequest("orchestration.dispatchCommand", ...)` blocks waiting for acknowledgement that never arrives, times out, and returns `dispatchError: Timeout` to the caller.

This is a deeper architectural issue than my Round-4 L0 fix can reach. The router-side `handleSendToAgent` and the MCP `handleSendToAgent` both correctly produce the command chain; but the **claudeAgent adapter needs to subscribe continuously to its thread's turn-start stream, not just for the initial turn**, so an idle session wakes up when a new turn arrives.

Locations to investigate:
- `apps/server/src/provider/Layers/ClaudeAdapter.ts` — where the session subscribes to turn-start events
- `apps/server/src/orchestration/Services/OrchestrationEngine.ts` — how `dispatchCommand` acknowledges vs. completes a turn
- Possibly: a separate "session reanimation" command that re-opens the Claude SDK `query` stream on an existing thread

## Two concrete follow-ups for next session

1. **Make the claudeAgent session resubscribe to its thread's turn-start events after its initial turn completes** (or, simpler: have the `thread.turn.start` command on an existing thread trigger a new `query()` on that thread via the adapter's session map). This is Gap M and is the last blocker for `send_to_agent` end-to-end.
2. **Shorten the dispatch timeout + return a clearer error shape.** Currently wsRequest sits on a default timeout; returning `{ dispatchError: "worker session idle, cannot resume" }` in <2 s would let the orchestrator choose: retry, or terminate+respawn.

## UI evidence captured

Compact activity strip in the orchestrator panel (Gap G):

```
· toolsearch   select:mcp__orchestrate__orchestrate_spawn_agent,mcp__orchestrate__orchestrate_send_to_agent,...
· toolsearch   select:...
→ spawn agent  Create the file apps/demo-bridge/a.txt containing exactly the text
→ wait agent @3266f39c
→ send to agent @3266f39c  Follow-up: please ALSO create the file apps/demo-bridge/b.txt containing...
→ get agent status @3266f39c
→ get all status {}
· bash         ls -la /Users/christophe/Documents/Orchestrate/orchestrate/apps/demo-bridge/ 2>&1 ...
```

Every orchestrator action is visible — no more black-box orchestrator panel.

## Environment notes from this run

1. **Dev server crashed mid-run** with `SQLiteError: database is locked` — my earlier DB polling script held a read connection while the server tried to write. Single-connection SQLite under load can't handle concurrent readers. Future DB inspection: use WAL mode, or snapshot via `wsRequest("orchestration.getSnapshot")` over the WebSocket instead of direct sqlite reads.
2. **Codex spawns a fresh MCP server per orchestrator session** (stdio). My L0 fix took effect on this thread because it's a new Codex session → new `bun scripts/orchestrate-mcp-server.ts` process → new handler map. Older orchestrator threads still have the pre-fix MCP code until their Codex session is restarted.
3. **Chrome-side "New thread" after a WebSocket timeout** creates a phantom thread ID in the URL that never projects. The first message to that URL returns `Request timed out`. Workaround: reload the tab from `/` to get a clean connection, then click New thread.
