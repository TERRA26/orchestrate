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

  // Switching orchestrators must reset focused agent panes — focused agents
  // belong to a single orchestrator and should not leak across switches.
  setOrchestratorThread: (threadId) =>
    set((state) =>
      threadId === state.orchestratorThreadId
        ? state
        : { orchestratorThreadId: threadId, focusedAgentThreadIds: [] },
    ),

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
