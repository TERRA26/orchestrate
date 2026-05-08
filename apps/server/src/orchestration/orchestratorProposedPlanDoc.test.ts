import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Pins the "Proposed Plans" section in ORCHESTRATOR.md added by ORC-138.
 *
 * The decider event `thread.proposed-plan-upserted` existed without
 * any documentation telling the orchestrator when to upsert, what
 * fields a plan needs, whether to wait for user approval, or how the
 * plan -> run -> spawn chain composes. This test guards the doc so a
 * future edit cannot silently regress the orchestrator's prompt.
 *
 * @see ORC-138
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const DOC_PATH = path.join(REPO_ROOT, "docs", "ORCHESTRATOR.md");

describe("ORCHESTRATOR.md Proposed Plans section (ORC-138)", () => {
  const doc = readFileSync(DOC_PATH, "utf8");

  it("contains a top-level Proposed Plans section heading", () => {
    expect(doc).toMatch(/^## Proposed Plans/m);
  });

  it("references the decider event by name", () => {
    expect(doc).toContain("thread.proposed-plan-upserted");
    expect(doc).toContain("thread.proposed-plan.upsert");
  });

  it("documents WHEN to upsert (decompose route, pre-spawn, no standing approval)", () => {
    expect(doc.toLowerCase()).toContain("decompose");
    expect(doc.toLowerCase()).toContain("before spawning");
    expect(doc.toLowerCase()).toContain("standing approval");
  });

  it("documents the required plan fields (planId, title, summary, taskOutline, acceptanceCriteria)", () => {
    for (const field of ["planId", "title", "summary", "taskOutline", "acceptanceCriteria"]) {
      expect(doc).toContain(field);
    }
  });

  it("explains the user-approval expectation", () => {
    expect(doc.toLowerCase()).toContain("user approval");
    expect(doc.toLowerCase()).toContain("wait for");
  });

  it("documents the revision / immutability rule once spawning begins", () => {
    expect(doc.toLowerCase()).toContain("revise");
    expect(doc.toLowerCase()).toMatch(/immutab|revision/);
  });

  it("describes the plan -> run -> spawn chain", () => {
    expect(doc).toContain("orchestrator.run.create");
    expect(doc).toContain("orchestrator.worker.spawn");
    expect(doc).toContain("sourceProposedPlan");
  });

  it("references the dependsOn satisfaction gate (ORC-126) so the chain story is consistent", () => {
    expect(doc).toContain("ORC-126");
  });
});
