import { Option, Schema, SchemaIssue, Struct } from "effect";
import { ClaudeModelOptions, CodexModelOptions } from "./model";
import { ProviderMentionReference, ProviderSkillReference } from "./providerDiscovery";
import {
  ApprovalRequestId,
  CheckpointRef,
  CommandId,
  EventId,
  EvidenceArtifactId,
  IsoDateTime,
  MessageId,
  NonNegativeInt,
  ProjectId,
  ProviderItemId,
  ThreadId,
  TrimmedNonEmptyString,
  TurnId,
} from "./baseSchemas";
import { SafeFilePath } from "./safeFilePath";

export const ORCHESTRATION_WS_METHODS = {
  getSnapshot: "orchestration.getSnapshot",
  dispatchCommand: "orchestration.dispatchCommand",
  getTurnDiff: "orchestration.getTurnDiff",
  getFullThreadDiff: "orchestration.getFullThreadDiff",
  replayEvents: "orchestration.replayEvents",
} as const;

export const ORCHESTRATION_WS_CHANNELS = {
  domainEvent: "orchestration.domainEvent",
  uiDirective: "orchestration.uiDirective",
} as const;

export const ProviderKind = Schema.Literals(["codex", "claudeAgent"]);
export type ProviderKind = typeof ProviderKind.Type;
export const ProviderApprovalPolicy = Schema.Literals([
  "untrusted",
  "on-failure",
  "on-request",
  "never",
]);
export type ProviderApprovalPolicy = typeof ProviderApprovalPolicy.Type;
export const ProviderSandboxMode = Schema.Literals([
  "read-only",
  "workspace-write",
  "danger-full-access",
]);
export type ProviderSandboxMode = typeof ProviderSandboxMode.Type;
export const DEFAULT_PROVIDER_KIND: ProviderKind = "codex";

export const CodexModelSelection = Schema.Struct({
  provider: Schema.Literal("codex"),
  model: TrimmedNonEmptyString,
  options: Schema.optional(CodexModelOptions),
});
export type CodexModelSelection = typeof CodexModelSelection.Type;

export const ClaudeModelSelection = Schema.Struct({
  provider: Schema.Literal("claudeAgent"),
  model: TrimmedNonEmptyString,
  options: Schema.optional(ClaudeModelOptions),
});
export type ClaudeModelSelection = typeof ClaudeModelSelection.Type;

export const ModelSelection = Schema.Union([CodexModelSelection, ClaudeModelSelection]);
export type ModelSelection = typeof ModelSelection.Type;

export const CodexProviderStartOptions = Schema.Struct({
  binaryPath: Schema.optional(TrimmedNonEmptyString),
  homePath: Schema.optional(TrimmedNonEmptyString),
});

export const ClaudeProviderStartOptions = Schema.Struct({
  binaryPath: Schema.optional(TrimmedNonEmptyString),
  permissionMode: Schema.optional(TrimmedNonEmptyString),
  maxThinkingTokens: Schema.optional(NonNegativeInt),
});

export const ProviderStartOptions = Schema.Struct({
  codex: Schema.optional(CodexProviderStartOptions),
  claudeAgent: Schema.optional(ClaudeProviderStartOptions),
});
export type ProviderStartOptions = typeof ProviderStartOptions.Type;

export const RuntimeMode = Schema.Literals(["approval-required", "full-access"]);
export type RuntimeMode = typeof RuntimeMode.Type;
export const DEFAULT_RUNTIME_MODE: RuntimeMode = "full-access";
export const ProviderInteractionMode = Schema.Literals(["default", "plan"]);
export type ProviderInteractionMode = typeof ProviderInteractionMode.Type;
export const DEFAULT_PROVIDER_INTERACTION_MODE: ProviderInteractionMode = "default";
export const ProviderRequestKind = Schema.Literals(["command", "file-read", "file-change"]);
export type ProviderRequestKind = typeof ProviderRequestKind.Type;
export const AssistantDeliveryMode = Schema.Literals(["buffered", "streaming"]);
export type AssistantDeliveryMode = typeof AssistantDeliveryMode.Type;
// Queue is the default "send message" behavior; steer is an urgent redirect.
export const TurnDispatchMode = Schema.Literals(["queue", "steer"]);
export type TurnDispatchMode = typeof TurnDispatchMode.Type;
export const DEFAULT_TURN_DISPATCH_MODE: TurnDispatchMode = "queue";
export const ProviderReviewTarget = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("uncommittedChanges"),
  }),
  Schema.Struct({
    type: Schema.Literal("baseBranch"),
    branch: TrimmedNonEmptyString,
  }),
]);
export type ProviderReviewTarget = typeof ProviderReviewTarget.Type;
export const ProviderApprovalDecision = Schema.Literals([
  "accept",
  "acceptForSession",
  "decline",
  "cancel",
]);
export type ProviderApprovalDecision = typeof ProviderApprovalDecision.Type;
export const ProviderUserInputAnswers = Schema.Record(Schema.String, Schema.Unknown);
export type ProviderUserInputAnswers = typeof ProviderUserInputAnswers.Type;
export const ThreadHandoffBootstrapStatus = Schema.Literals(["pending", "completed"]);
export type ThreadHandoffBootstrapStatus = typeof ThreadHandoffBootstrapStatus.Type;
export const ThreadEnvironmentMode = Schema.Literals(["local", "worktree"]);
export type ThreadEnvironmentMode = typeof ThreadEnvironmentMode.Type;

export const OrchestrationMessageSource = Schema.Literals([
  "native",
  "handoff-import",
  "fork-import",
]);
export type OrchestrationMessageSource = typeof OrchestrationMessageSource.Type;

export const PROVIDER_SEND_TURN_MAX_INPUT_CHARS = 120_000;
export const PROVIDER_SEND_TURN_MAX_ATTACHMENTS = 8;
export const PROVIDER_SEND_TURN_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const PROVIDER_SEND_TURN_MAX_IMAGE_DATA_URL_CHARS = 14_000_000;
const CHAT_ATTACHMENT_ID_MAX_CHARS = 128;
// Correlation id is command id by design in this model.
export const CorrelationId = CommandId;
export type CorrelationId = typeof CorrelationId.Type;

const ChatAttachmentId = TrimmedNonEmptyString.check(
  Schema.isMaxLength(CHAT_ATTACHMENT_ID_MAX_CHARS),
  Schema.isPattern(/^[a-z0-9_-]+$/i),
);
export type ChatAttachmentId = typeof ChatAttachmentId.Type;

