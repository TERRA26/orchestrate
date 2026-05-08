# Ralph Loop Summary

This file is the high-level summary of the Ralph hardening sweep against the Orchestrate codebase. Refreshed at iter 194 after `bun run test` from the repo root passed cleanly (criterion 5).

## Counts by severity

Tallied from `.ralph/backlog.md` at iter 194. Read first-occurrence pairs (`severity:` then `status:`) per ORC entry to avoid double-counting cleanup duplicates.

| Severity | DONE | DEFERRED | PENDING | Total |
| -------- | ---- | -------- | ------- | ----- |
| P0       | 12   | 1        | 0       | 13    |
| P1       | 113  | 19       | 0       | 132   |
| P2       | 0    | 0        | 130     | 130   |
| P3       | 0    | 0        | 18      | 18    |
| **Total** | **125** | **20** | **148** | **293** |

P0 + P1 in PENDING/FIXING: **0**.
DONE entries in fixed.md (h2 + h3 ORC headings): **125** (matches backlog).

Iter 187 closed ORC-277 (cross-run isolation). Iter 188 fixed Sqlite.ts Effect.try options-form (filed retroactively as ORC-292). Iter 192 fixed three pre-existing test failures that blocked criterion 5 (filed retroactively as ORC-293).

## Areas covered per pass

The rotation list has 19 areas. Each pass covers all 19. Discovery sweeps stopped after pass 2; the remaining iterations operated in Phase B (FIX) only.

| Pass | Areas covered |
| ---- | ------------- |
| 1    | 19/19 |
| 2    | 19/19 |

Iter range:

- Pass 1: iter 1-19 (one area per iteration).
- Pass 2: iter 20-38 (one area per iteration).
- Iter 39-187: Phase B (fixing only).

## Deferred items with reasons

20 issues were marked DEFERRED with structured ORC-Na..d plans recorded in `.ralph/blockers.md`. Summary table:

| ORC id  | Severity | Area                        | Reason for deferral (one-liner)                                                                  |
| ------- | -------- | --------------------------- | ------------------------------------------------------------------------------------------------ |
| ORC-043 | P1       | (legacy)                    | Deferred earlier in the loop; predates this session.                                             |
| ORC-179 | P1       | routing                      | Per-client domain-event scoping needs pushBus filter API + WS contract bump; ORC-179a..d plan.   |
| ORC-184 | P1       | routing                      | WS response audit needs every store-mutation site reviewed; ORC-184a..d plan.                    |
| ORC-188 | P0       | secret handling              | Legacy deferral; addressed by ORC-011/012 sibling work.                                          |
| ORC-194 | P1       | persistence                  | Repo-wide transaction-coverage audit + custom lint rule; needs build-system spike.               |
| ORC-199 | P1       | persistence                  | FK CASCADE/SET NULL audit per ~10 relationships; SQLite cannot ALTER TABLE FKs in place.         |
| ORC-201 | P1       | prompt injection             | Server-side browser content emit sites unidentified; need ARIA-framing trace before wiring guard. |
| ORC-202 | P1       | prompt injection             | MCP tool RETURN handling spans Codex/Claude adapters; same trace required as ORC-201.            |
| ORC-214 | P1       | (see backlog)                | Pass-2 deferral; plan recorded.                                                                  |
| ORC-215 | P1       | (see backlog)                | Pass-2 deferral; plan recorded.                                                                  |
| ORC-224 | P1       | (see backlog)                | Pass-2 deferral; plan recorded.                                                                  |
| ORC-229 | P1       | (see backlog)                | Pass-2 deferral; plan recorded.                                                                  |
| ORC-231 | P1       | (see backlog)                | Pass-2 deferral; plan recorded.                                                                  |
| ORC-238 | P1       | (see backlog)                | Pass-2 deferral; plan recorded.                                                                  |
| ORC-245 | P1       | auth and authz               | Multi-user owner_user_id needs migration + projection bump + decider asserts; ORC-245a..d.       |
| ORC-254 | P1       | dependency hygiene           | Electron LTS pin needs live release-channel research + cross-platform CI matrix; ORC-254a..c.    |
| ORC-256 | P1       | dependency hygiene           | effect-compat re-export module is dead code without 344-callsite migration; deferred until rename triggers it. |
| ORC-265 | P1       | build and CI                 | vitest parallelism config no-op vs defaults; needs ordering-race reproducer; ORC-265a..c.        |
| ORC-270 | P1       | test coverage                | 13 Date.now sites split across 3 categories; needs flake reproducer to prioritize; ORC-270a..d.  |
| ORC-284 | P1       | visual review pipeline       | 4 load-bearing pieces (lib choice, contract, handler, baseline storage); ORC-284a..d.            |

## Before/after metrics

Best-effort instrumentation; many "before" baselines were established mid-loop because the loop began on a partially-hardened repo.

| Metric                                          | Before (early loop) | After (iter 194) |
| ------------------------------------------------ | ------------------- | ---------------- |
| Test files (`apps/**/*.test.ts`, `packages/**`) | ~245                | 270              |
| Server vitest pass count                         | (not measured)      | 1289 passed (3 skipped) |
| Web vitest pass count                            | (not measured)      | 976 passed |
| P0 issues PENDING                                | 12 (later DONE)     | 0                |
| P1 issues PENDING                                | ~50 (peak)          | 0                |
| P0/P1 DONE                                       | 0 -> ~50            | 12 / 113 (125)   |
| Lint errors (workspace-wide)                     | 0                   | 0                |
| Lint warnings                                    | 147                 | 149              |
| Type errors (server / web / contracts / shared)  | 0                   | 0                |
| `bun run test` (turbo, all 11 packages)          | failing (orig)      | 11/11 successful |

