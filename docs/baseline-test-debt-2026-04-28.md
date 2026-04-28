# Baseline Test Debt - 2026-04-28

This records the verification state after Slice 1, the truthful headless-runtime bridge.

## Runtime Baseline

- Required Node: `24.13.1`
- Required Bun: `1.3.9`
- Enforcement points:
  - `package.json` `engines.node`: `^24.13.1`
  - `package.json` `engines.bun`: `^1.3.9`
  - `.nvmrc`: `24.13.1`
  - `.node-version`: `24.13.1`

The local default shell was still using Node `20.19.6`, which makes `@orchestrate/marketing:typecheck` fail before app diagnostics because Astro requires Node `>=22.12.0`. Running with Node `24.13.1` removes that environment blocker.

## Current Broad Check Failures

### `bun typecheck`

Command used:

```sh
PATH=/Users/christophe/.nvm/versions/node/v24.13.1/bin:$PATH bun typecheck
```

Result: fails in `@orchestrate/web#typecheck` after all other package typechecks, including marketing, pass.

Representative failures:

- `apps/web/src/components/benchmarks/LiveBenchImportDialog.tsx`: select handlers do not accept `null`.
- `apps/web/src/components/benchmarks/SwebenchImportDialog.tsx`: select handlers do not accept `null`.
- `apps/web/src/components/chat/composerProviderRegistry.tsx`: missing `ServerProviderModel` export from `@orchestrate/contracts`.
- `apps/web/src/components/chat/ProviderHealthBanner.tsx`: missing `ServerProvider` export from `@orchestrate/contracts`.
- `apps/web/src/components/orchestrator/useOrchestratorEngine.ts`: missing provider exports and stale NativeApi shape assumptions.
- `apps/web/src/components/OrchestratorPanel.logic.ts`: missing `ORCHESTRATOR_MAX_REVIEW_*` constants.
- `apps/web/src/lib/threadBootstrap.ts`: stale `threadType` requirements under `exactOptionalPropertyTypes`.

Classification: existing web contract/type drift. Not introduced by Slice 1 browser runtime bridge.

### `bun run test`

Result: fails in `@orchestrate/web#test`; non-web packages in the turbo run pass.

Representative failures:

- `apps/web/src/components/OrchestratorPanel.logic.test.ts`: missing `ORCHESTRATOR_MAX_REVIEW_WORK_LOG_DETAIL_CHARS`.
- `apps/web/src/wsTransport.test.ts`: expected push envelope listeners are not called.
- `apps/web/src/session-logic.test.ts`: work-log collapsing/order expectations differ from implementation.
- `apps/web/src/components/Sidebar.logic.test.ts`: class token expectations differ from current selected/active palette.
- `apps/web/src/pinnedThreadsStore.test.ts`: test assumes `window` in a non-browser environment.
- `apps/web/src/wsNativeApi.test.ts`: context menu bridge spy is not called.
- `apps/web/src/lib/threadBootstrap.test.ts`: active route draft reuse expectation differs from current logic.
- `apps/web/src/components/chat/MessagesTimeline.test.tsx`: expected class names differ from current markup.

Classification: existing web test debt. The focused browser/runtime/web evidence tests pass.

### `bun run test:scenarios`

Result: fails before scenario execution because the runner cannot connect to port `3774`.

Observed message:

```text
Cannot connect to server on port 3774. Is 'bun run dev:server' running?
```

Classification: scenario harness dependency on a manually running server. This should be fixed by the upcoming `DevServerSupervisor` / `PreviewTarget` slice so scenarios can launch their own server.

### `bun run test:orchestrator-smoke`

Result: exits `0`, but Vitest reports the target file and 39 tests are skipped.

Classification: smoke command is not currently exercising a live smoke path.

## Slice 1 Focused Checks

The following passed after Slice 1:

- `bun fmt`
- `bun fmt:check`
- `bun lint`
- `packages/contracts bun run typecheck`
- `bun run test:contracts`
- focused server runtime/router/workflow tests
- focused web browser evidence tests

