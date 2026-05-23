# Instagram Clone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a responsive Instagram clone with Feed, Stories, Explore, and Profile surfaces as a standalone Vite app at `apps/instagram-clone/`.

**Architecture:** React 19 SPA with React Router v7, Zustand stores for in-memory state, Tailwind CSS v4 via `@tailwindcss/vite`. No backend — all data seeded in-memory. Desktop sidebar nav (≥768px) + mobile bottom tab bar (<768px).

**Tech Stack:** React 19, React Router v7, Zustand 5, Tailwind CSS v4, Lucide React, Vite 8, TypeScript

---

## File Map

```
apps/instagram-clone/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css
    ├── types.ts
    ├── seed.ts
    ├── store/
    │   ├── userStore.ts
    │   ├── feedStore.ts
    │   └── storiesStore.ts
    ├── components/
    │   ├── Avatar.tsx
    │   ├── ActionBar.tsx
    │   ├── NavBar.tsx
    │   ├── StoriesRow.tsx
    │   ├── PostCard.tsx
    │   ├── StoryModal.tsx
    │   ├── PostModal.tsx
    │   └── SuggestedUsers.tsx
    └── pages/
        ├── FeedPage.tsx
        ├── ExplorePage.tsx
        └── ProfilePage.tsx
```

---

## Task 1: Scaffold workspace

