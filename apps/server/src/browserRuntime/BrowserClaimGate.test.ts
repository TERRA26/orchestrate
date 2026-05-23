import { describe, expect, it } from "vitest";
import type { BrowserObservation, BrowserRuntimeTruth } from "@orchestrate/contracts";

import { browserClaimGateForObservation } from "./BrowserClaimGate";

const runtimeTruth: BrowserRuntimeTruth = {
  runtimeKind: "playwright-headless",
  surfaceMode: "headless-validation-mirror",
  isUserVisibleSurface: false,
  browserSessionId: "browser-session-1",
  screenshotArtifactRef: "screenshot-proof-1",
  observedUrl: "https://www.youtube.com/watch?v=test",
  urlAgreement: "unknown",
};

function makeObservation(overrides: Partial<BrowserObservation> = {}): BrowserObservation {
  return {
    sessionId: "browser-session-1",
    url: "https://www.youtube.com/watch?v=test",
    title: "YouTube",
    readyState: "complete",
    textSummary: "Video",
    screenshotDataUrl: "data:image/jpeg;base64,abc",
    targets: [],
    observedAt: "2026-04-28T00:00:00.000Z",
    runtimeTruth,
    ...overrides,
  };
}

describe("browserClaimGateForObservation", () => {
  it("blocks playback claims on YouTube watch pages without deterministic playback evidence", () => {
    const reports = browserClaimGateForObservation({
      observation: makeObservation(),
      runtimeTruth,
    });

    expect(reports).toContainEqual(
      expect.objectContaining({
        claimKind: "playing",
        decision: expect.objectContaining({ outcome: "block" }),
      }),
    );
  });

  it("allows playback claims when the same-runtime evaluation proves an unpaused video", () => {
    const reports = browserClaimGateForObservation({
      observation: makeObservation({
        evaluateResult: JSON.stringify({
          found: true,
          paused: false,
          currentTime: 8.35,
          readyState: 4,
        }),
      }),
      runtimeTruth,
    });

    expect(reports).toContainEqual(
      expect.objectContaining({
        claimKind: "playing",
        decision: expect.objectContaining({ outcome: "allow" }),
      }),
    );
  });
});
