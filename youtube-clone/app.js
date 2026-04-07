// ===== DATA =====

const creators = [
  {
    id: "nova",
    name: "Nova Studios",
    handle: "@novastudios",
    subs: "2.4M subscribers",
    color: "#e53935",
    initials: "NS",
    avatar: "https://ui-avatars.com/api/?name=Nova+Studios&background=e53935&color=fff&size=128",
  },
  {
    id: "pixel",
    name: "PixelCraft Gaming",
    handle: "@pixelcraftgaming",
    subs: "1.8M subscribers",
    color: "#7b1fa2",
    initials: "PC",
    avatar: "https://ui-avatars.com/api/?name=Pixel+Craft&background=7b1fa2&color=fff&size=128",
  },
  {
    id: "sage",
    name: "Sage & Thyme Kitchen",
    handle: "@sageandthyme",
    subs: "890K subscribers",
    color: "#2e7d32",
    initials: "ST",
    avatar: "https://ui-avatars.com/api/?name=Sage+Thyme&background=2e7d32&color=fff&size=128",
  },
  {
    id: "atlas",
    name: "Atlas Wanderer",
    handle: "@atlaswanderer",
    subs: "3.1M subscribers",
    color: "#1565c0",
    initials: "AW",
    avatar: "https://ui-avatars.com/api/?name=Atlas+W&background=1565c0&color=fff&size=128",
  },
  {
    id: "echo",
    name: "Echo Beats",
    handle: "@echobeats",
    subs: "5.6M subscribers",
    color: "#ff6f00",
    initials: "EB",
    avatar: "https://ui-avatars.com/api/?name=Echo+Beats&background=ff6f00&color=fff&size=128",
  },
  {
    id: "cipher",
    name: "Cipher Tech",
    handle: "@ciphertech",
    subs: "1.2M subscribers",
    color: "#00838f",
    initials: "CT",
    avatar: "https://ui-avatars.com/api/?name=Cipher+Tech&background=00838f&color=fff&size=128",
  },
];

const creatorMap = {};
creators.forEach((c) => (creatorMap[c.id] = c));

