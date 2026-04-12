# Multi-Agent Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the orchestrator to spawn, manage, and coordinate multiple coding agents through tool calls, with foreground agents displayed in side-by-side panels and background agents as status chips.

**Architecture:** Extend the existing event-sourced orchestration engine with new command/event types for worker lifecycle (pause, resume, promote, demote), inter-agent messaging, and UI directives. The orchestrator LLM emits tool calls classified as `orchestration_tool_call` that the server intercepts and routes to the engine. The web UI transitions between single-pane and rail+panels layout based on active worker count.

**Tech Stack:** Effect.ts (server), Schema (contracts), React/Zustand (web), SQLite event store, WebSocket push

**Spec:** `docs/superpowers/specs/2026-04-12-multi-agent-orchestration-design.md`

---

## File Map

### Contracts (packages/contracts/src/)

- **Modify:** `orchestration.ts` — Add worker visibility, pause status, new command/event schemas, orchestration tool definitions
- **Create:** `orchestrationTools.ts` — Schema definitions for the 38 orchestration tools (input/output types)

### Server (apps/server/src/)

- **Modify:** `orchestration/decider.ts` — Handle new commands (pause, resume, promote, demote, message, dependency, merge)
- **Modify:** `orchestration/projector.ts` — Project new events into read model (messages, dependencies, visibility)
- **Create:** `orchestration/Layers/OrchestrationToolRouter.ts` — Classify and execute orchestration tool calls
- **Create:** `orchestration/Services/OrchestrationToolRouter.ts` — Service interface for tool routing
- **Modify:** `provider/Layers/ClaudeAdapter.ts` — Add `orchestration_tool_call` classification
- **Modify:** `provider/Layers/CodexAdapter.ts` — Add orchestration tool classification
- **Modify:** `wsServer.ts` — Add UI directive push channel, tool routing integration
- **Create:** `orchestration/orchestratorSystemPrompt.ts` — Read ORCHESTRATOR.md + inject tool definitions

### Web (apps/web/src/)

- **Create:** `lib/multiAgentLayoutStore.ts` — Zustand store for rail+panels layout state
- **Create:** `components/orchestrator/OrchestratorRail.tsx` — Compact orchestrator rail component
- **Create:** `components/orchestrator/AgentPanel.tsx` — Individual agent panel with chat, terminal, composer
- **Create:** `components/orchestrator/AgentPanelHeader.tsx` — Panel header with status, model icon, task
- **Create:** `components/orchestrator/BackgroundAgentChip.tsx` — Status chip for background agents
- **Create:** `components/orchestrator/MultiAgentLayout.tsx` — Layout container handling transitions
- **Modify:** `components/orchestrator/OrchestratorPanel.tsx` — Integrate rail mode
- **Modify:** `components/Sidebar.tsx` (or equivalent) — Multi-model icons, expandable agent list
- **Modify:** `components/orchestrator/useOrchestratorEngine.ts` — Wire up multi-agent state

### Docs

- **Modify:** `docs/ORCHESTRATOR.md` — Add agent tool usage, model guide, coordination patterns, budgets

---

## Task 1: Contracts — Worker Visibility & Pause Status

**Files:**

- Modify: `packages/contracts/src/orchestration.ts`

- [ ] **Step 1: Add worker visibility and pause status to contracts**

In `packages/contracts/src/orchestration.ts`, find the `OrchestratorWorkerStatus` schema (search for `"idle" | "running" | "submitted" | "stuck" | "terminated"`) and add `"paused"`. Then find `OrchestratorWorker` and add a `visibility` field.

```typescript
// Find the worker status literals and add "paused"
// Before:
export const OrchestratorWorkerStatus = Schema.Literals([
  "idle", "running", "submitted", "stuck", "terminated",
]);
// After:
export const OrchestratorWorkerStatus = Schema.Literals([
  "idle", "running", "submitted", "stuck", "terminated", "paused",
]);

// Find OrchestratorWorker schema and add visibility field
// Add after the existing fields:
visibility: Schema.optionalWith(
  Schema.Literal("foreground", "background"),
  { default: () => "foreground" as const },
),
```

- [ ] **Step 2: Add new event types to the event type union**

Find the `OrchestrationEventType` schema (the union of all event type strings) and add:

```typescript
// Add these to the existing event type literals:
"orchestrator.worker.paused",
"orchestrator.worker.resumed",
"orchestrator.worker.promoted",
"orchestrator.worker.demoted",
"orchestrator.message.sent",
"orchestrator.message.broadcast-sent",
"orchestrator.context.transferred",
"orchestrator.dependency.set",
"orchestrator.work.merge-requested",
"orchestrator.work.merge-completed",
"orchestrator.work.merge-failed",
```

- [ ] **Step 3: Add new command schemas**

Add after the existing orchestrator commands:

```typescript
export const OrchestratorWorkerPauseCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.worker.pause"),
  commandId: CommandId,
  workerId: OrchestratorWorkerId,
});

export const OrchestratorWorkerResumeCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.worker.resume"),
  commandId: CommandId,
  workerId: OrchestratorWorkerId,
  instructions: Schema.optional(TrimmedNonEmptyStringSchema),
});

export const OrchestratorWorkerPromoteCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.worker.promote"),
  commandId: CommandId,
  workerId: OrchestratorWorkerId,
});

export const OrchestratorWorkerDemoteCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.worker.demote"),
  commandId: CommandId,
  workerId: OrchestratorWorkerId,
});

export const OrchestratorMessageSendCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.message.send"),
  commandId: CommandId,
  messageId: Schema.String,
  workerId: OrchestratorWorkerId,
  content: TrimmedNonEmptyStringSchema,
  priority: Schema.optionalWith(Schema.Literal("normal", "urgent"), {
    default: () => "normal" as const,
  }),
  sentAt: IsoDateTime,
});

export const OrchestratorMessageBroadcastCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.message.broadcast"),
  commandId: CommandId,
  content: TrimmedNonEmptyStringSchema,
  filter: Schema.optional(
    Schema.Struct({
      status: Schema.optional(Schema.Array(OrchestratorWorkerStatus)),
      role: Schema.optional(Schema.Array(Schema.String)),
    }),
  ),
  sentAt: IsoDateTime,
});

export const OrchestratorContextTransferCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.context.transfer"),
  commandId: CommandId,
  fromWorkerId: OrchestratorWorkerId,
  toWorkerId: OrchestratorWorkerId,
  content: Schema.Struct({
    files: Schema.optional(Schema.Array(Schema.String)),
    diff: Schema.optional(Schema.Boolean),
    message: Schema.optional(Schema.String),
  }),
  transferredAt: IsoDateTime,
});

export const OrchestratorDependencySetCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.dependency.set"),
  commandId: CommandId,
  workerId: OrchestratorWorkerId,
  dependsOn: Schema.Array(OrchestratorWorkerId),
});

export const OrchestratorWorkMergeCommand = Schema.Struct({
  type: Schema.Literal("orchestrator.work.merge"),
  commandId: CommandId,
  workerIds: Schema.Array(OrchestratorWorkerId),
  targetBranch: TrimmedNonEmptyStringSchema,
  strategy: Schema.Literal("sequential", "octopus"),
});
```

- [ ] **Step 4: Add new event payload schemas**

```typescript
export const OrchestratorWorkerPausedPayload = Schema.Struct({
  workerId: OrchestratorWorkerId,
  pausedAt: IsoDateTime,
});

export const OrchestratorWorkerResumedPayload = Schema.Struct({
  workerId: OrchestratorWorkerId,
  instructions: Schema.NullOr(Schema.String),
  resumedAt: IsoDateTime,
});

export const OrchestratorWorkerPromotedPayload = Schema.Struct({
  workerId: OrchestratorWorkerId,
  promotedAt: IsoDateTime,
});

export const OrchestratorWorkerDemotedPayload = Schema.Struct({
  workerId: OrchestratorWorkerId,
  demotedAt: IsoDateTime,
});

export const OrchestratorMessageSentPayload = Schema.Struct({
  messageId: Schema.String,
  workerId: OrchestratorWorkerId,
  content: Schema.String,
  priority: Schema.Literal("normal", "urgent"),
  sentAt: IsoDateTime,
});

export const OrchestratorMessageBroadcastSentPayload = Schema.Struct({
  content: Schema.String,
  deliveredTo: Schema.Array(OrchestratorWorkerId),
  sentAt: IsoDateTime,
});

export const OrchestratorContextTransferredPayload = Schema.Struct({
  fromWorkerId: OrchestratorWorkerId,
  toWorkerId: OrchestratorWorkerId,
  content: Schema.Struct({
    files: Schema.NullOr(Schema.Array(Schema.String)),
    diff: Schema.NullOr(Schema.Boolean),
    message: Schema.NullOr(Schema.String),
  }),
  transferredAt: IsoDateTime,
});

export const OrchestratorDependencySetPayload = Schema.Struct({
  workerId: OrchestratorWorkerId,
  dependsOn: Schema.Array(OrchestratorWorkerId),
});

export const OrchestratorWorkMergeRequestedPayload = Schema.Struct({
  workerIds: Schema.Array(OrchestratorWorkerId),
  targetBranch: Schema.String,
  strategy: Schema.Literal("sequential", "octopus"),
  requestedAt: IsoDateTime,
});
```

- [ ] **Step 5: Add commands to the command union**

Find `DispatchableClientOrchestrationCommand` and add all new commands to the union array.

- [ ] **Step 6: Add read model extensions**

Find `OrchestrationReadModel` and add:

