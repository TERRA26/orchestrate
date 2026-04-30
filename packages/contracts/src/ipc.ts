import type {
  GitCheckoutInput,
  GitActionProgressEvent,
  GitCreateBranchInput,
  GitCreateDetachedWorktreeInput,
  GitCreateDetachedWorktreeResult,
  GitHandoffThreadInput,
  GitHandoffThreadResult,
  GitPreparePullRequestThreadInput,
  GitPreparePullRequestThreadResult,
  GitPullRequestRefInput,
  GitCreateWorktreeInput,
  GitCreateWorktreeResult,
  GitInitInput,
  GitListBranchesInput,
  GitListBranchesResult,
  GitPullInput,
  GitPullResult,
  GitRemoveWorktreeInput,
  GitResolvePullRequestResult,
  GitRunStackedActionInput,
  GitRunStackedActionResult,
  GitStatusInput,
  GitStatusResult,
} from "./git";
import type { BrowserSessionEventPushPayload } from "./ws";
import type {
  ProjectSearchEntriesInput,
  ProjectSearchEntriesResult,
  ProjectReadFileInput,
  ProjectReadFileResult,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
} from "./project";
import type { ServerConfig } from "./server";
import type {
  TerminalClearInput,
  TerminalCloseInput,
  TerminalEvent,
  TerminalOpenInput,
  TerminalResizeInput,
  TerminalRestartInput,
  TerminalSessionSnapshot,
  TerminalWriteInput,
} from "./terminal";
import type {
  ServerUpdateSettingsInput,
  ServerUpdateSettingsResult,
  ServerUpsertKeybindingInput,
  ServerUpsertKeybindingResult,
} from "./server";
import type {
  ClientOrchestrationCommand,
  OrchestrationGetFullThreadDiffInput,
  OrchestrationGetFullThreadDiffResult,
  OrchestrationGetTurnDiffInput,
  OrchestrationGetTurnDiffResult,
  OrchestrationEvent,
  OrchestrationReadModel,
} from "./orchestration";
import { EditorId } from "./editor";
import type { ThreadId } from "./baseSchemas";
import type {
  BrowserActInput,
  BrowserActResult,
  BrowserAddAnnotationInput,
  BrowserAnnotationResolveTargetAtPointInput,
  BrowserAnnotationResolveTargetAtPointResult,
  BrowserAnnotationInput,
  BrowserAnnotationResult,
  BrowserAnnotationsResult,
  BrowserCloseSessionInput,
  BrowserInspectSessionInput,
  BrowserInspectResult,
  BrowserObserveSessionInput,
  BrowserListAnnotationsInput,
  BrowserObservation,
  BrowserOpenSessionInput,
  BrowserOpenSessionResult,
  BrowserCdpEndpointInfo,
  BrowserResolveTargetSessionInput,
  BrowserResolveTargetSessionResult,
} from "./browser";
import type {
  EvidenceArtifactContentResult,
  EvidenceArtifactGetInput,
  EvidenceBundleCreateInput,
  EvidenceBundleCreateResult,
  EvidenceBundleGetInput,
  EvidenceBundleGetResult,
  BrowserControlObserveFreshInput,
  BrowserControlHumanInputInput,
  BrowserControlPauseInput,
  BrowserControlReleaseInput,
  BrowserControlSessionInput,
  BrowserControlStatusResult,
  BrowserControlTakeInput,
  BrowserControlLeaseResult,
  BrowserWorkflowListInput,
  BrowserWorkflowListResult,
  BrowserWorkflowRunInput,
  BrowserWorkflowRunResult,
  BrowserWorkflowStartInput,
  BrowserWorkflowStartResult,
  PreviewDetectInput,
  PreviewDetectResult,
  PreviewInstanceInput,
  PreviewLogsResult,
  PreviewStartInput,
  PreviewStartResult,
  PreviewStatusResult,
  PreviewStopInput,
  PreviewTargetGetInput,
  PreviewTargetListInput,
  PreviewTargetListResult,
  ReviewerDecisionCreateInput,
  ReviewerDecisionCreateResult,
  ReviewerDecisionGetInput,
  ReviewerDecisionGetResult,
  ReviewerDecisionListInput,
  ReviewerDecisionListResult,
  ReviewerReworkStartInput,
  ReviewerReworkStartResult,
  BrowserApprovalGetInput,
  BrowserApprovalListInput,
  BrowserApprovalListResult,
  BrowserApprovalRespondInput,
  BrowserApprovalResult,
} from "./browserOrchestration";
import type {
  ProviderComposerCapabilities,
  ProviderGetComposerCapabilitiesInput,
  ProviderListCommandsInput,
  ProviderListCommandsResult,
  ProviderListModelsInput,
  ProviderListModelsResult,
  ProviderListPluginsInput,
  ProviderListPluginsResult,
  ProviderListSkillsInput,
  ProviderListSkillsResult,
  ProviderReadPluginInput,
  ProviderReadPluginResult,
} from "./providerDiscovery";

