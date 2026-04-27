import { describe, expect, it } from "vitest";

import { browserScreenshotDataUrls } from "./browserWorkLog";
import type { WorkLogEntry } from "./session-logic";

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
});
