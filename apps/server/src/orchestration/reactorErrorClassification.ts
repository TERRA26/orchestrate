/**
 * Reactor error classification (ORC-018).
 *
 * `processInputSafely` previously caught every non-interrupt cause and
 * logged it as a warning. Validation failures, transient SQL contention,
 * and genuine programming defects all fell into the same bucket. The
 * reactor kept consuming inputs as if nothing went wrong, producing
 * orphaned state silently and giving operators no signal that anything
 * needed attention.
 *
 * This module classifies a Cause into one of three categories so the
 * reactor's catch handler can react proportionally:
 *
 * - "validation": the input was malformed, references unknown state, or
 *   violates an invariant. The reactor should log a warning, emit an
 *   observable event, and DROP the input. Retrying would just fail the
 *   same way.
 *
 * - "transient": SQL lock contention, fs EAGAIN, etc. The reactor
 *   should log info and retry once before giving up. Most of these are
 *   handled by Effect SQL's retry policy, so by the time we see one
 *   here it has already exhausted that.
 *
 * - "unexpected": a genuine programming defect or an error type we
 *   haven't classified. The reactor should log at error level and emit
 *   a high-priority observable event. It should NOT silently continue
 *   if the same error keeps recurring; that's a follow-up (escalate
 *   after N consecutive unexpected failures).
 */
import { Cause } from "effect";

export type ReactorErrorCategory = "validation" | "transient" | "unexpected";

const VALIDATION_TAGS: ReadonlySet<string> = new Set([
  "CheckpointInvariantError",
  "OrchestrationCommandInvariantError",
  "OrchestrationCommandPreviouslyRejectedError",
  "OrchestrationCommandDecodeError",
  "OrchestrationCommandJsonParseError",
  "OrchestrationProjectorDecodeError",
]);

const TRANSIENT_TAGS: ReadonlySet<string> = new Set([
  "CheckpointUnavailableError",
  "ProjectionRepositoryError",
]);

function extractTaggedError(cause: Cause.Cause<unknown>): { readonly _tag: string } | undefined {
  // Effect 4.0-beta exposes `cause.reasons` for iterating top-level
  // failures. We treat the cause as classifiable only when it contains
  // exactly one fail reason; composites (parallel, sequential) and
  // defects fall through to "unexpected" so the operator sees that
  // something demands attention rather than us picking one.
  const failReasons = cause.reasons.filter(Cause.isFailReason);
  if (failReasons.length !== 1) return undefined;
  const error = failReasons[0]!.error;
  if (error && typeof error === "object" && "_tag" in error && typeof error._tag === "string") {
    return error as { readonly _tag: string };
  }
  return undefined;
}

export function classifyReactorErrorTag(tag: string): ReactorErrorCategory {
  if (VALIDATION_TAGS.has(tag)) return "validation";
  if (TRANSIENT_TAGS.has(tag)) return "transient";
  return "unexpected";
}

export function classifyReactorCause(cause: Cause.Cause<unknown>): ReactorErrorCategory {
  if (Cause.hasInterruptsOnly(cause)) {
    // Interrupts are a normal lifecycle signal; the caller handles them
    // before reaching this classifier. If somehow one slips through,
    // treat it as not-an-error rather than escalating.
    return "validation";
  }
  const tagged = extractTaggedError(cause);
  if (!tagged) return "unexpected";
  return classifyReactorErrorTag(tagged._tag);
}
