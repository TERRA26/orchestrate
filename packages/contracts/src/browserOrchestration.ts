import { Schema } from "effect";

import { IsoDateTime, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas";
import { BrowserAction, BrowserSessionId } from "./browser";
import { OrchestratorRunId } from "./orchestration";

const MAX_ID_LENGTH = 128;
const MAX_URL_LENGTH = 2_048;
const MAX_TEXT_LENGTH = 16_000;
const MAX_REASON_LENGTH = 4_000;
const MAX_FILE_PATH_LENGTH = 1_024;
const MAX_ARTIFACT_URI_LENGTH = 2_048;

const EntityId = TrimmedNonEmptyString.check(Schema.isMaxLength(MAX_ID_LENGTH));
const OptionalStringArray = Schema.optional(Schema.Array(Schema.String));
const Metadata = Schema.Record(Schema.String, Schema.Unknown);

export const BrowserOrchestrationSchemaVersion = Schema.Literal("2026-04-27.v1");
export type BrowserOrchestrationSchemaVersion = typeof BrowserOrchestrationSchemaVersion.Type;
export const BROWSER_ORCHESTRATION_SCHEMA_VERSION: BrowserOrchestrationSchemaVersion =
  "2026-04-27.v1";

export const TaskSpecId = EntityId.pipe(Schema.brand("TaskSpecId"));
export type TaskSpecId = typeof TaskSpecId.Type;
export const AcceptanceCriteriaId = EntityId.pipe(Schema.brand("AcceptanceCriteriaId"));
export type AcceptanceCriteriaId = typeof AcceptanceCriteriaId.Type;
export const AcceptanceCriterionId = EntityId.pipe(Schema.brand("AcceptanceCriterionId"));
export type AcceptanceCriterionId = typeof AcceptanceCriterionId.Type;
export const PermissionPolicyId = EntityId.pipe(Schema.brand("PermissionPolicyId"));
export type PermissionPolicyId = typeof PermissionPolicyId.Type;
export const WorkflowRunId = EntityId.pipe(Schema.brand("WorkflowRunId"));
export type WorkflowRunId = typeof WorkflowRunId.Type;
export const LaunchConfigId = EntityId.pipe(Schema.brand("LaunchConfigId"));
export type LaunchConfigId = typeof LaunchConfigId.Type;
export const DevServerInstanceId = EntityId.pipe(Schema.brand("DevServerInstanceId"));
export type DevServerInstanceId = typeof DevServerInstanceId.Type;
export const PreviewTargetId = EntityId.pipe(Schema.brand("PreviewTargetId"));
export type PreviewTargetId = typeof PreviewTargetId.Type;
export const EvidenceArtifactId = EntityId.pipe(Schema.brand("EvidenceArtifactId"));
export type EvidenceArtifactId = typeof EvidenceArtifactId.Type;
const EvidenceRefs = Schema.Array(EvidenceArtifactId).check(Schema.isMinLength(1));
export const EvidenceBundleId = EntityId.pipe(Schema.brand("EvidenceBundleId"));
export type EvidenceBundleId = typeof EvidenceBundleId.Type;
export const ReviewerDecisionId = EntityId.pipe(Schema.brand("ReviewerDecisionId"));
export type ReviewerDecisionId = typeof ReviewerDecisionId.Type;
export const ReworkPacketId = EntityId.pipe(Schema.brand("ReworkPacketId"));
export type ReworkPacketId = typeof ReworkPacketId.Type;
export const HumanControlLeaseId = EntityId.pipe(Schema.brand("HumanControlLeaseId"));
export type HumanControlLeaseId = typeof HumanControlLeaseId.Type;
export const BrowserPageId = EntityId.pipe(Schema.brand("BrowserPageId"));
export type BrowserPageId = typeof BrowserPageId.Type;
export const SessionEventId = EntityId.pipe(Schema.brand("SessionEventId"));
export type SessionEventId = typeof SessionEventId.Type;

export const TaskScope = Schema.Literals([
  "code-change",
  "browser-task",
  "review-only",
  "debugging",
]);
export type TaskScope = typeof TaskScope.Type;

export const TaskSpec = Schema.Struct({
  id: TaskSpecId,
  projectId: Schema.optional(ProjectId),
  threadId: Schema.optional(ThreadId),
  runId: Schema.optional(OrchestratorRunId),
  userRequest: Schema.String.check(Schema.isMaxLength(MAX_TEXT_LENGTH)),
  scope: TaskScope,
  targetAreas: OptionalStringArray,
  constraints: OptionalStringArray,
  createdAt: IsoDateTime,
});
export type TaskSpec = typeof TaskSpec.Type;

export const PreviewViewport = Schema.Struct({
  id: EntityId,
  label: Schema.String.check(Schema.isMaxLength(128)),
  width: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(3_840)),
  height: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(2_160)),
  deviceScaleFactor: Schema.optional(
    Schema.Number.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(4)),
  ),
});
export type PreviewViewport = typeof PreviewViewport.Type;

