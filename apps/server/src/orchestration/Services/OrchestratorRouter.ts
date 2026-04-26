/**
 * OrchestratorRouterService - Service interface for typed routing protocol.
 *
 * Classifies incoming requests into one of four routing decisions:
 * answer, inspect, delegate, or decompose. V1 uses heuristic classification;
 * future versions can introduce LLM-based routing.
 *
 * @module OrchestratorRouterService
 */
import { ServiceMap } from "effect";
import type { Effect } from "effect";
import type {
  OrchestratorRun,
  OrchestratorTask,
  OrchestratorWorker,
  OrchestratorDecision,
} from "@orchestrate/contracts";

// --- Input/output types ---

export interface RoutingInput {
  readonly userMessage: string;
  readonly activeRun: OrchestratorRun | null;
  readonly activeTasks: ReadonlyArray<OrchestratorTask>;
  readonly activeWorkers: ReadonlyArray<OrchestratorWorker>;
  readonly recentDecisions: ReadonlyArray<OrchestratorDecision>;
  readonly rootCapabilities: ReadonlyArray<
    typeof import("@orchestrate/contracts").RequiredCapability.Type
  >;
}

export interface InspectionPlan {
  readonly steps: ReadonlyArray<{ action: string; target: string }>;
}

export interface TaskDraft {
  readonly title: string;
  readonly objective: string;
  readonly acceptanceCriteria: ReadonlyArray<string>;
  readonly requiredCapabilities?: ReadonlyArray<
    typeof import("@orchestrate/contracts").RequiredCapability.Type
  >;
}

export type RoutingDecision =
  | {
      readonly action: "answer";
      readonly response: string;
      readonly shouldContinueRun: boolean;
    }
  | { readonly action: "inspect"; readonly plan: InspectionPlan }
  | { readonly action: "delegate"; readonly taskDraft: TaskDraft }
  | {
      readonly action: "decompose";
      readonly subtasks: ReadonlyArray<TaskDraft>;
    };

// --- Service shape ---

export interface OrchestratorRouterShape {
  readonly route: (input: RoutingInput) => Effect.Effect<RoutingDecision>;
}

// --- Service tag ---

/**
 * OrchestratorRouterService - Service tag for orchestrator routing access.
 *
 * @example
 * ```ts
 * const program = Effect.gen(function* () {
 *   const router = yield* OrchestratorRouterService
 *   const decision = yield* router.route({ ... })
 * })
 * ```
 */
export class OrchestratorRouterService extends ServiceMap.Service<
  OrchestratorRouterService,
  OrchestratorRouterShape
>()("t3/orchestration/Services/OrchestratorRouter/OrchestratorRouterService") {}
