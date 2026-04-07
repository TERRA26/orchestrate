/* ============================================================
   Instagram Clone — script.js
   ============================================================ */

// ── Placeholder Personas ────────────────────────────────────
const PERSONAS = [
  {
    id: 1,
    username: "emma.designs",
    name: "Emma Chen",
    avatarId: 1,
    bio: "UI/UX Designer | Coffee addict\nSan Francisco, CA",
    posts: 142,
    followers: 12400,
    following: 891,
  },
  {
    id: 2,
    username: "alex.wanderlust",
    name: "Alex Rivera",
    avatarId: 3,
    bio: "Travel photographer\nCurrently: Tokyo",
    posts: 287,
    followers: 45200,
    following: 342,
  },
  {
    id: 3,
    username: "sophia.cooks",
    name: "Sophia Martinez",
    avatarId: 5,
    bio: "Chef & food blogger\nNew recipes every Tuesday",
    posts: 431,
    followers: 89300,
    following: 567,
  },
  {
    id: 4,
    username: "marcus.fit",
    name: "Marcus Johnson",
    avatarId: 7,
    bio: "Personal trainer | Gym life\nDMs open for coaching",
    posts: 198,
    followers: 23400,
    following: 445,
  },
  {
    id: 5,
    username: "lily.creates",
    name: "Lily Park",
    avatarId: 9,
    bio: "Artist & illustrator\nCommissions open",
    posts: 312,
    followers: 67800,
    following: 234,
  },
  {
    id: 6,
    username: "noah.codes",
    name: "Noah Williams",
    avatarId: 12,
    bio: "Software engineer @bigtech\nOpen source enthusiast",
    posts: 56,
    followers: 8900,
    following: 312,
  },
  {
    id: 7,
    username: "mia.styles",
    name: "Mia Thompson",
    avatarId: 16,
    bio: "Fashion & lifestyle\nCollab: mia@styles.co",
    posts: 523,
    followers: 134000,
    following: 678,
  },
  {
    id: 8,
    username: "jake.adventure",
    name: "Jake Anderson",
    avatarId: 14,
    bio: "Rock climber | Nature lover\nPacific Northwest",
    posts: 176,
    followers: 19200,
    following: 423,
  },
  {
    id: 9,
    username: "zara.reads",
    name: "Zara Patel",
    avatarId: 20,
    bio: "Bookworm | Writer\nCurrently reading: Dune",
    posts: 89,
    followers: 5600,
    following: 567,
  },
  {
    id: 10,
    username: "chris.lens",
    name: "Chris Nakamura",
    avatarId: 22,
    bio: "Street photographer\nShoot film & digital",
    posts: 445,
    followers: 78100,
    following: 289,
  },
  {
    id: 11,
    username: "olivia.dev",
    name: "Olivia Brooks",
    avatarId: 25,
    bio: "Full-stack dev | Cat mom\nBuilding cool things",
    posts: 73,
    followers: 4200,
    following: 198,
  },
  {
    id: 12,
    username: "ryan.music",
    name: "Ryan Foster",
    avatarId: 33,
    bio: "Musician & producer\nNew single out now",
    posts: 167,
    followers: 31200,
    following: 445,
  },
];

// Current user (persona index 10 — olivia.dev)
const CURRENT_USER = PERSONAS[10];

// ── Helper Functions ────────────────────────────────────────
function avatarUrl(avatarId) {
  return `https://i.pravatar.cc/150?img=${avatarId}`;
}

function postImageUrl(seed, w = 600, h = 600) {
  return `https://picsum.photos/seed/${seed}/${w}/${h}`;
}

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "m";
  if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  if (n >= 1000) return n.toLocaleString();
  return String(n);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ── Feed Post Data ──────────────────────────────────────────
