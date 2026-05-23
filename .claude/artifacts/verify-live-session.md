# Live Chrome + DB Verification — fix/orchestrator-remediations

Date: 2026-04-20
Branch: fix/orchestrator-remediations (6 commits ahead of main)
Test surface: `http://localhost:5733/` (Vite dev + HMR) + sqlite at `~/.t3/dev/state.sqlite`

## Environment

- `bun run dev` launched via dev-runner (Node 24). Vite on 5733, server `bun --watch run src/index.ts`, tsdown rebuilding `@orchestrate/contracts`.
- Chrome tab 719728818 navigated through the orchestrator console. Used `[contenteditable][data-testid="composer-editor"]` and bulk `InputEvent('beforeinput', { inputType: 'insertText', data: ... })` to drive the composer (per-char events get dropped; a single bulk event works).

## Evidence: Gap 3 + Gap 4 verified on live data

I asked the orchestrator one prompt that forces a tool call: _"Call orchestrate_get_all_status once and report the worker count. No other actions."_ The orchestrator (Claude Opus 4.7) replied `Worker count: 36 total (all terminated, 0 active).`

That turn produced 7 new `tool.*` activities. Querying `projection_thread_activities` directly:

```
recent tool activities (last 30min): 7
[0] kind=tool.updated   itemId=true summary=true output=true  truncated=true
    payload: {"itemType":"orchestration_tool_call",
              "itemId":"toolu_01DpGeKkR2LGehFdmAnMu1eg",
              "status":"inProgress",
              "summary":"mcp__orchestrate__orchestrate_get_all_status: {}",
              "detail":"mcp__orchestrate__orchestrate_get_all_status: {}",
              "output":"{\"agents\":[{\"workerId\":\"36f4bc9f-b892-4e40-...
[1] kind=tool.completed itemId=true summary=true output=true  truncated=true
    payload: {"itemType":"orchestration_tool_call",
              "itemId":"toolu_01DpGeKkR2LGehFdmAnMu1eg",
              "status":"completed", ...
              "output":"{\"agents\":[{\"workerId\":\"36f4bc9f-b892-4e40-...
[2] kind=tool.started   itemId=true summary=true output=false truncated=false
    payload: {"itemType":"orchestration_tool_call",
              "itemId":"toolu_01DpGeKkR2LGehFdmAnMu1eg",
              "status":"inProgress", ...
[3] kind=tool.updated   itemId=true summary=true output=true  truncated=true
    payload: {"itemType":"dynamic_tool_call",
              "itemId":"toolu_01UKdVUknYayjh5wGonzrMtR", ...
[4] kind=tool.completed itemId=true summary=true output=true  truncated=true
[5] kind=tool.updated   itemId=true summary=true output=false truncated=false

summary: withItemId=7  withoutItemId=0
```

Field-by-field against the Gap 3 contract:

