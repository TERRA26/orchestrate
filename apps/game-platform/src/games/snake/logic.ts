import type { Direction, GameState, Point } from "./types";

// ---------------------------------------------------------------------------
// Grid constants
// ---------------------------------------------------------------------------

export const GRID_COLS = 20;
export const GRID_ROWS = 20;
export const CELL_PX = 24;
export const TICK_MS = 80; // ~12.5 ticks / second

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function randomFood(exclude: readonly Point[]): Point {
  const occupied = new Set(exclude.map((p) => `${p.x},${p.y}`));
  let p: Point;
  do {
    p = {
      x: Math.floor(Math.random() * GRID_COLS),
      y: Math.floor(Math.random() * GRID_ROWS),
    };
  } while (occupied.has(`${p.x},${p.y}`));
  return p;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns a fresh idle game state (snake centred, food randomly placed). */
export function createInitialState(): GameState {
  const snake: Point[] = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ];
  return {
    snake,
    food: randomFood(snake),
    direction: "RIGHT",
    nextDirection: "RIGHT",
    score: 0,
    status: "idle",
  };
}

/**
 * Returns the resolved direction after filtering out 180-degree reversals.
 * If `requested` is directly opposite to `current`, `current` is returned
 * unchanged.
 */
export function resolveDirection(current: Direction, requested: Direction): Direction {
  const opposite: Record<Direction, Direction> = {
    UP: "DOWN",
    DOWN: "UP",
    LEFT: "RIGHT",
    RIGHT: "LEFT",
  };
  return opposite[current] === requested ? current : requested;
}

/**
 * Advances the game by one tick. Returns the same reference if the game is
 * not in "playing" state.
 */
export function tick(state: GameState): GameState {
  if (state.status !== "playing") return state;

  // nextDirection is already validated against direction (done in the reducer)
  const direction = state.nextDirection;
  const head = state.snake[0]!; // snake always has ≥1 cell while playing

  const dx = direction === "RIGHT" ? 1 : direction === "LEFT" ? -1 : 0;
  const dy = direction === "DOWN" ? 1 : direction === "UP" ? -1 : 0;
  const newHead: Point = { x: head.x + dx, y: head.y + dy };

  // Wall collision
  if (newHead.x < 0 || newHead.x >= GRID_COLS || newHead.y < 0 || newHead.y >= GRID_ROWS) {
    return { ...state, direction, status: "over" };
  }

  // Self collision (check full current body before the tail moves away)
  if (state.snake.some((p) => p.x === newHead.x && p.y === newHead.y)) {
    return { ...state, direction, status: "over" };
  }

  const ateFood = newHead.x === state.food.x && newHead.y === state.food.y;

  // When eating, keep the tail (snake grows); otherwise drop it
  const newSnake: Point[] = [newHead, ...state.snake.slice(0, ateFood ? undefined : -1)];

  return {
    ...state,
    snake: newSnake,
    food: ateFood ? randomFood(newSnake) : state.food,
    direction,
    score: ateFood ? state.score + 10 : state.score,
    status: "playing",
  };
}
