import { describe, expect, it } from "vitest";
import { generateRandomHexColor } from "./color";

describe("generateRandomHexColor", () => {
  it("returns a string matching /^#[0-9a-f]{6}$/i", () => {
    const color = generateRandomHexColor();
    expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("produces at least 2 distinct values across 10 calls", () => {
    const results = Array.from({ length: 10 }, () => generateRandomHexColor());
    const distinct = new Set(results);
    expect(distinct.size).toBeGreaterThanOrEqual(2);
  });
});
