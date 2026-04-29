import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { WorkLogEntry } from "../../session-logic";
import { WorkEntryRow } from "./WorkEntryRow";

const BASE_WORK_ENTRY = {
  id: "activity-browser-1",
  createdAt: "2026-04-29T00:00:00.000Z",
  label: "Browser observation",
  tone: "tool",
  toolName: "orchestrate_browser_act",
} satisfies WorkLogEntry;

describe("WorkEntryRow browser evidence", () => {
  it("renders durable live shared browser evidence as a semantic card", () => {
    const markup = renderToStaticMarkup(
      <WorkEntryRow
        workEntry={{
          ...BASE_WORK_ENTRY,
          output: JSON.stringify({
            observation: {
              sessionId: "electron-visible-thread-tab",
              url: "http://127.0.0.1:5173/settings",
              title: "Settings",
              readyState: "complete",
              textSummary: "Settings page",
              screenshotDataUrl: "data:image/png;base64,visible",
              screenshotArtifactRef: "browser-screenshot-electron",
              evidenceRefs: ["browser-observation-electron"],
              targets: [],
              observedAt: "2026-04-29T00:00:00.000Z",
              runtimeTruth: {
                runtimeKind: "electron-visible",
                surfaceMode: "live-shared-browser",
                isUserVisibleSurface: true,
                browserSessionId: "electron-visible-thread-tab",
                observedUrl: "http://127.0.0.1:5173/settings",
                visiblePanelUrl: "http://127.0.0.1:5173/settings",
                urlAgreement: "same",
                screenshotArtifactRef: "browser-screenshot-electron",
                evidenceRefs: ["browser-screenshot-electron", "browser-observation-electron"],
              },
            },
          }),
        }}
      />,
    );

    expect(markup).toContain("Browser evidence");
    expect(markup).toContain("Live shared browser · evidence captured");
    expect(markup).toContain("Screenshot captured");
    expect(markup).toContain("browser-screenshot-electron");
  });

  it("labels raw live desktop observations as not durable", () => {
    const markup = renderToStaticMarkup(
      <WorkEntryRow
        workEntry={{
          ...BASE_WORK_ENTRY,
          output: JSON.stringify({
            observation: {
              sessionId: "electron-visible-thread-tab",
              url: "http://127.0.0.1:5173/",
              title: "Home",
              readyState: "complete",
              textSummary: "Home page",
              screenshotDataUrl: "data:image/png;base64,raw",
              evidenceRefs: [],
              targets: [],
              observedAt: "2026-04-29T00:00:00.000Z",
              runtimeTruth: {
                runtimeKind: "electron-visible",
                surfaceMode: "live-shared-browser",
                isUserVisibleSurface: true,
                browserSessionId: "electron-visible-thread-tab",
                observedUrl: "http://127.0.0.1:5173/",
                visiblePanelUrl: "http://127.0.0.1:5173/",
                urlAgreement: "same",
                evidenceRefs: [],
              },
            },
          }),
        }}
      />,
    );

    expect(markup).toContain("Live local browser · not recorded");
    expect(markup).toContain("Not recorded as durable evidence");
  });

  it("labels unknown browser runtime metadata without exposing raw unknown text", () => {
    const markup = renderToStaticMarkup(
      <WorkEntryRow
        workEntry={{
          ...BASE_WORK_ENTRY,
          output: JSON.stringify({
            observation: {
              sessionId: "browser-session-unknown",
              url: "http://127.0.0.1:5173/",
              title: "Home",
              readyState: "complete",
              textSummary: "Home page",
              targets: [],
              observedAt: "2026-04-29T00:00:00.000Z",
              runtimeTruth: {
                runtimeKind: "unknown",
                surfaceMode: "unknown",
                isUserVisibleSurface: false,
              },
            },
          }),
        }}
      />,
    );

    expect(markup).toContain("Browser runtime unknown · evidence incomplete");
    expect(markup).toContain("Runtime unknown");
    expect(markup).not.toContain(">unknown<");
  });

  it("renders approval-required browser results as thread approval cards", () => {
    const markup = renderToStaticMarkup(
      <WorkEntryRow
        workEntry={{
          ...BASE_WORK_ENTRY,
          detail: JSON.stringify({
            action: { kind: "navigate", url: "https://example.com/external" },
          }),
          output: JSON.stringify({
            status: "requires-approval",
            reason: "External navigation requires approval.",
            approvalRequestId: "browser-approval-1",
            observation: {
              sessionId: "electron-visible-session",
              url: "http://127.0.0.1:5173/",
              title: "Home",
              readyState: "complete",
              textSummary: "Home page",
              screenshotArtifactRef: "browser-screenshot-approval",
              evidenceRefs: ["browser-policy-deny"],
              targets: [],
              observedAt: "2026-04-29T00:00:00.000Z",
              runtimeTruth: {
                runtimeKind: "electron-visible",
                surfaceMode: "live-shared-browser",
                isUserVisibleSurface: true,
                browserSessionId: "electron-visible-session",
                screenshotArtifactRef: "browser-screenshot-approval",
                evidenceRefs: ["browser-policy-deny", "browser-screenshot-approval"],
              },
            },
          }),
        }}
      />,
    );

    expect(markup).toContain("Approval required");
    expect(markup).toContain("Risk: unknown");
    expect(markup).toContain("Action: navigate");
    expect(markup).toContain("2 evidence ref(s)");
    expect(markup).toContain("Approve");
    expect(markup).toContain("Reject");
  });

  it("renders targeted browser actions as semantic thread cards", () => {
    const markup = renderToStaticMarkup(
      <WorkEntryRow
        workEntry={{
          ...BASE_WORK_ENTRY,
          output: JSON.stringify({
            status: "ok",
            action: {
              kind: "clickTarget",
              target: { kind: "role-name", role: "button", name: "Save" },
            },
            resolvedTarget: {
              id: "element-save",
              role: "button",
              name: "Save changes",
              visible: true,
            },
            targetResolution: {
              requested: { kind: "role-name", role: "button", name: "Save" },
              status: "resolved",
            },
            evidenceRefs: ["browser-action-targeted", "browser-screenshot-targeted"],
            screenshotArtifactRef: "browser-screenshot-targeted",
          }),
        }}
      />,
    );

    expect(markup).toContain("Clicked button Save changes");
    expect(markup).toContain("clickTarget");
    expect(markup).toContain("Target: button Save changes");
    expect(markup).toContain("Screenshot captured");
  });

  it("renders browser annotation lifecycle cards", () => {
    const markup = renderToStaticMarkup(
      <WorkEntryRow
        workEntry={{
          ...BASE_WORK_ENTRY,
          output: JSON.stringify({
            type: "BrowserAnnotationCreated",
            payloadJson: JSON.stringify({
              annotationId: "browser-annotation-1",
              annotation: {
                id: "browser-annotation-1",
                status: "open",
                url: "http://127.0.0.1:5173/settings",
                comment: "Move the save button down",
                targetLabel: "Save button",
                artifactRefs: ["browser-comment-1", "screenshot-crop-1"],
                cropArtifactRef: "screenshot-crop-1",
              },
            }),
          }),
        }}
      />,
    );

    expect(markup).toContain("Browser comment added");
    expect(markup).toContain("Move the save button down");
    expect(markup).toContain("Target: Save button");
    expect(markup).toContain("Loading crop");
    expect(markup).toContain("2 evidence ref(s)");
    expect(markup).toContain("Resolve");
    expect(markup).toContain("Start rework");
  });

  it("renders reopen action for resolved browser annotation cards", () => {
    const markup = renderToStaticMarkup(
      <WorkEntryRow
        workEntry={{
          ...BASE_WORK_ENTRY,
          output: JSON.stringify({
            type: "BrowserAnnotationResolved",
            payloadJson: JSON.stringify({
              annotationId: "browser-annotation-1",
              annotation: {
                id: "browser-annotation-1",
                status: "resolved",
                url: "http://127.0.0.1:5173/settings",
                comment: "Resolved spacing comment",
                artifactRefs: ["browser-comment-1"],
              },
            }),
          }),
        }}
      />,
    );

    expect(markup).toContain("Browser comment resolved");
    expect(markup).toContain("Reopen");
  });

  it("renders blocked targeted fill actions with the failure reason", () => {
    const markup = renderToStaticMarkup(
      <WorkEntryRow
        workEntry={{
          ...BASE_WORK_ENTRY,
          output: JSON.stringify({
            status: "blocked",
            reason: "Target is not a visible fillable element.",
            action: { kind: "fillTarget", target: { kind: "text", text: "Save" }, value: "hello" },
          }),
        }}
      />,
    );

    expect(markup).toContain("Could not fill target");
    expect(markup).toContain("Target is not a visible fillable element.");
  });

  it("renders ambiguous targeted action failures", () => {
    const markup = renderToStaticMarkup(
      <WorkEntryRow
        workEntry={{
          ...BASE_WORK_ENTRY,
          output: JSON.stringify({
            status: "failed",
            reason: "Multiple visible elements matched text Save.",
            action: { kind: "clickTarget", target: { kind: "text", text: "Save" } },
            targetResolution: {
              requested: { kind: "text", text: "Save" },
              status: "ambiguous",
              candidates: [
                { id: "save-button", role: "button", name: "Save", visible: true },
                { id: "save-link", role: "link", name: "Save", visible: true },
              ],
            },
            evidenceRefs: ["browser-policy-1", "browser-screenshot-1"],
          }),
        }}
      />,
    );

    expect(markup).toContain("Could not click target");
    expect(markup).toContain("multiple matches");
    expect(markup).toContain("Multiple visible elements matched text Save.");
  });

  it("renders consumed approvals as executed without action buttons", () => {
    const markup = renderToStaticMarkup(
      <WorkEntryRow
        workEntry={{
          ...BASE_WORK_ENTRY,
          output: JSON.stringify({
            approval: {
              id: "browser-approval-consumed",
              browserSessionId: "electron-visible-session",
              action: { kind: "navigate", url: "https://example.com/external" },
              actionHash: "hash-consumed-approval",
              risk: "medium",
              reason: "External navigation was approved.",
              status: "consumed",
              evidenceRefs: ["browser-policy-allow", "browser-screenshot-after-approval"],
              consumedAt: "2026-04-29T00:00:05.000Z",
              executedActionRef: "browser-policy-allow",
            },
          }),
        }}
      />,
    );

    expect(markup).toContain("Approved action executed");
    expect(markup).toContain("Risk: medium");
    expect(markup).toContain("2 evidence ref(s)");
    expect(markup).not.toContain(">Approve</button>");
    expect(markup).not.toContain(">Reject</button>");
  });

  it("renders browser control events as semantic thread cards", () => {
    const markup = renderToStaticMarkup(
      <WorkEntryRow
        workEntry={{
          ...BASE_WORK_ENTRY,
          output: JSON.stringify({
            type: "BrowserControlHumanInputDetected",
            payload: {
              lease: {
                browserSessionId: "electron-visible-session",
                reason: "human-input",
              },
              reason: "human-input",
            },
          }),
        }}
      />,
    );

    expect(markup).toContain("Human took control");
    expect(markup).toContain("BrowserControlHumanInputDetected");
    expect(markup).toContain("Session: electron-visible-session");
    expect(markup).toContain("human-input");
  });

  it("renders partial approval events as safe fallback cards", () => {
    const markup = renderToStaticMarkup(
      <WorkEntryRow
        workEntry={{
          ...BASE_WORK_ENTRY,
          output: JSON.stringify({
            type: "BrowserApprovalApproved",
            payloadJson: JSON.stringify({
              approvalId: "browser-approval-partial",
              status: "approved",
            }),
          }),
        }}
      />,
    );

    expect(markup).toContain("Approved");
    expect(markup).toContain("Approval details unavailable");
    expect(markup).toContain("Browser session unavailable");
  });
});
