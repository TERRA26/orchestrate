import { create } from "zustand";
import { CURRENT_USER_ID, FOLLOWING_IDS, SEED_USERS } from "../seed";
import type { User } from "../types";

interface UserStore {
  users: User[];
  currentUserId: string;
  followingIds: string[];
  getCurrentUser: () => User;
  getUserById: (id: string) => User | undefined;
  getUserByUsername: (username: string) => User | undefined;
  isFollowing: (userId: string) => boolean;
  toggleFollow: (userId: string) => void;
  markStoryViewed: (userId: string) => void;
}

export const useUserStore = create<UserStore>()((set, get) => ({
  users: SEED_USERS,
  currentUserId: CURRENT_USER_ID,
  followingIds: [...FOLLOWING_IDS],

  getCurrentUser: () => get().users.find((u) => u.id === get().currentUserId)!,
  getUserById: (id) => get().users.find((u) => u.id === id),
  getUserByUsername: (username) => get().users.find((u) => u.username === username),
  isFollowing: (userId) => get().followingIds.includes(userId),

  toggleFollow: (userId) => {
    set((state) => {
      const isFollowing = state.followingIds.includes(userId);
      return {
        followingIds: isFollowing
          ? state.followingIds.filter((id) => id !== userId)
          : [...state.followingIds, userId],
        users: state.users.map((u) =>
          u.id === userId
            ? { ...u, followers: u.followers + (isFollowing ? -1 : 1) }
            : u
        ),
      };
    });
  },

  markStoryViewed: (userId) => {
    set((state) => ({
      users: state.users.map((u) =>
        u.id === userId ? { ...u, storyViewed: true } : u
      ),
    }));
  },
}));