**Files:**
- Create: `apps/instagram-clone/package.json`
- Create: `apps/instagram-clone/tsconfig.json`
- Create: `apps/instagram-clone/vite.config.ts`
- Create: `apps/instagram-clone/index.html`
- Create: `apps/instagram-clone/src/index.css`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@orchestrate/instagram-clone",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port 5175",
    "build": "vite build",
    "preview": "vite preview --port 5175",
    "typecheck": "tsc --noEmit",
    "test": "echo 'No tests yet'"
  },
  "dependencies": {
    "lucide-react": "^0.564.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.6.1",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^6.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "catalog:",
    "vite": "^8.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create vite.config.ts**

```ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5175, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
});
```

- [ ] **Step 4: Create index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Instagram</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create src/index.css**

```css
@import "tailwindcss";

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #fafafa;
  color: #262626;
}

.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
.hide-scrollbar::-webkit-scrollbar { display: none; }

.story-ring {
  background: linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888);
}

@keyframes heart-burst {
  0% { transform: scale(0); opacity: 1; }
  50% { transform: scale(1.4); opacity: 1; }
  100% { transform: scale(1); opacity: 0; }
}
.heart-burst { animation: heart-burst 0.8s ease-out forwards; }

@keyframes story-progress {
  from { width: 0%; }
  to { width: 100%; }
}
.story-progress-active { animation: story-progress linear forwards; }
```

- [ ] **Step 6: Install dependencies from monorepo root**

```bash
cd /path/to/orchestrate  # monorepo root (where bun.lock lives)
bun install
```

Expected: Dependencies resolve, zustand added to lockfile.

- [ ] **Step 7: Commit**

```bash
git add apps/instagram-clone/
git commit -m "feat(instagram-clone): scaffold workspace"
```

---

## Task 2: Types and seed data

**Files:**
- Create: `apps/instagram-clone/src/types.ts`
- Create: `apps/instagram-clone/src/seed.ts`

- [ ] **Step 1: Create src/types.ts**

```ts
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
```

- [ ] **Step 2: Create src/seed.ts**

```ts
import type { User, Post, Story } from "./types";

export const CURRENT_USER_ID = "u1";
export const FOLLOWING_IDS = ["u2", "u3", "u4", "u5", "u6", "u7", "u8", "u9"];

export const SEED_USERS: User[] = [
  { id: "u1", username: "alex", name: "Alex Rivera", avatarUrl: "https://i.pravatar.cc/150?img=1", bio: "📸 Photography | ✈️ Travel | 🌿 Nature", followers: 1243, following: 891, postsCount: 47, hasStory: false, storyViewed: false },
  { id: "u2", username: "emma_creates", name: "Emma Chen", avatarUrl: "https://i.pravatar.cc/150?img=2", bio: "🎨 Artist & illustrator | Making things beautiful ✨", followers: 28400, following: 312, postsCount: 234, hasStory: true, storyViewed: false },
  { id: "u3", username: "mike_travels", name: "Mike Torres", avatarUrl: "https://i.pravatar.cc/150?img=3", bio: "🌍 Exploring one city at a time | 47 countries", followers: 52100, following: 891, postsCount: 891, hasStory: true, storyViewed: false },
  { id: "u4", username: "sarah.bakes", name: "Sarah Kim", avatarUrl: "https://i.pravatar.cc/150?img=4", bio: "🍰 Pastry chef | 🎂 Custom cakes | Recipes ⬇️", followers: 15600, following: 203, postsCount: 412, hasStory: true, storyViewed: false },
  { id: "u5", username: "noah_lifts", name: "Noah Johnson", avatarUrl: "https://i.pravatar.cc/150?img=5", bio: "💪 Fitness | 🥗 Nutrition | Certified PT", followers: 8900, following: 445, postsCount: 178, hasStory: true, storyViewed: false },
  { id: "u6", username: "lily.designs", name: "Lily Park", avatarUrl: "https://i.pravatar.cc/150?img=6", bio: "🖌️ UX Designer | Minimalist | Coffee ☕", followers: 34200, following: 178, postsCount: 567, hasStory: true, storyViewed: false },
  { id: "u7", username: "carlos_foto", name: "Carlos Mendez", avatarUrl: "https://i.pravatar.cc/150?img=7", bio: "📷 Street photographer | 🌆 Urban | Based in NYC", followers: 67800, following: 321, postsCount: 1023, hasStory: true, storyViewed: false },
  { id: "u8", username: "zoe_wellness", name: "Zoe Williams", avatarUrl: "https://i.pravatar.cc/150?img=8", bio: "🧘 Yoga instructor | 🌿 Plant-based | Mindfulness", followers: 22300, following: 567, postsCount: 345, hasStory: true, storyViewed: false },
  { id: "u9", username: "jake_codes", name: "Jake Brown", avatarUrl: "https://i.pravatar.cc/150?img=9", bio: "👨‍💻 Full-stack dev | Open source | Building things 🚀", followers: 4500, following: 234, postsCount: 89, hasStory: true, storyViewed: false },
  { id: "u10", username: "diana_fashion", name: "Diana Lopez", avatarUrl: "https://i.pravatar.cc/150?img=10", bio: "👗 Fashion | OOTD | Collabs DM ✉️", followers: 143000, following: 892, postsCount: 2341, hasStory: true, storyViewed: false },
  { id: "u11", username: "ryan_outdoors", name: "Ryan Mitchell", avatarUrl: "https://i.pravatar.cc/150?img=11", bio: "🏔️ Hiker | Camper | 🌲 Pacific Northwest", followers: 31200, following: 445, postsCount: 678, hasStory: true, storyViewed: false },
  { id: "u12", username: "sofia.eats", name: "Sofia Patel", avatarUrl: "https://i.pravatar.cc/150?img=12", bio: "🍜 Foodie | 📍 NYC | Restaurant reviews", followers: 89400, following: 1023, postsCount: 1456, hasStory: false, storyViewed: false },
  { id: "u13", username: "max_music", name: "Max Schmidt", avatarUrl: "https://i.pravatar.cc/150?img=13", bio: "🎵 Producer | 🎹 Multi-instrumentalist | Tours soon", followers: 56700, following: 678, postsCount: 234, hasStory: false, storyViewed: false },
  { id: "u14", username: "nina_art", name: "Nina Okafor", avatarUrl: "https://i.pravatar.cc/150?img=14", bio: "🎭 Fine artist | Commissions open | Exhibitions 🖼️", followers: 28900, following: 345, postsCount: 567, hasStory: false, storyViewed: false },
  { id: "u15", username: "tom.architecture", name: "Tom Anderson", avatarUrl: "https://i.pravatar.cc/150?img=15", bio: "🏛️ Architect | Urban design | 📐 Sketches", followers: 41200, following: 234, postsCount: 789, hasStory: false, storyViewed: false },
];

export const SEED_POSTS: Post[] = [
  { id: "p1", userId: "u2", imageUrl: "https://picsum.photos/seed/emma1/640/640", caption: "Working on a new series of watercolor illustrations 🎨 Each piece takes about 3 days. Worth every second. #watercolor #illustration #art #artistsoninstagram", likes: 3241, liked: false, saved: false, location: "Brooklyn, NY", timestamp: "2 hours ago", comments: [
    { id: "c1", userId: "u4", text: "This is absolutely stunning! 😍", timestamp: "1 hour ago" },
    { id: "c2", userId: "u6", text: "The colors are incredible 🌈", timestamp: "45 min ago" },
  ]},
  { id: "p2", userId: "u2", imageUrl: "https://picsum.photos/seed/emma2/640/640", caption: "Studio vibes on a Sunday afternoon ✨ #artstudio #creative #process", likes: 1823, liked: false, saved: false, timestamp: "1 day ago", comments: [
    { id: "c3", userId: "u3", text: "Love your workspace 🙌", timestamp: "20 hours ago" },
  ]},
  { id: "p3", userId: "u3", imageUrl: "https://picsum.photos/seed/mike1/640/640", caption: "Santorini at golden hour never gets old 🌅 The light here is unlike anything I've seen. #santorini #greece #travel #goldenhour", likes: 8934, liked: false, saved: false, location: "Santorini, Greece", timestamp: "3 hours ago", comments: [
    { id: "c4", userId: "u7", text: "That light is 🔥", timestamp: "2 hours ago" },
    { id: "c5", userId: "u1", text: "Adding this to my bucket list!", timestamp: "1 hour ago" },
  ]},
  { id: "p4", userId: "u3", imageUrl: "https://picsum.photos/seed/mike2/640/640", caption: "Lost in the medina 🕌 Morocco is endlessly fascinating. #morocco #marrakech #travel", likes: 5621, liked: false, saved: false, location: "Marrakech, Morocco", timestamp: "2 days ago", comments: [
    { id: "c6", userId: "u8", text: "The colors!! 😍", timestamp: "2 days ago" },
  ]},
  { id: "p5", userId: "u4", imageUrl: "https://picsum.photos/seed/sarah1/640/640", caption: "Six-layer lemon lavender cake for today's wedding 💛 I'll never get tired of that first slice reveal! #weddingcake #pastry", likes: 4512, liked: false, saved: false, location: "Seattle, WA", timestamp: "5 hours ago", comments: [
    { id: "c7", userId: "u2", text: "This is a work of art 🎂", timestamp: "4 hours ago" },
  ]},
  { id: "p6", userId: "u4", imageUrl: "https://picsum.photos/seed/sarah2/640/640", caption: "Croissant Sunday 🥐 Laminated dough is a labor of love but so worth it. #croissant #baking #frenchpastry", likes: 2341, liked: false, saved: false, timestamp: "4 days ago", comments: []},
  { id: "p7", userId: "u5", imageUrl: "https://picsum.photos/seed/noah1/640/640", caption: "Morning session done ✅ 5am wake up never felt so good. Consistency is everything. #fitness #gym #morningworkout", likes: 1892, liked: false, saved: false, location: "Chicago, IL", timestamp: "6 hours ago", comments: [
    { id: "c8", userId: "u3", text: "You inspire me every day man 💪", timestamp: "5 hours ago" },
  ]},
  { id: "p8", userId: "u5", imageUrl: "https://picsum.photos/seed/noah2/640/640", caption: "Post-workout meal prep for the week 🥗 Protein, veggies, complex carbs. Simple and effective. #mealprep #nutrition", likes: 934, liked: false, saved: false, timestamp: "3 days ago", comments: []},
  { id: "p9", userId: "u6", imageUrl: "https://picsum.photos/seed/lily1/640/640", caption: "New brand identity system shipped today 🎉 White space is not wasted space. #uxdesign #branding #minimalism", likes: 6723, liked: false, saved: true, location: "San Francisco, CA", timestamp: "7 hours ago", comments: [
    { id: "c9", userId: "u2", text: "The attention to detail is unreal 👏", timestamp: "6 hours ago" },
    { id: "c10", userId: "u7", text: "This is gorgeous", timestamp: "5 hours ago" },
  ]},
  { id: "p10", userId: "u6", imageUrl: "https://picsum.photos/seed/lily2/640/640", caption: "Redesigning the way we think about typography 🔤 #typographydesign #graphicdesign", likes: 4231, liked: false, saved: false, timestamp: "5 days ago", comments: []},
  { id: "p11", userId: "u7", imageUrl: "https://picsum.photos/seed/carlos1/640/640", caption: "Rain-soaked streets of Midtown at 3am 🌧️ The city never really sleeps. #streetphotography #nyc #nightphotography", likes: 12431, liked: false, saved: false, location: "New York, NY", timestamp: "1 hour ago", comments: [
    { id: "c11", userId: "u3", text: "The mood in this photo is everything 😮", timestamp: "45 min ago" },
    { id: "c12", userId: "u6", text: "Incredible shot Carlos 🙏", timestamp: "30 min ago" },
  ]},
  { id: "p12", userId: "u7", imageUrl: "https://picsum.photos/seed/carlos2/640/640", caption: "Subway portraits series — #18. Everyone has a story. #subwayphotography #portraitphotography #nyc", likes: 9812, liked: false, saved: false, timestamp: "2 days ago", comments: [
    { id: "c13", userId: "u1", text: "This series is my favorite thing on Instagram", timestamp: "2 days ago" },
  ]},
  { id: "p13", userId: "u8", imageUrl: "https://picsum.photos/seed/zoe1/640/640", caption: "Sunrise flow on the beach 🌅🧘 Starting the week with intention and gratitude. #yoga #wellness #beachyoga", likes: 3241, liked: false, saved: false, location: "Malibu, CA", timestamp: "4 hours ago", comments: [
    { id: "c14", userId: "u4", text: "This looks so peaceful 🙏", timestamp: "3 hours ago" },
  ]},
  { id: "p14", userId: "u8", imageUrl: "https://picsum.photos/seed/zoe2/640/640", caption: "Plant-based bowl goals 🌿 Quinoa, roasted veggies, tahini drizzle. Link in bio for recipe! #plantbased #vegan", likes: 1823, liked: false, saved: false, timestamp: "3 days ago", comments: []},
  { id: "p15", userId: "u9", imageUrl: "https://picsum.photos/seed/jake1/640/640", caption: "Finally shipped v2.0 after 6 months 🚀 Open source and free to use. Link in bio! #webdev #opensource #buildinpublic", likes: 892, liked: false, saved: false, timestamp: "8 hours ago", comments: [
    { id: "c15", userId: "u2", text: "Congrats!! 🎉🎉", timestamp: "7 hours ago" },
  ]},
  { id: "p16", userId: "u9", imageUrl: "https://picsum.photos/seed/jake2/640/640", caption: "Late night coding session ☕ New side project coming soon. Stay tuned. #coding #developer #sideproject", likes: 567, liked: false, saved: false, timestamp: "1 week ago", comments: []},
  { id: "p17", userId: "u10", imageUrl: "https://picsum.photos/seed/diana1/640/640", caption: "SS26 editorial ✨ Fashion is art you wear. #fashion #editorial #style #ootd", likes: 45231, liked: false, saved: false, location: "Milan, Italy", timestamp: "1 day ago", comments: []},
  { id: "p18", userId: "u10", imageUrl: "https://picsum.photos/seed/diana2/640/800", caption: "The bag of the season 👜 #fashionblogger #accessories #luxury", likes: 38900, liked: false, saved: false, timestamp: "3 days ago", comments: []},
  { id: "p19", userId: "u11", imageUrl: "https://picsum.photos/seed/ryan1/640/640", caption: "Mount Rainier summit at 14,411ft 🏔️ Four years of training for this moment. #hiking #summitday #outdoors", likes: 12341, liked: false, saved: false, location: "Mount Rainier, WA", timestamp: "2 days ago", comments: []},
  { id: "p20", userId: "u11", imageUrl: "https://picsum.photos/seed/ryan2/640/800", caption: "Campfire stories 🔥 Nothing beats falling asleep under the stars. #camping #nature #pnw", likes: 8923, liked: false, saved: false, timestamp: "5 days ago", comments: []},
  { id: "p21", userId: "u12", imageUrl: "https://picsum.photos/seed/sofia1/640/640", caption: "Best ramen I've had all year 🍜 Little hole-in-the-wall in the East Village. #ramen #nycfood #foodie", likes: 23412, liked: false, saved: false, location: "East Village, NYC", timestamp: "6 hours ago", comments: []},
  { id: "p22", userId: "u12", imageUrl: "https://picsum.photos/seed/sofia2/640/640", caption: "Omakase at Masa ✨ One of the most extraordinary dining experiences of my life. #omakase #sushi #nyc", likes: 31200, liked: false, saved: false, timestamp: "1 week ago", comments: []},
  { id: "p23", userId: "u13", imageUrl: "https://picsum.photos/seed/max1/640/640", caption: "In the studio working on something special 🎵 Drop coming soon. #producer #music #studio", likes: 8934, liked: false, saved: false, location: "Los Angeles, CA", timestamp: "1 day ago", comments: []},
  { id: "p24", userId: "u13", imageUrl: "https://picsum.photos/seed/max2/640/800", caption: "Setup upgraded 🎹 New sounds dropping this month. #homerecording #musicproduction #beats", likes: 6723, liked: false, saved: false, timestamp: "4 days ago", comments: []},
  { id: "p25", userId: "u14", imageUrl: "https://picsum.photos/seed/nina1/640/640", caption: "Finished piece for the Lagos Art Week exhibition 🖼️ Oil on canvas, 120x160cm. DM for commissions. #finearts #oilpainting", likes: 15234, liked: false, saved: false, location: "Lagos, Nigeria", timestamp: "2 days ago", comments: []},
  { id: "p26", userId: "u14", imageUrl: "https://picsum.photos/seed/nina2/640/800", caption: "Process shot — this one took 3 weeks but I love how the light came out 🌟 #wip #artstudio #paintingprocess", likes: 9812, liked: false, saved: false, timestamp: "1 week ago", comments: []},
  { id: "p27", userId: "u15", imageUrl: "https://picsum.photos/seed/tom1/640/640", caption: "Herzog & de Meuron's Elbphilharmonie at dusk 🏛️ Architecture that makes you feel small in the best way. #architecture #hamburg", likes: 18923, liked: false, saved: false, location: "Hamburg, Germany", timestamp: "3 days ago", comments: []},
  { id: "p28", userId: "u15", imageUrl: "https://picsum.photos/seed/tom2/640/800", caption: "Structural sketch series, no. 34 📐 Back to basics with pencil and paper. #architecturaldrawing #sketch", likes: 7234, liked: false, saved: false, timestamp: "6 days ago", comments: []},
  { id: "p29", userId: "u1", imageUrl: "https://picsum.photos/seed/alex1/640/640", caption: "Golden hour at the park 🌅 Sometimes you just need to step outside. #photography #goldenhour #nature", likes: 234, liked: false, saved: false, location: "Central Park, NYC", timestamp: "1 week ago", comments: []},
  { id: "p30", userId: "u1", imageUrl: "https://picsum.photos/seed/alex2/640/640", caption: "Film dump from last weekend 📷 #35mm #filmphoto #analog", likes: 189, liked: false, saved: false, timestamp: "2 weeks ago", comments: []},
];

export const SEED_STORIES: Story[] = [
  { id: "s1", userId: "u2", imageUrl: "https://picsum.photos/seed/story-emma/640/1136", viewed: false, timestamp: "2 hours ago" },
  { id: "s2", userId: "u3", imageUrl: "https://picsum.photos/seed/story-mike/640/1136", viewed: false, timestamp: "3 hours ago" },
  { id: "s3", userId: "u4", imageUrl: "https://picsum.photos/seed/story-sarah/640/1136", viewed: false, timestamp: "1 hour ago" },
  { id: "s4", userId: "u5", imageUrl: "https://picsum.photos/seed/story-noah/640/1136", viewed: false, timestamp: "5 hours ago" },
  { id: "s5", userId: "u6", imageUrl: "https://picsum.photos/seed/story-lily/640/1136", viewed: false, timestamp: "4 hours ago" },
  { id: "s6", userId: "u7", imageUrl: "https://picsum.photos/seed/story-carlos/640/1136", viewed: false, timestamp: "1 hour ago" },
  { id: "s7", userId: "u8", imageUrl: "https://picsum.photos/seed/story-zoe/640/1136", viewed: false, timestamp: "6 hours ago" },
  { id: "s8", userId: "u9", imageUrl: "https://picsum.photos/seed/story-jake/640/1136", viewed: false, timestamp: "2 hours ago" },
  { id: "s9", userId: "u10", imageUrl: "https://picsum.photos/seed/story-diana/640/1136", viewed: false, timestamp: "30 min ago" },
  { id: "s10", userId: "u11", imageUrl: "https://picsum.photos/seed/story-ryan/640/1136", viewed: false, timestamp: "45 min ago" },
];
```

- [ ] **Step 3: Commit**

```bash
git add apps/instagram-clone/src/types.ts apps/instagram-clone/src/seed.ts
git commit -m "feat(instagram-clone): add types and seed data"
```

---

## Task 3: Zustand stores

**Files:**
- Create: `apps/instagram-clone/src/store/userStore.ts`
- Create: `apps/instagram-clone/src/store/feedStore.ts`
- Create: `apps/instagram-clone/src/store/storiesStore.ts`

- [ ] **Step 1: Create src/store/userStore.ts**

```ts
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
```

- [ ] **Step 2: Create src/store/feedStore.ts**

```ts
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
```

- [ ] **Step 3: Create src/store/storiesStore.ts**

```ts
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
```

- [ ] **Step 4: Typecheck**

```bash
cd apps/instagram-clone && bun run typecheck
```

Expected: 0 errors (only types.ts, seed.ts, and stores are checked — no pages yet, that's fine because tsconfig only includes `src` and these files are in src).

Note: typecheck will fail if App.tsx doesn't exist yet. Create a minimal placeholder first:

`src/App.tsx` (temporary, will be replaced in Task 14):
```tsx
export default function App() {
  return <div>Loading...</div>;
}
```

`src/main.tsx` (temporary, will be replaced in Task 14):
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
```

Then run: `cd apps/instagram-clone && bun run typecheck`

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/instagram-clone/src/
git commit -m "feat(instagram-clone): add Zustand stores"
```

---

## Task 4: Avatar and ActionBar components

**Files:**
- Create: `apps/instagram-clone/src/components/Avatar.tsx`
- Create: `apps/instagram-clone/src/components/ActionBar.tsx`

- [ ] **Step 1: Create src/components/Avatar.tsx**

```tsx
interface AvatarProps {
  src: string;
  alt: string;
  size?: number;
  hasStory?: boolean;
  storyViewed?: boolean;
  onClick?: () => void;
}

export default function Avatar({
  src,
  alt,
  size = 40,
  hasStory = false,
  storyViewed = false,
  onClick,
}: AvatarProps) {
  const ringClass = hasStory
    ? storyViewed
      ? "p-[2px] bg-gray-300 rounded-full"
      : "p-[2px] story-ring rounded-full"
    : "";

  return (
    <div
      className={`inline-flex flex-shrink-0 ${ringClass} ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
      style={{ width: hasStory ? size + 6 : size, height: hasStory ? size + 6 : size }}
    >
      <img
        src={src}
        alt={alt}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create src/components/ActionBar.tsx**

```tsx
import { Heart, MessageCircle, Send, Bookmark } from "lucide-react";

interface ActionBarProps {
  liked: boolean;
  saved: boolean;
  onLike: () => void;
  onSave: () => void;
  onComment?: () => void;
}

export default function ActionBar({ liked, saved, onLike, onSave, onComment }: ActionBarProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <div className="flex items-center gap-4">
        <button
          onClick={onLike}
          className="p-0 bg-transparent border-0 cursor-pointer transition-transform active:scale-90"
          aria-label={liked ? "Unlike" : "Like"}
        >
          <Heart
            size={24}
            className={liked ? "fill-red-500 stroke-red-500" : "stroke-[#262626]"}
          />
        </button>
        <button
          onClick={onComment}
          className="p-0 bg-transparent border-0 cursor-pointer"
          aria-label="Comment"
        >
          <MessageCircle size={24} className="stroke-[#262626]" />
        </button>
        <button className="p-0 bg-transparent border-0 cursor-pointer" aria-label="Share">
          <Send size={24} className="stroke-[#262626]" />
        </button>
      </div>
      <button
        onClick={onSave}
        className="p-0 bg-transparent border-0 cursor-pointer"
        aria-label={saved ? "Unsave" : "Save"}
      >
        <Bookmark
          size={24}
          className={saved ? "fill-[#262626] stroke-[#262626]" : "stroke-[#262626]"}
        />
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/instagram-clone && bun run typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/instagram-clone/src/components/
git commit -m "feat(instagram-clone): add Avatar and ActionBar components"
```

---

## Task 5: NavBar component

**Files:**
- Create: `apps/instagram-clone/src/components/NavBar.tsx`

- [ ] **Step 1: Create src/components/NavBar.tsx**

```tsx
import { Home, Search, PlusSquare, Film, User, Instagram } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useUserStore } from "../store/userStore";

export default function NavBar() {
  const currentUser = useUserStore((s) => s.getCurrentUser());
  const navigate = useNavigate();

  const navItems = [
    { to: "/", icon: Home, label: "Home" },
    { to: "/explore", icon: Search, label: "Explore" },
  ];

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 h-screen w-[244px] border-r border-gray-200 bg-white px-3 py-5 z-40">
        <div
          className="mb-8 px-3 cursor-pointer"
          onClick={() => navigate("/")}
        >
          <Instagram size={28} className="stroke-[#262626]" />
        </div>
        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors hover:bg-gray-100 ${
                  isActive ? "font-bold" : ""
                }`
              }
            >
              <Icon size={24} />
              <span>{label}</span>
            </NavLink>
          ))}
          <button className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium hover:bg-gray-100 text-left">
            <PlusSquare size={24} />
            <span>Create</span>
          </button>
          <button className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium hover:bg-gray-100 text-left">
            <Film size={24} />
            <span>Reels</span>
          </button>
          <NavLink
            to={`/profile/${currentUser.username}`}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors hover:bg-gray-100 ${
                isActive ? "font-bold" : ""
              }`
            }
          >
            <img
              src={currentUser.avatarUrl}
              alt={currentUser.username}
              className="w-6 h-6 rounded-full object-cover"
            />
            <span>Profile</span>
          </NavLink>
        </nav>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-[60px] bg-white border-b border-gray-200 flex items-center justify-between px-4 z-40">
        <Instagram size={28} className="stroke-[#262626]" />
        <div className="flex items-center gap-4">
          <button aria-label="Notifications">
            <Heart size={24} className="stroke-[#262626]" />
          </button>
          <button aria-label="Messages">
            <Send size={24} className="stroke-[#262626]" />
          </button>
        </div>
      </header>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-200 flex items-center justify-around z-40">
        <NavLink to="/" end aria-label="Home">
          {({ isActive }) => <Home size={26} className={isActive ? "stroke-[#262626] fill-[#262626]" : "stroke-[#262626]"} />}
        </NavLink>
        <NavLink to="/explore" aria-label="Explore">
          {({ isActive }) => <Search size={26} className={isActive ? "stroke-[#262626] fill-gray-200" : "stroke-[#262626]"} />}
        </NavLink>
        <button aria-label="Create">
          <PlusSquare size={26} className="stroke-[#262626]" />
        </button>
        <button aria-label="Reels">
          <Film size={26} className="stroke-[#262626]" />
        </button>
        <NavLink to={`/profile/${currentUser.username}`} aria-label="Profile">
          {() => (
            <img
              src={currentUser.avatarUrl}
              alt={currentUser.username}
              className="w-7 h-7 rounded-full object-cover"
            />
          )}
        </NavLink>
      </nav>
    </>
  );
}
```

