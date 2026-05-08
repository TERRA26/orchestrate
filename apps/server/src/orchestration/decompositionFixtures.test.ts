import { describe, expect, it } from "vitest";

import {
  DECOMPOSITION_FIXTURES,
  type ExpectedTaskCapability,
} from "./decompositionFixtures";

/**
 * Pins the structural integrity of the decomposition fixture corpus
 * introduced by ORC-148. The fixtures themselves are the contract;
 * these tests guarantee that every entry stays well-formed (resolvable
 * dependsOn, non-empty acceptance criteria, valid capability tags) so
 * a future LLM-driven harness can rely on them.
 *
 * @see ORC-148
 */

const VALID_CAPABILITIES: readonly ExpectedTaskCapability[] = [
  "any",
  "vision",
  "browser",
  "large-context",
  "native-repo-navigation",
];

const ACCEPTANCE_TAG_PREFIX = /^(test|screenshot|manual): /;

describe("decomposition fixture corpus (ORC-148)", () => {
  it("has at least one fixture for each of the four canonical patterns", () => {
    const ids = new Set(DECOMPOSITION_FIXTURES.map((f) => f.id));
    expect(ids.has("fix-001-single-task-folded")).toBe(true);
    expect(ids.has("fix-002-three-task-parallel-services")).toBe(true);
    expect(ids.has("fix-003-capability-split-vision-after-edit")).toBe(true);
    expect(ids.has("fix-004-approval-gate-design-then-run")).toBe(true);
    expect(ids.has("fix-005-anti-pattern-over-decomposed-folded")).toBe(true);
  });

  it("every fixture id is unique", () => {
    const ids = DECOMPOSITION_FIXTURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every fixture carries a non-empty userRequest, rationale, and expectedTasks", () => {
    for (const fixture of DECOMPOSITION_FIXTURES) {
      expect(fixture.userRequest.trim().length).toBeGreaterThan(0);
      expect(fixture.rationale.trim().length).toBeGreaterThan(0);
      expect(fixture.expectedTasks.length).toBeGreaterThan(0);
    }
  });

  it("every expected task has a unique id within its fixture", () => {
    for (const fixture of DECOMPOSITION_FIXTURES) {
      const ids = fixture.expectedTasks.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("every dependsOn id resolves to another task in the same fixture", () => {
    for (const fixture of DECOMPOSITION_FIXTURES) {
      const ids = new Set(fixture.expectedTasks.map((t) => t.id));
      for (const task of fixture.expectedTasks) {
        for (const dep of task.dependsOn) {
          expect(ids.has(dep)).toBe(true);
        }
      }
    }
  });

  it("dependsOn graphs are acyclic (no task depends on itself transitively)", () => {
    for (const fixture of DECOMPOSITION_FIXTURES) {
      const adj = new Map<string, readonly string[]>(
        fixture.expectedTasks.map((t) => [t.id, t.dependsOn]),
      );
      for (const root of fixture.expectedTasks.map((t) => t.id)) {
        const stack = [...(adj.get(root) ?? [])];
        const seen = new Set<string>();
        while (stack.length > 0) {
          const next = stack.pop();
          if (next === undefined) break;
          expect(next).not.toBe(root);
          if (seen.has(next)) continue;
          seen.add(next);
          stack.push(...(adj.get(next) ?? []));
        }
      }
    }
  });

  it("every acceptance criterion uses one of the ORC-137 tags", () => {
    for (const fixture of DECOMPOSITION_FIXTURES) {
      for (const task of fixture.expectedTasks) {
        expect(task.acceptanceCriteria.length).toBeGreaterThan(0);
        for (const ac of task.acceptanceCriteria) {
          expect(ac).toMatch(ACCEPTANCE_TAG_PREFIX);
        }
      }
    }
  });

  it("every requiredCapability is a valid Capability Matrix tag", () => {
    for (const fixture of DECOMPOSITION_FIXTURES) {
      for (const task of fixture.expectedTasks) {
        expect(VALID_CAPABILITIES).toContain(task.requiredCapability);
      }
    }
  });

  it("the parallel fixture has 3 tasks all with empty dependsOn (parallel-able)", () => {
    const fixture = DECOMPOSITION_FIXTURES.find(
      (f) => f.id === "fix-002-three-task-parallel-services",
    );
    expect(fixture).toBeDefined();
    if (fixture === undefined) return;
    expect(fixture.expectedTasks.length).toBe(3);
    for (const task of fixture.expectedTasks) {
      expect(task.dependsOn).toEqual([]);
    }
  });

  it("the capability-split fixture has the verify task depending on the refactor task", () => {
    const fixture = DECOMPOSITION_FIXTURES.find(
      (f) => f.id === "fix-003-capability-split-vision-after-edit",
    );
    expect(fixture).toBeDefined();
    if (fixture === undefined) return;
    const verify = fixture.expectedTasks.find((t) => t.id === "verify");
    expect(verify).toBeDefined();
    expect(verify?.dependsOn).toEqual(["refactor"]);
    expect(verify?.requiredCapability).toBe("browser");
  });

  it("the over-decomposition anti-pattern fixture folds 7 steps into 1 task", () => {
    const fixture = DECOMPOSITION_FIXTURES.find(
      (f) => f.id === "fix-005-anti-pattern-over-decomposed-folded",
    );
    expect(fixture).toBeDefined();
    if (fixture === undefined) return;
    expect(fixture.expectedTasks.length).toBe(1);
  });
});