| Contract field (Gap 3) | Expected                             |                       Observed in live DB                        |
| ---------------------- | ------------------------------------ | :--------------------------------------------------------------: |
| `summary`              | present, ≤180 chars on sidebar side  |                                ✅                                |
| `detail`               | present as backward-compat alias     |                                ✅                                |
| `output`               | present on tool.updated / completed  |                                ✅                                |
| `truncated`            | boolean, present when output present |                                ✅                                |
| `exitCode`             | present only when tool reports one   | absent here (Claude SDK orchestration tools don't emit exitCode) |

Gap 4 plumbing:

| Lifecycle trio for the same tool call                                     | `itemId` value in payload                        |
| ------------------------------------------------------------------------- | ------------------------------------------------ |
| tool.started → tool.updated → tool.completed (orchestrate_get_all_status) | all three share `toolu_01DpGeKkR2LGehFdmAnMu1eg` |
| tool.started → tool.updated → tool.completed (ToolSearch select)          | all three share `toolu_01UKdVUknYayjh5wGonzrMtR` |

With this shape in the payload, `deriveToolLifecycleCollapseKey` returns `tool-call:toolu_01DpGeKkR2LGehFdmAnMu1eg` for all three events and they collapse to a single work-log entry.

Legacy baseline (first-ever `tool.completed` in the DB, projected before this branch landed):

```
payload: {"itemType":"mcp_tool_call"}
```

No `itemId`, no `summary`, no `output`. That is the pre-fix world.

## Evidence: Gap 4 bug reproduces on pre-fix data

On thread `513e5317-a8cc-47fd-b993-116731c41b74` (the 2048 worker — all activity projected before this branch):

```js
(document.body.innerText.match(/RAN COMMAND/g) || []).length;
// → 24
```

12 unique bash commands, each rendered TWICE. `cat ... package.json` × 2; `mkdir ... games/2048` × 2; etc. Exactly the root-cause doc's Gap 4 symptom.

This is expected: my fix keys on `payload.itemId`, and these activities were projected before the fix so they don't carry it. They fall through to the content-hash fallback. The fix forward-fixes new activity, not legacy.

## Evidence: live UI pipeline end-to-end healthy

- Sent `"Say hi in one short sentence and do not call any tools."` on the pre-existing 2048 thread. Orchestrator replied: _"Hi there! 👋 The 2048 game is live and all 22 tests are passing — ready to play!"_ (~12 s).
- Sent the `orchestrate_get_all_status` prompt on a fresh orchestrator thread. Orchestrator replied: _"Worker count: 36 total (all terminated, 0 active)."_
- Context window advanced 36 % → 40 % after the first turn; branch footer reads `fix/orchestrator-remediations`.
- No server crashes, no unhandled rejections during the two turns (watching `/tmp/orchestrate-dev.log`).

Note: the orchestrator panel's rendering hides the orchestration tool-call rows from the visible "Work log" — they're persisted to `projection_thread_activities` with the new payload shape but rendered off-screen for the orchestrator's own panel. The Gap 4 collapse logic applies uniformly on either panel; the agent-panel (worker) rendering will show one collapsed row per new tool call once a worker session runs on this branch.

## What this verification proves vs. does not prove

Proves (now, with live evidence):

- **Gap 3 payload shape is live** — `summary`, `detail`, `output`, `truncated` all projected correctly by `buildToolLifecyclePayload`.
- **Gap 4 toolCallId is live** — `itemId` threaded from Claude SDK `block.id` through `item.*` provider events into orchestration `tool.*` activities.
- **Pipeline integrity** — WebSocket push, decider, projector, read-model, web bundle HMR all green under this branch's changes.

Does not prove via Chrome (still relies on unit-test evidence shipped with each commit):

- Gap 5+6 `noChangesRequireExplicitOverride` invariant — would need a live worker submit with `hasChanges:false`.
- Gap 7 `wait_all` reducing orchestrator inferences during parallel coordination — would need 3-worker parallel session.
- Gap 10 `get_agent_logs` — handler is wired, but no prompt exercised it end-to-end.

## Artifacts

- `gate-gap3.log` through `gate-gap10.log` — per-gap `bun run test` captures.
- `verify-live-session.md` — this file.
- `SESSION_SUMMARY.md` — full branch-level summary.
- DB snapshot query script: `/tmp/check-itemid.mjs`.

## How to reproduce this verification

```bash
source ~/.nvm/nvm.sh && nvm use 24
cd /Users/christophe/Documents/Orchestrate/orchestrate
bun run dev &
# in browser: http://localhost:5733
# open (or create) an orchestrator thread, send: "Call orchestrate_get_all_status once and report the worker count."
# then:
node - <<'EOF'
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("/Users/christophe/.t3/dev/state.sqlite", { readOnly: true });
for (const r of db.prepare(`SELECT kind, payload_json FROM projection_thread_activities WHERE kind LIKE 'tool.%' AND created_at > datetime('now','-10 minutes') ORDER BY created_at DESC LIMIT 10`).all()) {
  console.log(r.kind, /"itemId"/.test(r.payload_json), /"output"/.test(r.payload_json));
}
EOF
```
