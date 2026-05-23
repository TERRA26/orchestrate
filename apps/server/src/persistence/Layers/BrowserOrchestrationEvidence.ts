import { Effect, Layer, Option } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  BrowserOrchestrationEvidenceRepository,
  type BrowserOrchestrationEvidenceRepositoryShape,
  BrowserApprovalRequestRow,
  BrowserControlStateRow,
  BrowserSessionEventRow,
  EvidenceArtifactContentRow,
  EvidenceArtifactRow,
  EvidenceBundleRow,
  GetBrowserApprovalRequestInput,
  GetBrowserControlStateInput,
  GetEvidenceArtifactInput,
  GetEvidenceBundleInput,
  GetReviewerDecisionInput,
  GetSessionEventsInput,
  ListBrowserApprovalRequestsInput,
  ListReviewerDecisionsInput,
  ReviewerDecisionRow,
  UpdateBrowserApprovalStatusInput,
} from "../Services/BrowserOrchestrationEvidence.ts";

const makeBrowserOrchestrationEvidenceRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const appendSessionEventRow = SqlSchema.void({
    Request: BrowserSessionEventRow,
    execute: (row) =>
      sql`
        INSERT INTO browser_session_events (
          event_id, session_id, workflow_run_id, type, actor,
          artifact_refs_json, payload_json, occurred_at
        )
        VALUES (
          ${row.eventId}, ${row.sessionId}, ${row.workflowRunId}, ${row.type}, ${row.actor},
          ${row.artifactRefsJson}, ${row.payloadJson}, ${row.occurredAt}
        )
        ON CONFLICT (event_id) DO NOTHING
      `,
  });

  const getSessionEventRows = SqlSchema.findAll({
    Request: GetSessionEventsInput,
    Result: BrowserSessionEventRow,
    execute: ({ sessionId }) =>
      sql`
        SELECT
          event_id AS "eventId",
          session_id AS "sessionId",
          workflow_run_id AS "workflowRunId",
          type,
          actor,
          artifact_refs_json AS "artifactRefsJson",
          payload_json AS "payloadJson",
          occurred_at AS "occurredAt"
        FROM browser_session_events
        WHERE session_id = ${sessionId}
        ORDER BY occurred_at ASC, event_id ASC
      `,
  });

  const writeEvidenceArtifactRow = SqlSchema.void({
    Request: EvidenceArtifactRow,
    execute: (row) =>
      sql`
        INSERT INTO evidence_artifacts (
          artifact_id, schema_version, kind, sha256, byte_size,
          content_type, storage_uri, sensitivity, access,
          redacted_artifact_id, superseded_by_artifact_id, metadata_json, created_at
        )
        VALUES (
          ${row.artifactId}, ${row.schemaVersion}, ${row.kind}, ${row.sha256}, ${row.byteSize},
          ${row.contentType}, ${row.storageUri}, ${row.sensitivity}, ${row.access},
          ${row.redactedArtifactId}, ${row.supersededByArtifactId}, ${row.metadataJson},
          ${row.createdAt}
        )
        ON CONFLICT (artifact_id) DO NOTHING
      `,
  });

  const getEvidenceArtifactRow = SqlSchema.findOneOption({
    Request: GetEvidenceArtifactInput,
    Result: EvidenceArtifactRow,
    execute: ({ artifactId }) =>
      sql`
        SELECT
          artifact_id AS "artifactId",
          schema_version AS "schemaVersion",
          kind,
          sha256,
          byte_size AS "byteSize",
          content_type AS "contentType",
          storage_uri AS "storageUri",
          sensitivity,
          access,
          redacted_artifact_id AS "redactedArtifactId",
          superseded_by_artifact_id AS "supersededByArtifactId",
          metadata_json AS "metadataJson",
          created_at AS "createdAt"
        FROM evidence_artifacts
        WHERE artifact_id = ${artifactId}
      `,
  });

  const writeEvidenceArtifactContentRow = SqlSchema.void({
    Request: EvidenceArtifactContentRow,
    execute: (row) =>
      sql`
        INSERT INTO evidence_artifact_contents (
          artifact_id, content_text, created_at
        )
        VALUES (
          ${row.artifactId}, ${row.contentText}, ${row.createdAt}
        )
        ON CONFLICT (artifact_id) DO UPDATE SET
          content_text = excluded.content_text,
          created_at = excluded.created_at
      `,
  });

  const getEvidenceArtifactContentRow = SqlSchema.findOneOption({
    Request: GetEvidenceArtifactInput,
    Result: EvidenceArtifactContentRow,
    execute: ({ artifactId }) =>
      sql`
        SELECT
          artifact_id AS "artifactId",
          content_text AS "contentText",
          created_at AS "createdAt"
        FROM evidence_artifact_contents
        WHERE artifact_id = ${artifactId}
      `,
  });

  const createEvidenceBundleRow = SqlSchema.void({
    Request: EvidenceBundleRow,
    execute: (row) =>
      sql`
        INSERT INTO evidence_bundles (
          bundle_id, session_id, workflow_run_id, preview_target_id,
          task_spec_id, acceptance_criteria_id, permission_policy_id,
          browser_session_id, code_state_json, artifact_refs_json,
          event_refs_json, bundle_snapshot_json, created_at
        )
        VALUES (
          ${row.bundleId}, ${row.sessionId}, ${row.workflowRunId}, ${row.previewTargetId},
          ${row.taskSpecId}, ${row.acceptanceCriteriaId}, ${row.permissionPolicyId},
          ${row.browserSessionId}, ${row.codeStateJson}, ${row.artifactRefsJson},
          ${row.eventRefsJson}, ${row.bundleSnapshotJson}, ${row.createdAt}
        )
        ON CONFLICT (bundle_id) DO NOTHING
      `,
  });

  const getEvidenceBundleRow = SqlSchema.findOneOption({
    Request: GetEvidenceBundleInput,
    Result: EvidenceBundleRow,
    execute: ({ bundleId }) =>
      sql`
        SELECT
          bundle_id AS "bundleId",
          session_id AS "sessionId",
          workflow_run_id AS "workflowRunId",
          preview_target_id AS "previewTargetId",
          task_spec_id AS "taskSpecId",
          acceptance_criteria_id AS "acceptanceCriteriaId",
          permission_policy_id AS "permissionPolicyId",
          browser_session_id AS "browserSessionId",
          code_state_json AS "codeStateJson",
          artifact_refs_json AS "artifactRefsJson",
          event_refs_json AS "eventRefsJson",
          bundle_snapshot_json AS "bundleSnapshotJson",
          created_at AS "createdAt"
        FROM evidence_bundles
        WHERE bundle_id = ${bundleId}
      `,
  });

  const createReviewerDecisionRow = SqlSchema.void({
    Request: ReviewerDecisionRow,
    execute: (row) =>
      sql`
        INSERT INTO browser_reviewer_decisions (
          decision_id, session_id, workflow_run_id, evidence_bundle_id,
          purpose, outcome, confidence, gates_json, criteria_json, findings_json,
          unresolved_criteria_json, rework_packet_json, action_packet_json,
          user_visible_summary_ref, created_at
        )
        VALUES (
          ${row.decisionId}, ${row.sessionId}, ${row.workflowRunId}, ${row.evidenceBundleId},
          ${row.purpose}, ${row.outcome}, ${row.confidence}, ${row.gatesJson}, ${row.criteriaJson},
          ${row.findingsJson}, ${row.unresolvedCriteriaJson}, ${row.reworkPacketJson},
          ${row.actionPacketJson}, ${row.userVisibleSummaryRef}, ${row.createdAt}
        )
        ON CONFLICT (decision_id) DO NOTHING
      `,
  });

  const getReviewerDecisionRow = SqlSchema.findOneOption({
    Request: GetReviewerDecisionInput,
    Result: ReviewerDecisionRow,
    execute: ({ decisionId }) =>
      sql`
        SELECT
          decision_id AS "decisionId",
          session_id AS "sessionId",
          workflow_run_id AS "workflowRunId",
          evidence_bundle_id AS "evidenceBundleId",
          COALESCE(purpose, 'manual-review') AS purpose,
          outcome,
          confidence,
          gates_json AS "gatesJson",
          criteria_json AS "criteriaJson",
          findings_json AS "findingsJson",
          unresolved_criteria_json AS "unresolvedCriteriaJson",
          rework_packet_json AS "reworkPacketJson",
          action_packet_json AS "actionPacketJson",
          user_visible_summary_ref AS "userVisibleSummaryRef",
          created_at AS "createdAt"
        FROM browser_reviewer_decisions
        WHERE decision_id = ${decisionId}
      `,
  });

  const listReviewerDecisionRows = SqlSchema.findAll({
    Request: ListReviewerDecisionsInput,
    Result: ReviewerDecisionRow,
    execute: ({ sessionId, workflowRunId }) => {
      const hasFilter = sessionId !== undefined || workflowRunId !== undefined;
      return sql`
        SELECT
          decision_id AS "decisionId",
          session_id AS "sessionId",
          workflow_run_id AS "workflowRunId",
          evidence_bundle_id AS "evidenceBundleId",
          COALESCE(purpose, 'manual-review') AS purpose,
          outcome,
          confidence,
          gates_json AS "gatesJson",
          criteria_json AS "criteriaJson",
          findings_json AS "findingsJson",
          unresolved_criteria_json AS "unresolvedCriteriaJson",
          rework_packet_json AS "reworkPacketJson",
          action_packet_json AS "actionPacketJson",
          user_visible_summary_ref AS "userVisibleSummaryRef",
          created_at AS "createdAt"
        FROM browser_reviewer_decisions
        WHERE ${hasFilter ? 1 : 0} = 1
          AND (${sessionId ?? null} IS NULL OR session_id = ${sessionId ?? null})
          AND (${workflowRunId ?? null} IS NULL OR workflow_run_id = ${workflowRunId ?? null})
        ORDER BY created_at ASC, decision_id ASC
      `;
    },
  });

  const upsertBrowserControlStateRow = SqlSchema.void({
    Request: BrowserControlStateRow,
    execute: (row) =>
      sql`
        INSERT INTO browser_control_states (
          browser_session_id, session_id, lease_id, holder, state, reason,
          last_observation_ref, snapshot_after_release_ref, fresh_observation_required,
          desktop_client_id, updated_at
        )
        VALUES (
          ${row.browserSessionId}, ${row.sessionId}, ${row.leaseId}, ${row.holder}, ${row.state},
          ${row.reason}, ${row.lastObservationRef}, ${row.snapshotAfterReleaseRef},
          ${row.freshObservationRequired ? 1 : 0}, ${row.desktopClientId}, ${row.updatedAt}
        )
        ON CONFLICT (browser_session_id) DO UPDATE SET
          session_id = excluded.session_id,
          lease_id = excluded.lease_id,
          holder = excluded.holder,
          state = excluded.state,
          reason = excluded.reason,
          last_observation_ref = excluded.last_observation_ref,
          snapshot_after_release_ref = excluded.snapshot_after_release_ref,
          fresh_observation_required = excluded.fresh_observation_required,
          desktop_client_id = excluded.desktop_client_id,
          updated_at = excluded.updated_at
      `,
  });

  const getBrowserControlStateRow = SqlSchema.findOneOption({
    Request: GetBrowserControlStateInput,
    Result: BrowserControlStateRow,
    execute: ({ browserSessionId }) =>
      sql`
        SELECT
          browser_session_id AS "browserSessionId",
          session_id AS "sessionId",
          lease_id AS "leaseId",
          holder,
          state,
          reason,
          last_observation_ref AS "lastObservationRef",
          snapshot_after_release_ref AS "snapshotAfterReleaseRef",
          CASE WHEN fresh_observation_required = 1 THEN TRUE ELSE FALSE END AS "freshObservationRequired",
          desktop_client_id AS "desktopClientId",
          updated_at AS "updatedAt"
        FROM browser_control_states
        WHERE browser_session_id = ${browserSessionId}
      `,
  });

  const createBrowserApprovalRequestRow = SqlSchema.void({
    Request: BrowserApprovalRequestRow,
    execute: (row) =>
      sql`
        INSERT INTO browser_approval_requests (
          approval_id, browser_session_id, session_id, desktop_client_id, action_json, target_context_json,
          action_hash, reason, risk, pre_approval_observation_ref, observed_url, origin, status,
          evidence_refs_json, created_at, updated_at, expires_at, consumed_at,
          executed_action_ref, decision_reason
        )
        VALUES (
          ${row.approvalId}, ${row.browserSessionId}, ${row.sessionId}, ${row.desktopClientId},
          ${row.actionJson}, ${row.targetContextJson}, ${row.actionHash}, ${row.reason}, ${row.risk},
          ${row.preApprovalObservationRef}, ${row.observedUrl}, ${row.origin}, ${row.status},
          ${row.evidenceRefsJson}, ${row.createdAt}, ${row.updatedAt}, ${row.expiresAt},
          ${row.consumedAt}, ${row.executedActionRef}, ${row.decisionReason}
        )
        ON CONFLICT (approval_id) DO NOTHING
      `,
  });

  const getBrowserApprovalRequestRow = SqlSchema.findOneOption({
    Request: GetBrowserApprovalRequestInput,
    Result: BrowserApprovalRequestRow,
    execute: ({ approvalId }) =>
      sql`
        SELECT
          approval_id AS "approvalId",
          browser_session_id AS "browserSessionId",
          session_id AS "sessionId",
          desktop_client_id AS "desktopClientId",
          action_json AS "actionJson",
          target_context_json AS "targetContextJson",
          COALESCE(action_hash, '') AS "actionHash",
          reason,
          risk,
          pre_approval_observation_ref AS "preApprovalObservationRef",
          observed_url AS "observedUrl",
          origin,
          status,
          evidence_refs_json AS "evidenceRefsJson",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          expires_at AS "expiresAt",
          consumed_at AS "consumedAt",
          executed_action_ref AS "executedActionRef",
          decision_reason AS "decisionReason"
        FROM browser_approval_requests
        WHERE approval_id = ${approvalId}
      `,
  });

  const listBrowserApprovalRequestRows = SqlSchema.findAll({
    Request: ListBrowserApprovalRequestsInput,
    Result: BrowserApprovalRequestRow,
    execute: ({ browserSessionId, status }) =>
      sql`
        SELECT
          approval_id AS "approvalId",
          browser_session_id AS "browserSessionId",
          session_id AS "sessionId",
          desktop_client_id AS "desktopClientId",
          action_json AS "actionJson",
          target_context_json AS "targetContextJson",
          COALESCE(action_hash, '') AS "actionHash",
          reason,
          risk,
          pre_approval_observation_ref AS "preApprovalObservationRef",
          observed_url AS "observedUrl",
          origin,
          status,
          evidence_refs_json AS "evidenceRefsJson",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          expires_at AS "expiresAt",
          consumed_at AS "consumedAt",
          executed_action_ref AS "executedActionRef",
          decision_reason AS "decisionReason"
        FROM browser_approval_requests
        WHERE (${browserSessionId ?? null} IS NULL OR browser_session_id = ${browserSessionId ?? null})
          AND (${status ?? null} IS NULL OR status = ${status ?? null})
        ORDER BY created_at ASC, approval_id ASC
      `,
  });

  const updateBrowserApprovalStatusRow = SqlSchema.void({
    Request: UpdateBrowserApprovalStatusInput,
    execute: (input) =>
      sql`
        UPDATE browser_approval_requests
        SET
          status = CASE
            WHEN status = 'consumed' THEN status
            WHEN status = 'expired' AND ${input.status} = 'approved' THEN status
            ELSE ${input.status}
          END,
          updated_at = CASE
            WHEN status = 'consumed' THEN updated_at
            WHEN status = 'expired' AND ${input.status} = 'approved' THEN updated_at
            ELSE ${input.updatedAt}
          END,
          consumed_at = COALESCE(${input.consumedAt ?? null}, consumed_at),
          executed_action_ref = COALESCE(${input.executedActionRef ?? null}, executed_action_ref),
          decision_reason = CASE
            WHEN status = 'consumed' THEN decision_reason
            WHEN status = 'expired' AND ${input.status} = 'approved' THEN decision_reason
            ELSE COALESCE(${input.decisionReason ?? null}, decision_reason)
          END
        WHERE approval_id = ${input.approvalId}
      `,
  });

  const appendSessionEvent: BrowserOrchestrationEvidenceRepositoryShape["appendSessionEvent"] = (
    row,
  ) =>
    appendSessionEventRow(row).pipe(
      Effect.mapError(
        toPersistenceSqlError("BrowserOrchestrationEvidenceRepository.appendSessionEvent:query"),
      ),
    );

  const getSessionEvents: BrowserOrchestrationEvidenceRepositoryShape["getSessionEvents"] = (
    input,
  ) =>
    getSessionEventRows(input).pipe(
      Effect.mapError(
        toPersistenceSqlError("BrowserOrchestrationEvidenceRepository.getSessionEvents:query"),
      ),
    );

  const writeEvidenceArtifact: BrowserOrchestrationEvidenceRepositoryShape["writeEvidenceArtifact"] =
    (row) =>
      writeEvidenceArtifactRow(row).pipe(
        Effect.mapError(
          toPersistenceSqlError(
            "BrowserOrchestrationEvidenceRepository.writeEvidenceArtifact:query",
          ),
        ),
      );

  const getEvidenceArtifact: BrowserOrchestrationEvidenceRepositoryShape["getEvidenceArtifact"] = (
    input,
  ) =>
    getEvidenceArtifactRow(input).pipe(
      Effect.mapError(
        toPersistenceSqlError("BrowserOrchestrationEvidenceRepository.getEvidenceArtifact:query"),
      ),
    );

  const writeEvidenceArtifactContent: BrowserOrchestrationEvidenceRepositoryShape["writeEvidenceArtifactContent"] =
    (row) =>
      writeEvidenceArtifactContentRow(row).pipe(
        Effect.mapError(
          toPersistenceSqlError(
            "BrowserOrchestrationEvidenceRepository.writeEvidenceArtifactContent:query",
          ),
        ),
      );

  const getEvidenceArtifactContent: BrowserOrchestrationEvidenceRepositoryShape["getEvidenceArtifactContent"] =
    (input) =>
      getEvidenceArtifactContentRow(input).pipe(
        Effect.mapError(
          toPersistenceSqlError(
            "BrowserOrchestrationEvidenceRepository.getEvidenceArtifactContent:query",
          ),
        ),
      );

  const createEvidenceBundle: BrowserOrchestrationEvidenceRepositoryShape["createEvidenceBundle"] =
    (row) =>
      createEvidenceBundleRow(row).pipe(
        Effect.mapError(
          toPersistenceSqlError(
            "BrowserOrchestrationEvidenceRepository.createEvidenceBundle:query",
          ),
        ),
      );

  const getEvidenceBundle: BrowserOrchestrationEvidenceRepositoryShape["getEvidenceBundle"] = (
    input,
  ) =>
    getEvidenceBundleRow(input).pipe(
      Effect.mapError(
        toPersistenceSqlError("BrowserOrchestrationEvidenceRepository.getEvidenceBundle:query"),
      ),
    );

  const createReviewerDecision: BrowserOrchestrationEvidenceRepositoryShape["createReviewerDecision"] =
    (row) =>
      createReviewerDecisionRow(row).pipe(
        Effect.mapError(
          toPersistenceSqlError(
            "BrowserOrchestrationEvidenceRepository.createReviewerDecision:query",
          ),
        ),
      );

  const getReviewerDecision: BrowserOrchestrationEvidenceRepositoryShape["getReviewerDecision"] = (
    input,
  ) =>
    getReviewerDecisionRow(input).pipe(
      Effect.mapError(
        toPersistenceSqlError("BrowserOrchestrationEvidenceRepository.getReviewerDecision:query"),
      ),
    );

  const listReviewerDecisions: BrowserOrchestrationEvidenceRepositoryShape["listReviewerDecisions"] =
    (input) =>
      listReviewerDecisionRows(input).pipe(
        Effect.mapError(
          toPersistenceSqlError(
            "BrowserOrchestrationEvidenceRepository.listReviewerDecisions:query",
          ),
        ),
      );

  const upsertBrowserControlState: BrowserOrchestrationEvidenceRepositoryShape["upsertBrowserControlState"] =
    (row) =>
      upsertBrowserControlStateRow(row).pipe(
        Effect.mapError(
          toPersistenceSqlError(
            "BrowserOrchestrationEvidenceRepository.upsertBrowserControlState:query",
          ),
        ),
      );

  const getBrowserControlState: BrowserOrchestrationEvidenceRepositoryShape["getBrowserControlState"] =
    (input) =>
      getBrowserControlStateRow(input).pipe(
        Effect.map((row) =>
          Option.map(row, (value) => ({
            ...value,
            freshObservationRequired: Boolean(value.freshObservationRequired),
          })),
        ),
        Effect.mapError(
          toPersistenceSqlError(
            "BrowserOrchestrationEvidenceRepository.getBrowserControlState:query",
          ),
        ),
      );

  const createBrowserApprovalRequest: BrowserOrchestrationEvidenceRepositoryShape["createBrowserApprovalRequest"] =
    (row) =>
      createBrowserApprovalRequestRow(row).pipe(
        Effect.mapError(
          toPersistenceSqlError(
            "BrowserOrchestrationEvidenceRepository.createBrowserApprovalRequest:query",
          ),
        ),
      );

  const getBrowserApprovalRequest: BrowserOrchestrationEvidenceRepositoryShape["getBrowserApprovalRequest"] =
    (input) =>
      getBrowserApprovalRequestRow(input).pipe(
        Effect.mapError(
          toPersistenceSqlError(
            "BrowserOrchestrationEvidenceRepository.getBrowserApprovalRequest:query",
          ),
        ),
      );

  const listBrowserApprovalRequests: BrowserOrchestrationEvidenceRepositoryShape["listBrowserApprovalRequests"] =
    (input) =>
      listBrowserApprovalRequestRows(input).pipe(
        Effect.mapError(
          toPersistenceSqlError(
            "BrowserOrchestrationEvidenceRepository.listBrowserApprovalRequests:query",
          ),
        ),
      );

  const updateBrowserApprovalStatus: BrowserOrchestrationEvidenceRepositoryShape["updateBrowserApprovalStatus"] =
    (input) =>
      updateBrowserApprovalStatusRow(input).pipe(
        Effect.mapError(
          toPersistenceSqlError(
            "BrowserOrchestrationEvidenceRepository.updateBrowserApprovalStatus:query",
          ),
        ),
      );

  return {
    appendSessionEvent,
    getSessionEvents,
    writeEvidenceArtifact,
    getEvidenceArtifact,
    writeEvidenceArtifactContent,
    getEvidenceArtifactContent,
    createEvidenceBundle,
    getEvidenceBundle,
    createReviewerDecision,
    getReviewerDecision,
    listReviewerDecisions,
    upsertBrowserControlState,
    getBrowserControlState,
    createBrowserApprovalRequest,
    getBrowserApprovalRequest,
    listBrowserApprovalRequests,
    updateBrowserApprovalStatus,
  } satisfies BrowserOrchestrationEvidenceRepositoryShape;
});

export const BrowserOrchestrationEvidenceRepositoryLive = Layer.effect(
  BrowserOrchestrationEvidenceRepository,
  makeBrowserOrchestrationEvidenceRepository,
);