export const RequiredCriterionEvidence = Schema.Literals([
  "screenshot",
  "dom",
  "accessibility",
  "console",
  "network",
  "page-error",
  "server-log",
  "test",
  "human-review",
]);
export type RequiredCriterionEvidence = typeof RequiredCriterionEvidence.Type;

export const AcceptanceCriterion = Schema.Struct({
  id: AcceptanceCriterionId,
  description: Schema.String.check(Schema.isMaxLength(MAX_TEXT_LENGTH)),
  requiredEvidence: Schema.Array(RequiredCriterionEvidence).check(Schema.isMinLength(1)),
  routes: Schema.optional(Schema.Array(Schema.String.check(Schema.isMaxLength(MAX_URL_LENGTH)))),
  viewports: Schema.optional(Schema.Array(PreviewViewport)),
});
export type AcceptanceCriterion = typeof AcceptanceCriterion.Type;

export const AcceptanceCriteria = Schema.Struct({
  id: AcceptanceCriteriaId,
  taskSpecId: TaskSpecId,
  criteria: Schema.Array(AcceptanceCriterion).check(Schema.isMinLength(1)),
  createdAt: IsoDateTime,
});
export type AcceptanceCriteria = typeof AcceptanceCriteria.Type;

export const ConsequentialBrowserAction = Schema.Literals([
  "authenticate",
  "submit-form",
  "send-message",
  "post-content",
  "delete-data",
  "upload-file",
  "download-file",
  "export-data",
  "purchase",
  "external-navigation",
]);
export type ConsequentialBrowserAction = typeof ConsequentialBrowserAction.Type;

export const PermissionTier = Schema.Literals([
  "isolated-local-preview",
  "approved-public",
  "authenticated-browser",
  "computer-use-fallback",
]);
export type PermissionTier = typeof PermissionTier.Type;

export const AuthMode = Schema.Literals(["none", "isolated-preview", "real-browser-extension"]);
export type AuthMode = typeof AuthMode.Type;

export const PermissionPolicy = Schema.Struct({
  id: PermissionPolicyId,
  browserMode: PermissionTier,
  allowedOrigins: Schema.Array(Schema.String.check(Schema.isMaxLength(MAX_URL_LENGTH))),
  blockedOrigins: Schema.Array(Schema.String.check(Schema.isMaxLength(MAX_URL_LENGTH))),
  allowDownloads: Schema.Boolean,
  allowClipboardRead: Schema.Boolean,
  allowClipboardWrite: Schema.Boolean,
  allowFormSubmit: Schema.Boolean,
  requireApprovalFor: Schema.Array(ConsequentialBrowserAction),
  createdAt: IsoDateTime,
});
export type PermissionPolicy = typeof PermissionPolicy.Type;