Note: The `Heart` and `Send` icons in the mobile top bar need to be imported. The import line already includes them via the same lucide-react import. Confirm the import includes: `Heart, Send, Home, Search, PlusSquare, Film, User, Instagram`.

- [ ] **Step 2: Typecheck**

```bash
cd apps/instagram-clone && bun run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/instagram-clone/src/components/NavBar.tsx
git commit -m "feat(instagram-clone): add responsive NavBar"
```

---

## Task 6: StoriesRow component

**Files:**
- Create: `apps/instagram-clone/src/components/StoriesRow.tsx`

- [ ] **Step 1: Create src/components/StoriesRow.tsx**

```tsx
import Avatar from "./Avatar";
import { useStoriesStore } from "../store/storiesStore";
import { useUserStore } from "../store/userStore";
import { FOLLOWING_IDS } from "../seed";

export default function StoriesRow() {
  const stories = useStoriesStore((s) => s.stories);
  const openStory = useStoriesStore((s) => s.openStory);
  const getUserById = useUserStore((s) => s.getUserById);

  // Show stories from followed users only
  const trayStories = stories.filter((s) => FOLLOWING_IDS.includes(s.userId));

  return (
    <div className="bg-white border border-gray-200 rounded-md mb-4 mx-auto max-w-[470px]">
      <div className="flex gap-4 px-4 py-3 overflow-x-auto hide-scrollbar">
        {trayStories.map((story) => {
          const user = getUserById(story.userId);
          if (!user) return null;
          return (
            <button
              key={story.id}
              onClick={() => openStory(story.id)}
              className="flex flex-col items-center gap-1 flex-shrink-0 bg-transparent border-0 cursor-pointer p-0"
            >
              <Avatar
                src={user.avatarUrl}
                alt={user.username}
                size={56}
                hasStory
                storyViewed={story.viewed}
              />
              <span className="text-xs text-[#262626] max-w-[64px] truncate">
                {user.username}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/instagram-clone && bun run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/instagram-clone/src/components/StoriesRow.tsx
git commit -m "feat(instagram-clone): add StoriesRow component"
```

