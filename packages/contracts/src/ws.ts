import { Schema, Struct } from "effect";
import { NonNegativeInt, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas";

import {
  ClientOrchestrationCommand,
  OrchestrationEvent,
  ORCHESTRATION_WS_CHANNELS,
  OrchestrationGetFullThreadDiffInput,
  ORCHESTRATION_WS_METHODS,
  OrchestrationGetSnapshotInput,
  OrchestrationGetTurnDiffInput,
  OrchestrationReplayEventsInput,
} from "./orchestration";
import {
  GitActionProgressEvent,
  GitCheckoutInput,
  GitCreateBranchInput,
  GitCreateDetachedWorktreeInput,
  GitHandoffThreadInput,
  GitPreparePullRequestThreadInput,
  GitCreateWorktreeInput,
  GitInitInput,
  GitListBranchesInput,
  GitPullInput,
  GitPullRequestRefInput,
  GitRemoveWorktreeInput,
  GitRunStackedActionInput,
  GitStatusInput,
} from "./git";
import {
  TerminalClearInput,
  TerminalCloseInput,
  TerminalEvent,
  TerminalOpenInput,
  TerminalResizeInput,
  TerminalRestartInput,
  TerminalWriteInput,
} from "./terminal";
import { KeybindingRule } from "./keybindings";
import { ProjectSearchEntriesInput, ProjectWriteFileInput } from "./project";
import { OpenInEditorInput } from "./editor";
import { ServerConfigUpdatedPayload } from "./server";
import {
  BrowserActInput,
  BrowserAddAnnotationInput,
  BrowserCloseSessionInput,
  BrowserListAnnotationsInput,
  BrowserObservation,
  BrowserOpenSessionInput,
} from "./browser";
import {
  BrowserControlAcquireInput,
  BrowserControlReleaseInput,
  EvidenceArtifactGetInput,
  BrowserWorkflowListInput,
  BrowserWorkflowRunInput,
  BrowserWorkflowStartInput,
  EvidenceBundleCreateInput,
  EvidenceBundleGetInput,
  PreviewDetectInput,
  PreviewInstanceInput,
  PreviewStartInput,
  PreviewStopInput,
  PreviewTargetGetInput,
  PreviewTargetListInput,
  ReviewerDecisionCreateInput,
  ReviewerDecisionGetInput,
  ReviewerDecisionListInput,
} from "./browserOrchestration";
import {
  ProviderListCommandsInput,
  ProviderGetComposerCapabilitiesInput,
  ProviderListPluginsInput,
  ProviderListModelsInput,
  ProviderReadPluginInput,
  ProviderListSkillsInput,
} from "./providerDiscovery";

// ── WebSocket RPC Method Names ───────────────────────────────────────

export const WS_METHODS = {
  // Project registry methods
  projectsList: "projects.list",
  projectsAdd: "projects.add",
  projectsRemove: "projects.remove",
  projectsSearchEntries: "projects.searchEntries",
  projectsWriteFile: "projects.writeFile",

  // Shell methods
  shellOpenInEditor: "shell.openInEditor",

  // Git methods
  gitPull: "git.pull",
  gitStatus: "git.status",
  gitRunStackedAction: "git.runStackedAction",
  gitListBranches: "git.listBranches",
  gitCreateWorktree: "git.createWorktree",
  gitCreateDetachedWorktree: "git.createDetachedWorktree",
  gitRemoveWorktree: "git.removeWorktree",
  gitCreateBranch: "git.createBranch",
  gitCheckout: "git.checkout",
  gitInit: "git.init",
  gitHandoffThread: "git.handoffThread",
  gitResolvePullRequest: "git.resolvePullRequest",
  gitPreparePullRequestThread: "git.preparePullRequestThread",

  // Terminal methods
  terminalOpen: "terminal.open",
  terminalWrite: "terminal.write",
  terminalResize: "terminal.resize",
  terminalClear: "terminal.clear",
  terminalRestart: "terminal.restart",
  terminalClose: "terminal.close",

  // Server meta
  serverGetConfig: "server.getConfig",
  serverUpsertKeybinding: "server.upsertKeybinding",
  browserOpenPreview: "browser.openPreview",
  browserOpenSession: "browser.openSession",
  browserAct: "browser.act",
  browserCloseSession: "browser.closeSession",
  browserControlAcquire: "browser.control.acquire",
  browserControlRelease: "browser.control.release",
  browserAddAnnotation: "browser.addAnnotation",
  browserListAnnotations: "browser.listAnnotations",
  browserWorkflowStart: "browser.workflow.start",
  browserWorkflowStatus: "browser.workflow.status",
  browserWorkflowGet: "browser.workflow.get",
  browserWorkflowCancel: "browser.workflow.cancel",
  browserWorkflowList: "browser.workflow.list",
  evidenceArtifactGet: "evidence.artifact.get",
  evidenceBundleCreate: "evidence.bundle.create",
  evidenceBundleGet: "evidence.bundle.get",
  reviewerDecisionCreate: "reviewer.decision.create",
  reviewerDecisionGet: "reviewer.decision.get",
  reviewerDecisionList: "reviewer.decision.list",
  previewDetect: "preview.detect",
  previewStart: "preview.start",
  previewStop: "preview.stop",
  previewRestart: "preview.restart",
  previewStatus: "preview.status",
  previewLogs: "preview.logs",
  previewTargetGet: "preview.target.get",
  previewTargetList: "preview.target.list",

  // Provider discovery
  providerGetComposerCapabilities: "provider.getComposerCapabilities",
  providerListCommands: "provider.listCommands",
  providerListSkills: "provider.listSkills",
  providerListPlugins: "provider.listPlugins",
  providerReadPlugin: "provider.readPlugin",
  providerListModels: "provider.listModels",
} as const;

// ── Push Event Channels ──────────────────────────────────────────────

export const WS_CHANNELS = {
  gitActionProgress: "git.actionProgress",
  terminalEvent: "terminal.event",
  serverWelcome: "server.welcome",
  serverConfigUpdated: "server.configUpdated",
  serverProvidersUpdated: "server.providersUpdated",
  browserOpenRequested: "browser.openRequested",
  browserObservationCaptured: "browser.observationCaptured",
} as const;

export const BrowserOpenPreviewInput = Schema.Struct({
  threadId: ThreadId,
  url: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(2_048))),
});
export type BrowserOpenPreviewInput = typeof BrowserOpenPreviewInput.Type;