export const LaunchHealthCheck = Schema.Struct({
  path: Schema.optional(Schema.String.check(Schema.isMaxLength(MAX_URL_LENGTH))),
  url: Schema.optional(Schema.String.check(Schema.isMaxLength(MAX_URL_LENGTH))),
  timeoutMs: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(120_000)),
  expectedStatus: Schema.optional(
    Schema.Union([
      Schema.Int.check(Schema.isGreaterThanOrEqualTo(100), Schema.isLessThanOrEqualTo(599)),
      Schema.Array(
        Schema.Int.check(Schema.isGreaterThanOrEqualTo(100), Schema.isLessThanOrEqualTo(599)),
      ).check(Schema.isMinLength(1)),
    ]),
  ),
});
export type LaunchHealthCheck = typeof LaunchHealthCheck.Type;

export const LaunchReadiness = Schema.Struct({
  stdoutRegex: Schema.optional(Schema.String.check(Schema.isMaxLength(512))),
  urlProbe: Schema.optional(Schema.String.check(Schema.isMaxLength(MAX_URL_LENGTH))),
  timeoutMs: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(120_000)),
});
export type LaunchReadiness = typeof LaunchReadiness.Type;

export const LaunchConfig = Schema.Struct({
  id: LaunchConfigId,
  name: TrimmedNonEmptyString.check(Schema.isMaxLength(256)),
  cwd: TrimmedNonEmptyString.check(Schema.isMaxLength(MAX_FILE_PATH_LENGTH)),
  runtimeExecutable: TrimmedNonEmptyString.check(Schema.isMaxLength(128)),
  runtimeArgs: Schema.Array(Schema.String.check(Schema.isMaxLength(512))),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  port: Schema.optional(
    Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(65_535)),
  ),
  autoPort: Schema.optional(Schema.Boolean),
  defaultRoute: Schema.optional(Schema.String.check(Schema.isMaxLength(MAX_URL_LENGTH))),
  healthCheck: Schema.optional(LaunchHealthCheck),
  readiness: Schema.optional(LaunchReadiness),
  autoVerify: Schema.optional(Schema.Boolean),
  tags: Schema.optional(Schema.Array(Schema.String.check(Schema.isMaxLength(128)))),
});
export type LaunchConfig = typeof LaunchConfig.Type;

export const LaunchConfigFile = Schema.Struct({
  version: Schema.Literal("1.0"),
  configurations: Schema.Array(LaunchConfig).check(Schema.isMinLength(1)),
});
export type LaunchConfigFile = typeof LaunchConfigFile.Type;

export const DevServerStatus = Schema.Literals([
  "starting",
  "healthy",
  "unhealthy",
  "crashed",
  "stopping",
  "stopped",
]);
export type DevServerStatus = typeof DevServerStatus.Type;

export const DevServerFailureReason = Schema.Literals([
  "config-not-found",
  "invalid-cwd",
  "command-not-allowed",
  "port-in-use",
  "process-start-failed",
  "readiness-timeout",
  "health-check-failed",
  "process-crashed",
  "stopped-by-user",
  "stopped-by-workflow",
]);
export type DevServerFailureReason = typeof DevServerFailureReason.Type;

export const DevServerInstance = Schema.Struct({
  id: DevServerInstanceId,
  sessionId: EntityId,
  launchConfigId: LaunchConfigId,
  status: DevServerStatus,
  pid: Schema.optional(Schema.Int.check(Schema.isGreaterThan(0))),
  cwd: TrimmedNonEmptyString.check(Schema.isMaxLength(MAX_FILE_PATH_LENGTH)),
  command: Schema.Array(Schema.String.check(Schema.isMaxLength(512))).check(Schema.isMinLength(1)),
  assignedPort: Schema.optional(
    Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(65_535)),
  ),
  baseUrl: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(MAX_URL_LENGTH))),
  startedAt: IsoDateTime,
  lastHealthCheckAt: Schema.optional(IsoDateTime),
  logStreamRef: EvidenceArtifactId,
  recentErrorRefs: Schema.Array(EvidenceArtifactId),
  failureReason: Schema.optional(DevServerFailureReason),
});
export type DevServerInstance = typeof DevServerInstance.Type;

