import { Schema } from "effect";

// ---------------------------------------------------------------------------
// Shared field schemas
// ---------------------------------------------------------------------------

const AgentId = Schema.String;
const RunId = Schema.String;
const TaskId = Schema.String;
const WorkerId = Schema.String;
const ThreadId = Schema.String;
const FilePath = Schema.String;

// ---------------------------------------------------------------------------
// Agent status literals
// ---------------------------------------------------------------------------

const AgentStatusLiteral = Schema.Literals([
  "idle",
  "running",
  "paused",
  "submitted",
  "stuck",
  "terminated",
]);

// ---------------------------------------------------------------------------
// 1. Spawning & Lifecycle (8)
// ---------------------------------------------------------------------------

export const SpawnAgentInput = Schema.Struct({
  runId: RunId,
  taskId: TaskId,
  parentWorkerId: Schema.optional(WorkerId),
  model: Schema.optional(Schema.String),
  provider: Schema.optional(Schema.String),
  worktreePath: Schema.optional(Schema.String),
  branch: Schema.optional(Schema.String),
  visibility: Schema.optional(Schema.Literals(["foreground", "background"])),
  spawnBudget: Schema.optional(
    Schema.Struct({
      maxDepth: Schema.Number,
      maxChildren: Schema.Number,
      maxConcurrentWriters: Schema.Number,
      maxTotalWorkers: Schema.Number,
    }),
  ),
});
export const SpawnAgentOutput = Schema.Struct({
  agentId: AgentId,
  threadId: ThreadId,
  workerId: WorkerId,
});

export const TerminateAgentInput = Schema.Struct({
  agentId: AgentId,
  reason: Schema.optional(Schema.String),
});
export const TerminateAgentOutput = Schema.Struct({
  agentId: AgentId,
  terminated: Schema.Boolean,
});

export const RestartAgentInput = Schema.Struct({
  agentId: AgentId,
  reason: Schema.optional(Schema.String),
});
export const RestartAgentOutput = Schema.Struct({
  agentId: AgentId,
  restarted: Schema.Boolean,
  newThreadId: Schema.optional(ThreadId),
});

export const CloneAgentInput = Schema.Struct({
  sourceAgentId: AgentId,
  targetBranch: Schema.optional(Schema.String),
  targetWorktreePath: Schema.optional(Schema.String),
});
export const CloneAgentOutput = Schema.Struct({
  newAgentId: AgentId,
  newThreadId: ThreadId,
  newWorkerId: WorkerId,
});

export const PauseAgentInput = Schema.Struct({
  agentId: AgentId,
  reason: Schema.optional(Schema.String),
});
export const PauseAgentOutput = Schema.Struct({
  agentId: AgentId,
  paused: Schema.Boolean,
});

export const ResumeAgentInput = Schema.Struct({
  agentId: AgentId,
});
export const ResumeAgentOutput = Schema.Struct({
  agentId: AgentId,
  resumed: Schema.Boolean,
});

export const PromoteToForegroundInput = Schema.Struct({
  agentId: AgentId,
});
export const PromoteToForegroundOutput = Schema.Struct({
  agentId: AgentId,
  visibility: Schema.Literal("foreground"),
});

export const DemoteToBackgroundInput = Schema.Struct({
  agentId: AgentId,
});
export const DemoteToBackgroundOutput = Schema.Struct({
  agentId: AgentId,
  visibility: Schema.Literal("background"),
});

// ---------------------------------------------------------------------------
// 2. Communication (5)
// ---------------------------------------------------------------------------

export const SendToAgentInput = Schema.Struct({
  targetAgentId: AgentId,
  message: Schema.String,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)),
});
export const SendToAgentOutput = Schema.Struct({
  delivered: Schema.Boolean,
  messageId: Schema.String,
});

export const BroadcastInput = Schema.Struct({
  message: Schema.String,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  excludeAgentIds: Schema.optional(Schema.Array(AgentId)),
});
export const BroadcastOutput = Schema.Struct({
  deliveredTo: Schema.Array(AgentId),
  messageId: Schema.String,
});

export const TransferContextInput = Schema.Struct({
  sourceAgentId: AgentId,
  targetAgentId: AgentId,
  contextKeys: Schema.optional(Schema.Array(Schema.String)),
  includeHistory: Schema.optional(Schema.Boolean),
});
export const TransferContextOutput = Schema.Struct({
  transferred: Schema.Boolean,
  keysTransferred: Schema.Array(Schema.String),
});

export const AskAgentInput = Schema.Struct({
  targetAgentId: AgentId,
  question: Schema.String,
  timeoutMs: Schema.optional(Schema.Number),
});
export const AskAgentOutput = Schema.Struct({
  answer: Schema.NullOr(Schema.String),
  timedOut: Schema.Boolean,
});