export const BrowserOpenPreviewRequestedPayload = Schema.Struct({
  threadId: ThreadId,
  url: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(2_048))),
});
export type BrowserOpenPreviewRequestedPayload = typeof BrowserOpenPreviewRequestedPayload.Type;

export const BrowserObservationCapturedPayload = Schema.Struct({
  threadId: ThreadId,
  observation: BrowserObservation,
  actionSummary: Schema.String.check(Schema.isMaxLength(256)),
});
export type BrowserObservationCapturedPayload = typeof BrowserObservationCapturedPayload.Type;

export const ServerProvidersUpdatedPayload = Schema.Struct({
  providers: Schema.Array(Schema.Unknown),
});
export type ServerProvidersUpdatedPayload = typeof ServerProvidersUpdatedPayload.Type;

// -- Tagged Union of all request body schemas ─────────────────────────

const tagRequestBody = <const Tag extends string, const Fields extends Schema.Struct.Fields>(
  tag: Tag,
  schema: Schema.Struct<Fields>,
) =>
  schema.mapFields(
    Struct.assign({ _tag: Schema.tag(tag) }),
    // PreserveChecks is safe here. No existing schema should have checks depending on the tag
    { unsafePreserveChecks: true },
  );

const WebSocketRequestBody = Schema.Union([
  // Orchestration methods
  tagRequestBody(
    ORCHESTRATION_WS_METHODS.dispatchCommand,
    Schema.Struct({ command: ClientOrchestrationCommand }),
  ),
  tagRequestBody(ORCHESTRATION_WS_METHODS.getSnapshot, OrchestrationGetSnapshotInput),
  tagRequestBody(ORCHESTRATION_WS_METHODS.getTurnDiff, OrchestrationGetTurnDiffInput),
  tagRequestBody(ORCHESTRATION_WS_METHODS.getFullThreadDiff, OrchestrationGetFullThreadDiffInput),
  tagRequestBody(ORCHESTRATION_WS_METHODS.replayEvents, OrchestrationReplayEventsInput),

  // Project Search
  tagRequestBody(WS_METHODS.projectsSearchEntries, ProjectSearchEntriesInput),
  tagRequestBody(WS_METHODS.projectsWriteFile, ProjectWriteFileInput),

  // Shell methods
  tagRequestBody(WS_METHODS.shellOpenInEditor, OpenInEditorInput),

  // Git methods
  tagRequestBody(WS_METHODS.gitPull, GitPullInput),
  tagRequestBody(WS_METHODS.gitStatus, GitStatusInput),
  tagRequestBody(WS_METHODS.gitRunStackedAction, GitRunStackedActionInput),
  tagRequestBody(WS_METHODS.gitListBranches, GitListBranchesInput),
  tagRequestBody(WS_METHODS.gitCreateWorktree, GitCreateWorktreeInput),
  tagRequestBody(WS_METHODS.gitCreateDetachedWorktree, GitCreateDetachedWorktreeInput),
  tagRequestBody(WS_METHODS.gitRemoveWorktree, GitRemoveWorktreeInput),
  tagRequestBody(WS_METHODS.gitCreateBranch, GitCreateBranchInput),
  tagRequestBody(WS_METHODS.gitCheckout, GitCheckoutInput),
  tagRequestBody(WS_METHODS.gitInit, GitInitInput),
  tagRequestBody(WS_METHODS.gitHandoffThread, GitHandoffThreadInput),
  tagRequestBody(WS_METHODS.gitResolvePullRequest, GitPullRequestRefInput),
  tagRequestBody(WS_METHODS.gitPreparePullRequestThread, GitPreparePullRequestThreadInput),

  // Terminal methods
  tagRequestBody(WS_METHODS.terminalOpen, TerminalOpenInput),
  tagRequestBody(WS_METHODS.terminalWrite, TerminalWriteInput),
  tagRequestBody(WS_METHODS.terminalResize, TerminalResizeInput),
  tagRequestBody(WS_METHODS.terminalClear, TerminalClearInput),
  tagRequestBody(WS_METHODS.terminalRestart, TerminalRestartInput),
  tagRequestBody(WS_METHODS.terminalClose, TerminalCloseInput),

  // Server meta
  tagRequestBody(WS_METHODS.serverGetConfig, Schema.Struct({})),
  tagRequestBody(WS_METHODS.serverUpsertKeybinding, KeybindingRule),
  tagRequestBody(WS_METHODS.browserOpenPreview, BrowserOpenPreviewInput),
  tagRequestBody(WS_METHODS.browserOpenSession, BrowserOpenSessionInput),
  tagRequestBody(WS_METHODS.browserAct, BrowserActInput),
  tagRequestBody(WS_METHODS.browserCloseSession, BrowserCloseSessionInput),
  tagRequestBody(WS_METHODS.browserControlAcquire, BrowserControlAcquireInput),
  tagRequestBody(WS_METHODS.browserControlRelease, BrowserControlReleaseInput),
  tagRequestBody(WS_METHODS.browserAddAnnotation, BrowserAddAnnotationInput),
  tagRequestBody(WS_METHODS.browserListAnnotations, BrowserListAnnotationsInput),
  tagRequestBody(WS_METHODS.browserWorkflowStart, BrowserWorkflowStartInput),
  tagRequestBody(WS_METHODS.browserWorkflowStatus, BrowserWorkflowRunInput),
  tagRequestBody(WS_METHODS.browserWorkflowGet, BrowserWorkflowRunInput),
  tagRequestBody(WS_METHODS.browserWorkflowCancel, BrowserWorkflowRunInput),
  tagRequestBody(WS_METHODS.browserWorkflowList, BrowserWorkflowListInput),
  tagRequestBody(WS_METHODS.evidenceArtifactGet, EvidenceArtifactGetInput),
  tagRequestBody(WS_METHODS.evidenceBundleCreate, EvidenceBundleCreateInput),
  tagRequestBody(WS_METHODS.evidenceBundleGet, EvidenceBundleGetInput),
  tagRequestBody(WS_METHODS.reviewerDecisionCreate, ReviewerDecisionCreateInput),
  tagRequestBody(WS_METHODS.reviewerDecisionGet, ReviewerDecisionGetInput),
  tagRequestBody(WS_METHODS.reviewerDecisionList, ReviewerDecisionListInput),
  tagRequestBody(WS_METHODS.previewDetect, PreviewDetectInput),
  tagRequestBody(WS_METHODS.previewStart, PreviewStartInput),
  tagRequestBody(WS_METHODS.previewStop, PreviewStopInput),
  tagRequestBody(WS_METHODS.previewRestart, PreviewInstanceInput),
  tagRequestBody(WS_METHODS.previewStatus, PreviewInstanceInput),
  tagRequestBody(WS_METHODS.previewLogs, PreviewInstanceInput),
  tagRequestBody(WS_METHODS.previewTargetGet, PreviewTargetGetInput),
  tagRequestBody(WS_METHODS.previewTargetList, PreviewTargetListInput),

  // Provider discovery
  tagRequestBody(WS_METHODS.providerGetComposerCapabilities, ProviderGetComposerCapabilitiesInput),
  tagRequestBody(WS_METHODS.providerListCommands, ProviderListCommandsInput),
  tagRequestBody(WS_METHODS.providerListSkills, ProviderListSkillsInput),
  tagRequestBody(WS_METHODS.providerListPlugins, ProviderListPluginsInput),
  tagRequestBody(WS_METHODS.providerReadPlugin, ProviderReadPluginInput),
  tagRequestBody(WS_METHODS.providerListModels, ProviderListModelsInput),
]);

