/**
 * AuthorityPolicyService - Service interface for root authority and self-demotion.
 *
 * Determines whether the root orchestrator may execute a task directly or
 * should delegate to a worker. Also monitors execution to detect when the
 * root should self-demote (stop direct work and spawn a worker instead).
 *
 * @module AuthorityPolicyService
 */
import { ServiceMap } from "effect";
import type { Effect } from "effect";
import type { OrchestratorWorker } from "@t3tools/contracts";

export interface AuthorityPolicyShape {
  /** Check whether the root orchestrator is allowed to execute work directly. */
  readonly canExecuteDirectly: (input: {
    taskObjective: string;
    estimatedScope: "tiny" | "small" | "medium" | "large";
    estimatedDuration: "instant" | "short" | "medium" | "long";
    writeScope: ReadonlyArray<string>;
    activeWorkers: ReadonlyArray<OrchestratorWorker>;
  }) => Effect.Effect<{ allowed: boolean; reason: string }>;

  /** Check whether the root should self-demote from direct execution. */
  readonly shouldSelfDemote: (input: {
    startedAt: string;
    elapsedMs: number;
    filesModified: number;
    activeWorkers: ReadonlyArray<OrchestratorWorker>;
  }) => Effect.Effect<{ demote: boolean; reason: string }>;
}

/**
 * AuthorityPolicyService - Service tag for root authority policy access.
 *
 * @example
 * ```ts
 * const program = Effect.gen(function* () {
 *   const policy = yield* AuthorityPolicyService
 *   const { allowed } = yield* policy.canExecuteDirectly({ ... })
 * })
 * ```
 */
export class AuthorityPolicyService extends ServiceMap.Service<
  AuthorityPolicyService,
  AuthorityPolicyShape
>()("t3/orchestration/Services/AuthorityPolicy/AuthorityPolicyService") {}