const POSTS = [
  {
    user: PERSONAS[0],
    location: "San Francisco, California",
    image: postImageUrl("design1", 600, 600),
    likes: 1243,
    caption:
      "New workspace setup complete! Minimal vibes only. Love how the natural light hits in the afternoon. What do you think of this layout?",
    comments: [
      { user: PERSONAS[5], text: "That monitor setup is chef's kiss" },
      { user: PERSONAS[4], text: "So clean! Where's the desk from?" },
    ],
    time: "2 hours ago",
  },
  {
    user: PERSONAS[1],
    location: "Shibuya, Tokyo",
    image: postImageUrl("tokyo2", 600, 750),
    likes: 4521,
    caption:
      "Lost in the neon glow of Shibuya at midnight. This city never sleeps and neither do I when I'm here. Every corner is a new photo opportunity.",
    comments: [{ user: PERSONAS[7], text: "Take me back! Tokyo is incredible" }],
    time: "5 hours ago",
  },
  {
    user: PERSONAS[2],
    location: "Home Kitchen",
    image: postImageUrl("food3", 600, 600),
    likes: 8932,
    caption:
      "Homemade ramen from scratch - 12 hour bone broth, chashu pork, and a perfect soft-boiled egg. Recipe dropping Tuesday!",
    comments: [
      { user: PERSONAS[3], text: "This looks absolutely incredible" },
      { user: PERSONAS[8], text: "I need this recipe ASAP!" },
    ],
    time: "8 hours ago",
  },
  {
    user: PERSONAS[3],
    location: "Gold's Gym, Venice Beach",
    image: postImageUrl("fitness4", 600, 600),
    likes: 2156,
    caption:
      "Early morning grind. 5 AM sessions hit different. Remember: discipline beats motivation every single time.",
    comments: [{ user: PERSONAS[0], text: "The dedication is real" }],
    time: "12 hours ago",
  },
  {
    user: PERSONAS[4],
    location: "Art Studio",
    image: postImageUrl("art5", 600, 750),
    likes: 6789,
    caption:
      "Finally finished this piece after 3 weeks. Acrylic on canvas, 24x36. Inspired by the colors of autumn in Vermont. Prints available - link in bio.",
    comments: [
      { user: PERSONAS[6], text: "This is STUNNING! I want a print" },
      { user: PERSONAS[9], text: "The color palette is perfection" },
    ],
    time: "1 day ago",
  },
  {
    user: PERSONAS[6],
    location: "Paris, France",
    image: postImageUrl("fashion6", 600, 750),
    likes: 15234,
    caption:
      "Paris Fashion Week day 3. This vintage Chanel piece paired with modern accessories - mixing eras is my favorite styling trick.",
    comments: [
      { user: PERSONAS[4], text: "Obsessed with this look!" },
      { user: PERSONAS[0], text: "Paris suits you so well" },
    ],
    time: "1 day ago",
  },
  {
    user: PERSONAS[7],
    location: "Mount Rainier, Washington",
    image: postImageUrl("mountain7", 600, 600),
    likes: 3421,
    caption:
      "Summit day! After 6 hours of climbing, the view was worth every step. Nature is the best therapist.",
    comments: [
      { user: PERSONAS[1], text: "This view is unreal! Adding to my bucket list" },
      { user: PERSONAS[3], text: "Beast mode! Respect" },
    ],
    time: "2 days ago",
  },
  {
    user: PERSONAS[9],
    location: "Downtown Los Angeles",
    image: postImageUrl("street8", 600, 600),
    likes: 7845,
    caption:
      "Rainy nights in LA hit different. Shot on Leica M10 with Summilux 35mm. There's something magical about city lights reflecting off wet pavement.",
    comments: [
      { user: PERSONAS[1], text: "The reflections are beautiful" },
      { user: PERSONAS[5], text: "Film or digital?" },
    ],
    time: "2 days ago",
  },
];

// ── Notification Data ───────────────────────────────────────
const NOTIFICATIONS = [
  { user: PERSONAS[0], text: "liked your photo.", time: "2m" },
  { user: PERSONAS[2], text: "started following you.", time: "15m" },
  { user: PERSONAS[4], text: 'commented: "Love this!"', time: "1h" },
  { user: PERSONAS[6], text: "liked your photo.", time: "3h" },
  { user: PERSONAS[1], text: "mentioned you in a comment.", time: "5h" },
  { user: PERSONAS[9], text: "started following you.", time: "1d" },
];