export const ChatImageAttachment = Schema.Struct({
  type: Schema.Literal("image"),
  id: ChatAttachmentId,
  name: TrimmedNonEmptyString.check(Schema.isMaxLength(255)),
  mimeType: TrimmedNonEmptyString.check(Schema.isMaxLength(100), Schema.isPattern(/^image\//i)),
  sizeBytes: NonNegativeInt.check(Schema.isLessThanOrEqualTo(PROVIDER_SEND_TURN_MAX_IMAGE_BYTES)),
});
export type ChatImageAttachment = typeof ChatImageAttachment.Type;

const UploadChatImageAttachment = Schema.Struct({
  type: Schema.Literal("image"),
  name: TrimmedNonEmptyString.check(Schema.isMaxLength(255)),
  mimeType: TrimmedNonEmptyString.check(Schema.isMaxLength(100), Schema.isPattern(/^image\//i)),
  sizeBytes: NonNegativeInt.check(Schema.isLessThanOrEqualTo(PROVIDER_SEND_TURN_MAX_IMAGE_BYTES)),
  dataUrl: TrimmedNonEmptyString.check(
    Schema.isMaxLength(PROVIDER_SEND_TURN_MAX_IMAGE_DATA_URL_CHARS),
  ),
});
export type UploadChatImageAttachment = typeof UploadChatImageAttachment.Type;

export const ChatAttachment = Schema.Union([ChatImageAttachment]);
export type ChatAttachment = typeof ChatAttachment.Type;
const UploadChatAttachment = Schema.Union([UploadChatImageAttachment]);
export type UploadChatAttachment = typeof UploadChatAttachment.Type;

export const ProjectScriptIcon = Schema.Literals([
  "play",
  "test",
  "lint",
  "configure",
  "build",
  "debug",
]);
export type ProjectScriptIcon = typeof ProjectScriptIcon.Type;

export const ProjectScript = Schema.Struct({
  id: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  command: TrimmedNonEmptyString,
  icon: ProjectScriptIcon,
  runOnWorktreeCreate: Schema.Boolean,
});
export type ProjectScript = typeof ProjectScript.Type;

export const OrchestrationProject = Schema.Struct({
  id: ProjectId,
  title: TrimmedNonEmptyString,
  workspaceRoot: TrimmedNonEmptyString,
  defaultModelSelection: Schema.NullOr(ModelSelection),
  scripts: Schema.Array(ProjectScript),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  deletedAt: Schema.NullOr(IsoDateTime),
});
export type OrchestrationProject = typeof OrchestrationProject.Type;

export const OrchestrationMessageRole = Schema.Literals(["user", "assistant", "system"]);
export type OrchestrationMessageRole = typeof OrchestrationMessageRole.Type;

export const OrchestrationMessage = Schema.Struct({
  id: MessageId,
  role: OrchestrationMessageRole,
  text: Schema.String,
  attachments: Schema.optional(Schema.Array(ChatAttachment)),
  skills: Schema.optional(Schema.Array(ProviderSkillReference)),
  mentions: Schema.optional(Schema.Array(ProviderMentionReference)),
  turnId: Schema.NullOr(TurnId),
  streaming: Schema.Boolean,
  source: OrchestrationMessageSource.pipe(Schema.withDecodingDefault(() => "native")),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type OrchestrationMessage = typeof OrchestrationMessage.Type;

export const ThreadHandoff = Schema.Struct({
  sourceThreadId: ThreadId,
  sourceProvider: ProviderKind,
  importedAt: IsoDateTime,
  bootstrapStatus: ThreadHandoffBootstrapStatus,
});
export type ThreadHandoff = typeof ThreadHandoff.Type;

export const OrchestrationProposedPlanId = TrimmedNonEmptyString;
export type OrchestrationProposedPlanId = typeof OrchestrationProposedPlanId.Type;

export const OrchestrationProposedPlan = Schema.Struct({
  id: OrchestrationProposedPlanId,
  turnId: Schema.NullOr(TurnId),
  planMarkdown: TrimmedNonEmptyString,
  implementedAt: Schema.NullOr(IsoDateTime).pipe(Schema.withDecodingDefault(() => null)),
  implementationThreadId: Schema.NullOr(ThreadId).pipe(Schema.withDecodingDefault(() => null)),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type OrchestrationProposedPlan = typeof OrchestrationProposedPlan.Type;

const SourceProposedPlanReference = Schema.Struct({
  threadId: ThreadId,
  planId: OrchestrationProposedPlanId,
});

export const OrchestrationSessionStatus = Schema.Literals([
  "idle",
  "starting",
  "running",
  "ready",
  "interrupted",
  "stopped",
  "error",
]);
export type OrchestrationSessionStatus = typeof OrchestrationSessionStatus.Type;

export const OrchestrationSession = Schema.Struct({
  threadId: ThreadId,
  status: OrchestrationSessionStatus,
  providerName: Schema.NullOr(TrimmedNonEmptyString),
  runtimeMode: RuntimeMode.pipe(Schema.withDecodingDefault(() => DEFAULT_RUNTIME_MODE)),
  activeTurnId: Schema.NullOr(TurnId),
  lastError: Schema.NullOr(TrimmedNonEmptyString),
  updatedAt: IsoDateTime,
});
export type OrchestrationSession = typeof OrchestrationSession.Type;

export const OrchestrationCheckpointFile = Schema.Struct({
  path: TrimmedNonEmptyString,
  kind: TrimmedNonEmptyString,
  additions: NonNegativeInt,
  deletions: NonNegativeInt,
});
export type OrchestrationCheckpointFile = typeof OrchestrationCheckpointFile.Type;

export const OrchestrationCheckpointStatus = Schema.Literals(["ready", "missing", "error"]);
export type OrchestrationCheckpointStatus = typeof OrchestrationCheckpointStatus.Type;

export const OrchestrationCheckpointSummary = Schema.Struct({
  turnId: TurnId,
  checkpointTurnCount: NonNegativeInt,
  checkpointRef: CheckpointRef,
  status: OrchestrationCheckpointStatus,
  files: Schema.Array(OrchestrationCheckpointFile),
  assistantMessageId: Schema.NullOr(MessageId),
  completedAt: IsoDateTime,
});
export type OrchestrationCheckpointSummary = typeof OrchestrationCheckpointSummary.Type;

export const OrchestrationThreadActivityTone = Schema.Literals([
  "info",
  "tool",
  "approval",
  "error",
]);
export type OrchestrationThreadActivityTone = typeof OrchestrationThreadActivityTone.Type;

export const OrchestrationThreadActivity = Schema.Struct({
  id: EventId,
  tone: OrchestrationThreadActivityTone,
  kind: TrimmedNonEmptyString,
  summary: TrimmedNonEmptyString,
  payload: Schema.Unknown,
  turnId: Schema.NullOr(TurnId),
  sequence: Schema.optional(NonNegativeInt),
  createdAt: IsoDateTime,
});
export type OrchestrationThreadActivity = typeof OrchestrationThreadActivity.Type;

const OrchestrationLatestTurnState = Schema.Literals([
  "running",
  "interrupted",
  "completed",
  "error",
]);
export type OrchestrationLatestTurnState = typeof OrchestrationLatestTurnState.Type;

export const OrchestrationLatestTurn = Schema.Struct({
  turnId: TurnId,
  state: OrchestrationLatestTurnState,
  requestedAt: IsoDateTime,
  startedAt: Schema.NullOr(IsoDateTime),
  completedAt: Schema.NullOr(IsoDateTime),
  assistantMessageId: Schema.NullOr(MessageId),
  sourceProposedPlan: Schema.optional(SourceProposedPlanReference),
});
export type OrchestrationLatestTurn = typeof OrchestrationLatestTurn.Type;

export const ThreadType = Schema.Literals(["orchestrator", "agent"]);
export type ThreadType = typeof ThreadType.Type;

export const OrchestrationThread = Schema.Struct({
  id: ThreadId,
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  threadType: Schema.optional(ThreadType).pipe(
    Schema.withDecodingDefault(() => "orchestrator" as const),
  ),
  parentThreadId: Schema.optional(Schema.NullOr(ThreadId)).pipe(
    Schema.withDecodingDefault(() => null),
  ),
  modelSelection: ModelSelection,
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode.pipe(
    Schema.withDecodingDefault(() => DEFAULT_PROVIDER_INTERACTION_MODE),
  ),
  envMode: Schema.optional(ThreadEnvironmentMode).pipe(Schema.withDecodingDefault(() => "local")),
  branch: Schema.NullOr(TrimmedNonEmptyString),
  worktreePath: Schema.NullOr(TrimmedNonEmptyString),
  associatedWorktreePath: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)).pipe(
    Schema.withDecodingDefault(() => null),
  ),
  associatedWorktreeBranch: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)).pipe(
    Schema.withDecodingDefault(() => null),
  ),
  associatedWorktreeRef: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)).pipe(
    Schema.withDecodingDefault(() => null),
  ),
  forkSourceThreadId: Schema.optional(Schema.NullOr(ThreadId)).pipe(
    Schema.withDecodingDefault(() => null),
  ),
  latestTurn: Schema.NullOr(OrchestrationLatestTurn),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  deletedAt: Schema.NullOr(IsoDateTime),
  archivedAt: Schema.NullOr(IsoDateTime).pipe(Schema.withDecodingDefault(() => null)),
  handoff: Schema.NullOr(ThreadHandoff).pipe(Schema.withDecodingDefault(() => null)),
  messages: Schema.Array(OrchestrationMessage),
  proposedPlans: Schema.Array(OrchestrationProposedPlan).pipe(Schema.withDecodingDefault(() => [])),
  activities: Schema.Array(OrchestrationThreadActivity),
  checkpoints: Schema.Array(OrchestrationCheckpointSummary),
  session: Schema.NullOr(OrchestrationSession),
});
export type OrchestrationThread = typeof OrchestrationThread.Type;

export const OrchestrationReadModel = Schema.Struct({
  snapshotSequence: NonNegativeInt,
  projects: Schema.Array(OrchestrationProject),
  threads: Schema.Array(OrchestrationThread),
  orchestratorRuns: Schema.optional(Schema.Array(Schema.suspend(() => OrchestratorRun))).pipe(
    Schema.withDecodingDefault(() => []),
  ),
  orchestratorTasks: Schema.optional(Schema.Array(Schema.suspend(() => OrchestratorTask))).pipe(
    Schema.withDecodingDefault(() => []),
  ),
  orchestratorWorkers: Schema.optional(Schema.Array(Schema.suspend(() => OrchestratorWorker))).pipe(
    Schema.withDecodingDefault(() => []),
  ),
  orchestratorMessages: Schema.optional(
    Schema.Array(Schema.suspend(() => OrchestratorInterWorkerMessage)),
  ).pipe(Schema.withDecodingDefault(() => [])),
  orchestratorDependencies: Schema.optional(
    Schema.Array(Schema.suspend(() => OrchestratorDependency)),
  ).pipe(Schema.withDecodingDefault(() => [])),
  updatedAt: IsoDateTime,
});
export type OrchestrationReadModel = typeof OrchestrationReadModel.Type;

export const ProjectCreateCommand = Schema.Struct({
  type: Schema.Literal("project.create"),
  commandId: CommandId,
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  workspaceRoot: TrimmedNonEmptyString,
  defaultModelSelection: Schema.optional(Schema.NullOr(ModelSelection)),
  createdAt: IsoDateTime,
});

const ProjectMetaUpdateCommand = Schema.Struct({
  type: Schema.Literal("project.meta.update"),
  commandId: CommandId,
  projectId: ProjectId,
  title: Schema.optional(TrimmedNonEmptyString),
  workspaceRoot: Schema.optional(TrimmedNonEmptyString),
  defaultModelSelection: Schema.optional(Schema.NullOr(ModelSelection)),
  scripts: Schema.optional(Schema.Array(ProjectScript)),
});

const ProjectDeleteCommand = Schema.Struct({
  type: Schema.Literal("project.delete"),
  commandId: CommandId,
  projectId: ProjectId,
});

const ThreadCreateCommand = Schema.Struct({
  type: Schema.Literal("thread.create"),
  commandId: CommandId,
  threadId: ThreadId,
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  modelSelection: ModelSelection,
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode.pipe(
    Schema.withDecodingDefault(() => DEFAULT_PROVIDER_INTERACTION_MODE),
  ),
  threadType: Schema.optional(ThreadType).pipe(
    Schema.withDecodingDefault(() => "orchestrator" as const),
  ),
  parentThreadId: Schema.optional(Schema.NullOr(ThreadId)),
  envMode: Schema.optional(ThreadEnvironmentMode).pipe(Schema.withDecodingDefault(() => "local")),
  branch: Schema.NullOr(TrimmedNonEmptyString),
  worktreePath: Schema.NullOr(TrimmedNonEmptyString),
  associatedWorktreePath: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  associatedWorktreeBranch: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  associatedWorktreeRef: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  createdAt: IsoDateTime,
});

export const ThreadHandoffImportedMessage = Schema.Struct({
  messageId: MessageId,
  role: Schema.Literals(["user", "assistant"]),
  text: Schema.String,
  attachments: Schema.optional(Schema.Array(ChatAttachment)),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ThreadHandoffImportedMessage = typeof ThreadHandoffImportedMessage.Type;

const ThreadHandoffCreateCommand = Schema.Struct({
  type: Schema.Literal("thread.handoff.create"),
  commandId: CommandId,
  threadId: ThreadId,
  sourceThreadId: ThreadId,
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  modelSelection: ModelSelection,
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode.pipe(
    Schema.withDecodingDefault(() => DEFAULT_PROVIDER_INTERACTION_MODE),
  ),
  envMode: Schema.optional(ThreadEnvironmentMode).pipe(Schema.withDecodingDefault(() => "local")),
  branch: Schema.NullOr(TrimmedNonEmptyString),
  worktreePath: Schema.NullOr(TrimmedNonEmptyString),
  associatedWorktreePath: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  associatedWorktreeBranch: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  associatedWorktreeRef: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  importedMessages: Schema.Array(ThreadHandoffImportedMessage),
  createdAt: IsoDateTime,
});

const ThreadForkCreateCommand = Schema.Struct({
  type: Schema.Literal("thread.fork.create"),
  commandId: CommandId,
  threadId: ThreadId,
  sourceThreadId: ThreadId,
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  modelSelection: ModelSelection,
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode.pipe(
    Schema.withDecodingDefault(() => DEFAULT_PROVIDER_INTERACTION_MODE),
  ),
  envMode: Schema.optional(ThreadEnvironmentMode).pipe(Schema.withDecodingDefault(() => "local")),
  branch: Schema.NullOr(TrimmedNonEmptyString),
  worktreePath: Schema.NullOr(TrimmedNonEmptyString),
  associatedWorktreePath: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  associatedWorktreeBranch: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  associatedWorktreeRef: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  importedMessages: Schema.Array(ThreadHandoffImportedMessage),
  createdAt: IsoDateTime,
});

const ThreadDeleteCommand = Schema.Struct({
  type: Schema.Literal("thread.delete"),
  commandId: CommandId,
  threadId: ThreadId,
});

const ThreadArchiveCommand = Schema.Struct({
  type: Schema.Literal("thread.archive"),
  commandId: CommandId,
  threadId: ThreadId,
  archivedAt: IsoDateTime,
});

const ThreadUnarchiveCommand = Schema.Struct({
  type: Schema.Literal("thread.unarchive"),
  commandId: CommandId,
  threadId: ThreadId,
});

const ThreadMetaUpdateCommand = Schema.Struct({
  type: Schema.Literal("thread.meta.update"),
  commandId: CommandId,
  threadId: ThreadId,
  title: Schema.optional(TrimmedNonEmptyString),
  modelSelection: Schema.optional(ModelSelection),
  envMode: Schema.optional(ThreadEnvironmentMode),
  branch: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  worktreePath: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  associatedWorktreePath: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  associatedWorktreeBranch: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  associatedWorktreeRef: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  handoff: Schema.optional(Schema.NullOr(ThreadHandoff)),
});

const ThreadRuntimeModeSetCommand = Schema.Struct({
  type: Schema.Literal("thread.runtime-mode.set"),
  commandId: CommandId,
  threadId: ThreadId,
  runtimeMode: RuntimeMode,
  createdAt: IsoDateTime,
});

const ThreadInteractionModeSetCommand = Schema.Struct({
  type: Schema.Literal("thread.interaction-mode.set"),
  commandId: CommandId,
  threadId: ThreadId,
  interactionMode: ProviderInteractionMode,
  createdAt: IsoDateTime,
});

export const ThreadTurnStartCommand = Schema.Struct({
  type: Schema.Literal("thread.turn.start"),
  commandId: CommandId,
  threadId: ThreadId,
  message: Schema.Struct({
    messageId: MessageId,
    role: Schema.Literal("user"),
    text: Schema.String,
    attachments: Schema.Array(ChatAttachment),
    skills: Schema.optional(Schema.Array(ProviderSkillReference)),
    mentions: Schema.optional(Schema.Array(ProviderMentionReference)),
  }),
  modelSelection: Schema.optional(ModelSelection),
  providerOptions: Schema.optional(ProviderStartOptions),
  reviewTarget: Schema.optional(ProviderReviewTarget),
  assistantDeliveryMode: Schema.optional(AssistantDeliveryMode),
  dispatchMode: Schema.optional(TurnDispatchMode).pipe(
    Schema.withDecodingDefault(() => DEFAULT_TURN_DISPATCH_MODE),
  ),
  runtimeMode: RuntimeMode.pipe(Schema.withDecodingDefault(() => DEFAULT_RUNTIME_MODE)),
  interactionMode: ProviderInteractionMode.pipe(
    Schema.withDecodingDefault(() => DEFAULT_PROVIDER_INTERACTION_MODE),
  ),
  sourceProposedPlan: Schema.optional(SourceProposedPlanReference),
  createdAt: IsoDateTime,
});

const ClientThreadTurnStartCommand = Schema.Struct({
  type: Schema.Literal("thread.turn.start"),
  commandId: CommandId,
  threadId: ThreadId,
  message: Schema.Struct({
    messageId: MessageId,
    role: Schema.Literal("user"),
    text: Schema.String,
    attachments: Schema.Array(UploadChatAttachment),
    skills: Schema.optional(Schema.Array(ProviderSkillReference)),
    mentions: Schema.optional(Schema.Array(ProviderMentionReference)),
  }),
  modelSelection: Schema.optional(ModelSelection),
  providerOptions: Schema.optional(ProviderStartOptions),
  reviewTarget: Schema.optional(ProviderReviewTarget),
  assistantDeliveryMode: Schema.optional(AssistantDeliveryMode),
  dispatchMode: Schema.optional(TurnDispatchMode).pipe(
    Schema.withDecodingDefault(() => DEFAULT_TURN_DISPATCH_MODE),
  ),
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode,
  sourceProposedPlan: Schema.optional(SourceProposedPlanReference),
  createdAt: IsoDateTime,
});

const ThreadTurnInterruptCommand = Schema.Struct({
  type: Schema.Literal("thread.turn.interrupt"),
  commandId: CommandId,
  threadId: ThreadId,
  turnId: Schema.optional(TurnId),
  createdAt: IsoDateTime,
});

const ThreadDispatchQueuedTurnCommand = Schema.Struct({
  type: Schema.Literal("thread.turn.dispatch-queued"),
  commandId: CommandId,
  threadId: ThreadId,
  messageId: MessageId,
  modelSelection: Schema.optional(ModelSelection),
  providerOptions: Schema.optional(ProviderStartOptions),
  reviewTarget: Schema.optional(ProviderReviewTarget),
  assistantDeliveryMode: Schema.optional(AssistantDeliveryMode),
  dispatchMode: Schema.optional(TurnDispatchMode).pipe(
    Schema.withDecodingDefault(() => DEFAULT_TURN_DISPATCH_MODE),
  ),
  runtimeMode: RuntimeMode.pipe(Schema.withDecodingDefault(() => DEFAULT_RUNTIME_MODE)),
  interactionMode: ProviderInteractionMode.pipe(
    Schema.withDecodingDefault(() => DEFAULT_PROVIDER_INTERACTION_MODE),
  ),
  sourceProposedPlan: Schema.optional(SourceProposedPlanReference),
  createdAt: IsoDateTime,
});

const ThreadApprovalRespondCommand = Schema.Struct({
  type: Schema.Literal("thread.approval.respond"),
  commandId: CommandId,
  threadId: ThreadId,
  requestId: ApprovalRequestId,
  decision: ProviderApprovalDecision,
  createdAt: IsoDateTime,
});

const ThreadUserInputRespondCommand = Schema.Struct({
  type: Schema.Literal("thread.user-input.respond"),
  commandId: CommandId,
  threadId: ThreadId,
  requestId: ApprovalRequestId,
  answers: ProviderUserInputAnswers,
  createdAt: IsoDateTime,
});

const ThreadCheckpointRevertCommand = Schema.Struct({
  type: Schema.Literal("thread.checkpoint.revert"),
  commandId: CommandId,
  threadId: ThreadId,
  turnCount: NonNegativeInt,
  createdAt: IsoDateTime,
});

const ThreadSessionStopCommand = Schema.Struct({
  type: Schema.Literal("thread.session.stop"),
  commandId: CommandId,
  threadId: ThreadId,
  createdAt: IsoDateTime,
});

const DispatchableClientOrchestrationCommand = Schema.Union([
  ProjectCreateCommand,
  ProjectMetaUpdateCommand,
  ProjectDeleteCommand,
  ThreadCreateCommand,
  ThreadHandoffCreateCommand,
  ThreadForkCreateCommand,
  ThreadDeleteCommand,
  ThreadArchiveCommand,
  ThreadUnarchiveCommand,
  ThreadMetaUpdateCommand,
  ThreadRuntimeModeSetCommand,
  ThreadInteractionModeSetCommand,
  ThreadTurnStartCommand,
  ThreadTurnInterruptCommand,
  ThreadApprovalRespondCommand,
  ThreadUserInputRespondCommand,
  ThreadCheckpointRevertCommand,
  ThreadSessionStopCommand,
  Schema.suspend(() => OrchestratorRunCreateCommand),
  Schema.suspend(() => OrchestratorRunCancelCommand),
  Schema.suspend(() => OrchestratorRunCompleteCommand),
  Schema.suspend(() => OrchestratorRunFailCommand),
  Schema.suspend(() => OrchestratorTaskCreateCommand),
  Schema.suspend(() => OrchestratorTaskAssignCommand),
  Schema.suspend(() => OrchestratorTaskSubmitCommand),
  Schema.suspend(() => OrchestratorTaskAcceptCommand),
  Schema.suspend(() => OrchestratorTaskRejectCommand),
  Schema.suspend(() => OrchestratorTaskBlockCommand),
  Schema.suspend(() => OrchestratorTaskCancelCommand),
  Schema.suspend(() => OrchestratorTaskFailCommand),
  Schema.suspend(() => OrchestratorWorkerSpawnCommand),
  Schema.suspend(() => OrchestratorWorkerTerminateCommand),
  Schema.suspend(() => OrchestratorWorkerPauseCommand),
  Schema.suspend(() => OrchestratorWorkerResumeCommand),
  Schema.suspend(() => OrchestratorWorkerPromoteCommand),
  Schema.suspend(() => OrchestratorWorkerDemoteCommand),
  Schema.suspend(() => OrchestratorWorkerUpdatePostCommand),
  Schema.suspend(() => OrchestratorMessageSendCommand),
  Schema.suspend(() => OrchestratorMessageBroadcastCommand),
  Schema.suspend(() => OrchestratorContextTransferCommand),
  Schema.suspend(() => OrchestratorDependencySetCommand),
  Schema.suspend(() => OrchestratorWorkMergeCommand),
  Schema.suspend(() => OrchestratorEvidenceCaptureCommand),
  Schema.suspend(() => OrchestratorDecisionRecordCommand),
  Schema.suspend(() => OrchestratorChecklistUpdateCommand),
]);
export type DispatchableClientOrchestrationCommand =
  typeof DispatchableClientOrchestrationCommand.Type;

export const ClientOrchestrationCommand = Schema.Union([
  ProjectCreateCommand,
  ProjectMetaUpdateCommand,
  ProjectDeleteCommand,
  ThreadCreateCommand,
  ThreadHandoffCreateCommand,
  ThreadForkCreateCommand,
  ThreadDeleteCommand,
  ThreadArchiveCommand,
  ThreadUnarchiveCommand,
  ThreadMetaUpdateCommand,
  ThreadRuntimeModeSetCommand,
  ThreadInteractionModeSetCommand,
  ClientThreadTurnStartCommand,
  ThreadTurnInterruptCommand,
  ThreadApprovalRespondCommand,
  ThreadUserInputRespondCommand,
  ThreadCheckpointRevertCommand,
  ThreadSessionStopCommand,
  Schema.suspend(() => OrchestratorRunCreateCommand),
  Schema.suspend(() => OrchestratorRunCancelCommand),
  Schema.suspend(() => OrchestratorRunCompleteCommand),
  Schema.suspend(() => OrchestratorRunFailCommand),
  Schema.suspend(() => OrchestratorTaskCreateCommand),
  Schema.suspend(() => OrchestratorTaskAssignCommand),
  Schema.suspend(() => OrchestratorTaskSubmitCommand),
  Schema.suspend(() => OrchestratorTaskAcceptCommand),
  Schema.suspend(() => OrchestratorTaskRejectCommand),
  Schema.suspend(() => OrchestratorTaskBlockCommand),
  Schema.suspend(() => OrchestratorTaskCancelCommand),
  Schema.suspend(() => OrchestratorTaskFailCommand),
  Schema.suspend(() => OrchestratorWorkerSpawnCommand),
  Schema.suspend(() => OrchestratorWorkerTerminateCommand),
  Schema.suspend(() => OrchestratorWorkerPauseCommand),
  Schema.suspend(() => OrchestratorWorkerResumeCommand),
  Schema.suspend(() => OrchestratorWorkerPromoteCommand),
  Schema.suspend(() => OrchestratorWorkerDemoteCommand),
  Schema.suspend(() => OrchestratorWorkerUpdatePostCommand),
  Schema.suspend(() => OrchestratorMessageSendCommand),
  Schema.suspend(() => OrchestratorMessageBroadcastCommand),
  Schema.suspend(() => OrchestratorContextTransferCommand),
  Schema.suspend(() => OrchestratorDependencySetCommand),
  Schema.suspend(() => OrchestratorWorkMergeCommand),
  Schema.suspend(() => OrchestratorEvidenceCaptureCommand),
  Schema.suspend(() => OrchestratorDecisionRecordCommand),
  Schema.suspend(() => OrchestratorChecklistUpdateCommand),
]);
export type ClientOrchestrationCommand = typeof ClientOrchestrationCommand.Type;

const ThreadSessionSetCommand = Schema.Struct({
  type: Schema.Literal("thread.session.set"),
  commandId: CommandId,
  threadId: ThreadId,
  session: OrchestrationSession,
  createdAt: IsoDateTime,
});

const ThreadMessageAssistantDeltaCommand = Schema.Struct({
  type: Schema.Literal("thread.message.assistant.delta"),
  commandId: CommandId,
  threadId: ThreadId,
  messageId: MessageId,
  delta: Schema.String,
  turnId: Schema.optional(TurnId),
  createdAt: IsoDateTime,
});

const ThreadMessageAssistantCompleteCommand = Schema.Struct({
  type: Schema.Literal("thread.message.assistant.complete"),
  commandId: CommandId,
  threadId: ThreadId,
  messageId: MessageId,
  turnId: Schema.optional(TurnId),
  createdAt: IsoDateTime,
});

const ThreadProposedPlanUpsertCommand = Schema.Struct({
  type: Schema.Literal("thread.proposed-plan.upsert"),
  commandId: CommandId,
  threadId: ThreadId,
  proposedPlan: OrchestrationProposedPlan,
  createdAt: IsoDateTime,
});

const ThreadTurnDiffCompleteCommand = Schema.Struct({
  type: Schema.Literal("thread.turn.diff.complete"),
  commandId: CommandId,
  threadId: ThreadId,
  turnId: TurnId,
  completedAt: IsoDateTime,
  checkpointRef: CheckpointRef,
  status: OrchestrationCheckpointStatus,
  files: Schema.Array(OrchestrationCheckpointFile),
  assistantMessageId: Schema.optional(MessageId),
  checkpointTurnCount: NonNegativeInt,
  createdAt: IsoDateTime,
});

const ThreadActivityAppendCommand = Schema.Struct({
  type: Schema.Literal("thread.activity.append"),
  commandId: CommandId,
  threadId: ThreadId,
  activity: OrchestrationThreadActivity,
  createdAt: IsoDateTime,
});

const ThreadRevertCompleteCommand = Schema.Struct({
  type: Schema.Literal("thread.revert.complete"),
  commandId: CommandId,
  threadId: ThreadId,
  turnCount: NonNegativeInt,
  createdAt: IsoDateTime,
});

const InternalOrchestrationCommand = Schema.Union([
  ThreadSessionSetCommand,
  ThreadMessageAssistantDeltaCommand,
  ThreadMessageAssistantCompleteCommand,
  ThreadProposedPlanUpsertCommand,
  ThreadTurnDiffCompleteCommand,
  ThreadActivityAppendCommand,
  ThreadRevertCompleteCommand,
  ThreadDispatchQueuedTurnCommand,
]);
export type InternalOrchestrationCommand = typeof InternalOrchestrationCommand.Type;

export const OrchestrationCommand = Schema.Union([
  DispatchableClientOrchestrationCommand,
  InternalOrchestrationCommand,
]);
export type OrchestrationCommand = typeof OrchestrationCommand.Type;

export const OrchestrationEventType = Schema.Literals([
  "project.created",
  "project.meta-updated",
  "project.deleted",
  "thread.created",
  "thread.deleted",
  "thread.archived",
  "thread.unarchived",
  "thread.meta-updated",
  "thread.runtime-mode-set",
  "thread.interaction-mode-set",
  "thread.message-sent",
  "thread.turn-queued",
  "thread.turn-start-requested",
  "thread.turn-interrupt-requested",
  "thread.approval-response-requested",
  "thread.user-input-response-requested",
  "thread.checkpoint-revert-requested",
  "thread.reverted",
  "thread.session-stop-requested",
  "thread.session-set",
  "thread.proposed-plan-upserted",
  "thread.turn-diff-completed",
  "thread.activity-appended",
  "orchestrator.run.created",
  "orchestrator.run.cancelled",
  "orchestrator.run.completed",
  "orchestrator.run.failed",
  "orchestrator.task.created",
  "orchestrator.task.assigned",
  "orchestrator.task.submitted",
  "orchestrator.task.accepted",
  "orchestrator.task.rejected",
  "orchestrator.task.blocked",
  "orchestrator.task.cancelled",
  "orchestrator.task.failed",
  "orchestrator.worker.spawned",
  "orchestrator.worker.terminated",
  "orchestrator.worker.paused",
  "orchestrator.worker.resumed",
  "orchestrator.worker.promoted",
  "orchestrator.worker.demoted",
  "orchestrator.worker.update-posted",
  "orchestrator.message.sent",
  "orchestrator.message.broadcast-sent",
  "orchestrator.context.transferred",
  "orchestrator.dependency.set",
  "orchestrator.work.merge-requested",
  "orchestrator.work.merge-completed",
  "orchestrator.work.merge-failed",
  "orchestrator.evidence.captured",
  "orchestrator.decision.recorded",
  "orchestrator.checklist.updated",
]);
export type OrchestrationEventType = typeof OrchestrationEventType.Type;

export const OrchestrationAggregateKind = Schema.Literals(["project", "thread", "orchestrator"]);
export type OrchestrationAggregateKind = typeof OrchestrationAggregateKind.Type;
export const OrchestrationActorKind = Schema.Literals(["client", "server", "provider"]);

export const ProjectCreatedPayload = Schema.Struct({
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  workspaceRoot: TrimmedNonEmptyString,
  defaultModelSelection: Schema.NullOr(ModelSelection),
  scripts: Schema.Array(ProjectScript),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

export const ProjectMetaUpdatedPayload = Schema.Struct({
  projectId: ProjectId,
  title: Schema.optional(TrimmedNonEmptyString),
  workspaceRoot: Schema.optional(TrimmedNonEmptyString),
  defaultModelSelection: Schema.optional(Schema.NullOr(ModelSelection)),
  scripts: Schema.optional(Schema.Array(ProjectScript)),
  updatedAt: IsoDateTime,
});

export const ProjectDeletedPayload = Schema.Struct({
  projectId: ProjectId,
  deletedAt: IsoDateTime,
});

export const ThreadCreatedPayload = Schema.Struct({
  threadId: ThreadId,
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  threadType: Schema.optional(ThreadType).pipe(
    Schema.withDecodingDefault(() => "orchestrator" as const),
  ),
  parentThreadId: Schema.optional(Schema.NullOr(ThreadId)).pipe(
    Schema.withDecodingDefault(() => null),
  ),
  modelSelection: ModelSelection,
  runtimeMode: RuntimeMode.pipe(Schema.withDecodingDefault(() => DEFAULT_RUNTIME_MODE)),
  interactionMode: ProviderInteractionMode.pipe(
    Schema.withDecodingDefault(() => DEFAULT_PROVIDER_INTERACTION_MODE),
  ),
  envMode: Schema.optional(ThreadEnvironmentMode).pipe(Schema.withDecodingDefault(() => "local")),
  branch: Schema.NullOr(TrimmedNonEmptyString),
  worktreePath: Schema.NullOr(TrimmedNonEmptyString),
  associatedWorktreePath: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)).pipe(
    Schema.withDecodingDefault(() => null),
  ),
  associatedWorktreeBranch: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)).pipe(
    Schema.withDecodingDefault(() => null),
  ),
  associatedWorktreeRef: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)).pipe(
    Schema.withDecodingDefault(() => null),
  ),
  forkSourceThreadId: Schema.optional(Schema.NullOr(ThreadId)).pipe(
    Schema.withDecodingDefault(() => null),
  ),
  handoff: Schema.NullOr(ThreadHandoff).pipe(Schema.withDecodingDefault(() => null)),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

export const ThreadDeletedPayload = Schema.Struct({
  threadId: ThreadId,
  deletedAt: IsoDateTime,
});

export const ThreadArchivedPayload = Schema.Struct({
  threadId: ThreadId,
  archivedAt: IsoDateTime,
});

export const ThreadUnarchivedPayload = Schema.Struct({
  threadId: ThreadId,
});

export const ThreadMetaUpdatedPayload = Schema.Struct({
  threadId: ThreadId,
  title: Schema.optional(TrimmedNonEmptyString),
  modelSelection: Schema.optional(ModelSelection),
  envMode: Schema.optional(ThreadEnvironmentMode),
  branch: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  worktreePath: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  associatedWorktreePath: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  associatedWorktreeBranch: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  associatedWorktreeRef: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  handoff: Schema.optional(Schema.NullOr(ThreadHandoff)),
  updatedAt: IsoDateTime,
});

export const ThreadRuntimeModeSetPayload = Schema.Struct({
  threadId: ThreadId,
  runtimeMode: RuntimeMode,
  updatedAt: IsoDateTime,
});

export const ThreadInteractionModeSetPayload = Schema.Struct({
  threadId: ThreadId,
  interactionMode: ProviderInteractionMode.pipe(
    Schema.withDecodingDefault(() => DEFAULT_PROVIDER_INTERACTION_MODE),
  ),
  updatedAt: IsoDateTime,
});

export const ThreadMessageSentPayload = Schema.Struct({
  threadId: ThreadId,
  messageId: MessageId,
  role: OrchestrationMessageRole,
  text: Schema.String,
  attachments: Schema.optional(Schema.Array(ChatAttachment)),
  skills: Schema.optional(Schema.Array(ProviderSkillReference)),
  mentions: Schema.optional(Schema.Array(ProviderMentionReference)),
  turnId: Schema.NullOr(TurnId),
  streaming: Schema.Boolean,
  source: OrchestrationMessageSource.pipe(Schema.withDecodingDefault(() => "native")),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

export const ThreadTurnStartRequestedPayload = Schema.Struct({
  threadId: ThreadId,
  messageId: MessageId,
  modelSelection: Schema.optional(ModelSelection),
  providerOptions: Schema.optional(ProviderStartOptions),
  reviewTarget: Schema.optional(ProviderReviewTarget),
  assistantDeliveryMode: Schema.optional(AssistantDeliveryMode),
  dispatchMode: TurnDispatchMode.pipe(Schema.withDecodingDefault(() => DEFAULT_TURN_DISPATCH_MODE)),
  runtimeMode: RuntimeMode.pipe(Schema.withDecodingDefault(() => DEFAULT_RUNTIME_MODE)),
  interactionMode: ProviderInteractionMode.pipe(
    Schema.withDecodingDefault(() => DEFAULT_PROVIDER_INTERACTION_MODE),
  ),
  sourceProposedPlan: Schema.optional(SourceProposedPlanReference),
  createdAt: IsoDateTime,
});

export const ThreadTurnQueuedPayload = ThreadTurnStartRequestedPayload;

export const ThreadTurnInterruptRequestedPayload = Schema.Struct({
  threadId: ThreadId,
  turnId: Schema.optional(TurnId),
  createdAt: IsoDateTime,
});

export const ThreadApprovalResponseRequestedPayload = Schema.Struct({
  threadId: ThreadId,
  requestId: ApprovalRequestId,
  decision: ProviderApprovalDecision,
  createdAt: IsoDateTime,
});

const ThreadUserInputResponseRequestedPayload = Schema.Struct({
  threadId: ThreadId,
  requestId: ApprovalRequestId,
  answers: ProviderUserInputAnswers,
  createdAt: IsoDateTime,
});

export const ThreadCheckpointRevertRequestedPayload = Schema.Struct({
  threadId: ThreadId,
  turnCount: NonNegativeInt,
  createdAt: IsoDateTime,
});

export const ThreadRevertedPayload = Schema.Struct({
  threadId: ThreadId,
  turnCount: NonNegativeInt,
});

export const ThreadSessionStopRequestedPayload = Schema.Struct({
  threadId: ThreadId,
  createdAt: IsoDateTime,
});

export const ThreadSessionSetPayload = Schema.Struct({
  threadId: ThreadId,
  session: OrchestrationSession,
});

export const ThreadProposedPlanUpsertedPayload = Schema.Struct({
  threadId: ThreadId,
  proposedPlan: OrchestrationProposedPlan,
});

export const ThreadTurnDiffCompletedPayload = Schema.Struct({
  threadId: ThreadId,
  turnId: TurnId,
  checkpointTurnCount: NonNegativeInt,
  checkpointRef: CheckpointRef,
  status: OrchestrationCheckpointStatus,
  files: Schema.Array(OrchestrationCheckpointFile),
  assistantMessageId: Schema.NullOr(MessageId),
  completedAt: IsoDateTime,
});

export const ThreadActivityAppendedPayload = Schema.Struct({
  threadId: ThreadId,
  activity: OrchestrationThreadActivity,
});

export const OrchestrationEventMetadata = Schema.Struct({
  providerTurnId: Schema.optional(TrimmedNonEmptyString),
  providerItemId: Schema.optional(ProviderItemId),
  adapterKey: Schema.optional(TrimmedNonEmptyString),
  requestId: Schema.optional(ApprovalRequestId),
  ingestedAt: Schema.optional(IsoDateTime),
});
export type OrchestrationEventMetadata = typeof OrchestrationEventMetadata.Type;

const EventBaseFields = {
  sequence: NonNegativeInt,
  eventId: EventId,
  aggregateKind: OrchestrationAggregateKind,
  aggregateId: Schema.Union([ProjectId, ThreadId, Schema.suspend(() => OrchestratorRunId)]),
  occurredAt: IsoDateTime,
  commandId: Schema.NullOr(CommandId),
  causationEventId: Schema.NullOr(EventId),
  correlationId: Schema.NullOr(CommandId),
  metadata: OrchestrationEventMetadata,
} as const;

export const OrchestrationEvent = Schema.Union([
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("project.created"),
    payload: ProjectCreatedPayload,
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("project.meta-updated"),
    payload: ProjectMetaUpdatedPayload,
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("project.deleted"),
    payload: ProjectDeletedPayload,
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("thread.created"),
    payload: ThreadCreatedPayload,
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("thread.deleted"),
    payload: ThreadDeletedPayload,
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("thread.archived"),
    payload: ThreadArchivedPayload,
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("thread.unarchived"),
    payload: ThreadUnarchivedPayload,
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("thread.meta-updated"),
    payload: ThreadMetaUpdatedPayload,
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("thread.runtime-mode-set"),
    payload: ThreadRuntimeModeSetPayload,
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("thread.interaction-mode-set"),
    payload: ThreadInteractionModeSetPayload,
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("thread.message-sent"),
    payload: ThreadMessageSentPayload,
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("thread.turn-queued"),
    payload: ThreadTurnQueuedPayload,
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("thread.turn-start-requested"),
    payload: ThreadTurnStartRequestedPayload,
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("thread.turn-interrupt-requested"),
    payload: ThreadTurnInterruptRequestedPayload,
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("thread.approval-response-requested"),
    payload: ThreadApprovalResponseRequestedPayload,
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("thread.user-input-response-requested"),
    payload: ThreadUserInputResponseRequestedPayload,
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("thread.checkpoint-revert-requested"),
    payload: ThreadCheckpointRevertRequestedPayload,
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("thread.reverted"),
    payload: ThreadRevertedPayload,
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("thread.session-stop-requested"),
    payload: ThreadSessionStopRequestedPayload,
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("thread.session-set"),
    payload: ThreadSessionSetPayload,
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("thread.proposed-plan-upserted"),
    payload: ThreadProposedPlanUpsertedPayload,
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("thread.turn-diff-completed"),
    payload: ThreadTurnDiffCompletedPayload,
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("thread.activity-appended"),
    payload: ThreadActivityAppendedPayload,
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.run.created"),
    payload: Schema.suspend(() => OrchestratorRunCreatedPayload),
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.run.cancelled"),
    payload: Schema.suspend(() => OrchestratorRunCancelledPayload),
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.run.completed"),
    payload: Schema.suspend(() => OrchestratorRunCompletedPayload),
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.run.failed"),
    payload: Schema.suspend(() => OrchestratorRunFailedPayload),
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.task.created"),
    payload: Schema.suspend(() => OrchestratorTaskCreatedPayload),
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.task.assigned"),
    payload: Schema.suspend(() => OrchestratorTaskAssignedPayload),
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.task.submitted"),
    payload: Schema.suspend(() => OrchestratorTaskSubmittedPayload),
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.task.accepted"),
    payload: Schema.suspend(() => OrchestratorTaskAcceptedPayload),
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.task.rejected"),
    payload: Schema.suspend(() => OrchestratorTaskRejectedPayload),
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.task.blocked"),
    payload: Schema.suspend(() => OrchestratorTaskBlockedPayload),
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.task.cancelled"),
    payload: Schema.suspend(() => OrchestratorTaskCancelledPayload),
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.task.failed"),
    payload: Schema.suspend(() => OrchestratorTaskFailedPayload),
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.worker.spawned"),
    payload: Schema.suspend(() => OrchestratorWorkerSpawnedPayload),
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.worker.terminated"),
    payload: Schema.suspend(() => OrchestratorWorkerTerminatedPayload),
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.worker.paused"),
    payload: Schema.suspend(() => OrchestratorWorkerPausedPayload),
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.worker.resumed"),
    payload: Schema.suspend(() => OrchestratorWorkerResumedPayload),
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.worker.promoted"),
    payload: Schema.suspend(() => OrchestratorWorkerPromotedPayload),
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.worker.demoted"),
    payload: Schema.suspend(() => OrchestratorWorkerDemotedPayload),
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.worker.update-posted"),
    payload: Schema.suspend(() => OrchestratorWorkerUpdatePostedPayload),
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.message.sent"),
    payload: Schema.suspend(() => OrchestratorMessageSentPayload),
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.message.broadcast-sent"),
    payload: Schema.suspend(() => OrchestratorMessageBroadcastSentPayload),
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.context.transferred"),
    payload: Schema.suspend(() => OrchestratorContextTransferredPayload),
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.dependency.set"),
    payload: Schema.suspend(() => OrchestratorDependencySetPayload),
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.work.merge-requested"),
    payload: Schema.suspend(() => OrchestratorWorkMergeRequestedPayload),
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.work.merge-completed"),
    payload: Schema.suspend(() => OrchestratorWorkMergeCompletedPayload),
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.work.merge-failed"),
    payload: Schema.suspend(() => OrchestratorWorkMergeFailedPayload),
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.evidence.captured"),
    payload: Schema.suspend(() => OrchestratorEvidenceCapturedPayload),
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.decision.recorded"),
    payload: Schema.suspend(() => OrchestratorDecisionRecordedPayload),
  }),
  Schema.Struct({
    ...EventBaseFields,
    type: Schema.Literal("orchestrator.checklist.updated"),
    payload: Schema.suspend(() => OrchestratorChecklistUpdatedPayload),
  }),
]);
export type OrchestrationEvent = typeof OrchestrationEvent.Type;

export const OrchestrationCommandReceiptStatus = Schema.Literals(["accepted", "rejected"]);
export type OrchestrationCommandReceiptStatus = typeof OrchestrationCommandReceiptStatus.Type;

export const TurnCountRange = Schema.Struct({
  fromTurnCount: NonNegativeInt,
  toTurnCount: NonNegativeInt,
}).check(
  Schema.makeFilter(
    (input) =>
      input.fromTurnCount <= input.toTurnCount ||
      new SchemaIssue.InvalidValue(Option.some(input.fromTurnCount), {
        message: "fromTurnCount must be less than or equal to toTurnCount",
      }),
    { identifier: "OrchestrationTurnDiffRange" },
  ),
);

export const ThreadTurnDiff = TurnCountRange.mapFields(
  Struct.assign({
    threadId: ThreadId,
    diff: Schema.String,
  }),
  { unsafePreserveChecks: true },
);

export const ProviderSessionRuntimeStatus = Schema.Literals([
  "starting",
  "running",
  "stopped",
  "error",
]);
export type ProviderSessionRuntimeStatus = typeof ProviderSessionRuntimeStatus.Type;

const ProjectionThreadTurnStatus = Schema.Literals([
  "running",
  "completed",
  "interrupted",
  "error",
]);
export type ProjectionThreadTurnStatus = typeof ProjectionThreadTurnStatus.Type;

const ProjectionCheckpointRow = Schema.Struct({
  threadId: ThreadId,
  turnId: TurnId,
  checkpointTurnCount: NonNegativeInt,
  checkpointRef: CheckpointRef,
  status: OrchestrationCheckpointStatus,
  files: Schema.Array(OrchestrationCheckpointFile),
  assistantMessageId: Schema.NullOr(MessageId),
  completedAt: IsoDateTime,
});
export type ProjectionCheckpointRow = typeof ProjectionCheckpointRow.Type;

export const ProjectionPendingApprovalStatus = Schema.Literals(["pending", "resolved"]);
export type ProjectionPendingApprovalStatus = typeof ProjectionPendingApprovalStatus.Type;

export const ProjectionPendingApprovalDecision = Schema.NullOr(ProviderApprovalDecision);
export type ProjectionPendingApprovalDecision = typeof ProjectionPendingApprovalDecision.Type;

export const DispatchResult = Schema.Struct({
  sequence: NonNegativeInt,
});
export type DispatchResult = typeof DispatchResult.Type;

export const OrchestrationGetSnapshotInput = Schema.Struct({});
export type OrchestrationGetSnapshotInput = typeof OrchestrationGetSnapshotInput.Type;
const OrchestrationGetSnapshotResult = OrchestrationReadModel;
export type OrchestrationGetSnapshotResult = typeof OrchestrationGetSnapshotResult.Type;

export const OrchestrationGetTurnDiffInput = TurnCountRange.mapFields(
  Struct.assign({ threadId: ThreadId }),
  { unsafePreserveChecks: true },
);
export type OrchestrationGetTurnDiffInput = typeof OrchestrationGetTurnDiffInput.Type;

export const OrchestrationGetTurnDiffResult = ThreadTurnDiff;
export type OrchestrationGetTurnDiffResult = typeof OrchestrationGetTurnDiffResult.Type;

export const OrchestrationGetFullThreadDiffInput = Schema.Struct({
  threadId: ThreadId,
  toTurnCount: NonNegativeInt,
});
export type OrchestrationGetFullThreadDiffInput = typeof OrchestrationGetFullThreadDiffInput.Type;

export const OrchestrationGetFullThreadDiffResult = ThreadTurnDiff;
export type OrchestrationGetFullThreadDiffResult = typeof OrchestrationGetFullThreadDiffResult.Type;

export const OrchestrationReplayEventsInput = Schema.Struct({
  fromSequenceExclusive: NonNegativeInt,
});
export type OrchestrationReplayEventsInput = typeof OrchestrationReplayEventsInput.Type;

const OrchestrationReplayEventsResult = Schema.Array(OrchestrationEvent);
export type OrchestrationReplayEventsResult = typeof OrchestrationReplayEventsResult.Type;

// ---------------------------------------------------------------------------
// Task 7: Core Orchestrator Domain Schemas
// ---------------------------------------------------------------------------

// Branded IDs
export const OrchestratorRunId = Schema.String.pipe(Schema.brand("OrchestratorRunId"));
export type OrchestratorRunId = typeof OrchestratorRunId.Type;

export const OrchestratorTaskId = Schema.String.pipe(Schema.brand("OrchestratorTaskId"));
export type OrchestratorTaskId = typeof OrchestratorTaskId.Type;

export const OrchestratorWorkerId = Schema.String.pipe(Schema.brand("OrchestratorWorkerId"));
export type OrchestratorWorkerId = typeof OrchestratorWorkerId.Type;

export const OrchestratorEvidenceId = Schema.String.pipe(Schema.brand("OrchestratorEvidenceId"));
export type OrchestratorEvidenceId = typeof OrchestratorEvidenceId.Type;

export const OrchestratorDecisionId = Schema.String.pipe(Schema.brand("OrchestratorDecisionId"));
export type OrchestratorDecisionId = typeof OrchestratorDecisionId.Type;

// Status/Enum Schemas
export const OrchestratorRunStatus = Schema.Literals([
  "active",
  "completed",
  "failed",
  "cancelled",
]);
export const OrchestratorTaskStatus = Schema.Literals([
  "pending",
  "assigned",
  "running",
  "submitted",
  "accepted",
  "needs-rework",
  "blocked",
  "cancelled",
  "failed",
]);
export const OrchestratorWorkerStatus = Schema.Literals([
  "idle",
  "running",
  "paused",
  "submitted",
  "stuck",
  "terminated",
]);
export const OrchestratorRoutingAction = Schema.Literals([
  "answer",
  "inspect",
  "delegate",
  "decompose",
]);
export const OrchestratorEvidenceType = Schema.Literals([
  "diff",
  "file-snapshot",
  "test-result",
  "command-result",
  "browser-trace",
  "screenshot",
  "log",
  "aria-snapshot",
  "computed-style",
  "evaluate-result",
]);
export const OrchestratorChecklistEvidenceType = Schema.Literals([
  "dom",
  "interaction",
  "computed-style",
  "visual",
  "test",
  "command",
  "diff",
  "inferred",
]);
export const OrchestratorDecisionType = Schema.Literals([
  "answered",
  "inspected",
  "delegated",
  "decomposed",
  "spawned-worker",
  "reassigned",
  "accepted",
  "rejected",
  "blocked",
  "cancelled",
  "completed",
  "self-demoted",
  "budget-exceeded",
  "stuck-detected",
  "escalated",
]);
export const RequiredCapability = Schema.Literals([
  "code-edit",
  "repo-inspection",
  "browser-use",
  "structured-review",
  "planning",
  "integration",
  "test-execution",
  "large-context",
  "fast-response",
  "low-cost",
]);
export type RequiredCapability = typeof RequiredCapability.Type;

// SpawnBudget
export const SpawnBudget = Schema.Struct({
  maxDepth: Schema.Number,
  maxChildren: Schema.Number,
  maxConcurrentWriters: Schema.Number,
  maxTotalWorkers: Schema.Number,
  allowedTools: Schema.Array(Schema.String),
  writeScope: Schema.Array(Schema.String),
});
export type SpawnBudget = typeof SpawnBudget.Type;

// Workspace
export const OrchestratorWorkspace = Schema.Struct({
  mode: Schema.Literals(["local", "worktree"]),
  branch: Schema.optional(Schema.String),
  worktreePath: Schema.optional(Schema.String),
  cwd: Schema.String,
  terminalIds: Schema.Array(Schema.String),
  browserSessionId: Schema.optional(Schema.String),
});
export type OrchestratorWorkspace = typeof OrchestratorWorkspace.Type;

// ChecklistItem
export const OrchestratorChecklistItem = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  status: Schema.Literals(["pending", "passed", "failed"]),
  evidenceType: Schema.optional(OrchestratorChecklistEvidenceType),
  evidenceRefs: Schema.optional(Schema.Array(Schema.String)),
  notes: Schema.optional(Schema.String),
  verifiedAt: Schema.optional(IsoDateTime),
});
export type OrchestratorChecklistItem = typeof OrchestratorChecklistItem.Type;

