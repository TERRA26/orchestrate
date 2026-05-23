/**
 * ARIA snapshots that include child iframes.
 *
 * Playwright's `page.locator("body").ariaSnapshot()` operates on the
 * frame the locator was created against. By default that is the main
 * frame, so any sub-document loaded into an iframe (Stripe, Auth0,
 * embedded videos, sandboxed previews) is invisible to the
 * orchestrator. ORC-286 closes that gap by iterating
 * `page.frames()` and merging the per-frame snapshots with a header
 * line that names the frame's URL so downstream review can tell
 * which sub-tree a section came from.
 *
 * Pure helper: takes an abstract Page-like + its frames so the
 * contract can be exercised with mocks (no real browser session).
 *
 * @see ORC-286
 */

export interface FrameLikeForSnapshot {
  url(): string;
  ariaSnapshot(options?: { timeout?: number }): Promise<string>;
}

export interface PageLikeForSnapshot {
  url(): string;
  mainFrame(): FrameLikeForSnapshot;
  frames(): ReadonlyArray<FrameLikeForSnapshot>;
}

export interface MultiFrameAriaSnapshotOptions {
  readonly perFrameTimeoutMs?: number;
  readonly maxBytes?: number;
}

const DEFAULT_PER_FRAME_TIMEOUT_MS = 5_000;

function frameHeader(url: string, index: number): string {
  // Keep deterministic for tests; truncate the URL so a megabyte
  // about:srcdoc payload does not poison the merged snapshot.
  const safeUrl = url.length > 256 ? `${url.slice(0, 256)}...` : url;
  return `\n### frame[${index}]: ${safeUrl}\n`;
}

function clip(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;
  // Fall back to character-based clip; we accept slight overshoot
  // because byte-accurate clipping in the middle of a multi-byte
  // sequence would corrupt the trailing character.
  return `${text.slice(0, maxBytes)}\n... (truncated)`;
}

export async function captureMultiFrameAriaSnapshot(
  page: PageLikeForSnapshot,
  options: MultiFrameAriaSnapshotOptions = {},
): Promise<string | undefined> {
  const perFrameTimeoutMs = options.perFrameTimeoutMs ?? DEFAULT_PER_FRAME_TIMEOUT_MS;
  const maxBytes = options.maxBytes;

  const frames = page.frames();
  if (frames.length === 0) {
    // Some Page implementations do not expose `frames()` until the
    // first navigation completes; fall back to the main frame.
    try {
      const main = await page.mainFrame().ariaSnapshot({ timeout: perFrameTimeoutMs });
      return maxBytes !== undefined ? clip(main, maxBytes) : main;
    } catch {
      return undefined;
    }
  }

  const mainFrame = page.mainFrame();
  const sections: string[] = [];
  let mainSnapshot: string | undefined;

  // Capture the main frame snapshot first so the consumer reads a
  // human-shaped document with iframe sub-trees appearing AFTER the
  // primary content.
  try {
    mainSnapshot = await mainFrame.ariaSnapshot({ timeout: perFrameTimeoutMs });
  } catch {
    mainSnapshot = undefined;
  }

  if (mainSnapshot !== undefined) {
    sections.push(mainSnapshot);
  }

  let frameIndex = 0;
  for (const frame of frames) {
    if (frame === mainFrame) continue;
    frameIndex += 1;
    try {
      const snapshot = await frame.ariaSnapshot({ timeout: perFrameTimeoutMs });
      sections.push(`${frameHeader(frame.url(), frameIndex)}${snapshot}`);
    } catch {
      // Skip frames that throw (cross-origin without permissions,
      // detached after the iteration started, etc.). One broken
      // iframe must not wipe the whole snapshot.
      continue;
    }
  }

  if (sections.length === 0) return undefined;

  const merged = sections.join("\n");
  return maxBytes !== undefined ? clip(merged, maxBytes) : merged;
}
