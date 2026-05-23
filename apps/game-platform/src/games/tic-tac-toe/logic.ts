/**
 * Pure game logic for Tic-Tac-Toe.
 * No React, no side effects — fully testable in isolation.
 */

export type Player = "X" | "O";
export type Cell = Player | null;
/** A flat 9-element array representing the 3×3 board (row-major order). */
export type Board = Cell[];

/** Three board indices that form a winning line. */
export type WinLine = [number, number, number];

export interface WinResult {
  player: Player;
  line: WinLine;
}

export const WIN_LINES: WinLine[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function opposite(player: Player): Player {
  return player === "X" ? "O" : "X";
}

export function emptyBoard(): Board {
  return Array<Cell>(9).fill(null);
}

/** Returns the winning player and line, or null if no winner yet. */
export function checkWinner(board: Board): WinResult | null {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    const ca = board[a];
    const cb = board[b];
    const cc = board[c];
    // ca != null narrows from Cell | undefined → Player
    if (ca != null && ca === cb && ca === cc) {
      return { player: ca, line };
    }
  }
  return null;
}

/** True when every cell is occupied (regardless of win state). */
export function isBoardFull(board: Board): boolean {
  return board.every((c) => c !== null);
}

function getEmptyCells(board: Board): number[] {
  return board.reduce<number[]>((acc, c, i) => {
    if (c === null) acc.push(i);
    return acc;
  }, []);
}

/**
 * Minimax with score adjusted by depth so the AI:
 *  - wins as fast as possible
 *  - delays losing as long as possible
 *
 * Mutates `board` in-place during recursion but always restores it before returning.
 */
function minimax(board: Board, depth: number, isMaximizing: boolean, aiPlayer: Player): number {
  const winner = checkWinner(board);
  if (winner) {
    return winner.player === aiPlayer ? 10 - depth : depth - 10;
  }
  if (isBoardFull(board)) return 0;

  const emptyCells = getEmptyCells(board);
  const human = opposite(aiPlayer);

  if (isMaximizing) {
    let best = -Infinity;
    for (const i of emptyCells) {
      board[i] = aiPlayer;
      const score = minimax(board, depth + 1, false, aiPlayer);
      board[i] = null;
      if (score > best) best = score;
    }
    return best;
  } else {
    let best = Infinity;
    for (const i of emptyCells) {
      board[i] = human;
      const score = minimax(board, depth + 1, true, aiPlayer);
      board[i] = null;
      if (score < best) best = score;
    }
    return best;
  }
}

/**
 * Returns the index of the best move for `aiPlayer`.
 * Returns -1 if the board is already full (no moves available).
 *
 * Pass a copy of the board — this function mutates it temporarily.
 */
export function getBestMove(board: Board, aiPlayer: Player): number {
  const emptyCells = getEmptyCells(board);
  if (emptyCells.length === 0) return -1;

  let bestScore = -Infinity;
  let bestMove = emptyCells[0] ?? 0;

  for (const i of emptyCells) {
    board[i] = aiPlayer;
    const score = minimax(board, 0, false, aiPlayer);
    board[i] = null;
    if (score > bestScore) {
      bestScore = score;
      bestMove = i;
    }
  }

  return bestMove;
}