Notes:

- Bundle size and Lighthouse score are not collected by the loop; would need a separate snapshot pass.
- The 2 new lint warnings come from added test files; warnings, not errors.
- Test-file count grew because closures introduced new test files (one per fix on average) plus a few helpers in `__fixtures__/`.
- The 3 skipped server tests are: `integration/providerService.integration.test.ts` (live providers required) plus 2 platform-specific helper tests.
- Criterion 5 verification ran under Node 24.14.1 (per package.json engines `^22.16 || ^23.11 || >=24.10`); the recovery suite uses `node:sqlite` which is Node 22+ only.

## Recommended next sweep for a human reviewer

The loop closed every P1 in scope and shipped structured plans for every deferred P1. The next sweep should pick up the 130 P2 + 18 P3 backlog and the deferred P1 follow-ups in priority order.

### Highest leverage

1. **ORC-179, ORC-184** (routing): per-client WS scoping is a real multi-tenant isolation hole; the plans are concrete (4 steps each) and the substrate is in place.
2. **ORC-201, ORC-202** (prompt injection): now that `wrapUntrustedContent` and `wrapToolError` shipped (ORC-200, ORC-204), the remaining browser-content + MCP RETURN sites just need the trace + wiring.
3. **ORC-199** (persistence FKs): SQLite ALTER TABLE FK rewrites are tedious but each step is small. The ORC-199a..j breakdown is ready.
4. **ORC-245** (multi-user auth): low priority for single-tenant deployment but blocks any move toward multi-user.

### Medium leverage

5. **ORC-254** (Electron pin) needs live release-channel research; do this when bumping any other Electron-side dependency.
6. **ORC-284** (visual-diff regression) unlocks the "regression-check" workflow promise. Pick a perceptual-diff library first (research note in research.md when filed).
7. **ORC-256** (effect-compat layer): only worth doing if Effect 4.0 GA actually breaks an API the codebase uses. Watch the Effect repo.

### Lower leverage / hygiene

8. **ORC-265** (vitest parallelism), **ORC-270** (clock injection): wait for an actual CI flake to prioritize. Both are no-ops vs current defaults until then.
9. **ORC-194, ORC-214, ORC-215, ORC-224, ORC-229, ORC-231, ORC-238**: pass-2 P1 deferrals; each has a plan in blockers.md.

### P2 backlog (130 issues)

The P2 backlog is dominated by:

- type-safety polish (eliminate remaining `as unknown as` casts; document branded-type construction patterns).
- error-handling polish (consistent error envelopes across WS handlers, see ORC-006).
- dependency hygiene (ORC-257 Playwright hoist, ORC-258 license fields, ORC-259 ws transitive duplicate).
- build/CI tightening (ORC-267 Turbo cache key includes catalog versions).

Pick whatever cluster has the most adjacent fixes and batch them.

### P3 backlog (18 issues)

P3 is mostly cosmetic. Defer until the P2 backlog is below 50.

## Where to look

| File                          | Purpose                                                                  |
| ----------------------------- | ------------------------------------------------------------------------ |
| `.ralph/backlog.md`           | 291 issues with severity, area, evidence, proposed_fix, status.          |
| `.ralph/fixed.md`             | Root-cause + change-summary + green-run-evidence for every closed issue. |
| `.ralph/blockers.md`          | Structured plans for the 20 deferred issues.                             |
| `.ralph/research.md`          | Library-version research + decisions captured during the loop.           |
| `.ralph/progress.log`         | Per-iteration log + checkpoints at iter 25/50/75/100/125/150/175.        |
| `.ralph/areas-covered.md`     | Rotation-list sweep history (pass 1 and pass 2 each at 19/19).           |
| `.ralph/STUCK.md`             | Iter-181 STUCK report; superseded by this SUMMARY at iter 187.           |

## Loop-level lessons

A handful of patterns recur across the 123 closes; they are worth capturing for future sweeps:

- **Pure-helper extraction is the cheapest unblock.** Many fixes (ORC-261 taskByWorkerId, ORC-275 findOrphanedWorkersOnRecovery, ORC-286 captureMultiFrameAriaSnapshot) became tractable when the inline call site was extracted to a pure module-level helper. The helper is testable without mounting the surrounding subsystem.
- **Branded-id sentinels beat `as unknown as` casts.** ORC-260 (SETTINGS_THREAD_ID) and ORC-261 (typed Map) showed that the small ergonomic cost of a sentinel constant is repaid the first time the brand catches a regression.
- **Decompose-then-defer beats blanket deferrals.** Issues like ORC-256 and ORC-284 each split into 4 ORC-Na..d steps in blockers.md. A future iteration can pick up one step at a time.
- **Test-data fixtures need a single source of truth.** ORC-268 seeded the shared-fixture pattern; future tests should consume it rather than re-define inline.
- **Doc-pinning regression tests work.** ORC-145, ORC-146, ORC-272, ORC-282 all use `readFileSync` + regex to assert specific markers in markdown files. A future maintainer who edits the doc cannot accidentally drop the contracted prose.