export const ShareFileInput = Schema.Struct({
  sourceAgentId: AgentId,
  targetAgentId: AgentId,
  filePath: FilePath,
  description: Schema.optional(Schema.String),
});
export const ShareFileOutput = Schema.Struct({
  shared: Schema.Boolean,
  resolvedPath: FilePath,
});

// ---------------------------------------------------------------------------
// 3. Monitoring (6)
// ---------------------------------------------------------------------------

export const GetAgentStatusInput = Schema.Struct({
  agentId: AgentId,
});
export const GetAgentStatusOutput = Schema.Struct({
  agentId: AgentId,
  status: AgentStatusLiteral,
  visibility: Schema.Literals(["foreground", "background"]),
  activeTaskId: Schema.NullOr(TaskId),
  threadId: ThreadId,
  updatedAt: Schema.String,
});

export const GetAllStatusInput = Schema.Struct({
  runId: Schema.optional(RunId),
});
export const GetAllStatusOutput = Schema.Struct({
  agents: Schema.Array(
    Schema.Struct({
      agentId: AgentId,
      status: AgentStatusLiteral,
      visibility: Schema.Literals(["foreground", "background"]),
      activeTaskId: Schema.NullOr(TaskId),
      threadId: ThreadId,
    }),
  ),
});

export const GetAgentDiffInput = Schema.Struct({
  agentId: AgentId,
  base: Schema.optional(Schema.String),
});
export const GetAgentDiffOutput = Schema.Struct({
  agentId: AgentId,
  diff: Schema.String,
  filesChanged: Schema.Number,
  additions: Schema.Number,
  deletions: Schema.Number,
});

export const GetAgentLogsInput = Schema.Struct({
  agentId: AgentId,
  tail: Schema.optional(Schema.Number),
  since: Schema.optional(Schema.String),
});
export const GetAgentLogsOutput = Schema.Struct({
  agentId: AgentId,
  entries: Schema.Array(
    Schema.Struct({
      timestamp: Schema.String,
      level: Schema.Literals(["info", "warn", "error", "debug"]),
      message: Schema.String,
    }),
  ),
});

export const GetBackgroundResultsInput = Schema.Struct({
  runId: Schema.optional(RunId),
  agentIds: Schema.optional(Schema.Array(AgentId)),
});
export const GetBackgroundResultsOutput = Schema.Struct({
  results: Schema.Array(
    Schema.Struct({
      agentId: AgentId,
      taskId: TaskId,
      status: AgentStatusLiteral,
      summary: Schema.NullOr(Schema.String),
      completedAt: Schema.NullOr(Schema.String),
    }),
  ),
});

export const GetSpawnTreeInput = Schema.Struct({
  runId: RunId,
});
export const GetSpawnTreeOutput = Schema.Struct({
  root: Schema.suspend((): typeof SpawnTreeNode => SpawnTreeNode),
});
const SpawnTreeNode: Schema.Schema.AnyNoContext = Schema.Struct({
  agentId: AgentId,
  workerId: WorkerId,
  status: AgentStatusLiteral,
  children: Schema.Array(Schema.suspend((): typeof SpawnTreeNode => SpawnTreeNode)),
});

// ---------------------------------------------------------------------------
// 4. Coordination (5)
// ---------------------------------------------------------------------------

export const WaitAgentInput = Schema.Struct({
  agentId: AgentId,
  timeoutMs: Schema.optional(Schema.Number),
});
export const WaitAgentOutput = Schema.Struct({
  agentId: AgentId,
  status: AgentStatusLiteral,
  timedOut: Schema.Boolean,
});

export const WaitAllInput = Schema.Struct({
  agentIds: Schema.Array(AgentId),
  timeoutMs: Schema.optional(Schema.Number),
});
export const WaitAllOutput = Schema.Struct({
  results: Schema.Array(
    Schema.Struct({
      agentId: AgentId,
      status: AgentStatusLiteral,
    }),
  ),
  timedOut: Schema.Boolean,
});

export const SetDependencyInput = Schema.Struct({
  fromAgentId: AgentId,
  toAgentId: AgentId,
  description: Schema.optional(Schema.String),
});
export const SetDependencyOutput = Schema.Struct({
  dependencyId: Schema.String,
  created: Schema.Boolean,
});