// EvidenceRecord
export const OrchestratorEvidenceRecord = Schema.Struct({
  evidenceId: OrchestratorEvidenceId,
  taskId: OrchestratorTaskId,
  workerId: Schema.optional(OrchestratorWorkerId),
  type: OrchestratorEvidenceType,
  capturedAt: IsoDateTime,
  content: Schema.String,
  contentTruncated: Schema.Boolean,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)),
});
export type OrchestratorEvidenceRecord = typeof OrchestratorEvidenceRecord.Type;

// Decision
export const OrchestratorDecision = Schema.Struct({
  decisionId: OrchestratorDecisionId,
  runId: OrchestratorRunId,
  taskId: Schema.optional(OrchestratorTaskId),
  type: OrchestratorDecisionType,
  reason: Schema.String,
  inputs: Schema.optional(Schema.String),
  createdAt: IsoDateTime,
});
export type OrchestratorDecision = typeof OrchestratorDecision.Type;

// Gap 5+6: diffStats carried on submit so orchestrator can gate acceptance.
export const OrchestratorTaskDiffStats = Schema.Struct({
  adds: Schema.Int,
  dels: Schema.Int,
  filesChanged: Schema.Int,
});
export type OrchestratorTaskDiffStats = typeof OrchestratorTaskDiffStats.Type;

