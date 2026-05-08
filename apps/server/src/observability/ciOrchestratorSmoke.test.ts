import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Pin the orchestrator-smoke CI step so it can't be silently dropped from
 * .github/workflows/ci.yml during a future workflow refactor.
 *
 * Why this matters: the orchestrator decider/projector/reactor pipeline
 * has integration tests that catch class-of-bug regressions the per-file
 * unit suite misses. The smoke runs in release.yml as the long e2e
 * variant, but PR-time coverage requires the same step in the main
 * quality job. ORC-092 added the step; this test guards it.
 *
 * @see ORC-092
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const CI_YAML_PATH = path.join(REPO_ROOT, ".github", "workflows", "ci.yml");

describe("CI orchestrator-smoke step (ORC-092)", () => {
  it("ci.yml has an 'Orchestrator smoke' step in the quality job", () => {
    const yaml = readFileSync(CI_YAML_PATH, "utf8");
    expect(yaml).toContain("- name: Orchestrator smoke");
  });

  it("the step runs `bun run test:orchestrator-smoke`", () => {
    const yaml = readFileSync(CI_YAML_PATH, "utf8");
    // Match the step's run command. The smoke script is defined at the
    // repo root and forwards into apps/server.
    expect(yaml).toMatch(/- name: Orchestrator smoke[\s\S]{0,200}run:\s*bun run test:orchestrator-smoke/);
  });

  it("the step lives in the quality job (after Test, before Browser test)", () => {
    const yaml = readFileSync(CI_YAML_PATH, "utf8");
    const testIndex = yaml.indexOf("- name: Test\n");
    const smokeIndex = yaml.indexOf("- name: Orchestrator smoke");
    const browserIndex = yaml.indexOf("- name: Browser test");
    expect(testIndex).toBeGreaterThan(0);
    expect(smokeIndex).toBeGreaterThan(testIndex);
    expect(browserIndex).toBeGreaterThan(smokeIndex);
  });

  it("the orchestrator smoke script exists in package.json", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["test:orchestrator-smoke"]).toBeDefined();
  });
});
