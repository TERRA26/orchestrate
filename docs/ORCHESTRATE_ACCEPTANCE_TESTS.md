# Orchestrate — End-to-End Acceptance Tests

**Purpose.** A catalog of scenarios Orchestrate should be able to handle successfully end-to-end. This is the "what passing looks like" companion to `AGENT_AUDIT.md`'s "what we're fixing right now" pass-by-pass log.

**How to use.** Each iteration of the smoke-build loop should pick one (or more) test cases below, run them through a fresh managed Codex/Claude provider session, and capture results. A test "passes" when every acceptance gate is met, evidence is captured, and the agent's reported claims line up with the durable evidence. A test "fails" when any gate breaks — fail loudly, file the symptom against the right component, and route the bug into the next audit batch.

**Non-goals.** This is not a unit-test plan (those live next to source). It is not a contract spec (`packages/contracts` schemas own that). It is not the audit log itself. It is the menu of "Orchestrate should be able to do X" scenarios that Phase-17+ work is meant to make trivially achievable.

**Conventions.**

- Each test has a stable ID (e.g. `AT-01`). New tests append; do not renumber.
- Acceptance gates are concrete pass/fail bullets. Subjective adjectives ("looks good") are not gates.
- Evidence requirements specify what durable artifacts must exist after the test. If the agent claims a state but no artifact backs it, the gate fails.
- Some tests have known-gotchas captured from the audit log — read them before declaring failure.

---

## Table of categories

| Category                      | Tests          | Theme                                          |
| ----------------------------- | -------------- | ---------------------------------------------- |
| 1. Cold-start sanity          | AT-01 .. AT-04 | App boots, ports, auth, MCP wiring             |
| 2. Single browser session     | AT-05 .. AT-09 | Open, navigate, observe, screenshot, close     |
| 3. Browser actions            | AT-10 .. AT-14 | Click, type, scroll, evaluate with evidence    |
| 4. Single-worker tasks        | AT-15 .. AT-19 | Files, commands, builds, plan, submit          |
| 5. Multi-worker orchestration | AT-20 .. AT-24 | Parallel spawn, wait, coordinate, review       |
| 6. Annotation → rework loop   | AT-25 .. AT-28 | Comment, focused rework, before/after evidence |
| 7. Full-stack SaaS build      | AT-29 .. AT-32 | Server + web + browser smoke as one task       |
| 8. Calm thread UX             | AT-33 .. AT-36 | Semantic phases, no raw tool name leaks        |
| 9. Reliability & restart      | AT-37 .. AT-40 | Crashes, port collisions, session recovery     |
| 10. Security & auth           | AT-41 .. AT-44 | Env propagation, no token leaks                |

---

## 1. Cold-start sanity

### AT-01 — Desktop stack starts cleanly

- **Preconditions**: clean checkout of `main`, no stale `codex app-server` processes (`pgrep -fl 'codex app-server'` returns nothing).
- **Steps**: run `bun run dev:desktop`. Wait until the Electron window appears.
- **Acceptance gates**:
  - [ ] Electron window opens within 30s of `bun run dev:desktop`.
  - [ ] No fatal error in the dev-server log.
  - [ ] The desktop log header `app ready` appears in the console.
  - [ ] `apps/desktop/src/electronCdpPort.ts` reports a chosen CDP port (dynamic by default).
- **Evidence**: dev-server log captures the chosen port; the IPC bridge `BROWSER_CDP_ENDPOINT_CHANNEL` returns the same port.
- **Known gotchas**: stale Codex MCP processes from prior sessions block the smoke loop (audit log: 17X-2 through 17X-7). Always verify clean process state first.

### AT-02 — Two desktop instances don't collide

- **Preconditions**: AT-01 passed; first instance still running.
- **Steps**: launch a second desktop instance from another shell with `bun run dev:desktop`.
- **Acceptance gates**:
  - [ ] Second instance opens its own Electron window.
  - [ ] Both instances report distinct CDP ports.
  - [ ] No "EADDRINUSE" error in either log.
- **Evidence**: both dev-server logs show different chosen ports; no port-collision diagnostic fires.

### AT-03 — Orchestrator MCP boot diagnostic fires correctly

