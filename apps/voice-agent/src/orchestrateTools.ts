import type { JobContext } from "@livekit/agents";

import { postVoiceDiagnostic } from "./voiceDiagnostics.js";

export interface VoiceAgentConfig {
  readonly orchestrateHttpUrl: string;
  readonly sharedSecret: string;
}

export interface OrchestratorStatusRequest {
  readonly threadId?: string;
}

export interface OrchestratorPlanRequest {
  readonly threadId?: string;
  readonly planId?: string;
}

export interface OrchestratorMessageRequest {
  readonly threadId?: string;
  readonly text: string;
  readonly dispatchMode?: "queue" | "steer";
}

export interface OrchestratorUserInputResponseRequest {
  readonly threadId?: string;
  readonly requestId: string;
  readonly answers: Record<string, unknown>;
}

export interface OrchestratorApprovalResponseRequest {
  readonly threadId?: string;
  readonly requestId: string;
  readonly decision: "accept" | "acceptForSession" | "decline" | "cancel";
}

export interface OrchestratorPlanApprovalRequest {
  readonly threadId?: string;
  readonly planId?: string;
  readonly text?: string;
}

export interface AnswerOrchestratorQuestionRequest {
  readonly threadId?: string;
  readonly requestId?: string;
  readonly questionId?: string;
  readonly option?: string;
  readonly options?: string[];
  readonly customAnswer?: string;
}

const VOICE_ROOM_PREFIX = "orchestrate-voice-";
const draftUserInputAnswersByRequest = new Map<string, Record<string, string | string[]>>();

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function readJobMetadata(ctx: JobContext | undefined): Record<string, unknown> | null {
  const metadata = (ctx?.job as { metadata?: string } | undefined)?.metadata;
  if (!metadata) {
    return null;
  }
  try {
    return asRecord(JSON.parse(metadata) as unknown);
  } catch {
    return null;
  }
}

function isLocalHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1")
    );
  } catch {
    return false;
  }
}

function readMetadataOrchestrateHttpUrl(ctx: JobContext | undefined): string | null {
  const value = readJobMetadata(ctx)?.orchestrateHttpUrl;
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  const trimmed = trimTrailingSlash(value.trim());
  return isLocalHttpOrigin(trimmed) ? trimmed : null;
}

function getRoomName(ctx: JobContext): string | null {
  const roomFromJob = ctx.job.room?.name;
  if (roomFromJob && roomFromJob.length > 0) {
    return roomFromJob;
  }
  const room = ctx.room as { name?: string };
  return room.name && room.name.length > 0 ? room.name : null;
}

export function resolveThreadId(ctx: JobContext, explicitThreadId?: string): string {
  const explicit = explicitThreadId?.trim();
  if (explicit) {
    return explicit;
  }
  const roomName = getRoomName(ctx);
  if (roomName?.startsWith(VOICE_ROOM_PREFIX)) {
    return roomName.slice(VOICE_ROOM_PREFIX.length);
  }
  throw new Error("No Orchestrate thread id is available for this voice room.");
}