export const WebSocketRequest = Schema.Struct({
  id: TrimmedNonEmptyString,
  body: WebSocketRequestBody,
});
export type WebSocketRequest = typeof WebSocketRequest.Type;

export const WebSocketResponse = Schema.Struct({
  id: TrimmedNonEmptyString,
  result: Schema.optional(Schema.Unknown),
  error: Schema.optional(
    Schema.Struct({
      message: Schema.String,
    }),
  ),
});
export type WebSocketResponse = typeof WebSocketResponse.Type;

export const WsPushSequence = NonNegativeInt;
export type WsPushSequence = typeof WsPushSequence.Type;

export const WsWelcomePayload = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  homeDir: Schema.optional(TrimmedNonEmptyString),
  projectName: TrimmedNonEmptyString,
  bootstrapProjectId: Schema.optional(ProjectId),
  bootstrapThreadId: Schema.optional(ThreadId),
});
export type WsWelcomePayload = typeof WsWelcomePayload.Type;

export interface WsPushPayloadByChannel {
  readonly [WS_CHANNELS.serverWelcome]: WsWelcomePayload;
  readonly [WS_CHANNELS.serverConfigUpdated]: typeof ServerConfigUpdatedPayload.Type;
  readonly [WS_CHANNELS.serverProvidersUpdated]: ServerProvidersUpdatedPayload;
  readonly [WS_CHANNELS.gitActionProgress]: typeof GitActionProgressEvent.Type;
  readonly [WS_CHANNELS.terminalEvent]: typeof TerminalEvent.Type;
  readonly [WS_CHANNELS.browserOpenRequested]: BrowserOpenPreviewRequestedPayload;
  readonly [WS_CHANNELS.browserObservationCaptured]: BrowserObservationCapturedPayload;
  readonly [ORCHESTRATION_WS_CHANNELS.domainEvent]: OrchestrationEvent;
}