- **Preconditions**: AT-01 passed; a fresh orchestrator thread is opened (do not reuse a thread created against a prior stale MCP host).
- **Steps**: send any orchestration tool call from the new thread.
- **Acceptance gates**:
  - [ ] First MCP-subprocess stderr line matches `orchestrate-mcp-server loaded; port=<actual>; auth=present; parentThread=present`.
  - [ ] No field reads `fallback` or `missing`.
- **Known gotchas**: if `auth=missing` or `parentThread=missing`, the provider adapter dropped one of the env vars. Audit log: 17V-F1 (Claude side), 17X-1 (Codex side). Fix is symmetric across providers.

### AT-04 — Headless validator attaches via CDP

- **Preconditions**: AT-01 passed.
- **Steps**: trigger a `playwright-headless` session indirectly (e.g., via reviewer workflow that explicitly requests headless validation).
- **Acceptance gates**:
  - [ ] Validator connects via `chromium.connectOverCDP(http://localhost:<dynamic port>)`, not via `_electron.launch()`.
  - [ ] `BrowserRuntimeTruth.surfaceMode === "playwright-attached"` (not `"headless-validation-mirror"` of a separately-launched browser).
  - [ ] `webContents.id` ↔ CDP `targetId` correlation succeeds; the validator's `Page` URL matches the user-visible `WebContentsView` URL.

---

## 2. Single browser session

### AT-05 — Open session, return electron-visible session id

- **Steps**: agent calls `orchestrate_browser_open_session({ url: "https://example.com" })` from a managed orchestrator thread.
- **Acceptance gates**:
  - [ ] Returned `sessionId` starts with `electron-visible-`.
  - [ ] `runtimeTruth.runtimeKind === "electron-visible"`.
  - [ ] `runtimeTruth.surfaceMode === "live-shared-browser"`.
  - [ ] `runtimeTruth.isUserVisibleSurface === true`.
  - [ ] `evidenceRefs` is non-empty and includes a screenshot artifact ref.

### AT-06 — Observe the same WebContentsView the user sees

- **Preconditions**: AT-05 returned a session.
- **Steps**: agent calls `orchestrate_browser_act({ sessionId, action: { kind: "observe" } })` (or equivalent observe API). User watches the visible browser panel.
- **Acceptance gates**:
  - [ ] `observation.observedUrl === observation.visiblePanelUrl`.
  - [ ] `observation.urlAgreement === "same"`.
  - [ ] User can confirm the URL shown in the visible panel matches what the agent reports.
- **Evidence**: durable screenshot artifact whose `sha256` matches the byte content the recorder persisted.

### AT-07 — Navigate, screenshot, close

