import { describe, expect, it } from "vitest";

import {
  browserActionStatusLabel,
  browserObservationTitle,
  browserRuntimeEvidenceLabel,
  browserRuntimeKindLabel,
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
    expect(browserSurfaceModeLabel("unknown")).toBe("Browser runtime unknown");
    expect(
      browserRuntimeEvidenceLabel({
        surfaceMode: "unknown",
        isDurable: true,
      }),
    ).toBe("Browser runtime unknown · evidence incomplete");
  });

  it("maps browser runtime kinds to user-facing labels", () => {
    expect(browserRuntimeKindLabel("electron-visible")).toBe("Electron desktop");
    expect(browserRuntimeKindLabel("playwright-headless")).toBe("Playwright headless");
    expect(browserRuntimeKindLabel("chrome-extension")).toBe("Chrome extension");
    expect(browserRuntimeKindLabel("unknown")).toBe("Runtime unknown");
    expect(browserRuntimeKindLabel("legacy-runtime")).toBe("legacy-runtime");
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
