# Round 2 — control-loop and visibility fixes

Date: 2026-04-21 UTC
Branch: fix/orchestrator-remediations (now 12 commits ahead of main)

## What was broken (user observations from the fullstack run)

1. `send_to_agent is unimplemented. Spawning a tiny rework worker for the 1-char fix.` — every follow-up to an existing worker cost a new worker spawn (cold context, full model turn cost).
2. `Diffs came back null — let me check what's actually on disk.` — the orchestrator had no structured channel to read what the worker did, so it fell back to `ls -la` + `bun typecheck`.
3. `Spawning a foreground worker to run the dev server so you can see it live.` — an operational `bun run dev` was wasted on a subagent instead of the orchestrator running it directly.
4. Orchestrator panel in the UI hid orchestration tool calls entirely, so the user couldn't follow the control loop as it happened.

## What was shipped this round (6 commits)

### `ced180aa` — Gap A: send_to_agent bridge via thread.turn.start

`handleSendToAgent` now dispatches **both** `orchestrator.message.send` (audit trail) **and** `thread.turn.start` on the target worker's thread. The decider's existing turn-queue logic handles the "thread is mid-turn" case by emitting `thread.turn-queued` — the message is never lost.

Before: message written to `orchestratorMessages[]` in the read model, but no injection into any worker's turn queue. Workers never saw follow-ups.

Test added (`OrchestrationToolRouter.test.ts`): assert both commands dispatched with correct message text and thread id.

### `ced180aa` — Gap B: orchestrate_get_agent_diff handler

Router gained `handleGetAgentDiff`. Reads the worker's thread latest checkpoint, aggregates `files[]` into `{additions, deletions, filesChanged}`, returns a one-line-per-file summary as `diff: string`. Wired into the `READ_ONLY_TOOLS` switch so the tool no longer falls through to `{ error: "Not implemented: ${toolName}" }`.

Test: 40+2=48 additions, 2 deletions, 2 filesChanged, diff string contains the paths.

### `5f6c1305` — Gap C+F: structured submit report

`OrchestratorTaskSubmitCommand` now carries optional `filesWritten`, `testsRun` (array of `{name, passed}`), and `notes`. These flow through `OrchestratorTaskSubmittedPayload` into the `OrchestratorTask` projection as `submitSummary`, `filesWritten`, `testsRun`, `submitNotes`.

Orchestrator review flow now reads structured report from the read model instead of disk-grepping. Worker-prompted to include these at submit.

Test: submit with full report (3 files, 2 tests passed, notes), assert all four fields present on the projected task.

### `e01f4b95` — Gap D: ORCHESTRATOR.md delegation clarification

The hard delegation rule used to say _"You NEVER write code, edit files, **run build commands**, or **run tests** yourself."_ That was too broad and caused the wasted-worker antipattern.

New structure:

- **Hard delegate** only when it mutates the repo.
- **Run directly** (operational): `ls`/`cat`/`find`/`lsof`/`ps`/`kill` (processes orchestrator started)/`git status`/`git diff`/`git log`/`curl`/`bun run dev`/`npm start`.
- **Follow-up to an existing worker**: use `orchestrate_send_to_agent`, do **NOT** spawn a fresh worker for a 1-char fix. Spawn only for genuinely new work or terminated/accepted workers.

Also rewrote the Review Process section to reference `orchestrate_get_agent_status` + `orchestrate_get_agent_diff` + the worker's `submitSummary` / `filesWritten` / `testsRun` / `submitNotes` fields, so the orchestrator reads structured reports instead of falling back to disk commands.

### `30f2c0a0` + `7edd1348` — Gap G: compact activity strip in control-room mode

`OrchestratorMessages.tsx` gained a `CompactActivityRow`: one dense line per activity, color-coded by tone:

```
→ spawn agent @abc12345    Build backend for apps/demo-fullstack/...
→ send to agent @6428036c  Use port 5175 instead of 5173
→ wait all                 backend, frontend
→ review agent work @abc12345
→ accept work @6428036c
$ bun run --cwd apps/demo-fullstack test
· todowrite                Reconfigure demo ports
```

Orchestration tools (`orchestrate_*`) highlight amber so the user can scan the control-loop vs worker-side events.

`OrchestratorPanel` now sets `controlRoomMode={true}` by default on the orchestrator panel. The old "rich message bubbles + heavy work cards" mode (which hid tool calls) is kept available to other callers but no longer used here — that rendering was the root cause of "I can't see what the orchestrator is doing."

`extractToolArgsPreview` tolerates 180-char truncation on `payload.detail` by falling back from JSON.parse to per-key regex (task/message/command/instruction/reason/title/objective/query) — so even truncated tool args produce a usable preview.

Live verification: 13 compact rows now visible in the orchestrator panel for the fullstack thread (spawn/wait/review/accept/bash/todowrite) — each on its own one-line strip.

## Test results

| Suite                                          | Result                                                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `apps/server decider.orchestrator.test.ts`     | 11 passed (1 of which is new Gap C+F)                                                               |
| `apps/server OrchestrationToolRouter.test.ts`  | 6 passed + 3 pre-existing failures unchanged (spawn_agent, focus_agent, focus_agent different path) |
| `apps/server ProviderRuntimeIngestion.test.ts` | 31 passed                                                                                           |
| `apps/server projector.orchestrator.test.ts`   | 13 passed                                                                                           |
| `apps/web session-logic.test.ts`               | 41 passed                                                                                           |

## What the user should see on next orchestrator run

- Follow-up to an existing worker: orchestrator calls `orchestrate_send_to_agent`, the worker's thread gets a new user turn with the message, no new worker spawned.
- Review: orchestrator calls `orchestrate_get_agent_diff` and reads `submitSummary` from the task, instead of `ls -la`.
- Operational: orchestrator runs `lsof`, `curl`, `bun run dev` directly, no wasted worker spawn.
- UI: the orchestrator panel shows a dense activity strip — spawn, wait, send, accept, bash — each a single line.

## Still deferred

- `orchestrate_review_agent_work` as a composite (diff + logs + report + checklist). The building blocks are now there; the composition is next.
- Full subscriber for `orchestrator.message.delivered` event (currently delivery is implied by `thread.turn-started`, no explicit delivered event).
- Gap 8 (run_tests + open_browser_preview) and Gap 9 (model routing + spawn budget enforcement) from the previous session are still open.
