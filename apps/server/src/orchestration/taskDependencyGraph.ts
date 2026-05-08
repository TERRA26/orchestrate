import type { OrchestratorTask, OrchestratorTaskId } from "@orchestrate/contracts";

/**
 * Pure helpers for the orchestrator-task dependency graph.
 *
 * orchestrator.task.create accepts a `dependsOn: OrchestratorTaskId[]`
 * array but the decider previously persisted it without cycle
 * detection. A circular chain (A -> B -> A, or longer) made every
 * task in the cycle unscheduleable forever; nothing crashed, the run
 * just silently stalled.
 *
 * `detectDependencyCycle` builds the prospective post-create graph
 * (existing tasks + the new one) and runs DFS to surface any cycle.
 * The decider rejects create when this returns a non-null cycle.
 *
 * @see ORC-118
 * @module orchestration/taskDependencyGraph
 */

/** A subset of OrchestratorTask sufficient for cycle detection. */
export interface DependencyTask {
  readonly taskId: OrchestratorTaskId;
  readonly dependsOn?: ReadonlyArray<OrchestratorTaskId> | undefined;
}

export type TaskDependencyCycle = ReadonlyArray<OrchestratorTaskId>;

/**
 * Detect a cycle in the prospective graph formed by `existingTasks`
 * plus the new (taskId, dependsOn) edge. Returns the cycle as an
 * ordered list of task ids (start = end on the path) when one exists,
 * otherwise null.
 *
 * Self-edges (taskId in dependsOn) count as cycles.
 *
 * The algorithm is iterative DFS with a visited set and a recursion
 * stack. Time complexity O(V + E) where V is the number of tasks and E
 * is the number of dependency edges; suitable for the orchestrator's
 * typical task counts (tens, not thousands).
 */
export const detectDependencyCycle = (input: {
  readonly existingTasks: ReadonlyArray<DependencyTask>;
  readonly newTaskId: OrchestratorTaskId;
  readonly newDependsOn: ReadonlyArray<OrchestratorTaskId> | undefined;
}): TaskDependencyCycle | null => {
  const adjacency = new Map<string, ReadonlyArray<OrchestratorTaskId>>();

  for (const task of input.existingTasks) {
    adjacency.set(task.taskId as unknown as string, task.dependsOn ?? []);
  }
  adjacency.set(
    input.newTaskId as unknown as string,
    input.newDependsOn ?? [],
  );

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();

  function dfs(start: string): TaskDependencyCycle | null {
    // Iterative DFS so deep graphs do not overflow the JS stack. The
    // explicit `path` mirrors the gray (in-progress) frontier so we can
    // surface the exact cycle for the error message.
    type Frame = { node: string; nextChildIndex: number };
    const stack: Frame[] = [{ node: start, nextChildIndex: 0 }];
    color.set(start, GRAY);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const children = adjacency.get(frame.node) ?? [];
      if (frame.nextChildIndex >= children.length) {
        color.set(frame.node, BLACK);
        stack.pop();
        continue;
      }
      const childId = children[frame.nextChildIndex] as unknown as string;
      frame.nextChildIndex += 1;
      const childColor = color.get(childId) ?? WHITE;
      if (childColor === GRAY) {
        // Cycle detected: childId is already on the recursion stack.
        // Slice from where childId first appears to the current top
        // (inclusive), then append childId again to close the loop.
        const cycleStartIdx = stack.findIndex((f) => f.node === childId);
        if (cycleStartIdx < 0) {
          // Unreachable: GRAY means the node is on the stack.
          return [childId as unknown as OrchestratorTaskId];
        }
        return [
          ...stack
            .slice(cycleStartIdx)
            .map((f) => f.node as unknown as OrchestratorTaskId),
          childId as unknown as OrchestratorTaskId,
        ];
      }
      if (childColor === WHITE) {
        if (!adjacency.has(childId)) {
          // Edge to an unknown task. Treat as a leaf so the caller can
          // separately validate that all referenced ids exist.
          color.set(childId, BLACK);
          continue;
        }
        color.set(childId, GRAY);
        stack.push({ node: childId, nextChildIndex: 0 });
      }
    }
    return null;
  }

  // Run DFS starting from the new task; this catches any cycle that
  // includes the new edge. Cycles among existing tasks alone are out
  // of scope (we assume the prior store was clean).
  const cycle = dfs(input.newTaskId as unknown as string);
  return cycle;
};

/**
 * Convenience adapter for OrchestratorTask shapes (the decider's
 * read-model type). Strips fields not needed for graph analysis.
 */
export const toDependencyTasks = (
  tasks: ReadonlyArray<OrchestratorTask>,
): ReadonlyArray<DependencyTask> =>
  tasks.map((t) => ({
    taskId: t.taskId,
    ...(t.dependsOn !== undefined ? { dependsOn: t.dependsOn } : {}),
  }));
