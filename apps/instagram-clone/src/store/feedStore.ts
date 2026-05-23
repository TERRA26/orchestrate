import { create } from "zustand";
import { CURRENT_USER_ID, FOLLOWING_IDS, SEED_POSTS } from "../seed";
import type { Post } from "../types";

interface FeedStore {
  posts: Post[];
  getFeedPosts: () => Post[];
  getPostsByUserId: (userId: string) => Post[];
  getPostById: (id: string) => Post | undefined;
  toggleLike: (postId: string) => void;
  toggleSave: (postId: string) => void;
}

export const useFeedStore = create<FeedStore>()((set, get) => ({
  posts: SEED_POSTS,

  getFeedPosts: () => {
    const feedIds = [CURRENT_USER_ID, ...FOLLOWING_IDS];
    return get().posts.filter((p) => feedIds.includes(p.userId));
  },

  getPostsByUserId: (userId) => get().posts.filter((p) => p.userId === userId),

  getPostById: (id) => get().posts.find((p) => p.id === id),

  toggleLike: (postId) => {
    set((state) => ({
      posts: state.posts.map((p) => {
        if (p.id !== postId) return p;
        const liked = !p.liked;
        return { ...p, liked, likes: liked ? p.likes + 1 : p.likes - 1 };
      }),
    }));
  },

  toggleSave: (postId) => {
    set((state) => ({
      posts: state.posts.map((p) =>
        p.id !== postId ? p : { ...p, saved: !p.saved }
      ),
    }));
  },
}));