// Gap C+F: structured submit report so the orchestrator can read what the
// worker did without guessing from disk. Declared above OrchestratorTask
// because Schema.Struct resolves eagerly (no forward-reference via suspend).
export const OrchestratorTaskTestResult = Schema.Struct({
  name: Schema.String,
  passed: Schema.Boolean,
});
export type OrchestratorTaskTestResult = typeof OrchestratorTaskTestResult.Type;

// Task (uses suspend for ModelPolicy forward reference)
export const OrchestratorTask = Schema.Struct({
  taskId: OrchestratorTaskId,
  runId: OrchestratorRunId,
  parentTaskId: Schema.optional(OrchestratorTaskId),
  title: Schema.String,
  objective: Schema.String,
  status: OrchestratorTaskStatus,
  ownerKind: Schema.Literals(["orchestrator", "worker"]),
  ownerId: Schema.optional(Schema.String),
  stopCondition: Schema.optional(Schema.String),
  readScope: Schema.optional(Schema.Array(Schema.String)),
  writeScope: Schema.optional(Schema.Array(Schema.String)),
  allowedTools: Schema.optional(Schema.Array(Schema.String)),
  evidenceRequired: Schema.optional(Schema.Array(OrchestratorEvidenceType)),
  escalationRules: Schema.optional(Schema.String),
  acceptanceCriteria: Schema.Array(Schema.String),
  checklist: Schema.Array(OrchestratorChecklistItem),
  dependsOn: Schema.optional(Schema.Array(OrchestratorTaskId)),
  blockedBy: Schema.optional(Schema.String),
  modelPolicy: Schema.optional(Schema.suspend(() => OrchestratorModelPolicy)),
  assignedWorkerId: Schema.optional(OrchestratorWorkerId),
  iteration: Schema.Number,
  maxIterations: Schema.Number,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  submittedAt: Schema.optional(IsoDateTime),
  acceptedAt: Schema.optional(IsoDateTime),
  // Gap 5+6: worker's last-submit change report; used by accept invariant.
  hasChanges: Schema.optional(Schema.Boolean),
  diffStats: Schema.optional(OrchestratorTaskDiffStats),
  // Gap C+F: worker's structured submit report — what the worker says it did.
  submitSummary: Schema.optional(Schema.String),
  filesWritten: Schema.optional(Schema.Array(SafeFilePath)),
  testsRun: Schema.optional(Schema.Array(OrchestratorTaskTestResult)),
  submitNotes: Schema.optional(Schema.String),
});
export type OrchestratorTask = typeof OrchestratorTask.Type;

