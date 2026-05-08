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


## ORC-194 (deferred at iter 128): transaction-coverage audit + lint rule

### What was attempted

Confirmed that the orchestration engine's processEnvelope flow IS wrapped in `sql.withTransaction` (apps/server/src/orchestration/Layers/OrchestrationEngine.ts:150-194). That covers the highest-risk multi-step path (append event + project + upsert receipt). However the bug calls for a repo-wide audit, not just one path.

### Why a single-iteration fix is risky

Two-part scope:

1. **Audit every aggregate-write path**: identify and verify transaction wrapping in OrchestrationEventStore, OrchestrationCommandReceiptRepository, ProjectionPipeline, CheckpointReactor, ProviderCommandReactor, terminal log writer, browser session ledger, telemetry batches. Some are single-statement (safe by default); others compose 2+ statements that must be atomic. Hours of read-and-trace.
2. **Custom lint rule**: oxlint does not currently support custom rules; we'd need to spike either an eslint custom plugin (requiring eslint config infra not currently in the repo) or a TS-AST script invoked by CI. Either is a meaningful build-system change.

### What would unblock it

A focused two-step plan:

- **Step A**: produce a written audit (`docs/architecture/transaction-coverage.md`) listing every aggregate-write path with its transaction status. Mark gaps with line numbers. Fix the gaps inline as they are found. One iteration per fix.
- **Step B**: spike the lint rule infrastructure separately. Decide between oxlint-custom-rule (if/when supported), eslint, or a TS-AST script. Land the rule in a follow-up iteration once Step A's gaps are closed.


## ORC-199 (deferred at iter 131): FK CASCADE / SET NULL audit

### What was attempted

Confirmed via grep that the FK audit covers ~10 cross-aggregate relationships across migrations 027-045. SQLite ALTER TABLE does not support changing FK constraints in place; each rewrite requires a shadow-table migration (CREATE new table with the desired FK clause, INSERT...SELECT from old, DROP old, RENAME new).

### Why a single-iteration fix is risky

For each FK relationship the audit needs:
1. Decide the right action: CASCADE (auto-delete dependents) vs SET NULL (orphan dependents) vs RESTRICT (current default; reject delete).
2. Write a shadow-table migration with all indexes preserved.
3. Add a fixture test that creates parent + child rows, deletes the parent, and asserts the chosen action.
4. Confirm projection and reactor flows still terminate correctly when a delete cascades to dependents.

Each FK is roughly an iteration of work. Bundling all 10 risks shipping migrations with an under-tested cascade behavior that data loss could expose in production.

### What would unblock it

Per-FK breakdown into ORC-199a..j (one per relationship). Land them as a sequence of small migrations, each with its own test. Suggested order: leaf-most aggregates first (evidence_artifact_content -> evidence_artifact -> ...) so cascade behavior accumulates predictably.


## ORC-201 / ORC-202 / ORC-204 (deferred at iter 134): server-side prompt-injection framing

### Shared root cause

Three sibling deferrals: ORC-201 (browser-derived content not in `<untrusted_browser_*>`), ORC-202 (MCP tool RETURN values not wrapped), ORC-204 (tool error messages not wrapped + ANSI not stripped). All share a common substrate need:

- A `wrapUntrustedContent` helper exists in `apps/web/src/promptFraming.ts` (ORC-200) covering file content. The helper supports kinds `file`, `browser`, `tool-output`, `console` and neutralizes `## REPORT`, `[ORCHESTRATOR_*]`, and `<orchestrator_*>` patterns inside the body.
- The helper needs to be promoted to `packages/shared/src/promptFraming.ts` so server-side code can use it without crossing app boundaries.
- Each of the three issues then needs the right server-side emit site identified and wired.

### Why a single-iteration fix is risky for each

The emit boundaries are spread across the provider adapters (Codex, Claude), the orchestration tool router, the checkpoint reactor, and the WS server's push pipeline. A naive wrap-everything-on-output approach risks double-wrapping (when one path already includes ARIA framing per ORC-028) or missed paths. Without an explicit trace of one round-trip per kind, the chance of regressions across 6+ files is high.

### What would unblock each

