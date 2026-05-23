import { describe, expect, it } from "vitest";

import {
  captureMultiFrameAriaSnapshot,
  type FrameLikeForSnapshot,
  type PageLikeForSnapshot,
} from "./multiFrameAriaSnapshot";

/**
 * Pins the multi-frame ARIA snapshot helper introduced by ORC-286.
 *
 * Before this change, `page.locator("body").ariaSnapshot()` only
 * captured the main frame. Pages embedding third-party widgets
 * (Stripe, Auth0, embedded videos) were partially invisible to the
 * orchestrator. The helper fans out across `page.frames()` and
 * merges the per-frame snapshots with a header line that names the
 * frame's URL.
 *
 * @see ORC-286
 */

function makeFrame(url: string, snapshot: string | Error): FrameLikeForSnapshot {
  return {
    url: () => url,
    ariaSnapshot: () =>
      snapshot instanceof Error ? Promise.reject(snapshot) : Promise.resolve(snapshot),
  };
}

function makePage(main: FrameLikeForSnapshot, others: FrameLikeForSnapshot[]): PageLikeForSnapshot {
  return {
    url: () => main.url(),
    mainFrame: () => main,
    frames: () => [main, ...others],
  };
}

describe("captureMultiFrameAriaSnapshot (ORC-286)", () => {
  it("returns just the main frame snapshot when there are no iframes", async () => {
    const main = makeFrame("https://example.com/", "- main content");
    const page = makePage(main, []);
    const result = await captureMultiFrameAriaSnapshot(page);
    expect(result).toContain("- main content");
    expect(result).not.toContain("frame[1]");
  });

  it("merges main and child frames with a frame header", async () => {
    const main = makeFrame("https://example.com/", "- main content");
    const stripe = makeFrame("https://js.stripe.com/iframe", "- card-number-input");
    const auth0 = makeFrame("https://auth0.example.com/iframe", "- login-button");
    const page = makePage(main, [stripe, auth0]);
    const result = await captureMultiFrameAriaSnapshot(page);
    expect(result).toBeDefined();
    expect(result).toContain("- main content");
    expect(result).toContain("### frame[1]: https://js.stripe.com/iframe");
    expect(result).toContain("- card-number-input");
    expect(result).toContain("### frame[2]: https://auth0.example.com/iframe");
    expect(result).toContain("- login-button");
  });

  it("skips a frame whose ariaSnapshot rejects, preserving others", async () => {
    const main = makeFrame("https://example.com/", "- main content");
    const broken = makeFrame("https://broken.example.com/", new Error("cross-origin"));
    const ok = makeFrame("https://embed.example.com/", "- embed content");
    const page = makePage(main, [broken, ok]);
    const result = await captureMultiFrameAriaSnapshot(page);
    expect(result).toBeDefined();
    expect(result).toContain("- main content");
    expect(result).not.toContain("https://broken.example.com");
    expect(result).toContain("- embed content");
  });

  it("returns undefined when every frame rejects", async () => {
    const main = makeFrame("https://example.com/", new Error("nav-aborted"));
    const child = makeFrame("https://child.example.com/", new Error("cross-origin"));
    const page = makePage(main, [child]);
    const result = await captureMultiFrameAriaSnapshot(page);
    expect(result).toBeUndefined();
  });

  it("clips the merged snapshot to maxBytes (oversize iframe protection)", async () => {
    const main = makeFrame("https://example.com/", "x".repeat(50_000));
    const child = makeFrame("https://child.example.com/", "y".repeat(50_000));
    const page = makePage(main, [child]);
    const result = await captureMultiFrameAriaSnapshot(page, { maxBytes: 4_000 });
    expect(result).toBeDefined();
    expect(result!.length).toBeLessThan(5_000);
    expect(result).toContain("(truncated)");
  });

  it("truncates an oversize frame URL in the header (megabyte-srcdoc protection)", async () => {
    const main = makeFrame("https://example.com/", "- main");
    const huge = makeFrame(`https://example.com/${"a".repeat(2_000)}`, "- huge");
    const page = makePage(main, [huge]);
    const result = await captureMultiFrameAriaSnapshot(page);
    expect(result).toBeDefined();
    // Header URL is clipped to 256 chars + "..."
    expect(result).toContain("...");
    // The full original URL is NOT present.
    expect(result).not.toContain(`a`.repeat(1_000));
  });

  it("respects per-frame timeout in the option", async () => {
    let timeoutSeen: number | undefined;
    const main: FrameLikeForSnapshot = {
      url: () => "https://example.com/",
      ariaSnapshot: (options) => {
        timeoutSeen = options?.timeout;
        return Promise.resolve("- main");
      },
    };
    const page = makePage(main, []);
    await captureMultiFrameAriaSnapshot(page, { perFrameTimeoutMs: 1234 });
    expect(timeoutSeen).toBe(1234);
  });

  it("falls back to mainFrame when frames() returns empty", async () => {
    const main = makeFrame("https://example.com/", "- main");
    const page: PageLikeForSnapshot = {
      url: () => main.url(),
      mainFrame: () => main,
      frames: () => [],
    };
    const result = await captureMultiFrameAriaSnapshot(page);
    expect(result).toContain("- main");
  });
});
