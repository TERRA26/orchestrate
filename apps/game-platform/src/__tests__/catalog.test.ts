import { describe, expect, it } from "vitest";

/** Trivial smoke test — verifies the game catalog is correctly sized. */
describe("game catalog", () => {
  const GAME_IDS = ["snake", "2048", "tic-tac-toe"] as const;

  it("has exactly three games", () => {
    expect(GAME_IDS).toHaveLength(3);
  });

  it("includes snake", () => {
    expect(GAME_IDS).toContain("snake");
  });

  it("includes 2048", () => {
    expect(GAME_IDS).toContain("2048");
  });

  it("includes tic-tac-toe", () => {
    expect(GAME_IDS).toContain("tic-tac-toe");
  });
});