export type WsPushChannel = keyof WsPushPayloadByChannel;
export type WsPushData<C extends WsPushChannel> = WsPushPayloadByChannel[C];

const makeWsPushSchema = <const Channel extends string, Payload extends Schema.Schema<any>>(
  channel: Channel,
  payload: Payload,
) =>
  Schema.Struct({
    type: Schema.Literal("push"),
    sequence: WsPushSequence,
    channel: Schema.Literal(channel),
    data: payload,
  });

export const WsPushServerWelcome = makeWsPushSchema(WS_CHANNELS.serverWelcome, WsWelcomePayload);
export const WsPushServerConfigUpdated = makeWsPushSchema(
  WS_CHANNELS.serverConfigUpdated,
  ServerConfigUpdatedPayload,
);
export const WsPushServerProvidersUpdated = makeWsPushSchema(
  WS_CHANNELS.serverProvidersUpdated,
  ServerProvidersUpdatedPayload,
);
export const WsPushGitActionProgress = makeWsPushSchema(
  WS_CHANNELS.gitActionProgress,
  GitActionProgressEvent,
);
export const WsPushTerminalEvent = makeWsPushSchema(WS_CHANNELS.terminalEvent, TerminalEvent);
export const WsPushBrowserOpenRequested = makeWsPushSchema(
  WS_CHANNELS.browserOpenRequested,
  BrowserOpenPreviewRequestedPayload,
);
export const WsPushBrowserObservationCaptured = makeWsPushSchema(
  WS_CHANNELS.browserObservationCaptured,
  BrowserObservationCapturedPayload,
);
export const WsPushOrchestrationDomainEvent = makeWsPushSchema(
  ORCHESTRATION_WS_CHANNELS.domainEvent,
  OrchestrationEvent,
);