// ── Suggestion Data ─────────────────────────────────────────
const SUGGESTIONS = [
  { user: PERSONAS[1], reason: "Followed by emma.designs" },
  { user: PERSONAS[7], reason: "Suggested for you" },
  { user: PERSONAS[11], reason: "Followed by noah.codes" },
  { user: PERSONAS[8], reason: "Suggested for you" },
  { user: PERSONAS[9], reason: "Followed by lily.creates" },
];

// ── State ───────────────────────────────────────────────────
let currentPage = "feed";
let currentStoryIndex = 0;
let storyTimer = null;
let storyProgressTimer = null;

// ── DOM References ──────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ── Initialization ──────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  renderStories();
  renderFeed();
  renderSidebar();
  renderExplore();
  renderProfile();
  renderNotifications();
  bindNavigation();
  bindDarkMode();
  bindCreateModal();
  bindNotificationDropdown();
});

// ── Navigation ──────────────────────────────────────────────
function bindNavigation() {
  // Top nav + bottom nav page buttons
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-page]");
    if (!btn) return;
    navigateTo(btn.dataset.page);
  });

  // Logo → feed
  $("#nav-logo").addEventListener("click", () => navigateTo("feed"));
}

function navigateTo(page) {
  currentPage = page;

  // Update pages
  $$(".page").forEach((p) => p.classList.remove("active"));
  const target = $(`#page-${page}`);
  if (target) target.classList.add("active");

  // Update nav active states
  $$(".nav-icon-btn[data-page]").forEach((b) => {
    b.classList.toggle("active", b.dataset.page === page);
  });
  $$(".bottom-nav-btn[data-page]").forEach((b) => {
    b.classList.toggle("active", b.dataset.page === page);
  });

  // Scroll to top
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ── Dark Mode ───────────────────────────────────────────────
function bindDarkMode() {
  const toggle = $("#dark-mode-toggle");
  toggle.addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");
    const isDark = document.body.classList.contains("dark-mode");
    toggle.querySelector(".moon-icon").style.display = isDark ? "none" : "block";
    toggle.querySelector(".sun-icon").style.display = isDark ? "block" : "none";
  });
}

// ── Stories ─────────────────────────────────────────────────
function renderStories() {
  const bar = $("#stories-bar");
  // "Your story" first
  bar.innerHTML = `
    <div class="story-item" data-story-index="-1">
      <div class="story-avatar-ring viewed">
        <img src="${avatarUrl(CURRENT_USER.avatarId)}" alt="${CURRENT_USER.username}" />
      </div>
      <span class="story-username">Your story</span>
    </div>
  `;

  // Other stories — use first 10 personas
  const storyPersonas = PERSONAS.slice(0, 10);
  storyPersonas.forEach((p, i) => {
    const viewed = i > 5 ? "viewed" : "";
    bar.innerHTML += `
      <div class="story-item" data-story-index="${i}">
        <div class="story-avatar-ring ${viewed}">
          <img src="${avatarUrl(p.avatarId)}" alt="${p.username}" />
        </div>
        <span class="story-username">${p.username}</span>
      </div>
    `;
  });

  // Bind clicks
  bar.addEventListener("click", (e) => {
    const item = e.target.closest(".story-item");
    if (!item) return;
    const idx = parseInt(item.dataset.storyIndex, 10);
    if (idx < 0) return; // "Your story" — skip
    openStoryViewer(idx);
    // Mark as viewed
    item.querySelector(".story-avatar-ring").classList.add("viewed");
  });
}

function openStoryViewer(index) {
  const storyPersonas = PERSONAS.slice(0, 10);
  currentStoryIndex = index;
  const viewer = $("#story-viewer");
  viewer.classList.add("open");
  showStory(storyPersonas, index);

  // Bind nav
  $("#story-close").onclick = closeStoryViewer;
  $("#story-prev").onclick = () => {
    if (currentStoryIndex > 0) {
      currentStoryIndex--;
      showStory(storyPersonas, currentStoryIndex);
    }
  };
  $("#story-next").onclick = () => {
    if (currentStoryIndex < storyPersonas.length - 1) {
      currentStoryIndex++;
      showStory(storyPersonas, currentStoryIndex);
    } else {
      closeStoryViewer();
    }
  };

  // Close on Escape
  document.addEventListener("keydown", storyKeyHandler);
}

