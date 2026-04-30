import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AgentStatePill, agentStatePillLabel } from "./OrchestratorAgentStatePill";

describe("AgentStatePill", () => {
  it("maps orchestrator statuses to compact user-facing states", () => {
    expect(agentStatePillLabel("thinking")).toBe("thinking");
    expect(agentStatePillLabel("sending")).toBe("thinking");
    expect(agentStatePillLabel("reviewing")).toBe("working");
    expect(agentStatePillLabel("waiting")).toBe("waiting");
    expect(agentStatePillLabel("completed")).toBe("ready");
    expect(agentStatePillLabel("idle")).toBe("ready");
    expect(agentStatePillLabel("failed")).toBe("blocked");
    expect(agentStatePillLabel("stuck")).toBe("blocked");
  });

  it("renders the current agent state as a composer pill", () => {
    expect(renderToStaticMarkup(<AgentStatePill status="thinking" />)).toContain("thinking");
    expect(renderToStaticMarkup(<AgentStatePill status="reviewing" />)).toContain("working");
    expect(renderToStaticMarkup(<AgentStatePill status="waiting" />)).toContain("waiting");
    expect(renderToStaticMarkup(<AgentStatePill status="completed" />)).toContain("ready");
    expect(renderToStaticMarkup(<AgentStatePill status="failed" />)).toContain("blocked");
  });
});
