import { describe, expect, it } from "vitest";

import {
  browserActionStatusLabel,
  browserObservationTitle,
  browserRuntimeEvidenceLabel,
  browserSurfaceModeLabel,
} from "./orchestratorPresentation";

describe("orchestratorPresentation", () => {
  it("maps browser runtime modes to user-facing evidence labels", () => {
    expect(browserSurfaceModeLabel("live-shared-browser")).toBe("Live shared browser");
    expect(browserSurfaceModeLabel("headless-validation-mirror")).toBe(
      "Headless validation mirror",
    );
    expect(browserSurfaceModeLabel("static-screenshot-evidence")).toBe(
      "Static screenshot evidence",
    );
    expect(
      browserRuntimeEvidenceLabel({
        surfaceMode: "live-shared-browser",
        isDurable: true,
      }),
    ).toBe("Live shared browser · evidence captured");
  });

  it("maps raw browser work into semantic progress phrases", () => {
    expect(browserObservationTitle({ isChecking: true })).toBe("Checking browser");
    expect(
      browserActionStatusLabel({
        label: "browser.observe",
        detail: "screenshotArtifactRef present",
        hasScreenshot: true,
      }),
    ).toBe("Screenshot captured");
  });
});