```typescript
orchestratorMessages: Schema.optional(Schema.Array(Schema.Struct({
  messageId: Schema.String,
  workerId: OrchestratorWorkerId,
  content: Schema.String,
  priority: Schema.Literal("normal", "urgent"),
  sentAt: IsoDateTime,
}))),
orchestratorDependencies: Schema.optional(Schema.Array(Schema.Struct({
  workerId: OrchestratorWorkerId,
  dependsOn: Schema.Array(OrchestratorWorkerId),
}))),
```

- [ ] **Step 7: Build contracts and verify**

Run: `cd packages/contracts && bun run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 8: Commit**

```bash
git add packages/contracts/src/orchestration.ts
git commit -m "feat(contracts): add multi-agent orchestration commands, events, and read model extensions"
```

---

## Task 2: Contracts — Orchestration Tool Definitions

**Files:**

- Create: `packages/contracts/src/orchestrationTools.ts`
- Modify: `packages/contracts/src/index.ts` (add export)

- [ ] **Step 1: Create tool definition schemas**

Create `packages/contracts/src/orchestrationTools.ts` with Schema definitions for all 38 tools. Each tool has an input schema and output schema:

```typescript
import { Schema } from "effect";

// ─── Tool Input/Output Schemas ───

export const SpawnAgentInput = Schema.Struct({
  role: Schema.String,
  task: Schema.String,
  model: Schema.String,
  mode: Schema.optionalWith(Schema.Literal("foreground", "background"), {
    default: () => "foreground" as const,
  }),
  worktree: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  scope: Schema.optional(
    Schema.Struct({
      read: Schema.optional(Schema.Array(Schema.String)),
      write: Schema.optional(Schema.Array(Schema.String)),
      tools: Schema.optional(Schema.Array(Schema.String)),
    }),
  ),
});
export const SpawnAgentOutput = Schema.Struct({
  workerId: Schema.String,
  threadId: Schema.String,
  status: Schema.String,
});

export const TerminateAgentInput = Schema.Struct({
  workerId: Schema.String,
  reason: Schema.String,
});
export const TerminateAgentOutput = Schema.Struct({ success: Schema.Boolean });

export const RestartAgentInput = Schema.Struct({
  workerId: Schema.String,
  model: Schema.optional(Schema.String),
  task: Schema.optional(Schema.String),
});
export const RestartAgentOutput = Schema.Struct({
  newWorkerId: Schema.String,
  threadId: Schema.String,
});

export const CloneAgentInput = Schema.Struct({
  workerId: Schema.String,
  mode: Schema.optionalWith(Schema.Literal("foreground", "background"), {
    default: () => "foreground" as const,
  }),
});
export const CloneAgentOutput = Schema.Struct({
  newWorkerId: Schema.String,
  threadId: Schema.String,
});

export const PauseAgentInput = Schema.Struct({ workerId: Schema.String });
export const PauseAgentOutput = Schema.Struct({ success: Schema.Boolean });

export const ResumeAgentInput = Schema.Struct({
  workerId: Schema.String,
  instructions: Schema.optional(Schema.String),
});
export const ResumeAgentOutput = Schema.Struct({ success: Schema.Boolean });

export const PromoteToForegroundInput = Schema.Struct({ workerId: Schema.String });
export const PromoteToForegroundOutput = Schema.Struct({
  success: Schema.Boolean,
  panelSlot: Schema.optional(Schema.Number),
});

export const DemoteToBackgroundInput = Schema.Struct({ workerId: Schema.String });
export const DemoteToBackgroundOutput = Schema.Struct({ success: Schema.Boolean });

export const SendToAgentInput = Schema.Struct({
  workerId: Schema.String,
  message: Schema.String,
  priority: Schema.optionalWith(Schema.Literal("normal", "urgent"), {
    default: () => "normal" as const,
  }),
});
export const SendToAgentOutput = Schema.Struct({ delivered: Schema.Boolean });

export const BroadcastInput = Schema.Struct({
  message: Schema.String,
  filter: Schema.optional(
    Schema.Struct({
      status: Schema.optional(Schema.Array(Schema.String)),
      role: Schema.optional(Schema.Array(Schema.String)),
    }),
  ),
});
export const BroadcastOutput = Schema.Struct({ delivered: Schema.Array(Schema.String) });

export const TransferContextInput = Schema.Struct({
  fromWorkerId: Schema.String,
  toWorkerId: Schema.String,
  content: Schema.Struct({
    files: Schema.optional(Schema.Array(Schema.String)),
    diff: Schema.optional(Schema.Boolean),
    message: Schema.optional(Schema.String),
  }),
});
export const TransferContextOutput = Schema.Struct({ success: Schema.Boolean });

export const AskAgentInput = Schema.Struct({
  workerId: Schema.String,
  question: Schema.String,
  timeout: Schema.optional(Schema.Number),
});
export const AskAgentOutput = Schema.Struct({ response: Schema.String });

export const ShareFileInput = Schema.Struct({
  filePath: Schema.String,
  workerIds: Schema.Array(Schema.String),
});
export const ShareFileOutput = Schema.Struct({ success: Schema.Boolean });

export const GetAgentStatusInput = Schema.Struct({ workerId: Schema.String });
export const GetAgentStatusOutput = Schema.Struct({
  status: Schema.String,
  activeTask: Schema.NullOr(Schema.String),
  model: Schema.String,
  lastActivity: Schema.NullOr(Schema.String),
  diffSummary: Schema.NullOr(Schema.String),
});

export const GetAllStatusInput = Schema.Struct({});
export const GetAllStatusOutput = Schema.Struct({
  agents: Schema.Array(
    Schema.Struct({
      workerId: Schema.String,
      role: Schema.NullOr(Schema.String),
      status: Schema.String,
      model: Schema.String,
      visibility: Schema.Literal("foreground", "background"),
      lastActivity: Schema.NullOr(Schema.String),
    }),
  ),
  foregroundCount: Schema.Number,
  backgroundCount: Schema.Number,
  completedCount: Schema.Number,
});

export const GetAgentDiffInput = Schema.Struct({ workerId: Schema.String });
export const GetAgentDiffOutput = Schema.Struct({
  filesChanged: Schema.Number,
  insertions: Schema.Number,
  deletions: Schema.Number,
  diff: Schema.String,
});

export const GetAgentLogsInput = Schema.Struct({
  workerId: Schema.String,
  lines: Schema.optional(Schema.Number),
});
export const GetAgentLogsOutput = Schema.Struct({ output: Schema.String });

export const GetBackgroundResultsInput = Schema.Struct({ workerId: Schema.String });
export const GetBackgroundResultsOutput = Schema.Struct({
  output: Schema.NullOr(Schema.String),
  summary: Schema.NullOr(Schema.String),
  artifacts: Schema.optional(Schema.Array(Schema.String)),
});

export const GetSpawnTreeInput = Schema.Struct({});
export const GetSpawnTreeOutput = Schema.Struct({
  tree: Schema.Unknown, // recursive tree structure
});

export const WaitAgentInput = Schema.Struct({
  workerId: Schema.String,
  timeout: Schema.optional(Schema.Number),
});
export const WaitAgentOutput = Schema.Struct({
  status: Schema.String,
  result: Schema.optional(Schema.Unknown),
});

export const WaitAllInput = Schema.Struct({
  workerIds: Schema.optional(Schema.Array(Schema.String)),
  timeout: Schema.optional(Schema.Number),
});
export const WaitAllOutput = Schema.Struct({
  results: Schema.Array(
    Schema.Struct({
      workerId: Schema.String,
      status: Schema.String,
      result: Schema.optional(Schema.Unknown),
    }),
  ),
});

export const SetDependencyInput = Schema.Struct({
  workerId: Schema.String,
  dependsOn: Schema.Array(Schema.String),
});
export const SetDependencyOutput = Schema.Struct({ success: Schema.Boolean });

export const MergeWorkInput = Schema.Struct({
  workerIds: Schema.Array(Schema.String),
  targetBranch: Schema.String,
  strategy: Schema.optionalWith(Schema.Literal("sequential", "octopus"), {
    default: () => "sequential" as const,
  }),
});
export const MergeWorkOutput = Schema.Struct({
  success: Schema.Boolean,
  conflicts: Schema.optional(Schema.Array(Schema.String)),
});

export const SetSpawnBudgetInput = Schema.Struct({
  workerId: Schema.String,
  budget: Schema.Struct({
    maxDepth: Schema.optional(Schema.Number),
    maxChildren: Schema.optional(Schema.Number),
    maxConcurrentWriters: Schema.optional(Schema.Number),
    maxTotalWorkers: Schema.optional(Schema.Number),
    allowedTools: Schema.optional(Schema.Array(Schema.String)),
    writeScope: Schema.optional(Schema.Array(Schema.String)),
  }),
});
export const SetSpawnBudgetOutput = Schema.Struct({ success: Schema.Boolean });

export const ReviewAgentWorkInput = Schema.Struct({ workerId: Schema.String });
export const ReviewAgentWorkOutput = Schema.Struct({
  diff: Schema.String,
  summary: Schema.NullOr(Schema.String),
  checklistStatus: Schema.optional(Schema.Unknown),
});

export const RunTestsInput = Schema.Struct({
  workerId: Schema.String,
  command: Schema.optional(Schema.String),
});
export const RunTestsOutput = Schema.Struct({
  passed: Schema.Number,
  failed: Schema.Number,
  output: Schema.String,
});

export const AcceptWorkInput = Schema.Struct({
  workerId: Schema.String,
  evidence: Schema.optional(Schema.Unknown),
});
export const AcceptWorkOutput = Schema.Struct({ success: Schema.Boolean });

