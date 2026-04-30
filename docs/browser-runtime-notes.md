# Browser Runtime Notes

## CDP-Attached Playwright Validation

- Electron main enables a Chromium remote debugging port before `app.whenReady()`. The port defaults to `9333` and can be overridden with `ORCHESTRATE_ELECTRON_CDP_PORT`.
- The desktop bridge exposes the current CDP endpoint plus each live browser session's `sessionId`, `webContentsId`, optional CDP `targetId`, URL, and title.
- The `playwright-headless` runtime kind now attaches to the running Electron browser with `chromium.connectOverCDP(...)` instead of launching a separate browser process.
- `BrowserRuntimeService` first opens the user-visible Electron session, then resolves the CDP page by that visible session id and target id. URL matching is intentionally not used because navigation can change URLs while the WebContents identity stays stable.
- If the desktop bridge, CDP endpoint, browser context, or target id is unavailable, the runtime fails closed. There is no fallback path that launches a separate validation browser.
- Attached Playwright evidence keeps `runtimeKind: "playwright-headless"` for compatibility and uses `surfaceMode: "playwright-attached"` to distinguish it from both direct Electron-visible control and the old separate-process headless validation mirror.
- Direct `electron-visible` bridge behavior remains unchanged. The attached validator reuses the visible browser substrate, but actions still flow through Playwright after attachment.

## Electron-Visible Target Actions

- Electron-visible inspection uses controlled internal scripts from `apps/desktop/src/browser/domInspectionScripts.ts`.
- Arbitrary agent-provided Electron-visible `evaluate` remains blocked.
- Element boxes and target action coordinates are CSS pixels.
- `clickTarget` clicks the center of the resolved CSS-pixel box with `mouseDown` and `mouseUp`.
- `fillTarget` focuses the resolved input-like target, selects existing contents when `clearFirst` is true, then calls `webContents.insertText`.
- Input-like targets are `input`, `textarea`, and `contenteditable` elements. Non-fillable matches return `targetResolution.status = "not-actionable"`.
- Duplicate matches return `targetResolution.status = "ambiguous"` and do not execute an action.
- Missing, ambiguous, and non-actionable target failures return structured target resolution data and must not write `BrowserActionRecorded` success evidence.
- Target highlighting is currently a temporary outline, not a durable annotation artifact.
- `browser-inspection` artifacts persist element summaries, runtime truth, URL/title, viewport/scroll data, screenshot refs, and capture time for later evidence review.
