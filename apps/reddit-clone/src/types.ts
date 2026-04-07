// All type definitions for the Reddit clone

export interface User {
  id: string;
  username: string;
  password: string; // plain text for simulation
  createdAt: number;
  avatar: string; // emoji or URL, default emoji
  bio: string;
  savedPosts: string[];
  savedComments: string[];
  upvotedPosts: string[];
  downvotedPosts: string[];
  upvotedComments: string[];
  downvotedComments: string[];
  following: string[]; // user IDs
  blocked: string[]; // user IDs
  history: string[]; // post IDs browsed
}

export interface SubredditRule {
  title: string;
  description: string;
}

export interface Subreddit {
  id: string;
  name: string; // without r/ prefix
  description: string;
  banner: string; // color or URL
  icon: string; // emoji
  rules: SubredditRule[];
  createdAt: number;
  createdBy: string; // user ID
  members: string[]; // user IDs
  moderators: string[]; // user IDs
  bannedUsers: string[]; // user IDs
  flairs: string[];
}

export interface Award {
  type: "free" | "silver" | "gold" | "platinum";
  givenBy: string; // user ID
  givenAt: number;
}

export interface Post {
  id: string;
  type: "text" | "link" | "image";
  title: string;
  body: string; // markdown content or empty
  url: string; // for link posts or empty
  imageUrl: string; // for image posts or empty
  subredditId: string;
  authorId: string;
  createdAt: number;
  updatedAt: number;
  upvotes: number;
  downvotes: number;
  flair: string; // empty if none
  spoiler: boolean;
  nsfw: boolean;
  awards: Award[];
  crosspostedFrom: string; // original post ID or empty
  reported: boolean;
  reportReasons: string[];
  removed: boolean;
}

export interface Comment {
  id: string;
  postId: string;
  parentId: string; // parent comment ID or empty string for top-level
  authorId: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  upvotes: number;
  downvotes: number;
  awards: Award[];
  reported: boolean;
  reportReasons: string[];
  removed: boolean;
}

export interface Message {
  id: string;
  fromId: string;
  toId: string;
  subject: string;
  body: string;
  createdAt: number;
  read: boolean;
}

export type SortMode = "hot" | "new" | "top" | "rising" | "controversial";
export type TimeFilter = "hour" | "today" | "week" | "month" | "year" | "all";
export type CommentSort = "best" | "top" | "new" | "controversial" | "old";
export type ThemeMode = "light" | "dark";

export interface AppState {
  users: User[];
  subreddits: Subreddit[];
  posts: Post[];
  comments: Comment[];
  messages: Message[];
  currentUserId: string; // empty if not logged in
  theme: ThemeMode;
}

// Action types for the reducer
export type AppAction =
  | { type: "LOGIN"; userId: string }
  | { type: "LOGOUT" }
  | { type: "SIGNUP"; user: User }
  | { type: "SET_THEME"; theme: ThemeMode }
  | { type: "CREATE_POST"; post: Post }
  | { type: "EDIT_POST"; postId: string; title: string; body: string }
  | { type: "DELETE_POST"; postId: string }
  | {
      type: "VOTE_POST";
      postId: string;
      userId: string;
      direction: "up" | "down" | "none";
    }
  | { type: "TOGGLE_SPOILER"; postId: string }
  | { type: "TOGGLE_NSFW"; postId: string }
  | { type: "CREATE_COMMENT"; comment: Comment }
  | { type: "EDIT_COMMENT"; commentId: string; body: string }
  | { type: "DELETE_COMMENT"; commentId: string }
  | {
      type: "VOTE_COMMENT";
      commentId: string;
      userId: string;
      direction: "up" | "down" | "none";
    }
  | { type: "CREATE_SUBREDDIT"; subreddit: Subreddit }
  | { type: "JOIN_SUBREDDIT"; subredditId: string; userId: string }
  | { type: "LEAVE_SUBREDDIT"; subredditId: string; userId: string }
  | {
      type: "UPDATE_SUBREDDIT_RULES";
      subredditId: string;
      rules: SubredditRule[];
    }
  | { type: "UPDATE_SUBREDDIT_FLAIRS"; subredditId: string; flairs: string[] }
  | { type: "SAVE_POST"; userId: string; postId: string }
  | { type: "UNSAVE_POST"; userId: string; postId: string }
  | { type: "SAVE_COMMENT"; userId: string; commentId: string }
  | { type: "UNSAVE_COMMENT"; userId: string; commentId: string }
  | { type: "ADD_TO_HISTORY"; userId: string; postId: string }
  | { type: "SEND_MESSAGE"; message: Message }
  | { type: "READ_MESSAGE"; messageId: string }
  | { type: "GIVE_AWARD_POST"; postId: string; award: Award }
  | { type: "GIVE_AWARD_COMMENT"; commentId: string; award: Award }
  | { type: "FOLLOW_USER"; userId: string; targetId: string }
  | { type: "UNFOLLOW_USER"; userId: string; targetId: string }
  | { type: "BLOCK_USER"; userId: string; targetId: string }
  | { type: "UNBLOCK_USER"; userId: string; targetId: string }
  | { type: "REPORT_POST"; postId: string; reason: string }
  | { type: "REPORT_COMMENT"; commentId: string; reason: string }
  | { type: "REMOVE_POST"; postId: string }
  | { type: "APPROVE_POST"; postId: string }
  | { type: "REMOVE_COMMENT"; commentId: string }
  | { type: "APPROVE_COMMENT"; commentId: string }
  | { type: "BAN_USER"; subredditId: string; userId: string }
  | { type: "UNBAN_USER"; subredditId: string; userId: string }
  | { type: "LOAD_STATE"; state: AppState };
