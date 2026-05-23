/**
 * Browser session reaper policy. Pure function that decides which sessions
 * to evict based on idle time and surfaces an "active count too high"
 * warning signal. Kept separate from the layer so it is exhaustively
 * testable without spinning up Playwright.
 *
 * @see ORC-048
 * @module browser/Layers/sessionReaper
 */

/** Default idle window before a session is reaped (30 minutes). */
export const DEFAULT_SESSION_IDLE_TTL_MS = 30 * 60 * 1000;

/** Default sweep cadence (5 minutes). */
export const DEFAULT_SESSION_REAPER_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Default soft threshold above which we emit a warning. Browser contexts
 * are expensive (~50MB each), so an operator should investigate well
 * before the host runs out of memory.
 */
export const DEFAULT_SESSION_WARN_THRESHOLD = 100;

export interface ReapableEntry {
  readonly id: string;
  readonly lastActivityAt: number;
}

export interface ReapDecision {
  /** Session IDs that have exceeded the idle TTL and should be evicted. */
  readonly toEvict: ReadonlyArray<string>;
  /** True when the count of still-active sessions exceeds the warn threshold. */
  readonly warnExceeded: boolean;
  /** Sessions that survive this sweep (input minus toEvict). */
  readonly activeCount: number;
  /** Idle TTL applied to this decision (for log/test instrumentation). */
  readonly idleTtlMs: number;
  /** Threshold applied to this decision (for log/test instrumentation). */
  readonly warnThreshold: number;
}

/**
 * Evaluate whether each session should be reaped. A session is reaped when
 * `now - lastActivityAt > idleTtlMs` (strict greater-than so the boundary
 * case stays alive for tests). The decision also reports whether the
 * surviving count crossed the warn threshold so callers can emit a single
 * warning per sweep instead of N per session.
 */
export const evaluateIdleSessions = (input: {
  readonly entries: ReadonlyArray<ReapableEntry>;
  readonly now: number;
  readonly idleTtlMs?: number;
  readonly warnThreshold?: number;
}): ReapDecision => {
  const idleTtlMs = input.idleTtlMs ?? DEFAULT_SESSION_IDLE_TTL_MS;
  const warnThreshold = input.warnThreshold ?? DEFAULT_SESSION_WARN_THRESHOLD;

  const toEvict: string[] = [];
  for (const entry of input.entries) {
    if (input.now - entry.lastActivityAt > idleTtlMs) {
      toEvict.push(entry.id);
    }
  }

  const activeCount = input.entries.length - toEvict.length;
  return {
    toEvict,
    warnExceeded: activeCount > warnThreshold,
    activeCount,
    idleTtlMs,
    warnThreshold,
  };
};
