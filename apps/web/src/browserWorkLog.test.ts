import { describe, expect, it } from "vitest";
import { EventId } from "@orchestrate/contracts";

import {
  browserApprovalWorkSummary,
  browserAnnotationWorkSummary,
  browserControlWorkSummary,
  browserEvidenceWorkSummary,
  browserRuntimeTruthLabel,
  browserScreenshotDataUrls,
  browserTargetedActionWorkSummary,
  latestEmbeddedBrowserSessionFromBrowserWorkEntries,
  reviewerDecisionWorkSummary,
} from "./browserWorkLog";
import { deriveWorkLogEntries, type WorkLogEntry } from "./session-logic";

const BASE_WORK_ENTRY = {
  id: "activity-browser-1",
  createdAt: "2026-04-27T00:00:00.000Z",
  label: "Browser observation",
  tone: "tool",
  toolName: "orchestrate_browser_open_session",
} satisfies WorkLogEntry;

describe("browserWorkLog", () => {
  it("extracts preview and full screenshot data URLs from browser tool output", () => {
    const entry: WorkLogEntry = {
      ...BASE_WORK_ENTRY,
      output: JSON.stringify({
        sessionId: "browser-session-1",
        observation: {
          sessionId: "browser-session-1",
          url: "https://example.com",
          title: "Example Domain",
          previewScreenshotDataUrl: "data:image/jpeg;base64,preview",
          screenshotDataUrl: "data:image/jpeg;base64,full",
        },
      }),
    };

    expect(browserScreenshotDataUrls(entry)).toEqual({
      thumbnailDataUrl: "data:image/jpeg;base64,preview",
      fullDataUrl: "data:image/jpeg;base64,full",
    });
  });

  it("returns null when a browser tool result has no screenshot evidence", () => {
    const entry: WorkLogEntry = {
      ...BASE_WORK_ENTRY,
      output: JSON.stringify({
        success: true,
        directive: "orchestrate_browser_open_session",
      }),
    };

    expect(browserScreenshotDataUrls(entry)).toBeNull();
  });

  it("summarizes durable live shared browser evidence", () => {
    const entry: WorkLogEntry = {
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
    };

    expect(browserEvidenceWorkSummary(entry)).toMatchObject({
      title: "Browser evidence",
      statusLabel: "Screenshot captured",
      runtimeLabel: "Live shared browser · evidence captured",
      runtimeKind: "electron-visible",
      surfaceMode: "live-shared-browser",
      isDurable: true,
      observedUrl: "http://127.0.0.1:5173/settings",
      visiblePanelUrl: "http://127.0.0.1:5173/settings",
      urlAgreement: "same",
      screenshotArtifactRef: "browser-screenshot-electron",
      evidenceRefs: ["browser-screenshot-electron", "browser-observation-electron"],
    });
  });

  it("labels unknown browser runtime truth without exposing the raw runtime kind", () => {
    const entry: WorkLogEntry = {
      ...BASE_WORK_ENTRY,
      output: JSON.stringify({
        observation: {
          sessionId: "browser-session-unknown",
          url: "http://127.0.0.1:5173/",
          runtimeTruth: {
            runtimeKind: "unknown",
            surfaceMode: "unknown",
            isUserVisibleSurface: false,
          },
        },
      }),
    };

    expect(browserRuntimeTruthLabel(entry)).toBe(
      "Browser runtime unknown · Runtime unknown · not the visible browser",
    );
  });

  it("summarizes targeted browser action cards", () => {
    const entry: WorkLogEntry = {
      ...BASE_WORK_ENTRY,
      output: JSON.stringify({
        status: "ok",
        action: { kind: "clickTarget", target: { kind: "test-id", testId: "save-button" } },
        resolvedTarget: { id: "element-save", role: "button", name: "Save changes", visible: true },
        targetResolution: {
          requested: { kind: "test-id", testId: "save-button" },
          status: "resolved",
        },
        evidenceRefs: ["browser-action-1", "browser-screenshot-1"],
        screenshotArtifactRef: "browser-screenshot-1",
      }),
    };

    expect(browserTargetedActionWorkSummary(entry)).toMatchObject({
      title: "Clicked button Save changes",
      actionKind: "clickTarget",
      targetLabel: "button Save changes",
      status: "ok",
      evidenceRefs: ["browser-action-1", "browser-screenshot-1"],
    });
  });

  it("summarizes blocked targeted fill actions", () => {
    const entry: WorkLogEntry = {
      ...BASE_WORK_ENTRY,
      output: JSON.stringify({
        status: "blocked",
        reason: "Target is not a visible fillable element.",
        action: { kind: "fillTarget", target: { kind: "text", text: "Save" }, value: "hello" },
        targetResolution: { requested: { kind: "text", text: "Save" }, status: "not-actionable" },
      }),
    };

    expect(browserTargetedActionWorkSummary(entry)).toMatchObject({
      title: "Could not fill target — not an input",
      actionKind: "fillTarget",
      targetLabel: "Save",
      status: "blocked",
      reason: "Target is not a visible fillable element.",
    });
  });

  it("summarizes ambiguous targeted click failures", () => {
    const entry: WorkLogEntry = {
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
    };

    expect(browserTargetedActionWorkSummary(entry)).toMatchObject({
      title: "Could not click target — multiple matches",
      actionKind: "clickTarget",
      targetLabel: "Save",
      status: "failed",
      reason: "Multiple visible elements matched text Save.",
      evidenceRefs: ["browser-policy-1", "browser-screenshot-1"],
    });
  });

  it("summarizes replayed browser annotation lifecycle events", () => {
    const entry: WorkLogEntry = {
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
            beforeScreenshotArtifactRef: "before-shot-1",
            beforeDomArtifactRef: "before-dom-1",
            afterScreenshotArtifactRef: "after-shot-1",
            afterDomArtifactRef: "after-dom-1",
          },
        }),
      }),
    };

    expect(browserAnnotationWorkSummary(entry)).toMatchObject({
      label: "Browser comment added",
      annotationId: "browser-annotation-1",
      comment: "Move the save button down",
      targetLabel: "Save button",
      cropArtifactRef: "screenshot-crop-1",
      beforeScreenshotArtifactRef: "before-shot-1",
      beforeDomArtifactRef: "before-dom-1",
      afterScreenshotArtifactRef: "after-shot-1",
      afterDomArtifactRef: "after-dom-1",
      evidenceRefs: ["browser-comment-1", "screenshot-crop-1"],
    });
  });

  it("labels raw live desktop observations as not recorded", () => {
    const entry: WorkLogEntry = {
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
    };

    expect(browserEvidenceWorkSummary(entry)).toMatchObject({
      runtimeLabel: "Live local browser · not recorded",
      isDurable: false,
      evidenceRefs: [],
    });
  });

  it("uses semantic action labels for browser action evidence", () => {
    const entry: WorkLogEntry = {
      ...BASE_WORK_ENTRY,
      label: "Navigated to /settings",
      output: JSON.stringify({
        observation: {
          sessionId: "electron-visible-thread-tab",
          url: "http://127.0.0.1:5173/settings",
          title: "Settings",
          readyState: "complete",
          textSummary: "Settings page",
          screenshotArtifactRef: "browser-screenshot-action",
          evidenceRefs: ["browser-action-recorded", "browser-screenshot-action"],
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
            screenshotArtifactRef: "browser-screenshot-action",
            evidenceRefs: ["browser-action-recorded", "browser-screenshot-action"],
          },
        },
      }),
    };

    expect(browserEvidenceWorkSummary(entry)).toMatchObject({
      statusLabel: "Navigated",
      runtimeLabel: "Live shared browser · evidence captured",
    });
  });

  it("extracts browser approval cards from requires-approval action results", () => {
    const entry: WorkLogEntry = {
      ...BASE_WORK_ENTRY,
      toolName: "orchestrate_browser_act",
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
      detail: JSON.stringify({
        action: { kind: "navigate", url: "https://example.com/external" },
      }),
    };

    expect(browserApprovalWorkSummary(entry)).toMatchObject({
      approvalId: "browser-approval-1",
      browserSessionId: "electron-visible-session",
      status: "pending",
      risk: "unknown",
      evidenceRefs: ["browser-policy-deny", "browser-screenshot-approval"],
    });
  });

  it("summarizes approval lifecycle events from replayed payloadJson", () => {
    const entry: WorkLogEntry = {
      ...BASE_WORK_ENTRY,
      output: JSON.stringify({
        type: "BrowserApprovalConsumed",
        payloadJson: JSON.stringify({
          approvalId: "browser-approval-consumed",
          browserSessionId: "electron-visible-session",
          status: "consumed",
          risk: "external-navigation",
          action: { kind: "navigate", url: "https://example.com/external" },
          actionHash: "action-hash-consumed",
          evidenceRefs: ["browser-action-recorded"],
          executedActionRef: "browser-action-recorded",
        }),
      }),
    };

    expect(browserApprovalWorkSummary(entry)).toMatchObject({
      approvalId: "browser-approval-consumed",
      browserSessionId: "electron-visible-session",
      status: "consumed",
      risk: "external-navigation",
      actionHash: "action-hash-consumed",
      evidenceRefs: ["browser-action-recorded"],
    });
  });

  it("does not crash on malformed approval payloadJson", () => {
    const entry: WorkLogEntry = {
      ...BASE_WORK_ENTRY,
      output: JSON.stringify({
        type: "BrowserApprovalApproved",
        payloadJson: "{not-json",
      }),
    };

    expect(browserApprovalWorkSummary(entry)).toBeNull();
  });

  it("renders fallback approval summaries for partial known approval events", () => {
    const entry: WorkLogEntry = {
      ...BASE_WORK_ENTRY,
      output: JSON.stringify({
        type: "BrowserApprovalApproved",
        payloadJson: JSON.stringify({
          approvalId: "browser-approval-partial",
          status: "approved",
        }),
      }),
    };

    expect(browserApprovalWorkSummary(entry)).toEqual({
      approvalId: "browser-approval-partial",
      status: "approved",
      risk: "unknown",
      evidenceRefs: [],
      detailsUnavailable: true,
    });
  });

  it("summarizes browser control events for thread rows", () => {
    const entry: WorkLogEntry = {
      ...BASE_WORK_ENTRY,
      output: JSON.stringify({
        type: "BrowserControlFreshObservationRequired",
        payload: {
          lease: {
            browserSessionId: "electron-visible-session",
            reason: "human-input",
          },
          reason: "human-input",
        },
      }),
    };

    expect(browserControlWorkSummary(entry)).toEqual({
      label: "Fresh observation required",
      eventType: "BrowserControlFreshObservationRequired",
      browserSessionId: "electron-visible-session",
      reason: "human-input",
      evidenceRefs: [],
    });
  });

  it("summarizes replayed browser control events from payloadJson", () => {
    const entry: WorkLogEntry = {
      ...BASE_WORK_ENTRY,
      output: JSON.stringify({
        type: "BrowserControlFreshObservationSatisfied",
        payloadJson: JSON.stringify({
          lease: {
            browserSessionId: "electron-visible-session",
            lastObservationRef: "browser-observation-fresh",
          },
          observationRef: "browser-observation-fresh",
        }),
      }),
    };

    expect(browserControlWorkSummary(entry)).toEqual({
      label: "Fresh observation captured",
      eventType: "BrowserControlFreshObservationSatisfied",
      browserSessionId: "electron-visible-session",
      evidenceRefs: ["browser-observation-fresh"],
    });
  });

  it("labels agent lease acquisition and release control events", () => {
    const acquired: WorkLogEntry = {
      ...BASE_WORK_ENTRY,
      output: JSON.stringify({
        type: "BrowserControlLeaseAcquired",
        payload: {
          lease: {
            browserSessionId: "electron-visible-session",
            holder: "agent",
            state: "agent-control",
          },
        },
      }),
    };
    const released: WorkLogEntry = {
      ...BASE_WORK_ENTRY,
      output: JSON.stringify({
        type: "BrowserControlLeaseReleased",
        payload: {
          lease: {
            browserSessionId: "electron-visible-session",
            holder: "none",
            state: "agent-control",
          },
        },
      }),
    };

    expect(browserControlWorkSummary(acquired)).toMatchObject({
      label: "Agent control active",
      holder: "agent",
      state: "agent-control",
    });
    expect(browserControlWorkSummary(released)).toMatchObject({
      label: "Control released",
      holder: "none",
    });
  });

  it("does not crash on malformed replayed browser control payloads", () => {
    const entry: WorkLogEntry = {
      ...BASE_WORK_ENTRY,
      output: JSON.stringify({
        type: "BrowserControlAgentResumed",
        payloadJson: "{not-json",
      }),
    };

    expect(browserControlWorkSummary(entry)).toEqual({
      label: "Agent resumed",
      eventType: "BrowserControlAgentResumed",
      evidenceRefs: [],
    });
  });

  it("renders fallback control summaries for partial known control events", () => {
    const entry: WorkLogEntry = {
      ...BASE_WORK_ENTRY,
      output: JSON.stringify({
        type: "BrowserControlHumanInputDetected",
        payloadJson: "{not-json",
      }),
    };

    expect(browserControlWorkSummary(entry)).toEqual({
      label: "Human took control",
      eventType: "BrowserControlHumanInputDetected",
      evidenceRefs: [],
    });
  });

  it("extracts screenshot evidence from nested provider tool result payloads", () => {
    const entry: WorkLogEntry = {
      ...BASE_WORK_ENTRY,
      output: JSON.stringify({
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                observation: {
                  sessionId: "browser-session-1",
                  url: "https://example.com/watch",
                  title: "Example Video",
                  screenshot: {
                    previewDataUrl: "data:image/jpeg;base64,nested-preview",
                    dataUrl: "data:image/jpeg;base64,nested-full",
                  },
                },
              }),
            },
          ],
        },
      }),
    };

    expect(browserScreenshotDataUrls(entry)).toEqual({
      thumbnailDataUrl: "data:image/jpeg;base64,nested-preview",
      fullDataUrl: "data:image/jpeg;base64,nested-full",
    });
  });

  it("returns the latest browser automation session across work entries", () => {
    const latest = latestEmbeddedBrowserSessionFromBrowserWorkEntries(
      [
        {
          ...BASE_WORK_ENTRY,
          id: "activity-browser-1",
          output: JSON.stringify({
            observation: {
              sessionId: "browser-session-1",
              url: "https://www.youtube.com/",
              title: "YouTube",
              readyState: "complete",
              textSummary: "Try searching to get started",
              targets: [],
              observedAt: "2026-04-27T00:00:00.000Z",
              screenshotDataUrl: "data:image/jpeg;base64,home",
            },
          }),
        },
        {
          ...BASE_WORK_ENTRY,
          id: "activity-browser-2",
          toolName: "orchestrate_browser_act",
          output: JSON.stringify({
            observation: {
              sessionId: "browser-session-1",
              url: "https://www.youtube.com/watch?v=abc123",
              title: "Video",
              readyState: "complete",
              textSummary: "Pause 0:01 / 2:45",
              targets: [],
              observedAt: "2026-04-27T00:01:00.000Z",
              screenshotDataUrl: "data:image/jpeg;base64,watch",
              screenshotArtifactRef: "browser-screenshot-artifact-1",
              evidenceRefs: ["browser-observation-record-1"],
              runtimeTruth: {
                runtimeKind: "playwright-headless",
                surfaceMode: "headless-validation-mirror",
                isUserVisibleSurface: false,
                browserSessionId: "browser-session-1",
                screenshotArtifactRef: "browser-screenshot-artifact-1",
                evidenceRefs: ["browser-screenshot-artifact-1"],
              },
            },
          }),
        },
      ],
      "orchestrator",
    );

    expect(latest?.entryId).toBe("activity-browser-2");
    expect(latest?.session).toMatchObject({
      kind: "automation",
      source: "orchestrator",
      sessionId: "browser-session-1",
      url: "https://www.youtube.com/watch?v=abc123",
      screenshotDataUrl: "data:image/jpeg;base64,watch",
      screenshotArtifactRef: "browser-screenshot-artifact-1",
      evidenceRefs: ["browser-screenshot-artifact-1", "browser-observation-record-1"],
    });
  });

  it("preserves nested browser tool output when deriving work log entries", () => {
    const entries = deriveWorkLogEntries(
      [
        {
          id: EventId.makeUnsafe("activity-browser-nested"),
          createdAt: "2026-04-27T00:02:00.000Z",
          kind: "tool.completed",
          summary: "Browser observation",
          tone: "tool",
          turnId: null,
          payload: {
            data: {
              item: {
                name: "orchestrate_browser_act",
                result: {
                  observation: {
                    sessionId: "browser-session-1",
                    url: "https://www.youtube.com/watch?v=abc123",
                    title: "Video",
                    readyState: "complete",
                    textSummary: "Pause 0:01 / 2:45",
                    targets: [],
                    observedAt: "2026-04-27T00:02:00.000Z",
                    screenshotDataUrl: "data:image/jpeg;base64,derived-full",
                    previewScreenshotDataUrl: "data:image/jpeg;base64,derived-preview",
                  },
                },
              },
            },
          },
        },
      ],
      undefined,
    );

    expect(browserScreenshotDataUrls(entries[0]!)).toEqual({
      thumbnailDataUrl: "data:image/jpeg;base64,derived-preview",
      fullDataUrl: "data:image/jpeg;base64,derived-full",
    });
  });

  it("extracts reviewer decision summaries without treating JSON as raw markup", () => {
    const entry: WorkLogEntry = {
      id: "activity-reviewer-1",
      createdAt: "2026-04-28T00:00:00.000Z",
      label: "Reviewer decision",
      tone: "tool",
      toolName: "reviewer.decision.create",
      output: JSON.stringify({
        decision: {
          outcome: "needs-human-review",
          purpose: "code-change",
          confidence: "medium",
          evidenceBundleId: "bundle-1",
          userVisibleSummaryRef: "summary-1",
          gates: [
            {
              name: "criteria-evaluated",
              status: "warn",
              message: "No task-specific criteria were supplied.",
            },
          ],
          criterionResults: [
            {
              criterionId: "criterion-user-acceptance-criteria",
              status: "not-evaluated",
              reason: "No task-specific acceptance criteria were supplied.",
            },
          ],
          findings: [
            {
              severity: "major",
              title: "Missing criteria",
              description: "<script>alert('x')</script>",
            },
          ],
          actionPacket: {
            kind: "needs-human-review",
            recommendedNextActions: ["Review evidence manually."],
            focusedRoutes: ["/"],
            relevantEvidenceRefs: ["summary-1"],
          },
        },
      }),
    };

    expect(reviewerDecisionWorkSummary(entry)).toEqual({
      outcome: "needs-human-review",
      purpose: "code-change",
      confidence: "medium",
      gates: [
        {
          name: "criteria-evaluated",
          status: "warn",
          message: "No task-specific criteria were supplied.",
        },
      ],
      criterionResults: [
        {
          criterionId: "criterion-user-acceptance-criteria",
          status: "not-evaluated",
          reason: "No task-specific acceptance criteria were supplied.",
        },
      ],
      findings: [
        {
          severity: "major",
          title: "Missing criteria",
          description: "<script>alert('x')</script>",
        },
      ],
      actionPacket: {
        kind: "needs-human-review",
        recommendedNextActions: ["Review evidence manually."],
        focusedRoutes: ["/"],
        relevantEvidenceRefs: ["summary-1"],
      },
      evidenceBundleId: "bundle-1",
      userVisibleSummaryRef: "summary-1",
    });
  });
});
