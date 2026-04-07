import { createContext, useContext, useMemo, useReducer, useEffect, type ReactNode } from "react";
import type { AppState, AppAction } from "./types";
import { createSeedData } from "./seed";

const STORAGE_KEY = "reddit-clone-state";

function loadState(): AppState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved) as AppState;
    }
  } catch {
    // ignore parse errors
  }
  return createSeedData();
}

function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore - storage full
  }
}

function updateUser(
  state: AppState,
  userId: string,
  updater: (u: AppState["users"][number]) => AppState["users"][number],
): AppState["users"] {
  return state.users.map((u) => (u.id === userId ? updater(u) : u));
}

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "LOGIN":
      return { ...state, currentUserId: action.userId };

    case "LOGOUT":
      return { ...state, currentUserId: "" };

    case "SIGNUP":
      return { ...state, users: [...state.users, action.user] };

    case "SET_THEME":
      return { ...state, theme: action.theme };

    case "CREATE_POST":
      return { ...state, posts: [...state.posts, action.post] };

    case "EDIT_POST":
      return {
        ...state,
        posts: state.posts.map((p) =>
          p.id === action.postId
            ? { ...p, title: action.title, body: action.body, updatedAt: Date.now() }
            : p,
        ),
      };

    case "DELETE_POST":
      return {
        ...state,
        posts: state.posts.filter((p) => p.id !== action.postId),
        comments: state.comments.filter((c) => c.postId !== action.postId),
      };

    case "VOTE_POST": {
      const { postId, userId, direction } = action;

      // Find current vote state for this user
      const user = state.users.find((u) => u.id === userId);
      if (!user) return state;

      const hadUpvoted = user.upvotedPosts.includes(postId);
      const hadDownvoted = user.downvotedPosts.includes(postId);

      let upvoteDelta = 0;
      let downvoteDelta = 0;
      let newUpvotedPosts = [...user.upvotedPosts];
      let newDownvotedPosts = [...user.downvotedPosts];

      if (direction === "up") {
        if (hadUpvoted) {
          // Toggle off upvote
          upvoteDelta = -1;
          newUpvotedPosts = newUpvotedPosts.filter((id) => id !== postId);
        } else {
          // Add upvote
          upvoteDelta = 1;
          newUpvotedPosts.push(postId);
          if (hadDownvoted) {
            // Remove previous downvote
            downvoteDelta = -1;
            newDownvotedPosts = newDownvotedPosts.filter((id) => id !== postId);
          }
        }
      } else if (direction === "down") {
        if (hadDownvoted) {
          // Toggle off downvote
          downvoteDelta = -1;
          newDownvotedPosts = newDownvotedPosts.filter((id) => id !== postId);
        } else {
          // Add downvote
          downvoteDelta = 1;
          newDownvotedPosts.push(postId);
          if (hadUpvoted) {
            // Remove previous upvote
            upvoteDelta = -1;
            newUpvotedPosts = newUpvotedPosts.filter((id) => id !== postId);
          }
        }
      } else {
        // direction === "none" - remove all votes
        if (hadUpvoted) {
          upvoteDelta = -1;
          newUpvotedPosts = newUpvotedPosts.filter((id) => id !== postId);
        }
        if (hadDownvoted) {
          downvoteDelta = -1;
          newDownvotedPosts = newDownvotedPosts.filter((id) => id !== postId);
        }
      }

      return {
        ...state,
        users: state.users.map((u) =>
          u.id === userId
            ? {
                ...u,
                upvotedPosts: newUpvotedPosts,
                downvotedPosts: newDownvotedPosts,
              }
            : u,
        ),
        posts: state.posts.map((p) =>
          p.id === postId
            ? {
                ...p,
                upvotes: p.upvotes + upvoteDelta,
                downvotes: p.downvotes + downvoteDelta,
              }
            : p,
        ),
      };
    }

    case "TOGGLE_SPOILER":
      return {
        ...state,
        posts: state.posts.map((p) => (p.id === action.postId ? { ...p, spoiler: !p.spoiler } : p)),
      };

    case "TOGGLE_NSFW":
      return {
        ...state,
        posts: state.posts.map((p) => (p.id === action.postId ? { ...p, nsfw: !p.nsfw } : p)),
      };

    case "CREATE_COMMENT":
      return { ...state, comments: [...state.comments, action.comment] };

    case "EDIT_COMMENT":
      return {
        ...state,
        comments: state.comments.map((c) =>
          c.id === action.commentId ? { ...c, body: action.body, updatedAt: Date.now() } : c,
        ),
      };

    case "DELETE_COMMENT": {
      // Delete the comment and all its descendants
      const toDelete = new Set<string>([action.commentId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const c of state.comments) {
          if (c.parentId !== "" && toDelete.has(c.parentId) && !toDelete.has(c.id)) {
            toDelete.add(c.id);
            changed = true;
          }
        }
      }
      return {
        ...state,
        comments: state.comments.filter((c) => !toDelete.has(c.id)),
      };
    }

    case "VOTE_COMMENT": {
      const { commentId, userId, direction } = action;

      const user = state.users.find((u) => u.id === userId);
      if (!user) return state;

      const hadUpvoted = user.upvotedComments.includes(commentId);
      const hadDownvoted = user.downvotedComments.includes(commentId);

      let upvoteDelta = 0;
      let downvoteDelta = 0;
      let newUpvotedComments = [...user.upvotedComments];
      let newDownvotedComments = [...user.downvotedComments];

      if (direction === "up") {
        if (hadUpvoted) {
          upvoteDelta = -1;
          newUpvotedComments = newUpvotedComments.filter((id) => id !== commentId);
        } else {
          upvoteDelta = 1;
          newUpvotedComments.push(commentId);
          if (hadDownvoted) {
            downvoteDelta = -1;
            newDownvotedComments = newDownvotedComments.filter((id) => id !== commentId);
          }
        }
      } else if (direction === "down") {
        if (hadDownvoted) {
          downvoteDelta = -1;
          newDownvotedComments = newDownvotedComments.filter((id) => id !== commentId);
        } else {
          downvoteDelta = 1;
          newDownvotedComments.push(commentId);
          if (hadUpvoted) {
            upvoteDelta = -1;
            newUpvotedComments = newUpvotedComments.filter((id) => id !== commentId);
          }
        }
      } else {
        // direction === "none"
        if (hadUpvoted) {
          upvoteDelta = -1;
          newUpvotedComments = newUpvotedComments.filter((id) => id !== commentId);
        }
        if (hadDownvoted) {
          downvoteDelta = -1;
          newDownvotedComments = newDownvotedComments.filter((id) => id !== commentId);
        }
      }

      return {
        ...state,
        users: state.users.map((u) =>
          u.id === userId
            ? {
                ...u,
                upvotedComments: newUpvotedComments,
                downvotedComments: newDownvotedComments,
              }
            : u,
        ),
        comments: state.comments.map((c) =>
          c.id === commentId
            ? {
                ...c,
                upvotes: c.upvotes + upvoteDelta,
                downvotes: c.downvotes + downvoteDelta,
              }
            : c,
        ),
      };
    }

    case "CREATE_SUBREDDIT":
      return {
        ...state,
        subreddits: [...state.subreddits, action.subreddit],
      };

    case "JOIN_SUBREDDIT":
      return {
        ...state,
        subreddits: state.subreddits.map((s) =>
          s.id === action.subredditId && !s.members.includes(action.userId)
            ? { ...s, members: [...s.members, action.userId] }
            : s,
        ),
      };

    case "LEAVE_SUBREDDIT":
      return {
        ...state,
        subreddits: state.subreddits.map((s) =>
          s.id === action.subredditId
            ? {
                ...s,
                members: s.members.filter((id) => id !== action.userId),
              }
            : s,
        ),
      };

    case "UPDATE_SUBREDDIT_RULES":
      return {
        ...state,
        subreddits: state.subreddits.map((s) =>
          s.id === action.subredditId ? { ...s, rules: action.rules } : s,
        ),
      };

    case "UPDATE_SUBREDDIT_FLAIRS":
      return {
        ...state,
        subreddits: state.subreddits.map((s) =>
          s.id === action.subredditId ? { ...s, flairs: action.flairs } : s,
        ),
      };

    case "SAVE_POST":
      return {
        ...state,
        users: updateUser(state, action.userId, (u) =>
          u.savedPosts.includes(action.postId)
            ? u
            : { ...u, savedPosts: [...u.savedPosts, action.postId] },
        ),
      };

    case "UNSAVE_POST":
      return {
        ...state,
        users: updateUser(state, action.userId, (u) => ({
          ...u,
          savedPosts: u.savedPosts.filter((id) => id !== action.postId),
        })),
      };

    case "SAVE_COMMENT":
      return {
        ...state,
        users: updateUser(state, action.userId, (u) =>
          u.savedComments.includes(action.commentId)
            ? u
            : {
                ...u,
                savedComments: [...u.savedComments, action.commentId],
              },
        ),
      };

    case "UNSAVE_COMMENT":
      return {
        ...state,
        users: updateUser(state, action.userId, (u) => ({
          ...u,
          savedComments: u.savedComments.filter((id) => id !== action.commentId),
        })),
      };

    case "ADD_TO_HISTORY":
      return {
        ...state,
        users: updateUser(state, action.userId, (u) => ({
          ...u,
          history: u.history.includes(action.postId) ? u.history : [...u.history, action.postId],
        })),
      };

    case "SEND_MESSAGE":
      return { ...state, messages: [...state.messages, action.message] };

    case "READ_MESSAGE":
      return {
        ...state,
        messages: state.messages.map((m) => (m.id === action.messageId ? { ...m, read: true } : m)),
      };

    case "GIVE_AWARD_POST":
      return {
        ...state,
        posts: state.posts.map((p) =>
          p.id === action.postId ? { ...p, awards: [...p.awards, action.award] } : p,
        ),
      };

    case "GIVE_AWARD_COMMENT":
      return {
        ...state,
        comments: state.comments.map((c) =>
          c.id === action.commentId ? { ...c, awards: [...c.awards, action.award] } : c,
        ),
      };

    case "FOLLOW_USER":
      return {
        ...state,
        users: updateUser(state, action.userId, (u) =>
          u.following.includes(action.targetId)
            ? u
            : { ...u, following: [...u.following, action.targetId] },
        ),
      };

    case "UNFOLLOW_USER":
      return {
        ...state,
        users: updateUser(state, action.userId, (u) => ({
          ...u,
          following: u.following.filter((id) => id !== action.targetId),
        })),
      };

    case "BLOCK_USER":
      return {
        ...state,
        users: updateUser(state, action.userId, (u) =>
          u.blocked.includes(action.targetId)
            ? u
            : { ...u, blocked: [...u.blocked, action.targetId] },
        ),
      };

    case "UNBLOCK_USER":
      return {
        ...state,
        users: updateUser(state, action.userId, (u) => ({
          ...u,
          blocked: u.blocked.filter((id) => id !== action.targetId),
        })),
      };

    case "REPORT_POST":
      return {
        ...state,
        posts: state.posts.map((p) =>
          p.id === action.postId
            ? {
                ...p,
                reported: true,
                reportReasons: [...p.reportReasons, action.reason],
              }
            : p,
        ),
      };

    case "REPORT_COMMENT":
      return {
        ...state,
        comments: state.comments.map((c) =>
          c.id === action.commentId
            ? {
                ...c,
                reported: true,
                reportReasons: [...c.reportReasons, action.reason],
              }
            : c,
        ),
      };

    case "REMOVE_POST":
      return {
        ...state,
        posts: state.posts.map((p) => (p.id === action.postId ? { ...p, removed: true } : p)),
      };

    case "APPROVE_POST":
      return {
        ...state,
        posts: state.posts.map((p) =>
          p.id === action.postId ? { ...p, removed: false, reported: false, reportReasons: [] } : p,
        ),
      };

    case "REMOVE_COMMENT":
      return {
        ...state,
        comments: state.comments.map((c) =>
          c.id === action.commentId ? { ...c, removed: true } : c,
        ),
      };

    case "APPROVE_COMMENT":
      return {
        ...state,
        comments: state.comments.map((c) =>
          c.id === action.commentId
            ? { ...c, removed: false, reported: false, reportReasons: [] }
            : c,
        ),
      };

    case "BAN_USER":
      return {
        ...state,
        subreddits: state.subreddits.map((s) =>
          s.id === action.subredditId && !s.bannedUsers.includes(action.userId)
            ? {
                ...s,
                bannedUsers: [...s.bannedUsers, action.userId],
                members: s.members.filter((id) => id !== action.userId),
              }
            : s,
        ),
      };

    case "UNBAN_USER":
      return {
        ...state,
        subreddits: state.subreddits.map((s) =>
          s.id === action.subredditId
            ? {
                ...s,
                bannedUsers: s.bannedUsers.filter((id) => id !== action.userId),
              }
            : s,
        ),
      };

    case "LOAD_STATE":
      return action.state;
  }
}

interface StoreContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, null, loadState);

  useEffect(() => {
    saveState(state);
  }, [state]);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.classList.toggle("dark", state.theme === "dark");
  }, [state.theme]);

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch]);

  return <StoreContext value={value}>{children}</StoreContext>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

/** Returns the currently logged-in user, or undefined if not logged in */
export function useCurrentUser() {
  const { state } = useStore();
  if (state.currentUserId === "") return undefined;
  return state.users.find((u) => u.id === state.currentUserId);
}

/** Returns a subreddit by ID, or undefined if not found */
export function useSubreddit(id: string) {
  const { state } = useStore();
  return state.subreddits.find((s) => s.id === id);
}

/** Returns a post by ID, or undefined if not found */
export function usePost(id: string) {
  const { state } = useStore();
  return state.posts.find((p) => p.id === id);
}
