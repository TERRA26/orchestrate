/**
 * AuthorityPolicyLive - Layer implementation for AuthorityPolicyService.
 *
 * V1 defaults:
 * - Direct work allowed for tiny/small scope, instant/short duration,
 *   no overlapping write-scope ownership, and <= 2 files in write scope.
 * - Self-demotion triggered when elapsed > 30s, files modified > 3,
 *   or active workers are waiting on the root.
 *
 * @module AuthorityPolicyLive
 */
import { Effect, Layer } from "effect";

import { AuthorityPolicyService, type AuthorityPolicyShape } from "../Services/AuthorityPolicy.ts";

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

const MAX_DIRECT_WRITE_FILES = 2;
const SELF_DEMOTE_ELAPSED_MS = 30_000;
const SELF_DEMOTE_FILES_MODIFIED = 3;

const ALLOWED_SCOPES = new Set<string>(["tiny", "small"]);
const ALLOWED_DURATIONS = new Set<string>(["instant", "short"]);

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const makeAuthorityPolicy = Effect.succeed({
  canExecuteDirectly: (input) =>
    Effect.succeed(
      (() => {
        // Scope too large for direct work
        if (!ALLOWED_SCOPES.has(input.estimatedScope)) {
          return {
            allowed: false,
            reason: `Estimated scope "${input.estimatedScope}" exceeds direct-execution threshold`,
          };
        }

        // Duration too long for direct work
        if (!ALLOWED_DURATIONS.has(input.estimatedDuration)) {
          return {
            allowed: false,
            reason: `Estimated duration "${input.estimatedDuration}" exceeds direct-execution threshold`,
          };
        }

        // Too many files in write scope
        if (input.writeScope.length > MAX_DIRECT_WRITE_FILES) {
          return {
            allowed: false,
            reason: `Write scope of ${input.writeScope.length} files exceeds limit of ${MAX_DIRECT_WRITE_FILES}`,
          };
        }

        // Check for overlapping write-scope ownership with active workers
        const activeWriteScopes = input.activeWorkers
          .filter((w) => w.status === "running")
          .flatMap((w) => (w.workspace.cwd ? [w.workspace.cwd] : []));

        const hasOverlap = input.writeScope.some((scope) =>
          activeWriteScopes.some(
            (workerScope) => scope.startsWith(workerScope) || workerScope.startsWith(scope),
          ),
        );

        if (hasOverlap) {
          return {
            allowed: false,
            reason: "Write scope overlaps with an active worker's workspace",
          };
        }

        return { allowed: true, reason: "Task within direct-execution thresholds" };
      })(),
    ),

  shouldSelfDemote: (input) =>
    Effect.succeed(
      (() => {
        if (input.elapsedMs > SELF_DEMOTE_ELAPSED_MS) {
          return {
            demote: true,
            reason: `Elapsed time ${input.elapsedMs}ms exceeds threshold of ${SELF_DEMOTE_ELAPSED_MS}ms`,
          };
        }

        if (input.filesModified > SELF_DEMOTE_FILES_MODIFIED) {
          return {
            demote: true,
            reason: `Modified ${input.filesModified} files, exceeding threshold of ${SELF_DEMOTE_FILES_MODIFIED}`,
          };
        }

        // Check if active workers are waiting (not running, which may indicate
        // they are blocked waiting for the root to finish)
        const waitingWorkers = input.activeWorkers.filter(
          (w) => w.status === "running" && w.activeTaskId != null,
        );
        if (waitingWorkers.length > 0) {
          return {
            demote: true,
            reason: `${waitingWorkers.length} active worker(s) waiting; root should delegate`,
          };
        }

        return { demote: false, reason: "Within direct-execution thresholds" };
      })(),
    ),
} satisfies AuthorityPolicyShape);

export const AuthorityPolicyLive = Layer.effect(AuthorityPolicyService, makeAuthorityPolicy);
