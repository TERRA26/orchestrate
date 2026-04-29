import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("045_ReworkTasks", (it) => {
  it.effect("creates rework_tasks with lookup indexes", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 45 });

      yield* sql`
        INSERT INTO rework_tasks (
          rework_task_id, parent_decision_id, workflow_run_id, thread_id,
          orchestrator_task_id, worker_id, status, annotation_targets_json,
          evidence_refs_json, before_evidence_refs_json, after_evidence_refs_json,
          instruction, created_at, updated_at
        )
        VALUES (
          'rework-task-1', 'decision-1', 'workflow-1', 'thread-1',
          'orchestrator-task-1', 'worker-1', 'assigned', '[]',
          '["artifact-1"]', '["before-1"]', '[]', 'Fix annotation.',
          '2026-04-29T00:00:00.000Z', '2026-04-29T00:00:00.000Z'
        )
      `;

      const rows = yield* sql<{ readonly status: string; readonly beforeRefs: string }>`
        SELECT status, before_evidence_refs_json AS "beforeRefs"
        FROM rework_tasks
        WHERE orchestrator_task_id = 'orchestrator-task-1'
      `;
      assert.deepStrictEqual(rows, [{ status: "assigned", beforeRefs: '["before-1"]' }]);

      const indexes = yield* sql<{ readonly name: string }>`
        SELECT name FROM sqlite_master
        WHERE type = 'index' AND tbl_name = 'rework_tasks'
        ORDER BY name
      `;
      assert.deepStrictEqual(
        indexes.map((row) => row.name),
        [
          "idx_rework_tasks_orchestrator_task_id",
          "idx_rework_tasks_parent_decision_id",
          "idx_rework_tasks_status",
          "sqlite_autoindex_rework_tasks_1",
        ],
      );
    }),
  );
});
