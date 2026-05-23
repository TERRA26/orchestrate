import { fileURLToPath } from "node:url";
import {
  AutoSubscribe,
  ServerOptions,
  cli,
  defineAgent,
  llm,
  voice,
  type JobContext,
} from "@livekit/agents";
import * as openai from "@livekit/agents-plugin-openai";
import {
  ORCHESTRATE_PRODUCT_VOICE_INSTRUCTIONS,
  enrichOrchestrateSelfPresentationWebsiteRequestForOrchestrator,
} from "@orchestrate/shared/orchestrateProductDemo";
import { z } from "zod";

import {
  installFutureAudioPublicationSubscription,
  subscribeExistingAudioPublications,
} from "./livekitAudioSubscriptions.js";
import {
  buildWakeSleepInstructions,
  type VoiceListeningMode,
  classifyWakeSleepCommand,
  normalizeVoiceCommandText,
} from "./voiceWakeSleep.js";
import { buildControlledReplyInstructions } from "./voiceReplyControl.js";
import {
  answerOrchestratorQuestion,
  approveOrchestratorPlan,
  getOrchestratorPlan,
  getOrchestratorStatus,
  readVoiceAgentConfig,
  respondToOrchestratorApproval,
  respondToOrchestratorUserInput,
  sendOrchestratorMessage,
} from "./orchestrateTools.js";
import { postVoiceDiagnostic } from "./voiceDiagnostics.js";