export const MergeWorkInput = Schema.Struct({
  sourceAgentId: AgentId,
  targetBranch: Schema.optional(Schema.String),
  strategy: Schema.optional(Schema.Literals(["merge", "rebase", "squash"])),
});
export const MergeWorkOutput = Schema.Struct({
  merged: Schema.Boolean,
  conflictsDetected: Schema.Boolean,
  conflictFiles: Schema.optional(Schema.Array(FilePath)),
});

export const SetSpawnBudgetInput = Schema.Struct({
  runId: RunId,
  maxDepth: Schema.optional(Schema.Number),
  maxChildren: Schema.optional(Schema.Number),
  maxConcurrentWriters: Schema.optional(Schema.Number),
  maxTotalWorkers: Schema.optional(Schema.Number),
});
export const SetSpawnBudgetOutput = Schema.Struct({
  applied: Schema.Boolean,
  budget: Schema.Struct({
    maxDepth: Schema.Number,
    maxChildren: Schema.Number,
    maxConcurrentWriters: Schema.Number,
    maxTotalWorkers: Schema.Number,
  }),
});

// ---------------------------------------------------------------------------
// 5. Review (5)
// ---------------------------------------------------------------------------

export const ReviewAgentWorkInput = Schema.Struct({
  agentId: AgentId,
  taskId: Schema.optional(TaskId),
  includeChecklist: Schema.optional(Schema.Boolean),
  includeDiff: Schema.optional(Schema.Boolean),
});
export const ReviewAgentWorkOutput = Schema.Struct({
  agentId: AgentId,
  taskId: TaskId,
  summary: Schema.String,
  diff: Schema.optional(Schema.String),
  checklist: Schema.optional(
    Schema.Array(
      Schema.Struct({
        id: Schema.String,
        label: Schema.String,
        status: Schema.Literals(["pending", "passed", "failed"]),
      }),
    ),
  ),
});

export const RunTestsInput = Schema.Struct({
  agentId: AgentId,
  command: Schema.optional(Schema.String),
  filePattern: Schema.optional(Schema.String),
  timeoutMs: Schema.optional(Schema.Number),
});
export const RunTestsOutput = Schema.Struct({
  exitCode: Schema.Number,
  passed: Schema.Number,
  failed: Schema.Number,
  skipped: Schema.Number,
  stdout: Schema.String,
  stderr: Schema.String,
});

export const AcceptWorkInput = Schema.Struct({
  agentId: AgentId,
  taskId: TaskId,
  notes: Schema.optional(Schema.String),
});
export const AcceptWorkOutput = Schema.Struct({
  accepted: Schema.Boolean,
  taskId: TaskId,
});

export const RejectWorkInput = Schema.Struct({
  agentId: AgentId,
  taskId: TaskId,
  reason: Schema.String,
});
export const RejectWorkOutput = Schema.Struct({
  rejected: Schema.Boolean,
  taskId: TaskId,
});

export const RequestRevisionInput = Schema.Struct({
  agentId: AgentId,
  taskId: TaskId,
  instructions: Schema.String,
  checklistItemIds: Schema.optional(Schema.Array(Schema.String)),
});
export const RequestRevisionOutput = Schema.Struct({
  revisionRequested: Schema.Boolean,
  taskId: TaskId,
  iteration: Schema.Number,
});

// ---------------------------------------------------------------------------
// 6. UI (6)
// ---------------------------------------------------------------------------

export const FocusAgentInput = Schema.Struct({
  agentId: AgentId,
});
export const FocusAgentOutput = Schema.Struct({
  focused: Schema.Boolean,
  agentId: AgentId,
});

export const ArrangePanelsInput = Schema.Struct({
  layout: Schema.Literals(["horizontal", "vertical", "grid", "stack"]),
  agentIds: Schema.optional(Schema.Array(AgentId)),
});
export const ArrangePanelsOutput = Schema.Struct({
  applied: Schema.Boolean,
  layout: Schema.Literals(["horizontal", "vertical", "grid", "stack"]),
});

export const PromotePanelInput = Schema.Struct({
  agentId: AgentId,
  size: Schema.optional(Schema.Literals(["normal", "large", "maximized"])),
});
export const PromotePanelOutput = Schema.Struct({
  promoted: Schema.Boolean,
  agentId: AgentId,
});

export const CollapsePanelInput = Schema.Struct({
  agentId: AgentId,
});
export const CollapsePanelOutput = Schema.Struct({
  collapsed: Schema.Boolean,
  agentId: AgentId,
});

export const OpenDiffViewInput = Schema.Struct({
  agentId: AgentId,
  filePath: Schema.optional(FilePath),
  base: Schema.optional(Schema.String),
});
export const OpenDiffViewOutput = Schema.Struct({
  opened: Schema.Boolean,
  agentId: AgentId,
});