export const OrchestratorWorkerVisibility = Schema.Literals(["foreground", "background"]);
export type OrchestratorWorkerVisibility = typeof OrchestratorWorkerVisibility.Type;

// Worker (uses suspend for WorkerModelBinding forward reference)
// Worker turn-end signal — what the worker tells the orchestrator at the
// end of every turn that doesn't end with a final task.submit. Closes the
// gap where the orchestrator was blind to the worker's narrative replies
// (e.g. "design done, say 'go' to build") and falsely assumed the worker
// was still computing when it was actually waiting on user input.
export const OrchestratorWorkerUpdateStatus = Schema.Literals([
  // Mid-task; agent will continue working in subsequent turns. Surfaces
  // progress for streaming dashboards but does NOT block the orchestrator.
  "in-progress",
  // Agent is paused awaiting a clarification, confirmation, or design
  // decision from the orchestrator. The orchestrator MUST respond before
  // the agent makes further progress.
  "needs-input",
  // Agent believes the work is complete and ready for review. Companion
  // to (or precursor of) `task.submit` — useful for situations where the
  // agent wants to flag completion separately from emitting the formal
  // REPORT block.
  "ready-for-review",
  // Agent cannot proceed (missing tool, env error, contradictory spec).
  // Distinct from `needs-input`: input alone won't unblock.
  "blocked",
]);
export type OrchestratorWorkerUpdateStatus = typeof OrchestratorWorkerUpdateStatus.Type;

