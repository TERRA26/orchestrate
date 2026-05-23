// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const GRID_SIZE = 4;

export type Board = readonly number[];

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MoveResult {
  /** The board after the move. */
  readonly board: Board;
  /** Points gained from merges during this move (sum of merged tile values). */
  readonly score: number;
  /** Whether any tile actually moved or merged. */
  readonly moved: boolean;
}

export type Direction = "left" | "right" | "up" | "down";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Read a cell value by row/column index (returns 0 for any out-of-bounds access). */
function cell(board: Board, row: number, col: number): number {
  return board[row * GRID_SIZE + col] ?? 0;
}

/** Transpose the board so rows become columns and vice versa. */
function transpose(board: Board): number[] {
  const result = Array<number>(GRID_SIZE * GRID_SIZE).fill(0);
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      result[c * GRID_SIZE + r] = cell(board, r, c);
    }
  }
  return result;
}

/** Return a new board with every row's left/right order reversed. */
function reverseRows(board: readonly number[]): number[] {
  const result: number[] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = GRID_SIZE - 1; c >= 0; c--) {
      result.push(board[r * GRID_SIZE + c] ?? 0);
    }
  }
  return result;
}

/**
 * Merge a single row toward the left:
 *  1. Pack non-zero tiles to the left.
 *  2. Merge equal adjacent pairs (each tile merges at most once).
 *  3. Pad right with zeros.
 */
function mergeRowLeft(row: readonly number[]): { row: number[]; score: number } {
  const tiles = row.filter((v) => v !== 0);
  const result: number[] = [];
  let score = 0;
  let i = 0;
  while (i < tiles.length) {
    const current = tiles[i];
    if (current === undefined) break;
    const next = i + 1 < tiles.length ? tiles[i + 1] : undefined;
    if (next !== undefined && current === next) {
      const merged = current * 2;
      result.push(merged);
      score += merged;
      i += 2;
    } else {
      result.push(current);
      i++;
    }
  }
  while (result.length < GRID_SIZE) {
    result.push(0);
  }
  return { row: result, score };
}

// ---------------------------------------------------------------------------
// Move functions
// ---------------------------------------------------------------------------

/** Slide and merge all tiles toward the left. */
export function moveLeft(board: Board): MoveResult {
  let score = 0;
  const next: number[] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    const row = Array.from(board.slice(r * GRID_SIZE, (r + 1) * GRID_SIZE));
    const merged = mergeRowLeft(row);
    score += merged.score;
    next.push(...merged.row);
  }
  const moved = next.some((v, i) => v !== (board[i] ?? -1));
  return { board: next, score, moved };
}

/** Slide and merge all tiles toward the right. */
export function moveRight(board: Board): MoveResult {
  const reversed = reverseRows(board);
  const result = moveLeft(reversed);
  const unreversed = reverseRows(result.board);
  const moved = unreversed.some((v, i) => v !== (board[i] ?? -1));
  return { board: unreversed, score: result.score, moved };
}

/** Slide and merge all tiles upward. */
export function moveUp(board: Board): MoveResult {
  const transposed = transpose(board);
  const result = moveLeft(transposed);
  const untransposed = transpose(result.board);
  const moved = untransposed.some((v, i) => v !== (board[i] ?? -1));
  return { board: untransposed, score: result.score, moved };
}

/** Slide and merge all tiles downward. */
export function moveDown(board: Board): MoveResult {
  const transposed = transpose(board);
  const result = moveRight(transposed);
  const untransposed = transpose(result.board);
  const moved = untransposed.some((v, i) => v !== (board[i] ?? -1));
  return { board: untransposed, score: result.score, moved };
}

/** Apply a move in the given direction. */
export function applyMove(board: Board, direction: Direction): MoveResult {
  switch (direction) {
    case "left":
      return moveLeft(board);
    case "right":
      return moveRight(board);
    case "up":
      return moveUp(board);
    case "down":
      return moveDown(board);
  }
}

// ---------------------------------------------------------------------------
// Game state helpers
// ---------------------------------------------------------------------------

/** Create a blank 4×4 board (all zeros). */
export function createEmptyBoard(): Board {
  return Array<number>(GRID_SIZE * GRID_SIZE).fill(0);
}

/**
 * Spawn a new tile on a random empty cell.
 * 90% chance of spawning a 2, 10% chance of a 4.
 * Returns the same board reference if no empty cell is available.
 *
 * @param rng – injectable random source; defaults to Math.random (useful for tests).
 */
export function spawnTile(board: Board, rng: () => number = Math.random): Board {
  const empties: number[] = [];
  board.forEach((v, i) => {
    if (v === 0) empties.push(i);
  });
  if (empties.length === 0) return board;
  const chosen = empties[Math.floor(rng() * empties.length)];
  if (chosen === undefined) return board;
  const value = rng() < 0.9 ? 2 : 4;
  const next = [...board] as number[];
  next[chosen] = value;
  return next;
}

/** Return true when the board has no valid moves remaining (game over). */
export function isGameOver(board: Board): boolean {
  // Any empty cell means a valid move exists
  if (board.some((v) => v === 0)) return false;
  // Check for horizontally adjacent equal tiles
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE - 1; c++) {
      if (cell(board, r, c) === cell(board, r, c + 1)) return false;
    }
  }
  // Check for vertically adjacent equal tiles
  for (let r = 0; r < GRID_SIZE - 1; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (cell(board, r, c) === cell(board, r + 1, c)) return false;
    }
  }
  return true;
}

/** Return true when the board contains a tile of 2048 or higher. */
export function has2048(board: Board): boolean {
  return board.some((v) => v >= 2048);
}
