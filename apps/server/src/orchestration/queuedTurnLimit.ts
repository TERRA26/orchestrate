/**
 * Per-thread queued-turn depth limit (ORC-046).
 *
 * When `dispatchMode === "queue"` and a thread is mid-turn, the new
 * turn is appended to the reactor's per-thread queue. Without a depth
 * bound, a misbehaving worker hammering `send_to_agent` (which dispatches
 * thread.turn.start with queue mode) can push thousands of queued
 * turns onto a thread, leaking memory and blocking the reactor.
 *
 * This module is the policy bit: a pure decision function that the
 * reactor consults before pushing onto its in-memory queue.
 */

export const DEFAULT_MAX_QUEUED_TURNS_PER_THREAD = 100;

export type QueuedTurnLimitDecision =
  | { readonly admitted: true }
  | { readonly admitted: false; readonly reason: string };

export function decideQueuedTurnAdmission(input: {
  readonly currentDepth: number;
  readonly limit?: number;
}): QueuedTurnLimitDecision {
  const limit = input.limit ?? DEFAULT_MAX_QUEUED_TURNS_PER_THREAD;
  if (input.currentDepth < limit) {
    return { admitted: true };
  }
  return {
    admitted: false,
    reason:
      `Per-thread queued-turn limit reached (${input.currentDepth}/${limit}). ` +
      "The thread is mid-turn and the queue is full; reject this turn rather than " +
      "growing memory unbounded. The orchestrator should slow down send_to_agent calls or " +
      "wait for the active turn to complete before dispatching more.",
  };
}
