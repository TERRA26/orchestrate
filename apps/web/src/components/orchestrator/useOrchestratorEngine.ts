import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  DEFAULT_RUNTIME_MODE,
  type ModelSelection,
  type ProviderInteractionMode,
  type ProviderKind,
  type ProviderModelOptions,
  type RuntimeMode,
  type ServerProvider,
  type ServerProviderModel,
  ThreadId,
} from "@t3tools/contracts";

import { newCommandId, newMessageId, newThreadId } from "~/lib/utils";
import { useSettings } from "~/hooks/useSettings";
import { deriveEffectiveComposerModelState } from "~/composerDraftStore";
import {
  createEmbeddedBrowserAutomationSession,
  createEmbeddedBrowserSessionFromUrl,
  type EmbeddedBrowserSession,
  getEmbeddedBrowserAddress,
  resolveEmbeddedBrowserAbsoluteUrl,
  useEmbeddedBrowserStateStore,
} from "~/embeddedBrowserStateStore";
import { getCustomModelOptionsByProvider } from "~/modelSelection";
import { useProjectById, useThreadById } from "~/storeSelectors";
import { useStore } from "~/store";
import { readNativeApi } from "~/nativeApi";
import { serverConfigQueryOptions } from "~/lib/serverReactQuery";
import { getProviderModels, resolveSelectableProvider } from "~/providerModels";
import {
  ORCHESTRATOR_DRAFT_THREAD_ID,
  type ActiveOrchestratorRun,
  type OrchestratorMessage,
  useOrchestratorStateStore,
  useOrchestratorThreadState,
} from "~/orchestratorStateStore";
import {
  derivePhase,
  deriveWorkLogEntries,
  inferCheckpointTurnCountByTurnId,
} from "~/session-logic";
import { waitForStartedServerThread } from "../ChatView.logic";
import {
  buildAdHocBrowserValidationRun,
  buildChecklistItemsFromTaskDraft,
  buildRouterUserPrompt,
  buildBrowserValidationUserPrompt,
  buildRecoveredOrchestratorMessages,
  buildDelegationInstruction,
  buildReviewUserPrompt,
  classifyReviewArtifactsReadiness,
  extractEmbeddedBrowserPresentationCandidates,
  formatBrowserValidationActionSummary,
  formatReviewArtifactsWaitMessage,
  formatTaskDraftForDisplay,
  mergeChecklistWithReview,
  ORCHESTRATOR_BROWSER_VALIDATION_SYSTEM_PROMPT,
  ORCHESTRATOR_MAX_ITERATIONS,
  ORCHESTRATOR_MAX_REVIEW_FILE_CHARS,
  ORCHESTRATOR_MAX_REVIEW_FILE_SNAPSHOTS,
  ORCHESTRATOR_MAX_REVIEW_WORK_LOG_DETAIL_CHARS,
  ORCHESTRATOR_MAX_REVIEW_WORK_LOG_ENTRIES,
  ORCHESTRATOR_REVIEW_SYSTEM_PROMPT,
  ORCHESTRATOR_ROUTER_SYSTEM_PROMPT,
  parseBrowserValidationPlannerAction,
  parseOrchestratorRouterDecision,
  parseOrchestratorReviewDecision,
  resolveOrchestratorConversationThreadId,
  resolveTurnReviewContext,
  selectBrowserValidationCandidate,
  shouldHandleAsDirectBrowserValidationRequest,
  shouldRequireBrowserValidation,
  truncateForReview,
  validateReviewerFollowUpInstruction,
  type BrowserValidationResult,
  type ReviewFileSnapshot,
  type ReviewWorkLogSnapshot,
} from "../OrchestratorPanel.logic";
import { getComposerProviderState } from "../chat/composerProviderRegistry";
import type { ComposerProviderState } from "../chat/composerProviderRegistry";
import { countOrchestratorChecklistItems } from "../../orchestratorTypes";
import type { OrchestratorChecklistItem } from "../../orchestratorTypes";
import type { Thread } from "~/types";
import type { ProjectId } from "@t3tools/contracts";
import type { BrowserAction } from "@t3tools/contracts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OrchestratorStatus = "idle" | "thinking" | "sending" | "waiting" | "reviewing";

type ReviewArtifactsResult =
  | {
      status: "ready";
      artifactSource: "checkpoint" | "work-log";
      agentReport: string;
      diffPatch: string | null;
      fileSnapshots: ReviewFileSnapshot[];
      workLogEntries: ReviewWorkLogSnapshot[];
      turnId: string | null;
    }
  | {
      status: "failed";
      reason: string;
      agentReport: string;
      turnId: string | null;
    };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORCHESTRATOR_REVIEW_ARTIFACT_POLL_MS = 250;
const ORCHESTRATOR_REVIEW_CHECKPOINT_GRACE_MS = 5_000;
const ORCHESTRATOR_REVIEW_ARTIFACT_WAIT_MS = 30_000;
const ORCHESTRATOR_BROWSER_VALIDATION_MAX_STEPS = 20;
const EMPTY_PROVIDERS: ReadonlyArray<ServerProvider> = [];
const EMPTY_MODEL_OPTIONS_BY_PROVIDER: Record<
  ProviderKind,
  ReadonlyArray<{ slug: string; name: string }>
> = {
  codex: [],
  claudeAgent: [],
};

// ---------------------------------------------------------------------------
// Helpers (module-level, not in hook)
// ---------------------------------------------------------------------------