const AGENT_NAME = process.env.LIVEKIT_VOICE_AGENT_NAME || "orchestrate-voice-agent";
const REALTIME_MODEL = process.env.ORCHESTRATE_VOICE_OPENAI_REALTIME_MODEL || "gpt-realtime-mini";
const REALTIME_VOICE = process.env.ORCHESTRATE_VOICE_OPENAI_VOICE || "alloy";

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readNonNegativeIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function readTurnEagerness(): "auto" | "low" | "medium" | "high" {
  const raw = process.env.ORCHESTRATE_VOICE_TURN_EAGERNESS?.trim();
  return raw === "auto" || raw === "low" || raw === "medium" || raw === "high" ? raw : "high";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function summarizeConversationItem(item: unknown): Record<string, unknown> {
  const record = asRecord(item);
  if (!record) {
    return { item: String(item) };
  }
  const content = record.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .map((entry) => {
              const entryRecord = asRecord(entry);
              if (typeof entryRecord?.text === "string") return entryRecord.text;
              if (typeof entry === "string") return entry;
              return null;
            })
            .filter((entry): entry is string => entry !== null)
            .join("\n")
        : undefined;
  return {
    ...(typeof record.id === "string" ? { id: record.id } : {}),
    ...(typeof record.type === "string" ? { type: record.type } : {}),
    ...(typeof record.role === "string" ? { role: record.role } : {}),
    ...(text ? { textPreview: text.slice(0, 1_000) } : {}),
  };
}

const MAX_RESPONSE_OUTPUT_TOKENS = readPositiveIntegerEnv(
  "ORCHESTRATE_VOICE_MAX_RESPONSE_OUTPUT_TOKENS",
  1536,
);
const MAX_SESSION_DURATION_MS = readPositiveIntegerEnv(
  "ORCHESTRATE_VOICE_MAX_SESSION_DURATION_MS",
  10 * 60 * 1000,
);
const MAX_TOOL_STEPS = readPositiveIntegerEnv("ORCHESTRATE_VOICE_MAX_TOOL_STEPS", 24);
const IDLE_JOB_PROCESSES = readNonNegativeIntegerEnv("ORCHESTRATE_VOICE_IDLE_JOB_PROCESSES", 0);
const INITIALIZE_PROCESS_TIMEOUT_MS = readPositiveIntegerEnv(
  "ORCHESTRATE_VOICE_INITIALIZE_PROCESS_TIMEOUT_MS",
  60 * 1000,
);
const VOICE_LISTENING_MODE_CHANGED_MESSAGE = "Voice listening mode changed.";
const VOICE_SLEEPING_INPUT_IGNORED_MESSAGE = "Voice sleeping input ignored.";
const VOICE_SLEEPING_SPEECH_INTERRUPTED_MESSAGE = "Voice sleeping mode interrupted agent speech.";
const VOICE_REPLY_AUTHORIZATION_UPDATED_MESSAGE =
  "Voice reply authorization updated for listening mode.";
const CONTROLLED_REPLY_DELAY_MS = readPositiveIntegerEnv(
  "ORCHESTRATE_VOICE_CONTROLLED_REPLY_DELAY_MS",
  500,
);
const CHECKPOINT_POLL_INTERVAL_MS = readPositiveIntegerEnv(
  "ORCHESTRATE_VOICE_CHECKPOINT_POLL_INTERVAL_MS",
  2_500,
);
const CHECKPOINT_INITIAL_POLL_DELAY_MS = readPositiveIntegerEnv(
  "ORCHESTRATE_VOICE_CHECKPOINT_INITIAL_POLL_DELAY_MS",
  1_500,
);

function buildInstructions(ctx: JobContext, listeningMode: VoiceListeningMode): string {
  const roomName = ctx.job.room?.name ?? "the current Orchestrate voice room";
  return [
    "You are Orchestrate in voice mode, a concise voice surface for the Orchestrate coding orchestrator.",
    "You are part of Orchestrate, not a third-party narrator and not a generic AI assistant. If the user asks who you are or what you are, answer in first person as Orchestrate.",
    `You are connected to room ${roomName}.`,
    ...buildWakeSleepInstructions(listeningMode),
    "You help the user understand what the orchestrator is doing and decide whether spoken requests should become orchestrator chat messages.",
    ORCHESTRATE_PRODUCT_VOICE_INSTRUCTIONS,
    "If this is a new voice-created thread and the user gives an actionable project request, call send_orchestrator_message. That message starts the normal orchestrator path.",
    "Operational preflight is mandatory: before answering any utterance about status, progress, plans, approvals, user input, clarifying questions, agents, workers, browser validation, whether anything needs action, or whether something is done/stuck/running, call get_orchestrator_status first.",
    "For status questions, call get_orchestrator_status and summarize the result conversationally. Do not send a chat message for status-only questions.",
    "Never answer live status, current progress, whether anything has started, or whether agents/workers spawned from memory. Always call get_orchestrator_status immediately before speaking about the current state, even if you just approved a plan or recently checked status.",
    "When status includes workers, tasks, or childThreads, mention the active foreground agents in plain language: what task they are on, whether they are running/waiting/terminated, and any recovery or stall reason. Treat worker.effectiveStatus as the user-facing state.",
    "If the user says there is user input, asks what the question is, says answer/recommended/yes/no/first/second, or gives a short choice, treat it as about pendingUserInputs. Call get_orchestrator_status first; if pendingUserInputs are open, read the active question or call answer_orchestrator_question. Never ask what input they mean while pendingUserInputs may exist.",
    "If status shows pendingUserInputs, read the active question and options aloud, including which option is recommended and why. When the user chooses an option, call answer_orchestrator_question instead of sending a chat message. If the tool returns nextQuestion, read that next question and options aloud.",
    "If status shows pendingApprovals, ask for accept or decline. When the user decides, call respond_to_orchestrator_approval instead of sending a chat message.",
    "If status shows an actionable plan and the user asks about the plan, details, what will happen, or asks you to read it, call get_orchestrator_plan before describing more than the title. Do not invent plan details from status or memory.",
    "When reading a plan aloud, use get_orchestrator_plan.voiceSummary and sections to present a friendly outline: what will be built, major tasks, acceptance criteria, validation, and notable risks or exclusions. Keep it concise unless the user asks for the full markdown.",
    "If the user approves a proposed plan, call approve_orchestrator_plan, then call get_orchestrator_status before describing what started. Do not paste the plan into chat.",
    "For action requests, implementation requests, corrections, stops, or steering instructions, call send_orchestrator_message with a concise user-authored instruction. For demo self-presentation website requests, still send only the natural user request; never paste hidden demo requirements, asset paths, verification checklists, or raw orchestration tool names into chat.",
    "After send_orchestrator_message succeeds, do not immediately call get_orchestrator_status just to look for a plan. Orchestrate may still be preparing native intake or plan details. Say you started the request and will update the user when intake or the plan is ready.",
    "If the user is ambiguous, ask one short spoken clarification before sending anything, except when the request is an Orchestrate self-presentation website request covered above.",
    "Keep spoken replies short. Prefer one or two sentences unless the user asks for detail.",
  ].join("\n");
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((entry): entry is Record<string, unknown> => entry !== null)
    : [];
}

function buildOptionSpeech(option: Record<string, unknown>, index: number): string {
  const label = readOptionalString(option.label) ?? `Option ${index + 1}`;
  const description = readOptionalString(option.description);
  const recommended = option.recommended === true;
  const recommendationReason = readOptionalString(option.recommendationReason);
  return [
    `${index + 1}. ${label}`,
    description ? `- ${description}` : null,
    recommended ? "(recommended)" : null,
    recommendationReason ? `Recommended because ${recommendationReason}` : null,
  ]
    .filter((entry): entry is string => entry !== null)
    .join(" ");
}

function buildPendingUserInputReadyPrompt(status: unknown): string | null {
  const record = asRecord(status);
  const pendingInputs = readRecordArray(record?.pendingUserInputs);
  const pendingInput = pendingInputs[0];
  if (!pendingInput) return null;

  const questions = readRecordArray(pendingInput.questions);
  const question = questions[0];
  if (!question) {
    return [
      "Status now shows native Orchestrate intake is ready.",
      "Say: I have an intake question ready. I see it waiting in the composer; answer it there or tell me your choice.",
      "Do not say a plan is missing.",
    ].join("\n");
  }

  const header = readOptionalString(question.header);
  const questionText =
    readOptionalString(question.question) ?? "Which option should Orchestrate use?";
  const options = readRecordArray(question.options).map(buildOptionSpeech);
  const questionCount = questions.length;
  return [
    "Status now shows native Orchestrate intake is ready.",
    "Do not call tools. Do not say a plan has not been generated. Read the active intake question.",
    `Say that you have ${questionCount === 1 ? "an intake question" : `${questionCount} intake questions`} ready.`,
    header ? `Question header: ${header}` : null,
    `Question: ${questionText}`,
    options.length > 0 ? `Options:\n${options.join("\n")}` : null,
    "Tell the user they can answer by saying the recommended option, an option number, or the option label.",
  ]
    .filter((entry): entry is string => entry !== null)
    .join("\n");
}

function buildPendingApprovalReadyPrompt(status: unknown): string | null {
  const record = asRecord(status);
  const pendingApprovals = readRecordArray(record?.pendingApprovals);
  const pendingApproval = pendingApprovals[0];
  if (!pendingApproval) return null;

  const requestKind = readOptionalString(pendingApproval.requestKind);
  const detail = readOptionalString(pendingApproval.detail);
  return [
    "Status now shows an Orchestrate approval is ready.",
    "Do not call tools. Ask the user for a decision.",
    "Say: I need your approval before I continue.",
    requestKind ? `Approval kind: ${requestKind}.` : null,
    detail ? `Approval detail: ${detail}.` : null,
    "Tell the user they can say accept, accept for this session, decline, or cancel.",
  ]
    .filter((entry): entry is string => entry !== null)
    .join("\n");
}

function buildActionablePlanReadyPrompt(status: unknown): string | null {
  const record = asRecord(status);
  const attention = asRecord(record?.attention);
  const plans = asRecord(record?.plans);
  const latestPlan = asRecord(plans?.latest);
  const title = readOptionalString(latestPlan?.title) ?? "the plan";
  const actionable =
    attention?.hasActionablePlan === true ||
    attention?.needsApproval === true ||
    latestPlan?.actionable === true;
  if (!actionable) return null;
  return [
    "Status now shows an actionable Orchestrate plan is ready.",
    "Do not call tools. Say the plan is ready for approval.",
    `Plan title: ${title}.`,
    "Tell the user they can say approve, go ahead, implement, or ask you to read the plan.",
  ].join("\n");
}

function buildCheckpointReadyPrompt(status: unknown): string | null {
  return (
    buildPendingUserInputReadyPrompt(status) ??
    buildPendingApprovalReadyPrompt(status) ??
    buildActionablePlanReadyPrompt(status)
  );
}

function readCheckpointKey(status: unknown): string | null {
  const record = asRecord(status);
  if (!record) return null;

  const pendingInputs = readRecordArray(record.pendingUserInputs);
  const pendingInput = pendingInputs[0];
  if (pendingInput) {
    const activeQuestion = asRecord(pendingInput.activeQuestion);
    const firstQuestion = readRecordArray(pendingInput.questions)[0];
    const question = activeQuestion ?? firstQuestion ?? null;
    const requestId = readOptionalString(pendingInput.requestId) ?? "unknown-request";
    const questionId = readOptionalString(question?.id) ?? "unknown-question";
    const createdAt = readOptionalString(pendingInput.createdAt) ?? "";
    return `input:${requestId}:${questionId}:${createdAt}`;
  }

  const pendingApprovals = readRecordArray(record.pendingApprovals);
  const pendingApproval = pendingApprovals[0];
  if (pendingApproval) {
    const requestId = readOptionalString(pendingApproval.requestId) ?? "unknown-request";
    const requestKind = readOptionalString(pendingApproval.requestKind) ?? "approval";
    const createdAt = readOptionalString(pendingApproval.createdAt) ?? "";
    return `approval:${requestKind}:${requestId}:${createdAt}`;
  }

  const attention = asRecord(record.attention);
  const plans = asRecord(record.plans);
  const latestPlan = asRecord(plans?.latest);
  const actionable =
    attention?.hasActionablePlan === true ||
    attention?.needsApproval === true ||
    latestPlan?.actionable === true;
  if (actionable && latestPlan) {
    const planId =
      readOptionalString(latestPlan.id) ??
      readOptionalString(latestPlan.title) ??
      readOptionalString(latestPlan.createdAt) ??
      "latest";
    return `plan:${planId}`;
  }

  return null;
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const config = readVoiceAgentConfig(process.env, ctx);
    await postVoiceDiagnostic(config, ctx, {
      message: "Voice agent job accepted by LiveKit worker.",
      data: {
        realtimeModel: REALTIME_MODEL,
        voice: REALTIME_VOICE,
        maxToolSteps: MAX_TOOL_STEPS,
      },
    });
    try {
      const disposeFutureAudioSubscription = installFutureAudioPublicationSubscription(ctx.room, {
        onSubscribed: (publication, participant, reason) => {
          void postVoiceDiagnostic(config, ctx, {
            message: "Voice agent subscribed remote audio publication.",
            data: {
              reason,
              participantIdentity: participant.identity,
              publicationSid: publication.sid,
              publicationSource: publication.source,
              publicationKind: publication.kind,
            },
          });
        },
        onAlreadySubscribed: (publication, participant, reason) => {
          void postVoiceDiagnostic(config, ctx, {
            message: "Voice agent remote audio publication already subscribed.",
            data: {
              reason,
              participantIdentity: participant.identity,
              publicationSid: publication.sid,
              publicationSource: publication.source,
              publicationKind: publication.kind,
            },
          });
        },
        onSubscribeFailed: (publication, participant, reason, cause) => {
          void postVoiceDiagnostic(config, ctx, {
            level: "warn",
            message: "Voice agent failed to subscribe remote audio publication.",
            data: {
              reason,
              participantIdentity: participant.identity,
              publicationSid: publication.sid,
              publicationSource: publication.source,
              publicationKind: publication.kind,
              error: cause instanceof Error ? cause.message : String(cause),
            },
          });
        },
      });
      ctx.addShutdownCallback(async () => {
        disposeFutureAudioSubscription();
      });
      await ctx.connect(undefined, AutoSubscribe.AUDIO_ONLY);
      const existingAudioSubscriptions = subscribeExistingAudioPublications(ctx.room);
      await postVoiceDiagnostic(config, ctx, {
        message: "Voice agent checked existing remote audio publications.",
        data: { subscribedCount: existingAudioSubscriptions },
      });
    } catch (cause) {
      await postVoiceDiagnostic(config, ctx, {
        level: "error",
        message: "Voice agent failed to connect to LiveKit room.",
        data: { error: cause instanceof Error ? cause.message : String(cause) },
      });
      throw cause;
    }
    await postVoiceDiagnostic(config, ctx, {
      message: "Voice agent connected to LiveKit room.",
    });

    let listeningMode: VoiceListeningMode = "awake";
    let session: voice.AgentSession | null = null;
    let createAgentForCurrentMode: (() => voice.Agent) | null = null;
    let pendingSleepAuthorizationTimers: NodeJS.Timeout[] = [];
    let checkpointMonitorTimer: NodeJS.Timeout | null = null;
    let checkpointMonitorActive = false;
    let checkpointMonitorInFlight = false;
    let lastAnnouncedCheckpointKey: string | null = null;
    let latestAgentState: string | null = null;
    let latestUserState: string | null = null;

    function updateRealtimeToolChoice(toolChoice: llm.ToolChoice | null): void {
      try {
        session?.currentAgent.getActivityOrThrow().updateOptions({ toolChoice });
      } catch (cause) {
        void postVoiceDiagnostic(config, ctx, {
          level: "warn",
          message: "Voice agent failed to update realtime tool choice.",
          data: { error: cause instanceof Error ? cause.message : String(cause), toolChoice },
        });
      }
    }

    function applyReplyAuthorizationForMode(reason: string): void {
      if (!session) return;
      try {
        if (listeningMode === "asleep") {
          session.pauseReplyAuthorization();
        } else {
          session.resumeReplyAuthorization();
        }
        void postVoiceDiagnostic(config, ctx, {
          message: VOICE_REPLY_AUTHORIZATION_UPDATED_MESSAGE,
          data: { mode: listeningMode, reason },
        });
      } catch (cause) {
        void postVoiceDiagnostic(config, ctx, {
          level: "warn",
          message: "Voice agent failed to update reply authorization.",
          data: {
            error: cause instanceof Error ? cause.message : String(cause),
            mode: listeningMode,
            reason,
          },
        });
      }
    }

    function scheduleReplyAuthorizationReapply(reason: string): void {
      for (const timer of pendingSleepAuthorizationTimers) {
        clearTimeout(timer);
      }
      pendingSleepAuthorizationTimers = [50, 250, 1_000].map((delayMs) =>
        setTimeout(() => applyReplyAuthorizationForMode(`${reason}:${delayMs}ms`), delayMs),
      );
    }

    function isVoiceBusy(): boolean {
      return (
        latestUserState === "speaking" ||
        latestAgentState === "speaking" ||
        latestAgentState === "thinking"
      );
    }

    function stopCheckpointMonitor(reason: string): void {
      checkpointMonitorActive = false;
      if (checkpointMonitorTimer) {
        clearTimeout(checkpointMonitorTimer);
        checkpointMonitorTimer = null;
      }
      void postVoiceDiagnostic(config, ctx, {
        message: "Voice checkpoint monitor stopped.",
        data: { reason },
      });
    }

    function queueCheckpointUpdate(status: unknown, checkpointKey: string, reason: string): void {
      if (!session || listeningMode === "asleep" || isVoiceBusy()) return;
      const prompt = buildCheckpointReadyPrompt(status);
      if (!prompt) return;
      lastAnnouncedCheckpointKey = checkpointKey;
      session.generateReply({
        instructions: [
          prompt,
          "Keep this update concise and demo-friendly.",
          "Speak in first person as Orchestrate in voice mode. Do not describe Orchestrate as a third party.",
          "Do not mention polling, background checks, diagnostics, or internal status APIs.",
        ].join("\n"),
      });
      void postVoiceDiagnostic(config, ctx, {
        message: "Voice checkpoint monitor queued ready update.",
        data: { checkpointKey, reason },
      });
    }

    async function pollCheckpointStatus(reason: string): Promise<void> {
      if (!session || listeningMode === "asleep" || checkpointMonitorInFlight) return;
      checkpointMonitorInFlight = true;
      try {
        const status = await getOrchestratorStatus(config, ctx, {});
        const checkpointKey = readCheckpointKey(status);
        if (!checkpointKey || checkpointKey === lastAnnouncedCheckpointKey) return;
        queueCheckpointUpdate(status, checkpointKey, reason);
      } catch (cause) {
        void postVoiceDiagnostic(config, ctx, {
          level: "warn",
          message: "Voice checkpoint monitor status check failed.",
          data: { reason, error: cause instanceof Error ? cause.message : String(cause) },
        });
      } finally {
        checkpointMonitorInFlight = false;
      }
    }

    function scheduleCheckpointPoll(delayMs: number, reason: string): void {
      if (!checkpointMonitorActive) return;
      if (checkpointMonitorTimer) {
        clearTimeout(checkpointMonitorTimer);
      }
      checkpointMonitorTimer = setTimeout(() => {
        checkpointMonitorTimer = null;
        void pollCheckpointStatus(reason).finally(() => {
          scheduleCheckpointPoll(CHECKPOINT_POLL_INTERVAL_MS, "interval");
        });
      }, delayMs);
    }

    function startCheckpointMonitor(reason: string): void {
      if (checkpointMonitorActive) return;
      checkpointMonitorActive = true;
      scheduleCheckpointPoll(CHECKPOINT_INITIAL_POLL_DELAY_MS, reason);
      void postVoiceDiagnostic(config, ctx, {
        message: "Voice checkpoint monitor started.",
        data: {
          reason,
          initialDelayMs: CHECKPOINT_INITIAL_POLL_DELAY_MS,
          intervalMs: CHECKPOINT_POLL_INTERVAL_MS,
        },
      });
    }

    function clearCurrentUserTurn(reason: string): void {
      if (!session) return;
      try {
        session.clearUserTurn();
      } catch (cause) {
        void postVoiceDiagnostic(config, ctx, {
          level: "warn",
          message: "Voice agent failed to clear sleeping user turn.",
          data: {
            error: cause instanceof Error ? cause.message : String(cause),
            reason,
          },
        });
      }
    }

    async function interruptSleepingSpeech(reason: string): Promise<void> {
      if (!session || listeningMode !== "asleep") return;
      applyReplyAuthorizationForMode(reason);
      clearCurrentUserTurn(reason);
      try {
        await session.interrupt({ force: true }).await;
        await postVoiceDiagnostic(config, ctx, {
          message: VOICE_SLEEPING_SPEECH_INTERRUPTED_MESSAGE,
          data: { mode: listeningMode, reason },
        });
      } catch (cause) {
        await postVoiceDiagnostic(config, ctx, {
          level: "warn",
          message: "Voice agent failed to interrupt sleeping speech.",
          data: {
            error: cause instanceof Error ? cause.message : String(cause),
            mode: listeningMode,
            reason,
          },
        });
      }
    }

    async function ignoreToolCallWhileAsleep(
      toolName: string,
      args: unknown,
    ): Promise<{
      readonly ignored: true;
      readonly mode: VoiceListeningMode;
      readonly toolName: string;
      readonly spokenInstruction: string;
    }> {
      clearCurrentUserTurn(`sleeping-tool-${toolName}`);
      void interruptSleepingSpeech(`sleeping-tool-${toolName}`);
      await postVoiceDiagnostic(config, ctx, {
        message: "Voice sleeping mode blocked orchestrator tool call.",
        data: {
          mode: listeningMode,
          toolName,
          argsPreview: JSON.stringify(args).slice(0, 1_000),
        },
      });
      return {
        ignored: true,
        mode: listeningMode,
        toolName,
        spokenInstruction: "Do not speak. Stay asleep.",
      };
    }

    async function runAwakeTool<T>(
      toolName: string,
      args: unknown,
      run: () => Promise<T>,
    ): Promise<T | Awaited<ReturnType<typeof ignoreToolCallWhileAsleep>>> {
      if (listeningMode === "asleep") {
        return ignoreToolCallWhileAsleep(toolName, args);
      }
      return run();
    }

    async function setListeningMode(
      nextMode: VoiceListeningMode,
      input: {
        readonly reason: string;
        readonly transcript?: string | undefined;
        readonly matchedPhrase?: string | undefined;
        readonly hasTrailingRequest?: boolean | undefined;
        readonly requestAfterWake?: string | undefined;
      },
    ): Promise<{
      readonly mode: VoiceListeningMode;
      readonly changed: boolean;
      readonly spokenInstruction: string;
      readonly requestAfterWake?: string | undefined;
    }> {
      const changed = listeningMode !== nextMode;
      listeningMode = nextMode;

      applyReplyAuthorizationForMode(input.reason);

      await postVoiceDiagnostic(config, ctx, {
        message: VOICE_LISTENING_MODE_CHANGED_MESSAGE,
        data: {
          mode: nextMode,
          changed,
          reason: input.reason,
          ...(input.transcript ? { transcriptPreview: input.transcript.slice(0, 1_000) } : {}),
          ...(input.matchedPhrase ? { matchedPhrase: input.matchedPhrase } : {}),
          ...(input.hasTrailingRequest !== undefined
            ? { hasTrailingRequest: input.hasTrailingRequest }
            : {}),
          ...(input.requestAfterWake ? { requestAfterWake: input.requestAfterWake } : {}),
        },
      });

      if (session && createAgentForCurrentMode) {
        try {
          if (nextMode === "asleep") {
            clearCurrentUserTurn(input.reason);
            void session.interrupt().await.catch((cause: unknown) => {
              void postVoiceDiagnostic(config, ctx, {
                level: "warn",
                message: "Voice agent failed to stop active speech while entering sleep.",
                data: {
                  error: cause instanceof Error ? cause.message : String(cause),
                  mode: nextMode,
                },
              });
            });
          }
          session.updateAgent(createAgentForCurrentMode());
          applyReplyAuthorizationForMode(`${input.reason}:agent-updated`);
          scheduleReplyAuthorizationReapply(input.reason);
          updateRealtimeToolChoice(nextMode === "asleep" ? "required" : "auto");
        } catch (cause) {
          await postVoiceDiagnostic(config, ctx, {
            level: "warn",
            message: "Voice agent failed to apply listening mode to active session.",
            data: { error: cause instanceof Error ? cause.message : String(cause), mode: nextMode },
          });
        }
      }

      const spokenInstruction =
        nextMode === "asleep"
          ? "Do not produce a spoken reply. The UI already shows Sleeping."
          : input.requestAfterWake
            ? "Say exactly: I'm awake. Then continue with the user's request after waking."
            : "Say exactly: I'm awake.";

      return {
        mode: nextMode,
        changed,
        spokenInstruction,
        ...(input.requestAfterWake ? { requestAfterWake: input.requestAfterWake } : {}),
      };
    }

    const wakeSleepTools = {
      set_voice_listening_mode: llm.tool({
        description:
          "Change Orchestrate Voice wake/sleep mode. Use for explicit wake commands (wake up, start listening, hey Orchestrate) or sleep commands (sleep, go to sleep, stop listening, pause listening, mute yourself, go quiet). Never use this for normal orchestrator work.",
        parameters: z.object({
          mode: z
            .enum(["awake", "asleep"])
            .describe(
              "Set asleep for sleep/stop-listening commands; set awake for wake/listen commands.",
            ),
          reason: z.string().optional().describe("Short reason for the mode change."),
          transcript: z
            .string()
            .optional()
            .describe("The user transcript that contained the wake/sleep command, if available."),
          requestAfterWake: z
            .string()
            .optional()
            .describe("Only when waking: any real user request after the wake phrase."),
        }),
        execute: async (args) =>
          setListeningMode(args.mode, {
            reason: args.reason ?? "voice-tool",
            transcript: args.transcript,
            requestAfterWake: args.requestAfterWake,
          }),
      }),
    };

    const sleepingTools = {
      set_voice_listening_mode: wakeSleepTools.set_voice_listening_mode,
      ignore_sleeping_input: llm.tool({
        description:
          "Use for any user speech while Orchestrate Voice is asleep that is not an explicit wake command. This keeps the agent asleep and silent.",
        parameters: z.object({
          transcript: z
            .string()
            .optional()
            .describe("The non-wake transcript that should be ignored while asleep."),
        }),
        execute: async (args) => {
          clearCurrentUserTurn("sleeping-tool-ignore");
          void interruptSleepingSpeech("sleeping-tool-ignore");
          await postVoiceDiagnostic(config, ctx, {
            message: VOICE_SLEEPING_INPUT_IGNORED_MESSAGE,
            data: {
              mode: listeningMode,
              ...(args.transcript ? { transcriptPreview: args.transcript.slice(0, 1_000) } : {}),
            },
          });
          return {
            ignored: true,
            mode: listeningMode,
            spokenInstruction: "Do not speak. Stay asleep.",
          };
        },
      }),
    };

    const tools = {
      ...wakeSleepTools,
      get_orchestrator_status: llm.tool({
        description:
          "Read the current Orchestrate thread status, active run, worker/task state, pending user inputs, pending approvals, plans, and recent messages. Use this before answering any spoken question about status, progress, clarifying questions, user input, approvals, plans, agents/workers, browser validation, or whether work is done/stuck/running.",
        parameters: z.object({
          threadId: z
            .string()
            .optional()
            .describe("Optional Orchestrate thread id. Omit to use the current voice room."),
        }),
        execute: async (args) =>
          runAwakeTool("get_orchestrator_status", args, () =>
            getOrchestratorStatus(config, ctx, args),
          ),
      }),
      get_orchestrator_plan: llm.tool({
        description:
          "Fetch the persisted proposed plan details for this Orchestrate thread, including full markdown plus a voice-friendly summary. Use before reading or explaining plan details.",
        parameters: z.object({
          threadId: z
            .string()
            .optional()
            .describe("Optional Orchestrate thread id. Omit to use the current voice room."),
          planId: z
            .string()
            .optional()
            .describe("Optional proposed plan id. Omit for latest plan."),
        }),
        execute: async (args) =>
          runAwakeTool("get_orchestrator_plan", args, () => getOrchestratorPlan(config, ctx, args)),
      }),
      send_orchestrator_message: llm.tool({
        description:
          "Send an actionable spoken instruction into the Orchestrate chat as a user message. Use only when the user wants the orchestrator to act or be steered. Do not use this for answers to pending intake questions or approval decisions; check status first when the user may be responding to Orchestrate. After this succeeds, do not immediately call get_orchestrator_status just to look for a plan; native intake or plan creation can take a moment and the runtime will follow up.",
        parameters: z.object({
          threadId: z
            .string()
            .optional()
            .describe("Optional Orchestrate thread id. Omit to use the current voice room."),
          text: z
            .string()
            .min(1)
            .describe("The concise instruction that should appear in the orchestrator chat."),
          dispatchMode: z
            .enum(["queue", "steer"])
            .optional()
            .describe("Use steer for interruptions/corrections to active work; queue otherwise."),
        }),
        execute: async (args) =>
          runAwakeTool("send_orchestrator_message", args, async () => {
            const orchestratorText = enrichOrchestrateSelfPresentationWebsiteRequestForOrchestrator(
              args.text,
            );
            const result = await sendOrchestratorMessage(config, ctx, {
              ...args,
              text: orchestratorText,
            });
            return {
              result,
              orchestratorText,
              spokenInstruction:
                "Say: I started that in Orchestrate. I'll update you when intake or the plan is ready. Do not say a plan is missing.",
            };
          }),
      }),
      answer_orchestrator_question: llm.tool({
        description:
          "Answer the current native Orchestrate clarification/intake question by spoken option, number, letter, recommended choice, yes/no, or custom answer. Use this for short replies when pending user input may be active. This checks status and submits only when all questions in the active request are answered.",
        parameters: z.object({
          threadId: z
            .string()
            .optional()
            .describe("Optional Orchestrate thread id. Omit to use the current voice room."),
          requestId: z
            .string()
            .optional()
            .describe(
              "Optional pending user-input request id. Omit for the first pending request.",
            ),
          questionId: z
            .string()
            .optional()
            .describe("Optional question id. Omit for the first unanswered question."),
          option: z
            .string()
            .optional()
            .describe("Single spoken option, option number, letter, label, or 'recommended'."),
          options: z
            .array(z.string())
            .optional()
            .describe("Multiple spoken options for multi-select."),
          customAnswer: z
            .string()
            .optional()
            .describe("Free-form answer if none of the options fit."),
        }),
        execute: async (args) =>
          runAwakeTool("answer_orchestrator_question", args, () =>
            answerOrchestratorQuestion(config, ctx, args),
          ),
      }),
      respond_to_orchestrator_user_input: llm.tool({
        description:
          "Submit a complete answer map for a pending native Orchestrate user-input request. Prefer answer_orchestrator_question for normal spoken option selection.",
        parameters: z.object({
          threadId: z
            .string()
            .optional()
            .describe("Optional Orchestrate thread id. Omit to use the current voice room."),
          requestId: z.string().describe("Pending user-input request id."),
          answers: z.record(z.string(), z.unknown()).describe("Question id to answer map."),
        }),
        execute: async (args) =>
          runAwakeTool("respond_to_orchestrator_user_input", args, () =>
            respondToOrchestratorUserInput(config, ctx, args),
          ),
      }),
      respond_to_orchestrator_approval: llm.tool({
        description:
          "Respond to a pending Orchestrate provider approval request such as command approval. Use only after the user clearly says to accept, accept for session, decline, or cancel.",
        parameters: z.object({
          threadId: z
            .string()
            .optional()
            .describe("Optional Orchestrate thread id. Omit to use the current voice room."),
          requestId: z.string().describe("Pending approval request id."),
          decision: z.enum(["accept", "acceptForSession", "decline", "cancel"]),
        }),
        execute: async (args) =>
          runAwakeTool("respond_to_orchestrator_approval", args, () =>
            respondToOrchestratorApproval(config, ctx, args),
          ),
      }),
      approve_orchestrator_plan: llm.tool({
        description:
          "Approve the current actionable Orchestrate plan and start implementation using the persisted plan file. After this succeeds, call get_orchestrator_status before speaking so the user hears whether an active run or foreground agents have started. This must not paste the plan into chat.",
        parameters: z.object({
          threadId: z
            .string()
            .optional()
            .describe("Optional Orchestrate thread id. Omit to use the current voice room."),
          planId: z
            .string()
            .optional()
            .describe("Optional proposed plan id. Omit for latest plan."),
          text: z.string().optional().describe("Optional short approval message."),
        }),
        execute: async (args) =>
          runAwakeTool("approve_orchestrator_plan", args, () =>
            approveOrchestratorPlan(config, ctx, args),
          ),
      }),
    };

    function getToolsForCurrentMode(): llm.ToolContext {
      return listeningMode === "awake" ? tools : sleepingTools;
    }

    createAgentForCurrentMode = () =>
      new voice.Agent({
        instructions: buildInstructions(ctx, listeningMode),
        tools: getToolsForCurrentMode(),
      });

    const realtimeModelOptions = {
      inputAudioNoiseReduction: { type: "near_field" },
      maxResponseOutputTokens: MAX_RESPONSE_OUTPUT_TOKENS,
      maxSessionDuration: MAX_SESSION_DURATION_MS,
      model: REALTIME_MODEL,
      turnDetection: {
        type: "semantic_vad",
        eagerness: readTurnEagerness(),
        create_response: false,
        interrupt_response: true,
      },
      voice: REALTIME_VOICE,
    } as const;

    session = new voice.AgentSession({
      llm: new openai.realtime.RealtimeModel(realtimeModelOptions),
      maxToolSteps: MAX_TOOL_STEPS,
    });

    let controlledReplyTimer: NodeJS.Timeout | null = null;
    let controlledReplySequence = 0;

    function cancelControlledReply(reason: string): void {
      controlledReplySequence += 1;
      if (!controlledReplyTimer) return;
      clearTimeout(controlledReplyTimer);
      controlledReplyTimer = null;
      void postVoiceDiagnostic(config, ctx, {
        message: "Voice controlled reply canceled.",
        data: { reason },
      });
    }

    function scheduleControlledReply(transcript: string, reason: string): void {
      const trimmedTranscript = transcript.trim();
      if (!trimmedTranscript) return;
      if (!session || listeningMode === "asleep") return;
      cancelControlledReply(`${reason}:replace`);
      const sequence = controlledReplySequence;
      controlledReplyTimer = setTimeout(() => {
        controlledReplyTimer = null;
        if (!session || listeningMode === "asleep" || sequence !== controlledReplySequence) return;
        try {
          session.generateReply({
            instructions: buildControlledReplyInstructions(trimmedTranscript),
          });
          void postVoiceDiagnostic(config, ctx, {
            message: "Voice controlled reply queued.",
            data: {
              delayMs: CONTROLLED_REPLY_DELAY_MS,
              reason,
              transcriptPreview: trimmedTranscript.slice(0, 1_000),
            },
          });
        } catch (cause) {
          void postVoiceDiagnostic(config, ctx, {
            level: "warn",
            message: "Voice controlled reply failed to queue.",
            data: {
              error: cause instanceof Error ? cause.message : String(cause),
              reason,
              transcriptPreview: trimmedTranscript.slice(0, 1_000),
            },
          });
        }
      }, CONTROLLED_REPLY_DELAY_MS);
    }

    session.on(voice.AgentSessionEventTypes.UserStateChanged, (event) => {
      latestUserState = event.newState;
      void postVoiceDiagnostic(config, ctx, {
        message: `Voice user state changed to ${event.newState}.`,
        data: { oldState: event.oldState, newState: event.newState },
      });
    });
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (event) => {
      latestAgentState = event.newState;
      void postVoiceDiagnostic(config, ctx, {
        message: `Voice agent state changed to ${event.newState}.`,
        data: { oldState: event.oldState, newState: event.newState },
      });
      if (listeningMode === "asleep" && event.newState === "speaking") {
        void interruptSleepingSpeech("agent-state-speaking-while-asleep");
      }
    });
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (event) => {
      if (event.isFinal) {
        const command = classifyWakeSleepCommand(event.transcript, listeningMode);
        if (command) {
          if (command.type === "asleep") {
            cancelControlledReply("sleep-command");
          }
          void setListeningMode(command.type, {
            reason: "voice-transcript",
            transcript: event.transcript,
            matchedPhrase: command.matchedPhrase,
            hasTrailingRequest: command.hasTrailingRequest,
          }).then(() => {
            if (command.type === "awake") {
              scheduleControlledReply(event.transcript, "wake-command");
            }
          });
        } else if (listeningMode === "asleep") {
          cancelControlledReply("sleeping-transcript-non-wake");
          clearCurrentUserTurn("sleeping-transcript-non-wake");
          void interruptSleepingSpeech("sleeping-transcript-non-wake");
          void postVoiceDiagnostic(config, ctx, {
            message: VOICE_SLEEPING_INPUT_IGNORED_MESSAGE,
            data: {
              mode: listeningMode,
              transcriptPreview: event.transcript.slice(0, 1_000),
              normalizedTranscriptPreview: normalizeVoiceCommandText(event.transcript).slice(
                0,
                1_000,
              ),
            },
          });
        } else {
          scheduleControlledReply(event.transcript, "final-transcript");
        }
      }
      void postVoiceDiagnostic(config, ctx, {
        message: event.isFinal
          ? "Voice user transcript finalized."
          : "Voice user transcript updated.",
        data: {
          isFinal: event.isFinal,
          normalizedTranscriptPreview: normalizeVoiceCommandText(event.transcript).slice(0, 1_000),
          transcriptPreview: event.transcript.slice(0, 1_000),
          speakerId: event.speakerId,
          language: event.language,
        },
      });
    });
    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (event) => {
      void postVoiceDiagnostic(config, ctx, {
        message: "Voice conversation item added.",
        data: summarizeConversationItem(event.item),
      });
    });
    session.on(voice.AgentSessionEventTypes.FunctionToolsExecuted, (event) => {
      void postVoiceDiagnostic(config, ctx, {
        message: "Voice agent function tools executed.",
        data: {
          functionCalls: event.functionCalls.map((call) => ({
            id: call.callId,
            name: call.name,
          })),
          functionCallOutputs: event.functionCallOutputs.map((output) => ({
            callId: output.callId,
            outputPreview: JSON.stringify(output.output).slice(0, 1_000),
          })),
        },
      });
    });
    session.on(voice.AgentSessionEventTypes.Error, (event) => {
      void postVoiceDiagnostic(config, ctx, {
        level: "error",
        message: "Voice agent session emitted an error.",
        data: {
          error: event.error instanceof Error ? event.error.message : String(event.error),
        },
      });
    });
    session.on(voice.AgentSessionEventTypes.Close, (event) => {
      cancelControlledReply("session-closed");
      stopCheckpointMonitor("session-closed");
      void postVoiceDiagnostic(config, ctx, {
        level: "warn",
        message: "Voice agent session closed.",
        data: {
          reason: event.reason,
          error: event.error instanceof Error ? event.error.message : String(event.error ?? ""),
        },
      });
    });

    await postVoiceDiagnostic(config, ctx, {
      message: "Voice agent starting OpenAI Realtime session.",
      data: {
        realtimeModel: REALTIME_MODEL,
        turnEagerness: readTurnEagerness(),
        autoCreateResponse: false,
        controlledReplyDelayMs: CONTROLLED_REPLY_DELAY_MS,
        maxResponseOutputTokens: MAX_RESPONSE_OUTPUT_TOKENS,
        maxSessionDurationMs: MAX_SESSION_DURATION_MS,
      },
    });
    try {
      await session.start({
        room: ctx.room,
        agent: createAgentForCurrentMode(),
      });
    } catch (cause) {
      await postVoiceDiagnostic(config, ctx, {
        level: "error",
        message: "Voice agent failed to start OpenAI Realtime session.",
        data: { error: cause instanceof Error ? cause.message : String(cause) },
      });
      throw cause;
    }
    await postVoiceDiagnostic(config, ctx, {
      message: "Voice agent OpenAI Realtime session started.",
    });

    session.generateReply({
      instructions: "Say exactly: Voice mode is connected to Orchestrate.",
    });
    startCheckpointMonitor("session-started");
    await postVoiceDiagnostic(config, ctx, {
      message: "Voice agent queued initial greeting.",
    });
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: AGENT_NAME,
    initializeProcessTimeout: INITIALIZE_PROCESS_TIMEOUT_MS,
    // Reliability beats cold-start speed for demos: stale warmed children can
    // leave LiveKit jobs stuck before the agent enters the room. Keep the pool
    // disabled by default; set ORCHESTRATE_VOICE_IDLE_JOB_PROCESSES > 0 only
    // when explicitly testing warmed child startup.
    numIdleProcesses: IDLE_JOB_PROCESSES > 0 ? IDLE_JOB_PROCESSES : -1,
  }),
);