export const DevServerReady = Schema.Struct({
  instance: DevServerInstance,
  baseUrl: TrimmedNonEmptyString.check(Schema.isMaxLength(MAX_URL_LENGTH)),
  healthEvidenceRef: EvidenceArtifactId,
  logsEvidenceRef: EvidenceArtifactId,
});
export type DevServerReady = typeof DevServerReady.Type;

export const BrowserPolicyDecision = Schema.Union([
  Schema.Struct({ outcome: Schema.Literal("allow") }),
  Schema.Struct({
    outcome: Schema.Literal("deny"),
    reason: Schema.String.check(Schema.isMaxLength(MAX_REASON_LENGTH)),
  }),
  Schema.Struct({
    outcome: Schema.Literal("requires-approval"),
    approvalKind: ConsequentialBrowserAction,
    reason: Schema.String.check(Schema.isMaxLength(MAX_REASON_LENGTH)),
  }),
]);
export type BrowserPolicyDecision = typeof BrowserPolicyDecision.Type;

export const CodeStateRef = Schema.Struct({
  repoRoot: TrimmedNonEmptyString.check(Schema.isMaxLength(MAX_FILE_PATH_LENGTH)),
  baseSha: Schema.optional(EntityId),
  headSha: EntityId,
  dirtyHash: EntityId,
  changedFiles: Schema.Array(Schema.String.check(Schema.isMaxLength(MAX_FILE_PATH_LENGTH))),
  diffArtifactRef: EvidenceArtifactId,
  capturedAt: IsoDateTime,
});
export type CodeStateRef = typeof CodeStateRef.Type;

export const EvidenceSensitivity = Schema.Literals([
  "public",
  "workspace-internal",
  "may-contain-secrets",
  "authenticated-user-data",
  "credential-risk",
]);
export type EvidenceSensitivity = typeof EvidenceSensitivity.Type;

export const EvidenceAccess = Schema.Literals([
  "safe-for-user-report",
  "internal-only",
  "requires-explicit-user-open",
  "never-display-raw",
]);
export type EvidenceAccess = typeof EvidenceAccess.Type;

export const EvidenceArtifactKind = Schema.Literals([
  "screenshot",
  "screenshot-crop",
  "dom-snapshot",
  "accessibility-snapshot",
  "console-log",
  "network-log",
  "page-error-log",
  "server-log",
  "diff",
  "test-result",
  "browser-comment",
  "approval-record",
  "workflow-trace",
]);
export type EvidenceArtifactKind = typeof EvidenceArtifactKind.Type;

export const EvidenceArtifact = Schema.Struct({
  id: EvidenceArtifactId,
  schemaVersion: BrowserOrchestrationSchemaVersion,
  kind: EvidenceArtifactKind,
  sha256: EntityId,
  byteSize: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  contentType: TrimmedNonEmptyString.check(Schema.isMaxLength(255)),
  storageUri: TrimmedNonEmptyString.check(Schema.isMaxLength(MAX_ARTIFACT_URI_LENGTH)),
  sensitivity: EvidenceSensitivity,
  access: EvidenceAccess,
  redactedArtifactRef: Schema.optional(EvidenceArtifactId),
  supersededByArtifactId: Schema.optional(EvidenceArtifactId),
  metadata: Schema.optional(Metadata),
  createdAt: IsoDateTime,
});
export type EvidenceArtifact = typeof EvidenceArtifact.Type;

export const PreviewTargetKind = Schema.Literals([
  "local-dev-server",
  "file-backed",
  "public-unauthenticated",
  "authenticated-extension",
]);
export type PreviewTargetKind = typeof PreviewTargetKind.Type;

