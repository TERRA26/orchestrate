import { create } from "zustand";

const ORCHESTRATOR_OPEN_STORAGE_KEY = "orchestrate:orchestrator-panel-open";

function readOrchestratorOpen(): boolean {
  try {
    return localStorage.getItem(ORCHESTRATOR_OPEN_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

interface PanelState {
  // Orchestrator panel
  orchestratorOpen: boolean;

  // Panel visibility
  visiblePanelIds: string[];
  focusedPanelId: string | null;
  promotedPanelId: string | null;
  collapsedPanelIds: Set<string>;

  // Layout
  leftRailCollapsed: boolean;
  inspectorCollapsed: boolean;
  browserCollapsed: boolean;

  // Actions
  toggleOrchestrator: () => void;
  focus: (panelId: string | null) => void;
  promote: (panelId: string) => void;
  demote: () => void;
  collapse: (panelId: string) => void;
  expand: (panelId: string) => void;
  compare: (panelId1: string, panelId2: string) => void;
  toggleLeftRail: () => void;
  toggleInspector: () => void;
  toggleBrowser: () => void;

  // Sync with workers
  syncWithWorkers: (workerIds: string[]) => void;
}

export const usePanelStateStore = create<PanelState>((set) => ({
  orchestratorOpen: readOrchestratorOpen(),
  visiblePanelIds: [],
  focusedPanelId: null,
  promotedPanelId: null,
  collapsedPanelIds: new Set(),
  leftRailCollapsed: false,
  inspectorCollapsed: false,
  browserCollapsed: true,

  toggleOrchestrator: () =>
    set((state) => {
      const next = !state.orchestratorOpen;
      try {
        localStorage.setItem(ORCHESTRATOR_OPEN_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage errors
      }
      return { orchestratorOpen: next };
    }),

  focus: (panelId) => set({ focusedPanelId: panelId }),

  promote: (panelId) =>
    set((state) => ({
      promotedPanelId: state.promotedPanelId === panelId ? null : panelId,
    })),

  demote: () => set({ promotedPanelId: null }),

  collapse: (panelId) =>
    set((state) => {
      const next = new Set(state.collapsedPanelIds);
      next.add(panelId);
      return { collapsedPanelIds: next };
    }),

  expand: (panelId) =>
    set((state) => {
      const next = new Set(state.collapsedPanelIds);
      next.delete(panelId);
      return { collapsedPanelIds: next };
    }),

  compare: (panelId1, panelId2) =>
    set({
      visiblePanelIds: [panelId1, panelId2],
      promotedPanelId: null,
    }),

  toggleLeftRail: () => set((state) => ({ leftRailCollapsed: !state.leftRailCollapsed })),
  toggleInspector: () => set((state) => ({ inspectorCollapsed: !state.inspectorCollapsed })),
  toggleBrowser: () => set((state) => ({ browserCollapsed: !state.browserCollapsed })),

  // Sync visible panels with actual worker IDs
  syncWithWorkers: (workerIds) =>
    set((state) => {
      const maxVisible = 4;
      const visible = workerIds.slice(0, maxVisible);
      const collapsed = new Set<string>();
      for (const id of workerIds.slice(maxVisible)) {
        collapsed.add(id);
      }
      // Keep focus/promote if still valid
      const focusedPanelId =
        state.focusedPanelId && visible.includes(state.focusedPanelId)
          ? state.focusedPanelId
          : null;
      const promotedPanelId =
        state.promotedPanelId && visible.includes(state.promotedPanelId)
          ? state.promotedPanelId
          : null;
      return {
        visiblePanelIds: visible,
        collapsedPanelIds: collapsed,
        focusedPanelId,
        promotedPanelId,
      };
    }),
}));