export function readVoiceAgentConfig(
  env: NodeJS.ProcessEnv = process.env,
  ctx?: JobContext,
): VoiceAgentConfig {
  const sharedSecret = env.ORCHESTRATE_VOICE_AGENT_SECRET?.trim();
  if (!sharedSecret) {
    throw new Error("ORCHESTRATE_VOICE_AGENT_SECRET must be set for the voice agent.");
  }
  const metadataHttpUrl = readMetadataOrchestrateHttpUrl(ctx);
  return {
    orchestrateHttpUrl:
      metadataHttpUrl ??
      trimTrailingSlash(env.ORCHESTRATE_HTTP_URL?.trim() || "http://localhost:3773"),
    sharedSecret,
  };
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function summarizeBodyForDiagnostic(body: unknown): Record<string, unknown> {
  const record = asRecord(body);
  if (!record) {
    return {
      bodyPreview: typeof body === "string" ? body.slice(0, 2_000) : String(body),
    };
  }

  const planMarkdown = typeof record.planMarkdown === "string" ? record.planMarkdown : null;
  const voiceSummary = typeof record.voiceSummary === "string" ? record.voiceSummary : null;
  const plans = asRecord(record.plans);
  const latestPlan = asRecord(plans?.latest);
  const attention = asRecord(record.attention);
  return {
    ...(typeof record.accepted === "boolean" ? { accepted: record.accepted } : {}),
    ...(typeof record.id === "string" ? { id: record.id } : {}),
    ...(typeof record.planId === "string" ? { planId: record.planId } : {}),
    ...(typeof record.title === "string" ? { title: record.title } : {}),
    ...(typeof record.actionable === "boolean" ? { actionable: record.actionable } : {}),
    ...(typeof record.markdownCharCount === "number"
      ? { markdownCharCount: record.markdownCharCount }
      : {}),
    ...(typeof record.truncated === "boolean" ? { truncated: record.truncated } : {}),
    ...(voiceSummary ? { voiceSummaryPreview: voiceSummary.slice(0, 1_000) } : {}),
    ...(planMarkdown
      ? {
          planMarkdownPreview: planMarkdown.slice(0, 1_000),
          planMarkdownReturnedChars: planMarkdown.length,
        }
      : {}),
    ...(latestPlan
      ? {
          latestPlan: {
            id: readString(latestPlan.id),
            title: readString(latestPlan.title),
            actionable: latestPlan.actionable === true,
            markdownCharCount:
              typeof latestPlan.markdownCharCount === "number"
                ? latestPlan.markdownCharCount
                : null,
          },
        }
      : {}),
    ...(attention ? { attention } : {}),
  };
}

async function callOrchestrateApi(
  config: VoiceAgentConfig,
  ctx: JobContext,
  path: string,
  init: RequestInit,
  diagnostic: {
    readonly toolName: string;
    readonly threadId?: string;
    readonly data?: unknown;
  },
): Promise<unknown> {
  const diagnosticData = asRecord(diagnostic.data);
  void postVoiceDiagnostic(config, ctx, {
    message: `Voice tool ${diagnostic.toolName} calling Orchestrate API.`,
    threadId: diagnostic.threadId,
    data: {
      method: init.method ?? "GET",
      path,
      ...diagnosticData,
    },
  });
  let response: Response;
  try {
    response = await fetch(`${config.orchestrateHttpUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.sharedSecret}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
  } catch (cause) {
    void postVoiceDiagnostic(config, ctx, {
      level: "error",
      message: `Voice tool ${diagnostic.toolName} could not reach Orchestrate API.`,
      threadId: diagnostic.threadId,
      data: {
        path,
        error: cause instanceof Error ? cause.message : String(cause),
      },
    });
    throw cause;
  }
  const body = await readJsonResponse(response);
  if (!response.ok) {
    void postVoiceDiagnostic(config, ctx, {
      level: "error",
      message: `Voice tool ${diagnostic.toolName} Orchestrate API call failed.`,
      threadId: diagnostic.threadId,
      data: {
        path,
        status: response.status,
        body,
      },
    });
    throw new Error(
      `Orchestrate API ${path} failed with ${response.status}: ${JSON.stringify(body)}`,
    );
  }
  void postVoiceDiagnostic(config, ctx, {
    message: `Voice tool ${diagnostic.toolName} Orchestrate API call succeeded.`,
    threadId: diagnostic.threadId,
    data: {
      path,
      status: response.status,
      response: summarizeBodyForDiagnostic(body),
    },
  });
  return body;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeChoice(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^option\s+/, "")
    .replace(/^choice\s+/, "")
    .replace(/[.)]$/, "")
    .trim();
}

function readPendingInputs(status: unknown): Record<string, unknown>[] {
  const statusRecord = asRecord(status);
  const pendingInputs = statusRecord?.pendingUserInputs;
  return Array.isArray(pendingInputs)
    ? pendingInputs
        .map(asRecord)
        .filter((entry): entry is Record<string, unknown> => entry !== null)
    : [];
}

function readQuestions(pendingInput: Record<string, unknown>): Record<string, unknown>[] {
  const questions = pendingInput.questions;
  return Array.isArray(questions)
    ? questions.map(asRecord).filter((entry): entry is Record<string, unknown> => entry !== null)
    : [];
}

function readOptions(question: Record<string, unknown>): Record<string, unknown>[] {
  const options = question.options;
  return Array.isArray(options)
    ? options.map(asRecord).filter((entry): entry is Record<string, unknown> => entry !== null)
    : [];
}

function questionId(question: Record<string, unknown>): string | null {
  return readString(question.id);
}

function resolveOptionLabel(question: Record<string, unknown>, spokenOption: string): string {
  const normalized = normalizeChoice(spokenOption);
  const options = readOptions(question);
  const direct = options.find(
    (option) => normalizeChoice(readString(option.label) ?? "") === normalized,
  );
  if (direct) {
    return readString(direct.label) ?? spokenOption;
  }

  const numericIndex = Number.parseInt(normalized, 10);
  if (Number.isInteger(numericIndex) && numericIndex > 0) {
    const option = options[numericIndex - 1];
    const label = option ? readString(option.label) : null;
    if (label) {
      return label;
    }
  }

  const alphaIndex = normalized.length === 1 ? normalized.charCodeAt(0) - "a".charCodeAt(0) : -1;
  if (alphaIndex >= 0) {
    const option = options[alphaIndex];
    const label = option ? readString(option.label) : null;
    if (label) {
      return label;
    }
  }

  if (normalized === "recommended") {
    const recommended = options.find((option) => option.recommended === true);
    const label = recommended ? readString(recommended.label) : null;
    if (label) {
      return label;
    }
  }

  return spokenOption.trim();
}

function summarizeQuestion(question: Record<string, unknown>) {
  return {
    id: readString(question.id),
    header: readString(question.header),
    question: readString(question.question),
    multiSelect: question.multiSelect === true,
    options: readOptions(question).map((option) => ({
      label: readString(option.label),
      description: readString(option.description),
      recommended: option.recommended === true,
      recommendationReason: readString(option.recommendationReason),
      tooltip: readString(option.tooltip),
    })),
  };
}

export async function getOrchestratorStatus(
  config: VoiceAgentConfig,
  ctx: JobContext,
  request: OrchestratorStatusRequest,
): Promise<unknown> {
  const threadId = resolveThreadId(ctx, request.threadId);
  return callOrchestrateApi(
    config,
    ctx,
    `/api/voice/orchestrator/status?threadId=${encodeURIComponent(threadId)}`,
    { method: "GET" },
    { toolName: "get_orchestrator_status", threadId },
  );
}

export async function getOrchestratorPlan(
  config: VoiceAgentConfig,
  ctx: JobContext,
  request: OrchestratorPlanRequest,
): Promise<unknown> {
  const threadId = resolveThreadId(ctx, request.threadId);
  const params = new URLSearchParams({ threadId });
  if (request.planId?.trim()) {
    params.set("planId", request.planId.trim());
  }
  return callOrchestrateApi(
    config,
    ctx,
    `/api/voice/orchestrator/plan?${params.toString()}`,
    { method: "GET" },
    {
      toolName: "get_orchestrator_plan",
      threadId,
      data: { planId: request.planId },
    },
  );
}

export async function sendOrchestratorMessage(
  config: VoiceAgentConfig,
  ctx: JobContext,
  request: OrchestratorMessageRequest,
): Promise<unknown> {
  const threadId = resolveThreadId(ctx, request.threadId);
  return callOrchestrateApi(
    config,
    ctx,
    "/api/voice/orchestrator/message",
    {
      method: "POST",
      body: JSON.stringify({
        dispatchMode: request.dispatchMode ?? "queue",
        text: request.text,
        threadId,
      }),
    },
    {
      toolName: "send_orchestrator_message",
      threadId,
      data: {
        dispatchMode: request.dispatchMode ?? "queue",
        textPreview: request.text.slice(0, 500),
      },
    },
  );
}

export async function respondToOrchestratorUserInput(
  config: VoiceAgentConfig,
  ctx: JobContext,
  request: OrchestratorUserInputResponseRequest,
): Promise<unknown> {
  const threadId = resolveThreadId(ctx, request.threadId);
  return callOrchestrateApi(
    config,
    ctx,
    "/api/voice/orchestrator/user-input-response",
    {
      method: "POST",
      body: JSON.stringify({
        answers: request.answers,
        requestId: request.requestId,
        threadId,
      }),
    },
    {
      toolName: "respond_to_orchestrator_user_input",
      threadId,
      data: { requestId: request.requestId, answerKeys: Object.keys(request.answers) },
    },
  );
}

export async function respondToOrchestratorApproval(
  config: VoiceAgentConfig,
  ctx: JobContext,
  request: OrchestratorApprovalResponseRequest,
): Promise<unknown> {
  const threadId = resolveThreadId(ctx, request.threadId);
  return callOrchestrateApi(
    config,
    ctx,
    "/api/voice/orchestrator/approval-response",
    {
      method: "POST",
      body: JSON.stringify({
        decision: request.decision,
        requestId: request.requestId,
        threadId,
      }),
    },
    {
      toolName: "respond_to_orchestrator_approval",
      threadId,
      data: { requestId: request.requestId, decision: request.decision },
    },
  );
}

export async function approveOrchestratorPlan(
  config: VoiceAgentConfig,
  ctx: JobContext,
  request: OrchestratorPlanApprovalRequest,
): Promise<unknown> {
  const threadId = resolveThreadId(ctx, request.threadId);
  return callOrchestrateApi(
    config,
    ctx,
    "/api/voice/orchestrator/plan-approval",
    {
      method: "POST",
      body: JSON.stringify({
        ...(request.planId ? { planId: request.planId } : {}),
        ...(request.text ? { text: request.text } : {}),
        threadId,
      }),
    },
    {
      toolName: "approve_orchestrator_plan",
      threadId,
      data: { planId: request.planId, textPreview: request.text?.slice(0, 500) },
    },
  );
}

export async function answerOrchestratorQuestion(
  config: VoiceAgentConfig,
  ctx: JobContext,
  request: AnswerOrchestratorQuestionRequest,
): Promise<unknown> {
  const threadId = resolveThreadId(ctx, request.threadId);
  const status = await getOrchestratorStatus(config, ctx, { threadId });
  const pendingInputs = readPendingInputs(status);
  const pendingInput =
    (request.requestId
      ? pendingInputs.find((entry) => readString(entry.requestId) === request.requestId)
      : pendingInputs[0]) ?? null;
  if (!pendingInput) {
    return {
      submitted: false,
      reason: "No pending orchestrator question is open.",
    };
  }

  const requestId = readString(pendingInput.requestId);
  if (!requestId) {
    return {
      submitted: false,
      reason: "The pending question does not have a request id.",
    };
  }

  const questions = readQuestions(pendingInput);
  const draftKey = `${threadId}:${requestId}`;
  const existingDraftAnswers = draftUserInputAnswersByRequest.get(draftKey);
  const draftAnswers = existingDraftAnswers ? { ...existingDraftAnswers } : {};
  const targetQuestion =
    (request.questionId
      ? questions.find((entry) => questionId(entry) === request.questionId)
      : questions.find((entry) => {
          const id = questionId(entry);
          return id ? draftAnswers[id] === undefined : false;
        })) ??
    questions[0] ??
    null;

  const targetQuestionId = targetQuestion ? questionId(targetQuestion) : null;
  if (!targetQuestion || !targetQuestionId) {
    return {
      submitted: false,
      reason: "The pending question did not include a valid question id.",
    };
  }

  const explicitOptions = request.options?.filter((entry) => entry.trim().length > 0) ?? [];
  const answer =
    explicitOptions.length > 0
      ? explicitOptions.map((entry) => resolveOptionLabel(targetQuestion, entry))
      : (readString(request.customAnswer) ??
        (request.option ? resolveOptionLabel(targetQuestion, request.option) : null));
  if (!answer || (Array.isArray(answer) && answer.length === 0)) {
    return {
      submitted: false,
      reason: "No spoken option or custom answer was provided.",
      activeQuestion: summarizeQuestion(targetQuestion),
    };
  }

  draftAnswers[targetQuestionId] = answer;
  const unansweredQuestion = questions.find((entry) => {
    const id = questionId(entry);
    return id ? draftAnswers[id] === undefined : false;
  });

  await postVoiceDiagnostic(config, ctx, {
    message: "Voice answered orchestrator question.",
    threadId,
    data: {
      requestId,
      questionId: targetQuestionId,
      answer,
      submitted: unansweredQuestion === undefined,
      nextQuestion: unansweredQuestion ? summarizeQuestion(unansweredQuestion) : null,
      answeredQuestionIds: Object.keys(draftAnswers),
    },
  });

  if (unansweredQuestion) {
    draftUserInputAnswersByRequest.set(draftKey, draftAnswers);
    return {
      submitted: false,
      requestId,
      answeredQuestionId: targetQuestionId,
      draftAnswers,
      nextQuestion: summarizeQuestion(unansweredQuestion),
      remainingQuestionCount: questions.filter((entry) => {
        const id = questionId(entry);
        return id ? draftAnswers[id] === undefined : false;
      }).length,
    };
  }

  draftUserInputAnswersByRequest.delete(draftKey);
  await postVoiceDiagnostic(config, ctx, {
    message: "Voice submitting completed orchestrator question answers.",
    threadId,
    data: { requestId, answerKeys: Object.keys(draftAnswers) },
  });
  const result = await respondToOrchestratorUserInput(config, ctx, {
    threadId,
    requestId,
    answers: draftAnswers,
  });
  return {
    submitted: true,
    requestId,
    answers: draftAnswers,
    result,
  };
}
