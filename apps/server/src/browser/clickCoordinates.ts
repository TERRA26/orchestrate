/**
 * Coordinate-space helpers for browser clicks introduced by ORC-153.
 *
 * The observation snapshot stores `(x, y)` in CSS pixels relative to
 * the viewport at the time of capture. By the time a click action
 * lands at the browser, the page may have scrolled, transformed, or
 * navigated, making the stored coordinates stale.
 *
 * `liveCenterForSelector` re-evaluates the target's live
 * `getBoundingClientRect()` against the current viewport and returns
 * a fresh visible center, or `null` if the element is gone, hidden,
 * zero-sized, or scrolled out of view.
 *
 * Coordinate-space contract:
 *   - All `(x, y)` values exchanged with Playwright's `mouse.click`
 *     are in CSS pixels relative to the current viewport top-left.
 *   - Stored observation coordinates are page-state-at-capture and
 *     should be treated as a fallback target, not an authoritative
 *     location at action time.
 *
 * @see ORC-153
 */

export interface ViewportCenter {
  readonly x: number;
  readonly y: number;
}

export interface LiveCenterEvaluator {
  /**
   * Run the supplied JavaScript snippet in the page context and
   * return the result. Mirrors `page.evaluate` from Playwright but
   * keeps the helper testable without a real browser.
   */
  evaluate<T>(snippet: (selector: string) => T, selector: string): Promise<T>;
}

/**
 * Snippet evaluated in the page context to compute a visible center
 * for the supplied selector. Returns null if the element is missing,
 * has zero size, or is positioned outside the current viewport.
 */
export const LIVE_CENTER_SCRIPT = (selector: string) => {
  const element = document.querySelector(selector) as HTMLElement | null;
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  if (rect.right < 0 || rect.bottom < 0) return null;
  if (rect.left > viewportWidth || rect.top > viewportHeight) return null;
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
};

export async function liveCenterForSelector(
  evaluator: LiveCenterEvaluator,
  selector: string,
): Promise<ViewportCenter | null> {
  if (selector.length === 0) return null;
  try {
    const result = await evaluator.evaluate(LIVE_CENTER_SCRIPT, selector);
    if (
      result &&
      typeof result === "object" &&
      typeof (result as ViewportCenter).x === "number" &&
      typeof (result as ViewportCenter).y === "number" &&
      Number.isFinite((result as ViewportCenter).x) &&
      Number.isFinite((result as ViewportCenter).y)
    ) {
      return result as ViewportCenter;
    }
    return null;
  } catch {
    return null;
  }
}
