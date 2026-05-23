# STUCK report - Orchestrate audit / hardening loop

Generated at iter 181 because the 180-iteration budget elapsed with completion criterion 3 still unmet. The promise tag was NOT emitted; remediation requires human follow-up on the items listed below.

## Where we landed

- 119 issues closed (DONE): 12 P0, 107 P1.
- 18 issues deferred with structured plans (DEFERRED): 1 P0, 17 P1. See `.ralph/blockers.md` for plans.
- 6 P1 issues still PENDING (the binding constraint).
- 130 P2 + 18 P3 issues PENDING (out of scope for the P0/P1-gating completion criterion but tracked).
- Rotation list swept twice (`pass 1` + `pass 2` in `.ralph/areas-covered.md`).

## Why we stopped

Completion criterion 3 ("No P0 or P1 issue remains in PENDING or FIXING state") is the hard blocker. Six P1 items remain. Each was reviewed during pass 2; none surfaced a path that fits "small enough to land in one verified-build pass" without compromising the failing-then-passing test discipline.

## Outstanding P1 PENDING

### ORC-268: extract a shared test-fixtures module

- Files: 197 test files across the repo.
- Why outstanding: the proposed_fix asks for "the most-shared 5-10 fixtures first", but identifying which fixtures are most-shared requires upfront analysis across 197 files. Building the module without picking the right fixtures yields a dead module; picking the wrong fixtures churns the migration twice.
- Attempted: I considered the OrchestratorTask / OrchestratorWorker fixtures (used in ORC-261 and elsewhere) but the duplication count is small (3 files), so the migration value is low. The MockWebSocket pattern in pushBus.test.ts is a candidate but is internal to one file.
- What would unblock: a one-pass static analysis script that buckets repeated `function makeX()` helpers across the suite by signature, pick the top 5 by frequency, then migrate.

### ORC-270: clock injection across ~13 test files

- Files: ~13 tests using `Date.now()` / `new Date()` directly.
- Why outstanding: the proposed_fix asks for vi.useFakeTimers or Effect TestClock at the boundary plus an audit. The audit and per-file refactor is mechanical but the test-that-would-have-failed-before requires an existing flake reproducer; without one, the refactor is preventive and lacks a clear contract to pin.
- Attempted: I considered injecting an injectable `now()` into one specific helper (orphanedWorkersOnRecovery does this). Generalizing requires identifying which tests actually flake.
- What would unblock: run the suite under heavy load 50 times and capture flakes; refactor only the offenders.

### ORC-271: concurrency stress suite

- Files: repo-wide; only 17 matches for Promise.all/race in tests.
- Why outstanding: building a focused stress suite (spawn N workers, fan-out N dispatches, exercise the semaphore) is a substantial new test scaffold. The "fail before, pass after" framing is awkward because the suite either reveals an existing race (bug found, big PR) or proves the locks work (no behavior change).
- Attempted: none in-loop. The right next step is a targeted reproducer for one specific lock (the maxConcurrentWriters semaphore would be the highest-value place to exercise).
- What would unblock: a simulated workload + property-based test against the dispatch ordering invariant.

### ORC-277: multi-orchestrator isolation

