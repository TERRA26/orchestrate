import {
  CommandId,
  ProjectId,
  type OrchestratorRunId,
  type OrchestrationEvent,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Effect, Layer, ManagedRuntime, Stream } from "effect";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ServerConfig } from "../config.ts";
import { OrchestrationCommandReceiptRepositoryLive } from "../persistence/Layers/OrchestrationCommandReceipts.ts";
import { OrchestrationEventStoreLive } from "../persistence/Layers/OrchestrationEventStore.ts";
import { makeSqlitePersistenceLive } from "../persistence/Layers/Sqlite.ts";
import { OrchestrationEngineLive } from "./Layers/OrchestrationEngine.ts";
import { OrchestrationProjectionPipelineLive } from "./Layers/ProjectionPipeline.ts";
import { OrchestrationEngineService } from "./Services/OrchestrationEngine.ts";

const asProjectId = (value: string): ProjectId => ProjectId.makeUnsafe(value);

const spawnBudget = {
  maxDepth: 2,
  maxChildren: 5,
  maxConcurrentWriters: 3,
  maxTotalWorkers: 10,
  allowedTools: ["read", "write", "bash"],
  writeScope: ["src/**"],
};

function now() {
  return new Date().toISOString();
}

/**
 * Create an orchestration engine backed by a file-based SQLite database.
 *
 * Using `makeSqlitePersistenceLive(dbPath)` instead of `SqlitePersistenceMemory`
 * ensures events survive across engine restarts.  The `baseDir` parameter
 * anchors the ServerConfig so the projection pipeline can resolve attachment
 * and log paths correctly.
 */
async function createPersistentEngine(dbPath: string, baseDir: string) {
  const sqliteLayer = makeSqlitePersistenceLive(dbPath);
  const serverConfigLayer = ServerConfig.layerTest(process.cwd(), baseDir);

  const orchestrationLayer = OrchestrationEngineLive.pipe(
    Layer.provide(OrchestrationProjectionPipelineLive),
    Layer.provide(OrchestrationEventStoreLive),
    Layer.provide(OrchestrationCommandReceiptRepositoryLive),
    Layer.provide(sqliteLayer),
    Layer.provideMerge(serverConfigLayer),
    Layer.provideMerge(NodeServices.layer),
  );

  const runtime = ManagedRuntime.make(orchestrationLayer);
  const engine = await runtime.runPromise(Effect.service(OrchestrationEngineService));

  return {
    engine,
    run: <A, E>(effect: Effect.Effect<A, E>) => runtime.runPromise(effect),
    dispose: () => runtime.dispose(),
  };
}