export const RejectWorkInput = Schema.Struct({
  workerId: Schema.String,
  reason: Schema.String,
  instructions: Schema.String,
});
export const RejectWorkOutput = Schema.Struct({ success: Schema.Boolean });

export const RequestRevisionInput = Schema.Struct({
  workerId: Schema.String,
  changes: Schema.Array(Schema.String),
});
export const RequestRevisionOutput = Schema.Struct({ success: Schema.Boolean });

export const FocusAgentInput = Schema.Struct({ workerId: Schema.String });
export const FocusAgentOutput = Schema.Struct({ success: Schema.Boolean });

export const ArrangePanelsInput = Schema.Struct({
  layout: Schema.Literal("side-by-side", "stacked", "grid"),
});
export const ArrangePanelsOutput = Schema.Struct({ success: Schema.Boolean });

export const PromotePanelInput = Schema.Struct({ workerId: Schema.String });
export const PromotePanelOutput = Schema.Struct({ success: Schema.Boolean });

export const CollapsePanelInput = Schema.Struct({ workerId: Schema.String });
export const CollapsePanelOutput = Schema.Struct({ success: Schema.Boolean });

export const OpenDiffViewInput = Schema.Struct({
  workerId: Schema.String,
  filePath: Schema.optional(Schema.String),
});
export const OpenDiffViewOutput = Schema.Struct({ success: Schema.Boolean });

export const OpenBrowserPreviewInput = Schema.Struct({
  workerId: Schema.String,
  url: Schema.optional(Schema.String),
});
export const OpenBrowserPreviewOutput = Schema.Struct({ success: Schema.Boolean });

export const AssignWorktreeInput = Schema.Struct({
  workerId: Schema.String,
  branch: Schema.optional(Schema.String),
});
export const AssignWorktreeOutput = Schema.Struct({ worktreePath: Schema.String });

export const SetModelInput = Schema.Struct({
  workerId: Schema.String,
  model: Schema.String,
  reason: Schema.optional(Schema.String),
});
export const SetModelOutput = Schema.Struct({ success: Schema.Boolean });

export const SetScopeInput = Schema.Struct({
  workerId: Schema.String,
  scope: Schema.Struct({
    read: Schema.optional(Schema.Array(Schema.String)),
    write: Schema.optional(Schema.Array(Schema.String)),
    tools: Schema.optional(Schema.Array(Schema.String)),
  }),
});
export const SetScopeOutput = Schema.Struct({ success: Schema.Boolean });

export const RestrictScopeInput = Schema.Struct({
  workerId: Schema.String,
  remove: Schema.Struct({
    tools: Schema.optional(Schema.Array(Schema.String)),
    writePaths: Schema.optional(Schema.Array(Schema.String)),
  }),
});
export const RestrictScopeOutput = Schema.Struct({ success: Schema.Boolean });

// ─── Tool Registry ───

export type OrchestrationToolName =
  | "spawn_agent"
  | "terminate_agent"
  | "restart_agent"
  | "clone_agent"
  | "pause_agent"
  | "resume_agent"
  | "promote_to_foreground"
  | "demote_to_background"
  | "send_to_agent"
  | "broadcast"
  | "transfer_context"
  | "ask_agent"
  | "share_file"
  | "get_agent_status"
  | "get_all_status"
  | "get_agent_diff"
  | "get_agent_logs"
  | "get_background_results"
  | "get_spawn_tree"
  | "wait_agent"
  | "wait_all"
  | "set_dependency"
  | "merge_work"
  | "set_spawn_budget"
  | "review_agent_work"
  | "run_tests"
  | "accept_work"
  | "reject_work"
  | "request_revision"
  | "focus_agent"
  | "arrange_panels"
  | "promote_panel"
  | "collapse_panel"
  | "open_diff_view"
  | "open_browser_preview"
  | "assign_worktree"
  | "set_model"
  | "set_scope"
  | "restrict_scope";

export const ORCHESTRATION_TOOL_NAMES: ReadonlySet<string> = new Set<OrchestrationToolName>([
  "spawn_agent",
  "terminate_agent",
  "restart_agent",
  "clone_agent",
  "pause_agent",
  "resume_agent",
  "promote_to_foreground",
  "demote_to_background",
  "send_to_agent",
  "broadcast",
  "transfer_context",
  "ask_agent",
  "share_file",
  "get_agent_status",
  "get_all_status",
  "get_agent_diff",
  "get_agent_logs",
  "get_background_results",
  "get_spawn_tree",
  "wait_agent",
  "wait_all",
  "set_dependency",
  "merge_work",
  "set_spawn_budget",
  "review_agent_work",
  "run_tests",
  "accept_work",
  "reject_work",
  "request_revision",
  "focus_agent",
  "arrange_panels",
  "promote_panel",
  "collapse_panel",
  "open_diff_view",
  "open_browser_preview",
  "assign_worktree",
  "set_model",
  "set_scope",
  "restrict_scope",
]);

export const UI_DIRECTIVE_TOOLS: ReadonlySet<string> = new Set([
  "focus_agent",
  "arrange_panels",
  "promote_panel",
  "collapse_panel",
  "open_diff_view",
  "open_browser_preview",
]);

export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  "get_agent_status",
  "get_all_status",
  "get_agent_diff",
  "get_agent_logs",
  "get_background_results",
  "get_spawn_tree",
  "review_agent_work",
]);
```

- [ ] **Step 2: Export from contracts index**

Add to `packages/contracts/src/index.ts`:

```typescript
export * from "./orchestrationTools.js";
```

- [ ] **Step 3: Build and verify**

Run: `cd packages/contracts && bun run build`
Expected: Success.

- [ ] **Step 4: Commit**

```bash
git add packages/contracts/src/orchestrationTools.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): add 38 orchestration tool input/output schemas and registry"
```

---

## Task 3: Server — Decider Extensions

**Files:**

- Modify: `apps/server/src/orchestration/decider.ts`

- [ ] **Step 1: Add command handlers for new lifecycle commands**

Find the main switch statement in `decideOrchestrationCommand` and add cases. Follow the existing pattern (validate with `require*`, return event with `withEventBase`):

```typescript
case "orchestrator.worker.pause": {
  const worker = yield* requireWorkerExists({ readModel, command, workerId: command.workerId });
  yield* requireWorkerStatus({ worker, command, allowed: ["running", "idle"] });
  return {
    ...withEventBase({
      aggregateKind: "orchestrator",
      aggregateId: command.workerId,
      occurredAt: new Date().toISOString(),
      commandId: command.commandId,
    }),
    type: "orchestrator.worker.paused",
    payload: {
      workerId: command.workerId,
      pausedAt: new Date().toISOString(),
    },
  };
}

case "orchestrator.worker.resume": {
  const worker = yield* requireWorkerExists({ readModel, command, workerId: command.workerId });
  yield* requireWorkerStatus({ worker, command, allowed: ["paused"] });
  return {
    ...withEventBase({
      aggregateKind: "orchestrator",
      aggregateId: command.workerId,
      occurredAt: new Date().toISOString(),
      commandId: command.commandId,
    }),
    type: "orchestrator.worker.resumed",
    payload: {
      workerId: command.workerId,
      instructions: command.instructions ?? null,
      resumedAt: new Date().toISOString(),
    },
  };
}

case "orchestrator.worker.promote": {
  const worker = yield* requireWorkerExists({ readModel, command, workerId: command.workerId });
  // Count current foreground workers
  const foregroundCount = (readModel.orchestratorWorkers ?? [])
    .filter((w) => w.visibility === "foreground" && w.status !== "terminated").length;
  if (foregroundCount >= 2) {
    return yield* new OrchestrationCommandInvariantError({
      message: "Maximum foreground agents (2) reached. Demote one first.",
      command,
    });
  }
  return {
    ...withEventBase({
      aggregateKind: "orchestrator",
      aggregateId: command.workerId,
      occurredAt: new Date().toISOString(),
      commandId: command.commandId,
    }),
    type: "orchestrator.worker.promoted",
    payload: { workerId: command.workerId, promotedAt: new Date().toISOString() },
  };
}

case "orchestrator.worker.demote": {
  const worker = yield* requireWorkerExists({ readModel, command, workerId: command.workerId });
  return {
    ...withEventBase({
      aggregateKind: "orchestrator",
      aggregateId: command.workerId,
      occurredAt: new Date().toISOString(),
      commandId: command.commandId,
    }),
    type: "orchestrator.worker.demoted",
    payload: { workerId: command.workerId, demotedAt: new Date().toISOString() },
  };
}
```

- [ ] **Step 2: Add message and coordination command handlers**

```typescript
case "orchestrator.message.send": {
  yield* requireWorkerExists({ readModel, command, workerId: command.workerId });
  return {
    ...withEventBase({
      aggregateKind: "orchestrator",
      aggregateId: command.workerId,
      occurredAt: command.sentAt,
      commandId: command.commandId,
    }),
    type: "orchestrator.message.sent",
    payload: {
      messageId: command.messageId,
      workerId: command.workerId,
      content: command.content,
      priority: command.priority,
      sentAt: command.sentAt,
    },
  };
}

case "orchestrator.message.broadcast": {
  const workers = readModel.orchestratorWorkers ?? [];
  const active = workers.filter((w) => w.status !== "terminated");
  const filtered = command.filter
    ? active.filter((w) => {
        if (command.filter!.status && !command.filter!.status.includes(w.status)) return false;
        return true;
      })
    : active;
  return {
    ...withEventBase({
      aggregateKind: "orchestrator",
      aggregateId: "broadcast",
      occurredAt: command.sentAt,
      commandId: command.commandId,
    }),
    type: "orchestrator.message.broadcast-sent",
    payload: {
      content: command.content,
      deliveredTo: filtered.map((w) => w.workerId),
      sentAt: command.sentAt,
    },
  };
}