function waitForReviewArtifacts(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function collectFallbackChangedFilePaths(
  workLogEntries: ReadonlyArray<ReviewWorkLogSnapshot>,
): string[] {
  const ordered = new Set<string>();
  for (const entry of workLogEntries) {
    for (const path of entry.changedFiles ?? []) {
      const normalized = path.trim();
      if (normalized.length === 0) {
        continue;
      }
      ordered.add(normalized);
      if (ordered.size >= ORCHESTRATOR_MAX_REVIEW_FILE_SNAPSHOTS) {
        return [...ordered];
      }
    }
  }
  return [...ordered];
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface OrchestratorEngineResult {
  currentThreadId: ThreadId;
  messages: OrchestratorMessage[];
  input: string;
  status: OrchestratorStatus;
  statusDetail: string | null;
  isBusy: boolean;
  canSend: boolean;
  requirementsChecklist: ReadonlyArray<OrchestratorChecklistItem>;
  activeRun: ActiveOrchestratorRun | null;
  managedThread: Thread | undefined;
  agentPhase: ReturnType<typeof derivePhase>;
  latestActivity: { summary: string } | null;
  threadBrowserSession: EmbeddedBrowserSession | null;
  isThreadBrowserSessionVisible: boolean;
  selectedProvider: ProviderKind;
  selectedModel: string;
  selectedProviderModels: ReadonlyArray<ServerProviderModel>;
  modelOptionsByProvider: Record<ProviderKind, ReadonlyArray<{ slug: string; name: string }>>;
  composerModelOptions: ReturnType<typeof deriveEffectiveComposerModelState>["modelOptions"];
  composerProviderState: ComposerProviderState;
  providers: ReadonlyArray<ServerProvider>;
  send: (text: string) => Promise<void>;
  setInput: (text: string) => void;
  handleModelChange: (provider: ProviderKind, model: string) => void;
  handleStartNewChat: () => Promise<void>;
  handleToggleBrowserPreview: () => void;
  handlePromptChangeFromTraits: (prompt: string) => void;
  handleProviderModelOptionsChange: (
    nextOptions: ProviderModelOptions[ProviderKind] | undefined,
  ) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOrchestratorEngine(): OrchestratorEngineResult {
  // -- Active thread observation --
  const navigate = useNavigate();
  const settings = useSettings();
  const routeThreadId = useParams({
    strict: false,
    select: (params: Record<string, string | undefined>) =>
      params.threadId ? ThreadId.makeUnsafe(params.threadId) : null,
  });
  const routeThread = useThreadById(routeThreadId);
  const [pendingCreatedThreadId, setPendingCreatedThreadId] = useState<ThreadId | null>(null);
  const firstProjectId = useStore((store) => store.projects[0]?.id ?? null);
  const appendOrchestratorMessage = useOrchestratorStateStore((store) => store.appendMessage);
  const hydrateThreadMessagesIfEmpty = useOrchestratorStateStore(
    (store) => store.hydrateThreadMessagesIfEmpty,
  );
  const moveThreadState = useOrchestratorStateStore((store) => store.moveThreadState);
  const resetThreadConversation = useOrchestratorStateStore(
    (store) => store.resetThreadConversation,
  );
  const setOrchestratorActiveRun = useOrchestratorStateStore((store) => store.setActiveRun);
  const setOrchestratorRequirementsChecklist = useOrchestratorStateStore(
    (store) => store.setRequirementsChecklist,
  );
  const setOrchestratorModelSelection = useOrchestratorStateStore(
    (store) => store.setModelSelection,
  );
  const setOrchestratorPrompt = useOrchestratorStateStore((store) => store.setPrompt);
  const closeThreadBrowserSession = useEmbeddedBrowserStateStore(
    (store) => store.closeThreadSession,
  );
  const openThreadBrowserSession = useEmbeddedBrowserStateStore((store) => store.openThreadSession);
  const setThreadBrowserSessionVisible = useEmbeddedBrowserStateStore(
    (store) => store.setThreadSessionVisible,
  );
  const [preferDraftConversation, setPreferDraftConversation] = useState(routeThreadId === null);

  useEffect(() => {
    if (routeThreadId && pendingCreatedThreadId === routeThreadId) {
      setPendingCreatedThreadId(null);
    }
  }, [pendingCreatedThreadId, routeThreadId]);

  useEffect(() => {
    if (routeThreadId) {
      setPreferDraftConversation(false);
      return;
    }
    if (!pendingCreatedThreadId) {
      setPreferDraftConversation(true);
    }
  }, [pendingCreatedThreadId, routeThreadId]);

  const currentThreadId = resolveOrchestratorConversationThreadId({
    routeThreadId,
    pendingCreatedThreadId,
    preferDraftConversation,
    draftThreadId: ORCHESTRATOR_DRAFT_THREAD_ID,
  });
  const threadBrowserSession = useEmbeddedBrowserStateStore((store) =>
    currentThreadId ? (store.threadSessionsById[currentThreadId] ?? null) : null,
  );
  const isThreadBrowserSessionVisible = useEmbeddedBrowserStateStore((store) =>
    currentThreadId ? (store.threadSessionVisibilityById[currentThreadId] ?? true) : true,
  );
  const orchestratorThreadState = useOrchestratorThreadState(currentThreadId);
  const messages = orchestratorThreadState.messages;
  const input = orchestratorThreadState.prompt;
  const activeRun = orchestratorThreadState.activeRun;
  const requirementsChecklist = orchestratorThreadState.requirementsChecklist;
  const recoveredMessages = useMemo(
    () =>
      routeThreadId && routeThread
        ? buildRecoveredOrchestratorMessages(routeThread).map((message, index) => ({
            id: `recovered:${routeThreadId}:${index}`,
            role: message.role,
            content: message.content,
            timestamp: message.timestamp,
          }))
        : [],
    [routeThread, routeThreadId],
  );

  useEffect(() => {
    if (!routeThreadId || messages.length > 0 || recoveredMessages.length === 0) {
      return;
    }
    hydrateThreadMessagesIfEmpty(routeThreadId, recoveredMessages);
  }, [hydrateThreadMessagesIfEmpty, messages.length, recoveredMessages, routeThreadId]);

  // -- Server config --
  const serverConfigQuery = useQuery(serverConfigQueryOptions());
  const providers = serverConfigQuery.data?.providers ?? EMPTY_PROVIDERS;

  // -- Model selection --
  const currentThreadModelSelection = routeThread?.modelSelection ?? null;
  const currentProject = useProjectById(
    routeThread?.projectId ?? activeRun?.projectId ?? firstProjectId ?? null,
  );
  const selectedProviderByThread = orchestratorThreadState.activeProvider ?? null;
  const selectedProvider = resolveSelectableProvider(
    providers,
    selectedProviderByThread ??
      currentThreadModelSelection?.provider ??
      currentProject?.defaultModelSelection?.provider ??
      "codex",
  );
  const composerModelState = useMemo(
    () =>
      deriveEffectiveComposerModelState({
        draft: {
          modelSelectionByProvider: orchestratorThreadState.modelSelectionByProvider,
          activeProvider: orchestratorThreadState.activeProvider,
        },
        selectedProvider,
        threadModelSelection: currentThreadModelSelection,
        projectModelSelection: currentProject?.defaultModelSelection ?? null,
        customModelsByProvider: {
          codex: settings.providers.codex.customModels,
          claudeAgent: settings.providers.claudeAgent.customModels,
        },
      }),
    [
      currentProject?.defaultModelSelection,
      currentThreadModelSelection,
      orchestratorThreadState.activeProvider,
      orchestratorThreadState.modelSelectionByProvider,
      selectedProvider,
      settings,
    ],
  );
  const selectedModel = composerModelState.selectedModel;
  const composerModelOptions = composerModelState.modelOptions;
  const selectedProviderModels = useMemo(
    () => getProviderModels(providers, selectedProvider),
    [providers, selectedProvider],
  );
  const composerProviderState = useMemo(
    () =>
      getComposerProviderState({
        provider: selectedProvider,
        model: selectedModel,
        models: selectedProviderModels,
        prompt: input,
        modelOptions: composerModelOptions,
      }),
    [composerModelOptions, input, selectedModel, selectedProvider, selectedProviderModels],
  );
  const selectedModelOptionsForDispatch = composerProviderState.modelOptionsForDispatch;
  const selectedModelSelection = useMemo<ModelSelection>(
    () => ({
      provider: selectedProvider,
      model: selectedModel,
      ...(selectedModelOptionsForDispatch ? { options: selectedModelOptionsForDispatch } : {}),
    }),
    [selectedModel, selectedModelOptionsForDispatch, selectedProvider],
  );
  const modelOptionsByProvider = useMemo(
    () =>
      providers.length > 0
        ? getCustomModelOptionsByProvider(settings, providers, selectedProvider, selectedModel)
        : EMPTY_MODEL_OPTIONS_BY_PROVIDER,
    [providers, selectedModel, selectedProvider, settings],
  );
  const handleModelChange = useCallback(
    (provider: ProviderKind, model: string) => {
      const existingOptions = orchestratorThreadState.modelSelectionByProvider[provider]?.options;
      setOrchestratorModelSelection(currentThreadId, {
        provider,
        model,
        ...(existingOptions ? { options: existingOptions } : {}),
      });
    },
    [
      currentThreadId,
      orchestratorThreadState.modelSelectionByProvider,
      setOrchestratorModelSelection,
    ],
  );
  const handleProviderModelOptionsChange = useCallback(
    (nextOptions: ProviderModelOptions[ProviderKind] | undefined) => {
      setOrchestratorModelSelection(currentThreadId, {
        provider: selectedProvider,
        model: selectedModel,
        ...(nextOptions ? { options: nextOptions } : {}),
      });
    },
    [currentThreadId, selectedModel, selectedProvider, setOrchestratorModelSelection],
  );

  // -- Orchestrator state --

  const [statusByThreadId, setStatusByThreadId] = useState<
    Partial<Record<ThreadId, OrchestratorStatus>>
  >({});
  const [statusDetailByThreadId, setStatusDetailByThreadId] = useState<
    Partial<Record<ThreadId, string>>
  >({});
  const previousThreadIdRef = useRef(currentThreadId);
  const resumeReviewKeyRef = useRef<string | null>(null);
  const lastProgressMessageByThreadRef = useRef<Partial<Record<ThreadId, string>>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const status = statusByThreadId[currentThreadId] ?? "idle";
  const statusDetail = statusDetailByThreadId[currentThreadId] ?? null;
  const isBusy = status !== "idle";
  const canUseSelectedModel = providers.length > 0;

  const setStatusForThread = useCallback(
    (threadId: ThreadId, nextStatus: OrchestratorStatus, nextDetail: string | null = null) => {
      setStatusByThreadId((prev) => {
        if (nextStatus === "idle") {
          if (prev[threadId] === undefined) {
            return prev;
          }
          const next = { ...prev };
          delete next[threadId];
          return next;
        }
        if (prev[threadId] === nextStatus) {
          return prev;
        }
        return { ...prev, [threadId]: nextStatus };
      });
      setStatusDetailByThreadId((prev) => {
        if (nextStatus === "idle" || !nextDetail) {
          if (prev[threadId] === undefined) {
            return prev;
          }
          const next = { ...prev };
          delete next[threadId];
          return next;
        }
        if (prev[threadId] === nextDetail) {
          return prev;
        }
        return { ...prev, [threadId]: nextDetail };
      });
      if (nextStatus === "idle") {
        delete lastProgressMessageByThreadRef.current[threadId];
      }
    },
    [],
  );

  const moveThreadStatus = useCallback((fromThreadId: ThreadId, toThreadId: ThreadId) => {
    setStatusByThreadId((prev) => {
      if (fromThreadId === toThreadId) {
        return prev;
      }
      const currentStatus = prev[fromThreadId];
      if (!currentStatus) {
        return prev;
      }
      const next: Partial<Record<ThreadId, OrchestratorStatus>> = {
        ...prev,
        [toThreadId]: currentStatus,
      };
      delete next[fromThreadId];
      return next;
    });
    setStatusDetailByThreadId((prev) => {
      if (fromThreadId === toThreadId) {
        return prev;
      }
      const currentDetail = prev[fromThreadId];
      if (!currentDetail) {
        return prev;
      }
      const next: Partial<Record<ThreadId, string>> = {
        ...prev,
        [toThreadId]: currentDetail,
      };
      delete next[fromThreadId];
      return next;
    });
    const currentMessage = lastProgressMessageByThreadRef.current[fromThreadId];
    if (currentMessage) {
      lastProgressMessageByThreadRef.current[toThreadId] = currentMessage;
      delete lastProgressMessageByThreadRef.current[fromThreadId];
    }
  }, []);

  useEffect(() => {
    if (previousThreadIdRef.current === currentThreadId) {
      return;
    }
    previousThreadIdRef.current = currentThreadId;
  }, [currentThreadId]);

  const managedThreadId =
    currentThreadId === ORCHESTRATOR_DRAFT_THREAD_ID
      ? (activeRun?.threadId ?? null)
      : currentThreadId;
  const managedThread = useThreadById(managedThreadId);
  const agentPhase = useMemo(
    () => derivePhase(managedThread?.session ?? null),
    [managedThread?.session],
  );
  const latestActivity = managedThread?.activities?.at(-1) ?? null;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // -- Helper: add a message --
  const addMessage = useCallback(
    (threadId: ThreadId, role: OrchestratorMessage["role"], content: string) => {
      appendOrchestratorMessage(threadId, {
        id: crypto.randomUUID(),
        role,
        content,
        timestamp: new Date().toISOString(),
      });
    },
    [appendOrchestratorMessage],
  );

  // -- Helper: send instruction to a thread --
  const sendToThread = useCallback(
    async (
      threadId: ThreadId,
      text: string,
      runtimeMode: RuntimeMode,
      interactionMode: ProviderInteractionMode,
    ) => {
      const api = readNativeApi();
      if (!api) throw new Error("API not available");
      await api.orchestration.dispatchCommand({
        type: "thread.turn.start",
        commandId: newCommandId(),
        threadId,
        message: { messageId: newMessageId(), role: "user", text, attachments: [] },
        runtimeMode,
        interactionMode,
        createdAt: new Date().toISOString(),
      });
    },
    [],
  );

  const addProgressMessage = useCallback(
    (threadId: ThreadId, message: string | null | undefined) => {
      const nextMessage = message?.trim();
      if (!nextMessage) {
        return;
      }
      if (lastProgressMessageByThreadRef.current[threadId] === nextMessage) {
        return;
      }
      lastProgressMessageByThreadRef.current[threadId] = nextMessage;
      addMessage(threadId, "thinking", nextMessage);
    },
    [addMessage],
  );

  // -- Helper: call orchestrator LLM --
  const callOrchestratorLLM = useCallback(
    async (systemPrompt: string, userContent: string) => {
      if (providers.length === 0) throw new Error("No model selected");
      const api = readNativeApi();
      if (!api) throw new Error("API not available");
      const result = await api.orchestration.complete({
        provider: selectedModelSelection.provider,
        model: selectedModelSelection.model,
        ...(selectedModelSelection.options ? { modelOptions: selectedModelSelection.options } : {}),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      });
      return result.text.trim();
    },
    [providers.length, selectedModelSelection],
  );

  // -- Helper: create a new thread and return its IDs --
  const createThread = useCallback(
    async (title: string): Promise<{ threadId: ThreadId; projectId: ProjectId }> => {
      const api = readNativeApi();
      const projectId = currentProject?.id ?? firstProjectId;
      if (!api || !projectId) {
        throw new Error("Cannot create thread: missing project or model");
      }
      const threadId = newThreadId();
      await api.orchestration.dispatchCommand({
        type: "thread.create",
        commandId: newCommandId(),
        threadId,
        projectId,
        title,
        modelSelection: selectedModelSelection,
        runtimeMode: DEFAULT_RUNTIME_MODE,
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        createdAt: new Date().toISOString(),
      });
      return { threadId, projectId };
    },
    [currentProject?.id, firstProjectId, selectedModelSelection],
  );

  const collectReviewArtifacts = useCallback(
    async (
      run: ActiveOrchestratorRun,
      onProgress?: (detail: string) => void,
    ): Promise<ReviewArtifactsResult> => {
      const api = readNativeApi();
      if (!api) throw new Error("API not available");
      const deadline = Date.now() + ORCHESTRATOR_REVIEW_ARTIFACT_WAIT_MS;
      const fallbackDeadline = Date.now() + ORCHESTRATOR_REVIEW_CHECKPOINT_GRACE_MS;
      let lastPendingReason = "Checkpoint metadata for the reviewed turn is still loading.";
      let lastProgressDetail: string | null = null;
      let didReportWorkLogFallback = false;

      while (true) {
        const state = useStore.getState();
        const thread = state.threads.find((candidate) => candidate.id === run.threadId) ?? null;
        const projectCwd =
          state.projects.find((candidate) => candidate.id === run.projectId)?.cwd ?? null;
        const reviewContext = resolveTurnReviewContext(thread ?? undefined);
        const workLogEntries = deriveWorkLogEntries(
          thread?.activities ?? [],
          reviewContext.turnId ?? undefined,
        )
          .slice(-ORCHESTRATOR_MAX_REVIEW_WORK_LOG_ENTRIES)
          .map((entry): ReviewWorkLogSnapshot => {
            const snapshot: ReviewWorkLogSnapshot = {
              label: entry.label,
              createdAt: entry.createdAt,
              tone: entry.tone,
            };
            if (entry.command) {
              snapshot.command = entry.command;
            }
            if (entry.detail) {
              snapshot.detail = truncateForReview(
                entry.detail,
                ORCHESTRATOR_MAX_REVIEW_WORK_LOG_DETAIL_CHARS,
              );
            }
            if (entry.changedFiles) {
              snapshot.changedFiles = entry.changedFiles;
            }
            if (entry.toolTitle) {
              snapshot.toolTitle = entry.toolTitle;
            }
            if (entry.itemType) {
              snapshot.itemType = entry.itemType;
            }
            return snapshot;
          });
        const fallbackChangedFiles = collectFallbackChangedFilePaths(workLogEntries);
        const readiness = classifyReviewArtifactsReadiness({
          thread,
          projectCwd,
          runStartedAt: run.startedAt,
          reviewContext,
          fallbackChangedFileCount: fallbackChangedFiles.length,
          workLogEntryCount: workLogEntries.length,
          allowWorkLogFallback: Date.now() >= fallbackDeadline,
        });
        const agentReport = reviewContext.agentReport || "Agent completed the task.";

        if (readiness.status === "failed") {
          return {
            status: "failed",
            reason: readiness.reason,
            agentReport,
            turnId: reviewContext.turnId,
          };
        }

        if (readiness.status === "pending") {
          lastPendingReason = readiness.reason;
          const progressDetail = formatReviewArtifactsWaitMessage(readiness.reason);
          if (progressDetail !== lastProgressDetail) {
            lastProgressDetail = progressDetail;
            onProgress?.(progressDetail);
          }
          if (Date.now() >= deadline) {
            return {
              status: "failed",
              reason: `Timed out waiting for review artifacts. ${lastPendingReason}`,
              agentReport,
              turnId: reviewContext.turnId,
            };
          }
          await waitForReviewArtifacts(ORCHESTRATOR_REVIEW_ARTIFACT_POLL_MS);
          continue;
        }

        if (!thread || !projectCwd) {
          return {
            status: "failed",
            reason:
              "Review artifacts became unavailable before the orchestrator could inspect them.",
            agentReport,
            turnId: reviewContext.turnId,
          };
        }

        let diffPatch: string | null = null;
        let filesToRead: ReviewFileSnapshot[] = [];

        if (readiness.source === "checkpoint" && reviewContext.turnSummary) {
          const checkpointTurnCountByTurnId = inferCheckpointTurnCountByTurnId(
            thread.turnDiffSummaries,
          );
          const checkpointTurnCount =
            reviewContext.turnSummary.checkpointTurnCount ??
            checkpointTurnCountByTurnId[reviewContext.turnSummary.turnId];

          if (typeof checkpointTurnCount === "number" && checkpointTurnCount > 0) {
            try {
              if (checkpointTurnCount === 1) {
                const result = await api.orchestration.getFullThreadDiff({
                  threadId: thread.id,
                  toTurnCount: checkpointTurnCount,
                });
                diffPatch = result.diff;
              } else {
                const result = await api.orchestration.getTurnDiff({
                  threadId: thread.id,
                  fromTurnCount: checkpointTurnCount - 1,
                  toTurnCount: checkpointTurnCount,
                });
                diffPatch = result.diff;
              }
            } catch {
              diffPatch = null;
            }
          }

          filesToRead = reviewContext.turnSummary.files
            .slice(0, ORCHESTRATOR_MAX_REVIEW_FILE_SNAPSHOTS)
            .map((file) => ({
              path: file.path,
              kind: file.kind,
              additions: file.additions,
              deletions: file.deletions,
            }));
        } else {
          filesToRead = fallbackChangedFiles.map((path) => ({ path }));
          if (!didReportWorkLogFallback) {
            didReportWorkLogFallback = true;
            onProgress?.(
              "Checkpoint metadata did not arrive. Falling back to work-log file-change evidence for review...",
            );
          }
        }

        const fileSnapshots = await Promise.all(
          filesToRead.map(async (file): Promise<ReviewFileSnapshot> => {
            try {
              const result = await api.projects.readFile({
                cwd: projectCwd,
                relativePath: file.path,
              });
              return {
                path: file.path,
                kind: file.kind,
                additions: file.additions,
                deletions: file.deletions,
                contents: truncateForReview(result.contents, ORCHESTRATOR_MAX_REVIEW_FILE_CHARS),
              };
            } catch (error) {
              return {
                path: file.path,
                kind: file.kind,
                additions: file.additions,
                deletions: file.deletions,
                readError: error instanceof Error ? error.message : String(error),
              };
            }
          }),
        );
        return {
          status: "ready",
          artifactSource: readiness.source ?? "work-log",
          agentReport,
          diffPatch,
          fileSnapshots,
          workLogEntries,
          turnId: reviewContext.turnId,
        };
      }
    },
    [],
  );

  const runBrowserValidation = useCallback(
    async (validationInput: {
      run: ActiveOrchestratorRun;
      agentReport: string;
      presentationCandidates: ReadonlyArray<{
        source: string;
        title: string;
        url: string;
      }>;
    }): Promise<BrowserValidationResult | null> => {
      if (!shouldRequireBrowserValidation(validationInput.run.userRequest)) {
        return null;
      }

      const previewCandidate = selectBrowserValidationCandidate(
        validationInput.presentationCandidates,
      );
      if (!previewCandidate) {
        return {
          status: "blocked",
          url: "",
          ready: null,
          summary:
            "Browser validation could not start because no preview URL or in-app path was detected for this visual task.",
          missingRequirements: [
            "Expose a local preview URL or served path for the web experience and keep it accessible so the orchestrator can validate it in the browser.",
          ],
          steps: [],
        };
      }

      const absolutePreviewUrl = resolveEmbeddedBrowserAbsoluteUrl(previewCandidate.url);
      if (!absolutePreviewUrl) {
        return {
          status: "blocked",
          url: previewCandidate.url,
          ready: null,
          summary:
            "Browser validation could not resolve the preview target to an absolute URL that the browser automation runtime can open.",
          missingRequirements: [
            "Return a concrete localhost URL or served route that can be opened directly for browser validation.",
          ],
          steps: [],
        };
      }

      const api = readNativeApi();
      if (!api) {
        return {
          status: "blocked",
          url: absolutePreviewUrl,
          ready: null,
          summary:
            "The browser validation runtime is unavailable because the native API is missing.",
          missingRequirements: [],
          steps: [],
        };
      }

      openThreadBrowserSession(
        validationInput.run.threadId,
        createEmbeddedBrowserSessionFromUrl({
          source: "orchestrator",
          title: previewCandidate.title,
          url: previewCandidate.url,
        }),
      );
      addProgressMessage(
        validationInput.run.threadId,
        `Opening browser validation preview: ${absolutePreviewUrl}`,
      );

      let sessionId: string | null = null;
      try {
        const opened = (await api.browser.openSession({ url: absolutePreviewUrl })) as any;
        sessionId = opened.sessionId;
        let observation = opened.observation;
        const steps: BrowserValidationResult["steps"] = [];
        let consecutiveErrors = 0;
        openThreadBrowserSession(
          validationInput.run.threadId,
          createEmbeddedBrowserAutomationSession({
            source: "orchestrator",
            title: previewCandidate.title,
            observation,
          }),
        );

        for (let index = 1; index <= ORCHESTRATOR_BROWSER_VALIDATION_MAX_STEPS; index += 1) {
          // -- LLM call with retry --
          let raw: string;
          try {
            raw = await callOrchestratorLLM(
              ORCHESTRATOR_BROWSER_VALIDATION_SYSTEM_PROMPT,
              buildBrowserValidationUserPrompt({
                userRequest: validationInput.run.userRequest,
                delegatedInstruction: validationInput.run.delegatedInstruction,
                agentReport: validationInput.agentReport,
                previewUrl: absolutePreviewUrl,
                requirementsChecklist: validationInput.run.requirementsChecklist,
                previousSteps: steps,
                observation,
              }),
            );
          } catch (llmError) {
            // Retry once on timeout
            addProgressMessage(
              validationInput.run.threadId,
              `Browser validation step ${index}: LLM call failed (${llmError instanceof Error ? llmError.message : "unknown"}), retrying...`,
            );
            try {
              raw = await callOrchestratorLLM(
                ORCHESTRATOR_BROWSER_VALIDATION_SYSTEM_PROMPT,
                buildBrowserValidationUserPrompt({
                  userRequest: validationInput.run.userRequest,
                  delegatedInstruction: validationInput.run.delegatedInstruction,
                  agentReport: validationInput.agentReport,
                  previewUrl: absolutePreviewUrl,
                  requirementsChecklist: validationInput.run.requirementsChecklist,
                  previousSteps: steps,
                  observation,
                }),
              );
            } catch (retryError) {
              consecutiveErrors += 1;
              if (consecutiveErrors >= 2) {
                const errorSummary = `Browser validation aborted after ${consecutiveErrors} consecutive LLM failures: ${retryError instanceof Error ? retryError.message : "unknown"}`;
                addProgressMessage(validationInput.run.threadId, errorSummary);
                return {
                  status: "blocked" as const,
                  url: absolutePreviewUrl,
                  ready: null,
                  summary: errorSummary,
                  missingRequirements: [],
                  steps,
                };
              }
              steps.push({
                index,
                actionSummary: `Skipped: LLM timeout (${retryError instanceof Error ? retryError.message : "unknown"})`,
                url: observation.url,
                title: observation.title,
              });
              continue;
            }
          }
          consecutiveErrors = 0;

          let nextStep;
          try {
            nextStep = parseBrowserValidationPlannerAction(raw, {
              availableTargetIds: observation.targets.map((target: any) => target.id),
            });
          } catch (parseError) {
            addProgressMessage(
              validationInput.run.threadId,
              `Browser validation step ${index}: Could not parse LLM response, skipping step.`,
            );
            steps.push({
              index,
              actionSummary: `Skipped: parse error (${parseError instanceof Error ? parseError.message : "unknown"})`,
              url: observation.url,
              title: observation.title,
            });
            continue;
          }

          if (nextStep.kind === "finish") {
            if (
              nextStep.checklistUpdates &&
              Object.keys(nextStep.checklistUpdates).length > 0 &&
              validationInput.run.requirementsChecklist.length > 0
            ) {
              const updatedChecklist = validationInput.run.requirementsChecklist.map((item) => {
                for (const [label, checklistStatus] of Object.entries(nextStep.checklistUpdates)) {
                  if (
                    item.label.toLowerCase().includes(label.toLowerCase()) ||
                    label.toLowerCase().includes(item.label.toLowerCase())
                  ) {
                    return { ...item, status: checklistStatus as "passed" | "failed" };
                  }
                }
                return item;
              });
              setOrchestratorRequirementsChecklist(validationInput.run.threadId, updatedChecklist);
            }
            addProgressMessage(
              validationInput.run.threadId,
              nextStep.ready
                ? `Browser validation passed: ${nextStep.summary}`
                : `Browser validation found issues: ${nextStep.summary}`,
            );
            return {
              status: "validated",
              url: absolutePreviewUrl,
              ready: nextStep.ready,
              summary: nextStep.summary,
              missingRequirements: nextStep.missingRequirements,
              steps,
            };
          }

          const action: BrowserAction =
            nextStep.action.kind === "navigate"
              ? {
                  ...nextStep.action,
                  url:
                    resolveEmbeddedBrowserAbsoluteUrl(nextStep.action.url) ?? nextStep.action.url,
                }
              : nextStep.action;
          const actionSummary = formatBrowserValidationActionSummary({
            action,
            observation,
            reason: nextStep.reason,
          });
          addProgressMessage(
            validationInput.run.threadId,
            `Browser validation step ${index}/${ORCHESTRATOR_BROWSER_VALIDATION_MAX_STEPS}: ${actionSummary}`,
          );
          setStatusForThread(
            validationInput.run.threadId,
            "reviewing",
            `Browser validation step ${index}/${ORCHESTRATOR_BROWSER_VALIDATION_MAX_STEPS}: ${actionSummary}`,
          );

          // -- Browser action with error recovery --
          try {
            const acted = (await api.browser.act({
              sessionId: opened.sessionId,
              action,
            })) as any;
            observation = acted.observation;
            openThreadBrowserSession(
              validationInput.run.threadId,
              createEmbeddedBrowserAutomationSession({
                source: "orchestrator",
                title: previewCandidate.title,
                observation,
                lastActionSummary: actionSummary,
              }),
            );
          } catch (actError) {
            addProgressMessage(
              validationInput.run.threadId,
              `Browser action failed: ${actError instanceof Error ? actError.message : "unknown"}. Continuing validation with current observation.`,
            );
          }
          steps.push({
            index,
            actionSummary,
            url: observation.url,
            title: observation.title,
          });
        }

        const exhaustedSummary =
          "Browser validation reached its step limit before it could confidently confirm the preview was working.";
        addProgressMessage(validationInput.run.threadId, exhaustedSummary);
        return {
          status: "validated",
          url: absolutePreviewUrl,
          ready: false,
          summary: exhaustedSummary,
          missingRequirements: [],
          steps,
        };
      } catch (error) {
        return {
          status: "blocked",
          url: absolutePreviewUrl,
          ready: null,
          summary:
            error instanceof Error
              ? error.message
              : "Browser validation failed before the orchestrator could finish interacting with the preview.",
          missingRequirements: [],
          steps: [],
        };
      } finally {
        if (sessionId) {
          await api.browser.closeSession({ sessionId }).catch(() => undefined);
        }
      }
    },
    [
      addProgressMessage,
      callOrchestratorLLM,
      openThreadBrowserSession,
      setOrchestratorRequirementsChecklist,
      setStatusForThread,
    ],
  );

  const runDirectBrowserValidation = useCallback(
    async (directValidationInput: {
      conversationThreadId: ThreadId;
      userRequest: string;
      previousStatus: OrchestratorStatus;
      previousStatusDetail: string | null;
    }) => {
      const validationThread = managedThread ?? routeThread ?? null;
      if (!validationThread) {
        addMessage(
          directValidationInput.conversationThreadId,
          "orchestrator",
          "There is no managed thread open yet for browser validation. Finish or open a thread with a preview URL first.",
        );
        setStatusForThread(directValidationInput.conversationThreadId, "idle");
        return;
      }

      const adHocValidationContext = buildAdHocBrowserValidationRun({
        thread: validationThread,
        messages,
        requirementsChecklist,
        fallbackUserRequest: directValidationInput.userRequest,
      });
      const validationContext = activeRun ?? adHocValidationContext.run;

      if (!activeRun) {
        addProgressMessage(
          directValidationInput.conversationThreadId,
          adHocValidationContext.summary,
        );
      }
      setStatusForThread(
        directValidationInput.conversationThreadId,
        "reviewing",
        "Using computer use to validate the current preview...",
      );
      addProgressMessage(
        directValidationInput.conversationThreadId,
        "Using computer use to validate the current preview...",
      );

      let artifacts;
      try {
        artifacts = await collectReviewArtifacts(validationContext, (detail) => {
          setStatusForThread(directValidationInput.conversationThreadId, "reviewing", detail);
          addProgressMessage(directValidationInput.conversationThreadId, detail);
        });
      } catch (error) {
        addMessage(
          directValidationInput.conversationThreadId,
          "orchestrator",
          `Browser validation could not inspect the latest turn: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        setStatusForThread(directValidationInput.conversationThreadId, "idle");
        return;
      }

      if (artifacts.status !== "ready") {
        addMessage(
          directValidationInput.conversationThreadId,
          "orchestrator",
          `Browser validation could not proceed: ${artifacts.reason}`,
        );
        setStatusForThread(
          directValidationInput.conversationThreadId,
          activeRun && directValidationInput.previousStatus !== "idle"
            ? directValidationInput.previousStatus
            : "idle",
          activeRun && directValidationInput.previousStatus !== "idle"
            ? directValidationInput.previousStatusDetail
            : null,
        );
        return;
      }

      const presentationCandidates = extractEmbeddedBrowserPresentationCandidates({
        agentReport: artifacts.agentReport,
        diffPatch: artifacts.diffPatch,
        fileSnapshots: artifacts.fileSnapshots,
        workLogEntries: artifacts.workLogEntries,
      });

      const browserValidation = await runBrowserValidation({
        run: validationContext,
        agentReport: artifacts.agentReport,
        presentationCandidates,
      });

      let finalSummary =
        browserValidation?.ready === true
          ? `Browser validation completed: ${browserValidation.summary}`
          : browserValidation
            ? `Browser validation found issues: ${browserValidation.summary}`
            : "Browser validation did not run because this task did not expose a browser-validated preview.";

      if (browserValidation) {
        try {
          const reviewInput = buildReviewUserPrompt({
            userRequest: validationContext.userRequest,
            delegatedInstruction: validationContext.delegatedInstruction,
            agentReport: artifacts.agentReport,
            requirementsChecklist: validationContext.requirementsChecklist,
            artifactSource: artifacts.artifactSource,
            workLogEntries: artifacts.workLogEntries,
            diffPatch: artifacts.diffPatch,
            fileSnapshots: artifacts.fileSnapshots,
            browserValidation,
            presentationCandidates,
          });
          const raw = await callOrchestratorLLM(ORCHESTRATOR_REVIEW_SYSTEM_PROMPT, reviewInput);
          const reviewDecision = parseOrchestratorReviewDecision(raw, { presentationCandidates });
          const updatedChecklist = mergeChecklistWithReview({
            checklist: validationContext.requirementsChecklist,
            review: reviewDecision,
          });
          setOrchestratorRequirementsChecklist(
            directValidationInput.conversationThreadId,
            updatedChecklist,
          );
          if (updatedChecklist.length > 0) {
            const checklistCounts = countOrchestratorChecklistItems(updatedChecklist);
            addProgressMessage(
              directValidationInput.conversationThreadId,
              `Quality gate status: ${checklistCounts.passed}/${updatedChecklist.length} passed, ${checklistCounts.failed} failed, ${checklistCounts.pending} pending.`,
            );
          }
          if (reviewDecision.presentation) {
            openThreadBrowserSession(
              directValidationInput.conversationThreadId,
              createEmbeddedBrowserSessionFromUrl({
                source: "orchestrator",
                title: reviewDecision.presentation.title,
                url: reviewDecision.presentation.url,
              }),
            );
          }
          finalSummary = reviewDecision.summary;
        } catch {
          // Keep the browser-validation summary when the reviewer output cannot be parsed safely.
        }
      }

      addMessage(directValidationInput.conversationThreadId, "orchestrator", finalSummary);
      setStatusForThread(
        directValidationInput.conversationThreadId,
        activeRun && directValidationInput.previousStatus !== "idle"
          ? directValidationInput.previousStatus
          : "idle",
        activeRun && directValidationInput.previousStatus !== "idle"
          ? directValidationInput.previousStatusDetail
          : null,
      );
    },
    [
      activeRun,
      addMessage,
      addProgressMessage,
      callOrchestratorLLM,
      collectReviewArtifacts,
      managedThread,
      messages,
      openThreadBrowserSession,
      requirementsChecklist,
      routeThread,
      runBrowserValidation,
      setOrchestratorRequirementsChecklist,
      setStatusForThread,
    ],
  );

  // -- Review agent output and decide whether to iterate --
  const reviewAgentOutput = useCallback(
    async (run: ActiveOrchestratorRun) => {
      setStatusForThread(run.threadId, "reviewing", "Inspecting changed files and work log...");
      addProgressMessage(run.threadId, "Reviewing the completed turn against the changed files...");

      let artifacts;
      try {
        artifacts = await collectReviewArtifacts(run, (detail) => {
          setStatusForThread(run.threadId, "reviewing", detail);
          addProgressMessage(run.threadId, detail);
        });
      } catch (error) {
        addMessage(
          run.threadId,
          "orchestrator",
          `Failed to inspect the completed turn: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        setOrchestratorActiveRun(run.threadId, null);
        setStatusForThread(run.threadId, "idle");
        return;
      }

      if (artifacts.status === "failed") {
        addProgressMessage(
          run.threadId,
          `Checkpoint metadata unavailable: ${artifacts.reason} Proceeding with browser validation using available evidence.`,
        );
      }

      let reviewDecision;
      let browserValidation: BrowserValidationResult | null = null;
      try {
        const presentationCandidates = extractEmbeddedBrowserPresentationCandidates({
          agentReport: artifacts.agentReport,
          diffPatch: artifacts.status === "failed" ? null : artifacts.diffPatch,
          fileSnapshots: artifacts.status === "failed" ? [] : artifacts.fileSnapshots,
          workLogEntries: artifacts.status === "failed" ? [] : artifacts.workLogEntries,
        });
        browserValidation = await runBrowserValidation({
          run,
          agentReport: artifacts.agentReport,
          presentationCandidates,
        });
        const reviewInput = buildReviewUserPrompt({
          userRequest: run.userRequest,
          delegatedInstruction: run.delegatedInstruction,
          agentReport: artifacts.agentReport,
          requirementsChecklist: run.requirementsChecklist,
          artifactSource: artifacts.status === "ready" ? artifacts.artifactSource : "work-log",
          workLogEntries: artifacts.status === "ready" ? artifacts.workLogEntries : [],
          diffPatch: artifacts.status === "ready" ? artifacts.diffPatch : null,
          fileSnapshots: artifacts.status === "ready" ? artifacts.fileSnapshots : [],
          browserValidation,
          presentationCandidates,
        });
        const raw = await callOrchestratorLLM(ORCHESTRATOR_REVIEW_SYSTEM_PROMPT, reviewInput);
        reviewDecision = parseOrchestratorReviewDecision(raw, { presentationCandidates });
      } catch {
        addMessage(
          run.threadId,
          "agent-result",
          artifacts.agentReport.length > 500
            ? `${artifacts.agentReport.slice(0, 500)}...`
            : artifacts.agentReport,
        );
        setOrchestratorActiveRun(run.threadId, null);
        setStatusForThread(run.threadId, "idle");
        return;
      }

      const browserValidationRequired = shouldRequireBrowserValidation(run.userRequest);
      if (
        browserValidationRequired &&
        browserValidation?.status === "blocked" &&
        browserValidation.missingRequirements.length === 0
      ) {
        addMessage(
          run.threadId,
          "orchestrator",
          `Browser validation could not complete: ${browserValidation.summary}`,
        );
        setOrchestratorActiveRun(run.threadId, null);
        setStatusForThread(run.threadId, "idle");
        return;
      }

      if (
        browserValidationRequired &&
        browserValidation?.ready !== true &&
        reviewDecision.sufficient
      ) {
        reviewDecision = {
          ...reviewDecision,
          sufficient: false,
          summary:
            browserValidation?.summary ??
            "Browser validation did not confirm the preview was working.",
          missingRequirements: [
            ...reviewDecision.missingRequirements,
            ...(browserValidation?.missingRequirements ?? []),
          ],
          followUpInstruction:
            reviewDecision.followUpInstruction ??
            "Fix the browser-facing experience so it loads and behaves correctly in the preview, then return the required implementation report.",
        };
      }

      if (
        browserValidationRequired &&
        browserValidation?.missingRequirements.length &&
        !reviewDecision.sufficient &&
        !reviewDecision.followUpInstruction
      ) {
        reviewDecision = {
          ...reviewDecision,
          summary: browserValidation.summary,
          missingRequirements: [
            ...reviewDecision.missingRequirements,
            ...browserValidation.missingRequirements,
          ],
          followUpInstruction:
            "Fix the browser-facing experience so it can be opened and validated in the orchestrator preview, then return the required implementation report.",
        };
      }

      const updatedChecklist = mergeChecklistWithReview({
        checklist: run.requirementsChecklist,
        review: reviewDecision,
      });
      setOrchestratorRequirementsChecklist(run.threadId, updatedChecklist);
      if (updatedChecklist.length > 0) {
        const checklistCounts = countOrchestratorChecklistItems(updatedChecklist);
        addProgressMessage(
          run.threadId,
          `Quality gate status: ${checklistCounts.passed}/${updatedChecklist.length} passed, ${checklistCounts.failed} failed, ${checklistCounts.pending} pending.`,
        );
      }

      const followUpValidation = validateReviewerFollowUpInstruction(
        reviewDecision.followUpInstruction,
      );
      if (!reviewDecision.sufficient && !followUpValidation.valid) {
        addMessage(
          run.threadId,
          "orchestrator",
          `Review stopped before another agent iteration because ${followUpValidation.reason}. Summary: ${reviewDecision.summary}`,
        );
        setOrchestratorActiveRun(run.threadId, null);
        setStatusForThread(run.threadId, "idle");
        return;
      }
      if (!reviewDecision.sufficient && !reviewDecision.followUpInstruction) {
        addMessage(
          run.threadId,
          "orchestrator",
          `Review could not produce a safe follow-up instruction for the agent. Summary: ${reviewDecision.summary}`,
        );
        setOrchestratorActiveRun(run.threadId, null);
        setStatusForThread(run.threadId, "idle");
        return;
      }

      if (reviewDecision.sufficient) {
        addMessage(run.threadId, "agent-result", reviewDecision.summary);
        if (reviewDecision.presentation) {
          const browserSession = createEmbeddedBrowserSessionFromUrl({
            source: "orchestrator",
            title: reviewDecision.presentation.title,
            url: reviewDecision.presentation.url,
          });
          openThreadBrowserSession(run.threadId, browserSession);
          addMessage(
            run.threadId,
            "thinking",
            `Opened preview in embedded browser: ${getEmbeddedBrowserAddress(browserSession)}`,
          );
        }
        setOrchestratorActiveRun(run.threadId, null);
        setStatusForThread(run.threadId, "idle");
        return;
      }

      addMessage(
        run.threadId,
        "orchestrator",
        `Iteration ${run.iteration} review: ${reviewDecision.summary}`,
      );

      const latestManagedThread =
        useStore.getState().threads.find((candidate) => candidate.id === run.threadId) ?? null;

      if (!latestManagedThread || run.iteration >= ORCHESTRATOR_MAX_ITERATIONS) {
        addMessage(
          run.threadId,
          "orchestrator",
          run.iteration >= ORCHESTRATOR_MAX_ITERATIONS
            ? "Stopped after reaching the orchestrator iteration limit."
            : "The managed agent thread is no longer available for follow-up work.",
        );
        setOrchestratorActiveRun(run.threadId, null);
        setStatusForThread(run.threadId, "idle");
        return;
      }

      const followUpInstruction = buildDelegationInstruction({
        instruction:
          reviewDecision.followUpInstruction ??
          "Continue the task, close the remaining gaps, and return the required detailed report.",
        requirementsChecklist: updatedChecklist
          .filter((item) => item.status !== "passed")
          .map((item) => item.label),
        acceptanceCriteria: reviewDecision.missingRequirements,
      });

      addMessage(run.threadId, "orchestrator", followUpInstruction);
      setStatusForThread(
        run.threadId,
        "sending",
        "Sending review feedback to the managed agent...",
      );
      addProgressMessage(run.threadId, "Sending review feedback to the managed agent...");

      try {
        const startedAt = new Date().toISOString();
        await sendToThread(
          latestManagedThread.id,
          followUpInstruction,
          latestManagedThread.runtimeMode,
          latestManagedThread.interactionMode,
        );
        setOrchestratorActiveRun(run.threadId, {
          ...run,
          delegatedInstruction: followUpInstruction,
          requirementsChecklist: updatedChecklist,
          iteration: run.iteration + 1,
          startedAt,
        });
        setStatusForThread(run.threadId, "waiting", "Waiting for the managed agent to continue...");
        addProgressMessage(
          run.threadId,
          "Follow-up sent. Waiting for the managed agent to continue...",
        );
      } catch (error) {
        addMessage(
          run.threadId,
          "orchestrator",
          `Failed to send follow-up to agent: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        setOrchestratorActiveRun(run.threadId, null);
        setStatusForThread(run.threadId, "idle");
      }
    },
    [
      addMessage,
      addProgressMessage,
      callOrchestratorLLM,
      collectReviewArtifacts,
      runBrowserValidation,
      sendToThread,
      setOrchestratorActiveRun,
      setOrchestratorRequirementsChecklist,
      setStatusForThread,
      openThreadBrowserSession,
    ],
  );

  // -- Watch for agent turn completion --
  useEffect(() => {
    if (!activeRun) {
      resumeReviewKeyRef.current = null;
      if (status === "waiting" || status === "reviewing") {
        setStatusForThread(currentThreadId, "idle");
      }
      return;
    }

    if (agentPhase === "running" || agentPhase === "connecting") {
      const detail =
        agentPhase === "connecting"
          ? "Connecting to the managed agent session..."
          : activeRun.iteration > 1
            ? `Managed agent is working on iteration ${activeRun.iteration}...`
            : "Managed agent is working on the first pass...";
      setStatusForThread(currentThreadId, "waiting", detail);
      addProgressMessage(currentThreadId, detail);
      return;
    }

    const latestTurn = managedThread?.latestTurn;
    if (!latestTurn?.completedAt) {
      setStatusForThread(currentThreadId, "waiting", "Waiting for the managed agent to start...");
      return;
    }
    if (latestTurn.requestedAt < activeRun.startedAt) {
      return;
    }

    const reviewKey = `${activeRun.threadId}:${latestTurn.turnId}:${activeRun.iteration}`;
    if (resumeReviewKeyRef.current === reviewKey) {
      return;
    }
    resumeReviewKeyRef.current = reviewKey;
    void reviewAgentOutput(activeRun);
  }, [
    activeRun,
    addProgressMessage,
    agentPhase,
    currentThreadId,
    managedThread?.latestTurn,
    reviewAgentOutput,
    setStatusForThread,
    status,
  ]);

  // -- Core flow: send --
  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (providers.length === 0) {
        addMessage(
          currentThreadId,
          "orchestrator",
          "No providers available. Check your server configuration.",
        );
        return;
      }
      const api = readNativeApi();
      if (!api) {
        addMessage(
          currentThreadId,
          "orchestrator",
          "Server connection not available. Try refreshing.",
        );
        return;
      }

      // Save the text so we can restore on error
      const savedText = trimmed;

      let conversationThreadId = currentThreadId;
      const previousStatus = status;
      const previousStatusDetail = statusDetail;
      try {
        setOrchestratorPrompt(currentThreadId, "");
        addMessage(conversationThreadId, "user", trimmed);
        setStatusForThread(conversationThreadId, "thinking", "Understanding the request...");
        addProgressMessage(conversationThreadId, "Understanding the request...");

        if (
          shouldHandleAsDirectBrowserValidationRequest({
            userRequest: trimmed,
            hasManagedThread: Boolean(managedThread ?? routeThread),
          })
        ) {
          await runDirectBrowserValidation({
            conversationThreadId,
            userRequest: trimmed,
            previousStatus,
            previousStatusDetail,
          });
          return;
        }

        let delegatedInstruction: string | null = null;
        let nextRequirementsChecklist = requirementsChecklist;
        try {
          const rawTask = await callOrchestratorLLM(
            ORCHESTRATOR_ROUTER_SYSTEM_PROMPT,
            buildRouterUserPrompt({
              userRequest: trimmed,
              activeRun: activeRun
                ? {
                    iteration: activeRun.iteration,
                    startedAt: activeRun.startedAt,
                    userRequest: activeRun.userRequest,
                  }
                : null,
              requirementsChecklist,
              managedThreadTitle: managedThread?.title ?? null,
              statusDetail,
              latestAgentReport: resolveTurnReviewContext(managedThread ?? routeThread ?? undefined)
                .agentReport,
              recentMessages: messages.slice(-8),
            }),
          );
          const routerDecision = parseOrchestratorRouterDecision(rawTask);

          if (routerDecision.kind === "answer") {
            addMessage(conversationThreadId, "orchestrator", routerDecision.response);
            if (routerDecision.shouldContinueRun && previousStatus !== "idle") {
              setStatusForThread(conversationThreadId, previousStatus, previousStatusDetail);
            } else {
              setStatusForThread(conversationThreadId, "idle");
            }
            return;
          }

          const taskDraft = routerDecision.taskDraft;
          const checklistItems = buildChecklistItemsFromTaskDraft(taskDraft);
          nextRequirementsChecklist = checklistItems;
          setStatusForThread(
            conversationThreadId,
            "thinking",
            "Breaking the request into an agent brief...",
          );
          addProgressMessage(conversationThreadId, "Breaking the request into an agent brief...");
          setOrchestratorRequirementsChecklist(conversationThreadId, checklistItems);
          if (checklistItems.length > 0) {
            addProgressMessage(
              conversationThreadId,
              `Mapped ${checklistItems.length} testable requirements for the quality gate.`,
            );
          }
          addMessage(conversationThreadId, "orchestrator", formatTaskDraftForDisplay(taskDraft));
          delegatedInstruction = buildDelegationInstruction(taskDraft);
        } catch (error) {
          setStatusForThread(conversationThreadId, "idle");
          addMessage(
            conversationThreadId,
            "orchestrator",
            `Error: ${error instanceof Error ? error.message : "Failed to plan the task"}`,
          );
          setOrchestratorPrompt(currentThreadId, savedText);
          return;
        }

        if (!delegatedInstruction) {
          setStatusForThread(conversationThreadId, "idle");
          addMessage(
            conversationThreadId,
            "orchestrator",
            "The orchestrator could not determine whether to answer directly or delegate the request.",
          );
          setOrchestratorPrompt(currentThreadId, savedText);
          return;
        }

        let targetThreadId = preferDraftConversation ? null : (routeThread?.id ?? null);
        let targetProjectId = preferDraftConversation ? null : (routeThread?.projectId ?? null);
        let targetRuntimeMode = preferDraftConversation
          ? DEFAULT_RUNTIME_MODE
          : (routeThread?.runtimeMode ?? DEFAULT_RUNTIME_MODE);
        let targetInteractionMode: ProviderInteractionMode = preferDraftConversation
          ? "default"
          : (routeThread?.interactionMode ?? "default");
        let createdNewThread = false;

        if (!targetThreadId || !targetProjectId) {
          if (!currentProject?.id && !firstProjectId) {
            addMessage(
              conversationThreadId,
              "orchestrator",
              "No project available to create a thread.",
            );
            setStatusForThread(conversationThreadId, "idle");
            setOrchestratorPrompt(currentThreadId, savedText);
            return;
          }

          setStatusForThread(
            conversationThreadId,
            "sending",
            "Creating the managed agent thread...",
          );
          addProgressMessage(conversationThreadId, "Creating a managed agent thread...");
          try {
            const title = trimmed.length > 50 ? `${trimmed.slice(0, 47)}...` : trimmed;
            const createdThread = await createThread(title);
            targetThreadId = createdThread.threadId;
            targetProjectId = createdThread.projectId;
            targetRuntimeMode = DEFAULT_RUNTIME_MODE;
            targetInteractionMode = "default";
            createdNewThread = true;
            moveThreadState(conversationThreadId, targetThreadId);
            moveThreadStatus(conversationThreadId, targetThreadId);
            setPendingCreatedThreadId(targetThreadId);
            conversationThreadId = targetThreadId;
            setStatusForThread(
              conversationThreadId,
              "sending",
              "Managed agent thread created. Preparing the first instruction...",
            );
            addProgressMessage(
              conversationThreadId,
              "Managed agent thread created. Preparing the first instruction...",
            );
          } catch (error) {
            setStatusForThread(conversationThreadId, "idle");
            addMessage(
              conversationThreadId,
              "orchestrator",
              `Failed to create thread: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
            setOrchestratorPrompt(currentThreadId, savedText);
            return;
          }
        }

        if (!targetThreadId || !targetProjectId) {
          addMessage(
            conversationThreadId,
            "orchestrator",
            "The orchestrator could not resolve a managed thread.",
          );
          setStatusForThread(conversationThreadId, "idle");
          setOrchestratorPrompt(currentThreadId, savedText);
          return;
        }

        setStatusForThread(
          conversationThreadId,
          "sending",
          createdNewThread
            ? "Sending the implementation brief to the new managed thread..."
            : "Sending the implementation brief to the managed agent...",
        );
        addProgressMessage(
          conversationThreadId,
          createdNewThread
            ? "Sending the implementation brief to the new managed thread..."
            : "Sending the implementation brief to the managed agent...",
        );
        const startedAt = new Date().toISOString();
        try {
          await sendToThread(
            targetThreadId,
            delegatedInstruction,
            targetRuntimeMode,
            targetInteractionMode,
          );
        } catch (error) {
          if (createdNewThread) {
            const innerApi = readNativeApi();
            if (innerApi) {
              await innerApi.orchestration
                .dispatchCommand({
                  type: "thread.delete",
                  commandId: newCommandId(),
                  threadId: targetThreadId,
                })
                .catch(() => undefined);
            }
            moveThreadState(targetThreadId, ORCHESTRATOR_DRAFT_THREAD_ID);
            moveThreadStatus(targetThreadId, ORCHESTRATOR_DRAFT_THREAD_ID);
            setPendingCreatedThreadId(null);
            conversationThreadId = ORCHESTRATOR_DRAFT_THREAD_ID;
          }
          setOrchestratorActiveRun(conversationThreadId, null);
          setStatusForThread(conversationThreadId, "idle");
          addMessage(
            conversationThreadId,
            "orchestrator",
            `Failed to send to agent: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
          setOrchestratorPrompt(currentThreadId, savedText);
          return;
        }

        setOrchestratorActiveRun(conversationThreadId, {
          threadId: targetThreadId,
          projectId: targetProjectId,
          userRequest: trimmed,
          delegatedInstruction,
          requirementsChecklist: nextRequirementsChecklist,
          iteration: 1,
          startedAt,
        });
        setStatusForThread(
          conversationThreadId,
          "waiting",
          createdNewThread
            ? "Instruction sent. Waiting for the new thread to sync into the workspace..."
            : "Instruction sent. Waiting for the managed agent to start...",
        );
        addProgressMessage(
          conversationThreadId,
          createdNewThread
            ? "Instruction sent. Waiting for the new thread to sync into the workspace..."
            : "Instruction sent. Waiting for the managed agent to start...",
        );

        if (createdNewThread) {
          const started = await waitForStartedServerThread(targetThreadId);
          if (!started) {
            setStatusForThread(
              conversationThreadId,
              "waiting",
              "Waiting for the new agent thread to finish syncing into the workspace...",
            );
            addProgressMessage(
              conversationThreadId,
              "Waiting for the new agent thread to finish syncing into the workspace...",
            );
          } else {
            addProgressMessage(
              conversationThreadId,
              "Managed thread synced. Opening the agent thread so you can follow progress...",
            );
          }
          try {
            await navigate({ to: "/$threadId", params: { threadId: targetThreadId } });
          } catch (error) {
            addMessage(
              conversationThreadId,
              "orchestrator",
              `The new thread started, but navigation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
          }
        }
      } catch (error) {
        setOrchestratorActiveRun(conversationThreadId, null);
        setStatusForThread(conversationThreadId, "idle");
        addMessage(
          conversationThreadId,
          "orchestrator",
          `Unexpected orchestrator error: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        setOrchestratorPrompt(currentThreadId, savedText);
      }
    },
    [
      addMessage,
      addProgressMessage,
      callOrchestratorLLM,
      currentProject?.id,
      currentThreadId,
      createThread,
      firstProjectId,
      moveThreadState,
      moveThreadStatus,
      navigate,
      messages,
      managedThread,
      activeRun,
      preferDraftConversation,
      providers.length,
      requirementsChecklist,
      routeThread,
      runDirectBrowserValidation,
      sendToThread,
      setOrchestratorActiveRun,
      setOrchestratorRequirementsChecklist,
      setOrchestratorPrompt,
      setStatusForThread,
      status,
      statusDetail,
    ],
  );

  const setInput = useCallback(
    (text: string) => {
      setOrchestratorPrompt(currentThreadId, text);
    },
    [currentThreadId, setOrchestratorPrompt],
  );

  const handleStartNewChat = useCallback(async () => {
    if (isBusy) {
      return;
    }
    setPreferDraftConversation(true);
    setPendingCreatedThreadId(null);
    resetThreadConversation(ORCHESTRATOR_DRAFT_THREAD_ID);
    closeThreadBrowserSession(ORCHESTRATOR_DRAFT_THREAD_ID);
    setStatusForThread(ORCHESTRATOR_DRAFT_THREAD_ID, "idle");
    if (routeThreadId) {
      try {
        await navigate({ to: "/" });
      } catch (error) {
        addMessage(
          ORCHESTRATOR_DRAFT_THREAD_ID,
          "orchestrator",
          `Failed to open a new orchestrator chat: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }
  }, [
    addMessage,
    closeThreadBrowserSession,
    isBusy,
    navigate,
    resetThreadConversation,
    routeThreadId,
    setStatusForThread,
  ]);

  const handleToggleBrowserPreview = useCallback(() => {
    if (!currentThreadId || !threadBrowserSession) {
      return;
    }
    setThreadBrowserSessionVisible(currentThreadId, !isThreadBrowserSessionVisible);
  }, [
    currentThreadId,
    isThreadBrowserSessionVisible,
    setThreadBrowserSessionVisible,
    threadBrowserSession,
  ]);

  const handlePromptChangeFromTraits = useCallback(
    (nextPrompt: string) => {
      setOrchestratorPrompt(currentThreadId, nextPrompt);
    },
    [currentThreadId, setOrchestratorPrompt],
  );

  return {
    currentThreadId,
    messages,
    input,
    status,
    statusDetail,
    isBusy,
    canSend: canUseSelectedModel && !isBusy,
    requirementsChecklist,
    activeRun,
    managedThread,
    agentPhase,
    latestActivity,
    threadBrowserSession,
    isThreadBrowserSessionVisible,
    selectedProvider,
    selectedModel,
    selectedProviderModels,
    modelOptionsByProvider,
    composerModelOptions,
    composerProviderState,
    providers,
    send,
    setInput,
    handleModelChange,
    handleStartNewChat,
    handleToggleBrowserPreview,
    handlePromptChangeFromTraits,
    handleProviderModelOptionsChange,
    scrollRef,
  };
}
