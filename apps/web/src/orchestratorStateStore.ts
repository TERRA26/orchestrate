import { useMemo } from "react";
import {
  type ModelSelection,
  type ProjectId,
  type ProviderKind,
  type ThreadId,
  ThreadId as ThreadIdSchema,
} from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDebouncedStorage, createMemoryStorage } from "./lib/storage";
import type { OrchestratorChecklistItem } from "./orchestratorTypes";

export const ORCHESTRATOR_STATE_STORAGE_KEY = "t3code:orchestrator-state:v1";
const ORCHESTRATOR_STATE_STORAGE_VERSION = 1;
const ORCHESTRATOR_PERSIST_DEBOUNCE_MS = 300;
const MAX_ORCHESTRATOR_MESSAGES = 400;

const orchestratorDebouncedStorage = createDebouncedStorage(
  typeof localStorage !== "undefined" ? localStorage : createMemoryStorage(),
  ORCHESTRATOR_PERSIST_DEBOUNCE_MS,
);

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    orchestratorDebouncedStorage.flush();
  });
}

export const ORCHESTRATOR_DRAFT_THREAD_ID = ThreadIdSchema.makeUnsafe("__orchestrator_draft__");

export type OrchestratorMessageRole = "user" | "thinking" | "orchestrator" | "agent-result";

export interface OrchestratorMessage {
  id: string;
  role: OrchestratorMessageRole;
  content: string;
  timestamp: string;
}

export interface ActiveOrchestratorRun {
  threadId: ThreadId;
  projectId: ProjectId;
  userRequest: string;
  delegatedInstruction: string;
  requirementsChecklist: OrchestratorChecklistItem[];
  iteration: number;
  startedAt: string;
}

export interface OrchestratorThreadState {
  messages: OrchestratorMessage[];
  prompt: string;
  requirementsChecklist: OrchestratorChecklistItem[];
  modelSelectionByProvider: Partial<Record<ProviderKind, ModelSelection>>;
  activeProvider: ProviderKind | null;
  activeRun: ActiveOrchestratorRun | null;
}

interface OrchestratorStateStoreState {
  threadsById: Record<ThreadId, OrchestratorThreadState>;
  appendMessage: (threadId: ThreadId, message: OrchestratorMessage) => void;
  clearThread: (threadId: ThreadId) => void;
  hydrateThreadMessagesIfEmpty: (threadId: ThreadId, messages: OrchestratorMessage[]) => void;
  moveThreadState: (fromThreadId: ThreadId, toThreadId: ThreadId) => void;
  resetThreadConversation: (threadId: ThreadId) => void;
  setActiveRun: (threadId: ThreadId, run: ActiveOrchestratorRun | null) => void;
  setRequirementsChecklist: (threadId: ThreadId, checklist: OrchestratorChecklistItem[]) => void;
  setModelSelection: (
    threadId: ThreadId,
    modelSelection: ModelSelection | null | undefined,
  ) => void;
  setPrompt: (threadId: ThreadId, prompt: string) => void;
}

function createEmptyThreadState(): OrchestratorThreadState {
  return {
    messages: [],
    prompt: "",
    requirementsChecklist: [],
    modelSelectionByProvider: {},
    activeProvider: null,
    activeRun: null,
  };
}

function getThreadState(
  threadsById: Record<ThreadId, OrchestratorThreadState>,
  threadId: ThreadId,
): OrchestratorThreadState {
  return normalizeThreadState(threadsById[threadId]);
}

function normalizeThreadState(
  current: OrchestratorThreadState | undefined,
): OrchestratorThreadState {
  if (!current) {
    return createEmptyThreadState();
  }
  return {
    ...createEmptyThreadState(),
    ...current,
    modelSelectionByProvider: current.modelSelectionByProvider ?? {},
    requirementsChecklist: current.requirementsChecklist ?? [],
    activeProvider: current.activeProvider ?? null,
    activeRun: current.activeRun
      ? {
          ...current.activeRun,
          requirementsChecklist:
            current.activeRun.requirementsChecklist ?? current.requirementsChecklist ?? [],
        }
      : null,
  };
}