case "orchestrator.context.transfer": {
  yield* requireWorkerExists({ readModel, command, workerId: command.fromWorkerId });
  yield* requireWorkerExists({ readModel, command, workerId: command.toWorkerId });
  return {
    ...withEventBase({
      aggregateKind: "orchestrator",
      aggregateId: command.toWorkerId,
      occurredAt: command.transferredAt,
      commandId: command.commandId,
    }),
    type: "orchestrator.context.transferred",
    payload: {
      fromWorkerId: command.fromWorkerId,
      toWorkerId: command.toWorkerId,
      content: {
        files: command.content.files ?? null,
        diff: command.content.diff ?? null,
        message: command.content.message ?? null,
      },
      transferredAt: command.transferredAt,
    },
  };
}

case "orchestrator.dependency.set": {
  yield* requireWorkerExists({ readModel, command, workerId: command.workerId });
  for (const depId of command.dependsOn) {
    yield* requireWorkerExists({ readModel, command, workerId: depId });
  }
  return {
    ...withEventBase({
      aggregateKind: "orchestrator",
      aggregateId: command.workerId,
      occurredAt: new Date().toISOString(),
      commandId: command.commandId,
    }),
    type: "orchestrator.dependency.set",
    payload: {
      workerId: command.workerId,
      dependsOn: command.dependsOn,
    },
  };
}

case "orchestrator.work.merge": {
  for (const wId of command.workerIds) {
    yield* requireWorkerExists({ readModel, command, workerId: wId });
  }
  return {
    ...withEventBase({
      aggregateKind: "orchestrator",
      aggregateId: command.workerIds[0] ?? "merge",
      occurredAt: new Date().toISOString(),
      commandId: command.commandId,
    }),
    type: "orchestrator.work.merge-requested",
    payload: {
      workerIds: command.workerIds,
      targetBranch: command.targetBranch,
      strategy: command.strategy,
      requestedAt: new Date().toISOString(),
    },
  };
}
```

- [ ] **Step 3: Add helper function for worker status validation**

Add near existing `require*` helpers:

```typescript
function requireWorkerStatus({
  worker,
  command,
  allowed,
}: {
  readonly worker: OrchestratorWorker;
  readonly command: OrchestrationCommand;
  readonly allowed: ReadonlyArray<string>;
}) {
  return Effect.gen(function* () {
    if (!allowed.includes(worker.status)) {
      return yield* new OrchestrationCommandInvariantError({
        message: `Worker ${worker.workerId} status is "${worker.status}", expected one of: ${allowed.join(", ")}`,
        command,
      });
    }
  });
}
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/server && bun typecheck`
Expected: Pass.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/orchestration/decider.ts
git commit -m "feat(server): add decider handlers for worker lifecycle, messaging, and coordination commands"
```

---

## Task 4: Server — Projector Extensions

**Files:**

- Modify: `apps/server/src/orchestration/projector.ts`

- [ ] **Step 1: Add projection handlers for new events**

In the `projectEvent` function's switch statement, add cases for each new event type. Follow the existing `updateWorker` helper pattern:

```typescript
case "orchestrator.worker.paused":
  return decodeForEvent(OrchestratorWorkerPausedPayload, event.payload, event.type, "payload").pipe(
    Effect.map((payload) => ({
      ...nextBase,
      orchestratorWorkers: updateWorker(
        nextBase.orchestratorWorkers ?? [],
        payload.workerId,
        { status: "paused" },
      ),
    })),
  );

case "orchestrator.worker.resumed":
  return decodeForEvent(OrchestratorWorkerResumedPayload, event.payload, event.type, "payload").pipe(
    Effect.map((payload) => ({
      ...nextBase,
      orchestratorWorkers: updateWorker(
        nextBase.orchestratorWorkers ?? [],
        payload.workerId,
        { status: "running" },
      ),
    })),
  );

case "orchestrator.worker.promoted":
  return decodeForEvent(OrchestratorWorkerPromotedPayload, event.payload, event.type, "payload").pipe(
    Effect.map((payload) => ({
      ...nextBase,
      orchestratorWorkers: updateWorker(
        nextBase.orchestratorWorkers ?? [],
        payload.workerId,
        { visibility: "foreground" },
      ),
    })),
  );

case "orchestrator.worker.demoted":
  return decodeForEvent(OrchestratorWorkerDemotedPayload, event.payload, event.type, "payload").pipe(
    Effect.map((payload) => ({
      ...nextBase,
      orchestratorWorkers: updateWorker(
        nextBase.orchestratorWorkers ?? [],
        payload.workerId,
        { visibility: "background" },
      ),
    })),
  );

case "orchestrator.message.sent":
  return decodeForEvent(OrchestratorMessageSentPayload, event.payload, event.type, "payload").pipe(
    Effect.map((payload) => ({
      ...nextBase,
      orchestratorMessages: [
        ...(nextBase.orchestratorMessages ?? []),
        {
          messageId: payload.messageId,
          workerId: payload.workerId,
          content: payload.content,
          priority: payload.priority,
          sentAt: payload.sentAt,
        },
      ],
    })),
  );

case "orchestrator.message.broadcast-sent":
  return decodeForEvent(OrchestratorMessageBroadcastSentPayload, event.payload, event.type, "payload").pipe(
    Effect.map(() => nextBase), // broadcast is tracked via individual sent messages
  );

case "orchestrator.context.transferred":
  return decodeForEvent(OrchestratorContextTransferredPayload, event.payload, event.type, "payload").pipe(
    Effect.map(() => nextBase), // context transfers are ephemeral
  );

case "orchestrator.dependency.set":
  return decodeForEvent(OrchestratorDependencySetPayload, event.payload, event.type, "payload").pipe(
    Effect.map((payload) => {
      const deps = [...(nextBase.orchestratorDependencies ?? [])];
      const existing = deps.findIndex((d) => d.workerId === payload.workerId);
      if (existing >= 0) {
        deps[existing] = { workerId: payload.workerId, dependsOn: payload.dependsOn };
      } else {
        deps.push({ workerId: payload.workerId, dependsOn: payload.dependsOn });
      }
      return { ...nextBase, orchestratorDependencies: deps };
    }),
  );

case "orchestrator.work.merge-requested":
  return decodeForEvent(OrchestratorWorkMergeRequestedPayload, event.payload, event.type, "payload").pipe(
    Effect.map(() => nextBase), // merge state tracked separately
  );
```

- [ ] **Step 2: Import new payload schemas**

Add imports at the top of projector.ts from contracts.

- [ ] **Step 3: Typecheck**

Run: `cd apps/server && bun typecheck`
Expected: Pass.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/orchestration/projector.ts
git commit -m "feat(server): add projector handlers for new orchestration events"
```

---

## Task 5: Server — Tool Router Service

**Files:**

- Create: `apps/server/src/orchestration/Services/OrchestrationToolRouter.ts`
- Create: `apps/server/src/orchestration/Layers/OrchestrationToolRouter.ts`

- [ ] **Step 1: Create service interface**

```typescript
// apps/server/src/orchestration/Services/OrchestrationToolRouter.ts
import { Context, Effect } from "effect";

export interface OrchestrationToolRouterShape {
  readonly isOrchestrationTool: (toolName: string) => boolean;
  readonly executeTool: (input: {
    readonly toolName: string;
    readonly toolInput: unknown;
    readonly threadId: string;
    readonly runId: string | null;
  }) => Effect.Effect<unknown, Error>;
}

export class OrchestrationToolRouter extends Context.Tag("OrchestrationToolRouter")<
  OrchestrationToolRouter,
  OrchestrationToolRouterShape
>() {}
```

- [ ] **Step 2: Create layer implementation**

```typescript
// apps/server/src/orchestration/Layers/OrchestrationToolRouter.ts
import { Effect, Layer, Schema } from "effect";
import {
  ORCHESTRATION_TOOL_NAMES,
  UI_DIRECTIVE_TOOLS,
  READ_ONLY_TOOLS,
} from "@t3tools/contracts/orchestrationTools";
import { OrchestrationToolRouter } from "../Services/OrchestrationToolRouter.js";
import type { OrchestrationEngineShape } from "../Services/OrchestrationEngine.js";
import { OrchestrationEngine } from "../Services/OrchestrationEngine.js";
import * as ToolSchemas from "@t3tools/contracts/orchestrationTools";

export const OrchestrationToolRouterLive = Layer.effect(
  OrchestrationToolRouter,
  Effect.gen(function* () {
    const engine = yield* OrchestrationEngine;

    const isOrchestrationTool = (toolName: string): boolean =>
      ORCHESTRATION_TOOL_NAMES.has(toolName);

    const executeTool = ({
      toolName,
      toolInput,
      threadId,
      runId,
    }: {
      readonly toolName: string;
      readonly toolInput: unknown;
      readonly threadId: string;
      readonly runId: string | null;
    }) =>
      Effect.gen(function* () {
        // UI directives: push to client, don't persist
        if (UI_DIRECTIVE_TOOLS.has(toolName)) {
          return yield* handleUiDirective({ toolName, toolInput, threadId });
        }

        // Read-only tools: query read model
        if (READ_ONLY_TOOLS.has(toolName)) {
          return yield* handleReadOnlyTool({ toolName, toolInput, engine });
        }

        // Command tools: dispatch to engine
        return yield* handleCommandTool({ toolName, toolInput, threadId, runId, engine });
      });

    return OrchestrationToolRouter.of({
      isOrchestrationTool,
      executeTool,
    });
  }),
);

