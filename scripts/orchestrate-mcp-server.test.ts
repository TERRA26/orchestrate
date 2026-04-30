import { describe, expect, it } from "vitest";

import { buildOrchestrationWsUrls, summarizeBrowserObservation } from "./orchestrate-mcp-server";

describe("buildOrchestrationWsUrls", () => {
  it("uses the configured port without auth when no token is configured", () => {
    expect(buildOrchestrationWsUrls({ ORCHESTRATE_WS_PORT: "58995" })).toEqual([
      "ws://localhost:58995",
    ]);
  });

  it("adds the auth token to the configured websocket URL", () => {
    expect(
      buildOrchestrationWsUrls({
        ORCHESTRATE_WS_PORT: "58995",
        ORCHESTRATE_AUTH_TOKEN: "token with spaces",
      }),
    ).toEqual(["ws://localhost:58995/?token=token+with+spaces"]);
  });

  it("adds the auth token to fallback websocket URLs", () => {
    expect(buildOrchestrationWsUrls({ ORCHESTRATE_AUTH_TOKEN: "secret" })).toEqual([
      "ws://localhost:3773/?token=secret",
      "ws://localhost:3774/?token=secret",
    ]);
  });
});

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