1. **Move `wrapUntrustedContent` to `@orchestrate/shared/promptFraming`** so server and web both consume it. Keep `apps/web/src/promptFraming.ts` as a thin re-export for back-compat.
2. **Trace one ARIA emit** end-to-end: from `BrowserAutomation` capture -> `OrchestrationToolRouter` -> provider adapter -> orchestrator system prompt slot. Document the exact wrap site.
3. **Per issue**, apply the helper at the identified boundary plus a regression test (mirror the ORC-200 test shape: assert the wrapped tag appears AND a planted directive is neutralized).

Track as ORC-201a (move helper), ORC-201b (trace), ORC-201c..(impl per issue).


## ORC-155 (deferred at iter 137): popup window tracking + switchToPage action

### What was attempted

Surveyed `apps/server/src/browser/Layers/BrowserAutomation.ts`. Confirmed the only page lookup is `findAttachedPage` at line 225 which uses `browser.contexts().flatMap((context) => context.pages())` to enumerate but never subscribes to `context.on("page", handler)` events. When window.open or target=_blank fires, the new page joins the context's page list but the runtime keeps acting on the original page.

### Why a single-iteration fix is risky

Five distinct components, each non-trivial:

1. **Page-event subscription**: persistent `context.on("page", handler)` lifecycle inside the BrowserSessionState construction. Needs to survive Playwright's frame-detached errors and align with the session-reaper.
2. **Popup id allocation**: stable `BrowserPageId` per popup (already exists in @orchestrate/contracts) plus a session-local index so the orchestrator can name a popup later.
3. **BrowserAction union extension**: add `{ kind: "switchToPage", targetPageId }` to the schema in `packages/contracts/src/browser.ts` and the runtime act() handler. Schema bump means the contracts test suite needs the new shape pinned.
4. **Auto-switch heuristic** (optional): debounce window after a click that produces a new page event, so a worker can do `clickAt + observe` without an explicit switch. Decide whether the active page tracker is replaced or stacked.
5. **Tests**: at least one for each of (1)-(4); ideally an integration test with a real Playwright headless context that exercises window.open.

That's a 5-day project, not a 1-iteration fix.

### What would unblock it

A 5-step plan tracked as ORC-155a..e:

- **155a**: schema bump + contract test for the new `switchToPage` action kind.
- **155b**: page-event subscription in BrowserSessionState; track popups by Playwright Page reference + assigned BrowserPageId.
- **155c**: runtime act() handler for switchToPage that swaps the "active page" used by subsequent actions.
- **155d**: per-session "list pages" surface (or include pages in the observation envelope) so the orchestrator can name a popup.
- **155e**: optional auto-switch heuristic + tests + docs.


## ORC-214 (deferred at iter 144): explicit shutdown ordering

### What was attempted

Read `apps/server/src/wsServer.ts:1095-1105`. Confirmed the existing finalizer composition uses `Effect.addFinalizer` calls inside a top-level scope; subscriptions, HTTP listener, and SqlClient layer all live under that scope but with no explicit ordering. The scope finalizers run in LIFO order, which is a partial mitigation, but it does not enforce: (1) stop accepting new connections first, (2) drain in-flight WS responses with a bounded timeout, (3) close subscription streams, (4) close DB.

### Why a single-iteration fix is risky

The proper fix needs:

1. **Lift the HTTP listener finalizer** out of the catchall scope so it can be triggered first ("stop accepting") via a SIGTERM handler, returning the listener fiber's stop signal as a Deferred.
2. **Track in-flight WS responses** with a counter or a Set of pending Deferreds, then drain them with a timeout (e.g. 5 seconds) before unwinding the scope.
3. **Sequence the subscription stream closures** explicitly via `Scope.close` on the subscriptionsScope before letting the parent scope unwind to the SqlClient layer.
4. **End-to-end smoke test** that boots the server, sends a request, signals SIGTERM, and confirms the response completes before close.

That's a 4-step build plus one integration test that exercises real signals. Each step has shutdown-correctness implications (server hangs forever, client gets unmatched responses). Doing all of it in one iteration risks shipping a regression that only surfaces on production exit.

### What would unblock it

A staged plan tracked as ORC-214a..d:

