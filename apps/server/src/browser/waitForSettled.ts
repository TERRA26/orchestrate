/**
 * Pure settle-coordination helper extracted from BrowserAutomation.
 *
 * The previous chain `domcontentloaded -> networkidle(1.5s) -> wait`
 * never reached networkidle on pages with persistent connections
 * (WebSocket, polling). The orchestrator's screenshot then captured
 * whatever state happened to be there, including mid-animation
 * frames. This helper introduces an optional `readyHint` selector
 * that, when provided, supersedes the network-idle wait, and falls
 * back to the original chain only if the selector times out.
 *
 * The helper is parameterized over a `SettleOps` interface so it can
 * be exercised in unit tests without a real Playwright Page.
 *
 * @see ORC-150
 */

export interface SettleOps {
  /** Wait for DOMContentLoaded (or its equivalent). */
  domLoaded(): Promise<void>;
  /**
   * Wait for the supplied selector to be present in the DOM. Reject
   * (or throw) on timeout so the helper can fall back to networkIdle.
   */
  selectorReady(selector: string): Promise<void>;
  /** Wait for network to go idle for the implementation-defined window. */
  networkIdle(): Promise<void>;
  /** Wait for the supplied number of milliseconds. */
  delay(ms: number): Promise<void>;
}

export interface SettleOptions {
  /**
   * Per-task selector that, when provided, supersedes the networkIdle
   * fallback. The helper waits for this selector and then runs the
   * post-action delay; networkIdle is only consulted if the selector
   * wait times out.
   */
  readonly readyHint?: string;
  /** Post-action delay in ms. Defaults to 350ms to match prior behavior. */
  readonly postActionDelayMs?: number;
}

/**
 * Run the settle chain.
 *
 * Without a readyHint:
 *   domLoaded -> networkIdle -> delay
 *
 * With a readyHint that resolves:
 *   domLoaded -> selectorReady -> delay (networkIdle skipped)
 *
 * With a readyHint that rejects (timeout):
 *   domLoaded -> selectorReady (failed) -> networkIdle -> delay
 *
 * All individual op rejections are swallowed; the helper always
 * resolves to `undefined`, matching the original BrowserAutomation
 * behavior of "best-effort settle, take the screenshot regardless."
 */
export async function settle(
  ops: SettleOps,
  options: SettleOptions = {},
): Promise<void> {
  await ops.domLoaded().catch(() => undefined);

  let usedHint = false;
  if (typeof options.readyHint === "string" && options.readyHint.length > 0) {
    try {
      await ops.selectorReady(options.readyHint);
      usedHint = true;
    } catch {
      usedHint = false;
    }
  }

  if (!usedHint) {
    await ops.networkIdle().catch(() => undefined);
  }

  const delayMs = options.postActionDelayMs ?? 350;
  await ops.delay(delayMs).catch(() => undefined);
}