export const PreviewTarget = Schema.Struct({
  id: PreviewTargetId,
  version: Schema.Int.check(Schema.isGreaterThan(0)),
  sessionId: EntityId,
  kind: PreviewTargetKind,
  canonicalUrl: TrimmedNonEmptyString.check(Schema.isMaxLength(MAX_URL_LENGTH)),
  baseUrl: TrimmedNonEmptyString.check(Schema.isMaxLength(MAX_URL_LENGTH)),
  initialRoute: TrimmedNonEmptyString.check(Schema.isMaxLength(MAX_URL_LENGTH)),
  devServerInstanceId: Schema.optional(EntityId),
  launchConfigId: Schema.optional(EntityId),
  allowedOrigins: Schema.Array(Schema.String.check(Schema.isMaxLength(MAX_URL_LENGTH))),
  deniedOrigins: Schema.Array(Schema.String.check(Schema.isMaxLength(MAX_URL_LENGTH))),
  authMode: AuthMode,
  permissionTier: PermissionTier,
  viewports: Schema.Array(PreviewViewport).check(Schema.isMinLength(1)),
  readinessEvidenceRef: EvidenceArtifactId,
  serverLogRefs: Schema.Array(EvidenceArtifactId),
  createdAt: IsoDateTime,
  supersedesPreviewTargetId: Schema.optional(PreviewTargetId),
});
export type PreviewTarget = typeof PreviewTarget.Type;

export const BrowserRuntimeKind = Schema.Literals([
  "electron-visible",
  "playwright-headless",
  "chrome-extension",
]);
export type BrowserRuntimeKind = typeof BrowserRuntimeKind.Type;

export const BrowserWorkflowStatus = Schema.Literals([
  "created",
  "resolving-preview-target",
  "starting-browser",
  "opening-route",
  "waiting-for-app",
  "collecting-baseline",
  "acting",
  "observing",
  "verifying",
  "paused-for-human",
  "paused-for-approval",
  "completed",
  "failed",
  "cancelled",
]);
export type BrowserWorkflowStatus = typeof BrowserWorkflowStatus.Type;

export const BrowserAssertion = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("url-matches"),
    pattern: TrimmedNonEmptyString.check(Schema.isMaxLength(MAX_TEXT_LENGTH)),
  }),
  Schema.Struct({
    type: Schema.Literal("text-visible"),
    text: TrimmedNonEmptyString.check(Schema.isMaxLength(MAX_TEXT_LENGTH)),
  }),
  Schema.Struct({
    type: Schema.Literal("selector-visible"),
    selector: TrimmedNonEmptyString.check(Schema.isMaxLength(MAX_TEXT_LENGTH)),
  }),
  Schema.Struct({
    type: Schema.Literal("selector-not-visible"),
    selector: TrimmedNonEmptyString.check(Schema.isMaxLength(MAX_TEXT_LENGTH)),
  }),
  Schema.Struct({
    type: Schema.Literal("no-console-errors"),
  }),
  Schema.Struct({
    type: Schema.Literal("no-page-errors"),
  }),
  Schema.Struct({
    type: Schema.Literal("no-network-failures"),
    allowPatterns: Schema.optional(
      Schema.Array(Schema.String.check(Schema.isMaxLength(MAX_TEXT_LENGTH))),
    ),
  }),
  Schema.Struct({
    type: Schema.Literal("http-status-ok"),
    urlPattern: TrimmedNonEmptyString.check(Schema.isMaxLength(MAX_TEXT_LENGTH)),
  }),
  Schema.Struct({
    type: Schema.Literal("annotation-resolved"),
    annotationId: EntityId,
  }),
  Schema.Struct({
    type: Schema.Literal("screenshot-captured"),
    label: Schema.optional(Schema.String.check(Schema.isMaxLength(256))),
  }),
]);
export type BrowserAssertion = typeof BrowserAssertion.Type;

