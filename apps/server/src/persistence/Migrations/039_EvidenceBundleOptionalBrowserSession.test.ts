import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("039_EvidenceBundleOptionalBrowserSession", (it) => {
  it.effect("preserves bundle snapshots and allows null browser session ids", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 38 });
      yield* sql`
        INSERT INTO evidence_bundles (
          bundle_id, session_id, workflow_run_id, preview_target_id,
          task_spec_id, acceptance_criteria_id, permission_policy_id,
          browser_session_id, code_state_json, artifact_refs_json,
          event_refs_json, bundle_snapshot_json, created_at
        )
        VALUES (
          'bundle-before-039', 'session-before-039', 'workflow-before-039',
          'target-before-039', 'task-before-039', 'criteria-before-039',
          'policy-before-039', 'browser-session-before-039', '{"headSha":"head"}',
          '["artifact-before-039"]', '["event-before-039"]',
          '{"id":"bundle-before-039","marker":"snapshot-before-039"}',
          '2026-04-28T00:00:00.000Z'
        )
      `;

      yield* runMigrations({ toMigrationInclusive: 39 });
      yield* sql`
        INSERT INTO evidence_bundles (
          bundle_id, session_id, workflow_run_id, preview_target_id,
          task_spec_id, acceptance_criteria_id, permission_policy_id,
          browser_session_id, code_state_json, artifact_refs_json,
          event_refs_json, bundle_snapshot_json, created_at
        )
        VALUES (
          'bundle-null-browser-039', 'session-null-browser-039', 'workflow-null-browser-039',
          'target-null-browser-039', 'task-null-browser-039', 'criteria-null-browser-039',
          'policy-null-browser-039', NULL, '{"headSha":"head"}',
          '["artifact-null-browser-039"]', '["event-null-browser-039"]',
          '{"id":"bundle-null-browser-039","marker":"snapshot-null-browser-039"}',
          '2026-04-28T00:00:01.000Z'
        )
      `;

      const rows = yield* sql<{
        readonly bundleId: string;
        readonly browserSessionId: string | null;
        readonly bundleSnapshotJson: string | null;
        readonly artifactRefsJson: string;
        readonly eventRefsJson: string;
      }>`
        SELECT
          bundle_id AS "bundleId",
          browser_session_id AS "browserSessionId",
          bundle_snapshot_json AS "bundleSnapshotJson",
          artifact_refs_json AS "artifactRefsJson",
          event_refs_json AS "eventRefsJson"
        FROM evidence_bundles
        ORDER BY bundle_id
      `;

      assert.deepStrictEqual(rows, [
        {
          bundleId: "bundle-before-039",
          browserSessionId: "browser-session-before-039",
          bundleSnapshotJson: '{"id":"bundle-before-039","marker":"snapshot-before-039"}',
          artifactRefsJson: '["artifact-before-039"]',
          eventRefsJson: '["event-before-039"]',
        },
        {
          bundleId: "bundle-null-browser-039",
          browserSessionId: null,
          bundleSnapshotJson:
            '{"id":"bundle-null-browser-039","marker":"snapshot-null-browser-039"}',
          artifactRefsJson: '["artifact-null-browser-039"]',
          eventRefsJson: '["event-null-browser-039"]',
        },
      ]);
    }),
  );
});
