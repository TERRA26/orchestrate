import { create } from "zustand";

interface OrchestratorPaneStore {
  orchestratorThreadId: string | null;
  focusedAgentThreadIds: string[];
  focusedBrowserThreadId: string | null;
  explicitBrowserThreadId: string | null;

  setOrchestratorThread: (threadId: string | null) => void;
  focusAgent: (threadId: string) => void;
  collapseAgent: (threadId: string) => void;
  focusBrowser: (threadId: string) => void;
  collapseBrowser: (threadId: string) => void;
  closeBrowser: () => void;
  clearAll: () => void;
}

export function shouldAutoFocusOrchestratorBrowserPane(input: {
  showOrchestratorSurface: boolean;
  routeThreadId: string;
  orchestratorThreadId: string | null;
  focusedBrowserThreadId: string | null;
}): boolean {
  void input;
  return false;
}

export function shouldRenderOrchestratorBrowserPane(input: {
  isOrchestratorThread: boolean;
  routePanel: string | null | undefined;
  focusedBrowserThreadId: string | null;
  orchestratorThreadId: string | null;
}): boolean {
  void input.focusedBrowserThreadId;
  void input.orchestratorThreadId;
  return input.isOrchestratorThread && input.routePanel === "browser";
}

export const useOrchestratorPaneStore = create<OrchestratorPaneStore>((set) => ({
  orchestratorThreadId: null,
  focusedAgentThreadIds: [],
  focusedBrowserThreadId: null,
  explicitBrowserThreadId: null,

  // Switching orchestrators must reset focused agent panes — focused agents
  // belong to a single orchestrator and should not leak across switches.
  setOrchestratorThread: (threadId) =>
    set((state) =>
      threadId === state.orchestratorThreadId
        ? state
        : {
            orchestratorThreadId: threadId,
            focusedAgentThreadIds: [],
            focusedBrowserThreadId: null,
            explicitBrowserThreadId: null,
          },
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

  focusBrowser: (threadId) =>
    set({ focusedBrowserThreadId: threadId, explicitBrowserThreadId: threadId }),

  collapseBrowser: (threadId) =>
    set((state) => ({
      focusedBrowserThreadId:
        state.focusedBrowserThreadId === threadId ? null : state.focusedBrowserThreadId,
      explicitBrowserThreadId:
        state.explicitBrowserThreadId === threadId ? null : state.explicitBrowserThreadId,
    })),

  closeBrowser: () => set({ focusedBrowserThreadId: null, explicitBrowserThreadId: null }),

  clearAll: () =>
    set({
      orchestratorThreadId: null,
      focusedAgentThreadIds: [],
      focusedBrowserThreadId: null,
      explicitBrowserThreadId: null,
    }),
}));