export const BrowserAssertionResult = Schema.Struct({
  assertion: BrowserAssertion,
  status: Schema.Literals(["pass", "fail", "not-evaluated"]),
  evidenceRefs: Schema.Array(EvidenceArtifactId),
  message: Schema.String.check(Schema.isMaxLength(MAX_REASON_LENGTH)),
});
export type BrowserAssertionResult = typeof BrowserAssertionResult.Type;

export const BrowserWorkflowRun = Schema.Struct({
  id: WorkflowRunId,
  sessionId: EntityId,
  previewTargetId: PreviewTargetId,
  taskSpecId: TaskSpecId,
  acceptanceCriteriaId: AcceptanceCriteriaId,
  permissionPolicyId: PermissionPolicyId,
  browserSessionId: Schema.optional(BrowserSessionId),
  status: BrowserWorkflowStatus,
  routes: Schema.Array(Schema.String.check(Schema.isMaxLength(MAX_URL_LENGTH))).check(
    Schema.isMinLength(1),
  ),
  viewports: Schema.Array(PreviewViewport).check(Schema.isMinLength(1)),
  retryBudget: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  evidenceBundleId: Schema.optional(EvidenceBundleId),
});
export type BrowserWorkflowRun = typeof BrowserWorkflowRun.Type;

export const BrowserObservationArtifactRefs = Schema.Struct({
  screenshot: Schema.optional(EvidenceArtifactId),
  domSnapshot: Schema.optional(EvidenceArtifactId),
  accessibilitySnapshot: Schema.optional(EvidenceArtifactId),
  consoleLog: Schema.optional(EvidenceArtifactId),
  networkLog: Schema.optional(EvidenceArtifactId),
  pageErrors: Schema.optional(EvidenceArtifactId),
});
export type BrowserObservationArtifactRefs = typeof BrowserObservationArtifactRefs.Type;

export const BrowserSnapshot = Schema.Struct({
  id: EntityId,
  runtimeKind: BrowserRuntimeKind,
  permissionTier: PermissionTier,
  previewTargetId: PreviewTargetId,
  browserSessionId: BrowserSessionId,
  pageId: BrowserPageId,
  url: TrimmedNonEmptyString.check(Schema.isMaxLength(MAX_URL_LENGTH)),
  title: Schema.String.check(Schema.isMaxLength(512)),
  viewport: Schema.Struct({
    width: Schema.Int.check(Schema.isGreaterThan(0)),
    height: Schema.Int.check(Schema.isGreaterThan(0)),
    deviceScaleFactor: Schema.Number.check(Schema.isGreaterThan(0)),
  }),
  scroll: Schema.Struct({
    x: Schema.Number,
    y: Schema.Number,
  }),
  artifactRefs: BrowserObservationArtifactRefs,
  summary: Schema.Struct({
    visibleText: Schema.Array(Schema.String.check(Schema.isMaxLength(1_000))),
    consoleErrorCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    networkFailureCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    pageErrorCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  }),
  capturedAt: IsoDateTime,
});
export type BrowserSnapshot = typeof BrowserSnapshot.Type;

export const HumanControlLease = Schema.Struct({
  id: HumanControlLeaseId,
  browserSessionId: BrowserSessionId,
  holder: Schema.Literals(["agent", "human", "none"]),
  mode: Schema.Literal("exclusive"),
  acquiredAt: IsoDateTime,
  releasedAt: Schema.optional(IsoDateTime),
  reason: Schema.Literals([
    "user-takeover",
    "agent-action",
    "approval-needed",
    "login-needed",
    "captcha-needed",
    "sensitive-action",
  ]),
  lastSnapshotBeforeAcquireRef: Schema.optional(EvidenceArtifactId),
  requiredSnapshotAfterRelease: Schema.Boolean,
  snapshotAfterReleaseRef: Schema.optional(EvidenceArtifactId),
});
export type HumanControlLease = typeof HumanControlLease.Type;

