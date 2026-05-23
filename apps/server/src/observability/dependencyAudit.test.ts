import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Pin the security baseline:
 *  - .github/dependabot.yml exists and watches npm + github-actions weekly.
 *  - .github/workflows/ci.yml runs `bun audit --audit-level=high` on PRs.
 *
 * Why these are paired: Dependabot surfaces upstream advisories as PRs
 * on a weekly cadence; the CI audit step closes the same-day window for
 * critical vulns landing between scans. Removing either silently regresses
 * the security posture, so this test guards both. [ORC-093]
 *
 * @see ORC-093
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const DEPENDABOT_PATH = path.join(REPO_ROOT, ".github", "dependabot.yml");
const CI_YAML_PATH = path.join(REPO_ROOT, ".github", "workflows", "ci.yml");

describe("dependency audit baseline (ORC-093)", () => {
  describe("dependabot.yml", () => {
    it("exists at .github/dependabot.yml", () => {
      expect(existsSync(DEPENDABOT_PATH)).toBe(true);
    });

    it("declares schema version 2", () => {
      const yaml = readFileSync(DEPENDABOT_PATH, "utf8");
      expect(yaml).toMatch(/^version:\s*2/m);
    });

    it("watches the npm ecosystem on a weekly cadence", () => {
      const yaml = readFileSync(DEPENDABOT_PATH, "utf8");
      expect(yaml).toContain('package-ecosystem: "npm"');
      // Find the npm block (terminates at the next package-ecosystem or
      // end-of-file). JavaScript regex has no \Z; use $ in single-line
      // capture by absorbing remainder to either next package-ecosystem
      // or end-of-string with [\s\S]*.
      const npmBlockMatch = yaml.match(
        /package-ecosystem:\s*"npm"[\s\S]*?(?=\n {2}- package-ecosystem:|$)/,
      );
      expect(npmBlockMatch).not.toBeNull();
      expect(npmBlockMatch?.[0]).toMatch(/interval:\s*"weekly"/);
    });

    it("watches the github-actions ecosystem on a weekly cadence", () => {
      const yaml = readFileSync(DEPENDABOT_PATH, "utf8");
      expect(yaml).toContain('package-ecosystem: "github-actions"');
      const ghActionsBlockMatch = yaml.match(
        /package-ecosystem:\s*"github-actions"[\s\S]*?(?=\n {2}- package-ecosystem:|$)/,
      );
      expect(ghActionsBlockMatch).not.toBeNull();
      expect(ghActionsBlockMatch?.[0]).toMatch(/interval:\s*"weekly"/);
    });
  });

  describe("ci.yml dependency audit step", () => {
    it("includes a 'Dependency audit' step", () => {
      const yaml = readFileSync(CI_YAML_PATH, "utf8");
      expect(yaml).toContain("- name: Dependency audit");
    });

    it("runs `bun audit` with at least the high audit level", () => {
      const yaml = readFileSync(CI_YAML_PATH, "utf8");
      expect(yaml).toMatch(/- name: Dependency audit[\s\S]{0,200}run:\s*bun audit\s+--audit-level=(high|critical)/);
    });

    it("places the audit step before any test/build steps in the quality job", () => {
      const yaml = readFileSync(CI_YAML_PATH, "utf8");
      const installIndex = yaml.indexOf("- name: Install dependencies\n");
      const auditIndex = yaml.indexOf("- name: Dependency audit");
      const lintIndex = yaml.indexOf("- name: Lint\n");
      expect(installIndex).toBeGreaterThan(0);
      expect(auditIndex).toBeGreaterThan(installIndex);
      expect(auditIndex).toBeLessThan(lintIndex);
    });
  });
});
