import { normalizeVoiceCommandText } from "./voiceWakeSleep.js";
import {
  ORCHESTRATE_PRODUCT_FACTS,
  isOrchestrateSelfPresentationWebsiteRequest,
} from "@orchestrate/shared/orchestrateProductDemo";

const WORKFLOW_TERMS = new Set([
  "agent",
  "agents",
  "approval",
  "approve",
  "approved",
  "blocked",
  "browser",
  "clarification",
  "clarifications",
  "clarify",
  "done",
  "input",
  "inputs",
  "plan",
  "planning",
  "progress",
  "question",
  "questions",
  "review",
  "running",
  "spawn",
  "spawned",
  "status",
  "stuck",
  "task",
  "tasks",
  "waiting",
  "worker",
  "workers",
]);

const SHORT_ANSWER_TERMS = new Set([
  "accept",
  "approve",
  "approved",
  "ahead",
  "cancel",
  "decline",
  "first",
  "go",
  "implement",
  "no",
  "okay",
  "recommended",
  "second",
  "ship",
  "start",
  "third",
  "yes",
]);

export function isLikelyOrchestrateWorkflowUtterance(transcript: string): boolean {
  const normalized = normalizeVoiceCommandText(transcript);
  if (!normalized) return false;
  const words = normalized.split(" ").filter((word) => word.length > 0);
  return words.some((word) => WORKFLOW_TERMS.has(word));
}

export function isLikelyShortWorkflowAnswer(transcript: string): boolean {
  const normalized = normalizeVoiceCommandText(transcript);
  if (!normalized) return false;
  const words = normalized.split(" ").filter((word) => word.length > 0);
  return words.length <= 4 && words.some((word) => SHORT_ANSWER_TERMS.has(word));
}

export function isLikelyOrchestrateIdentityUtterance(transcript: string): boolean {
  const normalized = normalizeVoiceCommandText(transcript);
  if (!normalized) return false;
  if (isOrchestrateSelfPresentationWebsiteRequest(transcript)) return false;
  return (
    /\b(who are you|what are you|tell me about yourself|introduce yourself|about yourself|yourself|what is orchestrate|tell me about orchestrate|what does orchestrate do)\b/i.test(
      normalized,
    ) || /\b(what|who)\b.*\b(orchestrate|you)\b/i.test(normalized)
  );
}

export function buildControlledReplyInstructions(transcript: string): string {
  const trimmedTranscript = transcript.trim();
  if (isLikelyOrchestrateIdentityUtterance(trimmedTranscript)) {
    return [
      `The user just said: ${JSON.stringify(trimmedTranscript)}.`,
      "Answer in first person as Orchestrate in voice mode. You are part of Orchestrate, not a third-party narrator. Do not say you are a generic AI assistant.",
      "Do not call tools for this identity/product question unless the user also asks for live status or wants work started.",
      "Use these product facts:",
      ...ORCHESTRATE_PRODUCT_FACTS.map((fact) => `- ${fact}`),
      "Give one or two spoken sentences. Prefer phrasing like 'I'm Orchestrate...' or 'I coordinate...' rather than 'Orchestrate is...'. Keep it crisp and product-specific.",
    ].join("\n");
  }

  const workflowUtterance =
    isLikelyOrchestrateWorkflowUtterance(trimmedTranscript) ||
    isLikelyShortWorkflowAnswer(trimmedTranscript);
  const workflowInstructions = workflowUtterance
    ? [
        "This sounds like an Orchestrate workflow, status, intake, plan, approval, or short answer utterance.",
        "Before speaking about current state, pending user input, clarifying questions, plans, approvals, workers, agents, browser validation, or progress, call get_orchestrator_status.",
        "If status shows an actionable latest proposed plan and the utterance approves it, such as yes, approve, approved, okay, go ahead, implement it, start, or ship it, call approve_orchestrator_plan. Do not ask the user to click Approve plan.",
        "After approve_orchestrator_plan succeeds, call get_orchestrator_status again before speaking so the response reflects the implementation run that just started.",
        "If pendingUserInputs are present and the utterance is an answer such as yes, no, recommended, first, second, or an option label, call answer_orchestrator_question.",
        "If pendingUserInputs are present and the user asks what the input/question is, read the active question and options. Do not ask what input they mean.",
      ]
    : [
        "If this is an actionable project or steering request, call send_orchestrator_message.",
        "If send_orchestrator_message succeeds, do not immediately call get_orchestrator_status just to look for a plan. The orchestrator may still be preparing native intake or a plan.",
        "After sending an actionable request, say you started it and will update the user when native intake or plan details are ready.",
        "If it asks about current Orchestrate state, pending questions, approvals, plans, workers, or progress, call get_orchestrator_status before speaking.",
      ];

  return [
    `The user just said: ${JSON.stringify(trimmedTranscript)}.`,
    "Respond now. Follow your standing Orchestrate Voice instructions and use tools when required.",
    ...workflowInstructions,
    "Keep the spoken response concise and useful.",
  ].join("\n");
}