---

## Task 7: PostCard component

**Files:**
- Create: `apps/instagram-clone/src/components/PostCard.tsx`

- [ ] **Step 1: Create src/components/PostCard.tsx**

```tsx
import { useState, useRef } from "react";
import { MoreHorizontal } from "lucide-react";
import { Link } from "react-router-dom";
import Avatar from "./Avatar";
import ActionBar from "./ActionBar";
import { useFeedStore } from "../store/feedStore";
import { useUserStore } from "../store/userStore";
import type { Post } from "../types";

interface PostCardProps {
  post: Post;
  onOpenComments?: () => void;
}

export default function PostCard({ post, onOpenComments }: PostCardProps) {
  const [showHeart, setShowHeart] = useState(false);
  const lastTapRef = useRef(0);
  const toggleLike = useFeedStore((s) => s.toggleLike);
  const toggleSave = useFeedStore((s) => s.toggleSave);
  const getUserById = useUserStore((s) => s.getUserById);
  const user = getUserById(post.userId);

  if (!user) return null;

  const handleImageClick = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 350) {
      if (!post.liked) toggleLike(post.id);
      setShowHeart(true);
      setTimeout(() => setShowHeart(false), 900);
    }
    lastTapRef.current = now;
  };

  const formatLikes = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : n.toString();

  return (
    <article className="bg-white border border-gray-200 rounded-md mb-4 mx-auto max-w-[470px]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3">
        <Link to={`/profile/${user.username}`} className="flex items-center gap-3 no-underline">
          <Avatar src={user.avatarUrl} alt={user.username} size={32} hasStory={user.hasStory} storyViewed={user.storyViewed} />
          <div>
            <p className="text-sm font-semibold text-[#262626] m-0">{user.username}</p>
            {post.location && <p className="text-xs text-[#737373] m-0">{post.location}</p>}
          </div>
        </Link>
        <button className="bg-transparent border-0 cursor-pointer p-1">
          <MoreHorizontal size={20} />
        </button>
      </div>

      {/* Image */}
      <div className="relative select-none" onClick={handleImageClick}>
        <img
          src={post.imageUrl}
          alt="Post"
          className="w-full block object-cover"
          style={{ maxHeight: 585 }}
          draggable={false}
        />
        {showHeart && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <svg
              className="heart-burst"
              width="100"
              height="100"
              viewBox="0 0 24 24"
              fill="white"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z" />
            </svg>
          </div>
        )}
      </div>

      {/* Actions */}
      <ActionBar
        liked={post.liked}
        saved={post.saved}
        onLike={() => toggleLike(post.id)}
        onSave={() => toggleSave(post.id)}
        onComment={onOpenComments}
      />

      {/* Likes */}
      <div className="px-3 pb-1">
        <p className="text-sm font-semibold m-0">{formatLikes(post.likes)} likes</p>
      </div>

      {/* Caption */}
      <div className="px-3 pb-1">
        <p className="text-sm m-0">
          <Link to={`/profile/${user.username}`} className="font-semibold text-[#262626] no-underline mr-1">
            {user.username}
          </Link>
          {post.caption}
        </p>
      </div>

      {/* Comments preview */}
      {post.comments.length > 0 && (
        <div className="px-3 pb-1">
          <button
            onClick={onOpenComments}
            className="text-sm text-[#737373] bg-transparent border-0 cursor-pointer p-0"
          >
            View all {post.comments.length} comment{post.comments.length > 1 ? "s" : ""}
          </button>
          {post.comments.slice(0, 2).map((comment) => {
            const commentUser = getUserById(comment.userId);
            return (
              <p key={comment.id} className="text-sm m-0">
                <span className="font-semibold">{commentUser?.username ?? "user"}</span>{" "}
                {comment.text}
              </p>
            );
          })}
        </div>
      )}

      {/* Timestamp */}
      <div className="px-3 pb-3 pt-1">
        <p className="text-xs text-[#737373] uppercase m-0">{post.timestamp}</p>
      </div>
    </article>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/instagram-clone && bun run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/instagram-clone/src/components/PostCard.tsx
git commit -m "feat(instagram-clone): add PostCard component"
```

