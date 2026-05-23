export type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type GameStatus = "idle" | "playing" | "paused" | "over";

export interface GameState {
  readonly snake: readonly Point[];
  readonly food: Point;
  readonly direction: Direction;
  /** The queued direction to apply on the next tick. Validated against `direction` when stored. */
  readonly nextDirection: Direction;
  readonly score: number;
  readonly status: GameStatus;
}
