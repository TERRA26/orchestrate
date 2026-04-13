import { create } from "zustand";

interface OrchestratorPaneStore {
  orchestratorThreadId: string | null;
  focusedAgentThreadIds: string[];

  setOrchestratorThread: (threadId: string | null) => void;
  focusAgent: (threadId: string) => void;
  collapseAgent: (threadId: string) => void;
  clearAll: () => void;
}

export const useOrchestratorPaneStore = create<OrchestratorPaneStore>((set) => ({
  orchestratorThreadId: null,
  focusedAgentThreadIds: [],

  setOrchestratorThread: (threadId) => set({ orchestratorThreadId: threadId }),

  focusAgent: (threadId) =>
    set((state) => {
      const current = state.focusedAgentThreadIds.filter((id) => id !== threadId);
      const next = [...current, threadId].slice(-2);
      return { focusedAgentThreadIds: next };
    }),

  collapseAgent: (threadId) =>
    set((state) => ({
      focusedAgentThreadIds: state.focusedAgentThreadIds.filter((id) => id !== threadId),
    })),

  clearAll: () => set({ orchestratorThreadId: null, focusedAgentThreadIds: [] }),
}));
