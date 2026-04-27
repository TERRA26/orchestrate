import { describe, expect, it } from "vitest";
import { EventId } from "@orchestrate/contracts";

import {
  browserScreenshotDataUrls,
  latestEmbeddedBrowserSessionFromBrowserWorkEntries,
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
});