function storyKeyHandler(e) {
  if (e.key === "Escape") closeStoryViewer();
  if (e.key === "ArrowRight") $("#story-next").click();
  if (e.key === "ArrowLeft") $("#story-prev").click();
}

function showStory(personas, index) {
  const p = personas[index];
  $("#story-viewer-avatar").src = avatarUrl(p.avatarId);
  $("#story-viewer-username").textContent = p.username;
  $("#story-viewer-image").src = postImageUrl(`story${p.id}`, 500, 800);

  // Progress bar
  const bar = $("#story-progress-bar");
  bar.innerHTML = "";
  personas.forEach((_, i) => {
    const seg = document.createElement("div");
    seg.className = "story-progress-segment" + (i < index ? " done" : "");
    seg.innerHTML = '<div class="story-progress-fill"></div>';
    bar.appendChild(seg);
  });

  // Animate current segment
  clearInterval(storyTimer);
  clearInterval(storyProgressTimer);
  const currentSeg = bar.children[index];
  if (currentSeg) {
    const fill = currentSeg.querySelector(".story-progress-fill");
    let progress = 0;
    storyProgressTimer = setInterval(() => {
      progress += 2;
      fill.style.width = progress + "%";
      if (progress >= 100) {
        clearInterval(storyProgressTimer);
      }
    }, 100);
  }

  // Auto-advance after 5 seconds
  storyTimer = setTimeout(() => {
    if (currentStoryIndex < personas.length - 1) {
      currentStoryIndex++;
      showStory(personas, currentStoryIndex);
    } else {
      closeStoryViewer();
    }
  }, 5000);
}

function closeStoryViewer() {
  clearTimeout(storyTimer);
  clearInterval(storyProgressTimer);
  $("#story-viewer").classList.remove("open");
  document.removeEventListener("keydown", storyKeyHandler);
}

// ── Feed ────────────────────────────────────────────────────
function renderFeed() {
  const container = $("#feed-posts");
  container.innerHTML = POSTS.map((post, i) => createPostHTML(post, i)).join("");

  // Bind post interactions
  container.addEventListener("click", handlePostClick);

  // Double-tap for heart animation
  let lastTap = 0;
  container.addEventListener("click", (e) => {
    const wrapper = e.target.closest(".post-image-wrapper");
    if (!wrapper) return;
    const now = Date.now();
    if (now - lastTap < 300) {
      triggerHeartAnimation(wrapper);
      // Also like the post
      const card = wrapper.closest(".post-card");
      const likeBtn = card.querySelector(".like-btn");
      if (!likeBtn.classList.contains("liked")) {
        likeBtn.classList.add("liked");
        updateLikeCount(card, 1);
      }
    }
    lastTap = now;
  });

  // Comment input
  container.addEventListener("input", (e) => {
    if (e.target.classList.contains("comment-input")) {
      const btn = e.target.closest(".post-add-comment").querySelector(".post-submit");
      btn.classList.toggle("active", e.target.value.trim().length > 0);
    }
  });

  // Caption "more" expand
  container.addEventListener("click", (e) => {
    if (e.target.classList.contains("caption-more")) {
      const full = e.target.closest(".post-caption").querySelector(".caption-text");
      full.textContent = full.dataset.fullText;
      e.target.remove();
    }
  });
}

