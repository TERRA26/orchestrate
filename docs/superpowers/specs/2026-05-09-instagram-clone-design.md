# Instagram Clone — Design Spec
**Date:** 2026-05-09  
**Status:** Approved

## Overview

A fully functional Instagram clone built as a standalone React/Vite/Tailwind app at `apps/instagram-clone/`. Follows the same monorepo pattern as `apps/reddit-clone`. No backend — all data is seeded in-memory via Zustand. Runs on a local Vite dev port and is viewable in the Orchestrate browser preview.

**Surfaces in scope:** Feed, Stories, Explore, Profile  
**Layout:** Responsive — desktop sidebar nav (Instagram Web style) + mobile bottom tab bar  
**Auth:** Single hardcoded logged-in user (`@alex`), no login screen

---

## Architecture

### App Location
`apps/instagram-clone/` — new Bun workspace added to the monorepo root `package.json` workspaces.

### Stack
- React 19 + React Router v7
- Tailwind CSS v4 (via `@tailwindcss/vite`)
- Zustand for state
- Lucide React for icons
- Vite dev server

### Routes
| Path | Component |
|------|-----------|
| `/` | Feed page |
| `/explore` | Explore grid page |
| `/profile/:username` | Profile page |
| Stories open as a modal overlay — not a route |
| Post detail opens as a modal overlay — not a route |

### Layout
**Desktop (≥768px):**
- Left sidebar: fixed ~244px wide, contains logo, nav icon links, current user avatar + username
- Main content: centered, max-width ~630px
- Right column (≥1280px): suggested users panel (~320px)

**Mobile (<768px):**
- Top bar: Instagram wordmark logo + heart (notifications) + messenger icons
- Bottom tab bar: Home | Search | + (disabled placeholder) | Reels (disabled placeholder) | Profile

---

## Components

### Pages
- `FeedPage` — renders `StoriesRow` + list of `PostCard`
- `ExplorePage` — renders masonry-style 3-column image grid
- `ProfilePage` — renders profile header + post grid tabs

### Shared Components
| Component | Purpose |
|-----------|---------|
| `NavBar` | Renders desktop sidebar or mobile top+bottom bars depending on viewport |
| `StoriesRow` | Horizontal scrollable list of story avatar circles |
| `Avatar` | Avatar image with optional gradient story ring (viewed = gray, unviewed = gradient) |
| `PostCard` | Full feed post: header, image, action bar, likes, caption, comments preview |
| `ActionBar` | Like / Comment / Share / Save icon buttons |
| `StoryModal` | Full-screen story viewer with progress bar, auto-advance, left/right nav |
| `PostModal` | Single post detail view with full comments list |

### Interactions
- **Double-tap/click post image** → like toggle with heart burst animation
- **Like button** → toggle liked state
- **Save button** → toggle saved state
- **Follow/Unfollow** → toggle on Profile page, updates follower count
- **Story tap** → opens `StoryModal`, marks story as viewed (ring becomes gray)
- **Story auto-advance** → 5s per story, progress bar segments at top
- **Explore image click** → opens `PostModal`

---

## Data Model

```ts
interface User {
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

interface Post {
  id: string;
  userId: string;
  imageUrl: string;
  caption: string;
  likes: number;
  liked: boolean;
  saved: boolean;
  comments: Comment[];
  location?: string;
  timestamp: string; // relative, e.g. "2 hours ago"
}

interface Comment {
  id: string;
  userId: string;
  text: string;
  timestamp: string;
}

interface Story {
  id: string;
  userId: string;
  imageUrl: string;
  viewed: boolean;
  timestamp: string;
}
```

### Seed Data
- **15 users** — mix of photography, food, travel, lifestyle themes
- **30 posts** — real Unsplash photo URLs, realistic captions with hashtags, like counts 100–50k
- **10 stories** — one per active story user
- **Current user:** `@alex` follows 8 seeded users (their posts populate the feed and story tray); remaining 7 appear in Explore

### Zustand Stores
| Store | Owns |
|-------|------|
| `useUserStore` | Current user, all seeded users, follow/unfollow action |
| `useFeedStore` | Posts list, like action, save action |
| `useStoriesStore` | Stories list, mark-viewed action, active story index |

---

## Acceptance Criteria

- `test:` `bun run typecheck` passes with no errors
- `test:` `bun run build` produces a valid dist
- `screenshot:` Feed loads with story tray and at least 5 posts visible
- `screenshot:` Clicking a story opens the modal with progress bar
- `screenshot:` Explore page shows 3-column image grid
- `screenshot:` Navigating to `/profile/alex` shows post grid and follower counts
- `manual:` Like/save toggles work and persist within the session
- `manual:` Follow/unfollow updates count on profile page
- `manual:` Responsive layout switches correctly between desktop sidebar and mobile bottom tabs

---

## Out of Scope
- DMs / messaging
- Reels (icon present, disabled)
- Notifications page
- Image upload
- Real authentication
- Backend / persistence across refresh
