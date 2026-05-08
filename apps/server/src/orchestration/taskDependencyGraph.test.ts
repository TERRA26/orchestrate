import type { OrchestratorTaskId } from "@orchestrate/contracts";
import { describe, expect, it } from "vitest";

import {
  type DependencyTask,
  detectDependencyCycle,
} from "./taskDependencyGraph.ts";

const id = (s: string) => s as unknown as OrchestratorTaskId;

describe("detectDependencyCycle (ORC-118)", () => {
  it("returns null for an empty graph", () => {
    expect(
      detectDependencyCycle({
        existingTasks: [],
        newTaskId: id("a"),
        newDependsOn: undefined,
      }),
    ).toBeNull();
  });

  it("returns null for a linear chain (no cycle)", () => {
    const tasks: DependencyTask[] = [
      { taskId: id("a"), dependsOn: [] },
      { taskId: id("b"), dependsOn: [id("a")] },
    ];
    // Adding c -> b creates a -> b -> c, which is acyclic.
    expect(
      detectDependencyCycle({
        existingTasks: tasks,
        newTaskId: id("c"),
        newDependsOn: [id("b")],
      }),
    ).toBeNull();
  });

  it("detects a self-dependency cycle", () => {
    const cycle = detectDependencyCycle({
      existingTasks: [],
      newTaskId: id("a"),
      newDependsOn: [id("a")],
    });
    expect(cycle).not.toBeNull();
    expect(cycle).toContain(id("a"));
  });

  it("detects a 2-node cycle (A -> B -> A)", () => {
    const tasks: DependencyTask[] = [{ taskId: id("a"), dependsOn: [id("b")] }];
    const cycle = detectDependencyCycle({
      existingTasks: tasks,
      newTaskId: id("b"),
      newDependsOn: [id("a")],
    });
    expect(cycle).not.toBeNull();
    expect(cycle).toContain(id("a"));
    expect(cycle).toContain(id("b"));
  });

  it("detects a 3-node cycle (A -> B -> C -> A)", () => {
    const tasks: DependencyTask[] = [
      { taskId: id("a"), dependsOn: [id("b")] },
      { taskId: id("b"), dependsOn: [id("c")] },
    ];
    const cycle = detectDependencyCycle({
      existingTasks: tasks,
      newTaskId: id("c"),
      newDependsOn: [id("a")],
    });
    expect(cycle).not.toBeNull();
    expect(cycle).toContain(id("a"));
    expect(cycle).toContain(id("b"));
    expect(cycle).toContain(id("c"));
  });

  it("returns null when the new task references an unknown id (treats as leaf)", () => {
    const cycle = detectDependencyCycle({
      existingTasks: [],
      newTaskId: id("a"),
      newDependsOn: [id("unknown-x")],
    });
    expect(cycle).toBeNull();
  });

  it("returns null for a diamond DAG (no cycles in DAGs with shared roots)", () => {
    const tasks: DependencyTask[] = [
      { taskId: id("root"), dependsOn: [] },
      { taskId: id("left"), dependsOn: [id("root")] },
      { taskId: id("right"), dependsOn: [id("root")] },
    ];
    // Adding leaf -> {left, right} forms a diamond with no cycle.
    const cycle = detectDependencyCycle({
      existingTasks: tasks,
      newTaskId: id("leaf"),
      newDependsOn: [id("left"), id("right")],
    });
    expect(cycle).toBeNull();
  });

  it("detects a cycle hidden behind a transitive dep", () => {
    // Existing: a -> b, b -> c, c -> d.
    // New: e depends on d AND a depends on e (via the new edge).
    // We model this as creating new task "a-prime" that depends on e
    // — but since the existing "a" is already there, we instead simulate
    // by making the new task "e" depend on a and d both, completing the
    // chain c -> d -> e -> a -> b -> c (e is added; e depends on a and d).
    const tasks: DependencyTask[] = [
      { taskId: id("a"), dependsOn: [id("b")] },
      { taskId: id("b"), dependsOn: [id("c")] },
      { taskId: id("c"), dependsOn: [id("d")] },
      { taskId: id("d"), dependsOn: [id("e")] },
    ];
    const cycle = detectDependencyCycle({
      existingTasks: tasks,
      newTaskId: id("e"),
      newDependsOn: [id("a")],
    });
    expect(cycle).not.toBeNull();
    expect(cycle).toContain(id("a"));
    expect(cycle).toContain(id("e"));
  });

  it("treats undefined dependsOn the same as an empty array", () => {
    const cycle = detectDependencyCycle({
      existingTasks: [],
      newTaskId: id("a"),
      newDependsOn: undefined,
    });
    expect(cycle).toBeNull();
  });

  it("returns the cycle path with start = end", () => {
    const tasks: DependencyTask[] = [{ taskId: id("a"), dependsOn: [id("b")] }];
    const cycle = detectDependencyCycle({
      existingTasks: tasks,
      newTaskId: id("b"),
      newDependsOn: [id("a")],
    });
    expect(cycle).not.toBeNull();
    if (cycle) {
      // First and last entries form the cycle's closing edge.
      expect(cycle[0]).toBe(cycle[cycle.length - 1]);
    }
  });

  it("handles a complex acyclic graph without false positives", () => {
    const tasks: DependencyTask[] = [
      { taskId: id("a"), dependsOn: [] },
      { taskId: id("b"), dependsOn: [id("a")] },
      { taskId: id("c"), dependsOn: [id("a")] },
      { taskId: id("d"), dependsOn: [id("b"), id("c")] },
      { taskId: id("e"), dependsOn: [id("d")] },
    ];
    const cycle = detectDependencyCycle({
      existingTasks: tasks,
      newTaskId: id("f"),
      newDependsOn: [id("e"), id("d")],
    });
    expect(cycle).toBeNull();
  });
});
