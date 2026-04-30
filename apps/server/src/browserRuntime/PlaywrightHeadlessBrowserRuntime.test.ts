import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import type { BrowserAutomationShape } from "../browser/Services/BrowserAutomation.ts";
import { PlaywrightHeadlessBrowserRuntime } from "./PlaywrightHeadlessBrowserRuntime";
import { makePreviewTarget } from "./testFixtures";

const observedAt = "2026-04-27T00:00:00.000Z";

function makeAutomation(): BrowserAutomationShape & {
  readonly actions: unknown[];
  readonly openInputs: unknown[];
  readonly closeInputs: unknown[];
} {
  const actions: unknown[] = [];
  const openInputs: unknown[] = [];
  const closeInputs: unknown[] = [];
  const observation = {
    sessionId: "browser-session-1",
    url: "http://127.0.0.1:5173/",
    title: "Fixture",
    readyState: "complete",
    textSummary: "Fixture page\nSubmit",
    screenshotDataUrl: "data:image/jpeg;base64,abc",
    targets: [],
    consoleErrors: [{ level: "error" as const, text: "boom" }],
    networkErrors: [{ url: "http://127.0.0.1:5173/api", method: "GET", failure: "500" }],
    pageMetrics: {
      totalInteractiveElements: 1,
      totalImages: 0,
      totalLinks: 0,
      totalInputs: 0,
      headings: ["Fixture"],
      viewportWidth: 1440,
      viewportHeight: 900,
      scrollHeight: 900,
      scrollTop: 12,
    },
    ariaSnapshot: "- document: Fixture",
    observedAt,
  };

  return {
    actions,
    openInputs,
    closeInputs,
    openSession: (input) => {
      openInputs.push(input);
      return Effect.succeed({
        sessionId: "browser-session-1",
        observation,
      });
    },
    act: (input) => {
      actions.push(input.action);
      return Effect.succeed({
        observation,
      });
    },
    closeSession: (input) => {
      closeInputs.push(input);
      return Effect.void;
    },
  };
}

function makeAttachedAutomation(): BrowserAutomationShape & {
  readonly actions: unknown[];
  readonly openInputs: unknown[];
  readonly closeInputs: unknown[];
} {
  const actions: unknown[] = [];
  const openInputs: unknown[] = [];
  const closeInputs: unknown[] = [];
  const observation = {
    sessionId: "automation-session-1",
    url: "http://127.0.0.1:5173/",
    title: "Attached fixture",
    readyState: "complete",
    textSummary: "Attached fixture page",
    screenshotDataUrl: "data:image/jpeg;base64,attached",
    targets: [],
    pageMetrics: {
      totalInteractiveElements: 0,
      totalImages: 0,
      totalLinks: 0,
      totalInputs: 0,
      headings: ["Attached fixture"],
      viewportWidth: 1440,
      viewportHeight: 900,
      scrollHeight: 900,
      scrollTop: 0,
    },
    observedAt,
  };

  return {
    actions,
    openInputs,
    closeInputs,
    openSession: (input) => {
      openInputs.push(input);
      return Effect.succeed({
        sessionId: "automation-session-1",
        observation,
      });
    },
    act: (input) => {
      actions.push(input);
      return Effect.succeed({ observation });
    },
    closeSession: (input) => {
      closeInputs.push(input);
      return Effect.void;
    },
  };
}

describe("PlaywrightHeadlessBrowserRuntime", () => {
  it("opens a preview target and returns a structured snapshot with artifact refs", async () => {
    const runtime = new PlaywrightHeadlessBrowserRuntime(makeAutomation());

    const session = await runtime.openSession({ previewTarget: makePreviewTarget() });

    expect(session.browserSessionId).toBe("browser-session-1");
    expect(session.lastSnapshot?.runtimeKind).toBe("playwright-headless");
    expect(session.lastSnapshot?.artifactRefs.screenshot).toBeDefined();
    expect(session.lastSnapshot?.artifactRefs.domSnapshot).toBeDefined();
    expect(session.lastSnapshot?.artifactRefs.accessibilitySnapshot).toBeDefined();
    expect(session.lastSnapshot?.artifactRefs.consoleLog).toBeDefined();
    expect(session.lastSnapshot?.artifactRefs.networkLog).toBeDefined();
    expect(session.lastSnapshot?.summary.consoleErrorCount).toBe(1);
    expect(session.lastSnapshot?.summary.networkFailureCount).toBe(1);
  });

  it("observes by capturing a fresh snapshot without direct provider access", async () => {
    const automation = makeAutomation();
    const runtime = new PlaywrightHeadlessBrowserRuntime(automation);
    const session = await runtime.openSession({ previewTarget: makePreviewTarget() });

    const snapshot = await runtime.observe({ browserSessionId: session.browserSessionId });

    expect(snapshot.scroll.y).toBe(12);
    expect(automation.actions).toEqual([{ kind: "wait", ms: 0 }]);
  });

  it("blocks disallowed actions before they reach Playwright automation", async () => {
    const automation = makeAutomation();
    const runtime = new PlaywrightHeadlessBrowserRuntime(automation);
    const session = await runtime.openSession({ previewTarget: makePreviewTarget() });

    const result = await runtime.act({
      browserSessionId: session.browserSessionId,
      action: { kind: "navigate", url: "https://example.com" },
    });

    expect(result.ok).toBe(false);
    expect(automation.actions).toEqual([]);
  });

  it("attaches over CDP while exposing the visible Electron session id", async () => {
    const automation = makeAttachedAutomation();
    const runtime = new PlaywrightHeadlessBrowserRuntime(automation);

    const session = await runtime.openSession({
      previewTarget: makePreviewTarget(),
      cdpEndpointUrl: "http://127.0.0.1:9333",
      cdpTargetId: "target-visible-1",
      attachedBrowserSessionId: "electron-visible-thread-tab-main",
    });
    const observation = await runtime.observeObservation({
      browserSessionId: session.browserSessionId,
    });
    await runtime.closeSession({ browserSessionId: session.browserSessionId });

    expect(session.browserSessionId).toBe("electron-visible-thread-tab-main");
    expect(observation.sessionId).toBe("electron-visible-thread-tab-main");
    expect(automation.openInputs).toEqual([
      expect.objectContaining({
        cdpEndpointUrl: "http://127.0.0.1:9333",
        cdpTargetId: "target-visible-1",
      }),
    ]);
    expect(automation.actions).toEqual([
      { sessionId: "automation-session-1", action: { kind: "wait", ms: 0 } },
    ]);
    expect(automation.closeInputs).toEqual([{ sessionId: "automation-session-1" }]);
  });
});