- **214a**: introduce a "stop accepting" Deferred that the HTTP server resolves on SIGTERM. The listener stops `accept()`-ing new connections. Test: send a request after SIGTERM and confirm it gets a 503.
- **214b**: track in-flight WS responses in a Set<Deferred>. On shutdown, await every Deferred with a 5-second timeout. Test: in-flight request completes before close; timeout exceeds drains stragglers with a log.
- **214c**: lift subscriptionsScope out and close it explicitly between WS drain and SqlClient teardown. Test: subscription stream emits "shutting-down" and stops accepting publishes.
- **214d**: end-to-end smoke test: boot, request, SIGTERM, assert response then exit cleanly within budget.


## ORC-215 (deferred at iter 145): explicit stream.error frame on mid-flight failures

### What was attempted

Read `apps/server/src/wsServer.ts:967-969,1145-1152`. Confirmed `Stream.runForEach(orchestrationEngine.streamDomainEvents, (event) => pushBus.publishAll(...))` runs without an error tap. If the stream fails (defect, downstream publish error), the runForEach exits silently from the worker fork; the connected clients never receive a marker that the stream stopped, so a re-attach with the last known offset can race past the gap.

### Why a single-iteration fix is risky

Three components each with consumers:

1. **Contract change**: add `orchestration.streamError` to `WS_CHANNELS` and `WsPushChannel` literal union in `packages/contracts/src/ws.ts`. The literal union type changes ripple into `WsPushData<C>` resolution, the encode schema, the test suite, and existing `pushBus.publishAll` callers (typecheck enforces `data: WsPushData<C>`).
2. **Server wiring**: `Stream.tapError` on the runForEach that publishes the error frame to the affected client subset. Per ORC-179 (deferred), there is no per-client subscription map yet, so the frame goes broadcast; if the per-client filter lands later, the server publish needs to be revisited.
3. **Client handler**: apps/web wsTransport / wsNativeApi register a `.on(orchestration.streamError)` handler that calls `replayEvents` from `lastSequence`. Without this last hop, the new frame is just a noise event the client ignores.

Doing all three in one iteration risks shipping a contract change that cannot be back-compat tested without the client wiring landed at the same time.

### What would unblock it

Per-component plan ORC-215a..c:

- **215a**: contract bump only. Add `orchestration.streamError` channel + payload schema. No producers / consumers. Test the schema decode round-trip.
- **215b**: server publish on Stream.tapError. Test with a fault-injected stream that exits with an error and asserts the frame is published.
- **215c**: client handler that calls replayEvents on the frame. Integration test with a stubbed transport that delivers the frame.


## ORC-224 (deferred at iter 150): audit log layer

### What was attempted

Surveyed `apps/server/src/`. Confirmed there is no dedicated audit-log facility; user-action events blend into the same operational log stream that contains debug/warn/error noise.

### Why a single-iteration fix is risky

Audit log infrastructure has 5 components:

1. **Persistence**: new `audit_events` table with `(id, actor, action, resource_kind, resource_id, occurred_at, result, metadata_json)`. Append-only with no UPDATE/DELETE; needs a migration plus a retention policy decision (90 days? indefinite?).
2. **Service interface**: `AuditLog` service with `record({ actor, action, resource, result, metadata })` that command dispatch and auth flows inject. Effect-style Layer plus a Live impl that writes through the persistence repository.
3. **Classification**: enumerate which commands are audit-worthy. Candidates: `project.delete`, `thread.archive`, `thread.unarchive`, `worker.terminate`, `settings.write`, all auth attempts (success and failure), all `orchestrator.run.create`. Each needs an entry in a table that maps command type to audit shape.
4. **Sink**: optional second sink for shipping audit events to a SIEM later (file with rotation, or a structured stdout stream the operator can pipe).
5. **Retrieval ops**: a `bun run audit-export --since <date>` script that reads the table and emits NDJSON.

Each component has its own correctness invariant; doing all five in one iteration risks shipping a half-wired sink or a classifier that misses critical commands.

### What would unblock it

Per-component plan ORC-224a..d:

- **224a**: persistence migration + repository (append-only).
- **224b**: AuditLog service interface + Live impl + tests.
- **224c**: classify and wire one round of audit-worthy commands (project.delete, worker.terminate, auth attempts) with integration tests.
- **224d**: retrieval script + retention policy doc + SIEM export adapter.


## ORC-229 (deferred at iter 152): cross-boundary traceId propagation

