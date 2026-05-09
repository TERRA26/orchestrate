import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AgentStatePill,
  agentStatePillLabel,
  shouldShowOrchestratorComposerAgentState,
} from "./OrchestratorAgentStatePill";
import * as orchestratorEngine from "./useOrchestratorEngine";

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

  it("hides agent state pills in the orchestrator composer footer", () => {
    expect(shouldShowOrchestratorComposerAgentState("idle")).toBe(false);
    expect(shouldShowOrchestratorComposerAgentState("completed")).toBe(false);
    expect(shouldShowOrchestratorComposerAgentState("thinking")).toBe(false);
    expect(shouldShowOrchestratorComposerAgentState("waiting")).toBe(false);
    expect(shouldShowOrchestratorComposerAgentState("failed")).toBe(false);
  });
});

describe("deriveEffectiveOrchestratorStatus", () => {
  it("keeps a restored running orchestrator visibly busy when local UI status is idle", () => {
    const deriveEffectiveOrchestratorStatus = (
      orchestratorEngine as typeof orchestratorEngine & {
        deriveEffectiveOrchestratorStatus?: (input: {
          localStatus: string | undefined;
          agentPhase: string;
          hasActiveRun: boolean;
        }) => string;
      }
    ).deriveEffectiveOrchestratorStatus;

    expect(
      deriveEffectiveOrchestratorStatus?.({
        localStatus: undefined,
        agentPhase: "running",
        hasActiveRun: false,
      }),
    ).toBe("waiting");
    expect(
      deriveEffectiveOrchestratorStatus?.({
        localStatus: undefined,
        agentPhase: "ready",
        hasActiveRun: true,
      }),
    ).toBe("waiting");
  });
});

describe("shouldClearOrchestratorStatusWithoutActiveRun", () => {
  it("does not clear a direct orchestrator turn that is still waiting for runtime activity", () => {
    const shouldClearOrchestratorStatusWithoutActiveRun = (
      orchestratorEngine as typeof orchestratorEngine & {
        shouldClearOrchestratorStatusWithoutActiveRun?: (input: {
          status: string;
          agentPhase: string;
        }) => boolean;
      }
    ).shouldClearOrchestratorStatusWithoutActiveRun;

    expect(
      shouldClearOrchestratorStatusWithoutActiveRun?.({
        status: "waiting",
        agentPhase: "running",
      }),
    ).toBe(false);
    expect(
      shouldClearOrchestratorStatusWithoutActiveRun?.({
        status: "waiting",
        agentPhase: "ready",
      }),
    ).toBe(true);
  });
});
