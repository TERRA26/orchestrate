import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("040_ReviewerDecisionActionPacket", (it) => {
  it.effect("adds purpose and action packet columns while preserving existing decisions", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 39 });
      yield* sql`
        INSERT INTO evidence_bundles (
          bundle_id, session_id, workflow_run_id, preview_target_id,
          task_spec_id, acceptance_criteria_id, permission_policy_id,
          browser_session_id, code_state_json, artifact_refs_json,
          event_refs_json, bundle_snapshot_json, created_at
        )
        VALUES (
          'bundle-before-040', 'session-before-040', 'workflow-before-040',
          'target-before-040', 'task-before-040', 'criteria-before-040',
          'policy-before-040', NULL, '{"captureStatus":"unknown"}',
          '["artifact-before-040"]', '["event-before-040"]',
          '{"id":"bundle-before-040","marker":"snapshot-before-040"}',
          '2026-04-28T00:00:00.000Z'
        )
      `;
      yield* sql`
        INSERT INTO browser_reviewer_decisions (
          decision_id, session_id, workflow_run_id, evidence_bundle_id,
          outcome, confidence, gates_json, criteria_json, findings_json,
          unresolved_criteria_json, rework_packet_json, user_visible_summary_ref, created_at
        )
        VALUES (
          'decision-before-040', 'session-before-040', 'workflow-before-040',
          'bundle-before-040', 'accepted', 'high', '[]', '[]', '[]', '[]',
          NULL, 'artifact-summary-before-040', '2026-04-28T00:00:01.000Z'
        )
      `;

      yield* runMigrations({ toMigrationInclusive: 40 });
      yield* sql`
        INSERT INTO browser_reviewer_decisions (
          decision_id, session_id, workflow_run_id, evidence_bundle_id,
          purpose, outcome, confidence, gates_json, criteria_json, findings_json,
          unresolved_criteria_json, rework_packet_json, action_packet_json,
          user_visible_summary_ref, created_at
        )
        VALUES (
          'decision-after-040', 'session-before-040', 'workflow-before-040',
          'bundle-before-040', 'code-change', 'needs-human-review', 'medium', '[]',
          '[]', '[]', '[]', NULL, '{"kind":"needs-human-review"}',
          'artifact-summary-after-040', '2026-04-28T00:00:02.000Z'
        )
      `;

      const rows = yield* sql<{
        readonly decisionId: string;
        readonly purpose: string;
        readonly actionPacketJson: string | null;
      }>`
        SELECT
          decision_id AS "decisionId",
          purpose,
          action_packet_json AS "actionPacketJson"
        FROM browser_reviewer_decisions
        ORDER BY decision_id
      `;

      assert.deepStrictEqual(rows, [
        {
          decisionId: "decision-after-040",
          purpose: "code-change",
          actionPacketJson: '{"kind":"needs-human-review"}',
        },
        {
          decisionId: "decision-before-040",
          purpose: "manual-review",
          actionPacketJson: null,
        },
      ]);
    }),
  );
});