export const EMPTY_ORCHESTRATOR_THREAD_STATE = createEmptyThreadState();

export const useOrchestratorStateStore = create<OrchestratorStateStoreState>()(
  persist(
    (set) => ({
      threadsById: {},
      appendMessage: (threadId, message) =>
        set((state) => {
          const current = getThreadState(state.threadsById, threadId);
          return {
            threadsById: {
              ...state.threadsById,
              [threadId]: {
                ...current,
                messages: [...current.messages, message].slice(-MAX_ORCHESTRATOR_MESSAGES),
              },
            },
          };
        }),
      clearThread: (threadId) =>
        set((state) => {
          if (state.threadsById[threadId] === undefined) {
            return state;
          }
          const next = { ...state.threadsById };
          delete next[threadId];
          return { threadsById: next };
        }),
      hydrateThreadMessagesIfEmpty: (threadId, messages) =>
        set((state) => {
          if (messages.length === 0) {
            return state;
          }
          const current = getThreadState(state.threadsById, threadId);
          if (current.messages.length > 0) {
            return state;
          }
          return {
            threadsById: {
              ...state.threadsById,
              [threadId]: {
                ...current,
                messages,
              },
            },
          };
        }),
      moveThreadState: (fromThreadId, toThreadId) =>
        set((state) => {
          if (fromThreadId === toThreadId) {
            return state;
          }
          const current = state.threadsById[fromThreadId];
          if (!current) {
            return state;
          }
          const next: Record<ThreadId, OrchestratorThreadState> = {
            ...state.threadsById,
            [toThreadId]: current,
          };
          delete next[fromThreadId];
          return { threadsById: next };
        }),
      resetThreadConversation: (threadId) =>
        set((state) => {
          const current = state.threadsById[threadId];
          if (!current) {
            return state;
          }
          return {
            threadsById: {
              ...state.threadsById,
              [threadId]: {
                ...createEmptyThreadState(),
                modelSelectionByProvider: current.modelSelectionByProvider,
                activeProvider: current.activeProvider,
              },
            },
          };
        }),
      setActiveRun: (threadId, run) =>
        set((state) => {
          const current = getThreadState(state.threadsById, threadId);
          return {
            threadsById: {
              ...state.threadsById,
              [threadId]: {
                ...current,
                activeRun: run,
              },
            },
          };
        }),
      setRequirementsChecklist: (threadId, checklist) =>
        set((state) => {
          const current = getThreadState(state.threadsById, threadId);
          return {
            threadsById: {
              ...state.threadsById,
              [threadId]: {
                ...current,
                requirementsChecklist: checklist,
              },
            },
          };
        }),
      setModelSelection: (threadId, modelSelection) =>
        set((state) => {
          const current = getThreadState(state.threadsById, threadId);
          if (!modelSelection) {
            return {
              threadsById: {
                ...state.threadsById,
                [threadId]: {
                  ...current,
                  modelSelectionByProvider: {},
                  activeProvider: null,
                },
              },
            };
          }
          return {
            threadsById: {
              ...state.threadsById,
              [threadId]: {
                ...current,
                modelSelectionByProvider: {
                  ...current.modelSelectionByProvider,
                  [modelSelection.provider]: modelSelection,
                },
                activeProvider: modelSelection.provider,
              },
            },
          };
        }),
      setPrompt: (threadId, prompt) =>
        set((state) => {
          const current = getThreadState(state.threadsById, threadId);
          return {
            threadsById: {
              ...state.threadsById,
              [threadId]: {
                ...current,
                prompt,
              },
            },
          };
        }),
    }),
    {
      name: ORCHESTRATOR_STATE_STORAGE_KEY,
      version: ORCHESTRATOR_STATE_STORAGE_VERSION,
      storage: createJSONStorage(() => orchestratorDebouncedStorage),
      partialize: (state) => ({
        threadsById: state.threadsById,
      }),
    },
  ),
);

export function useOrchestratorThreadState(threadId: ThreadId): OrchestratorThreadState {
  const rawThreadState = useOrchestratorStateStore((state) => state.threadsById[threadId]);
  return useMemo(() => normalizeThreadState(rawThreadState), [rawThreadState]);
}