function createPostHTML(post, index) {
  const truncatedCaption =
    post.caption.length > 100 ? post.caption.slice(0, 100) + "..." : post.caption;
  const needsMore = post.caption.length > 100;

  const commentsHTML = post.comments
    .map((c) => `<div class="comment-item"><strong>${c.user.username}</strong>${c.text}</div>`)
    .join("");

  return `
    <article class="post-card" data-post-index="${index}">
      <div class="post-header">
        <img class="post-avatar" src="${avatarUrl(post.user.avatarId)}" alt="${post.user.username}" />
        <div class="post-user-info">
          <div class="post-username">${post.user.username}</div>
          <div class="post-location">${post.location}</div>
        </div>
        <button class="post-menu-btn" title="More options">&#8226;&#8226;&#8226;</button>
      </div>
      <div class="post-image-wrapper">
        <img src="${post.image}" alt="Post by ${post.user.username}" loading="lazy" />
        <div class="heart-overlay">
          <svg viewBox="0 0 24 24" width="80" height="80"><path d="M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-1.816-1.51-4.303-3.752C5.152 14.08 2.5 12.194 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938z" fill="#ed4956" stroke="#ed4956" stroke-width="1"/></svg>
        </div>
      </div>
      <div class="post-actions">
        <button class="post-action-btn like-btn" title="Like">
          <svg viewBox="0 0 24 24" width="24" height="24"><path d="M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-1.816-1.51-4.303-3.752C5.152 14.08 2.5 12.194 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938z" fill="none" stroke="currentColor" stroke-width="2"/></svg>
        </button>
        <button class="post-action-btn" title="Comment">
          <svg viewBox="0 0 24 24" width="24" height="24"><path d="M20.656 17.008a9.993 9.993 0 1 0-3.59 3.615L22 22z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
        </button>
        <button class="post-action-btn" title="Share">
          <svg viewBox="0 0 24 24" width="24" height="24"><path d="M20.5 3.5L3.5 10.5l6 3 8-6-6 8 3 6z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
        </button>
        <div class="post-action-spacer"></div>
        <button class="post-action-btn bookmark-btn" title="Save">
          <svg viewBox="0 0 24 24" width="24" height="24"><path d="M20 21l-8-5-8 5V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" fill="none" stroke="currentColor" stroke-width="2"/></svg>
        </button>
      </div>
      <div class="post-info">
        <div class="post-likes" data-count="${post.likes}">${formatNumber(post.likes)} likes</div>
        <div class="post-caption">
          <span class="caption-username">${post.user.username}</span>
          <span class="caption-text" data-full-text="${post.caption}">${truncatedCaption}</span>
          ${needsMore ? '<span class="caption-more"> more</span>' : ""}
        </div>
        <div class="post-comments-preview">${commentsHTML}</div>
        <div class="post-timestamp">${post.time}</div>
      </div>
      <div class="post-add-comment">
        <span class="emoji-icon">😊</span>
        <input class="comment-input" type="text" placeholder="Add a comment..." />
        <button class="post-submit">Post</button>
      </div>
    </article>
  `;
}

function handlePostClick(e) {
  // Like toggle
  const likeBtn = e.target.closest(".like-btn");
  if (likeBtn) {
    const wasLiked = likeBtn.classList.contains("liked");
    likeBtn.classList.toggle("liked");
    const card = likeBtn.closest(".post-card");
    updateLikeCount(card, wasLiked ? -1 : 1);
    return;
  }

  // Bookmark toggle
  const bookmarkBtn = e.target.closest(".bookmark-btn");
  if (bookmarkBtn) {
    bookmarkBtn.classList.toggle("bookmarked");
    return;
  }

  // Post comment
  const submitBtn = e.target.closest(".post-submit");
  if (submitBtn && submitBtn.classList.contains("active")) {
    const commentRow = submitBtn.closest(".post-add-comment");
    const input = commentRow.querySelector(".comment-input");
    const card = submitBtn.closest(".post-card");
    const preview = card.querySelector(".post-comments-preview");
    preview.innerHTML += `<div class="comment-item"><strong>${CURRENT_USER.username}</strong> ${input.value}</div>`;
    input.value = "";
    submitBtn.classList.remove("active");
    return;
  }
}

function updateLikeCount(card, delta) {
  const el = card.querySelector(".post-likes");
  const count = parseInt(el.dataset.count, 10) + delta;
  el.dataset.count = count;
  el.textContent = formatNumber(count) + " likes";
}

