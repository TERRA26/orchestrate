import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Pins the "Clarifying Questions" section in ORCHESTRATOR.md added by
 * ORC-141. The doc previously said "ask clarifying questions before
 * decomposing ambiguous requests" with no structured loop, no
 * question shape, and no timeout policy. The orchestrator either
 * guessed or sent a free-form message. This test guards the wording
 * so a future edit cannot silently regress the convention.
 *
 * @see ORC-141
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const DOC_PATH = path.join(REPO_ROOT, "docs", "ORCHESTRATOR.md");

describe("ORCHESTRATOR.md Clarifying Questions section (ORC-141)", () => {
  const doc = readFileSync(DOC_PATH, "utf8");

  it("contains a top-level Clarifying Questions section heading", () => {
    expect(doc).toMatch(/^## Clarifying Questions/m);
  });

  it("documents WHEN to ask (decompose route, real ambiguity, no Direct control bypass, no repeat)", () => {
    expect(doc).toMatch(/### When to ask/);
    expect(doc.toLowerCase()).toContain("decompose");
    expect(doc.toLowerCase()).toContain("two or more");
    expect(doc.toLowerCase()).toContain("direct control");
  });

  it("specifies a max-questions cap (at most 3 per round)", () => {
    expect(doc).toMatch(/at most\s+3\s+questions/i);
  });

  it("specifies a max-rounds cap (at most 2 rounds before defaults)", () => {
    expect(doc).toMatch(/at most\s+2\s+rounds/i);
  });

  it("requires the needs-input status for the clarification turn", () => {
    expect(doc).toContain("needs-input");
  });

  it("documents the structured question shape (id, prompt, options, default)", () => {
    for (const field of ["id", "prompt", "options", "default"]) {
      expect(doc).toMatch(new RegExp("`" + field + "`"));
    }
  });

  it("documents a timeout / default-escalation policy", () => {
    expect(doc).toMatch(/### Timeout and escalation/);
    expect(doc.toLowerCase()).toContain("default");
    expect(doc.toLowerCase()).toMatch(/proceed to decomposition|apply the `default`/);
  });

  it("includes good and bad clarification examples", () => {
    expect(doc.toLowerCase()).toContain("bad clarification");
    expect(doc.toLowerCase()).toContain("good clarification");
  });

  it("references the future orchestrate_request_clarification tool slot", () => {
    expect(doc).toContain("orchestrate_request_clarification");
  });
});