- **Steps**: open → navigate to `https://example.com` → observe → close.
- **Acceptance gates**:
  - [ ] Each step returns within 10s.
  - [ ] After close, subsequent calls on the same `sessionId` fail with a clear "session not found" error.
  - [ ] No leftover Playwright browser process (the `connectOverCDP` validator does not close Electron's browser; AT-RU-3 in 17E covers this).

### AT-08 — Refuse silent fallback when Electron unavailable

- **Steps**: stop the desktop stack mid-test, then issue `orchestrate_browser_open_session({ url: "..." })` from the server side without `preferredRuntimeKind`.
- **Acceptance gates**:
  - [ ] Call fails with `Effect.fail` and a clear message ("Electron visible browser runtime bridge is unavailable; refusing headless fallback.").
  - [ ] No new browser process is launched.
  - [ ] The failure is recorded as durable evidence (not silently swallowed).

### AT-09 — Static screenshot evidence path is explicit

- **Steps**: trigger any code path that records a screenshot from a non-live source (e.g., a saved artifact replay).
- **Acceptance gates**:
  - [ ] Surface mode is `static-screenshot-evidence`.
  - [ ] UI label reads "Static screenshot evidence" (not "Live shared browser").

---

## 3. Browser actions with evidence

### AT-10 — Click a button by accessible name

- **Steps**: open a page with a button labeled "Save", agent calls `clickTarget` with `{ kind: "role-name", role: "button", name: "Save" }`.
- **Acceptance gates**:
  - [ ] Target resolves uniquely (`targetResolution.status === "resolved"`).
  - [ ] Click succeeds (the visible page reacts).
  - [ ] Post-action observation captures a durable screenshot.
  - [ ] Work-log entry headline reads "Clicked button Save" (semantic phase, not raw `clickTarget`).

### AT-11 — Type into an input field

- **Steps**: open a page with a text input labeled "Email", agent calls `fillTarget` with the role-name target and a string value.
- **Acceptance gates**:
  - [ ] Input value reflects the typed string after the action.
  - [ ] Work-log entry reads "Typed into Email field".
  - [ ] Durable evidence shows the post-action page state.

### AT-12 — Scroll with semantic label

- **Steps**: scroll the page by an offset.
- **Acceptance gates**:
  - [ ] Scroll position changes.
  - [ ] Work-log entry reads "Scrolled to ..." or "Scrolling browser".
  - [ ] No raw tool name like `orchestrate_browser_act` appears in the user-visible thread.

### AT-13 — Approval gate fires for risky action

- **Steps**: agent attempts a consequential action (e.g., form submit, payment, auth) that the policy classifies as risky.
- **Acceptance gates**:
  - [ ] Action is held; an approval request is created.
  - [ ] User sees an approval card in the thread.
  - [ ] On user approval, the action executes; the approval is recorded as `consumed`.
  - [ ] On user rejection, the action does not execute; the approval is recorded as `rejected`.
  - [ ] Approval cannot be reused (single-use lifecycle).

### AT-14 — Human takeover preempts agent

- **Steps**: agent is mid-action; user clicks "Take control" in the browser panel.
- **Acceptance gates**:
  - [ ] Agent's current action is interrupted or refused mid-flight.
  - [ ] Lease state transitions to `human-control`.
  - [ ] Subsequent agent action attempts fail until a `fresh-observation-required` event is consumed.

---

## 4. Single-worker tasks

### AT-15 — Spawn one Codex worker, complete a small task, submit

- **Steps**: orchestrator spawns a single Codex worker with a task like "rename `getCwd` to `getCurrentWorkingDirectory` across `apps/server/src/`."
- **Acceptance gates**:
  - [ ] Worker is created and dispatched a `thread.turn.start` (per 17B-F-1).
  - [ ] Worker emits a REPORT block at the end of its final assistant message.
  - [ ] Files actually changed match `filesWritten` in the REPORT.
  - [ ] `orchestrate_get_agent_logs` and `orchestrate_get_agent_diff` agree (no false "file change" without diff per W-N3 watch).
  - [ ] On accept, after-evidence is captured (visual snapshot if browser-related).

### AT-16 — Worker runs a build command and reports failure cleanly

- **Steps**: worker is asked to run `bun typecheck` on a known-broken branch.
- **Acceptance gates**:
  - [ ] Build failure surfaces as a `tone: "error"` work-log entry.
  - [ ] Composer agent-state pill shows "blocked".
  - [ ] Worker submission `hasChanges: false`; reviewer rejects with a clear instruction.
  - [ ] No silent retry loop without progress.

### AT-17 — Plan-mode worker proposes a plan before changing files

- **Steps**: spawn a worker with `interactionMode: "plan"`.
- **Acceptance gates**:
  - [ ] Worker emits a plan first (no file changes).
  - [ ] User sees the plan in the thread.
  - [ ] Approval to proceed transitions worker to execution mode.

### AT-18 — Approval-required worker holds before each file write

- **Steps**: spawn with `runtimeMode: "approval-required"`.
- **Acceptance gates**:
  - [ ] Each consequential action surfaces an approval request.
  - [ ] No file writes occur until approved.
  - [ ] Approval audit trail is durable.

### AT-19 — Worker terminate is honored

- **Steps**: orchestrator calls `orchestrate_terminate_agent({ agentId })` mid-execution.
- **Acceptance gates**:
  - [ ] Worker's spawned process is killed within 5s.
  - [ ] Status transitions to `terminated`.
  - [ ] Subsequent `send_to_agent` returns "agent terminated; spawn a new one" error.
  - [ ] No orphaned processes (`pgrep` confirms cleanup).

---

## 5. Multi-worker orchestration

### AT-20 — Two parallel workers building independent features

- **Steps**: orchestrator spawns Worker-A ("build the API") and Worker-B ("build the React UI") for the same project.
- **Acceptance gates**:
  - [ ] Both workers run concurrently.
  - [ ] Their working trees don't collide (separate worktrees or coordinated paths).
  - [ ] Each emits its own REPORT block; `orchestrate_get_all_status` shows both.
  - [ ] Spawn budget is respected (no third worker spawns if `maxConcurrentWriters: 2`).

### AT-21 — Wait-all coordinates two workers

- **Steps**: after AT-20 spawn, orchestrator calls `orchestrate_wait_all`.
- **Acceptance gates**:
  - [ ] Returns once both workers reach a terminal status (submitted/accepted/rejected/terminated).
  - [ ] Returns earlier if any worker errors out (no infinite wait).

### AT-22 — Reviewer evaluates two parallel submissions

- **Steps**: both workers submit; reviewer runs accept/reject decisions on each.
- **Acceptance gates**:
  - [ ] Each submission has its own evidence bundle.
  - [ ] Each decision has its own gate-by-gate report.
  - [ ] User-visible summary explains each decision in plain English.

### AT-23 — Worker A's failure does not break Worker B

- **Steps**: Worker A is killed mid-flight; Worker B continues.
- **Acceptance gates**:
  - [ ] Worker B's submission completes normally.
  - [ ] Worker A's terminated state is recorded.
  - [ ] No corruption of shared state (e.g., projection rows for the orphan worker are cleaned up).

### AT-24 — Spawn budget is enforced

- **Steps**: orchestrator attempts to spawn worker beyond `maxTotalWorkers`.
- **Acceptance gates**:
  - [ ] Spawn fails with a clear "spawn budget exceeded" error.
  - [ ] No process is started.

---

## 6. Annotation → rework loop

### AT-25 — User annotates the live browser, sees the comment in the thread

- **Steps**: user clicks an element in the browser panel, attaches a comment ("move this button down").
- **Acceptance gates**:
  - [ ] An annotation card appears in the thread with the comment, target label, and a screenshot crop.
  - [ ] The annotation is durable (survives a restart).
  - [ ] Before-evidence (full screenshot + DOM snapshot) is captured at annotation creation time.

### AT-26 — Start-rework spawns a focused worker

- **Steps**: user clicks "Start rework" with `mode: "start-agent-run"`.
- **Acceptance gates**:
  - [ ] An orchestrator task spawns with focused routes/viewports/evidence.
  - [ ] The worker receives the comment as part of its kickoff message.
  - [ ] `rework_tasks` row is inserted with status `assigned`.
  - [ ] On worker start, status transitions to `running`.

### AT-27 — On submit, after-evidence renders a paired before/after preview

- **Steps**: rework worker submits; reviewer sees the comparison.
- **Acceptance gates**:
  - [ ] After-evidence (fresh screenshot + DOM snapshot via `BrowserRuntimeService.observe`) is captured at submit time.
  - [ ] The annotation row's `afterScreenshotArtifactRef` and `afterDomArtifactRef` are populated.
  - [ ] The work-log card renders a side-by-side `BrowserScreenshotPreview` for before and after.
  - [ ] User can visually confirm the change matches the annotation.

### AT-28 — Reviewer auto-resolves the annotation if the gate passes

- **Steps**: continuing AT-27, reviewer evaluates the rework.
- **Acceptance gates**:
  - [ ] If gate passes, annotation status transitions to `resolved`.
  - [ ] Reviewer decision card cites the annotation.
  - [ ] On reject, annotation goes back to `open` (or `reopened`).

---

## 7. Full-stack SaaS build

### AT-29 — Build a small in-memory SaaS server + dashboard end-to-end

- **Reference**: LedgerPilot smoke (audit log: Bundle 17W).
- **Steps**: prompt orchestrator with "build a compact subscription-analytics SaaS dashboard with an Express server exposing `/api/<resource>` and a React dashboard with KPI cards, plan-mix bars, accounts table, billing-risk alerts" inside `apps/demo-fullstack` (or a fresh `apps/demo-saas-<name>`).
- **Acceptance gates**:
  - [ ] Server tests pass after the build.
  - [ ] Web dev server starts; the dashboard renders without console errors.
  - [ ] CORS allow-list includes the actual Vite origin (audit log: 17X-5 caught a stale `:5173` vs actual `:5175`).
  - [ ] Browser observation captures a screenshot of the rendered dashboard.
  - [ ] No raw tool names leak into the user-visible thread.

### AT-30 — The orchestrator coordinates server + web work via two workers

- **Steps**: AT-29, but explicitly prompt the orchestrator to use parallel workers (one server, one web).
- **Acceptance gates**:
  - [ ] Both submit independently.
  - [ ] Reviewer accepts both before declaring task complete.
  - [ ] Final dashboard works against the final server.

### AT-31 — Orchestrator catches a missing CORS / dev-server config

- **Steps**: as AT-29, but the worker's CORS allowlist points at the wrong origin.
- **Acceptance gates**:
  - [ ] Browser smoke (orchestrator opens the dashboard) sees a network error.
  - [ ] Reviewer rejects with a clear "fix CORS allowlist" instruction.
  - [ ] Worker on rework iteration fixes the CORS and the next smoke passes.

### AT-32 — User comments on a UI element; rework worker fixes it

- **Steps**: user opens the AT-29 dashboard, annotates "the KPI card spacing is too tight", clicks Start rework.
- **Acceptance gates**:
  - [ ] AT-25 → AT-28 chain succeeds against this real artifact.
  - [ ] The reworked dashboard visibly shows the spacing change.

---

## 8. Calm thread UX

### AT-33 — No raw tool names in user-visible thread surfaces

- **Steps**: drive any orchestrator task that exercises browser, file-edit, terminal, plan, and worker-spawn tools.
- **Acceptance gates** (rendered markup search):
  - [ ] No occurrence of `orchestrate_<verb>_<verb>` (e.g. `accept_work`, `spawn_agent`) as user-visible text in the thread.
  - [ ] No occurrence of `browser.openSession`, `browser.observe`, `browser.act` as user-visible text.
  - [ ] Raw tool names appear only inside collapsed `<details>` blocks (or are dropped entirely from the compact path).
- **Reference tests**: `OrchestratorMessages.test.tsx` (compact rows), `WorkEntryRow.test.tsx` (rich rows).

### AT-34 — Semantic phase headlines for non-browser work

- **Steps**: agent runs `read`, `edit`, `bash`, `plan_update`, `wait_agent`.
- **Acceptance gates**:
  - [ ] `read` → "Reading files".
  - [ ] `edit`/`write` → "Editing".
  - [ ] `bash` → "Running command".
  - [ ] `plan_update` → "Planning".
  - [ ] `wait_agent` → "Waiting".
  - [ ] Unknown tools → fallback label, never the raw tool name.

### AT-35 — Composer agent-state pill reflects current run

- **Steps**: drive a long-ish task and watch the pill.
- **Acceptance gates**:
  - [ ] Pill transitions: idle/ready → thinking → working → (waiting | done) → ready.
  - [ ] On error, pill reads "blocked" with rose styling.
  - [ ] On idle/completed, pill reads "ready" with neutral styling (audit log: 17V-F3).

### AT-36 — Browser evidence card shows the actual screenshot

- **Steps**: any test that produces a `screenshotArtifactRef`.
- **Acceptance gates**:
  - [ ] Card renders an actual `BrowserScreenshotPreview`, not just the artifact ID as text.
  - [ ] Loading and Failed states render explicit user-visible labels (audit log: 17G).
  - [ ] Runtime label reads "Live shared browser · evidence captured" (or "Headless validation mirror" / "Static screenshot evidence" / "Browser runtime unknown" as appropriate).

---

## 9. Reliability & restart

### AT-37 — Provider session recovers across server restart

- **Steps**: start a long-running orchestrator task; restart the server mid-flight.
- **Acceptance gates**:
  - [ ] Thread state survives the restart (durable event log replays).
  - [ ] Reopened thread shows the same work-log entries with the same evidence refs (no UUID drift).
  - [ ] In-flight worker either resumes or surfaces a clean "interrupted" state — never a phantom "running" with no progress.

### AT-38 — Port collision falls back to dynamic allocation

- **Reference**: 17H.
- **Steps**: launch desktop with `ORCHESTRATE_ELECTRON_CDP_PORT=9333`. While running, launch a second instance without setting that env.
- **Acceptance gates**:
  - [ ] First instance binds 9333.
  - [ ] Second instance dynamically allocates a different port.
  - [ ] If both pin 9333, the second startup fails fast with the documented error: `Unable to reserve Electron CDP debug port 127.0.0.1:9333: <cause>. Set ORCHESTRATE_ELECTRON_CDP_PORT to a different port or unset it for dynamic allocation.`

### AT-39 — Clean shutdown leaves no zombie processes

- **Steps**: launch desktop, spawn 2 workers, shutdown via the app's quit menu.
- **Acceptance gates**:
  - [ ] After shutdown, `pgrep -fl 'codex app-server'` returns nothing.
  - [ ] No orphan `electron`, `bun`, or `node` processes from this session remain.

### AT-40 — Stale MCP host produces a clear failure, not a silent hang

- **Reference**: 17W-6, 17X-1, 17X-7.
- **Steps**: load the orchestration MCP from a session that pre-dates the server, with no env vars set.
- **Acceptance gates**:
  - [ ] First MCP-subprocess stderr line emits the diagnostic with `port=fallback; auth=missing; parentThread=missing`.
  - [ ] Connection failures include the redacted boot-line in the error message.
  - [ ] No `Bearer <token>` or `?token=...` leaks into any error string.

---

## 10. Security & auth

### AT-41 — Auth token reaches the spawned MCP subprocess

- **Reference**: 17V-F1 (Claude), 17X-1 (Codex).
- **Steps**: start a managed session; inspect the MCP subprocess env via `/proc/<pid>/environ` (Linux) or `lsof -p <pid>` (macOS) or test fixture.
- **Acceptance gates**:
  - [ ] `ORCHESTRATE_WS_PORT` is set to the actual server port.
  - [ ] `ORCHESTRATE_AUTH_TOKEN` is set if the server has auth enabled.
  - [ ] `ORCHESTRATE_PARENT_THREAD_ID` is set for orchestrator threads.
  - [ ] None of the above are set for non-orchestrator agent threads.

### AT-42 — Token does not leak into logs or error strings

- **Reference**: 17X-3, 17X-4, V-N1.
- **Steps**: cause a connection failure with auth enabled; capture the full error chain.
- **Acceptance gates**:
  - [ ] The literal token value never appears in any log line, stack trace, or error message.
  - [ ] The redacted form (`?token=***` or equivalent) appears where the URL would otherwise expose it.

### AT-43 — Annotation comments do not include cross-thread leakage

- **Steps**: file annotations in two different orchestrator threads on the same project.
- **Acceptance gates**:
  - [ ] Each annotation is scoped to its thread.
  - [ ] Reviewer decisions in one thread do not leak comment text to the other.

### AT-44 — Worker workspaces respect write-scope

- **Steps**: spawn a worker with `writeScope: ["apps/web/**"]`. Ask the worker to write a file outside that scope.
- **Acceptance gates**:
  - [ ] Out-of-scope writes are blocked.
  - [ ] The blocked attempt is logged as an event.
  - [ ] The worker's REPORT does not falsely claim the write succeeded.

---

## How to run a batch of these

A typical smoke iteration picks 2-4 tests across at least 2 categories. Recommended starter batches:

- **Smoke confidence**: AT-01, AT-03, AT-05, AT-15.
- **Browser depth**: AT-05, AT-10, AT-13, AT-14.
- **Full-stack**: AT-29, AT-30, AT-32.
- **Annotation loop**: AT-25, AT-26, AT-27, AT-28.
- **Reliability**: AT-37, AT-38, AT-39, AT-40.

For each batch, the agent reports per `AGENT_AUDIT.md` conventions: chosen tests, what passed, what failed, what bug each failure surfaced, what fix landed (if any), and what the next obvious target is.

## Updating this catalog

When a new product capability becomes a thing Orchestrate is supposed to do well, add a test case here with a stable ID. Don't renumber existing tests. If a test is retired (capability removed), mark it with `**DEPRECATED**` and a one-line reason; don't delete it — the audit log links by ID.

Tests marked **NEW** are not yet expected to pass; they are aspirational targets for upcoming Phase work. Once a test is reliably passing in two consecutive smoke runs, drop the **NEW** marker.
