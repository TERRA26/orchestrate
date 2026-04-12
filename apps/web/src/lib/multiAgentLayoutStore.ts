// FILE: multiAgentLayoutStore.ts
// Purpose: Layout state for multi-agent panel views.
// Layer: UI state store
// Exports: useMultiAgentLayoutStore hook and AgentPanelState type

import type { OrchestratorWorker } from "@t3tools/contracts";
import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentPanelMode = "single-pane" | "rail-and-panels";
export type PanelArrangement = "side-by-side" | "stacked" | "grid";

export interface AgentPanelState {
  workerId: string;
  threadId: string;
  role: string | null;
  model: string;
  visibility: "foreground" | "background";
  status: string;
  color: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_RAIL_WIDTH = 320;
const MIN_RAIL_WIDTH = 240;
const MAX_RAIL_WIDTH = 480;

const DEFAULT_DIVIDER_RATIO = 0.5;
const MIN_DIVIDER_RATIO = 0.25;
const MAX_DIVIDER_RATIO = 0.75;

const MAX_FOREGROUND_PANELS = 2;

const AGENT_COLORS = [
  "#2dd4bf", // teal
  "#fb7185", // coral
  "#fbbf24", // gold
  "#4ade80", // green
  "#60a5fa", // blue
  "#a78bfa", // purple
  "#fb923c", // orange
  "#34d399", // emerald
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampRailWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_RAIL_WIDTH;
  return Math.min(MAX_RAIL_WIDTH, Math.max(MIN_RAIL_WIDTH, value));
}

function clampDividerRatio(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DIVIDER_RATIO;
  return Math.min(MAX_DIVIDER_RATIO, Math.max(MIN_DIVIDER_RATIO, value));
}

function workerToAgentPanel(
  worker: OrchestratorWorker,
  visibility: "foreground" | "background",
  colorIndex: number,
): AgentPanelState {
  return {
    workerId: worker.workerId,
    threadId: worker.threadId,
    role: worker.activeTaskId ? `Task ${worker.activeTaskId.slice(-6)}` : null,
    model: worker.modelBinding?.model ?? "unknown",
    visibility,
    status: worker.status,
    color: AGENT_COLORS[colorIndex % AGENT_COLORS.length],
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface MultiAgentLayoutStore {
  // State
  mode: AgentPanelMode;
  arrangement: PanelArrangement;
  railWidth: number;
  panelDividerRatio: number;
  foregroundPanels: AgentPanelState[];
  backgroundAgents: AgentPanelState[];
  focusedPanelWorkerId: string | null;
  promotedPanelWorkerId: string | null;

  // Actions
  setMode: (mode: AgentPanelMode) => void;
  setArrangement: (arrangement: PanelArrangement) => void;
  setRailWidth: (width: number) => void;
  setPanelDividerRatio: (ratio: number) => void;
  setFocusedPanel: (workerId: string | null) => void;
  setPromotedPanel: (workerId: string | null) => void;
  syncWithWorkers: (workers: ReadonlyArray<OrchestratorWorker>) => void;
}

export const useMultiAgentLayoutStore = create<MultiAgentLayoutStore>((set) => ({
  mode: "single-pane",
  arrangement: "side-by-side",
  railWidth: DEFAULT_RAIL_WIDTH,
  panelDividerRatio: DEFAULT_DIVIDER_RATIO,
  foregroundPanels: [],
  backgroundAgents: [],
  focusedPanelWorkerId: null,
  promotedPanelWorkerId: null,

  setMode: (mode) => set({ mode }),

  setArrangement: (arrangement) => set({ arrangement }),

  setRailWidth: (width) => set({ railWidth: clampRailWidth(width) }),

  setPanelDividerRatio: (ratio) => set({ panelDividerRatio: clampDividerRatio(ratio) }),

  setFocusedPanel: (workerId) => set({ focusedPanelWorkerId: workerId }),

  setPromotedPanel: (workerId) =>
    set((state) => ({
      promotedPanelWorkerId: state.promotedPanelWorkerId === workerId ? null : workerId,
    })),

  syncWithWorkers: (workers) =>
    set((state) => {
      // Filter out terminated workers
      const activeWorkers = workers.filter((w) => w.status !== "terminated");

      // Split into foreground (first 2 with foreground visibility) and background
      const foregroundWorkers: OrchestratorWorker[] = [];
      const backgroundWorkers: OrchestratorWorker[] = [];

      let colorIndex = 0;
      for (const worker of activeWorkers) {
        if (
          worker.visibility === "foreground" &&
          foregroundWorkers.length < MAX_FOREGROUND_PANELS
        ) {
          foregroundWorkers.push(worker);
        } else {
          backgroundWorkers.push(worker);
        }
      }

      const foregroundPanels = foregroundWorkers.map((w) =>
        workerToAgentPanel(w, "foreground", colorIndex++),
      );
      const backgroundAgents = backgroundWorkers.map((w) =>
        workerToAgentPanel(w, "background", colorIndex++),
      );

      const allWorkerIds = new Set(activeWorkers.map((w) => w.workerId));
      const focusedPanelWorkerId =
        state.focusedPanelWorkerId && allWorkerIds.has(state.focusedPanelWorkerId)
          ? state.focusedPanelWorkerId
          : null;
      const promotedPanelWorkerId =
        state.promotedPanelWorkerId && allWorkerIds.has(state.promotedPanelWorkerId)
          ? state.promotedPanelWorkerId
          : null;

      const mode: AgentPanelMode = foregroundPanels.length > 0 ? "rail-and-panels" : "single-pane";

      return {
        mode,
        foregroundPanels,
        backgroundAgents,
        focusedPanelWorkerId,
        promotedPanelWorkerId,
      };
    }),
}));
