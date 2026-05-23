export interface User {
  id: string;
  username: string;
  name: string;
  avatarUrl: string;
  bio: string;
  followers: number;
  following: number;
  postsCount: number;
  hasStory: boolean;
  storyViewed: boolean;
}

export interface Comment {
  id: string;
  userId: string;
  text: string;
  timestamp: string;
}

export interface Post {
  id: string;
  userId: string;
  imageUrl: string;
  caption: string;
  likes: number;
  liked: boolean;
  saved: boolean;
  comments: Comment[];
  location?: string;
  timestamp: string;
}

export interface Story {
  id: string;
  userId: string;
  imageUrl: string;
  viewed: boolean;
  timestamp: string;
}
