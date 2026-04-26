import { describe, expect, it } from "vitest";
import type { OrchestratorRun } from "@orchestrate/contracts";

import { selectVisibleOrchestratorRun } from "./orchestratorRunSelection";

function makeRun(input: {
  runId: string;
  status?: OrchestratorRun["status"];
  createdAt: string;
  updatedAt?: string;
}): OrchestratorRun {
  return {
    runId: input.runId as OrchestratorRun["runId"],
    projectId: "project-1" as OrchestratorRun["projectId"],
    userRequest: `Request for ${input.runId}`,
    status: input.status ?? "active",
    rootTaskId: "task-root" as OrchestratorRun["rootTaskId"],
    goals: [],
    spawnBudget: {
      maxDepth: 2,
      maxChildren: 2,
      maxConcurrentWriters: 1,
      maxTotalWorkers: 2,
      allowedTools: [],
      writeScope: [],
    },
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
  };
}

describe("selectVisibleOrchestratorRun", () => {
  it("prefers the tracked run when it exists", () => {
    const runs = [
      makeRun({
        runId: "run-old",
        createdAt: "2026-04-12T10:00:00.000Z",
        updatedAt: "2026-04-12T10:05:00.000Z",
      }),
      makeRun({
        runId: "run-new",
        createdAt: "2026-04-12T11:00:00.000Z",
        updatedAt: "2026-04-12T11:05:00.000Z",
      }),
    ];

    expect(selectVisibleOrchestratorRun(runs, "run-old" as OrchestratorRun["runId"])?.runId).toBe(
      "run-old",
    );
  });

  it("falls back to the newest active run", () => {
    const runs = [
      makeRun({
        runId: "run-old",
        createdAt: "2026-04-12T10:00:00.000Z",
        updatedAt: "2026-04-12T10:05:00.000Z",
      }),
      makeRun({
        runId: "run-new",
        createdAt: "2026-04-12T11:00:00.000Z",
        updatedAt: "2026-04-12T11:05:00.000Z",
      }),
    ];

    expect(selectVisibleOrchestratorRun(runs, null)?.runId).toBe("run-new");
  });

  it("falls back to the newest run overall when none are active", () => {
    const runs = [
      makeRun({
        runId: "run-failed",
        status: "failed",
        createdAt: "2026-04-12T10:00:00.000Z",
        updatedAt: "2026-04-12T10:10:00.000Z",
      }),
      makeRun({
        runId: "run-completed",
        status: "completed",
        createdAt: "2026-04-12T11:00:00.000Z",
        updatedAt: "2026-04-12T11:10:00.000Z",
      }),
    ];

    expect(selectVisibleOrchestratorRun(runs, null)?.runId).toBe("run-completed");
  });
});