### What was attempted

ORC-062 (`apps/server/src/observability/traceContext.ts`) already establishes in-process trace context via FiberRef + `Effect.annotateLogs`. ORC-229 extends this across boundaries: a request that originates in the web client, passes through the WS server, dispatches to a worker thread (which itself spawns Codex/Claude RPC), should retain the same `traceId` across every log record so a single end-to-end search reconstructs the request flow.

### Why a single-iteration fix is risky

Five touchpoints, each with its own consumer:

1. **WS envelope contract**: add `traceId?: string` to `WsRequestEnvelope`, `WsResponseEnvelope`, `WsPushEnvelope` in `packages/contracts/src/ws.ts`. The literal-union types ripple into every encoder and consumer.
2. **WS server reception**: extract `traceId` from inbound envelopes; if missing, generate one. Wrap the route handler in `withTraceContext` so the FiberRef carries it through Effect chains.
3. **WS server emission**: stamp the `traceId` on outbound responses and pushes (via the pushBus).
4. **MCP server passthrough**: `scripts/orchestrate-mcp-server.ts` `wsRequest` adds `traceId` to outgoing frames; on inbound responses, surfaces it back to the caller (or stamps it on subsequent dispatches via the existing `withStableCommandId` flow).
5. **Codex JSON-RPC envelope**: add `traceId` (or X-Trace-Id header equivalent) to outgoing app-server requests and read it back from responses; thread through the existing manager session context.

Each touchpoint has its own backward-compat concern (existing clients will not send the header) and integration test (round-trip verification). Doing all five in one iteration risks shipping a contract bump where the field exists but never gets populated end-to-end.

### What would unblock it

Per-boundary plan ORC-229a..d:

- **229a**: WS envelope contract bump + server reception with FiberRef propagation. Test: an inbound request with `traceId` produces log lines annotated with that id.
- **229b**: outbound WS response/push emission stamps the same traceId. Test: a synthetic round trip echoes the id.
- **229c**: MCP client + Codex JSON-RPC envelope. Test: a wsRequest from MCP carries the id; Codex responses preserve it.
- **229d**: web client generation; integration test that captures logs across the full chain.


## ORC-231 (deferred at iter 155): external error sink (Sentry-compatible)

### What was attempted

Surveyed `apps/server/src/`. Confirmed there is no error-aggregator integration; all errors land in the local rotating log (now via ORC-228 redaction + ORC-230 file sink). Production incidents require ssh + log access.

### Why a single-iteration fix is risky

Four components:

1. **ErrorSink service interface**: define `apps/server/src/observability/ErrorSink.ts` with `record({ message, level, error?, fingerprint?, metadata })`. Effect Layer pattern.
2. **Sentry adapter**: `@sentry/node` (or a thin DSN-based POST that sidesteps the SDK), with sampling (default 10% for warn, 100% for error), fingerprint derivation from error class + stack frame.
3. **Logger hook**: extend `logger.error` (and the `Effect.logError` path used by the orchestration layers) to forward to the sink. Requires careful redaction reuse (ORC-228) so PII does not leak to a third-party service.
4. **Ops doc**: DSN secrecy, rate limits, retention, opt-out mechanism for self-hosted instances.

### What would unblock it

Per-component plan ORC-231a..d:

- **231a**: ErrorSink service interface + tests (pure no-op default, observable test sink).
- **231b**: Sentry adapter with sampling + fingerprinting + DSN config.
- **231c**: logger hook + redaction-aware metadata stripping.
- **231d**: ops doc + opt-out.


## ORC-238 (deferred at iter 156): runtime token rotation

### What was attempted

Surveyed `apps/server/src/wsServer.ts:1965-1978`. The auth token is read once from `ORCHESTRATE_AUTH_TOKEN` at startup and held in a closure variable. There is no persisted version, no revocation API, no signal handler that bumps the version. A leaked token is valid until the process restarts.

### Why a single-iteration fix is risky

Four steps with cross-cutting consequences:

