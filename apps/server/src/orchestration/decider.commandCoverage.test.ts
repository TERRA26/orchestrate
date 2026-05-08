import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Coverage-floor regression test for the orchestration decider.
 *
 * Walks every `case "command.type":` branch in decider.ts and asserts
 * each command type is mentioned by at least one test file (a `type:
 * "command.type"` literal). Catches the failure mode where a new
 * command branch lands without a test and silently joins the untested
 * set.
 *
 * Commands that are intentionally not yet covered live in
 * `KNOWN_UNTESTED` with a one-line rationale. Adding a real test for a
 * KNOWN_UNTESTED entry should remove it; the meta-test enforces
 * "every command is either tested OR explicitly listed."
 *
 * @see ORC-100
 */

const ORCHESTRATION_DIR = __dirname;
const DECIDER_PATH = path.join(ORCHESTRATION_DIR, "decider.ts");

/**
 * Commands known to lack a real test, with the reason. Each entry should
 * be removed when a corresponding test is added in any of the
 * `decider.*.test.ts` or `*.orchestrator.test.ts` files.
 *
 * Surfaced from ORC-100. The Ralph Loop should treat this list as a
 * backlog of follow-up tickets to chip away over time.
 */
const KNOWN_UNTESTED: ReadonlyArray<{ readonly type: string; readonly reason: string }> = [
  { type: "project.delete", reason: "no test for soft-delete + cascade-archive of dependent threads" },
  { type: "thread.handoff.create", reason: "follow-up: handoff between provider sessions" },
  { type: "thread.fork.create", reason: "follow-up: fork creates a child thread sharing parent state" },
  { type: "thread.turn.dispatch-queued", reason: "follow-up: queued-turn dispatch path" },
  { type: "thread.message.assistant.delta", reason: "follow-up: streaming delta append" },
  { type: "thread.message.assistant.complete", reason: "follow-up: streaming completion finalize" },
  { type: "thread.proposed-plan.upsert", reason: "follow-up: plan-mode plan editing" },
  { type: "thread.revert.complete", reason: "follow-up: revert finalize" },
  { type: "orchestrator.run.fail", reason: "follow-up: add test mirroring run.cancel pattern" },
  { type: "orchestrator.task.block", reason: "follow-up: needs explicit blockedReason payload coverage" },
  { type: "orchestrator.task.cancel", reason: "follow-up: same shape as task.fail; add together" },
  { type: "orchestrator.task.fail", reason: "follow-up: same shape as task.cancel; add together" },
  { type: "orchestrator.worker.pause", reason: "follow-up: pause/resume pair, test both at once" },
  { type: "orchestrator.worker.resume", reason: "follow-up: paired with pause" },
  { type: "orchestrator.worker.update-post", reason: "follow-up: send_update_to_orchestrator MCP path" },
  { type: "orchestrator.message.send", reason: "follow-up: orchestrator-to-worker message" },
  { type: "orchestrator.message.broadcast", reason: "follow-up: orchestrator-to-all-workers fanout" },
  { type: "orchestrator.context.transfer", reason: "follow-up: handoff-context transfer between threads" },
  { type: "orchestrator.dependency.set", reason: "follow-up: cross-task dependency declaration" },
  { type: "orchestrator.work.merge-request", reason: "follow-up: PR-style merge request between workers" },
  { type: "orchestrator.decision.record", reason: "follow-up: orchestrator decision log entry" },
  { type: "orchestrator.evidence.capture", reason: "follow-up: evidence ingest from worker output" },
  { type: "orchestrator.checklist.update", reason: "follow-up: requirement-checklist mutation" },
];

function extractCommandCases(source: string): string[] {
  const out: string[] = [];
  const pattern = /case\s+"([^"]+)":/g;
  for (const match of source.matchAll(pattern)) {
    if (match[1]) out.push(match[1]);
  }
  return out;
}

function listTestSourceFiles(): string[] {
  // Search all of apps/server/src for test files. Thread commands often
  // get tested through wsServer.* or persistence.* surfaces, so scoping
  // to orchestration/ alone misses real coverage.
  const SERVER_SRC = path.resolve(ORCHESTRATION_DIR, "..");
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        walk(path.join(dir, entry.name));
        continue;
      }
      const name = entry.name;
      if (!entry.isFile()) continue;
      if (name.includes("commandCoverage")) continue;
      if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) {
        files.push(path.join(dir, name));
      }
    }
  };
  walk(SERVER_SRC);
  return files;
}

function extractTestedCommandTypes(): Set<string> {
  const out = new Set<string>();
  const pattern = /type:\s*"((?:project|thread|orchestrator)\.[^"]+)"/g;
  for (const file of listTestSourceFiles()) {
    const contents = readFileSync(file, "utf8");
    for (const match of contents.matchAll(pattern)) {
      if (match[1]) out.add(match[1]);
    }
  }
  return out;
}

describe("decider command coverage (ORC-100)", () => {
  const decider = readFileSync(DECIDER_PATH, "utf8");
  const allCases = extractCommandCases(decider);
  const testedTypes = extractTestedCommandTypes();
  const knownUntested = new Set(KNOWN_UNTESTED.map((k) => k.type));

  it("decider.ts has the expected number of command branches (sentinel)", () => {
    expect(allCases.length).toBeGreaterThanOrEqual(50);
  });

  it("every command branch is either tested or explicitly listed in KNOWN_UNTESTED", () => {
    const offenders = allCases.filter((c) => !testedTypes.has(c) && !knownUntested.has(c));
    expect(
      offenders,
      `Untested decider command branch(es) without an explicit KNOWN_UNTESTED entry:\n` +
        offenders.map((c) => `  ${c}`).join("\n") +
        `\n\nFix by adding a real test in decider.orchestrator.test.ts (or similar)\n` +
        `OR by adding the command to the KNOWN_UNTESTED list with a reason.`,
    ).toEqual([]);
  });

  it("KNOWN_UNTESTED entries actually exist as decider command branches", () => {
    // If a KNOWN_UNTESTED entry references a command that doesn't exist
    // in decider.ts, the entry is stale and should be removed. Otherwise
    // the allowlist could mask a typo.
    const stale = KNOWN_UNTESTED.filter((k) => !allCases.includes(k.type));
    expect(
      stale,
      `KNOWN_UNTESTED entries that no longer exist in decider.ts:\n` +
        stale.map((s) => `  ${s.type}: ${s.reason}`).join("\n"),
    ).toEqual([]);
  });

  it("KNOWN_UNTESTED entries are not also in the tested set (move from list to tested when test lands)", () => {
    const overlap = KNOWN_UNTESTED.filter((k) => testedTypes.has(k.type));
    expect(
      overlap,
      `These commands have a test AND are still in KNOWN_UNTESTED. Remove the entry:\n` +
        overlap.map((s) => `  ${s.type}`).join("\n"),
    ).toEqual([]);
  });

  it("KNOWN_UNTESTED is not silently growing past 25 entries", () => {
    // Soft cap: forces a deliberate decision when the untested backlog
    // grows. If 21 entries from ORC-100 are still pending plus a few
    // others, this leaves headroom but flags creep.
    expect(KNOWN_UNTESTED.length).toBeLessThanOrEqual(25);
  });
});
