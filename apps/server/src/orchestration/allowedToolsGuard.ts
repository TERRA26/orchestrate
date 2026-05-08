/**
 * ORC-242: enforce a worker's `spawnBudget.allowedTools` whitelist at
 * tool-call time.
 *
 * The orchestrator can spawn a worker with a restricted tool set,
 * but `executeTool` did not consult the list. Capability was theatre:
 * any worker could call any tool. This module is a pure helper used
 * by the tool router to decide whether a given (worker, toolName)
 * pair is permitted.
 *
 * Semantics:
 *  - `allowedTools === undefined`: unrestricted. The worker may call
 *    any orchestration tool. Used by orchestrator threads (no worker
 *    record) and as a permissive default.
 *  - `allowedTools === []`: unrestricted. An empty list is the
 *    default seeded by `DEFAULT_SPAWN_BUDGET`; treating it as "deny
 *    everything" would break current orchestrator behavior. This
 *    matches the documented semantic (empty = no whitelist applied).
 *  - `allowedTools` non-empty: strict whitelist. The worker may call
 *    ONLY the named tools. Any other call is rejected.
 *
 * @see ORC-242
 */

export interface AllowedToolsCheckInput {
  readonly toolName: string;
  readonly workerAllowedTools: ReadonlyArray<string> | undefined;
}

export type AllowedToolsCheckOutcome =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: "tool_not_allowed";
      readonly toolName: string;
      readonly allowedTools: ReadonlyArray<string>;
      readonly reason: string;
    };

export function checkToolAllowed(input: AllowedToolsCheckInput): AllowedToolsCheckOutcome {
  const { toolName, workerAllowedTools } = input;
  if (workerAllowedTools === undefined || workerAllowedTools.length === 0) {
    // No restriction recorded for this caller. Permissive default
    // matches the existing orchestrator semantic where the top-level
    // orchestrator thread can call every orchestration tool.
    return { ok: true };
  }
  if (workerAllowedTools.includes(toolName)) {
    return { ok: true };
  }
  return {
    ok: false,
    code: "tool_not_allowed",
    toolName,
    allowedTools: workerAllowedTools,
    reason:
      "Tool '" +
      toolName +
      "' is not in this worker's allowedTools whitelist. The orchestrator restricted this worker to: " +
      workerAllowedTools.join(", ") +
      ".",
  };
}
