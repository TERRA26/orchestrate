// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { formatDocumentTitle } from "./useDocumentTitle";

/**
 * Pins the title formatter introduced by ORC-248.
 *
 * @see ORC-248
 */

describe("formatDocumentTitle (ORC-248)", () => {
  it("joins parts with hyphen-space-hyphen separator", () => {
    expect(formatDocumentTitle(["Thread", "Project", "Orchestrate"])).toBe(
      "Thread - Project - Orchestrate",
    );
  });

  it("filters out null and undefined parts", () => {
    expect(formatDocumentTitle([null, "Thread", undefined, "Project"])).toBe(
      "Thread - Project",
    );
  });

  it("filters out empty and whitespace-only parts", () => {
    expect(formatDocumentTitle(["", "  ", "Thread"])).toBe("Thread");
  });

  it("trims whitespace from each part before joining", () => {
    expect(formatDocumentTitle(["  Thread  ", " Project "])).toBe("Thread - Project");
  });

  it("returns empty string when all parts are absent or whitespace", () => {
    expect(formatDocumentTitle([null, undefined, "  "])).toBe("");
    expect(formatDocumentTitle([])).toBe("");
  });

  it("preserves Unicode characters", () => {
    expect(formatDocumentTitle(["Café résumé", "プロジェクト"])).toBe(
      "Café résumé - プロジェクト",
    );
  });

  it("does not produce a leading or trailing separator when one part is absent", () => {
    expect(formatDocumentTitle([null, "Just one"])).toBe("Just one");
    expect(formatDocumentTitle(["Just one", null])).toBe("Just one");
  });

  it("does not produce a doubled separator when a middle part is absent", () => {
    expect(formatDocumentTitle(["A", null, "C"])).toBe("A - C");
  });
});
