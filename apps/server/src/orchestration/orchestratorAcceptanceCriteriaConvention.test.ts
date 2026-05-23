import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Pins the acceptance-criteria tagging convention introduced by ORC-137.
 *
 * The orchestrator's system prompt (docs/ORCHESTRATOR.md) defines a
 * three-tag dichotomy for acceptance criteria entries:
 *  - `test:` worker-owned (must surface result in REPORT.testsRun)
 *  - `screenshot:` orchestrator-owned via browser validation
 *  - `manual:` orchestrator-owned via prose review
 *
 * If a future contributor edits ORCHESTRATOR.md and drops one of these
 * tags from the doc, the orchestrator's prompt will silently lose the
 * convention. This test guards the wording so a deliberate rename
 * trips a clear failure rather than a silent drift.
 *
 * @see ORC-137
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const DOC_PATH = path.join(REPO_ROOT, "docs", "ORCHESTRATOR.md");

describe("ORCHESTRATOR.md acceptance-criteria convention (ORC-137)", () => {
  const doc = readFileSync(DOC_PATH, "utf8");

  it("documents the testable-vs-observational dichotomy", () => {
    expect(doc).toMatch(/Acceptance criteria:\s*testable vs observational/i);
  });

  it("documents the `test:` tag with worker ownership and testsRun mention", () => {
    expect(doc).toContain("`test:`");
    expect(doc.toLowerCase()).toContain("worker");
    expect(doc).toContain("testsRun");
  });

  it("documents the `screenshot:` tag for orchestrator-owned browser validation", () => {
    expect(doc).toContain("`screenshot:`");
    expect(doc.toLowerCase()).toContain("browser");
    // The doc should mention the orchestrator browser tool by name.
    expect(doc).toMatch(/orchestrate_browser_open_session/);
  });

  it("documents the `manual:` tag for orchestrator-owned prose review", () => {
    expect(doc).toContain("`manual:`");
    expect(doc.toLowerCase()).toContain("prose review");
  });

  it("provides a concrete example of each tag in the Good criteria section", () => {
    // Good acceptance criteria block should show test:/screenshot:/manual: examples.
    const goodBlock = doc.match(/Good acceptance criteria:[\s\S]+?(?:\n\n|## )/);
    expect(goodBlock).not.toBeNull();
    if (goodBlock) {
      expect(goodBlock[0]).toMatch(/test:/);
      expect(goodBlock[0]).toMatch(/screenshot:/);
      expect(goodBlock[0]).toMatch(/manual:/);
    }
  });

  it("documents how untagged legacy criteria are treated", () => {
    // Treating untagged as `manual:` keeps back-compat for older runs.
    expect(doc.toLowerCase()).toMatch(/untagged|legacy/);
    expect(doc.toLowerCase()).toContain("manual");
  });
});