- Files: apps/server/src/orchestration/* (read model + dispatch).
- Why outstanding: introducing `orchestratorId` (or relying on `projectId`) as a filter dimension touches the read model, the projector, every read-side query, and the inter-worker messaging surface. This is large refactor work that should land as a series of PRs rather than a single iteration.
- Attempted: scoped-out for size. The sub-pieces (filter dimension, dispatch rejection, integration test) each warrant their own ORC entries.
- What would unblock: split into ORC-277a..d as separate issues; each becomes a tractable iteration.

### ORC-281: plan version history

- Files: apps/web/src/session-logic.ts:81-89, apps/web/src/components/PlanSidebar.tsx.
- Why outstanding: the data already exists in `proposedPlans: ReadonlyArray<ProposedPlan>` per thread (each upsert is a new entry). The fix is mostly UI: render the history with diffs and trigger-reason tagging. The trigger-reason tagging requires server-side schema changes; the diff rendering requires UI changes; both together form a multi-package PR.
- Attempted: scoped-out for size. The pure-helper `findProposedPlanHistory` would be a small step but would not, in isolation, satisfy the "audit trail" UX promise without UI consumption.
- What would unblock: extract the helper, ship the UI in a follow-up, schema-bump trigger-reason in a third pass.

### ORC-284: visual-diff regression assertion

- Files: packages/contracts/src/browserOrchestration.ts (BrowserAssertion union), apps/server/src/browserWorkflow/Layers/BrowserWorkflowManager.ts.
- Why outstanding: introducing a `visual-diff` assertion type requires a perceptual diff library (pixelmatch or jimp), baseline-screenshot storage (evidence artifacts), tolerance configuration, and a runAssertion handler. Multiple new dependencies + storage shape + handler logic.
- Attempted: scoped-out for size. The pieces (contract addition, baseline storage, handler implementation, threshold tuning) are independent and warrant their own iterations.
- What would unblock: split into ORC-284a (contract surface), ORC-284b (storage), ORC-284c (handler + dependency).

## Repo health at iter 181

- All targeted vitest runs green throughout the loop (per-issue verifications recorded in `.ralph/fixed.md`).
- `bun typecheck` clean across apps/server, apps/web, packages/contracts, packages/shared.
- `bun lint` clean (0 errors workspace-wide; 149 warnings, all pre-existing).
- `bun run build:desktop` not exercised in-loop; CI workflow now does (added in ORC-266).
- `bun run build:marketing` not exercised in-loop (Node 20 local; Astro requires Node 22+); CI workflow now does.

## Recommended next sweep for a human reviewer

1. **ORC-277 (multi-orchestrator isolation)** is the riskiest deferred P1. Single-tenant today is fine, but as soon as the orchestrator runs concurrently against two projects, cross-talk silently corrupts read models. Split into ORC-277a (`orchestratorId` filter dimension on the read model), ORC-277b (dispatch-time rejection of cross-orchestrator references), ORC-277c (multi-orchestrator integration test).
2. **ORC-271 (concurrency stress)** is a coverage gap that gates production confidence. Even without the multi-tenant work, the existing semaphore + dispatch ordering invariants need a deliberate stress suite. Start with `maxConcurrentWriters` since that is the load-bearing concurrency primitive.
3. **ORC-284 (visual-diff regression)** is the visual-review pipeline's promise. The pixelmatch + jimp ecosystem is mature; the work is straightforward but needs storage + handler + threshold tuning.
4. **ORC-281 (plan version history)** is UX-impactful; the data already exists. Build the UI without waiting for trigger-reason tagging; downstream tagging can be added later without breaking the renderer.
5. **ORC-270 (clock injection)** is a hygiene chore; needs a flake reproducer to prioritize correctly.
6. **ORC-268 (shared test fixtures)** is bottom-of-list; pick after a flock of new tests lands and duplication clusters become obvious.

The 18 deferred items in `.ralph/blockers.md` each carry an `What would unblock it` section with the exact next steps; pick those up in priority order alongside the six P1 PENDINGs.

## Where to look

- `.ralph/backlog.md`: 291 issues with severity, area, evidence, proposed_fix, status.
- `.ralph/fixed.md`: full root-cause + change-summary + green-run-evidence for each closed issue.
- `.ralph/blockers.md`: structured plans for the 18 deferred issues.
- `.ralph/research.md`: keyed library-version notes captured during the loop.
- `.ralph/progress.log`: per-iteration log + checkpoints at iter 25/50/75/100/125/150/175.
- `.ralph/areas-covered.md`: rotation list sweep history (pass 1 + pass 2 each at 19/19).
- `.ralph/SUMMARY.md`: counts by severity, areas covered per pass, deferred items with reasons, recommended next sweep.
