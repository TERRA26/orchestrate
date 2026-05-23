import type { OrchestrationCommand, OrchestratorWorker } from "@orchestrate/contracts";
import { Effect } from "effect";

import { OrchestrationCommandInvariantError } from "./Errors.ts";

/**
 * Centralized worker state-transition graph.
 *
 * Worker statuses (per contracts): idle, running, paused, submitted, stuck, terminated.
 *
 * The decider previously enforced a subset of these transitions via
 * inline `expectedStatus` checks scattered across worker.* command
 * handlers, with worker.terminate accepting any source status (including
 * "terminated", which silently produced a duplicate terminated event).
 * This module owns the legal-transition graph in one place. Add a new
 * legal edge here, and every command that calls
 * `requireLegalWorkerTransition` enforces it consistently. [ORC-116]
 *
 * @see ORC-116
 * @module orchestration/workerTransitions
 */

export type WorkerStatus = OrchestratorWorker["status"];

/**
 * Legal worker state transitions. Map from source status to the set of
 * permitted destination statuses.
 *
 * Rules encoded:
 * - `idle` is the natural starting state; a freshly spawned worker
 *   immediately transitions to running OR stays idle awaiting work.
 * - `running` can pause, submit work, get stuck on external deps, or
 *   terminate.
 * - `paused` can resume to running or idle, or terminate.
 * - `submitted` can re-enter running on rework, or terminate.
 * - `stuck` can resume to running once unblocked, or terminate.
 * - `terminated` is terminal; no outgoing transitions are legal.
 *   Re-terminating a terminated worker is the most common bug class
 *   the inline expectedStatus checks missed.
 */
export const WORKER_LEGAL_TRANSITIONS: ReadonlyMap<WorkerStatus, ReadonlySet<WorkerStatus>> =
  new Map<WorkerStatus, ReadonlySet<WorkerStatus>>([
    ["idle", new Set<WorkerStatus>(["running", "paused", "stuck", "terminated"])],
    [
      "running",
      new Set<WorkerStatus>(["idle", "paused", "submitted", "stuck", "terminated"]),
    ],
    ["paused", new Set<WorkerStatus>(["idle", "running", "terminated"])],
    ["submitted", new Set<WorkerStatus>(["running", "idle", "terminated"])],
    ["stuck", new Set<WorkerStatus>(["running", "idle", "paused", "terminated"])],
    ["terminated", new Set<WorkerStatus>()],
  ]);

/**
 * Pure check: is the (from -> to) transition legal? An unknown source
 * status (e.g., schema drift) is treated as illegal so the caller fails
 * loud rather than silently accepting whatever the underlying status
 * happens to be.
 */
export function isLegalWorkerTransition(
  from: WorkerStatus,
  to: WorkerStatus,
): boolean {
  if (from === to) {
    // Self-transitions are not legal; if a command thinks it's
    // transitioning a worker to its current state, it should be a
    // no-op at the dispatch layer, not an event.
    return false;
  }
  const allowed = WORKER_LEGAL_TRANSITIONS.get(from);
  if (!allowed) return false;
  return allowed.has(to);
}

/**
 * Effect-flavored guard: fails with an OrchestrationCommandInvariantError
 * carrying a clear detail string when the transition is not legal. The
 * caller is expected to have already established the worker exists.
 */
export function requireLegalWorkerTransition(input: {
  readonly command: OrchestrationCommand;
  readonly workerId: string;
  readonly from: WorkerStatus;
  readonly to: WorkerStatus;
}): Effect.Effect<void, OrchestrationCommandInvariantError> {
  if (isLegalWorkerTransition(input.from, input.to)) {
    return Effect.void;
  }
  return Effect.fail(
    new OrchestrationCommandInvariantError({
      commandType: input.command.type,
      detail: `Illegal worker transition: '${input.workerId}' cannot move from '${input.from}' to '${input.to}' for command '${input.command.type}'.`,
    }),
  );
}
