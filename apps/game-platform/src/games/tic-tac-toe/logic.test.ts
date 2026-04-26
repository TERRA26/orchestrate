import { describe, expect, it } from "vitest";

import {
  checkWinner,
  emptyBoard,
  getBestMove,
  isBoardFull,
  opposite,
  type Board,
  type Player,
} from "./logic";

// ─── checkWinner ────────────────────────────────────────────────────────────

describe("checkWinner", () => {
  it("returns null for an empty board", () => {
    expect(checkWinner(emptyBoard())).toBeNull();
  });

  it("returns null for a partially-filled board with no winner", () => {
    const board: Board = ["X", null, null, null, "O", null, null, null, null];
    expect(checkWinner(board)).toBeNull();
  });

  it.each([
    ["top row", [0, 1, 2]],
    ["middle row", [3, 4, 5]],
    ["bottom row", [6, 7, 8]],
    ["left column", [0, 3, 6]],
    ["middle column", [1, 4, 7]],
    ["right column", [2, 5, 8]],
    ["main diagonal", [0, 4, 8]],
    ["anti-diagonal", [2, 4, 6]],
  ] as const)("detects win on %s", (_name, line) => {
    const board = emptyBoard();
    for (const idx of line) board[idx] = "X";
    const result = checkWinner(board);
    expect(result?.player).toBe("X");
    expect(result?.line).toEqual(line);
  });

  it("detects an O win", () => {
    const board: Board = ["O", "O", "O", null, null, null, null, null, null];
    const result = checkWinner(board);
    expect(result?.player).toBe("O");
    expect(result?.line).toEqual([0, 1, 2]);
  });

  it("returns null for a drawn board", () => {
    // X O X
    // X X O
    // O X O   — no winner
    const board: Board = ["X", "O", "X", "X", "X", "O", "O", "X", "O"];
    expect(checkWinner(board)).toBeNull();
  });
});

// ─── isBoardFull ────────────────────────────────────────────────────────────

describe("isBoardFull", () => {
  it("returns false for an empty board", () => {
    expect(isBoardFull(emptyBoard())).toBe(false);
  });

  it("returns false for a partially-filled board", () => {
    const board: Board = ["X", null, "O", null, null, null, null, null, null];
    expect(isBoardFull(board)).toBe(false);
  });

  it("returns true for a completely-filled board", () => {
    const board: Board = ["X", "O", "X", "X", "X", "O", "O", "X", "O"];
    expect(isBoardFull(board)).toBe(true);
  });
});

// ─── opposite ───────────────────────────────────────────────────────────────

describe("opposite", () => {
  it("maps X → O", () => expect(opposite("X")).toBe("O"));
  it("maps O → X", () => expect(opposite("O")).toBe("X"));
});

// ─── getBestMove (minimax) ───────────────────────────────────────────────────

describe("getBestMove", () => {
  it("returns -1 on a full board", () => {
    const board: Board = ["X", "O", "X", "X", "X", "O", "O", "X", "O"];
    expect(getBestMove([...board], "X")).toBe(-1);
  });

  it("always picks an empty cell", () => {
    const board: Board = ["X", "O", null, "O", "X", null, null, null, null];
    const move = getBestMove([...board], "X");
    expect(move).toBeGreaterThanOrEqual(0);
    expect(move).toBeLessThan(9);
    expect(board[move]).toBeNull();
  });

  it("takes the immediate winning move (AI as X)", () => {
    // X X _   → AI (X) must play index 2 to win
    // O O _
    // _ _ _
    const board: Board = ["X", "X", null, "O", "O", null, null, null, null];
    expect(getBestMove([...board], "X")).toBe(2);
  });

  it("takes the immediate winning move (AI as O)", () => {
    // O O _   → AI (O) must play index 2 to win
    // X X _
    // _ _ _
    const board: Board = ["O", "O", null, "X", "X", null, null, null, null];
    expect(getBestMove([...board], "O")).toBe(2);
  });

  it("blocks human from winning (column)", () => {
    // Human (X) owns 0 and 3; AI (O) must play index 6 to block
    // X _ O
    // X O _
    // _ _ _
    const board: Board = ["X", null, "O", "X", "O", null, null, null, null];
    expect(getBestMove([...board], "O")).toBe(6);
  });

  it("blocks human from winning (row)", () => {
    // Human (X) would win at index 1
    // X _ X
    // _ O _
    // _ _ _
    const board: Board = ["X", null, "X", null, "O", null, null, null, null];
    expect(getBestMove([...board], "O")).toBe(1);
  });

  it("prefers win over block when both are possible", () => {
    // AI (O) can win at index 6 (column 0), human (X) threatens index 2 (row 0)
    // X X _
    // _ _ _
    // O O _
    const board: Board = ["X", "X", null, null, null, null, "O", "O", null];
    expect(getBestMove([...board], "O")).toBe(8);
  });

  it("AI is unbeatable — never loses from an empty board (O plays optimally against naive X)", () => {
    // Simulate: AI is O and goes second.
    // X plays top-left (worst opening for X against perfect O).
    // Verify AI never allows X to win through the rest of the game.
    function simulateGame(aiMarker: Player): "X" | "O" | "draw" {
      const board = emptyBoard();
      const human: Player = opposite(aiMarker);
      let current: Player = "X"; // X always goes first in standard rules

      // Naive human strategy: first available empty cell
      function humanMove() {
        const idx = board.findIndex((c) => c === null);
        if (idx !== -1) board[idx] = human;
      }

      for (let turn = 0; turn < 9; turn++) {
        if (current === aiMarker) {
          const move = getBestMove([...board], aiMarker);
          if (move !== -1) board[move] = aiMarker;
        } else {
          humanMove();
        }
        const winner = checkWinner(board);
        if (winner) return winner.player;
        if (isBoardFull(board)) return "draw";
        current = opposite(current);
      }
      return "draw";
    }

    // AI as X (goes first) should always win or draw
    const resultAsX = simulateGame("X");
    expect(["X", "draw"]).toContain(resultAsX);
    // AI as X going first against naive opponent should actually win
    expect(resultAsX).toBe("X");

    // AI as O (goes second) against naive opponent — should at least draw
    const resultAsO = simulateGame("O");
    expect(["O", "draw"]).toContain(resultAsO);
  });
});
