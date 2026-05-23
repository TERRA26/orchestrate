import { Effect } from "effect";
import type { Browser, BrowserContext, Page } from "playwright";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BrowserAutomation } from "../Services/BrowserAutomation.ts";
import { BrowserAutomationLive } from "./BrowserAutomation.ts";

const mocks = vi.hoisted(() => {
  const browserClose = vi.fn(() => Promise.resolve());
  const contextClose = vi.fn(() => Promise.resolve());
  const cdpDetach = vi.fn(() => Promise.resolve());
  const cdpSend = vi.fn(() =>
    Promise.resolve({ targetInfo: { targetId: "target-visible-browser-automation" } }),
  );

  const page = {
    context: () => context,
    evaluate: (fn: unknown) => {
      if (typeof fn === "function") {
        return Promise.resolve({
          readyState: "complete",
          title: "Attached fixture",
          textSummary: "Attached fixture page",
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
        });
      }
      return Promise.reject(new Error("Downscale rendering is not part of this test."));
    },
    screenshot: () => Promise.resolve(Buffer.from("screenshot")),
    locator: () => ({
      ariaSnapshot: () => Promise.resolve("- document: Attached fixture"),
    }),
    url: () => "http://127.0.0.1:5173/",
    waitForLoadState: () => Promise.resolve(),
    waitForTimeout: () => Promise.resolve(),
    on: vi.fn(),
    // ORC-286: page.mainFrame() and page.frames() are now consulted
    // by captureMultiFrameAriaSnapshot. Provide a single fixture
    // frame whose locator returns the same ariaSnapshot stub.
    mainFrame: () => mainFrameMock,
    frames: () => [mainFrameMock],
  } as unknown as Page;

  const mainFrameMock = {
    url: () => "http://127.0.0.1:5173/",
    locator: () => ({
      ariaSnapshot: () => Promise.resolve("- document: Attached fixture"),
    }),
  };

  const context = {
    close: contextClose,
    pages: () => [page],
    newCDPSession: () =>
      Promise.resolve({
        send: cdpSend,
        detach: cdpDetach,
      }),
  } as unknown as BrowserContext;

  const browser = {
    close: browserClose,
    contexts: () => [context],
  } as unknown as Browser;

  return {
    browser,
    browserClose,
    contextClose,
    cdpDetach,
    cdpSend,
  };
});

vi.mock("playwright", () => ({
  chromium: {
    connectOverCDP: () => Promise.resolve(mocks.browser),
    launch: () => Promise.reject(new Error("launch should not be used for CDP attach tests")),
  },
}));

describe("BrowserAutomationLive", () => {
  beforeEach(() => {
    mocks.browserClose.mockClear();
    mocks.contextClose.mockClear();
    mocks.cdpDetach.mockClear();
    mocks.cdpSend.mockClear();
  });

  it("does not close the Electron-owned browser or context for attached CDP sessions", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const automation = yield* BrowserAutomation;
        const opened = yield* automation.openSession({
          url: "http://127.0.0.1:5173/",
          cdpEndpointUrl: "http://127.0.0.1:9333",
          cdpTargetId: "target-visible-browser-automation",
        });

        yield* automation.closeSession({ sessionId: opened.sessionId });
      }).pipe(Effect.provide(BrowserAutomationLive)),
    );

    expect(mocks.cdpSend).toHaveBeenCalledWith("Target.getTargetInfo");
    expect(mocks.cdpDetach).toHaveBeenCalledTimes(1);
    expect(mocks.contextClose).not.toHaveBeenCalled();
    expect(mocks.browserClose).not.toHaveBeenCalled();
  });
});