export const OrchestratorWorkerUpdate = Schema.Struct({
  status: OrchestratorWorkerUpdateStatus,
  // One-sentence summary of what the worker accomplished or learned this
  // turn. Required so `get_agent_status` can render a useful row even if
  // the orchestrator never opens the worker pane.
  summary: TrimmedNonEmptyString,
  // Concrete question the orchestrator should answer (only set when
  // status === "needs-input"). Examples: "Use violet or amber accent?",
  // "Should I delete the legacy adapter or just deprecate?".
  question: Schema.optional(TrimmedNonEmptyString),
  // What the worker plans to do next once unblocked / on next turn.
  // Helps the orchestrator decide whether to nudge or wait.
  nextStep: Schema.optional(TrimmedNonEmptyString),
  // Reason the worker is blocked (only set when status === "blocked").
  // Distinct from `question` — this is "why I can't move", not "what I
  // need from you".
  blockedReason: Schema.optional(TrimmedNonEmptyString),
  postedAt: IsoDateTime,
});
export type OrchestratorWorkerUpdate = typeof OrchestratorWorkerUpdate.Type;

export const OrchestratorWorker = Schema.Struct({
  workerId: OrchestratorWorkerId,
  runId: OrchestratorRunId,
  threadId: ThreadId,
  status: OrchestratorWorkerStatus,
  visibility: Schema.optional(OrchestratorWorkerVisibility).pipe(
    Schema.withDecodingDefault(() => "foreground" as const),
  ),
  activeTaskId: Schema.optional(OrchestratorTaskId),
  parentWorkerId: Schema.optional(OrchestratorWorkerId),
  spawnBudget: SpawnBudget,
  workspace: OrchestratorWorkspace,
  modelBinding: Schema.optional(Schema.suspend(() => OrchestratorWorkerModelBinding)),
  // Last turn-end update the worker self-reported via
  // `orchestrate_send_update_to_orchestrator`. Read by `get_agent_status`
  // and surfaced in the orchestrator UI so a poll cycle returns useful
  // context immediately. Optional because legacy/older workers may have
  // never posted one.
  latestUpdate: Schema.optional(Schema.suspend(() => OrchestratorWorkerUpdate)),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  terminatedAt: Schema.optional(IsoDateTime),
  terminationReason: Schema.optional(Schema.String),
});
export type OrchestratorWorker = typeof OrchestratorWorker.Type;

// Branded IDs for inter-worker messaging and dependencies
export const OrchestratorMessageId = Schema.String.pipe(Schema.brand("OrchestratorMessageId"));
export type OrchestratorMessageId = typeof OrchestratorMessageId.Type;
export const OrchestratorDependencyId = Schema.String.pipe(
  Schema.brand("OrchestratorDependencyId"),
);
export type OrchestratorDependencyId = typeof OrchestratorDependencyId.Type;

// InterWorkerMessage (read model entity for orchestrator messaging)
export const OrchestratorInterWorkerMessage = Schema.Struct({
  messageId: OrchestratorMessageId,
  fromWorkerId: OrchestratorWorkerId,
  toWorkerId: Schema.optional(OrchestratorWorkerId),
  runId: Schema.optional(OrchestratorRunId),
  broadcast: Schema.Boolean,
  content: Schema.String,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  sentAt: IsoDateTime,
});
export type OrchestratorInterWorkerMessage = typeof OrchestratorInterWorkerMessage.Type;

// Dependency (read model entity for worker dependencies)
export const OrchestratorDependency = Schema.Struct({
  dependencyId: OrchestratorDependencyId,
  fromWorkerId: OrchestratorWorkerId,
  toWorkerId: OrchestratorWorkerId,
  description: Schema.optional(Schema.String),
  setAt: IsoDateTime,
});
export type OrchestratorDependency = typeof OrchestratorDependency.Type;

// Run
export const OrchestratorRun = Schema.Struct({
  runId: OrchestratorRunId,
  projectId: ProjectId,
  userRequest: Schema.String,
  status: OrchestratorRunStatus,
  rootTaskId: OrchestratorTaskId,
  goals: Schema.Array(Schema.String),
  constraints: Schema.optional(Schema.Array(Schema.String)),
  spawnBudget: SpawnBudget,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  completedAt: Schema.optional(IsoDateTime),
  completionSummary: Schema.optional(Schema.String),
});
export type OrchestratorRun = typeof OrchestratorRun.Type;

// ---------------------------------------------------------------------------
// Task 8: Multi-Model Schemas
// ---------------------------------------------------------------------------

// ModelCandidate
export const OrchestratorModelCandidate = Schema.Struct({
  provider: ProviderKind,
  model: Schema.String,
  weight: Schema.Number,
  reason: Schema.String,
});
export type OrchestratorModelCandidate = typeof OrchestratorModelCandidate.Type;

// ModelPolicy
export const OrchestratorModelPolicy = Schema.Struct({
  executionMode: Schema.Literals(["root-direct", "worker"]),
  preferredModels: Schema.Array(OrchestratorModelCandidate),
  fallbackModels: Schema.optional(Schema.Array(OrchestratorModelCandidate)),
  requiredCapabilities: Schema.Array(RequiredCapability),
  switchPolicy: Schema.Literals(["forbidden", "allow-on-retry", "allow-on-boundary"]),
  reviewMode: Schema.Literals([
    "same-model",
    "same-provider-different-model",
    "cross-provider",
    "root-decides",
  ]),
  maxRetriesPerModel: Schema.optional(Schema.Number),
});
export type OrchestratorModelPolicy = typeof OrchestratorModelPolicy.Type;

// WorkerModelBinding
export const OrchestratorWorkerModelBinding = Schema.Struct({
  workerId: OrchestratorWorkerId,
  provider: ProviderKind,
  model: Schema.String,
  selectedAt: IsoDateTime,
  selectedBy: Schema.Literals(["root-policy", "root-override", "parent-request", "retry-policy"]),
  selectionReason: Schema.String,
  inheritedFromTaskPolicy: Schema.Boolean,
  supersedesBindingId: Schema.optional(Schema.String),
});
export type OrchestratorWorkerModelBinding = typeof OrchestratorWorkerModelBinding.Type;

