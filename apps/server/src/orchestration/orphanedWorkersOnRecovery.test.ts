import { describe, expect, it } from "vitest";
import type { OrchestratorWorker } from "@orchestrate/contracts";

import {
  ORPHAN_RECOVERY_REASON,
  findOrphanedWorkersOnRecovery,
} from "./orphanedWorkersOnRecovery";

/**
 * Pins the recovery contract introduced by ORC-275: any worker
 * persisted with an in-flight or paused status when the server
 * boots had its provider session torn down with the previous
 * process. The helper identifies those orphans so the runtime can
 * dispatch terminate events and unblock dependent tasks.
 *
 * @see ORC-275
 */

const buildWorker = (status: OrchestratorWorker["status"]): OrchestratorWorker =>
  ({ status }) as unknown as OrchestratorWorker;

describe("findOrphanedWorkersOnRecovery (ORC-275)", () => {
  it("includes a `running` worker", () => {
    const workers = [buildWorker("running")];
    expect(findOrphanedWorkersOnRecovery(workers)).toEqual(workers);
  });

  it("includes a `submitted` worker", () => {
    expect(findOrphanedWorkersOnRecovery([buildWorker("submitted")])).toHaveLength(1);
  });

  it("includes a `paused` worker", () => {
    expect(findOrphanedWorkersOnRecovery([buildWorker("paused")])).toHaveLength(1);
  });

  it("includes a `stuck` worker", () => {
    expect(findOrphanedWorkersOnRecovery([buildWorker("stuck")])).toHaveLength(1);
  });

  it("excludes an `idle` worker", () => {
    expect(findOrphanedWorkersOnRecovery([buildWorker("idle")])).toEqual([]);
  });

  it("excludes a `terminated` worker", () => {
    expect(findOrphanedWorkersOnRecovery([buildWorker("terminated")])).toEqual([]);
  });

  it("returns only the orphan subset from a mixed list", () => {
    const running = buildWorker("running");
    const idle = buildWorker("idle");
    const submitted = buildWorker("submitted");
    const terminated = buildWorker("terminated");
    const result = findOrphanedWorkersOnRecovery([running, idle, submitted, terminated]);
    expect(result).toEqual([running, submitted]);
  });

  it("returns an empty array for an empty input", () => {
    expect(findOrphanedWorkersOnRecovery([])).toEqual([]);
  });

  it("exports a stable recovery reason for log grouping", () => {
    expect(ORPHAN_RECOVERY_REASON).toMatch(/recovery/);
    expect(ORPHAN_RECOVERY_REASON).toMatch(/orphaned/);
    expect(ORPHAN_RECOVERY_REASON).toMatch(/no live provider session/);
  });
});