The browser-runtime source checks confirm that public browser routing is through `BrowserRuntimeService`; `BrowserAutomation` is now hidden behind the browser runtime stack rather than imported by public router or WebSocket browser handlers.

## Slice 2 Verification Update - Durable Browser Evidence

Commands rerun under Node `24.13.1` after Slice 2 durable evidence wiring:

```sh
PATH=/Users/christophe/.nvm/versions/node/v24.13.1/bin:$PATH bun fmt
PATH=/Users/christophe/.nvm/versions/node/v24.13.1/bin:$PATH bun fmt:check
PATH=/Users/christophe/.nvm/versions/node/v24.13.1/bin:$PATH bun lint
PATH=/Users/christophe/.nvm/versions/node/v24.13.1/bin:$PATH bun typecheck
PATH=/Users/christophe/.nvm/versions/node/v24.13.1/bin:$PATH bun run test:contracts
PATH=/Users/christophe/.nvm/versions/node/v24.13.1/bin:$PATH bun run test
PATH=/Users/christophe/.nvm/versions/node/v24.13.1/bin:$PATH bun run test:scenarios
```

Slice 2 focused checks pass:

- `bun fmt`
- `bun fmt:check`
- `bun lint` exits `0`
- `bun run test:contracts`
- focused server persistence/evidence/runtime/router/workflow tests
- focused web browser work-log and embedded browser state tests

`bun typecheck` still fails only in `@orchestrate/web#typecheck`, matching the existing web contract/type drift described above. No Slice 2 server/contracts typecheck failure was observed before the web package failed.

`bun run test` still fails in `@orchestrate/web#test`, matching the existing web test-debt class described above. Representative failing files after Slice 2 are:

- `apps/web/src/components/OrchestratorPanel.logic.test.ts`
- `apps/web/src/session-logic.test.ts`
- `apps/web/src/components/Sidebar.logic.test.ts`
- `apps/web/src/lib/threadBootstrap.test.ts`
- `apps/web/src/composerDraftStore.test.ts`
- `apps/web/src/composerSlashCommands.test.ts`
- `apps/web/src/components/SidebarSearchPalette.logic.test.ts`
- `apps/web/src/pinnedThreadsStore.test.ts`
- `apps/web/src/wsNativeApi.test.ts`
- `apps/web/src/wsTransport.test.ts`
- `apps/web/src/components/chat/MessagesTimeline.test.tsx`
- `apps/web/src/terminalStateStore.test.ts`

Classification: still broad web test debt, not introduced by Slice 2 durable browser evidence. The new Slice 2 focused web tests passed.

`bun run test:scenarios` still fails before scenario execution:

```text
Cannot connect to server on port 3774. Is 'bun run dev:server' running?
```

Classification: unchanged scenario harness dependency on a manually running server. This remains a follow-up for the `DevServerSupervisor` / `PreviewTarget` slice.

## Slice 2B Verification Update - Artifact Fetch And Render

Commands rerun under Node `24.13.1` after adding `evidence.artifact.get` and BrowserPanel artifact-backed screenshot rendering:

```sh
PATH=/Users/christophe/.nvm/versions/node/v24.13.1/bin:$PATH bun fmt
PATH=/Users/christophe/.nvm/versions/node/v24.13.1/bin:$PATH bun fmt:check
PATH=/Users/christophe/.nvm/versions/node/v24.13.1/bin:$PATH bun lint
PATH=/Users/christophe/.nvm/versions/node/v24.13.1/bin:$PATH bun typecheck
PATH=/Users/christophe/.nvm/versions/node/v24.13.1/bin:$PATH bun run test:contracts
```

Slice 2B focused checks pass:

- `bun fmt`
- `bun fmt:check`
- `bun lint` exits `0`
- `bun run test:contracts`
- focused server persistence/evidence/runtime/router tests
- focused web artifact rendering, browser work-log, and embedded browser state tests

`bun typecheck` still fails in `@orchestrate/web#typecheck`, matching the existing web contract/type drift described above. During Slice 2B verification, one new BrowserPanel optional NativeApi type error was found and fixed; the remaining errors are the same baseline class.
