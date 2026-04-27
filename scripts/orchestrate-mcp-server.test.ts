import { describe, expect, it } from "vitest";

import { summarizeBrowserObservation } from "./orchestrate-mcp-server";

describe("summarizeBrowserObservation", () => {
  it("includes compact screenshot proof by default without full screenshot payloads", () => {
    const summary = summarizeBrowserObservation(
      {
        sessionId: "browser-session-1",
        url: "https://example.com/",
        title: "Example Domain",
        readyState: "complete",
        screenshotDataUrl: "data:image/jpeg;base64,full",
        previewScreenshotDataUrl: "data:image/jpeg;base64,preview",
        fullPageScreenshotDataUrl: "data:image/jpeg;base64,full-page",
        observedAt: "2026-04-27T00:00:00.000Z",
      },
      false,
    );

    expect(summary).toMatchObject({
      sessionId: "browser-session-1",
      url: "https://example.com/",
      screenshot: {
        present: true,
        previewDataUrl: "data:image/jpeg;base64,preview",
      },
      fullPageScreenshot: {
        present: true,
      },
    });
    expect(summary).not.toHaveProperty("screenshotDataUrl");
    expect(summary).not.toHaveProperty("fullPageScreenshotDataUrl");
    expect(summary.screenshot).not.toHaveProperty("dataUrl");
    expect(summary.fullPageScreenshot).not.toHaveProperty("dataUrl");
  });

  it("keeps full screenshot payloads out of tool text even when requested", () => {
    const summary = summarizeBrowserObservation(
      {
        sessionId: "browser-session-1",
        url: "https://example.com/",
        screenshotDataUrl: "data:image/jpeg;base64,full",
        previewScreenshotDataUrl: "data:image/jpeg;base64,preview",
        fullPageScreenshotDataUrl: "data:image/jpeg;base64,full-page",
      },
      true,
    );

    expect(summary).toMatchObject({
      screenshot: {
        previewDataUrl: "data:image/jpeg;base64,preview",
      },
    });
    expect(summary).not.toHaveProperty("screenshotDataUrl");
    expect(summary).not.toHaveProperty("fullPageScreenshotDataUrl");
    expect(summary.screenshot).not.toHaveProperty("dataUrl");
    expect(summary.fullPageScreenshot).not.toHaveProperty("dataUrl");
  });
});
