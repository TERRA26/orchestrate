import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  type ModelSelection,
  type OrchestratorRun,
  type OrchestratorTask,
  type OrchestratorWorker,
  type ProviderInteractionMode,
  type ProviderKind,
  type RuntimeMode,
  type ServerProvider,
  type ServerProviderModel,
  ThreadId,
} from "@t3tools/contracts";

import { newCommandId, newMessageId, newThreadId } from "~/lib/utils";
import { useSettings } from "~/hooks/useSettings";
import { deriveEffectiveComposerModelState, useComposerDraftStore } from "~/composerDraftStore";
import {
  createEmbeddedBrowserAutomationSession,
  createEmbeddedBrowserSessionFromUrl,
  type EmbeddedBrowserSession,
  getEmbeddedBrowserAddress,
  resolveEmbeddedBrowserAbsoluteUrl,
  useEmbeddedBrowserStateStore,
} from "~/embeddedBrowserStateStore";
import { getCustomModelOptionsByProvider, useAppSettings } from "~/appSettings";
import { isScrollContainerNearBottom } from "~/chat-scroll";
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
  type WorkLogEntry,
} from "~/session-logic";
import {
  buildBrowserValidationUserPrompt,
  buildThreadBackedOrchestratorMessages,
  buildDelegationInstruction,
  buildReviewUserPrompt,
  classifyReviewArtifactsReadiness,
  extractEmbeddedBrowserPresentationCandidates,
  formatBrowserValidationActionSummary,
  formatReviewArtifactsWaitMessage,
  mergeChecklistWithReview,
  ORCHESTRATOR_BROWSER_VALIDATION_SYSTEM_PROMPT,
  ORCHESTRATOR_MAX_ITERATIONS,
  ORCHESTRATOR_MAX_REVIEW_FILE_CHARS,
  ORCHESTRATOR_MAX_REVIEW_FILE_SNAPSHOTS,
  ORCHESTRATOR_MAX_REVIEW_WORK_LOG_DETAIL_CHARS,
  ORCHESTRATOR_MAX_REVIEW_WORK_LOG_ENTRIES,
  ORCHESTRATOR_REVIEW_SYSTEM_PROMPT,
  parseBrowserValidationPlannerAction,
  parseOrchestratorReviewDecision,
  resolveOrchestratorConversationThreadId,
  resolveTurnReviewContext,
  selectBrowserValidationCandidate,
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
import type { BrowserAction } from "@t3tools/contracts";
import { selectVisibleOrchestratorRun } from "./orchestratorRunSelection";

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
  handleOpenWorkerPanel: (input: { workerId?: string; threadId?: string }) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  workLogEntries: readonly WorkLogEntry[];

  // Server-canonical orchestrator state
  orchestratorRun: OrchestratorRun | null;
  orchestratorTasks: readonly OrchestratorTask[];
  orchestratorWorkers: readonly OrchestratorWorker[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOrchestratorEngine(): OrchestratorEngineResult {
  // -- Active thread observation --
  const navigate = useNavigate();
  const settings = useSettings();
  const { settings: appSettings } = useAppSettings();
  const routeThreadId = useParams({
    strict: false,
    select: (params: Record<string, string | undefined>) =>
      params.threadId ? ThreadId.makeUnsafe(params.threadId) : null,
  });
  const routeThread = useThreadById(routeThreadId);
  const routeDraftThread = useComposerDraftStore((store) =>
    routeThreadId ? (store.draftThreadsByThreadId[routeThreadId] ?? null) : null,
  );
  const [pendingCreatedThreadId, setPendingCreatedThreadId] = useState<ThreadId | null>(null);
  const firstProjectId = useStore((store) => store.projects[0]?.id ?? null);
  const syncServerReadModel = useStore((store) => store.syncServerReadModel);
  const appendOrchestratorMessage = useOrchestratorStateStore((store) => store.appendMessage);
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
  const threadBackedMessages = useMemo(
    () =>
      routeThread
        ? buildThreadBackedOrchestratorMessages(routeThread).map((message, index) => ({
            id: `recovered:${routeThread.id}:${index}`,
            role: message.role,
            content: message.content,
            timestamp: message.timestamp,
          }))
        : [],
    [routeThread],
  );
  const workLogEntries = useMemo(
    () =>
      routeThread
        ? deriveWorkLogEntries(routeThread.activities, routeThread.latestTurn?.turnId ?? undefined)
        : [],
    [routeThread],
  );
  const messages = routeThread ? threadBackedMessages : orchestratorThreadState.messages;
  const input = orchestratorThreadState.prompt;
  const activeRun = orchestratorThreadState.activeRun;
  const requirementsChecklist = orchestratorThreadState.requirementsChecklist;

  // -- Server config --
  const serverConfigQuery = useQuery(serverConfigQueryOptions());
  const providers = serverConfigQuery.data?.providers ?? EMPTY_PROVIDERS;

  // -- Server-canonical orchestrator state --
  const orchestratorSnapshotQuery = useQuery({
    queryKey: ["orchestrator", "snapshot"],
    queryFn: async () => {
      const api = readNativeApi();
      if (!api) {
        return {
          orchestratorRuns: [] as readonly OrchestratorRun[],
          orchestratorTasks: [] as readonly OrchestratorTask[],
          orchestratorWorkers: [] as readonly OrchestratorWorker[],
        };
      }
      const snapshot = await api.orchestration.getSnapshot();
      return {
        orchestratorRuns: snapshot.orchestratorRuns ?? [],
        orchestratorTasks: snapshot.orchestratorTasks ?? [],
        orchestratorWorkers: snapshot.orchestratorWorkers ?? [],
      };
    },
    refetchInterval: 5000,
  });
  const refetchOrchestratorSnapshot = orchestratorSnapshotQuery.refetch;

  const allOrchestratorWorkers = useMemo(
    () => orchestratorSnapshotQuery.data?.orchestratorWorkers ?? [],
    [orchestratorSnapshotQuery.data?.orchestratorWorkers],
  );
  const trackedRunId = routeThread ? null : (activeRun?.runId ?? null);
  const serverRun: OrchestratorRun | null = selectVisibleOrchestratorRun(
    orchestratorSnapshotQuery.data?.orchestratorRuns,
    trackedRunId,
  );
  const activeOrchestratorRunId = trackedRunId ?? serverRun?.runId ?? null;
  const orchestratorTasks = useMemo(
    () =>
      orchestratorSnapshotQuery.data?.orchestratorTasks.filter((task) =>
        activeOrchestratorRunId ? task.runId === activeOrchestratorRunId : false,
      ) ?? [],
    [activeOrchestratorRunId, orchestratorSnapshotQuery.data?.orchestratorTasks],
  );
  const orchestratorWorkers = useMemo(
    () =>
      allOrchestratorWorkers.filter((worker) =>
        activeOrchestratorRunId ? worker.runId === activeOrchestratorRunId : false,
      ),
    [activeOrchestratorRunId, allOrchestratorWorkers],
  );

  // -- Model selection --
  const currentThreadModelSelection = routeThread?.modelSelection ?? null;
  const currentProject = useProjectById(
    routeThread?.projectId ??
      routeDraftThread?.projectId ??
      activeRun?.projectId ??
      firstProjectId ??
      null,
  );
  const currentThreadType =
    routeDraftThread?.threadType ?? routeThread?.threadType ?? "orchestrator";
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
    () => getCustomModelOptionsByProvider(appSettings),
    [appSettings],
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
  const shouldAutoScrollRef = useRef(true);
  const status = statusByThreadId[currentThreadId] ?? "idle";
  const statusDetail = statusDetailByThreadId[currentThreadId] ?? null;
  const isBusy = status !== "idle";
  const canUseSelectedModel = selectedModel.length > 0;

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
    shouldAutoScrollRef.current = true;
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
    const container = scrollRef.current;
    if (!container) {
      return;
    }

    const handleScroll = () => {
      shouldAutoScrollRef.current = isScrollContainerNearBottom(container);
    };

    handleScroll();
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [currentThreadId, messages.length]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !shouldAutoScrollRef.current) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [currentThreadId, messages.length]);

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
      modelSelection?: ModelSelection,
    ) => {
      const api = readNativeApi();
      if (!api) throw new Error("API not available");
      await api.orchestration.dispatchCommand({
        type: "thread.turn.start",
        commandId: newCommandId(),
        threadId,
        message: { messageId: newMessageId(), role: "user", text, attachments: [] },
        ...(modelSelection ? { modelSelection } : {}),
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
      if (!selectedModel) throw new Error("No model selected");
      const api = readNativeApi();
      if (!api) throw new Error("API not available");
      const result = await api.orchestration.complete({
        provider: selectedModelSelection.provider,
        model: selectedModelSelection.model,
        ...(selectedModelSelection.options ? { modelOptions: selectedModelSelection.options } : {}),
        ...(currentProject?.cwd ? { cwd: currentProject.cwd } : {}),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      });
      return result.text.trim();
    },
    [currentProject?.cwd, selectedModel, selectedModelSelection],
  );

  const finalizeServerRun = useCallback(
    async (
      run: ActiveOrchestratorRun,
      outcome:
        | { kind: "completed"; summary: string }
        | { kind: "failed"; reason: string }
        | { kind: "cancelled"; reason: string },
    ) => {
      if (!run.runId) {
        return;
      }
      const api = readNativeApi();
      if (!api) {
        return;
      }

      if (outcome.kind === "cancelled") {
        await api.orchestration
          .dispatchCommand({
            type: "orchestrator.run.cancel",
            commandId: newCommandId(),
            runId: run.runId,
            reason: outcome.reason,
            createdAt: new Date().toISOString(),
          })
          .catch(() => undefined);
        return;
      }

      if (run.workerId) {
        await api.orchestration
          .dispatchCommand({
            type: "orchestrator.worker.terminate",
            commandId: newCommandId(),
            workerId: run.workerId,
            reason:
              outcome.kind === "completed"
                ? "Managed agent work accepted by orchestrator review"
                : outcome.reason,
            createdAt: new Date().toISOString(),
          })
          .catch(() => undefined);
      }

      if (run.rootTaskId) {
        await api.orchestration
          .dispatchCommand(
            outcome.kind === "completed"
              ? {
                  type: "orchestrator.task.accept",
                  commandId: newCommandId(),
                  taskId: run.rootTaskId,
                  summary: outcome.summary,
                  createdAt: new Date().toISOString(),
                }
              : {
                  type: "orchestrator.task.fail",
                  commandId: newCommandId(),
                  taskId: run.rootTaskId,
                  reason: outcome.reason,
                  createdAt: new Date().toISOString(),
                },
          )
          .catch(() => undefined);
      }

      await api.orchestration
        .dispatchCommand(
          outcome.kind === "completed"
            ? {
                type: "orchestrator.run.complete",
                commandId: newCommandId(),
                runId: run.runId,
                summary: outcome.summary,
                createdAt: new Date().toISOString(),
              }
            : {
                type: "orchestrator.run.fail",
                commandId: newCommandId(),
                runId: run.runId,
                reason: outcome.reason,
                createdAt: new Date().toISOString(),
              },
        )
        .catch(() => undefined);
    },
    [],
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

      addProgressMessage(
        validationInput.run.threadId,
        `Opening browser validation preview: ${absolutePreviewUrl}`,
      );

      let sessionId: string | null = null;
      try {
        const opened = (await api.browser.openSession({ url: absolutePreviewUrl })) as any;
        sessionId = opened.sessionId;
        let observation = opened.observation;
        addProgressMessage(
          validationInput.run.threadId,
          "Browser session opened. Validating the current preview...",
        );
        setStatusForThread(
          validationInput.run.threadId,
          "reviewing",
          "Browser session opened. Validating the current preview...",
        );
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
        await finalizeServerRun(run, {
          kind: "failed",
          reason:
            error instanceof Error
              ? `Failed to inspect the completed turn: ${error.message}`
              : "Failed to inspect the completed turn",
        });
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
        await finalizeServerRun(run, {
          kind: "failed",
          reason: "Orchestrator review could not produce a reliable decision.",
        });
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
        await finalizeServerRun(run, {
          kind: "failed",
          reason: `Browser validation could not complete: ${browserValidation.summary}`,
        });
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
        await finalizeServerRun(run, {
          kind: "failed",
          reason: `${followUpValidation.reason}. ${reviewDecision.summary}`,
        });
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
        await finalizeServerRun(run, {
          kind: "failed",
          reason: `Review could not produce a safe follow-up instruction. ${reviewDecision.summary}`,
        });
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
        await finalizeServerRun(run, {
          kind: "completed",
          summary: reviewDecision.summary,
        });
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
        await finalizeServerRun(run, {
          kind: "failed",
          reason:
            run.iteration >= ORCHESTRATOR_MAX_ITERATIONS
              ? "Stopped after reaching the orchestrator iteration limit."
              : "The managed agent thread is no longer available for follow-up work.",
        });
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
          latestManagedThread.modelSelection,
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
        await finalizeServerRun(run, {
          kind: "failed",
          reason:
            error instanceof Error
              ? `Failed to send follow-up to agent: ${error.message}`
              : "Failed to send follow-up to agent",
        });
        setOrchestratorActiveRun(run.threadId, null);
        setStatusForThread(run.threadId, "idle");
      }
    },
    [
      addMessage,
      addProgressMessage,
      callOrchestratorLLM,
      collectReviewArtifacts,
      finalizeServerRun,
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
      if (!selectedModel) {
        addMessage(
          currentThreadId,
          "orchestrator",
          "No model selected. Pick a model in the composer toolbar.",
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

      setOrchestratorPrompt(currentThreadId, "");

      const createdAt = new Date().toISOString();
      let threadIdForSend = currentThreadId;
      try {
        const projectId = routeDraftThread?.projectId ?? currentProject?.id ?? firstProjectId;
        if (!projectId) {
          addMessage(
            currentThreadId,
            "orchestrator",
            "No project is available for this orchestrator chat.",
          );
          return;
        }

        const envMode = routeDraftThread?.envMode ?? "local";
        const branch = routeDraftThread?.branch ?? null;
        const worktreePath = routeDraftThread?.worktreePath ?? null;

        if (!routeThread) {
          threadIdForSend =
            currentThreadId === ORCHESTRATOR_DRAFT_THREAD_ID ? newThreadId() : currentThreadId;
          const title = trimmed.length > 80 ? `${trimmed.slice(0, 77).trimEnd()}...` : trimmed;

          await api.orchestration.dispatchCommand({
            type: "thread.create",
            commandId: newCommandId(),
            threadId: threadIdForSend,
            projectId,
            title,
            threadType: currentThreadType,
            modelSelection: selectedModelSelection,
            runtimeMode: "full-access",
            interactionMode: "default",
            envMode,
            branch,
            worktreePath,
            createdAt,
          });

          useComposerDraftStore.getState().setProjectDraftThreadId(projectId, threadIdForSend, {
            createdAt,
            entryPoint: "chat",
            threadType: currentThreadType,
            runtimeMode: "full-access",
            interactionMode: "default",
            envMode,
            branch,
            worktreePath,
          });

          if (threadIdForSend !== currentThreadId) {
            moveThreadState(currentThreadId, threadIdForSend);
            moveThreadStatus(currentThreadId, threadIdForSend);
            setPendingCreatedThreadId(threadIdForSend);
            await navigate({
              to: "/$threadId",
              params: { threadId: threadIdForSend },
            });
          }
        }

        addMessage(threadIdForSend, "user", trimmed);

        await api.orchestration.dispatchCommand({
          type: "thread.turn.start",
          commandId: newCommandId(),
          threadId: threadIdForSend,
          message: {
            messageId: newMessageId(),
            role: "user",
            text: trimmed,
            attachments: [],
          },
          modelSelection: selectedModelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          createdAt,
        });

        const snapshot = await api.orchestration.getSnapshot();
        syncServerReadModel(snapshot);
      } catch (error) {
        addMessage(
          threadIdForSend,
          "orchestrator",
          error instanceof Error
            ? `Failed to send message: ${error.message}`
            : "Failed to send message.",
        );
      }
    },
    [
      addMessage,
      currentProject?.id,
      currentThreadId,
      currentThreadType,
      firstProjectId,
      moveThreadState,
      moveThreadStatus,
      navigate,
      routeDraftThread,
      routeThread,
      selectedModel,
      selectedModelSelection,
      setOrchestratorPrompt,
      syncServerReadModel,
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

  useEffect(() => {
    const latestWorkEntry = workLogEntries.at(-1);
    if (!latestWorkEntry?.toolName) {
      return;
    }
    if (!latestWorkEntry.workerId && !latestWorkEntry.threadId) {
      return;
    }
    if (
      latestWorkEntry.toolName !== "spawn_agent" &&
      latestWorkEntry.toolName !== "focus_agent" &&
      latestWorkEntry.toolName !== "promote_to_foreground" &&
      latestWorkEntry.toolName !== "promote_panel"
    ) {
      return;
    }
    void refetchOrchestratorSnapshot();
  }, [refetchOrchestratorSnapshot, workLogEntries]);

  const handleOpenWorkerPanel = useCallback(
    (input: { workerId?: string; threadId?: string }) => {
      const matchedWorker =
        (input.workerId
          ? allOrchestratorWorkers.find((worker) => worker.workerId === input.workerId)
          : null) ??
        (input.threadId
          ? allOrchestratorWorkers.find((worker) => worker.threadId === input.threadId)
          : null) ??
        null;

      const threadId = matchedWorker?.threadId ?? input.threadId;
      if (threadId) {
        void refetchOrchestratorSnapshot();
        void navigate({
          to: "/$threadId",
          params: { threadId: ThreadId.makeUnsafe(threadId) },
        });
      }
    },
    [allOrchestratorWorkers, navigate, refetchOrchestratorSnapshot],
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
    handleOpenWorkerPanel,
    scrollRef,
    workLogEntries,

    // Server-canonical orchestrator state
    orchestratorRun: serverRun,
    orchestratorTasks,
    orchestratorWorkers,
  };
}
