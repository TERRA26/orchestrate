/**
 * OrchestrationToolRouterService - Service interface for routing orchestration
 * tool calls from the meta-agent.
 *
 * Classifies each tool invocation into UI-directive, read-only, or command
 * categories and delegates accordingly. Input validation is handled via
 * Schema.decodeUnknown for the per-tool input schemas defined in contracts.
 *
 * @module OrchestrationToolRouterService
 */
import { ServiceMap } from "effect";
import type { Effect } from "effect";

export interface OrchestrationToolRouterShape {
  /**
   * Check whether a given tool name is a known orchestration tool.
   */
  readonly isOrchestrationTool: (toolName: string) => boolean;

  /**
   * Execute an orchestration tool by name, routing to the appropriate handler.
   *
   * @param input.toolName - The orchestration tool to execute.
   * @param input.toolInput - Raw (unvalidated) tool input payload.
   * @param input.threadId - Thread context for the calling meta-agent.
   * @param input.runId - Orchestrator run context (may be null for ad-hoc calls).
   * @returns Effect containing the tool result (shape varies by tool).
   */
  readonly executeTool: (input: {
    readonly toolName: string;
    readonly toolInput: unknown;
    readonly threadId: string;
    readonly runId: string | null;
  }) => Effect.Effect<unknown, Error>;
}

/**
 * OrchestrationToolRouterService - Service tag for orchestration tool routing.
 *
 * @example
 * ```ts
 * const program = Effect.gen(function* () {
 *   const router = yield* OrchestrationToolRouterService
 *   if (router.isOrchestrationTool("spawn_agent")) {
 *     const result = yield* router.executeTool({ toolName: "spawn_agent", toolInput, threadId, runId })
 *   }
 * })
 * ```
 */
export class OrchestrationToolRouterService extends ServiceMap.Service<
  OrchestrationToolRouterService,
  OrchestrationToolRouterShape
>()("t3/orchestration/Services/OrchestrationToolRouter/OrchestrationToolRouterService") {}