export const BrowserControlAcquireInput = Schema.Struct({
  browserSessionId: BrowserSessionId,
  requestedBy: Schema.Literals(["agent", "human"]),
  reason: Schema.Literals([
    "user-takeover",
    "agent-action",
    "approval-needed",
    "login-needed",
    "captcha-needed",
    "sensitive-action",
  ]),
  lastSnapshotBeforeAcquireRef: Schema.optional(EvidenceArtifactId),
});
export type BrowserControlAcquireInput = typeof BrowserControlAcquireInput.Type;

export const BrowserControlReleaseInput = Schema.Struct({
  browserSessionId: BrowserSessionId,
  leaseId: HumanControlLeaseId,
  snapshotAfterReleaseRef: Schema.optional(EvidenceArtifactId),
});
export type BrowserControlReleaseInput = typeof BrowserControlReleaseInput.Type;

export const BrowserControlLeaseResult = Schema.Struct({
  lease: HumanControlLease,
});
export type BrowserControlLeaseResult = typeof BrowserControlLeaseResult.Type;

export const EvidenceBundle = Schema.Struct({
  id: EvidenceBundleId,
  sessionId: EntityId,
  workflowRunId: WorkflowRunId,
  previewTargetId: PreviewTargetId,
  taskSpecId: TaskSpecId,
  acceptanceCriteriaId: AcceptanceCriteriaId,
  permissionPolicyId: PermissionPolicyId,
  browserSessionId: BrowserSessionId,
  codeState: CodeStateRef,
  artifactRefs: Schema.Array(EvidenceArtifactId),
  eventRefs: Schema.Array(SessionEventId),
  createdAt: IsoDateTime,
});
export type EvidenceBundle = typeof EvidenceBundle.Type;

const EvidenceBackedCriterionResult = Schema.Struct({
  criterionId: AcceptanceCriterionId,
  status: Schema.Literals(["pass", "fail", "warning", "not-evaluated"]),
  evidenceRefs: EvidenceRefs,
  reason: Schema.String.check(Schema.isMaxLength(MAX_REASON_LENGTH)),
});

const NotApplicableCriterionResult = Schema.Struct({
  criterionId: AcceptanceCriterionId,
  status: Schema.Literal("not-applicable"),
  evidenceRefs: Schema.optional(Schema.Array(EvidenceArtifactId)),
  reason: TrimmedNonEmptyString.check(Schema.isMaxLength(MAX_REASON_LENGTH)),
});

const WaivedCriterionResult = Schema.Struct({
  criterionId: AcceptanceCriterionId,
  status: Schema.Literal("waived-by-user"),
  evidenceRefs: Schema.optional(Schema.Array(EvidenceArtifactId)),
  approvalRef: EvidenceArtifactId,
  reason: TrimmedNonEmptyString.check(Schema.isMaxLength(MAX_REASON_LENGTH)),
});

export const AcceptanceCriterionResult = Schema.Union([
  EvidenceBackedCriterionResult,
  NotApplicableCriterionResult,
  WaivedCriterionResult,
]);
export type AcceptanceCriterionResult = typeof AcceptanceCriterionResult.Type;

export const ReviewerOutcome = Schema.Literals([
  "accepted",
  "accepted-with-notes",
  "rework-required",
  "needs-human-review",
  "blocked",
  "inconclusive",
]);
export type ReviewerOutcome = typeof ReviewerOutcome.Type;

export const ReviewerFinding = Schema.Struct({
  severity: Schema.Literals(["blocker", "major", "minor", "note"]),
  title: Schema.String.check(Schema.isMaxLength(512)),
  description: Schema.String.check(Schema.isMaxLength(MAX_TEXT_LENGTH)),
  evidenceRefs: EvidenceRefs,
  suggestedAction: Schema.optional(Schema.String.check(Schema.isMaxLength(MAX_TEXT_LENGTH))),
});
export type ReviewerFinding = typeof ReviewerFinding.Type;

