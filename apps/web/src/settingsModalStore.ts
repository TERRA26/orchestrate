import { create } from "zustand";

export type SettingsModalTab = "general" | "models" | "advanced" | "about";

interface SettingsModalState {
  isOpen: boolean;
  tab: SettingsModalTab;
  open: (tab?: SettingsModalTab) => void;
  close: () => void;
  setTab: (tab: SettingsModalTab) => void;
}

export const useSettingsModalStore = create<SettingsModalState>((set) => ({
  isOpen: false,
  tab: "general",
  open: (tab) => set((s) => ({ isOpen: true, tab: tab ?? s.tab })),
  close: () => set({ isOpen: false }),
  setTab: (tab) => set({ tab }),
}));