// CapabilityProfile
export const OrchestratorCapabilityProfile = Schema.Struct({
  provider: ProviderKind,
  model: Schema.String,
  supports: Schema.Array(RequiredCapability),
  costTier: Schema.Literals(["low", "medium", "high"]),
  latencyTier: Schema.Literals(["low", "medium", "high"]),
});
export type OrchestratorCapabilityProfile = typeof OrchestratorCapabilityProfile.Type;

// Fallback Policy
export const FailureClass = Schema.Literals([
  "timeout",
  "tool-failure",
  "malformed-output",
  "review-rejected",
  "capability-mismatch",
  "provider-unavailable",
]);

export const FallbackAction = Schema.Struct({
  action: Schema.Literals([
    "retry-same-model",
    "retry-same-provider",
    "switch-provider",
    "escalate",
  ]),
  maxAttempts: Schema.Number,
});

export const OrchestratorFallbackPolicy = Schema.Struct({
  onTimeout: FallbackAction,
  onToolFailure: FallbackAction,
  onMalformedOutput: FallbackAction,
  onReviewRejected: FallbackAction,
  onCapabilityMismatch: FallbackAction,
  onProviderUnavailable: FallbackAction,
});
export type OrchestratorFallbackPolicy = typeof OrchestratorFallbackPolicy.Type;

// ---------------------------------------------------------------------------
// Task 9: Orchestrator Commands
// ---------------------------------------------------------------------------

// Run lifecycle
export const OrchestratorRunCreateCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.run.create"),
  commandId: CommandId,
  runId: OrchestratorRunId,
  projectId: ProjectId,
  userRequest: Schema.String,
  goals: Schema.Array(Schema.String),
  constraints: Schema.optional(Schema.Array(Schema.String)),
  spawnBudget: SpawnBudget,
  createdAt: IsoDateTime,
});

export const OrchestratorRunCancelCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.run.cancel"),
  commandId: CommandId,
  runId: OrchestratorRunId,
  reason: Schema.String,
  createdAt: IsoDateTime,
});

export const OrchestratorRunCompleteCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.run.complete"),
  commandId: CommandId,
  runId: OrchestratorRunId,
  summary: Schema.optional(Schema.String),
  createdAt: IsoDateTime,
});

const OrchestratorRunFailCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.run.fail"),
  commandId: CommandId,
  runId: OrchestratorRunId,
  reason: Schema.String,
  createdAt: IsoDateTime,
});

// Task lifecycle
export const OrchestratorTaskCreateCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.task.create"),
  commandId: CommandId,
  taskId: OrchestratorTaskId,
  runId: OrchestratorRunId,
  parentTaskId: Schema.optional(OrchestratorTaskId),
  title: Schema.String,
  objective: Schema.String,
  acceptanceCriteria: Schema.Array(Schema.String),
  stopCondition: Schema.optional(Schema.String),
  readScope: Schema.optional(Schema.Array(Schema.String)),
  writeScope: Schema.optional(Schema.Array(Schema.String)),
  allowedTools: Schema.optional(Schema.Array(Schema.String)),
  evidenceRequired: Schema.optional(Schema.Array(OrchestratorEvidenceType)),
  dependsOn: Schema.optional(Schema.Array(OrchestratorTaskId)),
  modelPolicy: Schema.optional(OrchestratorModelPolicy),
  maxIterations: Schema.optional(Schema.Number),
  createdAt: IsoDateTime,
});

const OrchestratorTaskAssignCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.task.assign"),
  commandId: CommandId,
  taskId: OrchestratorTaskId,
  assigneeKind: Schema.Literals(["orchestrator", "worker"]),
  assigneeId: Schema.optional(Schema.String),
  createdAt: IsoDateTime,
});

export const OrchestratorTaskSubmitCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.task.submit"),
  commandId: CommandId,
  taskId: OrchestratorTaskId,
  workerId: OrchestratorWorkerId,
  summary: Schema.optional(Schema.String),
  // Gap 5+6: worker reports whether its last turn produced changes. When
  // explicit `false`, accept must carry allowNoOp or be rejected. Optional
  // to preserve back-compat with older commands; absence is treated as
  // "unknown — assume true" so the invariant only fires on explicit no-ops.
  hasChanges: Schema.optional(Schema.Boolean),
  diffStats: Schema.optional(OrchestratorTaskDiffStats),
  // Gap C+F: structured submit report.
  filesWritten: Schema.optional(Schema.Array(SafeFilePath)),
  testsRun: Schema.optional(Schema.Array(OrchestratorTaskTestResult)),
  notes: Schema.optional(Schema.String),
  browserAfterScreenshotRef: Schema.optional(EvidenceArtifactId),
  browserAfterDomRef: Schema.optional(EvidenceArtifactId),
  createdAt: IsoDateTime,
});

export const OrchestratorTaskAcceptCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.task.accept"),
  commandId: CommandId,
  taskId: OrchestratorTaskId,
  summary: Schema.optional(Schema.String),
  // Gap 5+6: explicit opt-in to accept a submission with no diff.
  allowNoOp: Schema.optional(Schema.Boolean),
  createdAt: IsoDateTime,
});

export const OrchestratorTaskRejectCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.task.reject"),
  commandId: CommandId,
  taskId: OrchestratorTaskId,
  instruction: Schema.String,
  createdAt: IsoDateTime,
});

const OrchestratorTaskBlockCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.task.block"),
  commandId: CommandId,
  taskId: OrchestratorTaskId,
  reason: Schema.String,
  createdAt: IsoDateTime,
});

const OrchestratorTaskCancelCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.task.cancel"),
  commandId: CommandId,
  taskId: OrchestratorTaskId,
  reason: Schema.optional(Schema.String),
  createdAt: IsoDateTime,
});

const OrchestratorTaskFailCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.task.fail"),
  commandId: CommandId,
  taskId: OrchestratorTaskId,
  reason: Schema.String,
  createdAt: IsoDateTime,
});

// Worker lifecycle
export const OrchestratorWorkerSpawnCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.worker.spawn"),
  commandId: CommandId,
  workerId: OrchestratorWorkerId,
  runId: OrchestratorRunId,
  taskId: OrchestratorTaskId,
  threadId: ThreadId,
  spawnBudget: SpawnBudget,
  workspace: OrchestratorWorkspace,
  modelBinding: Schema.optional(OrchestratorWorkerModelBinding),
  createdAt: IsoDateTime,
});

const OrchestratorWorkerTerminateCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.worker.terminate"),
  commandId: CommandId,
  workerId: OrchestratorWorkerId,
  reason: Schema.String,
  createdAt: IsoDateTime,
});

// Worker → orchestrator status broadcast. The worker emits one of these at
// the end of every turn that doesn't terminate with `task.submit` so the
// orchestrator's polling loop returns useful context (status, summary,
// optional question) instead of an opaque "running" with empty diff.
export const OrchestratorWorkerUpdatePostCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.worker.update-post"),
  commandId: CommandId,
  workerId: OrchestratorWorkerId,
  status: Schema.suspend(() => OrchestratorWorkerUpdateStatus),
  summary: TrimmedNonEmptyString,
  question: Schema.optional(TrimmedNonEmptyString),
  nextStep: Schema.optional(TrimmedNonEmptyString),
  blockedReason: Schema.optional(TrimmedNonEmptyString),
  createdAt: IsoDateTime,
});
export type OrchestratorWorkerUpdatePostCommand = typeof OrchestratorWorkerUpdatePostCommand.Type;

// Worker pause/resume/promote/demote
export const OrchestratorWorkerPauseCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.worker.pause"),
  commandId: CommandId,
  workerId: OrchestratorWorkerId,
  reason: Schema.optional(Schema.String),
  createdAt: IsoDateTime,
});

export const OrchestratorWorkerResumeCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.worker.resume"),
  commandId: CommandId,
  workerId: OrchestratorWorkerId,
  reason: Schema.optional(Schema.String),
  createdAt: IsoDateTime,
});

export const OrchestratorWorkerPromoteCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.worker.promote"),
  commandId: CommandId,
  workerId: OrchestratorWorkerId,
  visibility: OrchestratorWorkerVisibility,
  reason: Schema.optional(Schema.String),
  createdAt: IsoDateTime,
});

export const OrchestratorWorkerDemoteCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.worker.demote"),
  commandId: CommandId,
  workerId: OrchestratorWorkerId,
  visibility: OrchestratorWorkerVisibility,
  reason: Schema.optional(Schema.String),
  createdAt: IsoDateTime,
});

// Inter-worker messaging
export const OrchestratorMessageSendCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.message.send"),
  commandId: CommandId,
  messageId: OrchestratorMessageId,
  fromWorkerId: OrchestratorWorkerId,
  toWorkerId: OrchestratorWorkerId,
  content: Schema.String,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  createdAt: IsoDateTime,
});

export const OrchestratorMessageBroadcastCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.message.broadcast"),
  commandId: CommandId,
  messageId: OrchestratorMessageId,
  fromWorkerId: OrchestratorWorkerId,
  runId: OrchestratorRunId,
  content: Schema.String,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  createdAt: IsoDateTime,
});

// Context transfer
export const OrchestratorContextTransferCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.context.transfer"),
  commandId: CommandId,
  fromWorkerId: OrchestratorWorkerId,
  toWorkerId: OrchestratorWorkerId,
  summary: Schema.String,
  artifacts: Schema.optional(Schema.Array(Schema.String)),
  createdAt: IsoDateTime,
});

// Dependency management
export const OrchestratorDependencySetCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.dependency.set"),
  commandId: CommandId,
  dependencyId: OrchestratorDependencyId,
  fromWorkerId: OrchestratorWorkerId,
  toWorkerId: OrchestratorWorkerId,
  description: Schema.optional(Schema.String),
  createdAt: IsoDateTime,
});

// Work merge
export const OrchestratorWorkMergeCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.work.merge-request"),
  commandId: CommandId,
  workerId: OrchestratorWorkerId,
  runId: OrchestratorRunId,
  sourceBranch: Schema.optional(Schema.String),
  targetBranch: Schema.optional(Schema.String),
  createdAt: IsoDateTime,
});

// Evidence and decisions
export const OrchestratorEvidenceCaptureCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.evidence.capture"),
  commandId: CommandId,
  evidenceId: OrchestratorEvidenceId,
  taskId: OrchestratorTaskId,
  workerId: Schema.optional(OrchestratorWorkerId),
  evidenceType: OrchestratorEvidenceType,
  content: Schema.String,
  contentTruncated: Schema.Boolean,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  createdAt: IsoDateTime,
});

export const OrchestratorDecisionRecordCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.decision.record"),
  commandId: CommandId,
  decisionId: OrchestratorDecisionId,
  runId: OrchestratorRunId,
  taskId: Schema.optional(OrchestratorTaskId),
  decisionType: OrchestratorDecisionType,
  reason: Schema.String,
  inputs: Schema.optional(Schema.String),
  createdAt: IsoDateTime,
});

const OrchestratorChecklistUpdateCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.checklist.update"),
  commandId: CommandId,
  taskId: OrchestratorTaskId,
  checklist: Schema.Array(OrchestratorChecklistItem),
  createdAt: IsoDateTime,
});

// ---------------------------------------------------------------------------
// Task 9: Orchestrator Event Payloads
// ---------------------------------------------------------------------------

export const OrchestratorRunCreatedPayload = Schema.Struct({
  runId: OrchestratorRunId,
  projectId: ProjectId,
  userRequest: Schema.String,
  goals: Schema.Array(Schema.String),
  constraints: Schema.optional(Schema.Array(Schema.String)),
  spawnBudget: SpawnBudget,
  createdAt: IsoDateTime,
});

export const OrchestratorRunCancelledPayload = Schema.Struct({
  runId: OrchestratorRunId,
  reason: Schema.String,
  cancelledAt: IsoDateTime,
});

export const OrchestratorRunCompletedPayload = Schema.Struct({
  runId: OrchestratorRunId,
  summary: Schema.optional(Schema.String),
  completedAt: IsoDateTime,
});

export const OrchestratorRunFailedPayload = Schema.Struct({
  runId: OrchestratorRunId,
  reason: Schema.String,
  failedAt: IsoDateTime,
});

