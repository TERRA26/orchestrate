/**
 * Turn staleness helpers (ORC-219).
 *
 * A worker LLM that stalls (provider hung, network timeout pre-stream)
 * keeps the orchestrator waiting forever, and the orchestrator's polling
 * loop reads `status: running` indefinitely with no signal that anything
 * is wrong. To break the deadlock we surface a staleness flag derived
 * from the worker's `updatedAt` timestamp on every `get_agent_status`
 * response. The orchestrator can act on the flag (terminate, reassign,
 * escalate) instead of polling forever.
 *
 * The full audit fix proposes also dispatching a `turn.fail` event from
 * a background reactor when staleness exceeds the threshold; that is a
 * larger lifecycle change and is tracked as a follow-up. This module
 * delivers the foundation: a pure policy that any caller (the polling
 * handler today, the reactor in a future iteration) can use.
 */

/** Default 10 minutes between worker activity before we mark it stale. */
export const DEFAULT_STALE_TURN_MS = 10 * 60 * 1000;

export interface TurnStalenessInput {
  readonly status: string;
  readonly updatedAt: string | undefined;
  readonly nowMs: number;
  readonly thresholdMs?: number;
}

export interface TurnStalenessResult {
  readonly stale: boolean;
  /** ms since the worker last produced any signal. undefined if updatedAt is missing/invalid. */
  readonly idleMs: number | undefined;
  readonly thresholdMs: number;
}

/**
 * Decide whether a worker's current turn is stale. A worker is considered
 * for staleness only when its status is `running` (or any other status
 * that indicates active work). Terminated, submitted, blocked, etc. are
 * not stale by definition.
 */
export function evaluateTurnStaleness(input: TurnStalenessInput): TurnStalenessResult {
  const thresholdMs = input.thresholdMs ?? DEFAULT_STALE_TURN_MS;
  if (input.status !== "running" && input.status !== "assigned") {
    return { stale: false, idleMs: undefined, thresholdMs };
  }
  if (!input.updatedAt) {
    return { stale: false, idleMs: undefined, thresholdMs };
  }
  const updatedAtMs = Date.parse(input.updatedAt);
  if (Number.isNaN(updatedAtMs)) {
    return { stale: false, idleMs: undefined, thresholdMs };
  }
  const idleMs = Math.max(0, input.nowMs - updatedAtMs);
  return { stale: idleMs >= thresholdMs, idleMs, thresholdMs };
}
