# Orchestrate — Product Overview & Architecture

**Audience.** Anyone trying to understand what Orchestrate is, what problem it solves, how it works under the hood, and where it's going.

**Reading order.** Start with §1 if you've never seen the project. Skip to §3 if you already know it's a multi-agent coding orchestrator and want to know how the pieces fit. Skip to §6 if you want the shared-browser story. Skip to §11 for the current state and roadmap.

**Companion docs.**

- [`README.md`](../README.md) — install + run.
- [`docs/ORCHESTRATOR.md`](./ORCHESTRATOR.md) — the orchestrator agent's own operating instructions (the system prompt it runs under).
- [`docs/ORCHESTRATE_ACCEPTANCE_TESTS.md`](./ORCHESTRATE_ACCEPTANCE_TESTS.md) — the catalog of "what passing looks like."
- [`docs/AGENT_AUDIT.md`](./AGENT_AUDIT.md) — the per-batch audit/review log driving current development.
- [`docs/browser-runtime-notes.md`](./browser-runtime-notes.md) — runtime architecture notes for the browser layer specifically.

---

## 1. What is Orchestrate?

**Orchestrate is a multi-agent coding orchestrator with a shared visible browser.** It coordinates one or more coding agents (Codex, Claude, others) through a desktop app. The user gives a single high-level instruction; the orchestrator decomposes the work, spawns one or more worker agents, watches them code, runs the result in a real browser the user can see, captures durable evidence of every claim, and lets a reviewer accept or reject the work against hard gates.

The headline feature: **the user and the agent both see the same browser.** When the agent says "I tested it," the user is looking at the exact `webContents` the agent acted on. Screenshots become evidence, not decoration. URL agreement is verifiable. Human takeover is a one-click affordance. Two-browser substitution — where the agent acts in a hidden headless browser while the user watches a different one — is structurally prevented at the substrate layer, not just by policy.

The headline philosophy: **agent claims must be backed by durable evidence.** No "I think it works." Every observation, every action, every state transition is content-addressed, persisted, and replayable. Reviewer decisions are gated on the evidence, not on prose. Comments on the browser become focused rework tasks, with before/after screenshots that prove the change actually happened.

It is built on an event-sourced runtime, with explicit Effect-TS service composition, schema-validated contracts, and a desktop Electron host that owns the visible browser surface.

## 2. The problem this solves

Most coding-agent products today have three structural weaknesses:

1. **The "two browsers" trust failure.** The user sees a browser embedded somewhere in the UI; the agent acts in a separate headless Playwright instance somewhere else. The agent reports success based on its own browser; the user's browser shows something different. There's no architectural reason these have to be the same browser, so they aren't. This is the original Orchestrate audit finding (Phase-17 §2 in `AGENT_AUDIT.md`).

2. **Prompt-and-hope orchestration.** Multi-agent products spawn workers, hand them prompts, and trust the prompts. There's no durable record of what the worker actually did vs. what it claimed; no second-pass reviewer with concrete gates; no place to comment on the browser and have that comment become rework. The agent's claims and the actual artifacts drift apart.

3. **Raw tool calls in the user's face.** The thread UI shows `orchestrate_browser_act { kind: "click", … }` instead of "Clicked the Save button." The user can't tell what the orchestrator is actually doing. Long-running multi-worker tasks become noise.

Orchestrate addresses each:

1. **One shared visible browser.** Electron `WebContentsView` is the canonical surface. Playwright-style automation attaches to the running Electron via CDP (`chromium.connectOverCDP`) — same `webContents`, no second process. Failure modes (Electron unavailable, CDP unreachable) fail closed with a clear error rather than silently substituting a different browser.

2. **Durable evidence + reviewer with hard gates.** Every browser observation, action, and state transition is persisted as a content-addressed artifact (sha256). The reviewer runs gate-by-gate evaluation (dev-server-healthy, preview-target-opened, screenshot-evidence-resolves, no-page-errors, comments-addressed, etc.) and produces a structured `ReviewerDecision` with a plain-English user-visible summary. Comments on the browser become focused rework tasks with before/after evidence pairs.

3. **Calm thread UX.** Every tool call is mapped through a shared `phaseForToolEvent` presentation function to a semantic label ("Reading files", "Editing", "Running command", "Checking browser", "Screenshot captured", "Reviewing evidence"). Raw tool names live behind collapsed `<details>` blocks or are dropped from compact views entirely. An agent-state pill near the composer reads `thinking | working | waiting for approval | done | blocked` based on the current run.