---

## Task 8: StoryModal component

**Files:**
- Create: `apps/instagram-clone/src/components/StoryModal.tsx`

- [ ] **Step 1: Create src/components/StoryModal.tsx**

```tsx
import { useEffect, useRef } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { useStoriesStore } from "../store/storiesStore";
import { useUserStore } from "../store/userStore";

const STORY_DURATION = 5000;

export default function StoryModal() {
  const stories = useStoriesStore((s) => s.stories);
  const activeStoryId = useStoriesStore((s) => s.activeStoryId);
  const closeStory = useStoriesStore((s) => s.closeStory);
  const nextStory = useStoriesStore((s) => s.nextStory);
  const prevStory = useStoriesStore((s) => s.prevStory);
  const getUserById = useUserStore((s) => s.getUserById);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const story = stories.find((s) => s.id === activeStoryId);
  const user = story ? getUserById(story.userId) : null;
  const currentIndex = stories.findIndex((s) => s.id === activeStoryId);

  useEffect(() => {
    if (!activeStoryId) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      nextStory(activeStoryId);
    }, STORY_DURATION);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeStoryId, nextStory]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeStory();
      if (e.key === "ArrowRight" && activeStoryId) nextStory(activeStoryId);
      if (e.key === "ArrowLeft" && activeStoryId) prevStory(activeStoryId);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeStoryId, closeStory, nextStory, prevStory]);

  if (!story || !user) return null;

  return (
    <div
      className="fixed inset-0 bg-black z-50 flex items-center justify-center"
      onClick={closeStory}
    >
      <div
        className="relative w-full max-w-sm h-full max-h-[90vh] md:max-h-screen"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress bars */}
        <div className="absolute top-3 left-3 right-3 flex gap-1 z-10">
          {stories.map((s, idx) => (
            <div key={s.id} className="flex-1 h-[2px] bg-white/40 rounded-full overflow-hidden">
              {idx < currentIndex ? (
                <div className="h-full w-full bg-white" />
              ) : idx === currentIndex ? (
                <div
                  key={activeStoryId}
                  className="h-full bg-white story-progress-active"
                  style={{ animationDuration: `${STORY_DURATION}ms` }}
                />
              ) : null}
            </div>
          ))}
        </div>

        {/* User header */}
        <div className="absolute top-8 left-3 right-3 flex items-center gap-2 z-10">
          <img src={user.avatarUrl} alt={user.username} className="w-8 h-8 rounded-full object-cover border-2 border-white" />
          <span className="text-white text-sm font-semibold">{user.username}</span>
          <span className="text-white/70 text-xs">{story.timestamp}</span>
        </div>

        {/* Close button */}
        <button
          onClick={closeStory}
          className="absolute top-8 right-3 z-10 bg-transparent border-0 cursor-pointer text-white"
        >
          <X size={24} />
        </button>

        {/* Story image */}
        <img
          src={story.imageUrl}
          alt="Story"
          className="w-full h-full object-cover"
        />

        {/* Navigation zones */}
        <button
          onClick={() => prevStory(story.id)}
          className="absolute left-0 top-0 w-1/3 h-full bg-transparent border-0 cursor-pointer flex items-center justify-start pl-2"
          aria-label="Previous story"
        >
          {currentIndex > 0 && <ChevronLeft size={28} className="text-white opacity-70" />}
        </button>
        <button
          onClick={() => nextStory(story.id)}
          className="absolute right-0 top-0 w-1/3 h-full bg-transparent border-0 cursor-pointer flex items-center justify-end pr-2"
          aria-label="Next story"
        >
          <ChevronRight size={28} className="text-white opacity-70" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/instagram-clone && bun run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/instagram-clone/src/components/StoryModal.tsx
git commit -m "feat(instagram-clone): add StoryModal component"
```

