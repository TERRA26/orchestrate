import { describe, expect, it } from "vitest";
import { fibonacci } from "./fibonacci";

describe("fibonacci", () => {
  it("returns 0 for fibonacci(0)", () => {
    expect(fibonacci(0)).toBe(0);
  });

  it("returns 1 for fibonacci(1)", () => {
    expect(fibonacci(1)).toBe(1);
  });

  it("returns 1 for fibonacci(2)", () => {
    expect(fibonacci(2)).toBe(1);
  });

  it("returns 55 for fibonacci(10)", () => {
    expect(fibonacci(10)).toBe(55);
  });

  it("returns 6765 for fibonacci(20)", () => {
    expect(fibonacci(20)).toBe(6765);
  });

  it("throws a RangeError for negative inputs", () => {
    expect(() => fibonacci(-1)).toThrow(RangeError);
    expect(() => fibonacci(-1)).toThrow("n must be a non-negative integer");
  });
});