const videos = [
  {
    id: 1,
    title: "How We Built a $10M Studio From Scratch",
    creator: "nova",
    category: "education",
    views: 1423000,
    uploaded: 2,
    duration: "18:42",
    likes: "48K",
    thumb: "https://picsum.photos/seed/vid1/640/360",
    description:
      "In this video, we take you behind the scenes of building Nova Studios from a small garage to a multi-million dollar production house. Learn about the gear, the mistakes, and the wins.\n\nTimestamps:\n0:00 - Intro\n2:30 - The Early Days\n8:15 - First Big Break\n14:00 - Current Setup Tour",
  },
  {
    id: 2,
    title: "Minecraft Hardcore: Day 1000 Celebration!",
    creator: "pixel",
    category: "gaming",
    views: 3892000,
    uploaded: 1,
    duration: "32:15",
    likes: "156K",
    thumb: "https://picsum.photos/seed/vid2/640/360",
    description:
      "We finally hit Day 1000 in our Minecraft Hardcore world! In this milestone episode, we tour the mega-base, fight the Warden, and attempt the most dangerous challenge yet.\n\n#Minecraft #Hardcore #Gaming",
  },
  {
    id: 3,
    title: "Perfect Homemade Pasta in 20 Minutes",
    creator: "sage",
    category: "cooking",
    views: 567000,
    uploaded: 5,
    duration: "12:08",
    likes: "22K",
    thumb: "https://picsum.photos/seed/vid3/640/360",
    description:
      "Making fresh pasta at home is easier than you think! In this recipe, we use just 3 simple ingredients to make restaurant-quality fettuccine.\n\nIngredients:\n- 2 cups all-purpose flour\n- 3 large eggs\n- 1 tbsp olive oil\n- Salt to taste",
  },
  {
    id: 4,
    title: "Solo Backpacking Through Patagonia",
    creator: "atlas",
    category: "travel",
    views: 2145000,
    uploaded: 7,
    duration: "24:33",
    likes: "89K",
    thumb: "https://picsum.photos/seed/vid4/640/360",
    description:
      "Join me on a 2-week solo backpacking adventure through the stunning landscapes of Patagonia. From Torres del Paine to Perito Moreno Glacier, this trip was life-changing.\n\nGear list in the description below.",
  },
  {
    id: 5,
    title: "Lofi Hip Hop Radio - Beats to Relax/Study To",
    creator: "echo",
    category: "music",
    views: 15600000,
    uploaded: 30,
    duration: "3:45:00",
    likes: "340K",
    thumb: "https://picsum.photos/seed/vid5/640/360",
    description:
      "Welcome to Echo Beats lofi radio! Perfect background music for studying, working, or just chilling. New tracks added weekly.\n\nFollow us on Spotify: [link]",
  },
  {
    id: 6,
    title: "I Built a Custom Mechanical Keyboard From Scratch",
    creator: "cipher",
    category: "tech",
    views: 892000,
    uploaded: 3,
    duration: "22:17",
    likes: "41K",
    thumb: "https://picsum.photos/seed/vid6/640/360",
    description:
      "In this build log, I design and assemble a fully custom mechanical keyboard. From CNC machining the case to hand-lubing every switch, nothing was left to chance.\n\nParts used:\n- Custom CNC aluminum case\n- Holy Panda switches\n- GMK keycaps",
  },
  {
    id: 7,
    title: "Film Scoring Masterclass: Creating Emotion With Music",
    creator: "nova",
    category: "education",
    views: 723000,
    uploaded: 10,
    duration: "45:22",
    likes: "32K",
    thumb: "https://picsum.photos/seed/vid7/640/360",
    description:
      "Learn how professional composers create emotional film scores. We break down techniques used in major blockbusters and demonstrate them live in our studio.\n\nTopics covered:\n- Leitmotifs\n- Tension building\n- Orchestration techniques\n- Modern hybrid scoring",
  },
  {
    id: 8,
    title: "Elden Ring DLC - All Boss Fights Ranked",
    creator: "pixel",
    category: "gaming",
    views: 4521000,
    uploaded: 4,
    duration: "28:45",
    likes: "198K",
    thumb: "https://picsum.photos/seed/vid8/640/360",
    description:
      "We rank every single boss fight in the Elden Ring DLC from worst to best. Some of these fights are the best FromSoftware has ever designed.\n\n#EldenRing #DLC #BossRanking",
  },
  {
    id: 9,
    title: "Japanese Street Food Tour: Osaka After Dark",
    creator: "sage",
    category: "cooking",
    views: 1234000,
    uploaded: 14,
    duration: "19:55",
    likes: "55K",
    thumb: "https://picsum.photos/seed/vid9/640/360",
    description:
      "We explore the vibrant night food scene in Osaka, Japan. From takoyaki to okonomiyaki, the flavors are incredible. Join us as we eat our way through Dotonbori.\n\nMusic by Echo Beats",
  },
  {
    id: 10,
    title: "Norway Northern Lights: A Cinematic Journey",
    creator: "atlas",
    category: "travel",
    views: 5678000,
    uploaded: 21,
    duration: "15:30",
    likes: "234K",
    thumb: "https://picsum.photos/seed/vid10/640/360",
    description:
      "Witness the breathtaking Aurora Borealis in the Norwegian Arctic. Shot over 2 weeks in Tromsø and the Lofoten Islands. All footage is real-time, no time-lapses.\n\nCamera: Sony A7S III\nLens: 14mm f/1.8",
  },
  {
    id: 11,
    title: "Making a Full Album in 48 Hours Challenge",
    creator: "echo",
    category: "music",
    views: 2345000,
    uploaded: 6,
    duration: "35:12",
    likes: "98K",
    thumb: "https://picsum.photos/seed/vid11/640/360",
    description:
      "Can we write, produce, and mix an entire album in just 48 hours? This is the most intense creative challenge we have ever attempted. The results might surprise you.\n\nListen to the full album on all platforms.",
  },
  {
    id: 12,
    title: "The Truth About AI in 2026: What Nobody Tells You",
    creator: "cipher",
    category: "tech",
    views: 3456000,
    uploaded: 1,
    duration: "26:08",
    likes: "145K",
    thumb: "https://picsum.photos/seed/vid12/640/360",
    description:
      "We cut through the hype and misinformation about AI in 2026. What is actually real, what is vaporware, and what should you actually be paying attention to?\n\nSources linked below.",
  },
  {
    id: 13,
    title: "World Cup 2026 Predictions: Group Stage Analysis",
    creator: "nova",
    category: "sports",
    views: 1890000,
    uploaded: 3,
    duration: "20:15",
    likes: "67K",
    thumb: "https://picsum.photos/seed/vid13/640/360",
    description:
      "Our deep dive into every group in the upcoming 2026 FIFA World Cup. We analyze the strengths and weaknesses of each team and make our predictions.",
  },
  {
    id: 14,
    title: "Breaking: Major Climate Summit Reaches Historic Agreement",
    creator: "atlas",
    category: "news",
    views: 890000,
    uploaded: 0,
    duration: "14:22",
    likes: "29K",
    thumb: "https://picsum.photos/seed/vid14/640/360",
    description:
      "World leaders have reached a historic agreement at the Global Climate Summit. We break down the key provisions, what they mean for the future, and who the biggest winners and losers are.",
  },
  {
    id: 15,
    title: "Speed Typing: How I Type at 180 WPM",
    creator: "cipher",
    category: "tech",
    views: 678000,
    uploaded: 8,
    duration: "16:40",
    likes: "38K",
    thumb: "https://picsum.photos/seed/vid15/640/360",
    description:
      "Achieving 180 WPM took years of deliberate practice. In this video, I share my exact training regimen, the tools I use, and common mistakes that slow people down.",
  },
  {
    id: 16,
    title: "Epic Skateboarding Compilation 2026",
    creator: "pixel",
    category: "sports",
    views: 2100000,
    uploaded: 5,
    duration: "11:33",
    likes: "87K",
    thumb: "https://picsum.photos/seed/vid16/640/360",
    description:
      "The best skateboarding tricks and runs from the first half of 2026. Featuring clips from competitions and street sessions around the world.",
  },
];

