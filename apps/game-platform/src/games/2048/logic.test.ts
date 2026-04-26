import { describe, expect, it } from "vitest";
import {
  type Board,
  createEmptyBoard,
  has2048,
  isGameOver,
  moveDown,
  moveLeft,
  moveRight,
  moveUp,
  spawnTile,
} from "./logic";

// ---------------------------------------------------------------------------
// moveLeft
// ---------------------------------------------------------------------------

describe("moveLeft", () => {
  it("slides tiles to the left and reports moved=true", () => {
    const board: Board = [0, 0, 2, 0, 0, 4, 0, 0, 0, 0, 0, 8, 2, 0, 0, 0];
    const { board: result, moved } = moveLeft(board);
    expect(result.slice(0, 4)).toEqual([2, 0, 0, 0]);
    expect(result.slice(4, 8)).toEqual([4, 0, 0, 0]);
    expect(result.slice(8, 12)).toEqual([8, 0, 0, 0]);
    expect(result.slice(12, 16)).toEqual([2, 0, 0, 0]);
    expect(moved).toBe(true);
  });

  it("merges equal adjacent tiles and accumulates score", () => {
    const board: Board = [2, 2, 0, 0, 4, 4, 4, 4, 2, 2, 2, 2, 8, 0, 8, 0];
    const { board: result, score } = moveLeft(board);
    expect(result.slice(0, 4)).toEqual([4, 0, 0, 0]);
    // 4+4+4+4 → 8,8 (first pair merges, then second pair merges)
    expect(result.slice(4, 8)).toEqual([8, 8, 0, 0]);
    expect(result.slice(8, 12)).toEqual([4, 4, 0, 0]);
    expect(result.slice(12, 16)).toEqual([16, 0, 0, 0]);
    // 4 + (8+8) + (4+4) + 16 = 44
    expect(score).toBe(44);
  });

  it("does not merge a tile twice in one move", () => {
    // [2, 2, 4, 0] → merge 2+2=4, then NOT 4+4 again → [4, 4, 0, 0]
    const board: Board = [2, 2, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const { board: result, score } = moveLeft(board);
    expect(result.slice(0, 4)).toEqual([4, 4, 0, 0]);
    expect(score).toBe(4);
  });

  it("reports moved=false when board is already packed left with no merges", () => {
    const board: Board = [2, 4, 8, 16, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const { moved } = moveLeft(board);
    expect(moved).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// moveRight
// ---------------------------------------------------------------------------

describe("moveRight", () => {
  it("slides tiles to the right", () => {
    const board: Board = [2, 0, 0, 0, 0, 4, 0, 0, 8, 0, 0, 0, 0, 0, 0, 2];
    const { board: result } = moveRight(board);
    expect(result.slice(0, 4)).toEqual([0, 0, 0, 2]);
    expect(result.slice(4, 8)).toEqual([0, 0, 0, 4]);
    expect(result.slice(8, 12)).toEqual([0, 0, 0, 8]);
    expect(result.slice(12, 16)).toEqual([0, 0, 0, 2]);
  });

  it("merges equal tiles on the right and reports score", () => {
    const board: Board = [0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const { board: result, score } = moveRight(board);
    expect(result.slice(0, 4)).toEqual([0, 0, 0, 4]);
    expect(score).toBe(4);
  });

  it("rightmost pair merges when multiple equal tiles present", () => {
    // [2, 2, 2, 0] → pack right → [0, 2, 2, 2] → merge rightmost pair → [0, 2, 0, 4]
    // Wait, moveRight: reverseRows then moveLeft then reverseRows
    // reversed row: [0, 2, 2, 2] → mergeLeft: tiles=[2,2,2] → 4,2 → [4,2,0,0]
    // unreverse: [0,0,2,4]
    const board: Board = [2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const { board: result, score } = moveRight(board);
    expect(result.slice(0, 4)).toEqual([0, 0, 2, 4]);
    expect(score).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// moveUp
// ---------------------------------------------------------------------------

describe("moveUp", () => {
  it("slides tiles upward", () => {
    const board: Board = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 4, 8, 16];
    const { board: result } = moveUp(board);
    // Column 0 should have 2 at top
    expect(result[0]).toBe(2);
    expect(result[4]).toBe(0);
    expect(result[8]).toBe(0);
    expect(result[12]).toBe(0);
    // Column 1 should have 4 at top
    expect(result[1]).toBe(4);
  });

  it("merges equal tiles upward and reports score", () => {
    const board: Board = [2, 0, 0, 0, 2, 0, 0, 0, 4, 0, 0, 0, 4, 0, 0, 0];
    const { board: result, score } = moveUp(board);
    // col 0: [2,2,4,4] → mergeLeft → [4,8,0,0]
    expect(result[0]).toBe(4);
    expect(result[4]).toBe(8);
    expect(result[8]).toBe(0);
    expect(result[12]).toBe(0);
    expect(score).toBe(12); // 4 + 8
  });
});

// ---------------------------------------------------------------------------
// moveDown
// ---------------------------------------------------------------------------

describe("moveDown", () => {
  it("slides tiles downward", () => {
    const board: Board = [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const { board: result } = moveDown(board);
    expect(result[0]).toBe(0);
    expect(result[4]).toBe(0);
    expect(result[8]).toBe(0);
    expect(result[12]).toBe(2);
  });

  it("merges equal tiles downward and reports score", () => {
    const board: Board = [2, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const { board: result, score } = moveDown(board);
    // col 0: [2,2,0,0] → after moveDown → bottom: [0,0,0,4]
    expect(result[0]).toBe(0);
    expect(result[4]).toBe(0);
    expect(result[8]).toBe(0);
    expect(result[12]).toBe(4);
    expect(score).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// isGameOver
// ---------------------------------------------------------------------------

describe("isGameOver", () => {
  it("returns false when empty cells exist", () => {
    expect(isGameOver(createEmptyBoard())).toBe(false);
  });

  it("returns false when a horizontal merge is possible", () => {
    const board: Board = [2, 2, 4, 8, 4, 8, 16, 32, 8, 16, 32, 64, 16, 32, 64, 128];
    expect(isGameOver(board)).toBe(false);
  });

  it("returns false when a vertical merge is possible", () => {
    const board: Board = [2, 4, 8, 16, 2, 8, 16, 32, 4, 16, 32, 64, 8, 32, 64, 128];
    expect(isGameOver(board)).toBe(false);
  });

  it("returns true when no moves are possible on a full board", () => {
    // Alternating pattern — no two adjacent cells share the same value
    const board: Board = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2];
    expect(isGameOver(board)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// spawnTile
// ---------------------------------------------------------------------------

describe("spawnTile", () => {
  it("places exactly one non-zero tile on an empty board", () => {
    const board = createEmptyBoard();
    const next = spawnTile(board);
    const nonZero = next.filter((v) => v !== 0);
    expect(nonZero).toHaveLength(1);
    expect([2, 4]).toContain(nonZero[0]);
  });

  it("returns the same reference when the board is full", () => {
    const full: Board = Array<number>(16).fill(2);
    const result = spawnTile(full);
    expect(result).toBe(full);
  });

  it("spawns a 2 when rng value < 0.9", () => {
    const board = createEmptyBoard();
    let call = 0;
    // First call selects position (0.5 → midway), second decides value (0.05 < 0.9 → 2)
    const deterministicRng = () => (call++ === 0 ? 0.5 : 0.05);
    const next = spawnTile(board, deterministicRng);
    expect(next.filter((v) => v === 2)).toHaveLength(1);
  });

  it("spawns a 4 when rng value >= 0.9", () => {
    const board = createEmptyBoard();
    let call = 0;
    // First call selects position, second decides value (0.95 >= 0.9 → 4)
    const deterministicRng = () => (call++ === 0 ? 0.0 : 0.95);
    const next = spawnTile(board, deterministicRng);
    expect(next.filter((v) => v === 4)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// has2048
// ---------------------------------------------------------------------------

describe("has2048", () => {
  it("returns false on empty board", () => {
    expect(has2048(createEmptyBoard())).toBe(false);
  });

  it("returns true when 2048 tile present", () => {
    const board = [...createEmptyBoard()] as number[];
    board[0] = 2048;
    expect(has2048(board)).toBe(true);
  });

  it("returns true for values exceeding 2048", () => {
    const board = [...createEmptyBoard()] as number[];
    board[5] = 4096;
    expect(has2048(board)).toBe(true);
  });
});