export const WsPushChannelSchema = Schema.Literals([
  WS_CHANNELS.gitActionProgress,
  WS_CHANNELS.serverWelcome,
  WS_CHANNELS.serverConfigUpdated,
  WS_CHANNELS.serverProvidersUpdated,
  WS_CHANNELS.terminalEvent,
  WS_CHANNELS.browserOpenRequested,
  WS_CHANNELS.browserObservationCaptured,
  ORCHESTRATION_WS_CHANNELS.domainEvent,
]);
export type WsPushChannelSchema = typeof WsPushChannelSchema.Type;

export const WsPush = Schema.Union([
  WsPushServerWelcome,
  WsPushServerConfigUpdated,
  WsPushServerProvidersUpdated,
  WsPushGitActionProgress,
  WsPushTerminalEvent,
  WsPushBrowserOpenRequested,
  WsPushBrowserObservationCaptured,
  WsPushOrchestrationDomainEvent,
]);
export type WsPush = typeof WsPush.Type;

export type WsPushMessage<C extends WsPushChannel> = Extract<WsPush, { channel: C }>;

export const WsPushEnvelopeBase = Schema.Struct({
  type: Schema.Literal("push"),
  sequence: WsPushSequence,
  channel: WsPushChannelSchema,
  data: Schema.Unknown,
});
export type WsPushEnvelopeBase = typeof WsPushEnvelopeBase.Type;

// ── Union of all server → client messages ─────────────────────────────

export const WsResponse = Schema.Union([WebSocketResponse, WsPush]);
export type WsResponse = typeof WsResponse.Type;
