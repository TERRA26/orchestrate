import { describe, expect, it } from "vitest";

import {
  buildMcpBootDiagnostic,
  buildMcpConnectionFailureMessage,
  buildOrchestrationWsUrls,
  buildWorkerFollowUpTurnStartCommand,
  summarizeBrowserObservation,
} from "./orchestrate-mcp-server";

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

describe("buildMcpBootDiagnostic", () => {
  it("reports the loaded MCP connection shape without exposing the token", () => {
    expect(
      buildMcpBootDiagnostic({
        ORCHESTRATE_WS_PORT: "59685",
        ORCHESTRATE_AUTH_TOKEN: "secret-token",
        ORCHESTRATE_PARENT_THREAD_ID: "thread-1",
      }),
    ).toBe("orchestrate-mcp-server loaded; port=59685; auth=present; parentThread=present");
  });

  it("makes stale sessions without Orchestrate env obvious", () => {
    expect(buildMcpBootDiagnostic({})).toBe(
      "orchestrate-mcp-server loaded; port=fallback; auth=missing; parentThread=missing",
    );
  });
});

describe("buildMcpConnectionFailureMessage", () => {
  it("adds redacted connection diagnostics to websocket failures", () => {
    expect(
      buildMcpConnectionFailureMessage(new Error("Cannot connect to orchestration server"), {
        ORCHESTRATE_WS_PORT: "59685",
        ORCHESTRATE_AUTH_TOKEN: "secret-token",
        ORCHESTRATE_PARENT_THREAD_ID: "thread-1",
      }),
    ).toBe(
      "Cannot connect to orchestration server; orchestrate-mcp-server loaded; port=59685; auth=present; parentThread=present",
    );
  });
});

describe("buildWorkerFollowUpTurnStartCommand", () => {
  it("includes runtime and interaction modes required by the WebSocket client schema", () => {
    const command = buildWorkerFollowUpTurnStartCommand({
      message: "Continue the LedgerPilot dashboard.",
      targetThread: {
        id: "thread-worker-1",
        runtimeMode: "approval-required",
        interactionMode: "plan",
      },
    });

    expect(command).toMatchObject({
      type: "thread.turn.start",
      threadId: "thread-worker-1",
      dispatchMode: "queue",
      assistantDeliveryMode: "buffered",
      runtimeMode: "approval-required",
      interactionMode: "plan",
      message: {
        role: "user",
        text: "Continue the LedgerPilot dashboard.",
        attachments: [],
      },
    });
  });

  it("falls back to safe modes for older snapshots without mode fields", () => {
    const command = buildWorkerFollowUpTurnStartCommand({
      message: "Continue.",
      targetThread: { id: "thread-worker-1" },
    });

    expect(command).toMatchObject({
      runtimeMode: "full-access",
      interactionMode: "default",
    });
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
