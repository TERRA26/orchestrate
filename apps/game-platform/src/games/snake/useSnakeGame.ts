import { useCallback, useEffect, useReducer, useState } from "react";
import { TICK_MS, createInitialState, resolveDirection, tick } from "./logic";
import type { Direction, GameState } from "./types";

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

type Action =
  | { type: "START" }
  | { type: "RESTART" }
  | { type: "TICK" }
  | { type: "DIRECTION"; dir: Direction }
  | { type: "PAUSE_TOGGLE" };

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "START":
      return { ...createInitialState(), status: "playing" };

    case "RESTART":
      return { ...createInitialState(), status: "playing" };

    case "TICK":
      return tick(state);

    case "DIRECTION": {
      if (state.status !== "playing") return state;
      // Validate against the committed direction so we never accept a reversal
      const nextDirection = resolveDirection(state.direction, action.dir);
      return { ...state, nextDirection };
    }

    case "PAUSE_TOGGLE":
      if (state.status === "playing") return { ...state, status: "paused" };
      if (state.status === "paused") return { ...state, status: "playing" };
      return state;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface SnakeGameApi {
  state: GameState;
  bestScore: number;
  start: () => void;
  restart: () => void;
}

export function useSnakeGame(): SnakeGameApi {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);

  const [bestScore, setBestScore] = useState<number>(() => {
    const stored = localStorage.getItem("arcade:snake:best");
    return stored !== null ? Number(stored) : 0;
  });

  // ----- Game loop ----------------------------------------------------------
  useEffect(() => {
    if (state.status !== "playing") return;
    const id = setInterval(() => dispatch({ type: "TICK" }), TICK_MS);
    return () => clearInterval(id);
  }, [state.status]);

  // ----- Best score persistence ---------------------------------------------
  useEffect(() => {
    if (state.score > bestScore) {
      setBestScore(state.score);
      localStorage.setItem("arcade:snake:best", String(state.score));
    }
  }, [state.score, bestScore]);

  // ----- Keyboard input -----------------------------------------------------
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
          e.preventDefault();
          dispatch({ type: "DIRECTION", dir: "UP" });
          break;
        case "ArrowDown":
        case "s":
        case "S":
          e.preventDefault();
          dispatch({ type: "DIRECTION", dir: "DOWN" });
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          e.preventDefault();
          dispatch({ type: "DIRECTION", dir: "LEFT" });
          break;
        case "ArrowRight":
        case "d":
        case "D":
          e.preventDefault();
          dispatch({ type: "DIRECTION", dir: "RIGHT" });
          break;
        case " ":
          e.preventDefault();
          dispatch({ type: "PAUSE_TOGGLE" });
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return {
    state,
    bestScore,
    start: useCallback(() => dispatch({ type: "START" }), []),
    restart: useCallback(() => dispatch({ type: "RESTART" }), []),
  };
}
