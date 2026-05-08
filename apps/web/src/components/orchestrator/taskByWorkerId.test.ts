import { describe, expect, it } from "vitest";
import {
  OrchestratorTaskId,
  OrchestratorWorkerId,
  type OrchestratorTask,
  type OrchestratorWorker,
} from "@orchestrate/contracts";

import { taskByWorkerId } from "./taskByWorkerId";

/**
 * Pins the join-by-branded-id contract introduced by ORC-261.
 *
 * The original WorkerCanvas keyed an intermediate Map by raw string
 * via `as unknown as string` casts; this helper preserves the
 * OrchestratorTaskId brand end-to-end.
 *
 * @see ORC-261
 */

const buildTask = (taskId: string): OrchestratorTask =>
  ({
    taskId: OrchestratorTaskId.makeUnsafe(taskId),
  }) as unknown as OrchestratorTask;

const buildWorker = (workerId: string, activeTaskId: string | null): OrchestratorWorker =>
  ({
    workerId: OrchestratorWorkerId.makeUnsafe(workerId),
    activeTaskId:
      activeTaskId === null ? null : OrchestratorTaskId.makeUnsafe(activeTaskId),
  }) as unknown as OrchestratorWorker;

describe("taskByWorkerId (ORC-261)", () => {
  it("links a worker to its active task", () => {
    const task = buildTask("task-1");
    const worker = buildWorker("worker-1", "task-1");
    const result = taskByWorkerId([worker], [task]);
    expect(result.size).toBe(1);
    expect(result.get(worker.workerId)).toBe(task);
  });

  it("returns an empty map when tasks is undefined", () => {
    const worker = buildWorker("worker-1", "task-1");
    const result = taskByWorkerId([worker], undefined);
    expect(result.size).toBe(0);
  });

  it("returns an empty map when tasks is empty", () => {
    const worker = buildWorker("worker-1", "task-1");
    const result = taskByWorkerId([worker], []);
    expect(result.size).toBe(0);
  });

  it("skips workers with no activeTaskId", () => {
    const task = buildTask("task-1");
    const idle = buildWorker("worker-idle", null);
    const result = taskByWorkerId([idle], [task]);
    expect(result.size).toBe(0);
  });

  it("skips workers whose activeTaskId points to an unknown task", () => {
    const task = buildTask("task-1");
    const orphan = buildWorker("worker-1", "task-missing");
    const result = taskByWorkerId([orphan], [task]);
    expect(result.size).toBe(0);
  });

  it("links multiple workers to their distinct tasks", () => {
    const taskA = buildTask("task-a");
    const taskB = buildTask("task-b");
    const wA = buildWorker("worker-a", "task-a");
    const wB = buildWorker("worker-b", "task-b");
    const result = taskByWorkerId([wA, wB], [taskA, taskB]);
    expect(result.size).toBe(2);
    expect(result.get(wA.workerId)).toBe(taskA);
    expect(result.get(wB.workerId)).toBe(taskB);
  });
});
