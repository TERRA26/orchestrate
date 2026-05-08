import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Pins the "Granularity: one task vs many" subsection added by
 * ORC-146. Before the fix, ORCHESTRATOR.md listed signals to
 * decompose but gave no rule for "how many tasks?". Orchestrators
 * defaulted to either over-decomposition (7 micro-tasks on the same
 * file) or under-decomposition (one mega-task that stalls on its
 * broadest segment).
 *
 * @see ORC-146
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const DOC_PATH = path.join(REPO_ROOT, "docs", "ORCHESTRATOR.md");

function extractGranularitySection(doc: string): string {
  const start = doc.search(/### Granularity:\s*one task vs many/);
  if (start < 0) return "";
  const rest = doc.slice(start);
  const next = rest.search(/\n## /);
  return next < 0 ? rest : rest.slice(0, next);
}

describe("ORCHESTRATOR.md Granularity subsection (ORC-146)", () => {
  const doc = readFileSync(DOC_PATH, "utf8");
  const section = extractGranularitySection(doc);

  it("contains a Granularity subsection heading", () => {
    expect(doc).toMatch(/### Granularity:\s*one task vs many/);
  });

  it("names both failure modes (over- and under-decomposition)", () => {
    expect(doc.toLowerCase()).toContain("over-decomposition");
    expect(doc.toLowerCase()).toContain("under-decomposition");
  });

  it("documents the three split-justification criteria (Parallelizable, Different capabilities, User mid-approval)", () => {
    expect(doc).toMatch(/\*\*Parallelizable\*\*/);
    expect(doc).toMatch(/\*\*Different capabilities\*\*/);
    expect(doc).toMatch(/\*\*User mid-approval\*\*/);
  });

  it("instructs the orchestrator to default to the smallest number of tasks", () => {
    expect(doc.toLowerCase()).toContain("smallest number of tasks");
  });

  it("provides a worked example for each correct-split case and one over-decomposition counter-example", () => {
    expect(doc).toMatch(/Worked examples/i);
    expect(doc).toMatch(/One task, correct/);
    expect(doc).toMatch(/Three tasks, correct \(parallelizable\)/);
    expect(doc).toMatch(/Two tasks, correct \(different capabilities\)/);
    expect(doc).toMatch(/Two tasks, correct \(user mid-approval\)/);
    expect(doc).toMatch(/over-decomposition/);
  });

  it("references the Capability Matrix so the granularity rule composes with the spawn-fit rule", () => {
    expect(section).toContain("Capability Matrix");
  });

  it("references writeScope and dependsOn when describing parallelizable splits", () => {
    expect(section).toContain("writeScope");
    expect(section).toContain("dependsOn");
  });
});
