import { describe, expect, it, vi } from "vitest";

import { LruMap } from "./LruMap";

describe("LruMap (ORC-049)", () => {
  it("stores and retrieves values up to maxSize", () => {
    const map = new LruMap<string, number>({ maxSize: 3 });
    map.set("a", 1).set("b", 2).set("c", 3);
    expect(map.size).toBe(3);
    expect(map.get("a")).toBe(1);
    expect(map.get("b")).toBe(2);
    expect(map.get("c")).toBe(3);
  });

  it("evicts the least recently used entry when size exceeds maxSize", () => {
    const map = new LruMap<string, number>({ maxSize: 2 });
    map.set("a", 1);
    map.set("b", 2);
    map.set("c", 3);
    expect(map.has("a")).toBe(false);
    expect(map.has("b")).toBe(true);
    expect(map.has("c")).toBe(true);
    expect(map.size).toBe(2);
  });

  it("get() updates recency so the touched key is no longer the eviction target", () => {
    const map = new LruMap<string, number>({ maxSize: 2 });
    map.set("a", 1);
    map.set("b", 2);
    // Touch 'a' so it becomes most recent; 'b' is now LRU.
    expect(map.get("a")).toBe(1);
    map.set("c", 3);
    expect(map.has("a")).toBe(true);
    expect(map.has("b")).toBe(false);
    expect(map.has("c")).toBe(true);
  });

  it("set() of an existing key updates recency without growing size", () => {
    const map = new LruMap<string, number>({ maxSize: 2 });
    map.set("a", 1);
    map.set("b", 2);
    map.set("a", 99);
    expect(map.size).toBe(2);
    expect(map.get("a")).toBe(99);
    map.set("c", 3);
    // 'b' was the LRU after replacing 'a', so it gets evicted.
    expect(map.has("b")).toBe(false);
    expect(map.has("a")).toBe(true);
    expect(map.has("c")).toBe(true);
  });

  it("calls onEvict for size-driven eviction but not for explicit delete or clear", () => {
    const onEvict = vi.fn();
    const map = new LruMap<string, number>({ maxSize: 2, onEvict });
    map.set("a", 1);
    map.set("b", 2);
    map.set("c", 3);
    expect(onEvict).toHaveBeenCalledTimes(1);
    expect(onEvict).toHaveBeenCalledWith("a", 1);

    onEvict.mockClear();
    map.delete("b");
    expect(onEvict).not.toHaveBeenCalled();

    map.clear();
    expect(onEvict).not.toHaveBeenCalled();
    expect(map.size).toBe(0);
  });

  it("has() does not update recency", () => {
    const map = new LruMap<string, number>({ maxSize: 2 });
    map.set("a", 1);
    map.set("b", 2);
    // has() should not promote 'a'.
    expect(map.has("a")).toBe(true);
    map.set("c", 3);
    expect(map.has("a")).toBe(false);
    expect(map.has("b")).toBe(true);
    expect(map.has("c")).toBe(true);
  });

  it("clamps non-positive maxSize to 1", () => {
    const map = new LruMap<string, number>({ maxSize: 0 });
    expect(map.maxSize).toBe(1);
    map.set("a", 1);
    map.set("b", 2);
    expect(map.size).toBe(1);
    expect(map.has("a")).toBe(false);
    expect(map.has("b")).toBe(true);
  });

  it("survives an undefined value (sentinel test)", () => {
    const map = new LruMap<string, number | undefined>({ maxSize: 2 });
    map.set("a", undefined);
    // get() returns undefined either way; has() distinguishes.
    expect(map.has("a")).toBe(true);
    expect(map.get("a")).toBe(undefined);
  });

  it("returns iteration order from least-recent to most-recent", () => {
    const map = new LruMap<string, number>({ maxSize: 5 });
    map.set("a", 1).set("b", 2).set("c", 3);
    map.get("a"); // a -> most recent
    expect([...map.keys()]).toEqual(["b", "c", "a"]);
  });
});