---

## Task 9: PostModal component

**Files:**
- Create: `apps/instagram-clone/src/components/PostModal.tsx`

- [ ] **Step 1: Create src/components/PostModal.tsx**

```tsx
import { useEffect } from "react";
import { X } from "lucide-react";
import { Link } from "react-router-dom";
import ActionBar from "./ActionBar";
import { useFeedStore } from "../store/feedStore";
import { useUserStore } from "../store/userStore";
import type { Post } from "../types";

interface PostModalProps {
  post: Post;
  onClose: () => void;
}

export default function PostModal({ post, onClose }: PostModalProps) {
  const toggleLike = useFeedStore((s) => s.toggleLike);
  const toggleSave = useFeedStore((s) => s.toggleSave);
  const postFromStore = useFeedStore((s) => s.getPostById(post.id)) ?? post;
  const getUserById = useUserStore((s) => s.getUserById);
  const user = getUserById(post.userId);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!user) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg overflow-hidden flex w-full max-w-4xl max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image side */}
        <div className="flex-1 bg-black flex items-center justify-center min-w-0">
          <img src={post.imageUrl} alt="Post" className="max-h-[90vh] w-full object-contain" />
        </div>

        {/* Info side */}
        <div className="w-[340px] flex-shrink-0 flex flex-col border-l border-gray-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <Link to={`/profile/${user.username}`} className="flex items-center gap-3 no-underline" onClick={onClose}>
              <img src={user.avatarUrl} alt={user.username} className="w-8 h-8 rounded-full object-cover" />
              <span className="text-sm font-semibold text-[#262626]">{user.username}</span>
            </Link>
            <button onClick={onClose} className="bg-transparent border-0 cursor-pointer">
              <X size={20} />
            </button>
          </div>

          {/* Caption */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <div className="mb-3">
              <p className="text-sm m-0">
                <span className="font-semibold">{user.username}</span> {post.caption}
              </p>
              <p className="text-xs text-[#737373] mt-1 m-0">{post.timestamp}</p>
            </div>
            {/* Comments */}
            {postFromStore.comments.map((comment) => {
              const cu = getUserById(comment.userId);
              return (
                <div key={comment.id} className="mb-2">
                  <p className="text-sm m-0">
                    <span className="font-semibold">{cu?.username ?? "user"}</span>{" "}
                    {comment.text}
                  </p>
                  <p className="text-xs text-[#737373] m-0">{comment.timestamp}</p>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="border-t border-gray-200">
            <ActionBar
              liked={postFromStore.liked}
              saved={postFromStore.saved}
              onLike={() => toggleLike(post.id)}
              onSave={() => toggleSave(post.id)}
            />
            <div className="px-4 pb-2">
              <p className="text-sm font-semibold m-0">{postFromStore.likes.toLocaleString()} likes</p>
              <p className="text-xs text-[#737373] uppercase mt-1 m-0">{post.timestamp}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/instagram-clone && bun run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/instagram-clone/src/components/PostModal.tsx
git commit -m "feat(instagram-clone): add PostModal component"
```

---

## Task 10: SuggestedUsers component