const shorts = [
  {
    id: "s1",
    title: "Wait for the ending... 😱",
    creator: "pixel",
    views: 12400000,
    thumb: "https://picsum.photos/seed/short1/360/640",
  },
  {
    id: "s2",
    title: "60-second pasta hack",
    creator: "sage",
    views: 8900000,
    thumb: "https://picsum.photos/seed/short2/360/640",
  },
  {
    id: "s3",
    title: "Northern Lights in 15 seconds",
    creator: "atlas",
    views: 23000000,
    thumb: "https://picsum.photos/seed/short3/360/640",
  },
  {
    id: "s4",
    title: "Beat drop challenge 🎵",
    creator: "echo",
    views: 5600000,
    thumb: "https://picsum.photos/seed/short4/360/640",
  },
  {
    id: "s5",
    title: "Unboxing a $5000 keyboard",
    creator: "cipher",
    views: 3400000,
    thumb: "https://picsum.photos/seed/short5/360/640",
  },
  {
    id: "s6",
    title: "Movie magic revealed",
    creator: "nova",
    views: 7800000,
    thumb: "https://picsum.photos/seed/short6/360/640",
  },
  {
    id: "s7",
    title: "Impossible trick shot 🏀",
    creator: "pixel",
    views: 15200000,
    thumb: "https://picsum.photos/seed/short7/360/640",
  },
  {
    id: "s8",
    title: "5-ingredient dessert!",
    creator: "sage",
    views: 6300000,
    thumb: "https://picsum.photos/seed/short8/360/640",
  },
];

const commentPool = [
  {
    author: "TechNomad42",
    color: "#d32f2f",
    text: "This is exactly what I needed to see today. Absolutely incredible work!",
    likes: 342,
    time: "2 days ago",
  },
  {
    author: "MidnightCoder",
    color: "#1976d2",
    text: "Been watching since day one. The growth has been insane 🔥",
    likes: 891,
    time: "1 day ago",
  },
  {
    author: "SunflowerSara",
    color: "#388e3c",
    text: "Can we just appreciate the production quality? It's on another level.",
    likes: 127,
    time: "5 hours ago",
  },
  {
    author: "QuantumLeap",
    color: "#f57c00",
    text: "I tried this myself and honestly the results blew my mind. Thanks for sharing!",
    likes: 456,
    time: "3 days ago",
  },
  {
    author: "WinterFox",
    color: "#7b1fa2",
    text: "The editing in this video is chef's kiss 👨‍🍳",
    likes: 203,
    time: "12 hours ago",
  },
  {
    author: "CoffeeAndCode",
    color: "#00695c",
    text: "I've watched this 3 times now and I notice something new each time.",
    likes: 89,
    time: "4 days ago",
  },
  {
    author: "NeonDreamer",
    color: "#c2185b",
    text: "This deserves way more views. Sharing with everyone I know.",
    likes: 567,
    time: "1 week ago",
  },
  {
    author: "BinaryBoss",
    color: "#455a64",
    text: "Finally someone explained this properly. Subscribed immediately!",
    likes: 1023,
    time: "6 hours ago",
  },
  {
    author: "OceanBreeze",
    color: "#0097a7",
    text: "The cinematography here is absolutely stunning. What camera are you using?",
    likes: 234,
    time: "2 days ago",
  },
  {
    author: "RetroGamerX",
    color: "#e64a19",
    text: "Bro this is legendary content. Keep it coming! 🙌",
    likes: 678,
    time: "3 hours ago",
  },
];