describe("orchestrator recovery", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("recovers orchestrator run state after engine restart", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "t3-recovery-test-"));
    const dbPath = path.join(tmpDir, "recovery.db");

    const createdAt = now();
    const projectId = asProjectId("project-recovery");
    const runId = "run-recovery" as OrchestratorRunId;

    // ------------------------------------------------------------------
    // Phase 1: Create a project and orchestrator run, then shut down
    // ------------------------------------------------------------------
    const system1 = await createPersistentEngine(dbPath, tmpDir);

    await system1.run(
      system1.engine.dispatch({
        type: "project.create",
        commandId: CommandId.makeUnsafe("cmd-recovery-project-create"),
        projectId,
        title: "Recovery Project",
        workspaceRoot: "/tmp/recovery-project",
        defaultModelSelection: { provider: "codex", model: "gpt-5-codex" },
        createdAt,
      }),
    );

    await system1.run(
      system1.engine.dispatch({
        type: "orchestrator.run.create",
        commandId: CommandId.makeUnsafe("cmd-recovery-run-create"),
        runId,
        projectId,
        userRequest: "Build a REST API",
        goals: ["Create endpoints", "Add tests"],
        spawnBudget,
        createdAt,
      }),
    );

    // Verify the run is active before shutdown
    const readModelBeforeShutdown = await system1.run(system1.engine.getReadModel());
    const runBefore = (readModelBeforeShutdown.orchestratorRuns ?? []).find(
      (r) => r.runId === runId,
    );
    expect(runBefore).toBeDefined();
    expect(runBefore!.status).toBe("active");

    // Verify events were persisted
    const eventsBefore = await system1.run(
      Stream.runCollect(system1.engine.readEvents(0)).pipe(
        Effect.map((chunk): OrchestrationEvent[] => Array.from(chunk)),
      ),
    );
    expect(eventsBefore.length).toBeGreaterThanOrEqual(2);

    // Shut down the engine
    await system1.dispose();

    // ------------------------------------------------------------------
    // Phase 2: Restart with the same DB file and verify recovery
    // ------------------------------------------------------------------
    const system2 = await createPersistentEngine(dbPath, tmpDir);

    // The engine should have replayed all events from the event store
    const readModelAfterRestart = await system2.run(system2.engine.getReadModel());

    // Verify the project was recovered
    const recoveredProject = readModelAfterRestart.projects.find((p) => p.id === projectId);
    expect(recoveredProject).toBeDefined();
    expect(recoveredProject!.title).toBe("Recovery Project");

    // Verify the orchestrator run was recovered with active status
    const recoveredRun = (readModelAfterRestart.orchestratorRuns ?? []).find(
      (r) => r.runId === runId,
    );
    expect(recoveredRun).toBeDefined();
    expect(recoveredRun!.status).toBe("active");

    // Prove the engine can continue operating: cancel the recovered run
    await system2.run(
      system2.engine.dispatch({
        type: "orchestrator.run.cancel",
        commandId: CommandId.makeUnsafe("cmd-recovery-run-cancel"),
        runId,
        reason: "Cancelled after recovery",
        createdAt: now(),
      }),
    );

    // Verify the run is now cancelled
    const readModelAfterCancel = await system2.run(system2.engine.getReadModel());
    const cancelledRun = (readModelAfterCancel.orchestratorRuns ?? []).find(
      (r) => r.runId === runId,
    );
    expect(cancelledRun).toBeDefined();
    expect(cancelledRun!.status).toBe("cancelled");

    await system2.dispose();
  });

  it("preserves event ordering across restarts", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "t3-recovery-order-test-"));
    const dbPath = path.join(tmpDir, "order.db");

    const createdAt = now();
    const projectId = asProjectId("project-order");

    // Phase 1: Create events
    const system1 = await createPersistentEngine(dbPath, tmpDir);

    await system1.run(
      system1.engine.dispatch({
        type: "project.create",
        commandId: CommandId.makeUnsafe("cmd-order-project-create"),
        projectId,
        title: "Order Project",
        workspaceRoot: "/tmp/order-project",
        defaultModelSelection: { provider: "codex", model: "gpt-5-codex" },
        createdAt,
      }),
    );

    const eventsPhase1 = await system1.run(
      Stream.runCollect(system1.engine.readEvents(0)).pipe(
        Effect.map((chunk): OrchestrationEvent[] => Array.from(chunk)),
      ),
    );
    const eventTypesPhase1 = eventsPhase1.map((e) => e.type);

    await system1.dispose();

    // Phase 2: Read events after restart and compare
    const system2 = await createPersistentEngine(dbPath, tmpDir);

    const eventsPhase2 = await system2.run(
      Stream.runCollect(system2.engine.readEvents(0)).pipe(
        Effect.map((chunk): OrchestrationEvent[] => Array.from(chunk)),
      ),
    );
    const eventTypesPhase2 = eventsPhase2.map((e) => e.type);

    // Event order must be identical
    expect(eventTypesPhase2).toEqual(eventTypesPhase1);

    // Sequence numbers must be preserved
    expect(eventsPhase2.map((e) => e.sequence)).toEqual(eventsPhase1.map((e) => e.sequence));

    await system2.dispose();
  });

  it("continues sequence numbering after restart", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "t3-recovery-seq-test-"));
    const dbPath = path.join(tmpDir, "sequence.db");

    const createdAt = now();
    const projectId = asProjectId("project-seq");

    // Phase 1: Create initial events
    const system1 = await createPersistentEngine(dbPath, tmpDir);

    await system1.run(
      system1.engine.dispatch({
        type: "project.create",
        commandId: CommandId.makeUnsafe("cmd-seq-project-create"),
        projectId,
        title: "Sequence Project",
        workspaceRoot: "/tmp/seq-project",
        defaultModelSelection: { provider: "codex", model: "gpt-5-codex" },
        createdAt,
      }),
    );

    const modelPhase1 = await system1.run(system1.engine.getReadModel());
    const lastSequencePhase1 = modelPhase1.snapshotSequence;
    expect(lastSequencePhase1).toBeGreaterThan(0);

    await system1.dispose();

    // Phase 2: New events should continue from where we left off
    const system2 = await createPersistentEngine(dbPath, tmpDir);

    await system2.run(
      system2.engine.dispatch({
        type: "project.meta.update",
        commandId: CommandId.makeUnsafe("cmd-seq-project-update"),
        projectId,
        title: "Sequence Project Updated",
      }),
    );

    const modelPhase2 = await system2.run(system2.engine.getReadModel());
    expect(modelPhase2.snapshotSequence).toBeGreaterThan(lastSequencePhase1);

    // Verify the update was applied
    const project = modelPhase2.projects.find((p) => p.id === projectId);
    expect(project).toBeDefined();
    expect(project!.title).toBe("Sequence Project Updated");

    await system2.dispose();
  });
});
