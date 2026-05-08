import type {
  OrchestratorTask,
  OrchestratorTaskId,
  OrchestratorWorker,
  OrchestratorWorkerId,
} from "@orchestrate/contracts";

/**
 * Builds a Map<workerId, task> by joining the workers' activeTaskId
 * to the task with the matching taskId.
 *
 * Both keys carry their branded types end-to-end. Without the brand,
 * a Map<string, OrchestratorTask> would happily accept any string,
 * which means a worker-id-shaped value could collide with a task-id
 * if the two namespaces ever overlapped at runtime. ORC-261 closes
 * that loophole by typing the intermediate map as
 * Map<OrchestratorTaskId, OrchestratorTask>.
 *
 * Pure function so the contract is testable without mounting the
 * sidebar's WorkerCanvas component.
 *
 * @see ORC-261
 */
export function taskByWorkerId(
  workers: ReadonlyArray<OrchestratorWorker>,
  tasks: ReadonlyArray<OrchestratorTask> | undefined,
): Map<OrchestratorWorkerId, OrchestratorTask> {
  const result = new Map<OrchestratorWorkerId, OrchestratorTask>();
  if (!tasks || tasks.length === 0) return result;

  const byTaskId = new Map<OrchestratorTaskId, OrchestratorTask>();
  for (const task of tasks) {
    byTaskId.set(task.taskId, task);
  }

  for (const worker of workers) {
    const activeTaskId = worker.activeTaskId;
    if (activeTaskId === undefined || activeTaskId === null) continue;
    const task = byTaskId.get(activeTaskId);
    if (task !== undefined) {
      result.set(worker.workerId, task);
    }
  }

  return result;
}