1. **Persistence**: new `auth_tokens` table (`version INTEGER PRIMARY KEY, token_hash TEXT NOT NULL, issued_at TEXT NOT NULL, revoked_at TEXT, comment TEXT`). Migration plus a `seedActiveToken` step that runs once per server boot.
2. **Per-request check**: every WS auth path consults the current row. Caching strategy: read once on connection establishment, refresh on a SIGUSR1 or every N seconds (decide latency vs revoke speed tradeoff).
3. **Admin path**: CLI `bun run orchestrate-rotate-token` that inserts a new row + revokes the prior; OR a SIGUSR1 handler that re-reads ORCHESTRATE_AUTH_TOKEN and inserts a new version.
4. **Graceful eviction**: in-flight connections holding the revoked token. Decide: hard kill, grace period, or keep-existing.

### What would unblock it

ORC-238a (persistence + migration + admin CLI), ORC-238b (per-request check + cache), ORC-238c (eviction policy + tests), ORC-238d (docs).


## ORC-253 (deferred at iter 159): server -> web devDep architectural concern

### What was attempted

Confirmed there are NO server-side imports of `@orchestrate/web` (grep against `apps/server/src/` returned zero hits). At first glance the devDep looks droppable.

Then surveyed `apps/server/scripts/cli.ts:143-152`:

```
const webDist = path.join(repoRoot, "apps/web/dist");
const clientTarget = path.join(serverDir, "dist/client");
if (yield* fs.exists(webDist)) {
  yield* fs.copy(webDist, clientTarget);
  yield* applyDevelopmentIconOverrides(repoRoot, serverDir);
  yield* Effect.log("[cli] Bundled web app into dist/client");
}
```

Plus `turbo.json` declares `build.dependsOn: ["^build"]`, which uses the package.json `dependencies` / `devDependencies` graph to compute build order. Drop the workspace dep and turbo will run the server build BEFORE the web build, the `webDist` check will fail, and the published server ships with no client. No tests would catch this.

### Why a single-iteration fix is risky

The architectural cleanup the bug-as-filed wants requires:

1. Extract `apps/web/dist` into a third package (e.g. `@orchestrate/client-bundle`) that the server can depend on without depending on the React/Vite app sources.
2. Or move the bundle step into a top-level orchestration package that builds web + server in correct order without requiring the dep edge.
3. Or adopt a different build orchestrator that supports cross-cutting "produces this artifact" declarations.

Each option is a build-system project of its own, with regressions visible only at desktop-package or end-to-end smoke time.

### What would unblock it

Track as ORC-253a (decide bundling strategy), ORC-253b (implement chosen strategy, drop dep, verify desktop smoke + npm publish path).


## ORC-245 (deferred at iter 164): multi-user owner_user_id

### What was attempted

Surveyed `apps/server/src/orchestration/decider.ts` project.delete + project lifecycle commands. Confirmed there is no `owner_user_id` column on the projects table and no caller-identity field on the existing project commands. The current single-user assumption ("default" caller for everything) is hard-coded throughout the dispatch path.

### Why a single-iteration fix is risky

Four touchpoints with cross-cutting consequences:

1. **Migration**: `projects.owner_user_id TEXT NOT NULL DEFAULT 'default'`. The default keeps existing data working; new projects inherit the caller's identity once it is propagated.
2. **Caller identity propagation**: WS auth path attaches a userId to the connection state; every command dispatch needs to pick it up. Currently the connection is just authenticated/not; no per-user identity is recorded.
3. **Decider assertion**: project.delete must assert `command.callerUserId === project.owner_user_id`. The same audit applies to every destructive project-level command (project.update title, project.archive, project.scripts.update, project.scripts.delete, etc.).
4. **Projection bump**: `OrchestrationReadModel.projects[]` exposes `owner_user_id` so the UI can show project ownership and decide whether to render the delete button.

Each touchpoint has its own failure mode (forgotten command, default-fallthrough, projection drift). Doing all four in one iteration without an audit pass risks shipping a check that fails open on at least one command.

### What would unblock it

ORC-245a (migration + projection bump), ORC-245b (caller-identity propagation), ORC-245c (decider asserts on project.delete + per-command audit), ORC-245d (UI gating + tests).


## ORC-254: Pin Electron to stable LTS via catalog (deferred)

### Context

apps/desktop/package.json currently pins `electron: 40.6.0` directly. The proposed fix has three parts:

1. Pin to a stable LTS Electron major.
2. Verify prebuilt binaries exist for darwin-arm64, darwin-x64, linux-x64, win32.
3. Move the version into the root catalog so all desktop tooling shares one source of truth.

