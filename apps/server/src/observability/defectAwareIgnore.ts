import { Cause, Effect } from "effect";

/**
 * ORC-222: defect-aware variant of `Effect.ignoreCause({ log: true })`.
 *
 * `Effect.ignoreCause` collapses every cause class (Fail, Die,
 * Interrupt) into the same warn-level log line. That hides a real
 * programmer bug (Die) inside a stream of expected transient failures
 * (Fail). This helper inspects the cause and escalates Die to error
 * level with the structured cause string + a tag for grep filtering,
 * while keeping non-defect failures at warn.
 *
 * Use this anywhere a "fire and forget" effect runs in a fork or
 * finalizer context where you want execution to continue even when
 * the inner effect crashes, but you also want defects to be loud.
 *
 * @see ORC-222
 */

export interface IgnoreCauseDefectAwareOptions {
  /** Short tag used to grep for the call site in logs. */
  readonly tag: string;
  /**
   * Optional metadata included on every log entry. Useful for
   * threadId / commandId / etc.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Wrap `effect` so any cause is logged-and-swallowed:
 *  - Die (programmer bugs / null derefs) -> log at ERROR level with
 *    full cause; record a `defect: true` annotation.
 *  - Fail (typed failures) -> log at WARN with the cause; mark
 *    `defect: false`.
 *  - Interrupt -> log at DEBUG (rarely useful at higher levels).
 *
 * The returned effect always succeeds with undefined; the original
 * channel error is fully consumed.
 */
export const ignoreCauseDefectAware =
  (options: IgnoreCauseDefectAwareOptions) =>
  <A, E>(effect: Effect.Effect<A, E, never>): Effect.Effect<void, never, never> => {
    const baseAnnotations = {
      tag: options.tag,
      ...(options.metadata ?? {}),
    };
    return effect.pipe(
      Effect.asVoid,
      Effect.catchCause((cause) => {
        // Effect 4.0-beta exposes Cause.hasDies / hasFails / hasInterrupts
        // and the per-reason guards (Cause.isDieReason, isFailReason).
        if (Cause.hasDies(cause)) {
          return Effect.logError("ignored cause (defect)").pipe(
            Effect.annotateLogs({
              ...baseAnnotations,
              defect: true,
              cause: Cause.pretty(cause),
            }),
          );
        }
        if (Cause.hasInterruptsOnly(cause)) {
          return Effect.logDebug("ignored cause (interrupt)").pipe(
            Effect.annotateLogs({ ...baseAnnotations, interrupt: true }),
          );
        }
        return Effect.logWarning("ignored cause (failure)").pipe(
          Effect.annotateLogs({
            ...baseAnnotations,
            defect: false,
            cause: Cause.pretty(cause),
          }),
        );
      }),
    );
  };