## 3. How it works (one-message walkthrough)

A user types `"build me a small subscription-analytics dashboard at apps/demo-fullstack"` in the orchestrator panel. Here's what happens:

1. **Routing.** The orchestrator agent (a meta-agent running under `docs/ORCHESTRATOR.md`'s system prompt) classifies the request as `decompose`. It splits into two subtasks: build the API; build the dashboard UI.

2. **Spawn.** The orchestrator dispatches `orchestrator.run.create` → `orchestrator.task.create` → `thread.create` → `orchestrator.worker.spawn` → `thread.turn.start` for each worker. The worker process is `codex app-server` or a Claude SDK subprocess, depending on provider. Each worker gets `ORCHESTRATE_WS_PORT`, `ORCHESTRATE_AUTH_TOKEN`, and `ORCHESTRATE_PARENT_THREAD_ID` so it can call back into Orchestrate's tool surface.

3. **Worker work.** Each worker plans, reads files, edits, runs `bun typecheck`, etc. Every action becomes a domain event — projected into the read model that the web UI streams. Tool calls are logged with structured payloads, not raw blobs.

4. **Worker submit.** When a worker is done, it emits a `## REPORT` block in its final assistant message. The supervisor's `accept_work` boundary consumes this, captures fresh after-evidence (screenshot + DOM via `BrowserRuntimeService.observe`), dispatches `orchestrator.task.submit` with the evidence refs in payload, then `orchestrator.task.accept` (or reject).

5. **Reviewer.** The reviewer service builds an `EvidenceBundle` (browser observations, workflow assertions, screenshot refs, code-state refs) and a `ReviewerDecision` with gate-by-gate pass/fail. If the gate fails (e.g., `comments-addressed` because the user filed an unresolved annotation), the decision is `requested-rework` and a `ReworkPacket` describes what to fix.

6. **User sees a calm thread.** The orchestrator panel shows a sequence of semantic phase entries — "Started worker @abc12345", "Editing apps/demo-fullstack/server/src/app.ts", "Running command bun typecheck", "Checking browser", "Live shared browser · /api/ledger · 1280×720", "Screenshot captured", "Reviewing evidence", "Accepted: API endpoint passes all gates." Raw tool names are not visible.

7. **User can intervene.** They can take control of the browser at any time. They can comment on a UI element. The annotation becomes part of the work-log, and clicking "Start rework" with `mode: "start-agent-run"` spawns a focused rework worker that fixes only the commented issue, with before/after screenshots in the resulting card.

That's the loop. End-to-end, it can build a small full-stack feature, validate it in the same browser the user sees, and produce auditable evidence at every step.

## 4. Architecture (the four layers)

Orchestrate is a four-layer system. Each layer has a clean boundary and an owner.

### 4.1 Apps

| App                   | Responsibility                                                                                                                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/desktop`        | Electron host. Owns the visible `WebContentsView`. Exposes IPC bridges for the visible browser, the CDP endpoint, and lifecycle. Native theme integration.                                                              |
| `apps/server`         | Node/Bun WebSocket server. Wraps `codex app-server` (JSON-RPC over stdio) per session. Runs the orchestration engine. Owns the durable event log, the projection pipeline, the reviewer, and the browser runtime layer. |
| `apps/web`            | React/Vite UI. Connects to `apps/server` via WebSocket. Owns session UX, conversation/event rendering, the orchestrator panel, the browser panel, work-log presentation.                                                |
| `apps/demo-fullstack` | The smoke target. A small Express + React app the orchestrator can be asked to build. LedgerPilot is its current shape (audit log: Bundle 17W).                                                                         |

### 4.2 Packages

| Package              | Responsibility                                                                                                                                                                                                                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts` | Effect/Schema definitions for every wire-format type: orchestration commands, domain events, browser observations, runtime truth, reviewer decisions, evidence artifacts. Schema-only by design — no runtime logic. The single source of truth for what shapes can flow between server, web, desktop, and providers. |
| `packages/shared`    | Runtime utilities consumed by both server and web. Subpath exports (`@orchestrate/shared/git`, `@orchestrate/shared/logging`, etc.) — no barrel index.                                                                                                                                                               |

### 4.3 Providers (worker drivers)

| Provider | What it drives                                                                                                                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Codex    | The OpenAI [Codex CLI](https://github.com/openai/codex) wrapped via its `codex app-server` JSON-RPC stdio interface. Each session is a child process; messages flow as Codex's typed item events (agent_message, reasoning, command_execution, file_change, tool_call, plan_update). |
| Claude   | The [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript). Subprocess-style adapter; same domain-event projection at the orchestration layer.                                                                                                                |

The orchestration MCP server (`scripts/orchestrate-mcp-server.ts`) is the bridge that gives workers access to orchestration tools (spawn other agents, accept work, etc.) by speaking back to the server's WebSocket as a child process.

### 4.4 Runtime substrates

| Substrate                       | What it provides                                                                                                                                                                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Effect-TS                       | Layered service composition. Every server-side capability is a `Service` exposed via a `Layer`. Test wiring overrides specific layers; production wiring composes the live ones. Errors are typed; effect-y nulls don't escape into call paths. |
| SQLite (event log + projection) | The durable event store. Each domain event is an append-only row. Projection runs build the read model the web UI consumes. Restart-stable: kill the server, restart, the state replays.                                                        |
| Electron `WebContentsView`      | The visible browser surface. The same surface used for both user viewing and (via CDP attach) Playwright-style automation.                                                                                                                      |
| Playwright (CDP attach)         | The validation runtime. Attaches to the running Electron app's debug port via `chromium.connectOverCDP`. Each `WebContentsView` is a `Page`; correlation by `webContents.id` ↔ CDP `targetId` (not URL).                                        |

## 5. The shared visible browser (technical detail)

This is the most distinctive part of the architecture, so it deserves its own section.

### 5.1 The two-browser failure mode (what we don't do)

A naive multi-agent coder typically:

1. Embeds a `<webview>` or `<iframe>` in its UI for the user to look at.
2. Spawns a Playwright Chromium process for the agent to automate.
3. Routes "open page X" to the agent's Playwright; the user's `<webview>` doesn't know.

Result: two browsers, two URLs, two cookie jars, two render trees. Agent says "I clicked Save"; user's `<webview>` has never navigated to that page. Trust is dead.

### 5.2 What Orchestrate does instead

The user's visible surface is `Electron WebContentsView`. The Electron main process boots with `app.commandLine.appendSwitch("remote-debugging-port", String(port))` (port allocated dynamically per `apps/desktop/src/electronCdpPort.ts`). When the server's browser runtime needs to automate the same page, it does:

```ts
const browser = await playwright.chromium.connectOverCDP(`http://localhost:${port}`);
const page = await findAttachedPage({ browser, cdpTargetId });
```

`findAttachedPage` correlates by `targetId` (not URL — URLs change during navigation). The returned `Page` is the **same** `webContents` the user is looking at. There is no second process. There is no "automation browser" to drift away.

If the desktop is unavailable (Electron not running, CDP port unreachable), the runtime fails closed with `Effect.fail` and a clear error. There is no fallback to launching a separate Playwright Chromium. The check is enforced at every entry point: `wsServer`, `OrchestrationToolRouter`, and as a final backstop in `BrowserRuntimeService.openSession` itself.

### 5.3 Runtime kinds, surface modes, and "runtime truth"

The contract distinguishes:

- `runtimeKind`: `"electron-visible" | "playwright-headless" | "chrome-extension"`
- `surfaceMode`: `"live-shared-browser" | "headless-validation-mirror" | "playwright-attached" | "static-screenshot-evidence"`
- `isUserVisibleSurface: boolean`

Every browser observation carries a `runtimeTruth` field with these. The UI labels every browser-evidence card according to that truth. Users see "Live shared browser · evidence captured" for `electron-visible`, "Headless validation mirror" for separately-launched Playwright, "Static screenshot evidence" for replayed artifacts. There is no scenario where the user sees one label while the underlying surface is something else.

### 5.4 Co-control: human and agent in the same browser

The browser session has an explicit FSM:

```
Idle → AgentControl → AwaitingApproval(action) → HumanControl → AgentObserve → AgentControl
```

- The user can **take control** at any time. The lease layer transitions to `human-control` and the agent's next action attempt fails until a fresh observation is captured (the agent must not act on stale state).
- **Risky actions** (form submission with auth credentials, payment, anything classified as consequential) require explicit user **approval**. Approvals are single-use, durable, and consumed.
- **Human input** (keyboard, mouse, navigation) preempts agent control. The transitions are tracked as durable events.

Implementation is in `apps/server/src/browserRuntime/` (lease and approval services) plus the desktop bridge in `apps/desktop/src/browserManager.ts`.

## 6. Evidence-backed claims (the durability story)

Every claim the agent makes about the browser is backed by a content-addressed artifact:

- **Screenshots** are stored as `evidence_artifacts` rows with `sha256`, `byte_size`, `content_type`, and a stable `artifact_id`. The byte content lives in `evidence_artifact_contents` (or — if encrypted/large — pointed at by `storage_uri`).
- **Browser observations** (URL, title, ARIA snapshot, page metrics, console errors, network errors) are recorded as `browser-observation` JSON artifacts.
- **DOM snapshots** are a typed `browser-dom-snapshot` kind — used for before/after evidence in the rework loop.
- **Browser actions** (click, fill, scroll, navigate) record action evidence, post-action observations, and policy decisions.
- **Workflow runs** produce assertion results (URL match, screenshot captured, no console errors, …) attached to a `BrowserWorkflowRun` row.
- **Reviewer decisions** include a full `EvidenceBundle` with gate-by-gate evaluation; the bundle is persisted as a durable snapshot, not just held in memory.

The `BrowserEvidenceRecorder` enforces that every claim has at least one durable ref. If a record is incomplete (missing `runtimeKind`, missing screenshot bytes), the recorder annotates the gap explicitly (`"unknown"` rather than guessing) and emits a `logWarning`. There is no "the agent thinks it took a screenshot but no bytes were saved" path.

## 7. The thread UX (calm progress story)

The orchestrator panel and the worker panes both render through a shared presentation pipeline:

1. **Domain events** stream over WebSocket into the read model.
2. **Work-log entries** are projected from those events.
3. **`phaseForToolEvent`** maps each entry to a semantic phase: Planning, Reading files, Editing, Running command, Checking browser, Screenshot captured, Reviewing evidence, Waiting, Done, Blocked. Unknown tools return `null` and the renderer falls back to `workEntry.label ?? workEntry.toolTitle ?? "activity"` — never a raw `orchestrate_*` tool name.
4. **`browserSurfaceModeLabel`** and **`browserRuntimeKindLabel`** map the runtime truth to user-facing strings.
5. **`AgentStatePill`** in the composer reads the orchestrator's high-level status and shows `thinking | working | waiting for approval | done | blocked | ready` with appropriate styling.

Raw tool names, command-id strings, internal session ids, and other diagnostic detail are accessible — but only inside a collapsed `<details>` block. The default thread surface is the calm story: what the agent is doing, what evidence it captured, what the user can do next.

The acceptance tests in §8 of `ORCHESTRATE_ACCEPTANCE_TESTS.md` lock this down: a markup search for `orchestrate_` or `browser.openSession` as user-visible text must return zero matches.

## 8. The annotation → rework loop

This is the visual feedback loop that makes Orchestrate's iteration story different from "give the agent another prompt and hope."

1. **The user comments on the browser.** Click an element, region, or point in the browser panel. Type a comment. The annotation persists as durable evidence with:
   - `cropArtifactRef` — a screenshot crop showing the commented region.
   - `domSnippetArtifactRef` — the actual DOM around the target.
   - `styleSummaryArtifactRef` — computed styles for context.
   - `beforeScreenshotArtifactRef` and `beforeDomArtifactRef` — full-page state at comment time (this is the "before" of before/after).

2. **The reviewer notices the unresolved annotation.** When evaluating a worker submission, the `comments-addressed` gate fails if any annotation is still `open`.

3. **`Start rework` with `mode: "start-agent-run"`** dispatches:
   - `orchestrator.run.create` (focused budget — typically 1 worker, 1 task, 1 iteration)
   - `orchestrator.task.create` with the comment baked into the instruction and the annotation target in the focused routes/viewports
   - `thread.create`
   - `orchestrator.worker.spawn`
   - `thread.turn.start` with the kickoff message + the report-protocol reminder

4. **The worker fixes only the commented thing.** Spawn budget prevents it from sprawling.

5. **At submit, fresh after-evidence is captured.** `accept_work` calls `BrowserRuntimeService.observe` against the same browser session, captures `browserAfterScreenshotRef` and `browserAfterDomRef`, and includes them in the `orchestrator.task.submit` event payload.

6. **Projection writes the after-refs to the annotation row.** So the annotation now has both `before*ArtifactRef` and `after*ArtifactRef`.

7. **The work-log renders a paired before/after preview.** When both refs exist, the `BrowserAnnotationCard` shows a side-by-side `BrowserScreenshotPreview` for both. The user visually confirms the change.

8. **The reviewer accepts or rejects.** On accept, the annotation transitions to `resolved` and the comments-addressed gate passes.

This loop is why the annotation system isn't just decoration. Comments are durable input to focused rework with auditable visual proof.

## 9. Reviewer with hard gates

The reviewer is a server-owned service (`ReviewerDecisionService`) that produces `ReviewerDecision` records from `EvidenceBundle` snapshots. Every decision is:

- **Gate-by-gate**: each gate has a name, a status (`pass`, `fail`, `not-applicable`), and a reason. Standard gates include:
  - `dev-server-healthy`
  - `preview-target-opened`
  - `required-routes-checked`
  - `required-viewports-checked`
  - `screenshot-evidence-resolves`
  - `no-page-errors`
  - `no-console-errors`
  - `no-network-failures`
  - `assertions-passed`
  - `evidence-not-stale`
  - `comments-addressed`
  - `code-fresh` (the worker's submission is built against the latest task spec)

- **Action-packet-driven**: the decision produces a `ReviewerActionPacket` (accept) or `ReworkPacket` (reject) that downstream consumers consume to either close the task or spawn rework.

- **Plain-English summary**: the user-visible summary explains the decision without jargon. "Worker submitted /api/ledger but the dashboard's CORS allowlist still points at :5173 instead of :5175; rework instruction sent to fix the allowlist."

- **Durable**: the decision and the bundle are persisted via `038_EvidenceBundleSnapshot` so that re-opening a thread shows the same evaluation, byte-for-byte.

The acceptance tests in §6 and §7 of `ORCHESTRATE_ACCEPTANCE_TESTS.md` cover the reviewer flow end-to-end.

## 10. Multi-worker orchestration

A single user request can spawn multiple workers. The orchestrator manages the task graph, the spawn budget (`maxDepth`, `maxChildren`, `maxConcurrentWriters`, `maxTotalWorkers`), and the review queue. Workers can:

- **Run in parallel** when their working scopes don't overlap.
- **Serialize on shared resources** (e.g., one writer per `apps/server/`).
- **Be terminated** mid-flight by the orchestrator if the run drifts.
- **Be promoted/demoted** between foreground and background visibility (the user can focus a single worker pane or watch the orchestrator panel summary).

`orchestrate_wait_agent` and `orchestrate_wait_all` give the orchestrator agent durable wait primitives. Workers' submitted `## REPORT` blocks are the contract: they include `summary`, `filesWritten`, `testsRun`, `notes`, `hasChanges`. The reviewer parses these; mismatches between the REPORT and the actual checkpoint diff trigger warnings (audit log: 17W-3).

The current `apps/demo-fullstack` LedgerPilot smoke (audit log: Bundle 17W) drove a single Codex worker through this flow end-to-end and successfully built an in-memory subscription-analytics SaaS dashboard with KPIs, plan-mix bars, accounts table, and billing-risk alerts. Subsequent smokes are expected to drive parallel workers.

## 11. What "production-ready" means and where we are

The Definition-of-Done at §9 of `AGENT_AUDIT.md` enumerates the ten product invariants:

1. User-facing browser tasks always use the visible Electron WebContentsView by default.
2. Headless validation only runs when explicitly requested and is clearly labeled.
3. The agent can act in the visible browser.
4. The human can take over and pause/resume safely.
5. Risky actions require approval; approvals are single-use.
6. Every browser claim has durable, content-addressed evidence; runtime kind is recorded honestly.
7. Browser comments become orchestrator rework tasks.
8. Rework captures before/after evidence and renders a paired comparison card.
9. Reviewer decisions cite hard gates; the user-visible summary is plain English.
10. The thread reads like Codex/Cursor — semantic phases, not raw tool calls.

All ten are gate-tested individually. Phase 17's bundles (17A through 17X) have closed each invariant, with the final empirical confirmation pending an operator-driven hard-restart of the desktop stack to flush stale Codex MCP host context (audit log: Bundle 17X-7). Once that confirmation lands, Phase 17 is fully closed.

After Phase 17, the loop continues:

- **Recurring SaaS-build smokes** against the acceptance test catalog (`ORCHESTRATE_ACCEPTANCE_TESTS.md`). Each smoke picks 2-4 tests across at least 2 categories; failures become the next bundle.
- **Multi-worker scenarios** that exercise the spawn budget and coordination paths end-to-end.
- **Annotation → rework cycles** with real visual changes and before/after evidence.
- **Reliability hardening**: crash recovery, port collision handling, zombie process cleanup.

Future phases (18+) are intentionally undefined here. The doc captures intent up to where the smoke loop converges; the next direction will be set by what the smoke loop surfaces.

## 12. Where to look in the code

If you want to read the source, here's the rough map:

| What you want to read                                     | Where it lives                                                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| The orchestrator agent's system prompt                    | `docs/ORCHESTRATOR.md` and `apps/server/src/orchestration/orchestratorSystemPrompt.ts`             |
| The browser runtime layer (electron-visible + CDP attach) | `apps/server/src/browserRuntime/`                                                                  |
| The desktop visible browser                               | `apps/desktop/src/browserManager.ts`                                                               |
| The CDP port allocator                                    | `apps/desktop/src/electronCdpPort.ts`                                                              |
| Browser evidence persistence                              | `apps/server/src/browserEvidence/Layers/BrowserEvidenceRecorder.ts`                                |
| The reviewer service                                      | `apps/server/src/reviewer/Layers/ReviewerDecisionService.ts`                                       |
| The orchestration tool router                             | `apps/server/src/orchestration/Layers/OrchestrationToolRouter.ts`                                  |
| The orchestration MCP bridge                              | `scripts/orchestrate-mcp-server.ts`                                                                |
| The annotation service                                    | `apps/server/src/browserAnnotations/Layers/BrowserAnnotationService.ts`                            |
| The web app shell                                         | `apps/web/src/components/ChatView.tsx`                                                             |
| The work-log presentation                                 | `apps/web/src/browserWorkLog.ts`                                                                   |
| The shared phase mapper                                   | `apps/web/src/orchestratorPresentation.ts`                                                         |
| The browser panel                                         | `apps/web/src/components/BrowserPanel.tsx`                                                         |
| The work entry rendering                                  | `apps/web/src/components/chat/WorkEntryRow.tsx`                                                    |
| The compact orchestrator activity row                     | `apps/web/src/components/orchestrator/CompactActivityRow.tsx`                                      |
| The contracts                                             | `packages/contracts/src/` (start with `browser.ts`, `browserOrchestration.ts`, `orchestration.ts`) |
| Migrations                                                | `apps/server/src/persistence/Migrations/`                                                          |
| The demo SaaS smoke target                                | `apps/demo-fullstack/`                                                                             |

## 13. The intent — where this is going

The product Orchestrate is converging toward isn't just "another coding agent." It's the substrate for **agent + human collaboration on real software** where:

- **The browser is the substrate of trust.** Agents can do anything, but they can't fake the visible browser. The user always sees what the agent acts on.
- **Evidence is the substrate of accountability.** Every claim is durable. Reviews are auditable. Rework is traceable.
- **The thread is the substrate of understanding.** The user always knows what's happening, in plain language, without having to parse tool calls.
- **The agent is the substrate of execution, not authority.** The orchestrator decomposes; workers execute; the reviewer gates; the human steers. None of these are equivalent.

The ten DoD invariants in §11 are the floor. Above the floor, what we want is: the user can confidently delegate a feature to Orchestrate, watch it being built in a calm thread, comment on the result like they would on a coworker's PR, and accept or reject with full visibility into what was actually done. No surprises, no silent failures, no "the agent says it works." Real software, with real evidence, in real time.

If the smoke loop converges and the catalog in `ORCHESTRATE_ACCEPTANCE_TESTS.md` passes cleanly across two consecutive batches, that's when Phase 17 closes and the project graduates from "audit-driven hardening" to "product-driven iteration." That's the next inflection point.

Until then: the loop continues, one batch at a time, against the catalog.