function triggerHeartAnimation(wrapper) {
  const overlay = wrapper.querySelector(".heart-overlay");
  overlay.classList.remove("animate");
  // Force reflow
  void overlay.offsetWidth;
  overlay.classList.add("animate");
  setTimeout(() => overlay.classList.remove("animate"), 900);
}

// ── Sidebar ─────────────────────────────────────────────────
function renderSidebar() {
  const sidebar = $("#sidebar");
  const suggestionsHTML = SUGGESTIONS.map(
    (s) => `
    <div class="suggestion-item">
      <img src="${avatarUrl(s.user.avatarId)}" alt="${s.user.username}" />
      <div class="suggestion-info">
        <div class="suggestion-username">${s.user.username}</div>
        <div class="suggestion-reason">${s.reason}</div>
      </div>
      <button class="follow-btn">Follow</button>
    </div>
  `,
  ).join("");

  sidebar.innerHTML = `
    <div class="sidebar-profile">
      <img src="${avatarUrl(CURRENT_USER.avatarId)}" alt="${CURRENT_USER.username}" />
      <div class="sidebar-profile-info">
        <div class="sidebar-profile-username">${CURRENT_USER.username}</div>
        <div class="sidebar-profile-name">${CURRENT_USER.name}</div>
      </div>
      <button class="sidebar-switch">Switch</button>
    </div>
    <div class="sidebar-section-header">
      <span>Suggestions For You</span>
      <button>See All</button>
    </div>
    ${suggestionsHTML}
    <div class="sidebar-footer">
      About &middot; Help &middot; Press &middot; API &middot; Jobs &middot; Privacy &middot; Terms<br/>
      &copy; 2026 INSTAGRAM CLONE
    </div>
  `;

  // Follow toggle
  sidebar.addEventListener("click", (e) => {
    const btn = e.target.closest(".follow-btn");
    if (!btn) return;
    const isFollowing = btn.classList.contains("following");
    btn.classList.toggle("following");
    btn.textContent = isFollowing ? "Follow" : "Following";
  });
}

// ── Explore Page ────────────────────────────────────────────
function renderExplore() {
  const grid = $("#explore-grid");
  const items = [];
  const patterns = [
    // Mosaic pattern repeating: indices that are "tall" or "wide"
    { tall: [0], wide: [2] },
    { tall: [4], wide: [3] },
    { tall: [7], wide: [8] },
  ];

  for (let i = 0; i < 24; i++) {
    const setIndex = Math.floor(i / 9);
    const posInSet = i % 9;
    const pattern = patterns[setIndex % patterns.length] || { tall: [], wide: [] };

    let cls = "";
    if (pattern.tall.includes(posInSet)) cls = "tall";
    if (pattern.wide.includes(posInSet)) cls = "wide";

    const likes = randomInt(500, 50000);
    const comments = randomInt(10, 500);

    items.push(`
      <div class="explore-item ${cls}">
        <img src="${postImageUrl(`explore${i}`, 600, cls === "tall" ? 900 : 600)}" alt="Explore" loading="lazy" />
        <div class="explore-item-overlay">
          <span class="explore-stat">
            <svg viewBox="0 0 24 24" width="16" height="16"><path d="M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-1.816-1.51-4.303-3.752C5.152 14.08 2.5 12.194 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938z" fill="#fff"/></svg>
            ${formatNumber(likes)}
          </span>
          <span class="explore-stat">
            <svg viewBox="0 0 24 24" width="16" height="16"><path d="M20.656 17.008a9.993 9.993 0 1 0-3.59 3.615L22 22z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>
            ${formatNumber(comments)}
          </span>
        </div>
      </div>
    `);
  }

  grid.innerHTML = items.join("");
}