function handleUiDirective({
  toolName,
  toolInput,
  threadId,
}: {
  readonly toolName: string;
  readonly toolInput: unknown;
  readonly threadId: string;
}) {
  return Effect.gen(function* () {
    // UI directives are pushed via WebSocket but not persisted
    // The push happens in the wsServer layer
    return { success: true, directive: toolName, input: toolInput };
  });
}

function handleReadOnlyTool({
  toolName,
  toolInput,
  engine,
}: {
  readonly toolName: string;
  readonly toolInput: unknown;
  readonly engine: OrchestrationEngineShape;
}) {
  return Effect.gen(function* () {
    const readModel = yield* engine.getReadModel();
    const workers = readModel.orchestratorWorkers ?? [];

    switch (toolName) {
      case "get_agent_status": {
        const input = yield* Schema.decodeUnknown(ToolSchemas.GetAgentStatusInput)(toolInput);
        const worker = workers.find((w) => w.workerId === input.workerId);
        if (!worker)
          return {
            status: "not_found",
            activeTask: null,
            model: "",
            lastActivity: null,
            diffSummary: null,
          };
        return {
          status: worker.status,
          activeTask: worker.activeTaskId ?? null,
          model: worker.modelBinding?.model ?? "",
          lastActivity: null, // TODO: derive from thread activities
          diffSummary: null,
        };
      }
      case "get_all_status": {
        const foreground = workers.filter(
          (w) => (w.visibility ?? "foreground") === "foreground" && w.status !== "terminated",
        );
        const background = workers.filter(
          (w) => w.visibility === "background" && w.status !== "terminated",
        );
        const completed = workers.filter((w) => w.status === "terminated");
        return {
          agents: workers
            .filter((w) => w.status !== "terminated")
            .map((w) => ({
              workerId: w.workerId,
              role: null,
              status: w.status,
              model: w.modelBinding?.model ?? "",
              visibility: w.visibility ?? "foreground",
              lastActivity: null,
            })),
          foregroundCount: foreground.length,
          backgroundCount: background.length,
          completedCount: completed.length,
        };
      }
      case "get_spawn_tree": {
        const tree = workers.map((w) => ({
          workerId: w.workerId,
          parentWorkerId: w.parentWorkerId ?? null,
          status: w.status,
          threadId: w.threadId,
        }));
        return { tree };
      }
      default:
        return { error: `Read-only handler not implemented for ${toolName}` };
    }
  });
}