### Attempted approaches and why each failed

1. **Catalog-only restructure (no version change)**: would centralize the pin without affecting behavior. Rejected as a sufficient close-out because the test surface is tautological (the assertion would just re-read package.json) and it does not address the bleeding-edge concern that motivated the issue.
2. **Bump to a known-good major while keeping behavior identical**: blocked. Selecting "the right" version requires live electronjs.org/releases data plus the CVE feed, neither of which the loop has confirmed network access to. Choosing a number from training-data memory risks pinning to a since-yanked release.
3. **Verify prebuilts via a CI matrix dry-run**: blocked. The loop runs in a single environment; we cannot exercise darwin-x64 + linux-x64 + win32 build paths from here.

### What would unblock it

ORC-254a: live look at https://releases.electronjs.org/ to identify the latest stable on each supported branch and cross-check the CVE database for 40.6.0.
ORC-254b: a one-shot manual `bun install` + `bun run build:desktop` on each supported platform (CI matrix or three local machines) to confirm prebuilt resolution.
ORC-254c: catalog migration (`electron`, `electron-builder`, `electron-updater` -> `catalog:` references in apps/desktop/package.json plus the resolved versions in the root `catalog` block). Mechanical once the version is chosen.

## ORC-256: @orchestrate/effect-compat re-export module (deferred)

### Context

344 call sites import Effect APIs (Stream, Queue, PubSub, Deferred, Schema, Cause, Layer, Effect, ServiceMap, ...) directly. The proposed compat module would centralize the import surface so that an upstream Effect 4.0 rename can be absorbed in one place.

### Why deferring

1. **Without migration, the module is dead code.** Adding `@orchestrate/effect-compat` that re-exports Effect APIs but keeping every existing import unchanged has zero runtime value. The whole point of a compat layer is that callers route through it.
2. **Bulk migration in a single iteration is unsafe.** Renaming 344 imports across 4 packages is mechanical but the diff is huge; one wrong path resolution yields a broken build. The protocol's "test that would have failed before" requirement also gives no traction here: the migration changes import paths, not behavior, so a meaningful failing-before-passing-after test is hard to construct beyond "the build still passes."
3. **ORC-081 already covers the early-warning need.** The forbidden-list regression test (`apps/server/src/observability/effectBetaCompat.test.ts`) flags any reintroduction of a beta-renamed API name. That is the practical mechanism the compat module would offer; a re-export layer is mostly future-proofing for a hypothetical rename that may never happen.
4. **Right-time deferral, not refusal.** When an actual upstream rename forces a multi-file refactor, that is the moment to introduce the compat module: the migration is then justified by an immediate need, the diff splits cleanly into "introduce module" + "rename caller" PRs, and the change is testable against the renamed API. A churn-driven compat layer is more maintainable than a speculative one.

### What would unblock it

- ORC-256a: Effect 4.0 RC or GA tag lands and breaks a public name. Capture the breaking diff in research.md.
- ORC-256b: introduce `packages/shared/src/effect-compat.ts` that re-exports the broken-and-renamed surface.
- ORC-256c: codemod-style migration commit (one PR per package, kept under ~50 file diff each).

## ORC-265: per-workspace vitest parallelism policy (deferred)

### Context

Only `apps/server/vitest.config.ts` declares parallelism (`fileParallelism: false`, justified by git + SQLite contention). Web, contracts, and shared rely on vitest defaults (parallel files, isolated worker forks). The proposed fix asks for explicit documentation plus per-workspace opt-in.

### Why deferring

1. **The "test that would have failed before" requirement is hard to satisfy.** Adding `fileParallelism: true` to apps/web is a no-op because that already is the default; the only meaningful test would be to re-read the config file. Adding `pool: "forks"` is similarly a no-op against the current default. Behavior-pinning needs a real contention reproducer.
2. **A real reproducer requires test-suite ordering analysis.** To prove an isolation gap exists, we would need to grep web/contracts tests for shared module-level state, then construct a deterministic two-test-file race that fails under `fileParallelism: true` and passes under `false`. That analysis is broader than a single-issue iteration.
3. **Documentation alone does not justify a fix entry.** The protocol requires a failing-then-passing test; a comment-only commit is not testable.

