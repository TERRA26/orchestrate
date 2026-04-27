import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  BrowserOrchestrationEvidenceRepository,
  type BrowserOrchestrationEvidenceRepositoryShape,
  BrowserSessionEventRow,
  EvidenceArtifactRow,
  EvidenceBundleRow,
  GetEvidenceArtifactInput,
  GetEvidenceBundleInput,
  GetReviewerDecisionInput,
  GetSessionEventsInput,
  ReviewerDecisionRow,
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

  const createEvidenceBundleRow = SqlSchema.void({
    Request: EvidenceBundleRow,
    execute: (row) =>
      sql`
        INSERT INTO evidence_bundles (
          bundle_id, session_id, workflow_run_id, preview_target_id,
          task_spec_id, acceptance_criteria_id, permission_policy_id,
          browser_session_id, code_state_json, artifact_refs_json,
          event_refs_json, created_at
        )
        VALUES (
          ${row.bundleId}, ${row.sessionId}, ${row.workflowRunId}, ${row.previewTargetId},
          ${row.taskSpecId}, ${row.acceptanceCriteriaId}, ${row.permissionPolicyId},
          ${row.browserSessionId}, ${row.codeStateJson}, ${row.artifactRefsJson},
          ${row.eventRefsJson}, ${row.createdAt}
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
          outcome, confidence, criteria_json, findings_json,
          unresolved_criteria_json, rework_packet_json, user_visible_summary_ref, created_at
        )
        VALUES (
          ${row.decisionId}, ${row.sessionId}, ${row.workflowRunId}, ${row.evidenceBundleId},
          ${row.outcome}, ${row.confidence}, ${row.criteriaJson}, ${row.findingsJson},
          ${row.unresolvedCriteriaJson}, ${row.reworkPacketJson}, ${row.userVisibleSummaryRef},
          ${row.createdAt}
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
          outcome,
          confidence,
          criteria_json AS "criteriaJson",
          findings_json AS "findingsJson",
          unresolved_criteria_json AS "unresolvedCriteriaJson",
          rework_packet_json AS "reworkPacketJson",
          user_visible_summary_ref AS "userVisibleSummaryRef",
          created_at AS "createdAt"
        FROM browser_reviewer_decisions
        WHERE decision_id = ${decisionId}
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

  return {
    appendSessionEvent,
    getSessionEvents,
    writeEvidenceArtifact,
    getEvidenceArtifact,
    createEvidenceBundle,
    getEvidenceBundle,
    createReviewerDecision,
    getReviewerDecision,
  } satisfies BrowserOrchestrationEvidenceRepositoryShape;
});

export const BrowserOrchestrationEvidenceRepositoryLive = Layer.effect(
  BrowserOrchestrationEvidenceRepository,
  makeBrowserOrchestrationEvidenceRepository,
);