export interface ContextMenuItem<T extends string = string> {
  id: T;
  label: string;
  destructive?: boolean;
}

export type DesktopUpdateStatus =
  | "disabled"
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "downloaded"
  | "error";

export type DesktopRuntimeArch = "arm64" | "x64" | "other";
export type DesktopTheme = "light" | "dark" | "system";

export interface DesktopRuntimeInfo {
  hostArch: DesktopRuntimeArch;
  appArch: DesktopRuntimeArch;
  runningUnderArm64Translation: boolean;
}

export interface DesktopUpdateState {
  enabled: boolean;
  status: DesktopUpdateStatus;
  currentVersion: string;
  hostArch: DesktopRuntimeArch;
  appArch: DesktopRuntimeArch;
  runningUnderArm64Translation: boolean;
  availableVersion: string | null;
  downloadedVersion: string | null;
  downloadPercent: number | null;
  checkedAt: string | null;
  message: string | null;
  errorContext: "check" | "download" | "install" | null;
  canRetry: boolean;
}

export interface DesktopUpdateActionResult {
  accepted: boolean;
  completed: boolean;
  state: DesktopUpdateState;
}

export interface BrowserTabState {
  id: string;
  url: string;
  title: string;
  status: "live" | "suspended";
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  faviconUrl: string | null;
  lastCommittedUrl: string | null;
  lastError: string | null;
}

export interface ThreadBrowserState {
  threadId: ThreadId;
  open: boolean;
  activeTabId: string | null;
  activeBrowserSessionId?: string | null;
  activeDesktopClientId?: string | null;
  tabs: BrowserTabState[];
  lastError: string | null;
  lastHumanInput?: BrowserHumanInputEvent;
}

export interface BrowserHumanInputEvent {
  browserSessionId: string;
  kind: "mouse" | "keyboard" | "navigation" | "focus" | "manual";
  url?: string;
  occurredAt: string;
}

export interface BrowserOpenInput {
  threadId: ThreadId;
  initialUrl?: string;
}

export interface BrowserThreadInput {
  threadId: ThreadId;
}

export interface BrowserTabInput {
  threadId: ThreadId;
  tabId: string;
}

export interface BrowserNavigateInput {
  threadId: ThreadId;
  tabId?: string;
  url: string;
}

export interface BrowserNewTabInput {
  threadId: ThreadId;
  url?: string;
  activate?: boolean;
}

export interface BrowserPanelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserSetPanelBoundsInput {
  threadId: ThreadId;
  bounds: BrowserPanelBounds | null;
}

export interface DesktopNotificationInput {
  title: string;
  body?: string;
  silent?: boolean;
  threadId?: ThreadId;
}