function handleCommandTool({
  toolName,
  toolInput,
  threadId,
  runId,
  engine,
}: {
  readonly toolName: string;
  readonly toolInput: unknown;
  readonly threadId: string;
  readonly runId: string | null;
  readonly engine: OrchestrationEngineShape;
}) {
  return Effect.gen(function* () {
    const commandId = crypto.randomUUID();
    const now = new Date().toISOString();

    switch (toolName) {
      case "spawn_agent": {
        const input = yield* Schema.decodeUnknown(ToolSchemas.SpawnAgentInput)(toolInput);
        const workerId = crypto.randomUUID();
        const workerThreadId = crypto.randomUUID();
        yield* engine.dispatch({
          type: "orchestrator.worker.spawn",
          commandId,
          workerId,
          runId: runId ?? "",
          taskId: null,
          threadId: workerThreadId,
          spawnBudget: {
            maxDepth: 1,
            maxChildren: 2,
            maxConcurrentWriters: 1,
            maxTotalWorkers: 4,
            allowedTools: input.scope?.tools ?? [],
            writeScope: input.scope?.write ?? [],
          },
          workspace: {
            mode: input.worktree ? "worktree" : "local",
            branch: null,
            worktreePath: null,
            cwd: process.cwd(),
            terminalIds: [],
            browserSessionId: null,
          },
          modelBinding: {
            provider: input.model.includes("codex") ? "codex" : "claudeAgent",
            model: input.model,
            selectedAt: now,
            selectedBy: "orchestrator",
            selectionReason: `Assigned for ${input.role} task`,
            inheritedFromTaskPolicy: false,
          },
          visibility: input.mode ?? "foreground",
        });
        return { workerId, threadId: workerThreadId, status: "spawned" };
      }
      case "terminate_agent": {
        const input = yield* Schema.decodeUnknown(ToolSchemas.TerminateAgentInput)(toolInput);
        yield* engine.dispatch({
          type: "orchestrator.worker.terminate",
          commandId,
          workerId: input.workerId,
        });
        return { success: true };
      }
      case "pause_agent": {
        const input = yield* Schema.decodeUnknown(ToolSchemas.PauseAgentInput)(toolInput);
        yield* engine.dispatch({
          type: "orchestrator.worker.pause",
          commandId,
          workerId: input.workerId,
        });
        return { success: true };
      }
      case "resume_agent": {
        const input = yield* Schema.decodeUnknown(ToolSchemas.ResumeAgentInput)(toolInput);
        yield* engine.dispatch({
          type: "orchestrator.worker.resume",
          commandId,
          workerId: input.workerId,
          instructions: input.instructions,
        });
        return { success: true };
      }
      case "promote_to_foreground": {
        const input = yield* Schema.decodeUnknown(ToolSchemas.PromoteToForegroundInput)(toolInput);
        yield* engine.dispatch({
          type: "orchestrator.worker.promote",
          commandId,
          workerId: input.workerId,
        });
        return { success: true, panelSlot: 0 };
      }
      case "demote_to_background": {
        const input = yield* Schema.decodeUnknown(ToolSchemas.DemoteToBackgroundInput)(toolInput);
        yield* engine.dispatch({
          type: "orchestrator.worker.demote",
          commandId,
          workerId: input.workerId,
        });
        return { success: true };
      }
      case "send_to_agent": {
        const input = yield* Schema.decodeUnknown(ToolSchemas.SendToAgentInput)(toolInput);
        yield* engine.dispatch({
          type: "orchestrator.message.send",
          commandId,
          messageId: crypto.randomUUID(),
          workerId: input.workerId,
          content: input.message,
          priority: input.priority ?? "normal",
          sentAt: now,
        });
        return { delivered: true };
      }
      case "broadcast": {
        const input = yield* Schema.decodeUnknown(ToolSchemas.BroadcastInput)(toolInput);
        yield* engine.dispatch({
          type: "orchestrator.message.broadcast",
          commandId,
          content: input.message,
          filter: input.filter,
          sentAt: now,
        });
        return { delivered: [] }; // actual list comes from event
      }
      case "set_dependency": {
        const input = yield* Schema.decodeUnknown(ToolSchemas.SetDependencyInput)(toolInput);
        yield* engine.dispatch({
          type: "orchestrator.dependency.set",
          commandId,
          workerId: input.workerId,
          dependsOn: input.dependsOn,
        });
        return { success: true };
      }
      case "merge_work": {
        const input = yield* Schema.decodeUnknown(ToolSchemas.MergeWorkInput)(toolInput);
        yield* engine.dispatch({
          type: "orchestrator.work.merge",
          commandId,
          workerIds: input.workerIds,
          targetBranch: input.targetBranch,
          strategy: input.strategy ?? "sequential",
        });
        return { success: true };
      }
      case "accept_work": {
        const input = yield* Schema.decodeUnknown(ToolSchemas.AcceptWorkInput)(toolInput);
        // Find the worker's active task
        const readModel = yield* engine.getReadModel();
        const worker = (readModel.orchestratorWorkers ?? []).find(
          (w) => w.workerId === input.workerId,
        );
        if (!worker?.activeTaskId) return { success: false };
        yield* engine.dispatch({
          type: "orchestrator.task.accept",
          commandId,
          taskId: worker.activeTaskId,
          summary: "Accepted by orchestrator",
        });
        return { success: true };
      }
      case "reject_work": {
        const input = yield* Schema.decodeUnknown(ToolSchemas.RejectWorkInput)(toolInput);
        const readModel = yield* engine.getReadModel();
        const worker = (readModel.orchestratorWorkers ?? []).find(
          (w) => w.workerId === input.workerId,
        );
        if (!worker?.activeTaskId) return { success: false };
        yield* engine.dispatch({
          type: "orchestrator.task.reject",
          commandId,
          taskId: worker.activeTaskId,
          instruction: input.instructions,
        });
        return { success: true };
      }
      default:
        return { error: `Command handler not implemented for ${toolName}` };
    }
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/server && bun typecheck`
Expected: Pass.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/orchestration/Services/OrchestrationToolRouter.ts apps/server/src/orchestration/Layers/OrchestrationToolRouter.ts
git commit -m "feat(server): add OrchestrationToolRouter service and layer for 38 orchestration tools"
```

---

## Task 6: Server — Tool Classification in Provider Adapters

**Files:**

- Modify: `apps/server/src/provider/Layers/ClaudeAdapter.ts`
- Modify: `apps/server/src/provider/Layers/CodexAdapter.ts`

- [ ] **Step 1: Update ClaudeAdapter classifyToolItemType**

Find `classifyToolItemType` in ClaudeAdapter.ts (~line 435) and add orchestration tool detection BEFORE the existing agent check:

```typescript
function classifyToolItemType(toolName: string): CanonicalItemType {
  const normalized = toolName.toLowerCase();

  // Orchestration tools — check first before generic agent match
  if (ORCHESTRATION_TOOL_NAMES.has(toolName)) {
    return "orchestration_tool_call";
  }

  // ... existing checks remain unchanged
}
```

Import at the top:

```typescript
import { ORCHESTRATION_TOOL_NAMES } from "@t3tools/contracts/orchestrationTools";
```

- [ ] **Step 2: Add "orchestration_tool_call" to CanonicalItemType**

Find the `CanonicalItemType` type definition in the contracts and add `"orchestration_tool_call"`. This is likely in `packages/contracts/src/providerRuntime.ts` or similar.

- [ ] **Step 3: Update CodexAdapter similarly**

Find `toCanonicalItemType` in CodexAdapter.ts (~line 191) and add:

```typescript
function toCanonicalItemType(raw: unknown): CanonicalItemType {
  const type = normalizeItemType(raw);

  // Check if this is an orchestration tool
  if (typeof raw === "string" && ORCHESTRATION_TOOL_NAMES.has(raw)) {
    return "orchestration_tool_call";
  }

  // ... existing checks remain unchanged
}
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/server && bun typecheck`
Expected: Pass.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/provider/Layers/ClaudeAdapter.ts apps/server/src/provider/Layers/CodexAdapter.ts
git commit -m "feat(server): classify orchestration tool calls in Claude and Codex adapters"
```

---

## Task 7: Server — System Prompt Injection

**Files:**

- Create: `apps/server/src/orchestration/orchestratorSystemPrompt.ts`

- [ ] **Step 1: Create system prompt builder**

```typescript
// apps/server/src/orchestration/orchestratorSystemPrompt.ts
import { Effect } from "effect";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { ORCHESTRATION_TOOL_NAMES } from "@t3tools/contracts/orchestrationTools";

const ORCHESTRATOR_MD_FILENAME = "docs/ORCHESTRATOR.md";

export function buildOrchestratorSystemPrompt({
  projectRoot,
}: {
  readonly projectRoot: string;
}): Effect.Effect<string, Error> {
  return Effect.gen(function* () {
    const mdPath = path.join(projectRoot, ORCHESTRATOR_MD_FILENAME);

    let orchestratorMd: string;
    try {
      orchestratorMd = yield* Effect.promise(() => fs.readFile(mdPath, "utf-8"));
    } catch {
      orchestratorMd = "# Orchestrator\n\nNo ORCHESTRATOR.md found. Using default behavior.";
    }

    const toolDefinitions = buildToolDefinitions();

    return [
      "# Orchestrator Instructions",
      "",
      orchestratorMd,
      "",
      "# Available Orchestration Tools",
      "",
      "You have access to the following tools for managing agents. Emit these as tool_use calls.",
      "Multiple tool calls in the same turn will be executed in parallel.",
      "",
      toolDefinitions,
    ].join("\n");
  });
}

function buildToolDefinitions(): string {
  const tools = [
    {
      name: "spawn_agent",
      description: "Create a new agent with a dedicated thread and panel",
      params:
        "role: string, task: string, model: string, mode?: 'foreground'|'background', worktree?: boolean, scope?: {read?: string[], write?: string[], tools?: string[]}",
    },
    {
      name: "terminate_agent",
      description: "Kill an agent",
      params: "workerId: string, reason: string",
    },
    {
      name: "restart_agent",
      description: "Restart a stuck/failed agent",
      params: "workerId: string, model?: string, task?: string",
    },
    {
      name: "clone_agent",
      description: "Fork an agent's context into a new panel",
      params: "workerId: string, mode?: 'foreground'|'background'",
    },
    { name: "pause_agent", description: "Pause an agent mid-work", params: "workerId: string" },
    {
      name: "resume_agent",
      description: "Resume a paused agent",
      params: "workerId: string, instructions?: string",
    },
    {
      name: "promote_to_foreground",
      description: "Move background agent to visible panel",
      params: "workerId: string",
    },
    {
      name: "demote_to_background",
      description: "Move foreground agent to background",
      params: "workerId: string",
    },
    {
      name: "send_to_agent",
      description: "Send instruction to a specific agent",
      params: "workerId: string, message: string, priority?: 'normal'|'urgent'",
    },
    {
      name: "broadcast",
      description: "Send message to all active agents",
      params: "message: string, filter?: {status?: string[], role?: string[]}",
    },
    {
      name: "transfer_context",
      description: "Pass files/output between agents",
      params:
        "fromWorkerId: string, toWorkerId: string, content: {files?: string[], diff?: boolean, message?: string}",
    },
    {
      name: "ask_agent",
      description: "Ask agent a question and wait for response",
      params: "workerId: string, question: string, timeout?: number",
    },
    {
      name: "share_file",
      description: "Make a file visible across agents",
      params: "filePath: string, workerIds: string[]",
    },
    {
      name: "get_agent_status",
      description: "Check what an agent is doing",
      params: "workerId: string",
    },
    { name: "get_all_status", description: "Dashboard snapshot of all agents", params: "none" },
    {
      name: "get_agent_diff",
      description: "Pull current diff from an agent",
      params: "workerId: string",
    },
    {
      name: "get_agent_logs",
      description: "Terminal output from an agent",
      params: "workerId: string, lines?: number",
    },
    {
      name: "get_background_results",
      description: "Retrieve completed background agent output",
      params: "workerId: string",
    },
    { name: "get_spawn_tree", description: "View full agent hierarchy", params: "none" },
    {
      name: "wait_agent",
      description: "Block until agent completes",
      params: "workerId: string, timeout?: number",
    },
    {
      name: "wait_all",
      description: "Block until all agents complete",
      params: "workerIds?: string[], timeout?: number",
    },
    {
      name: "set_dependency",
      description: "Set agent dependencies",
      params: "workerId: string, dependsOn: string[]",
    },
    {
      name: "merge_work",
      description: "Combine changes from multiple agents",
      params: "workerIds: string[], targetBranch: string, strategy?: 'sequential'|'octopus'",
    },
    {
      name: "set_spawn_budget",
      description: "Configure subagent limits",
      params: "workerId: string, budget: SpawnBudget",
    },
    {
      name: "review_agent_work",
      description: "Pull diff and checklist for review",
      params: "workerId: string",
    },
    {
      name: "run_tests",
      description: "Execute tests against agent changes",
      params: "workerId: string, command?: string",
    },
    {
      name: "accept_work",
      description: "Accept agent output",
      params: "workerId: string, evidence?: object",
    },
    {
      name: "reject_work",
      description: "Reject with rework instructions",
      params: "workerId: string, reason: string, instructions: string",
    },
    {
      name: "request_revision",
      description: "Ask for specific changes",
      params: "workerId: string, changes: string[]",
    },
    {
      name: "focus_agent",
      description: "Bring agent panel to foreground",
      params: "workerId: string",
    },
    {
      name: "arrange_panels",
      description: "Set panel layout",
      params: "layout: 'side-by-side'|'stacked'|'grid'",
    },
    {
      name: "promote_panel",
      description: "Expand panel to full width",
      params: "workerId: string",
    },
    { name: "collapse_panel", description: "Minimize to status chip", params: "workerId: string" },
    {
      name: "open_diff_view",
      description: "Show diff panel for agent",
      params: "workerId: string, filePath?: string",
    },
    {
      name: "open_browser_preview",
      description: "Open browser validation",
      params: "workerId: string, url?: string",
    },
    {
      name: "assign_worktree",
      description: "Give agent its own git worktree",
      params: "workerId: string, branch?: string",
    },
    {
      name: "set_model",
      description: "Switch agent model mid-task",
      params: "workerId: string, model: string, reason?: string",
    },
    {
      name: "set_scope",
      description: "Replace agent scope constraints",
      params: "workerId: string, scope: {read?: string[], write?: string[], tools?: string[]}",
    },
    {
      name: "restrict_scope",
      description: "Narrow agent scope",
      params: "workerId: string, remove: {tools?: string[], writePaths?: string[]}",
    },
  ];

  return tools.map((t) => `## ${t.name}\n${t.description}\nParameters: ${t.params}`).join("\n\n");
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/server && bun typecheck`
Expected: Pass.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/orchestration/orchestratorSystemPrompt.ts
git commit -m "feat(server): add orchestrator system prompt builder with ORCHESTRATOR.md injection and tool definitions"
```

---

## Task 8: Web — Multi-Agent Layout Store

**Files:**

- Create: `apps/web/src/lib/multiAgentLayoutStore.ts`

- [ ] **Step 1: Create Zustand store for multi-agent layout state**

```typescript
// apps/web/src/lib/multiAgentLayoutStore.ts
import { create } from "zustand";

export type AgentPanelMode = "single-pane" | "rail-and-panels";
export type PanelArrangement = "side-by-side" | "stacked" | "grid";

export interface AgentPanelState {
  workerId: string;
  threadId: string;
  role: string | null;
  model: string;
  visibility: "foreground" | "background";
  status: string;
  color: string;
}

interface MultiAgentLayoutStore {
  mode: AgentPanelMode;
  arrangement: PanelArrangement;
  railWidth: number;
  panelDividerRatio: number;
  foregroundPanels: AgentPanelState[];
  backgroundAgents: AgentPanelState[];
  focusedPanelWorkerId: string | null;
  promotedPanelWorkerId: string | null;

  // Actions
  setMode: (mode: AgentPanelMode) => void;
  setArrangement: (arrangement: PanelArrangement) => void;
  setRailWidth: (width: number) => void;
  setPanelDividerRatio: (ratio: number) => void;
  setFocusedPanel: (workerId: string | null) => void;
  setPromotedPanel: (workerId: string | null) => void;

  syncWithWorkers: (
    workers: ReadonlyArray<{
      workerId: string;
      threadId: string;
      status: string;
      visibility?: string;
      modelBinding?: { model: string } | null;
    }>,
  ) => void;
}

const AGENT_COLORS = [
  "#64ffda", // teal
  "#ff6b6b", // coral
  "#ffd93d", // gold
  "#6bcb77", // green
  "#4d96ff", // blue
  "#9b59b6", // purple
  "#e67e22", // orange
  "#1abc9c", // emerald
];

export const useMultiAgentLayoutStore = create<MultiAgentLayoutStore>((set, get) => ({
  mode: "single-pane",
  arrangement: "side-by-side",
  railWidth: 320,
  panelDividerRatio: 0.5,
  foregroundPanels: [],
  backgroundAgents: [],
  focusedPanelWorkerId: null,
  promotedPanelWorkerId: null,

  setMode: (mode) => set({ mode }),
  setArrangement: (arrangement) => set({ arrangement }),
  setRailWidth: (width) => set({ railWidth: Math.max(240, Math.min(480, width)) }),
  setPanelDividerRatio: (ratio) =>
    set({ panelDividerRatio: Math.max(0.25, Math.min(0.75, ratio)) }),
  setFocusedPanel: (workerId) => set({ focusedPanelWorkerId: workerId }),
  setPromotedPanel: (workerId) => set({ promotedPanelWorkerId: workerId }),

  syncWithWorkers: (workers) => {
    const active = workers.filter((w) => w.status !== "terminated");
    const foreground = active
      .filter((w) => (w.visibility ?? "foreground") === "foreground")
      .slice(0, 2)
      .map((w, i) => ({
        workerId: w.workerId,
        threadId: w.threadId,
        role: null,
        model: w.modelBinding?.model ?? "",
        visibility: "foreground" as const,
        status: w.status,
        color: AGENT_COLORS[i % AGENT_COLORS.length]!,
      }));
    const background = active
      .filter(
        (w) =>
          w.visibility === "background" ||
          ((w.visibility ?? "foreground") === "foreground" && active.indexOf(w) >= 2),
      )
      .map((w, i) => ({
        workerId: w.workerId,
        threadId: w.threadId,
        role: null,
        model: w.modelBinding?.model ?? "",
        visibility: "background" as const,
        status: w.status,
        color: AGENT_COLORS[(i + 2) % AGENT_COLORS.length]!,
      }));

    const newMode: AgentPanelMode = foreground.length > 0 ? "rail-and-panels" : "single-pane";

    set({
      mode: newMode,
      foregroundPanels: foreground,
      backgroundAgents: background,
    });
  },
}));
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && bun typecheck`
Expected: Pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/multiAgentLayoutStore.ts
git commit -m "feat(web): add multi-agent layout Zustand store with worker sync and panel management"
```

---

## Task 9: Web — Agent Panel Components

**Files:**

- Create: `apps/web/src/components/orchestrator/AgentPanelHeader.tsx`
- Create: `apps/web/src/components/orchestrator/AgentPanel.tsx`
- Create: `apps/web/src/components/orchestrator/BackgroundAgentChip.tsx`

- [ ] **Step 1: Create AgentPanelHeader**

```typescript
// apps/web/src/components/orchestrator/AgentPanelHeader.tsx
import type { AgentPanelState } from "../../lib/multiAgentLayoutStore";

interface AgentPanelHeaderProps {
  agent: AgentPanelState;
  onClose?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  idle: "Idle",
  running: "Running",
  submitted: "Submitted",
  stuck: "Stuck",
  paused: "Paused",
  terminated: "Terminated",
};

export function AgentPanelHeader({ agent, onClose }: AgentPanelHeaderProps) {
  const providerIcon = agent.model.includes("codex") ? "X" : "C";

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 border-b"
      style={{ borderLeftColor: agent.color, borderLeftWidth: 3 }}
    >
      <span
        className="flex h-5 w-5 items-center justify-center rounded text-xs font-bold"
        style={{ backgroundColor: agent.color, color: "#0d1b2a" }}
      >
        {providerIcon}
      </span>
      <span className="flex-1 truncate text-sm font-medium">
        {agent.role ?? `Agent ${agent.workerId.slice(0, 6)}`}
      </span>
      <span className="text-xs text-muted-foreground">
        {STATUS_LABELS[agent.status] ?? agent.status}
      </span>
      {onClose && (
        <button
          onClick={onClose}
          className="ml-1 text-muted-foreground hover:text-foreground"
          aria-label="Close agent panel"
        >
          ×
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create AgentPanel**

```typescript
// apps/web/src/components/orchestrator/AgentPanel.tsx
import { AgentPanelHeader } from "./AgentPanelHeader";
import type { AgentPanelState } from "../../lib/multiAgentLayoutStore";

interface AgentPanelProps {
  agent: AgentPanelState;
  onClose?: () => void;
  onDirectMessage?: (message: string) => void;
  children?: React.ReactNode;
}

export function AgentPanel({ agent, onClose, onDirectMessage, children }: AgentPanelProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden border-l first:border-l-0">
      <AgentPanelHeader agent={agent} onClose={onClose} />
      <div className="flex-1 overflow-y-auto p-2">
        {children ?? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Agent thread loading...
          </div>
        )}
      </div>
      {onDirectMessage && (
        <div className="border-t p-2">
          <input
            type="text"
            placeholder="Direct message..."
            className="w-full rounded border bg-background px-2 py-1 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.currentTarget.value.trim()) {
                onDirectMessage(e.currentTarget.value.trim());
                e.currentTarget.value = "";
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create BackgroundAgentChip**

```typescript
// apps/web/src/components/orchestrator/BackgroundAgentChip.tsx
import type { AgentPanelState } from "../../lib/multiAgentLayoutStore";

interface BackgroundAgentChipProps {
  agent: AgentPanelState;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

const STATUS_ICONS: Record<string, string> = {
  running: "⟳",
  idle: "○",
  submitted: "✓",
  stuck: "!",
  paused: "⏸",
  terminated: "✗",
};

export function BackgroundAgentChip({ agent, onClick, onDoubleClick }: BackgroundAgentChipProps) {
  return (
    <button
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-accent"
      title={`${agent.role ?? agent.workerId.slice(0, 6)} — ${agent.status}. Double-click to promote.`}
    >
      <span style={{ color: agent.color }}>
        {STATUS_ICONS[agent.status] ?? "○"}
      </span>
      <span className="max-w-[100px] truncate">
        {agent.role ?? agent.workerId.slice(0, 6)}
      </span>
    </button>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && bun typecheck`
Expected: Pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/orchestrator/AgentPanelHeader.tsx apps/web/src/components/orchestrator/AgentPanel.tsx apps/web/src/components/orchestrator/BackgroundAgentChip.tsx
git commit -m "feat(web): add AgentPanel, AgentPanelHeader, and BackgroundAgentChip components"
```

---

## Task 10: Web — Multi-Agent Layout Container

**Files:**

- Create: `apps/web/src/components/orchestrator/MultiAgentLayout.tsx`
- Create: `apps/web/src/components/orchestrator/OrchestratorRail.tsx`

- [ ] **Step 1: Create OrchestratorRail**

```typescript
// apps/web/src/components/orchestrator/OrchestratorRail.tsx
import { BackgroundAgentChip } from "./BackgroundAgentChip";
import type { AgentPanelState } from "../../lib/multiAgentLayoutStore";

interface OrchestratorRailProps {
  width: number;
  backgroundAgents: AgentPanelState[];
  activeRunStatus?: { taskCount: number; workerCount: number; elapsed: string } | null;
  onPromoteAgent?: (workerId: string) => void;
  children?: React.ReactNode; // orchestrator chat transcript + composer
}

export function OrchestratorRail({
  width,
  backgroundAgents,
  activeRunStatus,
  onPromoteAgent,
  children,
}: OrchestratorRailProps) {
  return (
    <div
      className="flex h-full flex-col border-r"
      style={{ width, minWidth: 240, maxWidth: 480 }}
    >
      {/* Run status bar */}
      {activeRunStatus && (
        <div className="flex items-center gap-2 border-b px-3 py-1.5 text-xs text-muted-foreground">
          <span>{activeRunStatus.taskCount} tasks</span>
          <span>·</span>
          <span>{activeRunStatus.workerCount} agents</span>
          <span>·</span>
          <span>{activeRunStatus.elapsed}</span>
        </div>
      )}

      {/* Orchestrator chat transcript */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>

      {/* Background agent chips */}
      {backgroundAgents.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t p-2">
          {backgroundAgents.map((agent) => (
            <BackgroundAgentChip
              key={agent.workerId}
              agent={agent}
              onDoubleClick={() => onPromoteAgent?.(agent.workerId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create MultiAgentLayout**

```typescript
// apps/web/src/components/orchestrator/MultiAgentLayout.tsx
import { useMultiAgentLayoutStore } from "../../lib/multiAgentLayoutStore";
import { OrchestratorRail } from "./OrchestratorRail";
import { AgentPanel } from "./AgentPanel";

interface MultiAgentLayoutProps {
  orchestratorContent: React.ReactNode;
  agentContent?: (threadId: string) => React.ReactNode;
  onDirectMessage?: (workerId: string, message: string) => void;
  onTerminateAgent?: (workerId: string) => void;
  onPromoteAgent?: (workerId: string) => void;
}

export function MultiAgentLayout({
  orchestratorContent,
  agentContent,
  onDirectMessage,
  onTerminateAgent,
  onPromoteAgent,
}: MultiAgentLayoutProps) {
  const {
    mode,
    railWidth,
    panelDividerRatio,
    foregroundPanels,
    backgroundAgents,
    promotedPanelWorkerId,
  } = useMultiAgentLayoutStore();

  if (mode === "single-pane") {
    return <div className="flex h-full w-full">{orchestratorContent}</div>;
  }

  const promoted = promotedPanelWorkerId
    ? foregroundPanels.find((p) => p.workerId === promotedPanelWorkerId)
    : null;

  return (
    <div className="flex h-full w-full">
      {/* Orchestrator Rail */}
      <OrchestratorRail
        width={railWidth}
        backgroundAgents={backgroundAgents}
        onPromoteAgent={onPromoteAgent}
      >
        {orchestratorContent}
      </OrchestratorRail>

      {/* Agent Panels */}
      <div className="flex flex-1 overflow-hidden">
        {promoted ? (
          // Single promoted panel
          <AgentPanel
            agent={promoted}
            onClose={() => onTerminateAgent?.(promoted.workerId)}
            onDirectMessage={(msg) => onDirectMessage?.(promoted.workerId, msg)}
          >
            {agentContent?.(promoted.threadId)}
          </AgentPanel>
        ) : (
          // Side-by-side panels
          foregroundPanels.map((agent, i) => (
            <div
              key={agent.workerId}
              className="overflow-hidden"
              style={{
                width:
                  foregroundPanels.length === 1
                    ? "100%"
                    : i === 0
                      ? `${panelDividerRatio * 100}%`
                      : `${(1 - panelDividerRatio) * 100}%`,
              }}
            >
              <AgentPanel
                agent={agent}
                onClose={() => onTerminateAgent?.(agent.workerId)}
                onDirectMessage={(msg) => onDirectMessage?.(agent.workerId, msg)}
              >
                {agentContent?.(agent.threadId)}
              </AgentPanel>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && bun typecheck`
Expected: Pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/orchestrator/MultiAgentLayout.tsx apps/web/src/components/orchestrator/OrchestratorRail.tsx
git commit -m "feat(web): add MultiAgentLayout container and OrchestratorRail with auto-transition"
```

---

## Task 11: Web — Sidebar Model Icons

**Files:**

- Modify: Sidebar thread list component (find exact file — likely in `apps/web/src/components/` containing thread list rendering)

- [ ] **Step 1: Find the sidebar thread component**

Search for the component that renders thread titles in the sidebar. Look for references to `threadId`, `title`, and sidebar-related class names. The file is likely `Sidebar.tsx`, `ThreadList.tsx`, or similar in `apps/web/src/components/`.

- [ ] **Step 2: Add model icon rendering**

Create a helper to render model icons for a thread based on its active workers:

```typescript
function ThreadModelIcons({ workers }: { workers: ReadonlyArray<{ modelBinding?: { model: string; provider: string } | null; visibility?: string; status: string }> }) {
  const active = workers.filter((w) => w.status !== "terminated");
  if (active.length === 0) return null;

  // Group by provider, count
  const counts = new Map<string, number>();
  for (const w of active) {
    const provider = w.modelBinding?.provider ?? "unknown";
    counts.set(provider, (counts.get(provider) ?? 0) + 1);
  }

  return (
    <div className="flex items-center gap-0.5">
      {[...counts.entries()].map(([provider, count]) => (
        <span
          key={provider}
          className="flex h-4 items-center rounded px-1 text-[10px] font-bold"
          style={{
            backgroundColor: provider === "codex" ? "#4d96ff" : "#64ffda",
            color: "#0d1b2a",
          }}
        >
          {provider === "codex" ? "X" : "C"}
          {count > 1 && `×${count}`}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Integrate into sidebar thread entry**

Add the `ThreadModelIcons` component next to the thread title, passing the workers from the orchestration read model for that thread.

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && bun typecheck`
Expected: Pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/
git commit -m "feat(web): add multi-model icons to sidebar thread entries"
```

---

## Task 12: ORCHESTRATOR.md Updates

**Files:**

- Modify: `docs/ORCHESTRATOR.md`

- [ ] **Step 1: Add new sections to ORCHESTRATOR.md**

Append after the existing content:

```markdown
## Agent Tool Usage

You have 38 orchestration tools available. Use them based on complexity:

- **Simple question**: Route to `answer`. No tools needed.
- **Single task**: Route to `delegate`. Use `spawn_agent` with mode "foreground".
- **Multi-part request**: Route to `decompose`. Use multiple `spawn_agent` calls in parallel.
- **Research needed**: Use `spawn_agent` with mode "background" for research tasks.

### Foreground vs Background

- **Foreground** (max 2): Primary implementation tasks the user should see. These get visible panels.
- **Background** (max 6): Research, audits, test runs, dependency checks. Status chips only.

### When to Promote/Demote

- Promote a background agent when it needs user attention or has findings to discuss.
- Demote a foreground agent when it's waiting on a dependency and the user doesn't need to watch.

## Model Selection Guide

| Task Type                       | Recommended Model | Why                                |
| ------------------------------- | ----------------- | ---------------------------------- |
| Complex reasoning, architecture | Claude Opus       | Deep analysis, multi-step planning |
| Large repository edits          | Codex             | Fast multi-file refactors          |
| Frontend implementation         | Claude Sonnet     | Quick, good at React/CSS           |
| Cheap research/audits           | Claude Haiku      | Low cost, fast responses           |
| Code review                     | Claude Opus       | Thorough, catches subtle bugs      |
| Test writing                    | Claude Sonnet     | Fast, pattern-based                |

## Coordination Patterns

### Parallel Independent

Best for: backend + frontend, API + tests, feature + docs
```

spawn_agent(role: "backend", ...) // parallel
spawn_agent(role: "frontend", ...)
wait_all()
merge_work(...)

```

### Pipeline
Best for: API first → then client that consumes it
```

spawn_agent(role: "api", ...)
wait_agent(apiWorkerId)
transfer_context(from: apiWorkerId, to: clientWorkerId, content: { diff: true })
spawn_agent(role: "client", ...)

```

### Research-then-Build
Best for: unknown problem space
```

spawn_agent(role: "researcher", mode: "background", model: "haiku", ...)
wait_agent(researcherWorkerId)
results = get_background_results(researcherWorkerId)
spawn_agent(role: "builder", mode: "foreground", ...) // use research results in task description

```

## Budget Defaults

These are configurable per-thread by telling the orchestrator directly.

```

max_foreground_agents: 2
max_background_agents: 6
max_subagent_depth: 3
max_total_workers: 12
max_concurrent_writers: 4

```

```

- [ ] **Step 2: Commit**

```bash
git add docs/ORCHESTRATOR.md
git commit -m "docs: add agent tools, model guide, coordination patterns, and budgets to ORCHESTRATOR.md"
```

---

## Task 13: Integration — Wire Everything Together

**Files:**

- Modify: `apps/web/src/components/orchestrator/useOrchestratorEngine.ts`
- Modify: `apps/web/src/components/orchestrator/OrchestratorPanel.tsx`

- [ ] **Step 1: Update useOrchestratorEngine to sync workers with layout store**

In `useOrchestratorEngine.ts`, add an effect that watches `orchestratorWorkers` and syncs with the multi-agent layout store:

```typescript
import { useMultiAgentLayoutStore } from "../../lib/multiAgentLayoutStore";

// Inside the hook, add:
const syncWithWorkers = useMultiAgentLayoutStore((s) => s.syncWithWorkers);

useEffect(() => {
  if (orchestratorWorkers.length > 0) {
    syncWithWorkers(orchestratorWorkers);
  }
}, [orchestratorWorkers, syncWithWorkers]);
```

- [ ] **Step 2: Update DEFAULT_ORCHESTRATOR_SPAWN_BUDGET**

Change the defaults to support multi-agent:

```typescript
const DEFAULT_ORCHESTRATOR_SPAWN_BUDGET = {
  maxDepth: 3,
  maxChildren: 4,
  maxConcurrentWriters: 4,
  maxTotalWorkers: 12,
  allowedTools: [],
  writeScope: [],
};
```

- [ ] **Step 3: Update OrchestratorPanel to use MultiAgentLayout**

Modify `OrchestratorPanel.tsx` to conditionally render `MultiAgentLayout` when workers are active:

```typescript
import { MultiAgentLayout } from "./MultiAgentLayout";
import { useMultiAgentLayoutStore } from "../../lib/multiAgentLayoutStore";

// In the render:
const mode = useMultiAgentLayoutStore((s) => s.mode);

if (mode === "rail-and-panels") {
  return (
    <MultiAgentLayout
      orchestratorContent={/* existing orchestrator chat UI */}
      agentContent={(threadId) => /* render ChatView for threadId */}
      onDirectMessage={(workerId, message) => /* dispatch send_to_agent */}
      onTerminateAgent={(workerId) => /* dispatch terminate_agent */}
      onPromoteAgent={(workerId) => /* dispatch promote */}
    />
  );
}

// Otherwise render existing single-pane UI
```

- [ ] **Step 4: Typecheck all packages**

Run: `bun typecheck` (root level)
Expected: Pass across all packages.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/orchestrator/useOrchestratorEngine.ts apps/web/src/components/orchestrator/OrchestratorPanel.tsx
git commit -m "feat(web): wire multi-agent layout store into orchestrator engine and panel"
```

---

## Task 14: Verification — End-to-End Smoke Test

- [ ] **Step 1: Build all packages**

Run: `bun run build`
Expected: All packages build successfully.

- [ ] **Step 2: Start dev server**

Run: `bun run dev`
Expected: Server starts, web UI loads at localhost.

- [ ] **Step 3: Verify single-pane mode**

Open a thread, send a simple message. Verify the orchestrator responds in normal single-pane view with no layout changes.

- [ ] **Step 4: Verify multi-agent layout renders**

Manually trigger a worker spawn via the WebSocket console or browser devtools to verify the layout transitions to rail+panels mode.

- [ ] **Step 5: Commit final state**

```bash
git add -A
git commit -m "feat: multi-agent orchestration — 38 tools, rail+panels layout, 3-tier agent hierarchy"
```