export const ReworkPacket = Schema.Struct({
  id: ReworkPacketId,
  decisionId: ReviewerDecisionId,
  reason: Schema.String.check(Schema.isMaxLength(MAX_REASON_LENGTH)),
  blockingFindings: Schema.Array(ReviewerFinding),
  focusedRoutes: Schema.Array(Schema.String.check(Schema.isMaxLength(MAX_URL_LENGTH))),
  focusedViewports: Schema.Array(PreviewViewport),
  relevantEvidenceRefs: Schema.Array(EvidenceArtifactId),
  relevantCommentRefs: Schema.Array(EvidenceArtifactId),
  relevantDiffRefs: Schema.Array(EvidenceArtifactId),
  recommendedNextActions: Schema.Array(Schema.String.check(Schema.isMaxLength(MAX_TEXT_LENGTH))),
  maxReworkAttemptsRemaining: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export type ReworkPacket = typeof ReworkPacket.Type;

export const ReviewerDecision = Schema.Struct({
  id: ReviewerDecisionId,
  sessionId: EntityId,
  workflowRunId: WorkflowRunId,
  evidenceBundleId: EvidenceBundleId,
  outcome: ReviewerOutcome,
  confidence: Schema.Literals(["high", "medium", "low"]),
  criteria: Schema.Array(AcceptanceCriterionResult).check(Schema.isMinLength(1)),
  findings: Schema.Array(ReviewerFinding),
  unresolvedCriteria: Schema.Array(AcceptanceCriterionId),
  reworkPacket: Schema.optional(ReworkPacket),
  userVisibleSummaryRef: EvidenceArtifactId,
  createdAt: IsoDateTime,
});
export type ReviewerDecision = typeof ReviewerDecision.Type;

export const SessionEventActor = Schema.Literals(["system", "agent", "human", "reviewer"]);
export type SessionEventActor = typeof SessionEventActor.Type;

export const SessionEvent = Schema.Struct({
  id: SessionEventId,
  sessionId: EntityId,
  workflowRunId: Schema.optional(WorkflowRunId),
  type: Schema.Literals([
    "TaskSpecCreated",
    "AcceptanceCriteriaCreated",
    "PermissionPolicySelected",
    "LaunchConfigDetected",
    "DevServerStartRequested",
    "DevServerStarted",
    "DevServerHealthPassed",
    "DevServerHealthFailed",
    "PreviewTargetCreated",
    "BrowserSessionCreated",
    "BrowserPageOpened",
    "BrowserSnapshotCaptured",
    "BrowserToolCallStarted",
    "BrowserToolCallCompleted",
    "BrowserToolCallFailed",
    "HumanControlAcquired",
    "HumanControlReleased",
    "BrowserCommentCreated",
    "EvidenceBundleCreated",
    "ReviewerDecisionCreated",
    "UserAccepted",
    "UserRequestedRework",
  ]),
  actor: SessionEventActor,
  artifactRefs: Schema.Array(EvidenceArtifactId),
  payload: Metadata,
  occurredAt: IsoDateTime,
});
export type SessionEvent = typeof SessionEvent.Type;

export const BrowserRuntimeOpenSessionInput = Schema.Struct({
  previewTargetId: PreviewTargetId,
  runtimeKind: BrowserRuntimeKind,
});
export type BrowserRuntimeOpenSessionInput = typeof BrowserRuntimeOpenSessionInput.Type;

export const BrowserRuntimeObserveInput = Schema.Struct({
  browserSessionId: BrowserSessionId,
  include: Schema.optional(Schema.Array(EvidenceArtifactKind)),
});
export type BrowserRuntimeObserveInput = typeof BrowserRuntimeObserveInput.Type;

export const BrowserRuntimeActInput = Schema.Struct({
  browserSessionId: BrowserSessionId,
  action: BrowserAction,
});
export type BrowserRuntimeActInput = typeof BrowserRuntimeActInput.Type;
