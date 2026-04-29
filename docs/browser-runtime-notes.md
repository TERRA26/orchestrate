# Browser Runtime Notes

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
