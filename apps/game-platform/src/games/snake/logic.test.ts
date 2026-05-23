import { describe, expect, it } from "vitest";
import { GRID_COLS, GRID_ROWS, createInitialState, resolveDirection, tick } from "./logic";
import type { GameState } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a playing GameState with selective field overrides for test setup. */
function playingState(overrides: Partial<GameState>): GameState {
  return {
    ...createInitialState(),
    status: "playing",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// resolveDirection
// ---------------------------------------------------------------------------

describe("resolveDirection", () => {
  it("allows turning 90°", () => {
    expect(resolveDirection("RIGHT", "UP")).toBe("UP");
    expect(resolveDirection("RIGHT", "DOWN")).toBe("DOWN");
    expect(resolveDirection("UP", "LEFT")).toBe("LEFT");
    expect(resolveDirection("UP", "RIGHT")).toBe("RIGHT");
    expect(resolveDirection("DOWN", "LEFT")).toBe("LEFT");
    expect(resolveDirection("LEFT", "DOWN")).toBe("DOWN");
  });

  it("blocks 180° reversals", () => {
    expect(resolveDirection("RIGHT", "LEFT")).toBe("RIGHT");
    expect(resolveDirection("LEFT", "RIGHT")).toBe("LEFT");
    expect(resolveDirection("UP", "DOWN")).toBe("UP");
    expect(resolveDirection("DOWN", "UP")).toBe("DOWN");
  });

  it("allows continuing in the same direction", () => {
    expect(resolveDirection("RIGHT", "RIGHT")).toBe("RIGHT");
    expect(resolveDirection("UP", "UP")).toBe("UP");
  });
});

// ---------------------------------------------------------------------------
// tick — movement
// ---------------------------------------------------------------------------

describe("tick: movement", () => {
  it("moves the head right", () => {
    const state = playingState({
      snake: [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
      ],
      direction: "RIGHT",
      nextDirection: "RIGHT",
    });
    const next = tick(state);
    expect(next.snake[0]).toEqual({ x: 6, y: 5 });
  });

  it("moves the head left", () => {
    const state = playingState({
      snake: [
        { x: 5, y: 5 },
        { x: 6, y: 5 },
      ],
      direction: "LEFT",
      nextDirection: "LEFT",
    });
    expect(tick(state).snake[0]).toEqual({ x: 4, y: 5 });
  });

  it("moves the head up", () => {
    const state = playingState({
      snake: [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
      ],
      direction: "UP",
      nextDirection: "UP",
    });
    expect(tick(state).snake[0]).toEqual({ x: 5, y: 4 });
  });

  it("moves the head down", () => {
    const state = playingState({
      snake: [
        { x: 5, y: 5 },
        { x: 5, y: 4 },
      ],
      direction: "DOWN",
      nextDirection: "DOWN",
    });
    expect(tick(state).snake[0]).toEqual({ x: 5, y: 6 });
  });

  it("body follows head, tail is dropped", () => {
    const state = playingState({
      snake: [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
        { x: 3, y: 5 },
      ],
      direction: "RIGHT",
      nextDirection: "RIGHT",
      food: { x: 0, y: 0 }, // far away
    });
    const next = tick(state);
    expect(next.snake).toHaveLength(3);
    expect(next.snake[0]).toEqual({ x: 6, y: 5 });
    expect(next.snake[1]).toEqual({ x: 5, y: 5 });
    expect(next.snake[2]).toEqual({ x: 4, y: 5 });
  });

  it("applies nextDirection (queued turn)", () => {
    const state = playingState({
      snake: [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
      ],
      direction: "RIGHT",
      nextDirection: "UP", // queued turn
      food: { x: 0, y: 0 },
    });
    const next = tick(state);
    expect(next.snake[0]).toEqual({ x: 5, y: 4 });
    expect(next.direction).toBe("UP");
  });

  it("is a no-op when status is paused", () => {
    const state = playingState({ status: "paused" });
    expect(tick(state)).toBe(state);
  });

  it("is a no-op when status is idle", () => {
    const state = playingState({ status: "idle" });
    expect(tick(state)).toBe(state);
  });
});

// ---------------------------------------------------------------------------
// tick — collision
// ---------------------------------------------------------------------------

describe("tick: wall collisions", () => {
  it("detects right wall", () => {
    const state = playingState({
      snake: [
        { x: GRID_COLS - 1, y: 5 },
        { x: GRID_COLS - 2, y: 5 },
      ],
      direction: "RIGHT",
      nextDirection: "RIGHT",
    });
    expect(tick(state).status).toBe("over");
  });

  it("detects left wall", () => {
    const state = playingState({
      snake: [
        { x: 0, y: 5 },
        { x: 1, y: 5 },
      ],
      direction: "LEFT",
      nextDirection: "LEFT",
    });
    expect(tick(state).status).toBe("over");
  });

  it("detects top wall", () => {
    const state = playingState({
      snake: [
        { x: 5, y: 0 },
        { x: 5, y: 1 },
      ],
      direction: "UP",
      nextDirection: "UP",
    });
    expect(tick(state).status).toBe("over");
  });

  it("detects bottom wall", () => {
    const state = playingState({
      snake: [
        { x: 5, y: GRID_ROWS - 1 },
        { x: 5, y: GRID_ROWS - 2 },
      ],
      direction: "DOWN",
      nextDirection: "DOWN",
    });
    expect(tick(state).status).toBe("over");
  });
});

describe("tick: self collision", () => {
  it("detects head moving into body", () => {
    // Arrange: snake curled so next step lands on its own body
    //   Head at (5,5), body at (5,6), (5,7) — moving DOWN → new head (5,6) = collision
    const state = playingState({
      snake: [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 5, y: 7 },
      ],
      direction: "DOWN",
      nextDirection: "DOWN",
    });
    expect(tick(state).status).toBe("over");
  });
});

// ---------------------------------------------------------------------------
// tick — food
// ---------------------------------------------------------------------------

describe("tick: food", () => {
  it("grows the snake and increments score when eating food", () => {
    const state = playingState({
      snake: [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
      ],
      food: { x: 6, y: 5 },
      direction: "RIGHT",
      nextDirection: "RIGHT",
      score: 0,
    });
    const next = tick(state);
    expect(next.snake).toHaveLength(3); // grew
    expect(next.score).toBe(10);
  });

  it("does not grow when food is not eaten", () => {
    const state = playingState({
      snake: [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
      ],
      food: { x: 0, y: 0 },
      direction: "RIGHT",
      nextDirection: "RIGHT",
      score: 0,
    });
    const next = tick(state);
    expect(next.snake).toHaveLength(2);
    expect(next.score).toBe(0);
  });

  it("respawns food at a new position after eating", () => {
    const state = playingState({
      snake: [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
      ],
      food: { x: 6, y: 5 },
      direction: "RIGHT",
      nextDirection: "RIGHT",
    });
    const next = tick(state);
    // Food must have moved (it's now in the head cell that was just eaten)
    const foodIsOnSnake = next.snake.some((p) => p.x === next.food.x && p.y === next.food.y);
    expect(foodIsOnSnake).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createInitialState
// ---------------------------------------------------------------------------

describe("createInitialState", () => {
  it("starts in idle status", () => {
    expect(createInitialState().status).toBe("idle");
  });

  it("starts with score 0", () => {
    expect(createInitialState().score).toBe(0);
  });

  it("food is not on the snake", () => {
    const { snake, food } = createInitialState();
    const onSnake = snake.some((p) => p.x === food.x && p.y === food.y);
    expect(onSnake).toBe(false);
  });
});
