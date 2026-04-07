import { beforeEach, describe, expect, it } from "vitest";
import { ThreadId } from "@t3tools/contracts";

import {
  createEmbeddedBrowserAutomationSession,
  getEmbeddedBrowserAddress,
  resolveEmbeddedBrowserSession,
  useEmbeddedBrowserStateStore,
} from "./embeddedBrowserStateStore";

describe("embeddedBrowserStateStore helpers", () => {
  beforeEach(() => {
    useEmbeddedBrowserStateStore.setState({
      globalSession: null,
      threadSessionsById: {},
      threadSessionVisibilityById: {},
    });
  });

  it("creates an automation preview session from a browser observation", () => {
    const session = createEmbeddedBrowserAutomationSession({
      source: "orchestrator",
      title: "Game Preview",
      lastActionSummary: "Clicked Start",
      observation: {
        sessionId: "session-1",
        url: "http://localhost:3333",
        title: "Minesweeper",
        readyState: "complete",
        textSummary: "Play the game",
        screenshotDataUrl: "data:image/jpeg;base64,abc",
        targets: [
          {
            id: "target-1",
            role: "button",
            tagName: "button",
            text: "Start",
            disabled: false,
            x: 10,
            y: 20,
            width: 100,
            height: 40,
          },
        ],
        observedAt: "2026-04-02T10:00:00.000Z",
      },
    });

    expect(session).toMatchObject({
      kind: "automation",
      source: "orchestrator",
      title: "Game Preview",
      url: "http://localhost:3333",
      readyState: "complete",
      targetCount: 1,
      lastActionSummary: "Clicked Start",
      screenshotDataUrl: "data:image/jpeg;base64,abc",
    });
    expect(getEmbeddedBrowserAddress(session)).toBe("http://localhost:3333");
  });

  it("prefers a thread-scoped automation preview over the global session", () => {
    const threadSession = createEmbeddedBrowserAutomationSession({
      source: "orchestrator",
      observation: {
        sessionId: "session-1",
        url: "http://localhost:3333",
        title: "Preview",
        readyState: "complete",
        textSummary: "",
        targets: [],
        observedAt: "2026-04-02T10:00:00.000Z",
      },
    });

    expect(
      resolveEmbeddedBrowserSession({
        globalSession: null,
        threadId: ThreadId.makeUnsafe("thread-1"),
        threadSessionsById: {
          [ThreadId.makeUnsafe("thread-1")]: threadSession,
        },
      }),
    ).toEqual({
      scope: "thread",
      session: threadSession,
    });
  });

  it("keeps thread preview visibility separate from session lifetime", () => {
    const threadId = ThreadId.makeUnsafe("thread-visibility");
    const session = createEmbeddedBrowserAutomationSession({
      source: "orchestrator",
      observation: {
        sessionId: "session-2",
        url: "http://localhost:3333",
        title: "Preview",
        readyState: "complete",
        textSummary: "",
        targets: [],
        observedAt: "2026-04-02T10:00:00.000Z",
      },
    });

    useEmbeddedBrowserStateStore.getState().openThreadSession(threadId, session);
    useEmbeddedBrowserStateStore.getState().setThreadSessionVisible(threadId, false);

    expect(useEmbeddedBrowserStateStore.getState().threadSessionVisibilityById[threadId]).toBe(
      false,
    );

    useEmbeddedBrowserStateStore.getState().openThreadSession(threadId, session);

    expect(useEmbeddedBrowserStateStore.getState().threadSessionVisibilityById[threadId]).toBe(
      true,
    );

    useEmbeddedBrowserStateStore.getState().closeThreadSession(threadId);

    expect(useEmbeddedBrowserStateStore.getState().threadSessionsById[threadId]).toBeUndefined();
    expect(
      useEmbeddedBrowserStateStore.getState().threadSessionVisibilityById[threadId],
    ).toBeUndefined();
  });
});