**Files:**
- Create: `apps/instagram-clone/src/components/SuggestedUsers.tsx`

- [ ] **Step 1: Create src/components/SuggestedUsers.tsx**

```tsx
import { Link } from "react-router-dom";
import { useUserStore } from "../store/userStore";

export default function SuggestedUsers() {
  const users = useUserStore((s) => s.users);
  const currentUser = useUserStore((s) => s.getCurrentUser());
  const followingIds = useUserStore((s) => s.followingIds);
  const toggleFollow = useUserStore((s) => s.toggleFollow);

  const suggestions = users
    .filter((u) => u.id !== currentUser.id && !followingIds.includes(u.id))
    .slice(0, 5);

  const formatCount = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(0)}K` : n.toString();

  return (
    <div className="w-[320px] flex-shrink-0 pt-8 pl-10">
      {/* Current user */}
      <div className="flex items-center gap-3 mb-5">
        <img
          src={currentUser.avatarUrl}
          alt={currentUser.username}
          className="w-11 h-11 rounded-full object-cover"
        />
        <div className="flex-1 min-w-0">
          <Link to={`/profile/${currentUser.username}`} className="text-sm font-semibold text-[#262626] no-underline block truncate">
            {currentUser.username}
          </Link>
          <p className="text-sm text-[#737373] m-0 truncate">{currentUser.name}</p>
        </div>
      </div>

      {/* Suggestions */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-[#737373]">Suggested for you</span>
        <button className="text-xs font-semibold text-[#262626] bg-transparent border-0 cursor-pointer">
          See All
        </button>
      </div>
      <div className="flex flex-col gap-3">
        {suggestions.map((user) => (
          <div key={user.id} className="flex items-center gap-3">
            <img
              src={user.avatarUrl}
              alt={user.username}
              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <Link to={`/profile/${user.username}`} className="text-sm font-semibold text-[#262626] no-underline block truncate">
                {user.username}
              </Link>
              <p className="text-xs text-[#737373] m-0">{formatCount(user.followers)} followers</p>
            </div>
            <button
              onClick={() => toggleFollow(user.id)}
              className="text-xs font-semibold text-[#0095f6] bg-transparent border-0 cursor-pointer"
            >
              Follow
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/instagram-clone && bun run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/instagram-clone/src/components/SuggestedUsers.tsx
git commit -m "feat(instagram-clone): add SuggestedUsers component"
```

---

## Task 11: FeedPage

**Files:**
- Create: `apps/instagram-clone/src/pages/FeedPage.tsx`

- [ ] **Step 1: Create src/pages/FeedPage.tsx**

```tsx
import { useState } from "react";
import StoriesRow from "../components/StoriesRow";
import PostCard from "../components/PostCard";
import PostModal from "../components/PostModal";
import SuggestedUsers from "../components/SuggestedUsers";
import { useFeedStore } from "../store/feedStore";
import type { Post } from "../types";

export default function FeedPage() {
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const getFeedPosts = useFeedStore((s) => s.getFeedPosts);
  const feedPosts = getFeedPosts();

  return (
    <>
      <div className="flex justify-center pt-8 pb-20 md:pb-8 md:pt-4 px-4">
        {/* Feed column */}
        <div className="w-full max-w-[470px]">
          <StoriesRow />
          {feedPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onOpenComments={() => setSelectedPost(post)}
            />
          ))}
        </div>

        {/* Suggested users - desktop only at xl */}
        <div className="hidden xl:block">
          <SuggestedUsers />
        </div>
      </div>

      {selectedPost && (
        <PostModal post={selectedPost} onClose={() => setSelectedPost(null)} />
      )}
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/instagram-clone && bun run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/instagram-clone/src/pages/FeedPage.tsx
git commit -m "feat(instagram-clone): add FeedPage"
```

---

## Task 12: ExplorePage

**Files:**
- Create: `apps/instagram-clone/src/pages/ExplorePage.tsx`

- [ ] **Step 1: Create src/pages/ExplorePage.tsx**

```tsx
import { useState } from "react";
import PostModal from "../components/PostModal";
import { useFeedStore } from "../store/feedStore";
import type { Post } from "../types";

export default function ExplorePage() {
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const posts = useFeedStore((s) => s.posts);

  // Show all posts in explore (shuffled look by reversing)
  const explorePosts = [...posts].reverse();

  return (
    <>
      <div className="pt-16 md:pt-4 pb-20 md:pb-8 px-1 max-w-[935px] mx-auto">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
        >
          {explorePosts.map((post, idx) => (
            <button
              key={post.id}
              onClick={() => setSelectedPost(post)}
              className="bg-transparent border-0 cursor-pointer p-0 overflow-hidden"
              style={{ aspectRatio: idx % 7 === 0 ? "1 / 1.5" : "1 / 1", gridRow: idx % 7 === 0 ? "span 2" : "span 1" }}
            >
              <img
                src={post.imageUrl}
                alt="Explore post"
                className="w-full h-full object-cover hover:opacity-80 transition-opacity"
              />
            </button>
          ))}
        </div>
      </div>

      {selectedPost && (
        <PostModal post={selectedPost} onClose={() => setSelectedPost(null)} />
      )}
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/instagram-clone && bun run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/instagram-clone/src/pages/ExplorePage.tsx
git commit -m "feat(instagram-clone): add ExplorePage"
```

---

## Task 13: ProfilePage

**Files:**
- Create: `apps/instagram-clone/src/pages/ProfilePage.tsx`

- [ ] **Step 1: Create src/pages/ProfilePage.tsx**

```tsx
import { useState } from "react";
import { useParams } from "react-router-dom";
import { Grid3x3, Tag } from "lucide-react";
import PostModal from "../components/PostModal";
import { useUserStore } from "../store/userStore";
import { useFeedStore } from "../store/feedStore";
import type { Post } from "../types";

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const getUserByUsername = useUserStore((s) => s.getUserByUsername);
  const currentUser = useUserStore((s) => s.getCurrentUser());
  const isFollowing = useUserStore((s) => s.isFollowing);
  const toggleFollow = useUserStore((s) => s.toggleFollow);
  const getPostsByUserId = useFeedStore((s) => s.getPostsByUserId);

  const user = getUserByUsername(username ?? "");

  if (!user) {
    return (
      <div className="pt-20 md:pt-8 text-center text-gray-500">User not found.</div>
    );
  }

  const posts = getPostsByUserId(user.id);
  const isOwnProfile = user.id === currentUser.id;
  const following = isFollowing(user.id);

  const formatCount = (n: number) =>
    n >= 1000000
      ? `${(n / 1000000).toFixed(1)}M`
      : n >= 1000
      ? `${(n / 1000).toFixed(0)}K`
      : n.toString();

  return (
    <>
      <div className="pt-16 md:pt-8 pb-20 md:pb-8 max-w-[935px] mx-auto px-4">
        {/* Profile header */}
        <div className="flex items-start gap-8 md:gap-20 mb-8">
          <img
            src={user.avatarUrl}
            alt={user.username}
            className="w-[77px] md:w-[150px] h-[77px] md:h-[150px] rounded-full object-cover flex-shrink-0"
          />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <h2 className="text-xl font-light m-0">{user.username}</h2>
              {isOwnProfile ? (
                <button className="px-4 py-1.5 bg-white border border-gray-300 rounded-lg text-sm font-semibold">
                  Edit profile
                </button>
              ) : (
                <>
                  <button
                    onClick={() => toggleFollow(user.id)}
                    className={`px-6 py-1.5 rounded-lg text-sm font-semibold border-0 cursor-pointer ${
                      following
                        ? "bg-gray-100 text-[#262626]"
                        : "bg-[#0095f6] text-white"
                    }`}
                  >
                    {following ? "Following" : "Follow"}
                  </button>
                  <button className="px-4 py-1.5 bg-gray-100 rounded-lg text-sm font-semibold border-0 cursor-pointer">
                    Message
                  </button>
                </>
              )}
            </div>

            {/* Stats */}
            <div className="hidden md:flex gap-8 mb-4">
              <div className="text-sm">
                <span className="font-semibold">{posts.length}</span> posts
              </div>
              <div className="text-sm">
                <span className="font-semibold">{formatCount(user.followers)}</span> followers
              </div>
              <div className="text-sm">
                <span className="font-semibold">{formatCount(user.following)}</span> following
              </div>
            </div>

            {/* Bio */}
            <div className="hidden md:block">
              <p className="text-sm font-semibold m-0">{user.name}</p>
              <p className="text-sm m-0 whitespace-pre-line">{user.bio}</p>
            </div>
          </div>
        </div>

        {/* Mobile bio + stats */}
        <div className="md:hidden mb-4">
          <p className="text-sm font-semibold m-0">{user.name}</p>
          <p className="text-sm m-0">{user.bio}</p>
        </div>
        <div className="md:hidden flex justify-around py-3 border-t border-b border-gray-200 mb-4">
          <div className="text-center">
            <p className="font-semibold text-sm m-0">{posts.length}</p>
            <p className="text-xs text-[#737373] m-0">posts</p>
          </div>
          <div className="text-center">
            <p className="font-semibold text-sm m-0">{formatCount(user.followers)}</p>
            <p className="text-xs text-[#737373] m-0">followers</p>
          </div>
          <div className="text-center">
            <p className="font-semibold text-sm m-0">{formatCount(user.following)}</p>
            <p className="text-xs text-[#737373] m-0">following</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-t border-gray-200 mb-4">
          <button className="flex items-center gap-1 px-4 py-3 text-xs font-semibold tracking-widest border-t-2 border-[#262626] -mt-px">
            <Grid3x3 size={12} /> POSTS
          </button>
          <button className="flex items-center gap-1 px-4 py-3 text-xs text-[#737373] font-semibold tracking-widest">
            <Tag size={12} /> TAGGED
          </button>
        </div>

        {/* Post grid */}
        <div className="grid grid-cols-3 gap-1">
          {posts.map((post) => (
            <button
              key={post.id}
              onClick={() => setSelectedPost(post)}
              className="bg-transparent border-0 cursor-pointer p-0 overflow-hidden aspect-square"
            >
              <img
                src={post.imageUrl}
                alt="Post"
                className="w-full h-full object-cover hover:opacity-80 transition-opacity"
              />
            </button>
          ))}
        </div>
      </div>

      {selectedPost && (
        <PostModal post={selectedPost} onClose={() => setSelectedPost(null)} />
      )}
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/instagram-clone && bun run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/instagram-clone/src/pages/ProfilePage.tsx
git commit -m "feat(instagram-clone): add ProfilePage"
```

---

## Task 14: Wire App.tsx, final typecheck, and boot

**Files:**
- Replace: `apps/instagram-clone/src/App.tsx`
- Replace: `apps/instagram-clone/src/main.tsx`

- [ ] **Step 1: Replace src/App.tsx with final version**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import NavBar from "./components/NavBar";
import StoryModal from "./components/StoryModal";
import FeedPage from "./pages/FeedPage";
import ExplorePage from "./pages/ExplorePage";
import ProfilePage from "./pages/ProfilePage";
import { useStoriesStore } from "./store/storiesStore";

export default function App() {
  const activeStoryId = useStoriesStore((s) => s.activeStoryId);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#fafafa]">
        <NavBar />
        {/* Offset for desktop sidebar and mobile bars */}
        <div className="md:ml-[244px] pt-[60px] pb-16 md:pt-0 md:pb-0">
          <Routes>
            <Route path="/" element={<FeedPage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/profile/:username" element={<ProfilePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
      {activeStoryId !== null && <StoryModal />}
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: Replace src/main.tsx with final version**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 3: Full typecheck**

```bash
cd apps/instagram-clone && bun run typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Build**

```bash
cd apps/instagram-clone && bun run build
```

Expected: Build succeeds, `dist/` directory created.

- [ ] **Step 5: Commit**

```bash
git add apps/instagram-clone/src/App.tsx apps/instagram-clone/src/main.tsx
git commit -m "feat(instagram-clone): wire App.tsx routing, final build passing"
```

- [ ] **Step 6: Start dev server and verify in Orchestrate browser**

```bash
cd apps/instagram-clone && bun run dev
```

Expected output:
```
  VITE v8.x.x  ready in XXX ms

  ➜  Local:   http://localhost:5175/
```

Open `http://localhost:5175` in the Orchestrate browser preview. Verify:
- Feed loads with story tray and post cards
- Clicking a story opens the StoryModal with progress bar
- Stories auto-advance after 5 seconds
- Double-clicking a post image triggers heart animation
- Like/save buttons toggle
- Navigating to `/explore` shows the image grid
- Clicking an explore image opens PostModal
- Navigating to `/profile/alex` shows the profile with post grid
- Follow button on another user's profile toggles follow state
- Desktop sidebar visible at ≥768px, mobile bottom tabs at <768px

---

## Spec Coverage Check

| Spec requirement | Task(s) covering it |
|---|---|
| Feed page with stories tray | Task 6, 11 |
| Story modal with progress bar + auto-advance | Task 8 |
| Post cards with like/comment/save | Task 7 |
| Explore 3-column grid | Task 12 |
| Post detail modal | Task 9 |
| Profile header + follower counts | Task 13 |
| Profile post grid | Task 13 |
| Follow/unfollow toggle | Task 13 + userStore |
| Desktop sidebar nav | Task 5 |
| Mobile top bar + bottom tabs | Task 5 |
| SuggestedUsers panel (desktop xl) | Task 10, 11 |
| In-memory Zustand state | Task 3 |
| 15 users, 30 posts, 10 stories | Task 2 |
| Single logged-in user @alex | Task 2, 3 |
| Double-click to like | Task 7 |
| typecheck passes | Task 14 |
| build passes | Task 14 |
