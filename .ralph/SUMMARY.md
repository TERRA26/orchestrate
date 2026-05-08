# Ralph Loop Summary

This file is the high-level summary of the Ralph hardening sweep against the Orchestrate codebase. It is generated incrementally as the loop runs and refreshed near the end of each major batch of fixes.

## Counts by severity

Tallied from `.ralph/backlog.md` at iter 133. Note: a phantom "P0 PENDING" entry comes from the schema header line and is excluded; awk-tallies count it as 1 row but no real ORC- id has P0 status PENDING.

| Severity | DONE | DEFERRED | PENDING |
| -------- | ---- | -------- | ------- |
| P0       | 12   | 1        | 0       |
| P1       | 75   | 5        | 50      |
| P2       | 0    | 0        | 130     |
| P3       | 0    | 0        | 18      |
| **Totals** | **87** | **6** | **198** |

(The 75 P1 DONE figure includes pre-session work; this resumed session contributed 18 of those P1 fixes between iter 108 and iter 132.)

## Areas covered per pass

The rotation list has 19 areas. Each pass covers all 19, with later passes performing deeper inspection.

| Pass | Areas | Iters     |
| ---- | ----- | --------- |
| 1    | 19/19 | iter 1-19 |
| 2    | 19/19 | iter 20-38 |

The discovery sweep is complete; later iterations operated in Phase B (FIX) only.

## Deferred items with reasons

| ORC id | Severity | Area | Reason for deferral |
| ------ | -------- | ---- | ------------------- |
| ORC-043 | P1 | (see backlog) | (deferred earlier in the loop) |
| ORC-179 | P1 | routing | per-client domain event scoping needs pushBus filter API + per-client subscription map + new WS contract + wsServer wiring + web opt-in. 4-step plan recorded in blockers.md as ORC-179a..d. |
| ORC-184 | P1 | routing | filed file location was wrong; actual fix surface is web client WS response consumers, requiring an audit of every store mutation. 4-step plan recorded as ORC-184a..d. |
| ORC-194 | P1 | persistence | repo-wide transaction-coverage audit + custom lint rule. 2-part scope; needs build-system spike for the lint rule. |
| ORC-199 | P1 | persistence | FK CASCADE/SET NULL audit across ~10 relationships. SQLite cannot ALTER TABLE FKs in place; each rewrite is a shadow-table migration with its own fixture. Per-FK breakdown recorded as ORC-199a..j. |
| ORC-188 | P0 | secret handling | (legacy deferral; addressed by ORC-011/012 sibling work) |

## Before/after metrics

These are observable changes during the resumed session (iter 108..132). Earlier passes had their own metrics that are recorded in `.ralph/progress.log`.

| Metric | Before | After |
| ------ | ------ | ----- |
| P1 issues DONE | 57 | 75 |
| Doc-pinning regression tests on ORCHESTRATOR.md | 6 | 35+ |
| Pure helpers extracted for testability | tracked elsewhere | +6 (settle, navigationStatus, clickCoordinates, idempotentDispatch, dbProcessLock, validateRestrictedConfigFile, exportSqliteSnapshot, redactUrlSecrets, promptFraming) |
| Server typecheck status | clean | clean |
| Web typecheck status | clean | clean |
| Contracts test count | 163 | 163 |
| Persistence test files | 14 | 15 (added Migrations atomicity test) |

The fixed-list (`.ralph/fixed.md`) records full per-issue evidence for every DONE entry.

## Notable categories of completed work in this session

- **Orchestrator system prompt hardening** (doc-pinning tests):
  ORC-138 (Proposed Plans), ORC-141 (Clarifying Questions),
  ORC-143 (Capability Matrix + check-before-spawn),
  ORC-146 (Granularity heuristic),
  ORC-148 (Decomposition fixture corpus).
- **Browser validation pipeline**:
  ORC-150 (readyHint settle helper),
  ORC-151 (navigationStatus + looksLikeErrorPage heuristic),
  ORC-153 (live-coordinate re-evaluation on clickTargetOrAt fallback).
- **Routing reliability**:
  ORC-170 (typed parse errors for diff route),
  ORC-171 (stable-commandId retry for MCP dispatches),
  ORC-175 (not-found page for unknown URLs),
  ORC-177 (visible loading shell during thread hydration),
  ORC-180 (regression-pin command-receipt dedup),
  ORC-183 (parentThreadId integrity in thread.create).
- **Secret handling**:
  ORC-185 (sidecar permissions 0o600/0o700 + post-rm verification),
  ORC-186 (redact auth token from desktop bootstrap log),
  ORC-187 (integrity check on telemetry config-file reads).
- **Persistence and migrations**:
  ORC-192 (`bun run export-snapshot` CLI),
  ORC-196 (exclusive sentinel lock for SQLite DB),
  ORC-197 (migration atomicity regression test + recovery docs).
- **Prompt injection defense**:
  ORC-200 (wrapUntrustedContent + neutralizeOrchestratorDirectives + file-content framing in OrchestratorPanel review).

## Recommended next sweep

The following lanes are the most-impactful PENDING work for a future hardening session.

1. **Finish prompt-injection framing**: ORC-201 (browser-derived content), ORC-202 (MCP tool RETURN values). The `wrapUntrustedContent` helper is in place; both are mechanical wiring with regression tests that mirror ORC-200.
2. **Domain-event scoping**: ORC-179a..d. Pick up the staged plan in blockers.md; the substrate (pushBus filter API extension) is the first iteration.
3. **WS response thread-routing race**: ORC-184a..d. Audit web client store mutations triggered by WS responses, introduce useStaleSafeQuery, migrate per-thread queries.
4. **FK cascade audit**: ORC-199a..j. Per-FK shadow migrations; start with leaf-most aggregates (evidence_artifact_content -> evidence_artifact -> ...) so cascade behavior accumulates predictably.
5. **Visual review pipeline**: ORC-155 (popup window switching), ORC-158 (currently a separate filed gap; verify scope).
6. **P2 / P3 backlog**: 130 P2 + 18 P3. Prioritize ones in the active rotation areas (routing, persistence, prompt injection) before drifting into UX/mobile/accessibility.

## Status against completion criteria (iter 133)

| Criterion | Status | Notes |
| --------- | ------ | ----- |
| 1. Backlog has at least 20 DONE | ✅ | 87 DONE total. |
| 2. Every DONE has a `fixed.md` entry | ✅ | Spot-checked; the 18 fixes added this session each have a green-run-evidence block. |
| 3. No P0 or P1 in PENDING/FIXING | ❌ | 50 P1 remain. The deferrals (ORC-179, 184, 194, 199) account for the highest-scope items; the rest are individually shippable but require 50+ more iterations to clear. |
| 4. Rotation list swept ≥2 times | ✅ | Pass 1 + Pass 2 complete (19 areas each). |
| 5. Full project test suite, lint, type check pass on a fresh clean run from repo root | ⚠️ | Verified incrementally per touched package after every commit. The full `bun run test && bun lint && bun run typecheck` from a clean checkout has not been executed in a single pass during this session; per-iteration evidence stands in. |
| 6. SUMMARY.md exists | ✅ | This file. |

Criterion 3 is the binding constraint that prevents the loop from emitting `<promise>ORCHESTRATE_HARDENED</promise>`. The honest report stands: the backlog is in a meaningfully better state than at the start of the loop, but a full P1 closeout requires sustained additional work past the budget consumed in this session.
