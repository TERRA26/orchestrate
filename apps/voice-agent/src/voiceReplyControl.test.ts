import { describe, expect, it } from "vitest";

import {
  buildControlledReplyInstructions,
  isLikelyOrchestrateIdentityUtterance,
  isLikelyOrchestrateWorkflowUtterance,
  isLikelyShortWorkflowAnswer,
} from "./voiceReplyControl.js";

describe("voice reply control", () => {
  it("detects workflow utterances that require status preflight", () => {
    expect(isLikelyOrchestrateWorkflowUtterance("There is user input.")).toBe(true);
    expect(isLikelyOrchestrateWorkflowUtterance("What's the status?")).toBe(true);
    expect(isLikelyOrchestrateWorkflowUtterance("Are the agents done?")).toBe(true);
    expect(isLikelyOrchestrateWorkflowUtterance("Hello there")).toBe(false);
  });

  it("detects short answers that likely target pending orchestrator questions", () => {
    expect(isLikelyShortWorkflowAnswer("recommended")).toBe(true);
    expect(isLikelyShortWorkflowAnswer("yes")).toBe(true);
    expect(isLikelyShortWorkflowAnswer("approve it")).toBe(true);
    expect(isLikelyShortWorkflowAnswer("please build a website for my studio")).toBe(false);
  });

  it("instructs the model not to ask what input means before checking status", () => {
    const instructions = buildControlledReplyInstructions("There is user input.");

    expect(instructions).toContain("call get_orchestrator_status");
    expect(instructions).toContain("Do not ask what input they mean");
  });

  it("routes short spoken approvals to plan approval without requiring a click", () => {
    expect(isLikelyShortWorkflowAnswer("go ahead")).toBe(true);
    expect(isLikelyShortWorkflowAnswer("ship it")).toBe(true);

    const instructions = buildControlledReplyInstructions("go ahead");

    expect(instructions).toContain("call approve_orchestrator_plan");
    expect(instructions).toContain("Do not ask the user to click Approve plan");
    expect(instructions).toContain("call get_orchestrator_status again");
  });

  it("answers identity questions as Orchestrate instead of a generic assistant", () => {
    expect(isLikelyOrchestrateIdentityUtterance("Can you tell me about yourself?")).toBe(true);
    expect(
      isLikelyOrchestrateIdentityUtterance(
        "Can you create a website presenting yourself as Orchestrate?",
      ),
    ).toBe(false);

    const instructions = buildControlledReplyInstructions(
      "Can you tell me about yourself and who you are?",
    );

    expect(instructions).toContain("Answer in first person as Orchestrate");
    expect(instructions).toContain("Do not say you are a generic AI assistant");
    expect(instructions).toContain("not a third-party narrator");
    expect(instructions).toContain("evidence-driven control plane");
  });
});