// ===== HELPERS =====

function formatViews(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M views";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K views";
  return n + " views";
}

function formatUpload(days) {
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 7) return days + " days ago";
  if (days < 30) {
    const w = Math.floor(days / 7);
    return w === 1 ? "1 week ago" : w + " weeks ago";
  }
  const m = Math.floor(days / 30);
  return m === 1 ? "1 month ago" : m + " months ago";
}

function seededRandom(seed) {
  let x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// ===== DOM REFS =====

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const topnav = $("#topnav");
const searchInput = $("#searchInput");
const searchForm = $("#searchForm");
const darkModeToggle = $("#darkModeToggle");
const menuToggle = $("#menuToggle");
const sidebar = $("#sidebar");
const main = $("#main");
const videoGrid = $("#videoGrid");
const homePage = $("#homePage");
const watchPage = $("#watchPage");
const chips = $("#chips");
const shortsScroll = $("#shortsScroll");
const logoLink = $("#logoLink");

// Watch page refs
const player = $("#player");
const watchTitle = $("#watchTitle");
const watchViews = $("#watchViews");
const watchDate = $("#watchDate");
const likeCount = $("#likeCount");
const watchAvatar = $("#watchAvatar");
const watchChannelName = $("#watchChannelName");
const watchChannelSubs = $("#watchChannelSubs");
const watchDescText = $("#watchDescText");
const descToggle = $("#descToggle");
const watchDescription = $("#watchDescription");
const commentCount = $("#commentCount");
const commentsList = $("#commentsList");
const watchSecondary = $("#watchSecondary");
const subscribeBtn = $("#subscribeBtn");

// ===== STATE =====

let currentCategory = "all";
let searchQuery = "";
let isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

// ===== THEME =====

function applyTheme() {
  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  const iconLight = darkModeToggle.querySelector(".icon-light");
  const iconDark = darkModeToggle.querySelector(".icon-dark");
  iconLight.style.display = isDark ? "none" : "block";
  iconDark.style.display = isDark ? "block" : "none";
}

darkModeToggle.addEventListener("click", () => {
  isDark = !isDark;
  applyTheme();
});

applyTheme();

// ===== SIDEBAR =====

// Create overlay element for mobile
const sidebarOverlay = document.createElement("div");
sidebarOverlay.className = "sidebar-overlay";
document.body.appendChild(sidebarOverlay);

function isMobile() {
  return window.innerWidth <= 768;
}

menuToggle.addEventListener("click", () => {
  if (isMobile()) {
    sidebar.classList.toggle("sidebar--mobile-open");
    sidebarOverlay.classList.toggle("sidebar-overlay--visible");
  } else {
    sidebar.classList.toggle("sidebar--collapsed");
    main.classList.toggle("main--sidebar-collapsed");
  }
});

sidebarOverlay.addEventListener("click", () => {
  sidebar.classList.remove("sidebar--mobile-open");
  sidebarOverlay.classList.remove("sidebar-overlay--visible");
});

// ===== NAVIGATION =====

function showHomePage() {
  homePage.style.display = "";
  watchPage.style.display = "none";
  window.scrollTo(0, 0);
}

function showWatchPage(videoId) {
  const video = videos.find((v) => v.id === videoId);
  if (!video) return;

  const creator = creatorMap[video.creator];

  // Player background
  player.style.backgroundImage = `url(${video.thumb})`;
  player.style.backgroundSize = "cover";
  player.style.backgroundPosition = "center";

  // Info
  watchTitle.textContent = video.title;
  watchViews.textContent = formatViews(video.views);
  watchDate.textContent = formatUpload(video.uploaded);
  likeCount.textContent = video.likes;

  // Channel
  watchAvatar.textContent = creator.initials;
  watchAvatar.style.backgroundColor = creator.color;
  watchChannelName.textContent = creator.name;
  watchChannelSubs.textContent = creator.subs;

  // Description
  watchDescText.textContent = video.description;
  watchDescription.classList.remove("watch-description--expanded");
  descToggle.textContent = "Show more";

  // Comments
  const numComments = 3 + Math.floor(seededRandom(videoId) * 5);
  const selectedComments = [];
  for (let i = 0; i < numComments; i++) {
    selectedComments.push(commentPool[(videoId * 3 + i) % commentPool.length]);
  }
  commentCount.textContent = numComments;
  commentsList.innerHTML = selectedComments.map((c) => renderComment(c)).join("");

  // Sidebar recommendations
  const recs = videos.filter((v) => v.id !== videoId).slice(0, 10);
  watchSecondary.innerHTML = recs.map((v) => renderRecCard(v)).join("");

  // Bind rec card clicks
  watchSecondary.querySelectorAll(".rec-card").forEach((card) => {
    card.addEventListener("click", () => {
      showWatchPage(parseInt(card.dataset.id));
    });
  });

  homePage.style.display = "none";
  watchPage.style.display = "";
  window.scrollTo(0, 0);
}

logoLink.addEventListener("click", (e) => {
  e.preventDefault();
  searchInput.value = "";
  searchQuery = "";
  currentCategory = "all";
  updateChips();
  renderVideoGrid();
  showHomePage();
});

// ===== SEARCH =====

searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  searchQuery = searchInput.value.trim().toLowerCase();
  currentCategory = "all";
  updateChips();
  renderVideoGrid();
  showHomePage();
});

searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  renderVideoGrid();
  showHomePage();
});

// ===== CATEGORY CHIPS =====

function updateChips() {
  chips.querySelectorAll(".chip").forEach((chip) => {
    chip.classList.toggle("chip--active", chip.dataset.category === currentCategory);
  });
}

chips.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  currentCategory = chip.dataset.category;
  updateChips();
  renderVideoGrid();
});

// ===== DESCRIPTION TOGGLE =====

descToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  const isExpanded = watchDescription.classList.toggle("watch-description--expanded");
  descToggle.textContent = isExpanded ? "Show less" : "Show more";
});

watchDescription.addEventListener("click", () => {
  if (!watchDescription.classList.contains("watch-description--expanded")) {
    watchDescription.classList.add("watch-description--expanded");
    descToggle.textContent = "Show less";
  }
});

// ===== SUBSCRIBE BUTTON =====

subscribeBtn.addEventListener("click", () => {
  if (subscribeBtn.textContent === "Subscribe") {
    subscribeBtn.textContent = "Subscribed";
    subscribeBtn.style.background = "var(--bg-tertiary)";
    subscribeBtn.style.color = "var(--text-primary)";
  } else {
    subscribeBtn.textContent = "Subscribe";
    subscribeBtn.style.background = "";
    subscribeBtn.style.color = "";
  }
});

// ===== RENDER FUNCTIONS =====

function renderVideoCard(video) {
  const creator = creatorMap[video.creator];
  return `
    <article class="video-card" data-id="${video.id}">
      <div class="video-card__thumb" style="background-image:url(${video.thumb})">
        <span class="video-card__duration">${video.duration}</span>
      </div>
      <div class="video-card__details">
        <div class="avatar avatar--card" style="background-color:${creator.color}">${creator.initials}</div>
        <div class="video-card__meta">
          <h3 class="video-card__title">${video.title}</h3>
          <div class="video-card__channel">${creator.name}</div>
          <div class="video-card__stats">${formatViews(video.views)} &bull; ${formatUpload(video.uploaded)}</div>
        </div>
      </div>
    </article>
  `;
}

function renderShortCard(short) {
  const creator = creatorMap[short.creator];
  return `
    <div class="short-card" data-short-id="${short.id}">
      <div class="short-card__thumb" style="background-image:url(${short.thumb})">
        <div class="short-card__overlay">
          <div class="short-card__title">${short.title}</div>
          <div class="short-card__views">${formatViews(short.views)}</div>
        </div>
      </div>
    </div>
  `;
}