export const OrchestratorTaskCreatedPayload = Schema.Struct({
  taskId: OrchestratorTaskId,
  runId: OrchestratorRunId,
  parentTaskId: Schema.optional(OrchestratorTaskId),
  title: Schema.String,
  objective: Schema.String,
  acceptanceCriteria: Schema.Array(Schema.String),
  stopCondition: Schema.optional(Schema.String),
  readScope: Schema.optional(Schema.Array(Schema.String)),
  writeScope: Schema.optional(Schema.Array(Schema.String)),
  allowedTools: Schema.optional(Schema.Array(Schema.String)),
  evidenceRequired: Schema.optional(Schema.Array(OrchestratorEvidenceType)),
  dependsOn: Schema.optional(Schema.Array(OrchestratorTaskId)),
  modelPolicy: Schema.optional(OrchestratorModelPolicy),
  maxIterations: Schema.optional(Schema.Number),
  createdAt: IsoDateTime,
});

export const OrchestratorTaskAssignedPayload = Schema.Struct({
  taskId: OrchestratorTaskId,
  assigneeKind: Schema.Literals(["orchestrator", "worker"]),
  assigneeId: Schema.optional(Schema.String),
  assignedAt: IsoDateTime,
});

export const OrchestratorTaskSubmittedPayload = Schema.Struct({
  taskId: OrchestratorTaskId,
  workerId: OrchestratorWorkerId,
  summary: Schema.optional(Schema.String),
  // Gap 5+6: carry the worker's self-reported change status into the event
  // so projector persists it on the task and accept can read it.
  hasChanges: Schema.optional(Schema.Boolean),
  diffStats: Schema.optional(OrchestratorTaskDiffStats),
  // Gap C+F: structured submit report.
  filesWritten: Schema.optional(Schema.Array(SafeFilePath)),
  testsRun: Schema.optional(Schema.Array(OrchestratorTaskTestResult)),
  notes: Schema.optional(Schema.String),
  browserAfterScreenshotRef: Schema.optional(EvidenceArtifactId),
  browserAfterDomRef: Schema.optional(EvidenceArtifactId),
  submittedAt: IsoDateTime,
});

export const OrchestratorTaskAcceptedPayload = Schema.Struct({
  taskId: OrchestratorTaskId,
  summary: Schema.optional(Schema.String),
  acceptedAt: IsoDateTime,
});

export const OrchestratorTaskRejectedPayload = Schema.Struct({
  taskId: OrchestratorTaskId,
  instruction: Schema.String,
  rejectedAt: IsoDateTime,
});

export const OrchestratorTaskBlockedPayload = Schema.Struct({
  taskId: OrchestratorTaskId,
  reason: Schema.String,
  blockedAt: IsoDateTime,
});

export const OrchestratorTaskCancelledPayload = Schema.Struct({
  taskId: OrchestratorTaskId,
  reason: Schema.optional(Schema.String),
  cancelledAt: IsoDateTime,
});

export const OrchestratorTaskFailedPayload = Schema.Struct({
  taskId: OrchestratorTaskId,
  reason: Schema.String,
  failedAt: IsoDateTime,
});

export const OrchestratorWorkerSpawnedPayload = Schema.Struct({
  workerId: OrchestratorWorkerId,
  runId: OrchestratorRunId,
  taskId: OrchestratorTaskId,
  threadId: ThreadId,
  spawnBudget: SpawnBudget,
  workspace: OrchestratorWorkspace,
  modelBinding: Schema.optional(OrchestratorWorkerModelBinding),
  spawnedAt: IsoDateTime,
});

export const OrchestratorWorkerTerminatedPayload = Schema.Struct({
  workerId: OrchestratorWorkerId,
  reason: Schema.String,
  terminatedAt: IsoDateTime,
});

// Event payload emitted when a worker calls `orchestrate_send_update`. The
// projector applies it to `OrchestratorWorker.latestUpdate` so subsequent
// `get_agent_status` polls return the worker's self-reported posture.
export const OrchestratorWorkerUpdatePostedPayload = Schema.Struct({
  workerId: OrchestratorWorkerId,
  status: Schema.suspend(() => OrchestratorWorkerUpdateStatus),
  summary: TrimmedNonEmptyString,
  question: Schema.optional(TrimmedNonEmptyString),
  nextStep: Schema.optional(TrimmedNonEmptyString),
  blockedReason: Schema.optional(TrimmedNonEmptyString),
  postedAt: IsoDateTime,
});
export type OrchestratorWorkerUpdatePostedPayload =
  typeof OrchestratorWorkerUpdatePostedPayload.Type;

export const OrchestratorWorkerPausedPayload = Schema.Struct({
  workerId: OrchestratorWorkerId,
  reason: Schema.optional(Schema.String),
  pausedAt: IsoDateTime,
});

export const OrchestratorWorkerResumedPayload = Schema.Struct({
  workerId: OrchestratorWorkerId,
  reason: Schema.optional(Schema.String),
  resumedAt: IsoDateTime,
});

export const OrchestratorWorkerPromotedPayload = Schema.Struct({
  workerId: OrchestratorWorkerId,
  visibility: OrchestratorWorkerVisibility,
  reason: Schema.optional(Schema.String),
  promotedAt: IsoDateTime,
});

export const OrchestratorWorkerDemotedPayload = Schema.Struct({
  workerId: OrchestratorWorkerId,
  visibility: OrchestratorWorkerVisibility,
  reason: Schema.optional(Schema.String),
  demotedAt: IsoDateTime,
});

export const OrchestratorMessageSentPayload = Schema.Struct({
  messageId: OrchestratorMessageId,
  fromWorkerId: OrchestratorWorkerId,
  toWorkerId: OrchestratorWorkerId,
  content: Schema.String,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  sentAt: IsoDateTime,
});

export const OrchestratorMessageBroadcastSentPayload = Schema.Struct({
  messageId: OrchestratorMessageId,
  fromWorkerId: OrchestratorWorkerId,
  runId: OrchestratorRunId,
  content: Schema.String,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  sentAt: IsoDateTime,
});

export const OrchestratorContextTransferredPayload = Schema.Struct({
  fromWorkerId: OrchestratorWorkerId,
  toWorkerId: OrchestratorWorkerId,
  summary: Schema.String,
  artifacts: Schema.optional(Schema.Array(Schema.String)),
  transferredAt: IsoDateTime,
});

export const OrchestratorDependencySetPayload = Schema.Struct({
  dependencyId: OrchestratorDependencyId,
  fromWorkerId: OrchestratorWorkerId,
  toWorkerId: OrchestratorWorkerId,
  description: Schema.optional(Schema.String),
  setAt: IsoDateTime,
});

export const OrchestratorWorkMergeRequestedPayload = Schema.Struct({
  workerId: OrchestratorWorkerId,
  runId: OrchestratorRunId,
  sourceBranch: Schema.optional(Schema.String),
  targetBranch: Schema.optional(Schema.String),
  requestedAt: IsoDateTime,
});

export const OrchestratorWorkMergeCompletedPayload = Schema.Struct({
  workerId: OrchestratorWorkerId,
  runId: OrchestratorRunId,
  sourceBranch: Schema.optional(Schema.String),
  targetBranch: Schema.optional(Schema.String),
  completedAt: IsoDateTime,
});

export const OrchestratorWorkMergeFailedPayload = Schema.Struct({
  workerId: OrchestratorWorkerId,
  runId: OrchestratorRunId,
  reason: Schema.String,
  failedAt: IsoDateTime,
});

export const OrchestratorEvidenceCapturedPayload = Schema.Struct({
  evidenceId: OrchestratorEvidenceId,
  taskId: OrchestratorTaskId,
  workerId: Schema.optional(OrchestratorWorkerId),
  evidenceType: OrchestratorEvidenceType,
  content: Schema.String,
  contentTruncated: Schema.Boolean,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  capturedAt: IsoDateTime,
});

export const OrchestratorDecisionRecordedPayload = Schema.Struct({
  decisionId: OrchestratorDecisionId,
  runId: OrchestratorRunId,
  taskId: Schema.optional(OrchestratorTaskId),
  decisionType: OrchestratorDecisionType,
  reason: Schema.String,
  inputs: Schema.optional(Schema.String),
  recordedAt: IsoDateTime,
});

export const OrchestratorChecklistUpdatedPayload = Schema.Struct({
  taskId: OrchestratorTaskId,
  checklist: Schema.Array(OrchestratorChecklistItem),
  updatedAt: IsoDateTime,
});

// ---------------------------------------------------------------------------
// Orchestrator WS Input/Output Schemas
// ---------------------------------------------------------------------------

export const OrchestratorCreateRunInput = Schema.Struct({
  userRequest: Schema.String,
  goals: Schema.Array(Schema.String),
  constraints: Schema.optional(Schema.Array(Schema.String)),
  spawnBudget: SpawnBudget,
  projectId: ProjectId,
});
export type OrchestratorCreateRunInput = typeof OrchestratorCreateRunInput.Type;

export const OrchestratorCancelRunInput = Schema.Struct({
  runId: OrchestratorRunId,
  reason: Schema.String,
});
export type OrchestratorCancelRunInput = typeof OrchestratorCancelRunInput.Type;

export const OrchestratorGetRunInput = Schema.Struct({
  runId: OrchestratorRunId,
});
export type OrchestratorGetRunInput = typeof OrchestratorGetRunInput.Type;

export const OrchestratorGetActiveRunsInput = Schema.Struct({});
export type OrchestratorGetActiveRunsInput = typeof OrchestratorGetActiveRunsInput.Type;

export const OrchestratorGetTaskTreeInput = Schema.Struct({
  runId: OrchestratorRunId,
});
export type OrchestratorGetTaskTreeInput = typeof OrchestratorGetTaskTreeInput.Type;

export const OrchestratorGetWorkersInput = Schema.Struct({
  runId: OrchestratorRunId,
});
export type OrchestratorGetWorkersInput = typeof OrchestratorGetWorkersInput.Type;

export const OrchestratorGetEvidenceInput = Schema.Struct({
  taskId: OrchestratorTaskId,
});
export type OrchestratorGetEvidenceInput = typeof OrchestratorGetEvidenceInput.Type;

export const OrchestratorGetDecisionsInput = Schema.Struct({
  runId: OrchestratorRunId,
  taskId: Schema.optional(OrchestratorTaskId),
});
export type OrchestratorGetDecisionsInput = typeof OrchestratorGetDecisionsInput.Type;

export const OrchestratorGetRunEventsInput = Schema.Struct({
  runId: OrchestratorRunId,
});
export type OrchestratorGetRunEventsInput = typeof OrchestratorGetRunEventsInput.Type;

export const OrchestratorSelectReviewModelInput = Schema.Struct({
  runId: OrchestratorRunId,
  taskId: OrchestratorTaskId,
  implementationBinding: OrchestratorWorkerModelBinding,
  reviewMode: Schema.Literals([
    "same-model",
    "same-provider-different-model",
    "cross-provider",
    "root-decides",
  ]),
});
export type OrchestratorSelectReviewModelInput = typeof OrchestratorSelectReviewModelInput.Type;

export const ProviderGetStatusesInput = Schema.Struct({});
export type ProviderGetStatusesInput = typeof ProviderGetStatusesInput.Type;

export const OrchestrationRpcSchemas = {
  getSnapshot: {
    input: OrchestrationGetSnapshotInput,
    output: OrchestrationGetSnapshotResult,
  },
  dispatchCommand: {
    input: ClientOrchestrationCommand,
    output: DispatchResult,
  },
  getTurnDiff: {
    input: OrchestrationGetTurnDiffInput,
    output: OrchestrationGetTurnDiffResult,
  },
  getFullThreadDiff: {
    input: OrchestrationGetFullThreadDiffInput,
    output: OrchestrationGetFullThreadDiffResult,
  },
  replayEvents: {
    input: OrchestrationReplayEventsInput,
    output: OrchestrationReplayEventsResult,
  },
} as const;
