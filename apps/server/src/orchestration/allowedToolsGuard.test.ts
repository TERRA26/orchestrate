import { describe, expect, it } from "vitest";

import { checkToolAllowed } from "./allowedToolsGuard";

/**
 * Pins the allowedTools whitelist guard introduced by ORC-242.
 *
 * @see ORC-242
 */

describe("checkToolAllowed (ORC-242)", () => {
  it("passes through when workerAllowedTools is undefined (top-level orchestrator)", () => {
    const outcome = checkToolAllowed({
      toolName: "orchestrate_spawn_agent",
      workerAllowedTools: undefined,
    });
    expect(outcome.ok).toBe(true);
  });

  it("passes through when workerAllowedTools is the empty array (default)", () => {
    const outcome = checkToolAllowed({
      toolName: "orchestrate_spawn_agent",
      workerAllowedTools: [],
    });
    expect(outcome.ok).toBe(true);
  });

  it("permits a tool that is in a non-empty whitelist", () => {
    const outcome = checkToolAllowed({
      toolName: "orchestrate_get_agent_status",
      workerAllowedTools: ["orchestrate_get_agent_status", "orchestrate_get_agent_logs"],
    });
    expect(outcome.ok).toBe(true);
  });

  it("rejects a tool that is not in a non-empty whitelist", () => {
    const outcome = checkToolAllowed({
      toolName: "orchestrate_terminate_agent",
      workerAllowedTools: ["orchestrate_get_agent_status"],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("tool_not_allowed");
    expect(outcome.toolName).toBe("orchestrate_terminate_agent");
    expect(outcome.allowedTools).toEqual(["orchestrate_get_agent_status"]);
    expect(outcome.reason).toContain("orchestrate_terminate_agent");
    expect(outcome.reason).toContain("orchestrate_get_agent_status");
  });

  it("rejects when toolName matches case-sensitively only", () => {
    // Tool names are case-sensitive identifiers; uppercase variant
    // does not match a lowercase whitelist.
    const outcome = checkToolAllowed({
      toolName: "ORCHESTRATE_SPAWN_AGENT",
      workerAllowedTools: ["orchestrate_spawn_agent"],
    });
    expect(outcome.ok).toBe(false);
  });

  it("includes a comma-separated list of allowed tools in the rejection message", () => {
    const outcome = checkToolAllowed({
      toolName: "orchestrate_terminate_agent",
      workerAllowedTools: ["orchestrate_get_agent_status", "orchestrate_get_agent_logs"],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toContain(
      "orchestrate_get_agent_status, orchestrate_get_agent_logs",
    );
  });

  it("treats a frozen ReadonlyArray as a valid whitelist (typed input)", () => {
    const tools = Object.freeze(["orchestrate_get_agent_status"]);
    const outcome = checkToolAllowed({
      toolName: "orchestrate_get_agent_status",
      workerAllowedTools: tools,
    });
    expect(outcome.ok).toBe(true);
  });
});
