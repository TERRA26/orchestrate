// ── Difficulty presets ────────────────────────────────────
const DIFFICULTIES = {
  easy: { cols: 9, rows: 9, mines: 10 },
  medium: { cols: 16, rows: 16, mines: 40 },
  hard: { cols: 30, rows: 16, mines: 99 },
};

// ── State ────────────────────────────────────────────────
let difficulty = "medium";
let cols, rows, mineCount;
let board; // 2-D array of cell objects
let revealed; // count of revealed non-mine cells
let flagCount;
let gameOver;
let gameWon;
let firstClick;
let timerInterval;
let elapsedSeconds;

// ── DOM refs ─────────────────────────────────────────────
const boardEl = document.getElementById("board");
const mineCounterEl = document.getElementById("mine-counter");
const timerEl = document.getElementById("timer");
const smileyBtn = document.getElementById("smiley-btn");
const overlayEl = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayMsg = document.getElementById("overlay-message");
const overlayBtn = document.getElementById("overlay-btn");
const diffBtns = document.querySelectorAll(".diff-btn");

// ── Helpers ──────────────────────────────────────────────
function pad3(n) {
  const s = String(Math.max(-99, Math.min(999, n)));
  return s.padStart(3, "0");
}

function neighbors(r, c) {
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        out.push([nr, nc]);
      }
    }
  }
  return out;
}

// ── Board creation ───────────────────────────────────────
function createBoard() {
  board = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push({ mine: false, adj: 0, revealed: false, flagged: false });
    }
    board.push(row);
  }
}

function placeMines(safeR, safeC) {
  // Collect safe zone (the first-click cell and its neighbours)
  const safeSet = new Set();
  safeSet.add(`${safeR},${safeC}`);
  for (const [nr, nc] of neighbors(safeR, safeC)) {
    safeSet.add(`${nr},${nc}`);
  }

  let placed = 0;
  while (placed < mineCount) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    if (board[r][c].mine || safeSet.has(`${r},${c}`)) continue;
    board[r][c].mine = true;
    placed++;
  }

  // Compute adjacency numbers
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].mine) continue;
      let count = 0;
      for (const [nr, nc] of neighbors(r, c)) {
        if (board[nr][nc].mine) count++;
      }
      board[r][c].adj = count;
    }
  }
}

// ── Rendering ────────────────────────────────────────────
function renderBoard() {
  boardEl.innerHTML = "";
  boardEl.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;
  boardEl.style.gridTemplateRows = `repeat(${rows}, var(--cell-size))`;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const el = document.createElement("div");
      el.className = "cell unrevealed";
      el.dataset.r = r;
      el.dataset.c = c;
      boardEl.appendChild(el);
    }
  }
}

function cellEl(r, c) {
  return boardEl.children[r * cols + c];
}

function refreshCell(r, c) {
  const cell = board[r][c];
  const el = cellEl(r, c);

  // Reset classes
  el.className = "cell";
  el.textContent = "";

  if (cell.revealed) {
    el.classList.add("revealed");
    if (cell.mine) {
      el.classList.add("mine");
    } else if (cell.adj > 0) {
      el.classList.add(`n${cell.adj}`);
      el.textContent = cell.adj;
    }
  } else {
    el.classList.add("unrevealed");
    if (cell.flagged) {
      el.classList.add("flagged");
    }
  }
}

// ── Timer ────────────────────────────────────────────────
function startTimer() {
  if (timerInterval) return;
  timerInterval = setInterval(() => {
    elapsedSeconds++;
    timerEl.textContent = pad3(elapsedSeconds);
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

// ── Game actions ─────────────────────────────────────────
function revealCell(r, c) {
  const cell = board[r][c];
  if (cell.revealed || cell.flagged || gameOver || gameWon) return;

  cell.revealed = true;
  revealed++;
  refreshCell(r, c);

  if (cell.mine) {
    triggerLoss(r, c);
    return;
  }

  // Flood-fill for zero-adj cells
  if (cell.adj === 0) {
    for (const [nr, nc] of neighbors(r, c)) {
      revealCell(nr, nc);
    }
  }

  checkWin();
}

function toggleFlag(r, c) {
  const cell = board[r][c];
  if (cell.revealed || gameOver || gameWon) return;

  cell.flagged = !cell.flagged;
  flagCount += cell.flagged ? 1 : -1;
  mineCounterEl.textContent = pad3(mineCount - flagCount);
  refreshCell(r, c);
}

function checkWin() {
  const target = rows * cols - mineCount;
  if (revealed >= target) {
    gameWon = true;
    stopTimer();
    smileyBtn.textContent = "\u{1F60E}"; // 😎
    showOverlay(true);
  }
}

function triggerLoss(clickR, clickC) {
  gameOver = true;
  stopTimer();
  smileyBtn.textContent = "\u{1F635}"; // 😵

  // Reveal all mines & mark wrong flags
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = board[r][c];
      const el = cellEl(r, c);

      if (cell.mine && !cell.flagged) {
        cell.revealed = true;
        refreshCell(r, c);
      }

      if (!cell.mine && cell.flagged) {
        el.className = "cell revealed wrong-flag";
      }
    }
  }

  // Highlight triggered mine
  const trigEl = cellEl(clickR, clickC);
  trigEl.classList.add("triggered");

  showOverlay(false);
}

function showOverlay(won) {
  overlayEl.classList.remove("hidden");
  if (won) {
    overlayTitle.textContent = "\u{1F389} You Win!";
    overlayMsg.textContent = `Cleared in ${elapsedSeconds} second${elapsedSeconds !== 1 ? "s" : ""}!`;
  } else {
    overlayTitle.textContent = "\u{1F4A5} Game Over";
    overlayMsg.textContent = "You hit a mine!";
  }
}

// ── New game ─────────────────────────────────────────────
function newGame() {
  const d = DIFFICULTIES[difficulty];
  cols = d.cols;
  rows = d.rows;
  mineCount = d.mines;
  revealed = 0;
  flagCount = 0;
  gameOver = false;
  gameWon = false;
  firstClick = true;
  stopTimer();
  elapsedSeconds = 0;

  mineCounterEl.textContent = pad3(mineCount);
  timerEl.textContent = pad3(0);
  smileyBtn.textContent = "\u{1F60A}"; // 😊
  overlayEl.classList.add("hidden");

  createBoard();
  renderBoard();
}

// ── Event listeners ──────────────────────────────────────
boardEl.addEventListener("click", (e) => {
  const el = e.target.closest(".cell");
  if (!el) return;
  const r = Number(el.dataset.r);
  const c = Number(el.dataset.c);

  if (gameOver || gameWon) return;

  if (firstClick) {
    firstClick = false;
    placeMines(r, c);
    startTimer();
  }

  revealCell(r, c);
});

boardEl.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const el = e.target.closest(".cell");
  if (!el) return;
  const r = Number(el.dataset.r);
  const c = Number(el.dataset.c);

  if (gameOver || gameWon) return;

  if (firstClick) {
    // Allow flagging before first reveal — but don't start timer / generate mines yet
  }

  toggleFlag(r, c);
});

smileyBtn.addEventListener("click", () => newGame());
overlayBtn.addEventListener("click", () => newGame());

diffBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    difficulty = btn.dataset.difficulty;
    diffBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    newGame();
  });
});

// ── Boot ─────────────────────────────────────────────────
newGame();