export interface DesktopBridge {
  getWsUrl: () => string | null;
  pickFolder: () => Promise<string | null>;
  confirm: (message: string) => Promise<boolean>;
  setTheme: (theme: DesktopTheme) => Promise<void>;
  showContextMenu: <T extends string>(
    items: readonly ContextMenuItem<T>[],
    position?: { x: number; y: number },
  ) => Promise<T | null>;
  openExternal: (url: string) => Promise<boolean>;
  onMenuAction: (listener: (action: string) => void) => () => void;
  getUpdateState: () => Promise<DesktopUpdateState>;
  downloadUpdate: () => Promise<DesktopUpdateActionResult>;
  installUpdate: () => Promise<DesktopUpdateActionResult>;
  onUpdateState: (listener: (state: DesktopUpdateState) => void) => () => void;
  notifications: {
    isSupported: () => Promise<boolean>;
    show: (input: DesktopNotificationInput) => Promise<boolean>;
  };
  browser: {
    open: (input: BrowserOpenInput) => Promise<ThreadBrowserState>;
    close: (input: BrowserThreadInput) => Promise<ThreadBrowserState>;
    hide: (input: BrowserThreadInput) => Promise<void>;
    getState: (input: BrowserThreadInput) => Promise<ThreadBrowserState>;
    setPanelBounds: (input: BrowserSetPanelBoundsInput) => Promise<ThreadBrowserState>;
    navigate: (input: BrowserNavigateInput) => Promise<ThreadBrowserState>;
    reload: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    goBack: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    goForward: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    newTab: (input: BrowserNewTabInput) => Promise<ThreadBrowserState>;
    closeTab: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    selectTab: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    openDevTools: (input: BrowserTabInput) => Promise<void>;
    openSession: (input: BrowserOpenSessionInput) => Promise<BrowserOpenSessionResult>;
    observeSession: (input: BrowserObserveSessionInput) => Promise<BrowserObservation>;
    inspectSession: (input: BrowserInspectSessionInput) => Promise<BrowserInspectResult>;
    resolveTargetSession: (
      input: BrowserResolveTargetSessionInput,
    ) => Promise<BrowserResolveTargetSessionResult>;
    resolveAnnotationTargetAtPoint: (
      input: BrowserAnnotationResolveTargetAtPointInput,
    ) => Promise<BrowserAnnotationResolveTargetAtPointResult>;
    actSession: (input: BrowserActInput) => Promise<BrowserObservation>;
    closeSession: (input: BrowserCloseSessionInput) => Promise<void>;
    getCdpEndpoint: () => Promise<BrowserCdpEndpointInfo>;
    onState: (listener: (state: ThreadBrowserState) => void) => () => void;
    onObservation: () => () => void;
  };
}

