# Round 4 — transcript-driven gaps (L0/L1/L2)

Date: 2026-04-21
Branch: fix/orchestrator-remediations (14 commits ahead of main — `4017dc7c`)

## What the live game-platform transcript revealed

User submitted the prompt _"Build a website server using orchestrator agents with react and tailwind css to build a game platform with multiple browser games."_ The orchestrator decomposed correctly but then got stuck:

> **send_to_agent isn't implemented in this MCP build.** Per the runtime's note, I have to use spawn/terminate/accept/reject.

Round 2's Gap A claimed send_to_agent was fixed. The claim was wrong — fixed on the server-side router, not on the MCP layer Codex actually uses. Three cracks shipped in one commit (`4017dc7c`):

### Gap L0 — MCP `orchestrate_send_to_agent` had no handler

**Evidence:** `scripts/orchestrate-mcp-server.ts:150` declares the tool, but grepping `toolName === "orchestrate_send_to_agent"` returns zero matches in the handler switch. Falls through to `{ status: "unimplemented" }` at line 926. Round 3 Gap I added `get_agent_diff` and `get_agent_logs` to the MCP layer but I missed `send_to_agent`.

**Fix:** new MCP handler mirrors `handleSendToAgent` semantics:

- Look up target worker via snapshot
- Return error if not found or terminated
- Dispatch `orchestrator.message.send` (audit trail)
- Dispatch `thread.turn.start` with the message as a user turn
- Return `{ queued: true, messageId, deliveredVia: "thread.turn.start" }`

The Codex orchestrator can now send follow-ups instead of spawning a fresh worker for every 1-char fix.

### Gap L2 — workers were asked to call a tool they don't have

**Evidence:** Round 2's Gap J reminder told workers _"When you finish, submit your work with: - summary: … - filesWritten: …"_. But workers are Claude Code / Codex CLI sessions; they have Read/Write/Bash/etc. They do NOT have an `orchestrator.task.submit` tool. The reminder was asking for an impossible action and inducing hallucination. Observed: the game-platform worker "idled without calling orchestrator.task.submit" — exactly what happens when you ask an LLM to call a nonexistent tool.

**Fix:** replaced the reminder with a REPORT-block protocol that uses the worker's final assistant message. Workers end their last message with:

```
## REPORT
summary: one-sentence account of what you did
filesWritten:
  - path/one
  - path/two
testsRun:
  - name: suite
    passed: true
notes: ...
hasChanges: true|false
```

The orchestrator reads this via `orchestrate_get_agent_logs` and parses it at accept/reject time. Submission happens server-side via the existing accept/reject auto-submit machinery, which the workers don't need to know about.

Test `Gap J/L2` asserts:

- Reminder contains `## REPORT`, `filesWritten:`, `testsRun:`
- Reminder does NOT contain `orchestrator.task.submit`

### Gap L1 — reject auto-submit clobbered the missing-report signal

**Evidence:** `scripts/orchestrate-mcp-server.ts:845-856` auto-submitted with `summary: "Auto-submitted prior to reject"` when the worker never submitted. That filler string displaced the null-summary signal that would otherwise tell the next orchestrator "worker stalled without producing a report."

**Fix:** dropped the `summary` field from the auto-submit payload entirely. Missing stays missing — the next read of `orchestrate_get_agent_status` returns `submitSummary: null`, which is now a meaningful signal.

## Still open after this round

1. **Accept/reject MCP input schemas don't accept the REPORT fields.** The orchestrator parses the REPORT from the worker's last message, but today `orchestrate_accept_work` only takes `{ workerId, reason }`. Extending the input schema to also take `filesWritten`, `testsRun`, `notes`, `hasChanges` would let the orchestrator thread the parsed report into the auto-submit. Shipping this would complete L2's other half.

2. **Absolute paths outside the workspace are silently redirected.** The transcript showed the worker scaffold at `apps/game-platform/` instead of the specified `/Users/christophe/Documents/game-platform/`. This is a worker-CWD constraint; the orchestrator should know and specify paths relative to its own cwd. Fix = add a caveat to ORCHESTRATOR.md `## Task Design`, no code change.

3. **`orchestrate_cancel_task`.** For genuinely stalled workers (no REPORT, no progress, turn ended), terminate+respawn is still the only route. A cancel-task action that resets the task to needs-rework would unstick without losing the worker's thread.

4. **Automatic REPORT parsing on accept_work.** Complement to #1: parse the worker's last-message REPORT block automatically at accept time so the orchestrator doesn't have to manually extract + forward it. Would complete the loop.

## Test results

```
apps/server: 12 Gap-tagged tests pass, 14 total in router + decider suites
Pre-existing spawn_agent / focus_agent failures unchanged (verified on parent commit)
```

## Full branch summary (14 commits)

```
4017dc7c fix(orchestrator): gap L0/L1/L2 — MCP send_to_agent + REPORT block protocol
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

## How to verify live

After a dev-server restart (MCP server is spawned fresh on each Codex session):

1. Prompt the orchestrator on a fresh thread: _"Spawn a worker to create `apps/demo/a.txt`. After it finishes, send it a follow-up asking it to also create `apps/demo/b.txt`. Do NOT spawn a second worker."_
2. Expect: orchestrator calls `orchestrate_send_to_agent` with the follow-up, MCP returns `{ queued: true, messageId }`, the worker's thread receives a new user turn, same worker creates the second file.
3. Before the fix: orchestrator would report `send_to_agent is unimplemented` and spawn a second worker.
