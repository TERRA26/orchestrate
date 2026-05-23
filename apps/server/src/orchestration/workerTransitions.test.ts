import { CommandId } from "@orchestrate/contracts";
import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import {
  WORKER_LEGAL_TRANSITIONS,
  type WorkerStatus,
  isLegalWorkerTransition,
  requireLegalWorkerTransition,
} from "./workerTransitions.ts";

const ALL_STATUSES: ReadonlyArray<WorkerStatus> = [
  "idle",
  "running",
  "paused",
  "submitted",
  "stuck",
  "terminated",
];

describe("isLegalWorkerTransition (ORC-116)", () => {
  it("rejects all self-transitions", () => {
    for (const status of ALL_STATUSES) {
      expect(isLegalWorkerTransition(status, status), `${status} -> ${status}`).toBe(false);
    }
  });

  it("treats `terminated` as a strict terminal state (no outgoing edges)", () => {
    for (const to of ALL_STATUSES) {
      if (to === "terminated") continue;
      expect(
        isLegalWorkerTransition("terminated", to),
        `terminated -> ${to} must not be legal`,
      ).toBe(false);
    }
  });

  it("permits the canonical happy-path transitions", () => {
    expect(isLegalWorkerTransition("idle", "running")).toBe(true);
    expect(isLegalWorkerTransition("running", "submitted")).toBe(true);
    expect(isLegalWorkerTransition("submitted", "running")).toBe(true);
    expect(isLegalWorkerTransition("running", "terminated")).toBe(true);
  });

  it("permits pause/resume cycles", () => {
    expect(isLegalWorkerTransition("running", "paused")).toBe(true);
    expect(isLegalWorkerTransition("paused", "running")).toBe(true);
    expect(isLegalWorkerTransition("paused", "idle")).toBe(true);
    expect(isLegalWorkerTransition("idle", "paused")).toBe(true);
  });

  it("permits stuck-state recovery", () => {
    expect(isLegalWorkerTransition("running", "stuck")).toBe(true);
    expect(isLegalWorkerTransition("stuck", "running")).toBe(true);
    expect(isLegalWorkerTransition("stuck", "terminated")).toBe(true);
  });

  it("permits termination from every non-terminal state", () => {
    for (const from of ALL_STATUSES) {
      if (from === "terminated") continue;
      expect(
        isLegalWorkerTransition(from, "terminated"),
        `${from} -> terminated must be legal`,
      ).toBe(true);
    }
  });

  it("rejects skipping submitted directly back to paused", () => {
    // submitted is a post-work state; resuming pause from there doesn't
    // make sense — the orchestrator should accept/reject first.
    expect(isLegalWorkerTransition("submitted", "paused")).toBe(false);
  });

  it("rejects unknown source status", () => {
    expect(
      isLegalWorkerTransition("nonsense" as WorkerStatus, "running"),
    ).toBe(false);
  });

  it("the transition map covers every defined worker status", () => {
    for (const status of ALL_STATUSES) {
      expect(WORKER_LEGAL_TRANSITIONS.has(status), `${status} must appear in the graph`).toBe(true);
    }
  });
});

describe("requireLegalWorkerTransition (ORC-116)", () => {
  const command = {
    type: "orchestrator.worker.terminate",
    commandId: CommandId.makeUnsafe("cmd-1"),
    workerId: "w1",
    reason: "test",
    createdAt: "2026-04-09T12:00:00.000Z",
  } as unknown as Parameters<typeof requireLegalWorkerTransition>[0]["command"];

  it("returns Effect.void when the transition is legal", async () => {
    const exit = await Effect.runPromiseExit(
      requireLegalWorkerTransition({
        command,
        workerId: "w1",
        from: "running",
        to: "terminated",
      }),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
  });

  it("fails with OrchestrationCommandInvariantError when illegal", async () => {
    const exit = await Effect.runPromiseExit(
      requireLegalWorkerTransition({
        command,
        workerId: "w1",
        from: "terminated",
        to: "running",
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const detail = JSON.stringify(exit.cause);
      expect(detail).toContain("Illegal worker transition");
      expect(detail).toContain("w1");
      expect(detail).toContain("terminated");
      expect(detail).toContain("running");
    }
  });

  it("rejects re-terminating an already-terminated worker", async () => {
    const exit = await Effect.runPromiseExit(
      requireLegalWorkerTransition({
        command,
        workerId: "w1",
        from: "terminated",
        to: "terminated",
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("rejects illegal self-transition with a clear error", async () => {
    const exit = await Effect.runPromiseExit(
      requireLegalWorkerTransition({
        command,
        workerId: "w1",
        from: "running",
        to: "running",
      }),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });
});
