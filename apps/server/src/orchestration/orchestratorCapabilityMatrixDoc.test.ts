import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Pins the "Capability Matrix" + "Check-before-spawn rule" added by
 * ORC-143. Before this fix, ORCHESTRATOR.md only listed a "preferred
 * model by task type" table and gave no heuristics for matching task
 * requirements (vision, browser tools, large context) to provider
 * capabilities, and no rule for what to do when no available worker
 * has the required capability. The orchestrator either guessed or
 * silently spawned a no-fit worker.
 *
 * @see ORC-143
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const DOC_PATH = path.join(REPO_ROOT, "docs", "ORCHESTRATOR.md");

describe("ORCHESTRATOR.md Capability Matrix (ORC-143)", () => {
  const doc = readFileSync(DOC_PATH, "utf8");

  it("contains a Capability Matrix subsection heading", () => {
    expect(doc).toMatch(/### Capability Matrix/);
  });

  it("lists the four current model rows in the matrix", () => {
    for (const model of ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5", "gpt-5-codex"]) {
      expect(doc).toContain(model);
    }
  });

  it("documents the canonical capability columns", () => {
    for (const cap of [
      "Vision / screenshots",
      "Browser validation tools",
      "Large context",
      "Native repo navigation",
      "Fast / cost-efficient",
    ]) {
      expect(doc).toContain(cap);
    }
  });

  it("contains a Check-before-spawn rule subsection", () => {
    expect(doc).toMatch(/### Check-before-spawn rule/);
  });

  it("references the screenshot:, evidenceRequired, and browser inputs to the gate", () => {
    expect(doc).toContain("screenshot:");
    expect(doc).toContain("evidenceRequired");
    expect(doc.toLowerCase()).toContain("browser validation");
  });

  it("specifies the empty-candidate-set escalation (do NOT spawn, surface to user)", () => {
    expect(doc.toLowerCase()).toContain("do not spawn");
    expect(doc.toLowerCase()).toContain("recommendation");
    expect(doc.toLowerCase()).toMatch(/wait for explicit user direction|surface .* to the user/);
  });

  it("specifies the tie-break rule (cheapest capable wins)", () => {
    expect(doc.toLowerCase()).toMatch(/cheapest|cost-efficient column wins ties/);
  });
});
