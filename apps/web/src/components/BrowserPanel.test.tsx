import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  HumanControlLeaseId,
  type BrowserApprovalRequest,
  type HumanControlLease,
} from "@orchestrate/contracts";

import {
  BrowserPanelApprovalList,
  browserPanelApprovalResponseRequest,
  browserPanelControlRequest,
  browserPanelHumanInputRequest,
  browserPanelControlStatusLabel,
  shouldRefreshBrowserPanelForEvent,
} from "./BrowserPanel";

function approval(status: BrowserApprovalRequest["status"]): BrowserApprovalRequest {
  return {
    id: `browser-approval-${status}`,
    browserSessionId: "electron-visible-session",
    action: { kind: "navigate", url: "https://example.com" },
    actionHash: "abcdef123456",
    reason: "External navigation requires approval.",
    risk: "external-navigation",
    status,
    evidenceRefs: ["browser-screenshot-1"],
    createdAt: "2026-04-29T00:00:00.000Z",
    updatedAt: "2026-04-29T00:00:00.000Z",
  };
}

function fixedNow() {
  return "2026-04-29T00:02:00.000Z";
}

describe("BrowserPanel safety controls", () => {
  it("renders pending approvals with approve and reject controls", () => {
    const html = renderToStaticMarkup(
      <BrowserPanelApprovalList
        approvals={[approval("pending")]}
        approvalBusyId={null}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("Approval required");
    expect(html).toContain("Approve");
    expect(html).toContain("Reject");
    expect(html).toContain("Action navigate");
  });

  it("renders consumed approvals as executed without decision controls", () => {
    const html = renderToStaticMarkup(
      <BrowserPanelApprovalList
        approvals={[approval("consumed")]}
        approvalBusyId={null}
        onRespond={vi.fn()}
      />,
    );

    expect(html).toContain("Approved action executed");
    expect(html).not.toContain(">Approve<");
    expect(html).not.toContain(">Reject<");
  });

  it("labels human-control and fresh-observation control states", () => {
    const humanLease = {
      id: HumanControlLeaseId.makeUnsafe("human-control-lease-1"),
      browserSessionId: "electron-visible-session",
      holder: "human",
      state: "human-control",
      mode: "exclusive",
      reason: "human-input",
      acquiredAt: "2026-04-29T00:00:00.000Z",
      requiredSnapshotAfterRelease: true,
    } satisfies HumanControlLease;
    const freshObservationLease = {
      ...humanLease,
      holder: "none",
      releasedAt: "2026-04-29T00:01:00.000Z",
    } satisfies HumanControlLease;

    expect(
      browserPanelControlStatusLabel({
        usesNativeBrowserSurface: true,
        activeBrowserSessionId: "electron-visible-session",
        controlSessionIdIsServerKnown: true,
        controlLease: humanLease,
      }),
    ).toBe("Human control active");
    expect(
      browserPanelControlStatusLabel({
        usesNativeBrowserSurface: true,
        activeBrowserSessionId: "electron-visible-session",
        controlSessionIdIsServerKnown: true,
        controlLease: freshObservationLease,
      }),
    ).toBe("Fresh observation required");
  });

  it("matches approval and control events for the active browser session", () => {
    expect(
      shouldRefreshBrowserPanelForEvent(
        {
          type: "BrowserApprovalApproved",
          payloadJson: JSON.stringify({ browserSessionId: "electron-visible-session" }),
        },
        "electron-visible-session",
      ),
    ).toBe("approval");
    expect(
      shouldRefreshBrowserPanelForEvent(
        {
          type: "BrowserControlFreshObservationSatisfied",
          payload: { lease: { browserSessionId: "electron-visible-session" } },
        },
        "electron-visible-session",
      ),
    ).toBe("control");
    expect(
      shouldRefreshBrowserPanelForEvent(
        {
          type: "BrowserControlHumanInputDetected",
          payload: { lease: { browserSessionId: "other-session" } },
        },
        "electron-visible-session",
      ),
    ).toBeNull();
  });

  it("builds pointer and manual human-input fallback requests for the active session", () => {
    expect(
      browserPanelHumanInputRequest({
        browserSessionId: "electron-visible-session",
        kind: "mouse",
        url: "http://127.0.0.1:5173/",
        now: fixedNow,
      }),
    ).toEqual({
      browserSessionId: "electron-visible-session",
      kind: "mouse",
      url: "http://127.0.0.1:5173/",
      occurredAt: "2026-04-29T00:02:00.000Z",
    });
    expect(
      browserPanelHumanInputRequest({
        browserSessionId: "electron-visible-session",
        kind: "manual",
        url: "http://127.0.0.1:5173/",
        now: fixedNow,
      }),
    ).toMatchObject({
      browserSessionId: "electron-visible-session",
      kind: "manual",
    });
    expect(
      browserPanelHumanInputRequest({
        browserSessionId: null,
        kind: "manual",
        url: "http://127.0.0.1:5173/",
        now: fixedNow,
      }),
    ).toBeNull();
  });

  it("builds approval and control action requests with active browser session ids", () => {
    expect(browserPanelApprovalResponseRequest("browser-approval-1", "approved")).toEqual({
      approvalId: "browser-approval-1",
      decision: "approved",
    });
    expect(browserPanelApprovalResponseRequest("browser-approval-1", "rejected")).toEqual({
      approvalId: "browser-approval-1",
      decision: "rejected",
    });

    expect(
      browserPanelControlRequest({
        browserSessionId: "electron-visible-session",
        action: "pauseAgent",
      }),
    ).toEqual({
      action: "pauseAgent",
      input: {
        browserSessionId: "electron-visible-session",
        reason: "manual-pause",
      },
    });
    expect(
      browserPanelControlRequest({
        browserSessionId: "electron-visible-session",
        action: "resumeAgent",
      }),
    ).toEqual({
      action: "resumeAgent",
      input: {
        browserSessionId: "electron-visible-session",
      },
    });
    expect(
      browserPanelControlRequest({
        browserSessionId: "electron-visible-session",
        action: "observeFresh",
      }),
    ).toEqual({
      action: "observeFresh",
      input: {
        browserSessionId: "electron-visible-session",
      },
    });
    expect(
      browserPanelControlRequest({
        browserSessionId: "electron-visible-session",
        action: "release",
        leaseId: HumanControlLeaseId.makeUnsafe("human-control-lease-1"),
        snapshotAfterReleaseRef: "browser-screenshot-after-human-control",
      }),
    ).toMatchObject({
      action: "release",
      input: {
        browserSessionId: "electron-visible-session",
        leaseId: HumanControlLeaseId.makeUnsafe("human-control-lease-1"),
        snapshotAfterReleaseRef: "browser-screenshot-after-human-control",
      },
    });
    expect(
      browserPanelControlRequest({
        browserSessionId: null,
        action: "observeFresh",
      }),
    ).toBeNull();
  });
});