export interface NativeApi {
  dialogs: {
    pickFolder: () => Promise<string | null>;
    confirm: (message: string) => Promise<boolean>;
  };
  terminal: {
    open: (input: TerminalOpenInput) => Promise<TerminalSessionSnapshot>;
    write: (input: TerminalWriteInput) => Promise<void>;
    resize: (input: TerminalResizeInput) => Promise<void>;
    clear: (input: TerminalClearInput) => Promise<void>;
    restart: (input: TerminalRestartInput) => Promise<TerminalSessionSnapshot>;
    close: (input: TerminalCloseInput) => Promise<void>;
    onEvent: (callback: (event: TerminalEvent) => void) => () => void;
  };
  projects: {
    searchEntries: (input: ProjectSearchEntriesInput) => Promise<ProjectSearchEntriesResult>;
    readFile: (input: ProjectReadFileInput) => Promise<ProjectReadFileResult>;
    writeFile: (input: ProjectWriteFileInput) => Promise<ProjectWriteFileResult>;
  };
  shell: {
    openInEditor: (cwd: string, editor: EditorId) => Promise<void>;
    openExternal: (url: string) => Promise<void>;
  };
  git: {
    // Existing branch/worktree API
    listBranches: (input: GitListBranchesInput) => Promise<GitListBranchesResult>;
    createWorktree: (input: GitCreateWorktreeInput) => Promise<GitCreateWorktreeResult>;
    createDetachedWorktree: (
      input: GitCreateDetachedWorktreeInput,
    ) => Promise<GitCreateDetachedWorktreeResult>;
    removeWorktree: (input: GitRemoveWorktreeInput) => Promise<void>;
    createBranch: (input: GitCreateBranchInput) => Promise<void>;
    checkout: (input: GitCheckoutInput) => Promise<void>;
    init: (input: GitInitInput) => Promise<void>;
    handoffThread: (input: GitHandoffThreadInput) => Promise<GitHandoffThreadResult>;
    resolvePullRequest: (input: GitPullRequestRefInput) => Promise<GitResolvePullRequestResult>;
    preparePullRequestThread: (
      input: GitPreparePullRequestThreadInput,
    ) => Promise<GitPreparePullRequestThreadResult>;
    // Stacked action API
    pull: (input: GitPullInput) => Promise<GitPullResult>;
    status: (input: GitStatusInput) => Promise<GitStatusResult>;
    runStackedAction: (input: GitRunStackedActionInput) => Promise<GitRunStackedActionResult>;
    onActionProgress: (callback: (event: GitActionProgressEvent) => void) => () => void;
  };
  contextMenu: {
    show: <T extends string>(
      items: readonly ContextMenuItem<T>[],
      position?: { x: number; y: number },
    ) => Promise<T | null>;
  };
  server: {
    getConfig: () => Promise<ServerConfig>;
    refreshProviders: () => Promise<void>;
    updateSettings: (input: ServerUpdateSettingsInput) => Promise<ServerUpdateSettingsResult>;
    upsertKeybinding: (input: ServerUpsertKeybindingInput) => Promise<ServerUpsertKeybindingResult>;
  };
  provider: {
    getComposerCapabilities: (
      input: ProviderGetComposerCapabilitiesInput,
    ) => Promise<ProviderComposerCapabilities>;
    listCommands: (input: ProviderListCommandsInput) => Promise<ProviderListCommandsResult>;
    listSkills: (input: ProviderListSkillsInput) => Promise<ProviderListSkillsResult>;
    listPlugins: (input: ProviderListPluginsInput) => Promise<ProviderListPluginsResult>;
    readPlugin: (input: ProviderReadPluginInput) => Promise<ProviderReadPluginResult>;
    listModels: (input: ProviderListModelsInput) => Promise<ProviderListModelsResult>;
  };
  orchestration: {
    complete: (input: {
      provider: string;
      model: string;
      modelOptions?: unknown;
      cwd?: string;
      messages: ReadonlyArray<{ role: "system" | "user" | "assistant"; content: string }>;
    }) => Promise<{ text: string }>;
    getSnapshot: () => Promise<OrchestrationReadModel>;
    dispatchCommand: (command: ClientOrchestrationCommand) => Promise<{ sequence: number }>;
    getTurnDiff: (input: OrchestrationGetTurnDiffInput) => Promise<OrchestrationGetTurnDiffResult>;
    getFullThreadDiff: (
      input: OrchestrationGetFullThreadDiffInput,
    ) => Promise<OrchestrationGetFullThreadDiffResult>;
    replayEvents: (fromSequenceExclusive: number) => Promise<OrchestrationEvent[]>;
    onDomainEvent: (callback: (event: OrchestrationEvent) => void) => () => void;
  };
  browser: {
    open: (input: BrowserOpenInput) => Promise<ThreadBrowserState>;
    close: (input: BrowserThreadInput) => Promise<ThreadBrowserState>;
    hide: (input: BrowserThreadInput) => Promise<void>;
    getState: (input: BrowserThreadInput) => Promise<ThreadBrowserState>;
    setPanelBounds: (input: BrowserSetPanelBoundsInput) => Promise<ThreadBrowserState>;
    navigate: (input: BrowserNavigateInput) => Promise<ThreadBrowserState>;
    reload: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    goBack: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    goForward: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    newTab: (input: BrowserNewTabInput) => Promise<ThreadBrowserState>;
    closeTab: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    selectTab: (input: BrowserTabInput) => Promise<ThreadBrowserState>;
    openDevTools: (input: BrowserTabInput) => Promise<void>;
    openSession: (input: BrowserOpenSessionInput) => Promise<BrowserOpenSessionResult>;
    inspect: (input: BrowserInspectSessionInput) => Promise<BrowserInspectResult>;
    resolveAnnotationTargetAtPoint: (
      input: BrowserAnnotationResolveTargetAtPointInput,
    ) => Promise<BrowserAnnotationResolveTargetAtPointResult>;
    act: (input: BrowserActInput) => Promise<BrowserActResult>;
    closeSession: (input: BrowserCloseSessionInput) => Promise<void>;
    getCdpEndpoint: () => Promise<BrowserCdpEndpointInfo>;
    addAnnotation: (input: BrowserAddAnnotationInput) => Promise<BrowserAnnotationResult>;
    listAnnotations: (input: BrowserListAnnotationsInput) => Promise<BrowserAnnotationsResult>;
    getAnnotation: (input: BrowserAnnotationInput) => Promise<BrowserAnnotationResult>;
    resolveAnnotation: (input: BrowserAnnotationInput) => Promise<BrowserAnnotationResult>;
    reopenAnnotation: (input: BrowserAnnotationInput) => Promise<BrowserAnnotationResult>;
    control: {
      status: (input: BrowserControlSessionInput) => Promise<BrowserControlStatusResult>;
      take: (input: BrowserControlTakeInput) => Promise<BrowserControlLeaseResult>;
      release: (input: BrowserControlReleaseInput) => Promise<BrowserControlLeaseResult>;
      pauseAgent: (input: BrowserControlPauseInput) => Promise<BrowserControlLeaseResult>;
      resumeAgent: (input: BrowserControlSessionInput) => Promise<BrowserControlStatusResult>;
      observeFresh: (input: BrowserControlObserveFreshInput) => Promise<BrowserControlLeaseResult>;
      humanInput: (input: BrowserControlHumanInputInput) => Promise<BrowserControlLeaseResult>;
    };
    approval: {
      get: (input: BrowserApprovalGetInput) => Promise<BrowserApprovalResult>;
      list: (input?: BrowserApprovalListInput) => Promise<BrowserApprovalListResult>;
      respond: (input: BrowserApprovalRespondInput) => Promise<BrowserApprovalResult>;
    };
    workflow: {
      start: (input: BrowserWorkflowStartInput) => Promise<BrowserWorkflowStartResult>;
      status: (input: BrowserWorkflowRunInput) => Promise<BrowserWorkflowRunResult>;
      get: (input: BrowserWorkflowRunInput) => Promise<BrowserWorkflowRunResult>;
      cancel: (input: BrowserWorkflowRunInput) => Promise<BrowserWorkflowRunResult>;
      list: (input?: BrowserWorkflowListInput) => Promise<BrowserWorkflowListResult>;
    };
    onState: (callback: (state: ThreadBrowserState) => void) => () => void;
    onObservation: (
      callback: (payload: {
        threadId: ThreadId;
        observation: BrowserObservation;
        actionSummary: string;
      }) => void,
    ) => () => void;
    onSessionEvent: (callback: (event: BrowserSessionEventPushPayload) => void) => () => void;
  };
  evidence: {
    getArtifact: (input: EvidenceArtifactGetInput) => Promise<EvidenceArtifactContentResult>;
    bundle: {
      create: (input: EvidenceBundleCreateInput) => Promise<EvidenceBundleCreateResult>;
      get: (input: EvidenceBundleGetInput) => Promise<EvidenceBundleGetResult>;
    };
  };
  reviewer: {
    decision: {
      create: (input: ReviewerDecisionCreateInput) => Promise<ReviewerDecisionCreateResult>;
      get: (input: ReviewerDecisionGetInput) => Promise<ReviewerDecisionGetResult>;
      list: (input?: ReviewerDecisionListInput) => Promise<ReviewerDecisionListResult>;
      startRework: (input: ReviewerReworkStartInput) => Promise<ReviewerReworkStartResult>;
    };
  };
  preview: {
    detect: (input?: PreviewDetectInput) => Promise<PreviewDetectResult>;
    start: (input?: PreviewStartInput) => Promise<PreviewStartResult>;
    stop: (input: PreviewStopInput) => Promise<PreviewStatusResult>;
    restart: (input: PreviewInstanceInput) => Promise<PreviewStartResult>;
    status: (input: PreviewInstanceInput) => Promise<PreviewStatusResult>;
    logs: (input: PreviewInstanceInput) => Promise<PreviewLogsResult>;
    getTarget: (
      input: PreviewTargetGetInput,
    ) => Promise<PreviewTargetListResult["targets"][number] | null>;
    listTargets: (input?: PreviewTargetListInput) => Promise<PreviewTargetListResult>;
  };
}
