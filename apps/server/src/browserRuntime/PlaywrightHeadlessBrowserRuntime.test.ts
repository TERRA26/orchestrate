import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import type { BrowserAutomationShape } from "../browser/Services/BrowserAutomation.ts";
import { PlaywrightHeadlessBrowserRuntime } from "./PlaywrightHeadlessBrowserRuntime";
import { makePreviewTarget } from "./testFixtures";

const observedAt = "2026-04-27T00:00:00.000Z";

function makeAutomation(): BrowserAutomationShape & { readonly actions: unknown[] } {
  const actions: unknown[] = [];
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
    openSession: () =>
      Effect.succeed({
        sessionId: "browser-session-1",
        observation,
      }),
    act: (input) => {
      actions.push(input.action);
      return Effect.succeed({ observation });
    },
    closeSession: () => Effect.void,
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
});
