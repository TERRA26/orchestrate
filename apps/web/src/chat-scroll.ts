export const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 64;

interface ScrollPosition {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

/**
 * Exact pixel distance from the bottom of the scroll container. Returns 0
 * when at the bottom; positive values when scrolled up. Used by the
 * scroll-to-bottom button to decide visibility based on how far the user
 * has scrolled (a binary "near bottom" check is too coarse for that — we
 * want to show the button only when they've intentionally scrolled away,
 * not on a 50-pixel auto-scroll lag).
 */
export function getScrollContainerDistanceFromBottom(position: ScrollPosition): number {
  const { scrollTop, clientHeight, scrollHeight } = position;
  if (![scrollTop, clientHeight, scrollHeight].every(Number.isFinite)) {
    return 0;
  }
  return Math.max(0, scrollHeight - clientHeight - scrollTop);
}

export function isScrollContainerNearBottom(
  position: ScrollPosition,
  thresholdPx = AUTO_SCROLL_BOTTOM_THRESHOLD_PX,
): boolean {
  const threshold = Number.isFinite(thresholdPx)
    ? Math.max(0, thresholdPx)
    : AUTO_SCROLL_BOTTOM_THRESHOLD_PX;

  return getScrollContainerDistanceFromBottom(position) <= threshold;
}