export const OpenBrowserPreviewInput = Schema.Struct({
  agentId: AgentId,
  url: Schema.optional(Schema.String),
});
export const OpenBrowserPreviewOutput = Schema.Struct({
  opened: Schema.Boolean,
  agentId: AgentId,
});

// ---------------------------------------------------------------------------
// 7. Workspace (4)
// ---------------------------------------------------------------------------

export const AssignWorktreeInput = Schema.Struct({
  agentId: AgentId,
  branch: Schema.optional(Schema.String),
  baseBranch: Schema.optional(Schema.String),
  worktreePath: Schema.optional(Schema.String),
});
export const AssignWorktreeOutput = Schema.Struct({
  assigned: Schema.Boolean,
  worktreePath: FilePath,
  branch: Schema.String,
});

export const SetModelInput = Schema.Struct({
  agentId: AgentId,
  provider: Schema.String,
  model: Schema.String,
  reason: Schema.optional(Schema.String),
});
export const SetModelOutput = Schema.Struct({
  applied: Schema.Boolean,
  agentId: AgentId,
  provider: Schema.String,
  model: Schema.String,
});

export const SetScopeInput = Schema.Struct({
  agentId: AgentId,
  readScope: Schema.optional(Schema.Array(FilePath)),
  writeScope: Schema.optional(Schema.Array(FilePath)),
  allowedTools: Schema.optional(Schema.Array(Schema.String)),
});
export const SetScopeOutput = Schema.Struct({
  applied: Schema.Boolean,
  agentId: AgentId,
});

export const RestrictScopeInput = Schema.Struct({
  agentId: AgentId,
  denyPaths: Schema.optional(Schema.Array(FilePath)),
  denyTools: Schema.optional(Schema.Array(Schema.String)),
});
export const RestrictScopeOutput = Schema.Struct({
  applied: Schema.Boolean,
  agentId: AgentId,
});

// ---------------------------------------------------------------------------
// Tool name union & registries
// ---------------------------------------------------------------------------

export const ORCHESTRATION_TOOL_NAMES_LIST = [
  // Spawning & Lifecycle
  "orchestrate_spawn_agent",
  "orchestrate_terminate_agent",
  "orchestrate_restart_agent",
  "orchestrate_clone_agent",
  "orchestrate_pause_agent",
  "orchestrate_resume_agent",
  "orchestrate_promote_to_foreground",
  "orchestrate_demote_to_background",
  // Communication
  "orchestrate_send_to_agent",
  "orchestrate_broadcast",
  "orchestrate_transfer_context",
  "orchestrate_ask_agent",
  "orchestrate_share_file",
  // Monitoring
  "orchestrate_get_agent_status",
  "orchestrate_get_all_status",
  "orchestrate_get_agent_diff",
  "orchestrate_get_agent_logs",
  "orchestrate_get_background_results",
  "orchestrate_get_spawn_tree",
  // Coordination
  "orchestrate_wait_agent",
  "orchestrate_wait_all",
  "orchestrate_set_dependency",
  "orchestrate_merge_work",
  "orchestrate_set_spawn_budget",
  // Review
  "orchestrate_review_agent_work",
  "orchestrate_run_tests",
  "orchestrate_accept_work",
  "orchestrate_reject_work",
  "orchestrate_request_revision",
  // UI
  "orchestrate_focus_agent",
  "orchestrate_arrange_panels",
  "orchestrate_promote_panel",
  "orchestrate_collapse_panel",
  "orchestrate_open_diff_view",
  "orchestrate_open_browser_preview",
  // Workspace
  "orchestrate_assign_worktree",
  "orchestrate_set_model",
  "orchestrate_set_scope",
  "orchestrate_restrict_scope",
] as const;

export type OrchestrationToolName = (typeof ORCHESTRATION_TOOL_NAMES_LIST)[number];

export const ORCHESTRATION_TOOL_NAMES: ReadonlySet<string> = new Set(ORCHESTRATION_TOOL_NAMES_LIST);

export const UI_DIRECTIVE_TOOLS: ReadonlySet<string> = new Set([
  "orchestrate_focus_agent",
  "orchestrate_arrange_panels",
  "orchestrate_promote_panel",
  "orchestrate_collapse_panel",
  "orchestrate_open_diff_view",
  "orchestrate_open_browser_preview",
] as const);

export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  // Monitoring
  "orchestrate_get_agent_status",
  "orchestrate_get_all_status",
  "orchestrate_get_agent_diff",
  "orchestrate_get_agent_logs",
  "orchestrate_get_background_results",
  "orchestrate_get_spawn_tree",
  // Review (read-only subset)
  "orchestrate_review_agent_work",
] as const);
