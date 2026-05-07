---
active: true
iteration: 25
session_id:
max_iterations: 200
completion_promise: "ORCHESTRATE_HARDENED"
started_at: "2026-05-07T14:41:37Z"
---

MISSION
You are auditing and hardening the Orchestrate codebase. Find and fix at least 20 substantive issues spanning bugs, broken logic, security, performance, type safety, and UX. With a 200-iteration budget, keep going past the floor: aim to exhaust the backlog and sweep the rotation list at least twice. Quality of fixes matters more than speed.

STATE FILES (single source of truth across iterations)

- .ralph/backlog.md issues with status: PENDING | FIXING | DONE | DEFERRED
- .ralph/fixed.md detailed log of completed fixes (one entry per issue)
- .ralph/research.md web research notes keyed to issue IDs
- .ralph/blockers.md issues that could not be fixed and why
- .ralph/areas-covered.md tracks rotation list sweeps with pass number
- .ralph/progress.log one line per iteration
  If any of these files do not exist, create them on the first iteration before doing anything else.

ITERATION PROTOCOL
Run exactly ONE phase per iteration, choosing in this priority order.

Phase A: DISCOVER (run if backlog has fewer than 20 PENDING issues, OR rotation list has been swept fewer than 2 times)

1. Read CLAUDE.md, README, package.json, and the top-level tree to refresh context.
2. Invoke the /gap-analysis skill against ONE specific area you have not yet covered in the current sweep pass. Rotation list:
   routing, agent orchestration, sub-agent contracts, spec decomposition, visual review pipeline, error handling, observability and logging, auth and authz, persistence and migrations, rate limiting and concurrency, frontend UX, mobile responsiveness, accessibility, build and CI, dependency hygiene, type safety, test coverage, prompt injection surface, secret handling.
3. Track sweeps in .ralph/areas-covered.md as: <area> | pass <n> | iter <i>. After all areas are covered once, increment to pass 2 and start over with deeper inspection.
4. For every new issue surfaced, do focused web research on current best practices, known anti-patterns, and library-version-specific guidance. Save findings to research.md keyed by issue id.
5. Append each issue to backlog.md with this schema:
   id: ORC-### (zero-padded, monotonic)
   severity: P0 | P1 | P2 | P3
   area: <one of the rotation list>
   files: <paths and line ranges>
   evidence: <reproducer, log line, screenshot path, or quoted code>
   proposed_fix: <short direction, not full code>
   status: PENDING
6. Stop after the discovery pass. Do NOT also fix in this iteration.

Phase B: FIX (run when backlog has 20+ PENDING AND rotation list has been swept at least once)

1. Pick the highest-severity PENDING issue (P0 first, ties broken by oldest id). Mark it FIXING.
2. Invoke the /verified-build skill end to end. Do not skip steps:
   a. Read the existing code paths involved.
   b. Write the contract and a failing test that pins the bug before changing code.
   c. Implement the minimal change.
   d. Loop until green: unit tests, integration tests where relevant, lint, type check, build.
   e. Adversarial review: try to break your own fix, edge cases, race conditions, null paths.
   f. Integration proof on a real run, not just tests in isolation.
3. Web search any unknown before writing code: library version behavior, CVEs, framework idioms, current API shape. Capture decisions in research.md.
4. On green: mark DONE in backlog.md and write a fixed.md entry with root cause, change summary, files touched, tests added, evidence of green run (paste command and final lines of output), and any follow-ups.
5. If the fix is blocked after 3 honest attempts inside verified-build, mark the issue DEFERRED, write a full failure analysis to blockers.md (attempted approaches, why each failed, what would unblock it), and move on next iteration.
6. Stop after one issue is fully resolved or deferred.

REFERENCE CODE
You may consult ./reference/ (substitute the actual path of your reference directory before running) for feature patterns and prior art. Never copy code blindly. Adapt every borrowed pattern to Orchestrate's stack (Next.js, NestJS, TypeScript, Supabase) and conventions.

NON-NEGOTIABLE RULES

- One phase per iteration. Never interleave discovery with fixing.
- No em dashes anywhere in code, comments, commit messages, or docs.
- A fix is not done without a test that would have failed before the change and passes after.
- Commit after every successful Phase B with a conventional commit referencing the issue id, e.g. fix(orchestrator): handle empty spec list [ORC-007]
- If you find yourself mentally reframing a /verified-build step as 'not needed this time,' that is the signal to run it, not skip it.
- Never edit a state file in a way that loses prior history. Append and update status fields only.
- Do not artificially halt to hit the promise tag early. Keep going while there is meaningful work and budget remains.

PROGRESS REPORTING
At the end of every iteration, append exactly one line to .ralph/progress.log:
ITER <n> | PHASE <A|B> | <ORC-id or 'discovery:<area>:pass<n>'> | <one-line summary> | <files touched count>

Every 25 iterations, also append a checkpoint block to .ralph/progress.log:
=== CHECKPOINT iter <n> ===
DONE: <count by severity>
PENDING: <count by severity>
DEFERRED: <count>
areas covered: <pass 1 count> / <pass 2 count>
test suite: <pass|fail>
type check: <pass|fail>

COMPLETION CRITERIA (all six must be true)

1. backlog.md contains at least 20 issues with status DONE (floor, not target).
2. Every DONE issue has a corresponding fixed.md entry with green-run evidence.
3. No P0 or P1 issue remains in PENDING or FIXING state.
4. Rotation list has been swept at least 2 times.
5. Full project test suite, lint, and type check pass on a fresh clean run from the repo root.
6. .ralph/SUMMARY.md exists with: counts by severity, areas covered per pass, deferred items with reasons, before/after metrics where measurable (test count, type errors, bundle size, lighthouse score, etc.), and a 'recommended next sweep' section listing what a human reviewer should look at next.

When and only when all six are true, output exactly this on its own line and nothing else after it:
<promise>ORCHESTRATE_HARDENED</promise>

STUCK HANDLING
After 180 iterations, if completion criteria are not all true:

- Write .ralph/STUCK.md with: outstanding issues, blockers, attempted approaches, recommended next steps for a human reviewer.
- Do NOT output the promise tag.
- Stop work and surface the report at the top of your final message.
