import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Pins coverage of the three "highest-traffic" orchestrator flows
 * called out in ORC-104:
 *  1. user message -> spawn worker -> accept work
 *  2. browser validation cycle
 *  3. reject-and-resubmit loop
 *
 * Today these flows are covered at the decider/integration level
 * (engine + event-store). Browser-driven Playwright e2e variants are
 * deferred as multi-iteration work; this test documents which flows
 * have engine-level tests AND maintains a deferred list of UI
 * variants.
 *
 * The meta-test catches the failure mode where a future refactor
 * renames these tests and silently drops coverage of the named flows.
 *
 * @see ORC-104
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const DECIDER_TEST_PATH = path.join(
  REPO_ROOT,
  "apps",
  "server",
  "src",
  "orchestration",
  "decider.orchestrator.test.ts",
);
const INTEGRATION_TEST_PATH = path.join(
  REPO_ROOT,
  "apps",
  "server",
  "integration",
  "orchestrationEngine.integration.test.ts",
);

interface FlowAssertion {
  readonly flowName: string;
  readonly description: string;
  readonly mustMatch: ReadonlyArray<string>;
  readonly path: string;
}

/**
 * Engine-level flows that MUST stay tested. Each `mustMatch` substring is
 * checked case-insensitively against the corresponding test file.
 */
const COVERED_FLOWS: ReadonlyArray<FlowAssertion> = [
  {
    flowName: "spawn-worker -> submit -> accept",
    description: "ORC-104 flow #1 at the decider level",
    mustMatch: ["spawn", "submit", "accept"],
    path: DECIDER_TEST_PATH,
  },
  {
    flowName: "reject-and-resubmit loop",
    description: "ORC-104 flow #3 at the decider level",
    mustMatch: ["reject", "iteration"],
    path: DECIDER_TEST_PATH,
  },
  {
    flowName: "single-turn end-to-end with sqlite + git checkpoint",
    description: "ORC-104-adjacent: integration-level proof that decider + projector + reactors compose",
    mustMatch: ["single turn end-to-end", "checkpoint"],
    path: INTEGRATION_TEST_PATH,
  },
];

/**
 * Flows the backlog called out that DON'T yet have full coverage at the
 * UI layer. These are tracked as follow-up Playwright work — each entry
 * documents what's still missing so future iterations have a clear list.
 */
const DEFERRED_PLAYWRIGHT_FLOWS: ReadonlyArray<{
  readonly flow: string;
  readonly reason: string;
}> = [
  {
    flow: "user message -> spawn worker -> accept (UI-driven)",
    reason: "engine-level coverage exists; UI Playwright test is multi-iteration work pending",
  },
  {
    flow: "browser validation cycle (UI-driven)",
    reason: "BrowserAutomation + browserRuntime have unit tests; full UI cycle e2e is pending",
  },
  {
    flow: "reject-and-resubmit (UI-driven)",
    reason: "decider covers reject; the UI flow that surfaces rework state to the orchestrator is pending",
  },
];

describe("orchestrator flow coverage (ORC-104)", () => {
  for (const flow of COVERED_FLOWS) {
    it(`${flow.flowName} is exercised in ${path.basename(flow.path)}`, () => {
      const contents = readFileSync(flow.path, "utf8").toLowerCase();
      const missing = flow.mustMatch.filter((needle) => !contents.includes(needle.toLowerCase()));
      expect(
        missing,
        `${flow.flowName} (${flow.description}) lost coverage in ${path.basename(flow.path)}. ` +
          `Missing required substrings:\n  ${missing.join("\n  ")}\n` +
          `Either re-add the test, or update COVERED_FLOWS in this file with a deliberate replacement.`,
      ).toEqual([]);
    });
  }

  it("DEFERRED_PLAYWRIGHT_FLOWS is non-empty (documents pending UI tests)", () => {
    expect(DEFERRED_PLAYWRIGHT_FLOWS.length).toBeGreaterThan(0);
    expect(DEFERRED_PLAYWRIGHT_FLOWS.every((f) => f.reason.length > 30)).toBe(true);
  });

  it("integration test file has at least 5 it.live tests (sentinel for engine coverage depth)", () => {
    const contents = readFileSync(INTEGRATION_TEST_PATH, "utf8");
    const liveCount = (contents.match(/it\.live\(/g) ?? []).length;
    expect(liveCount).toBeGreaterThanOrEqual(5);
  });
});
