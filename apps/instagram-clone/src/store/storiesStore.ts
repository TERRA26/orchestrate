import { create } from "zustand";
import { SEED_STORIES } from "../seed";
import type { Story } from "../types";
import { useUserStore } from "./userStore";

interface StoriesStore {
  stories: Story[];
  activeStoryId: string | null;
  openStory: (storyId: string) => void;
  closeStory: () => void;
  nextStory: (currentId: string) => void;
  prevStory: (currentId: string) => void;
}

export const useStoriesStore = create<StoriesStore>()((set, get) => ({
  stories: SEED_STORIES,
  activeStoryId: null,

  openStory: (storyId) => {
    const story = get().stories.find((s) => s.id === storyId);
    if (!story) return;
    set((state) => ({
      activeStoryId: storyId,
      stories: state.stories.map((s) =>
        s.id === storyId ? { ...s, viewed: true } : s
      ),
    }));
    useUserStore.getState().markStoryViewed(story.userId);
  },

  closeStory: () => set({ activeStoryId: null }),

  nextStory: (currentId) => {
    const { stories } = get();
    const idx = stories.findIndex((s) => s.id === currentId);
    if (idx < stories.length - 1) {
      get().openStory(stories[idx + 1]!.id);
    } else {
      set({ activeStoryId: null });
    }
  },

  prevStory: (currentId) => {
    const { stories } = get();
    const idx = stories.findIndex((s) => s.id === currentId);
    if (idx > 0) {
      get().openStory(stories[idx - 1]!.id);
    }
  },
}));