function renderComment(comment) {
  return `
    <div class="comment">
      <div class="avatar avatar--comment" style="background-color:${comment.color}">${comment.author.charAt(0)}</div>
      <div class="comment__body">
        <div class="comment__author">${comment.author}<span class="comment__time">${comment.time}</span></div>
        <div class="comment__text">${comment.text}</div>
        <div class="comment__actions">
          <button>
            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 2 7.59 8.59C7.22 8.95 7 9.45 7 10v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>
            ${comment.likes}
          </button>
          <button>
            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 22l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"/></svg>
          </button>
          <button>Reply</button>
        </div>
      </div>
    </div>
  `;
}

function renderRecCard(video) {
  const creator = creatorMap[video.creator];
  return `
    <div class="rec-card" data-id="${video.id}">
      <div class="rec-card__thumb" style="background-image:url(${video.thumb})">
        <span class="rec-card__duration">${video.duration}</span>
      </div>
      <div class="rec-card__meta">
        <div class="rec-card__title">${video.title}</div>
        <div class="rec-card__channel">${creator.name}</div>
        <div class="rec-card__stats">${formatViews(video.views)} &bull; ${formatUpload(video.uploaded)}</div>
      </div>
    </div>
  `;
}

function renderVideoGrid() {
  let filtered = videos;

  // Filter by category
  if (currentCategory !== "all") {
    filtered = filtered.filter((v) => v.category === currentCategory);
  }

  // Filter by search query
  if (searchQuery) {
    filtered = filtered.filter(
      (v) =>
        v.title.toLowerCase().includes(searchQuery) ||
        creatorMap[v.creator].name.toLowerCase().includes(searchQuery),
    );
  }

  if (filtered.length === 0) {
    videoGrid.innerHTML = `
      <div class="no-results">
        <svg viewBox="0 0 24 24" width="64" height="64"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
        <p>No videos found</p>
      </div>
    `;
    return;
  }

  videoGrid.innerHTML = filtered.map(renderVideoCard).join("");

  // Bind click events
  videoGrid.querySelectorAll(".video-card").forEach((card) => {
    card.addEventListener("click", () => {
      showWatchPage(parseInt(card.dataset.id));
    });
  });
}

function renderShorts() {
  shortsScroll.innerHTML = shorts.map(renderShortCard).join("");
}

// ===== SIDEBAR NAV ITEMS =====

sidebar.querySelectorAll(".sidebar__item").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    sidebar
      .querySelectorAll(".sidebar__item")
      .forEach((i) => i.classList.remove("sidebar__item--active"));
    item.classList.add("sidebar__item--active");

    // Close mobile sidebar
    sidebar.classList.remove("sidebar--mobile-open");
    sidebarOverlay.classList.remove("sidebar-overlay--visible");

    // Show home page on any sidebar click (simplified)
    if (item.dataset.page === "home") {
      searchInput.value = "";
      searchQuery = "";
      currentCategory = "all";
      updateChips();
      renderVideoGrid();
    }
    showHomePage();
  });
});

// ===== LIKE / DISLIKE =====

const likeBtn = $("#likeBtn");
const dislikeBtn = $("#dislikeBtn");

likeBtn.addEventListener("click", () => {
  likeBtn.classList.toggle("action-btn--active");
  dislikeBtn.classList.remove("action-btn--active");
  if (likeBtn.classList.contains("action-btn--active")) {
    likeBtn.style.background = "var(--text-primary)";
    likeBtn.style.color = "var(--bg-primary)";
  } else {
    likeBtn.style.background = "";
    likeBtn.style.color = "";
  }
  dislikeBtn.style.background = "";
  dislikeBtn.style.color = "";
});

dislikeBtn.addEventListener("click", () => {
  dislikeBtn.classList.toggle("action-btn--active");
  likeBtn.classList.remove("action-btn--active");
  if (dislikeBtn.classList.contains("action-btn--active")) {
    dislikeBtn.style.background = "var(--text-primary)";
    dislikeBtn.style.color = "var(--bg-primary)";
  } else {
    dislikeBtn.style.background = "";
    dislikeBtn.style.color = "";
  }
  likeBtn.style.background = "";
  likeBtn.style.color = "";
});

// ===== INIT =====

renderShorts();
renderVideoGrid();