### What would unblock it

- ORC-265a: audit web + contracts tests for module-level mutable state. Specifically grep for `let` declarations in test setup, `vi.useFakeTimers` without reset, or shared `Map`/`Set` instances that span describe blocks.
- ORC-265b: if a deterministic race is found, capture it as a failing test under `fileParallelism: true` and ship the fix together with the config change.
- ORC-265c: if no race is found, the issue collapses to documentation only and can be closed as wontfix or downgraded to P3.

## ORC-284: visual-diff regression assertion (deferred)

### Context

`BrowserWorkflowPurpose` includes "regression-check" and `BrowserAssertion` has "screenshot-captured" (presence-only), but there is no actual pixel-comparison assertion. The promise of regression detection is unimplemented.

### Why deferring

The proposed_fix has four load-bearing pieces, each of which is its own decision:

1. **Library choice (pixelmatch vs jimp vs sharp)** needs live network research: CVE history, maintenance state, bundle size, and Playwright integration patterns. Pinning a library from training-data memory risks an abandoned package.
2. **Contract extension** (BrowserAssertion union + baseline + tolerance fields) is a small change but only useful once the handler exists; shipped alone, it is a dead schema variant a worker would have no path to use.
3. **runAssertion handler** with PNG decode + perceptual diff + tolerance check is the meaty implementation; it depends on (1).
4. **Baseline-screenshot storage** as evidence artifacts requires a new artifact mime/format (PNG), an `evidence.artifact.upload` flow that distinguishes baselines from per-run captures, and possibly a content-addressable storage layer to prevent baseline duplication. Today evidence artifacts are untyped strings.

Doing any one of these without the others ships dead code. The "test that would have failed before" framing for the contract-only step is tautological (a schema test that just re-reads the schema). The handler step needs the library choice first. The baseline storage step is a substantial separate refactor.

### What would unblock it

- ORC-284a: live research on pixelmatch vs jimp vs sharp; capture CVE state + last-release date in research.md.
- ORC-284b: extend BrowserAssertion union with `visual-diff` variant carrying `{ baselineRef: EvidenceArtifactId, tolerancePercent: number }`. Add contract test.
- ORC-284c: implement runAssertion handler. Decode both PNGs, compare with chosen library, emit failure when diffRatio > tolerance.
- ORC-284d: define a baseline-screenshot evidence-artifact protocol (typed mime, dedup-by-content-hash if duplication becomes a problem, baseline-vs-snapshot lifecycle in the read model).

## ORC-270: clock injection across ~13 test files (deferred)

### Context

~13 tests use `Date.now()` or `new Date()` directly. The proposed_fix asks for clock injection at the boundary so CI runs are deterministic.

### Why deferring

The 13 sites split into three categories that each need a different remediation:

1. **Deterministic-timestamp seeds** (e.g. `const now = new Date().toISOString();` to seed an empty read model). These don't drive any logic; the test passes regardless of the timestamp value. Replacing with a fixed string `"2026-01-01T00:00:00.000Z"` is a no-op test-wise and produces no failing-then-passing signal.
2. **Wait-for-condition loops** (`while (Date.now() < deadline) ...`). These genuinely depend on wall-clock progression and need either `Effect.TestClock` (with `Clock.set`) or `vi.useFakeTimers()`. Both require pulling test bodies into Effect-aware harnesses or restructuring the runtime hooks.
3. **Deadline-tracking helpers that already take `now()`** (e.g. `authAttemptLimiter`, `orphanedWorkersOnRecovery`). Just need callers updated. Mechanically tractable.

Without an actual flake reproducer, distinguishing which sites are flaky in CI vs which sites pass deterministically is guesswork. Refactoring all 13 in one pass is high-churn for low signal: most sites are category (1) and the change is cosmetic.

### What would unblock it

- ORC-270a: run the suite under heavy load (CPU-pinned) 50 times in CI; capture the test names that flake. This produces a prioritized list.
- ORC-270b: refactor the category (2) loops first (they are the ones that actually flake).
- ORC-270c: update category (3) callers to pass an injected `now()` from the test (small mechanical PR).
- ORC-270d: leave category (1) alone or replace with a frozen string in a final cleanup pass.
