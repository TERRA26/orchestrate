---
description: "Audit one area of the Orchestrate codebase for gaps, bugs, and risks; emit findings to .ralph/backlog.md"
argument-hint: "<area>"
---

# Gap Analysis

Perform a focused, evidence-based audit of ONE area of the Orchestrate codebase. The goal is to surface concrete, actionable issues with code locations and a proposed fix direction. Each finding goes into `.ralph/backlog.md` so the Ralph Loop can fix them in subsequent Phase B iterations.

## Input

Argument: a single area string from this rotation list (use the exact phrase):

- routing
- agent orchestration
- sub-agent contracts
- spec decomposition
- visual review pipeline
- error handling
- observability and logging
- auth and authz
- persistence and migrations
- rate limiting and concurrency
- frontend UX
- mobile responsiveness
- accessibility
- build and CI
- dependency hygiene
- type safety
- test coverage
- prompt injection surface
- secret handling

If no argument is given, ask which area to audit before proceeding. Do not pick one silently.

## What to do

1. **Refresh context** (read in this order, only what's relevant to the area):
   - `CLAUDE.md` (or `AGENTS.md`) at the repo root for current priorities and constraints.
   - `README.md` for high-level layout (if present).
   - The top-level `package.json` and the workspace package layout (`apps/*/package.json`, `packages/*/package.json`).
   - For the chosen area, the specific files most likely to contain the relevant code. Use the rotation-list mapping below as a starting point.

2. **Investigate**:
   - Trace the area's primary code paths from entry point to deepest leaf.
   - Look for: unbounded queues, missing logs, silent catches, missing rate limits, missing validation, broken auth, type assertions, untested branches, prompt injection vectors, secret-in-env patterns, missing accessibility attributes, dependency CVEs, etc.
   - Cross-check against the rotation list: are there issues in this area that overlap with adjacent areas?
   - For each suspected issue, READ the implicated lines (do not infer behavior from file names).

3. **Capture findings**: for every concrete issue surfaced (not speculation), append an entry to `.ralph/backlog.md` using this exact schema:

```
### ORC-### (next monotonic id, zero-padded to 3 digits)

- severity: P0 | P1 | P2 | P3
- area: <one of the rotation list>
- files: <paths and line ranges, e.g. apps/server/src/foo.ts:42-58>
- evidence: <the actual reproducer, log line, or quoted code snippet>
- proposed_fix: <short direction, not full code>
- status: PENDING
```

Severity rubric:
- P0: production data loss, security breach surface, OOM/crash path that's reachable.
- P1: substantive bug, broken contract, missing observability that hides P0s, or an attacker-favorable default.
- P2: developer-experience or maintainability problem, lint/type drift, missing test for non-trivial branch.
- P3: polish, prose, redundant code, minor inefficiency.

4. **Web research when needed**: if the area touches a library version (Effect, React Query, ws, Playwright, etc.), look up known issues, CVEs, and version-specific guidance. Save notes in `.ralph/research.md` keyed by issue id.

5. **Track sweep progress**: after the audit completes, append one line to `.ralph/areas-covered.md` in the format `<area> | pass <n> | iter <i>` where `<n>` is the current pass number (1 for the first time covering all 19 areas, 2 for the second, etc.) and `<i>` is the current Ralph Loop iteration number.

## Rotation-list mapping (start points)

- **routing**: `apps/web/src/routes/`, `apps/server/src/wsServer.ts` (route table), `apps/server/src/orchestration/Layers/*.ts`.
- **agent orchestration**: `apps/server/src/orchestration/`, `apps/server/src/codexAppServerManager.ts`, `apps/server/src/provider/Layers/*.ts`.
- **sub-agent contracts**: `packages/contracts/src/orchestrationTools.ts`, `apps/server/src/orchestration/orchestratorTools.ts`.
- **spec decomposition**: `apps/server/src/orchestration/orchestratorSystemPrompt.ts`, the orchestrator MCP tool schemas.
- **visual review pipeline**: `apps/server/src/browser/`, `apps/server/src/orchestration/Layers/Browser*`.
- **error handling**: every `Effect.catchCause`, `Effect.catchAll`, every `try/catch` site (use `grep -nE "} catch[ (]"`).
- **observability and logging**: `apps/server/src/logger.ts`, `apps/server/src/observability/`, every `Effect.logXxx` and `console.*` call.
- **auth and authz**: `apps/server/src/connectionAuth.ts`, `apps/server/src/authTokenProvisioning.ts`, `apps/server/src/wsServer.ts` upgrade handler.
- **persistence and migrations**: `apps/server/src/persistence/`, every `sql.withTransaction` call.
- **rate limiting and concurrency**: `Queue.unbounded` / `Map.set` cache patterns, in-flight dedupe maps, semaphore use, sub-process spawn patterns.
- **frontend UX**: `apps/web/src/components/`, React Query options, virtualizer measure paths.
- **mobile responsiveness**: `apps/web/src/components/` for breakpoints/media queries; mobile-specific hooks.
- **accessibility**: `apps/web/src/components/Icons.tsx`, every icon-only Button, every form/dialog/modal.
- **build and CI**: `package.json`/turbo config, GitHub Actions workflows, `tsconfig.json`, `vitest.config.*`.
- **dependency hygiene**: `package.json` versions, deprecated packages, `bun.lock` audit.
- **type safety**: `as` casts, `any` usage, schema decode without validation, exhaustive-switch holes.
- **test coverage**: missing `*.test.ts` next to non-trivial logic; integration tests; uncovered branches.
- **prompt injection surface**: every untrusted input that becomes a prompt to a provider; `apps/server/src/orchestration/orchestratorSystemPrompt.ts`; user-content framing tags.
- **secret handling**: env-var passing, file permissions on token files, log lines that might leak secrets.

## What NOT to do

- Do not run `/gap-analysis` recursively (one area per invocation).
- Do not duplicate an existing issue id; check `.ralph/backlog.md` for the highest current `ORC-###` and use the next.
- Do not propose a fix you would also implement in this turn; gap-analysis is discovery only.
- Do not add an issue without a concrete code reference (file path + line range or quoted snippet). Speculation belongs in research, not the backlog.
- Do not output the Ralph Loop completion promise tag from this command.

## Output

Brief summary in chat: how many issues were added, their severity distribution, and one sentence on the most critical finding. The full content lives in the state files.
