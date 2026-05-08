import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Pins the "Mid-execution amendments" section added by ORC-282.
 *
 * Before this section, ORCHESTRATOR.md said nothing about how to
 * react when the user adds, removes, or modifies a task while
 * earlier tasks are already running. Orchestrators either waited
 * for the in-flight task to finish (slow) or terminated and
 * re-planned (wasteful, lost work). The section documents the
 * decision matrix: when a hot amendment is safe, how to insert or
 * remove tasks without thrashing the existing dependency graph,
 * and the fallback when amendments are incompatible.
 *
 * @see ORC-282
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const DOC_PATH = path.join(REPO_ROOT, "docs", "ORCHESTRATOR.md");

function extractAmendmentSection(doc: string): string {
  const start = doc.search(/##\s*Mid-execution Amendments/);
  if (start < 0) return "";
  const rest = doc.slice(start);
  const next = rest.search(/\n## (?!Mid-execution)/);
  return next < 0 ? rest : rest.slice(0, next);
}

describe("ORCHESTRATOR.md Mid-execution Amendments section (ORC-282)", () => {
  const doc = readFileSync(DOC_PATH, "utf8");
  const section = extractAmendmentSection(doc);

  it("contains a top-level Mid-execution Amendments section", () => {
    expect(doc).toMatch(/##\s*Mid-execution Amendments/);
  });

  it("names the three amendment scenarios (insert, remove, modify)", () => {
    expect(section.toLowerCase()).toContain("insert");
    expect(section.toLowerCase()).toContain("remove");
    expect(section.toLowerCase()).toContain("modify");
  });

  it("describes when an amendment is SAFE without re-planning", () => {
    // Safe-amendment criteria: the in-flight task hasn't started, has
    // no dependents, or the change is purely additive.
    expect(section.toLowerCase()).toContain("safe");
    expect(section).toMatch(/before.*starts|hasn't started|not yet assigned|hasn't begun/i);
  });

  it("describes when an amendment requires a CANCEL + re-plan", () => {
    // Hard-incompatible cases: the in-flight worker has already
    // committed code in the writeScope of a removed task, or the
    // amendment redefines a write scope mid-flight.
    expect(section.toLowerCase()).toMatch(/cancel|abort|terminate|re-plan|restart/);
  });

  it("describes the dependency-graph implications of a hot insert", () => {
    expect(section.toLowerCase()).toContain("dependsonchain");
  });

  it("commits the orchestrator to surface the user's amendment intent before acting", () => {
    // The orchestrator must echo the amendment back to the user so
    // they can correct a misread before workers are disturbed.
    expect(section).toMatch(/confirm|echo|surface|acknowledge/i);
  });

  it("mentions the orchestrator-side tool surface (cancel / spawn / send_to_agent)", () => {
    // We do not (yet) ship orchestrate_amend_plan; document how to
    // compose existing primitives instead so a present-day
    // orchestrator has an actionable playbook.
    expect(section).toMatch(/orchestrate_(cancel|terminate|spawn|send_to_agent|create_task)/);
  });

  it("documents the order of operations (block dependents -> cancel running -> spawn new)", () => {
    expect(section).toMatch(/block.*dependents|block.*depends|cascade.*block/i);
  });
});
