import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Pins the CI workflow's coverage of build targets and triggers.
 *
 * ORC-266 found two gaps in `.github/workflows/ci.yml`:
 *   1) the marketing app's build was only exercised in release.yml,
 *      so a change that broke `bun run build:marketing` (Astro
 *      config, MDX content, theme tokens) only surfaced at tag time;
 *   2) there was no manual `workflow_dispatch` trigger, so an
 *      operator had to push a branch or open a PR to run the
 *      pipeline against a known-risky checkpoint.
 *
 * This test fails if either gap regresses.
 *
 * @see ORC-266
 */

const CI_YAML_PATH = path.resolve(__dirname, "..", "..", "..", "..", ".github", "workflows", "ci.yml");

function readCiYaml(): string {
  return readFileSync(CI_YAML_PATH, "utf8");
}

describe("ci.yml coverage (ORC-266)", () => {
  it("invokes the marketing build", () => {
    const ci = readCiYaml();
    // The marketing app must be exercised by the CI build pipeline
    // so a regression in Astro config, MDX content, or asset
    // pipeline is caught at PR time, not at release tagging.
    expect(ci).toMatch(/bun run build:marketing|--filter=@orchestrate\/marketing/);
  });

  it("declares a workflow_dispatch trigger", () => {
    const ci = readCiYaml();
    // A manual trigger lets an operator run the pipeline against a
    // known-risky branch checkpoint without forcing a PR or push.
    expect(ci).toMatch(/^on:[\s\S]*?workflow_dispatch:/m);
  });
});