// ── Profile Page ────────────────────────────────────────────
function renderProfile() {
  const container = $("#profile-container");

  // Generate profile grid images
  let gridHTML = "";
  for (let i = 0; i < 12; i++) {
    gridHTML += `
      <div class="profile-grid-item">
        <img src="${postImageUrl(`profile${CURRENT_USER.id}_${i}`, 400, 400)}" alt="Post" loading="lazy" />
      </div>
    `;
  }

  container.innerHTML = `
    <div class="profile-header">
      <img class="profile-avatar-large" src="${avatarUrl(CURRENT_USER.avatarId)}" alt="${CURRENT_USER.username}" />
      <div class="profile-info">
        <div class="profile-username-row">
          <h2>${CURRENT_USER.username}</h2>
          <button class="profile-edit-btn">Edit profile</button>
          <button class="profile-edit-btn">View archive</button>
        </div>
        <div class="profile-stats">
          <span class="profile-stat-item"><strong>${CURRENT_USER.posts}</strong> posts</span>
          <span class="profile-stat-item"><strong>${formatNumber(CURRENT_USER.followers)}</strong> followers</span>
          <span class="profile-stat-item"><strong>${CURRENT_USER.following}</strong> following</span>
        </div>
        <div class="profile-bio">
          <div class="profile-bio-name">${CURRENT_USER.name}</div>
          <div>${CURRENT_USER.bio.replace(/\n/g, "<br/>")}</div>
        </div>
      </div>
    </div>
    <div class="profile-tabs">
      <button class="profile-tab active" data-tab="posts">
        <svg viewBox="0 0 24 24"><rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor" stroke-width="2"/><rect x="14" y="2" width="8" height="8" fill="none" stroke="currentColor" stroke-width="2"/><rect x="2" y="14" width="8" height="8" fill="none" stroke="currentColor" stroke-width="2"/><rect x="14" y="14" width="8" height="8" fill="none" stroke="currentColor" stroke-width="2"/></svg>
        POSTS
      </button>
      <button class="profile-tab" data-tab="reels">
        <svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><polygon points="10,8 16,12 10,16" fill="currentColor"/></svg>
        REELS
      </button>
      <button class="profile-tab" data-tab="tagged">
        <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="7" r="4" fill="none" stroke="currentColor" stroke-width="2"/></svg>
        TAGGED
      </button>
    </div>
    <div class="profile-grid" id="profile-grid">${gridHTML}</div>
  `;

  // Tab switching
  container.addEventListener("click", (e) => {
    const tab = e.target.closest(".profile-tab");
    if (!tab) return;
    container.querySelectorAll(".profile-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
  });
}

// ── Notifications ───────────────────────────────────────────
function renderNotifications() {
  const list = $("#notif-list");
  list.innerHTML = NOTIFICATIONS.map(
    (n) => `
    <div class="notif-item">
      <img src="${avatarUrl(n.user.avatarId)}" alt="${n.user.username}" />
      <div class="notif-text"><strong>${n.user.username}</strong> ${n.text}</div>
      <span class="notif-time">${n.time}</span>
    </div>
  `,
  ).join("");
}

function bindNotificationDropdown() {
  const btn = $("#nav-notifications");
  const dropdown = $("#notification-dropdown");

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("open");
    // Hide badge
    const badge = btn.querySelector(".notification-badge");
    if (badge) badge.style.display = "none";
  });

  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target) && e.target !== btn) {
      dropdown.classList.remove("open");
    }
  });
}

// ── Create Post Modal ───────────────────────────────────────
function bindCreateModal() {
  const modal = $("#create-modal");
  const openBtns = [$("#nav-create"), $("#mobile-create")];
  const cancelBtn = $("#modal-cancel");
  const shareBtn = $("#modal-share");
  const captionInput = $("#caption-input");
  const captionCount = $("#caption-count");

  openBtns.forEach((btn) => {
    if (btn) {
      btn.addEventListener("click", () => modal.classList.add("open"));
    }
  });

  cancelBtn.addEventListener("click", () => modal.classList.remove("open"));

  // Close on overlay click
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("open");
  });

  // Caption character count
  captionInput.addEventListener("input", () => {
    captionCount.textContent = captionInput.value.length;
  });

  // Share button (simulated)
  shareBtn.addEventListener("click", () => {
    if (captionInput.value.trim()) {
      modal.classList.remove("open");
      captionInput.value = "";
      captionCount.textContent = "0";
    }
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("open")) {
      modal.classList.remove("open");
    }
  });
}
