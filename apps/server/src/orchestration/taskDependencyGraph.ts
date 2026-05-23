import type {
  OrchestratorTask,
  OrchestratorTaskId,
  OrchestrationReadModel,
  ThreadId,
} from "@orchestrate/contracts";

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

/**
 * Depth of the parent chain rooted at `threadId`. Walks
 * `parentThreadId` until null (root) or the chain breaks (parent
 * referenced but missing from the read model). Returns 0 for a root
 * thread. Used by the worker.spawn budget check to enforce
 * spawnBudget.maxDepth. [ORC-124]
 *
 * Cycle-resistant via a visited set; an accidental loop in the
 * thread graph caps at threadCount + 1 iterations rather than
 * looping forever.
 */
export const computeThreadDepth = (input: {
  readonly readModel: OrchestrationReadModel;
  readonly threadId: ThreadId;
}): number => {
  const threads = new Map<string, { parentThreadId: ThreadId | null | undefined }>();
  for (const t of input.readModel.threads) {
    threads.set(t.id as unknown as string, {
      parentThreadId: t.parentThreadId,
    });
  }

  let depth = 0;
  let current: string | undefined = input.threadId as unknown as string;
  const visited = new Set<string>();
  while (current !== undefined) {
    if (visited.has(current)) break;
    visited.add(current);
    const node = threads.get(current);
    if (!node) break;
    if (node.parentThreadId === null || node.parentThreadId === undefined) break;
    depth += 1;
    current = node.parentThreadId as unknown as string;
  }
  return depth;
};

/**
 * Forward closure: return every task in `tasks` that transitively
 * depends on `rootTaskId` (directly via `dependsOn` or through any
 * chain). Useful when a task fails or its worker terminates and we
 * need to surface every downstream task so the runtime can block or
 * fail them deterministically. [ORC-122]
 *
 * Excludes `rootTaskId` itself from the returned set. Output order is
 * BFS-by-distance so callers can render the closest dependents first.
 *
 * Cyclic graphs are handled by a visited set (cycles cannot exist
 * after ORC-118's create-time guard, but the helper is robust against
 * legacy data).
 */
export const findDependentTasks = (input: {
  readonly rootTaskId: OrchestratorTaskId;
  readonly tasks: ReadonlyArray<DependencyTask>;
}): ReadonlyArray<OrchestratorTaskId> => {
  // Build reverse adjacency: parent -> [children that depend on parent].
  const reverse = new Map<string, OrchestratorTaskId[]>();
  for (const task of input.tasks) {
    for (const dep of task.dependsOn ?? []) {
      const key = dep as unknown as string;
      const existing = reverse.get(key);
      if (existing) {
        existing.push(task.taskId);
      } else {
        reverse.set(key, [task.taskId]);
      }
    }
  }

  // Seed visited with the root so a cycle that loops back to it does not
  // re-add the root to the dependents list.
  const visited = new Set<string>([input.rootTaskId as unknown as string]);
  const out: OrchestratorTaskId[] = [];
  const queue: string[] = [input.rootTaskId as unknown as string];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const dependents = reverse.get(current) ?? [];
    for (const child of dependents) {
      const key = child as unknown as string;
      if (visited.has(key)) continue;
      visited.add(key);
      out.push(child);
      queue.push(key);
    }
  }

  return out;
};
