/**
 * OrchestrationToolRouterLive - Layer implementation for OrchestrationToolRouterService.
 *
 * Routes orchestration tool calls from the meta-agent into three categories:
 * 1. **UI directives** — returned as ephemeral signals (not persisted).
 * 2. **Read-only tools** — query the in-memory read model from the engine.
 * 3. **Command tools** — dispatch domain commands to the orchestration engine.
 *
 * Input validation uses `Schema.decodeUnknown` against the per-tool schemas
 * from `@orchestrate/contracts`.
 *
 * @module OrchestrationToolRouterLive
 */
import {
  ORCHESTRATION_TOOL_NAMES,
  READ_ONLY_TOOLS,
  UI_DIRECTIVE_TOOLS,
  CommandId,
  EvidenceArtifactId,
  type BrowserSessionId,
  type EvidenceArtifactKind,
  type OrchestrationReadModel,
  type OrchestrationThread,
  type OrchestratorTaskId,
  type OrchestratorWorkerModelBinding,
  type OrchestratorWorkerId,
} from "@orchestrate/contracts";
import * as ToolSchemas from "@orchestrate/contracts";
import { Effect, Layer, Option, Result, Schema, Stream } from "effect";
import crypto from "node:crypto";

import {
  BrowserRuntimeService,
  type BrowserRuntimeServiceShape,
} from "../../browserRuntime/Services/BrowserRuntimeService.ts";
import {
  BrowserOrchestrationEvidenceRepository,
  type BrowserOrchestrationEvidenceRepositoryShape,
} from "../../persistence/Services/BrowserOrchestrationEvidence.ts";
import {
  detectObjectiveInjection,
  objectiveContainsFabricatedReport,
  workerKickoffMessage,
} from "../reportProtocol.ts";
import { evaluateTurnStaleness } from "../turnStaleness.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import {
  OrchestrationToolRouterService,
  type OrchestrationToolRouterShape,
} from "../Services/OrchestrationToolRouter.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Decode tool input against its schema, mapping decode errors to plain Error. */
function decodeInput<A, I>(schema: Schema.Schema<A, I>, input: unknown): Effect.Effect<A, Error> {
  return Schema.decodeUnknownEffect(schema)(input).pipe(
    Effect.mapError((e) => new Error(`Invalid tool input: ${e.message}`)),
  );
}

/** Generate a branded ID string via crypto.randomUUID(). */
const uuid = (): string => crypto.randomUUID();

/** Current ISO timestamp. */
const now = (): string => new Date().toISOString();

const DEFAULT_SPAWN_BUDGET = {
  maxDepth: 3,
  maxChildren: 5,
  maxConcurrentWriters: 2,
  maxTotalWorkers: 10,
  allowedTools: [],
  writeScope: [],
} as const;

const SpawnBudgetInputSchema = Schema.Struct({
  maxDepth: Schema.Number,
  maxChildren: Schema.Number,
  maxConcurrentWriters: Schema.Number,
  maxTotalWorkers: Schema.Number,
});

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readOptionalString(
  record: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return undefined;
}

function readOptionalStringArray(
  record: Record<string, unknown>,
  ...keys: string[]
): ReadonlyArray<string> {
  for (const key of keys) {
    const value = record[key];
    if (!Array.isArray(value)) {
      continue;
    }
    const normalized = value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return [];
}

function normalizeVisibility(value: string | undefined): "foreground" | "background" {
  return value === "background" ? "background" : "foreground";
}

function findEvidenceRefByKind(
  repository: Option.Option<BrowserOrchestrationEvidenceRepositoryShape>,
  refs: ReadonlyArray<string>,
  kind: EvidenceArtifactKind,
): Effect.Effect<string | undefined, never> {
  if (Option.isNone(repository)) {
    return Effect.logWarning(
      "OrchestrationToolRouter handleAcceptWork: evidence repository unavailable; browserAfterDomRef will be omitted.",
    ).pipe(Effect.as(undefined));
  }

  return Effect.gen(function* () {
    for (const ref of refs) {
      const artifact = yield* repository.value
        .getEvidenceArtifact({ artifactId: EvidenceArtifactId.makeUnsafe(ref) })
        .pipe(
          Effect.catch((error) =>
            Effect.logWarning(
              "OrchestrationToolRouter findEvidenceRefByKind: artifact lookup failed; ref will be ignored.",
              {
                artifactRef: ref,
                expectedKind: kind,
                cause: error,
              },
            ).pipe(Effect.as(Option.none())),
          ),
        );
      if (Option.isSome(artifact) && artifact.value.kind === kind) {
        return ref;
      }
    }
    return undefined;
  });
}

function normalizeProvider(value: string | undefined): "codex" | "claudeAgent" | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "codex" || normalized === "openai") {
    return "codex";
  }
  if (
    normalized === "claude" ||
    normalized === "claudeagent" ||
    normalized === "claude-agent" ||
    normalized === "sonnet" ||
    normalized === "opus" ||
    normalized === "haiku"
  ) {
    return "claudeAgent";
  }
  return undefined;
}

function inferProviderFromModel(model: string | undefined): "codex" | "claudeAgent" | undefined {
  if (!model) {
    return undefined;
  }
  const normalized = model.trim().toLowerCase();
  if (normalized.includes("codex") || normalized.includes("gpt-5") || normalized.includes("gpt5")) {
    return "codex";
  }
  if (
    normalized.includes("claude") ||
    normalized.includes("sonnet") ||
    normalized.includes("opus") ||
    normalized.includes("haiku")
  ) {
    return "claudeAgent";
  }
  return undefined;
}

function buildStandbyObjective(): string {
  return [
    "Stand by for follow-up instructions from the orchestrator.",
    "Do not modify files or run project-changing commands until you receive a concrete implementation task.",
    "Reply once to confirm that the agent window is open and ready.",
  ].join(" ");
}

function buildStandbyAcceptanceCriteria(): ReadonlyArray<string> {
  return [
    "The worker thread is created and visible in the UI.",
    "The worker confirms it is ready for follow-up instructions.",
    "No repository files are modified before a later task is assigned.",
  ];
}

function resolveSpawnTaskTitle(input: {
  readonly taskLabel?: string;
  readonly objective?: string;
}): string {
  return input.taskLabel ?? input.objective ?? "Stand by for follow-up instructions";
}

function resolveSpawnObjective(input: {
  readonly taskLabel?: string;
  readonly objective?: string;
}): string {
  if (input.objective) {
    return input.objective;
  }
  if (input.taskLabel) {
    return `Complete the following task: ${input.taskLabel}`;
  }
  return buildStandbyObjective();
}

function browserAutomationUnavailable(toolName: string) {
  // The string here surfaces to the agent verbatim — keep it actionable.
  // Two real-world causes share this code path:
  //   1. The user is running `bun run dev:web` (no Electron). The visible
  //      Electron WebContentsView doesn't exist, so there's no surface to
  //      attach Playwright to. Architecture deliberately fails closed
  //      instead of silently launching a separate headless browser.
  //   2. The user IS running desktop, but the IPC bridge isn't wired (e.g.
  //      Electron crashed or hasn't reconnected yet).
  //
  // The agent should read this and either (a) ask the user to launch the
  // desktop app for browser validation, or (b) fall back to opening the
  // preview URL via `orchestrate_open_browser_preview` and asking for
  // visual confirmation. The orchestrator playbook
  // (`docs/ORCHESTRATOR.md` → "Browser validation unavailable") describes
  // the fallback workflow.
  return {
    error:
      `${toolName} is unavailable: orchestrate is running in web-only mode (no Electron desktop app connected), ` +
      `so there is no visible browser surface to drive. Browser automation requires the desktop app — ` +
      `launch it with \`bun run dev:desktop\` and re-attempt. ` +
      `As a fallback you can call \`orchestrate_open_browser_preview\` to open the URL in the iframe ` +
      `preview panel and ask the user to confirm what they see; flag the validation as ` +
      `\`static-screenshot-evidence\` rather than \`live-shared-browser\` when reporting.`,
    code: "browser-automation-unavailable",
    actionable: true,
    fallback: {
      tool: "orchestrate_open_browser_preview",
      label: "Open URL in the iframe preview panel and ask the user for visual confirmation.",
    },
  };
}

function resolveSpawnAcceptanceCriteria(input: {
  readonly taskLabel?: string;
  readonly acceptanceCriteria: ReadonlyArray<string>;
}): ReadonlyArray<string> {
  if (input.acceptanceCriteria.length > 0) {
    return input.acceptanceCriteria;
  }
  if (input.taskLabel) {
    return [
      `Complete the assigned task: ${input.taskLabel}.`,
      "Report the files changed, commands run, and any follow-up needed.",
    ];
  }
  return buildStandbyAcceptanceCriteria();
}

function resolveSpawnBudget(input: {
  readonly override?:
    | {
        readonly maxDepth: number;
        readonly maxChildren: number;
        readonly maxConcurrentWriters: number;
        readonly maxTotalWorkers: number;
      }
    | undefined;
  readonly inherited?:
    | {
        readonly maxDepth: number;
        readonly maxChildren: number;
        readonly maxConcurrentWriters: number;
        readonly maxTotalWorkers: number;
        readonly allowedTools: ReadonlyArray<string>;
        readonly writeScope: ReadonlyArray<string>;
      }
    | undefined;
}) {
  if (input.inherited) {
    return input.inherited;
  }
  return {
    ...DEFAULT_SPAWN_BUDGET,
    ...input.override,
  };
}

function buildRequestedModelBinding(input: {
  readonly workerId: string;
  readonly provider?: string;
  readonly model?: string;
}): OrchestratorWorkerModelBinding | undefined {
  if (!input.model) {
    return undefined;
  }
  const provider = normalizeProvider(input.provider) ?? inferProviderFromModel(input.model);
  if (!provider) {
    return undefined;
  }
  return {
    workerId: input.workerId as any,
    provider,
    model: input.model,
    selectedAt: now(),
    selectedBy: "orchestrator-tool",
    selectionReason: "Requested explicitly via spawn_agent",
    inheritedFromTaskPolicy: false,
  };
}

function resolveWorkerIdFromToolInput(
  readModel: OrchestrationReadModel,
  input: unknown,
): string | null {
  const raw = asObject(input) ?? {};
  const directWorkerId = readOptionalString(raw, "agentId", "agent_id", "workerId", "worker_id");
  if (directWorkerId) {
    return directWorkerId;
  }

  const threadId = readOptionalString(raw, "threadId", "thread_id");
  if (!threadId) {
    return null;
  }

  return (
    readModel.orchestratorWorkers.find((worker) => worker.threadId === (threadId as any))
      ?.workerId ?? null
  );
}

function resolveActiveRunForThread(
  readModel: OrchestrationReadModel,
  thread: OrchestrationThread,
  requestedRunId: string | undefined,
) {
  const activeRunsForProject = (readModel.orchestratorRuns ?? [])
    .filter((run) => run.projectId === thread.projectId && run.status === "active")
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  if (requestedRunId) {
    return activeRunsForProject.find((run) => run.runId === (requestedRunId as any)) ?? null;
  }

  return activeRunsForProject[0] ?? null;
}

// ---------------------------------------------------------------------------
// Read-only tool handlers
// ---------------------------------------------------------------------------

function handleGetAgentStatus(
  readModel: OrchestrationReadModel,
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.GetAgentStatusInput, input);
    const worker = readModel.orchestratorWorkers.find((w) => w.workerId === decoded.agentId);
    if (!worker) {
      return { error: `Worker not found: ${decoded.agentId}` };
    }
    // Gap H: surface the worker's structured submit report from the active task
    // so the orchestrator can read "what the worker did" in a single call
    // without falling back to disk inspection.
    const activeTask = worker.activeTaskId
      ? (readModel.orchestratorTasks ?? []).find((t) => t.taskId === worker.activeTaskId)
      : undefined;

    // Gap M2: even when the worker hasn't called send_update we want SOMETHING
    // narrative for the orchestrator to read. Pull the most recent assistant
    // text from the worker's thread as a fallback. Truncated to keep the tool
    // result small — the orchestrator can fetch full text via get_agent_logs
    // (once we surface assistant deltas there too).
    const workerThread = (readModel.threads ?? []).find((t: any) => t.id === worker.threadId);
    const lastAssistantMessage = (() => {
      const messages = (workerThread as any)?.messages;
      if (!Array.isArray(messages)) return null;
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m && m.role === "assistant" && typeof m.text === "string" && m.text.trim().length > 0) {
          const text = m.text.trim();
          return {
            text: text.length > 800 ? `${text.slice(0, 800)}…` : text,
            truncated: text.length > 800,
            length: text.length,
          };
        }
      }
      return null;
    })();

    // ORC-219: surface turn staleness so a stuck worker is visible to the
    // orchestrator instead of looking like it's still running. The
    // orchestrator can react (terminate, escalate, reassign) on this flag.
    const staleness = evaluateTurnStaleness({
      status: worker.status as unknown as string,
      updatedAt: worker.updatedAt as unknown as string | undefined,
      nowMs: Date.now(),
    });

    return {
      agentId: worker.workerId,
      status: worker.status,
      visibility: worker.visibility ?? "foreground",
      activeTaskId: worker.activeTaskId ?? null,
      threadId: worker.threadId,
      updatedAt: worker.updatedAt,
      // Worker-self-reported posture from `orchestrate_send_update_to_orchestrator`.
      // This is the structured channel — prefer it over `lastAssistantMessage`
      // when both are present.
      ...(worker.latestUpdate !== undefined ? { latestUpdate: worker.latestUpdate } : {}),
      // Narrative fallback so the orchestrator gets useful context even if the
      // worker forgot to call send_update.
      ...(lastAssistantMessage !== null ? { lastAssistantMessage } : {}),
      ...(activeTask?.submitSummary !== undefined
        ? { submitSummary: activeTask.submitSummary }
        : {}),
      ...(activeTask?.filesWritten !== undefined ? { filesWritten: activeTask.filesWritten } : {}),
      ...(activeTask?.testsRun !== undefined ? { testsRun: activeTask.testsRun } : {}),
      ...(activeTask?.submitNotes !== undefined ? { submitNotes: activeTask.submitNotes } : {}),
      ...(activeTask?.hasChanges !== undefined ? { hasChanges: activeTask.hasChanges } : {}),
      ...(activeTask?.diffStats !== undefined ? { diffStats: activeTask.diffStats } : {}),
      ...(staleness.stale
        ? {
            stale: true,
            idleMs: staleness.idleMs,
            stalenessThresholdMs: staleness.thresholdMs,
            stalenessReason:
              "No worker activity recorded for longer than the staleness threshold. The worker may be hung. Consider terminating it and reassigning the task.",
          }
        : {}),
    };
  });
}

function handleGetAllStatus(
  readModel: OrchestrationReadModel,
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.GetAllStatusInput, input);
    const workers = decoded.runId
      ? readModel.orchestratorWorkers.filter((w) => w.runId === decoded.runId)
      : readModel.orchestratorWorkers;
    return {
      agents: workers.map((w) => ({
        agentId: w.workerId,
        status: w.status,
        visibility: w.visibility ?? "foreground",
        activeTaskId: w.activeTaskId ?? null,
        threadId: w.threadId,
      })),
    };
  });
}

interface SpawnTreeNode {
  agentId: string;
  workerId: string;
  status: string;
  children: SpawnTreeNode[];
}

function handleGetSpawnTree(
  readModel: OrchestrationReadModel,
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.GetSpawnTreeInput, input);
    const workers = readModel.orchestratorWorkers.filter((w) => w.runId === decoded.runId);

    // Index by workerId for child lookup
    const byId = new Map(workers.map((w) => [w.workerId, w]));
    const childrenOf = new Map<string | undefined, typeof workers>();
    for (const w of workers) {
      const parentKey = w.parentWorkerId ?? undefined;
      const siblings = childrenOf.get(parentKey) ?? [];
      siblings.push(w);
      childrenOf.set(parentKey, siblings);
    }

    function buildNode(workerId: string): SpawnTreeNode {
      const w = byId.get(workerId);
      const kids = childrenOf.get(workerId as OrchestratorWorkerId) ?? [];
      return {
        agentId: w?.workerId ?? workerId,
        workerId,
        status: w?.status ?? "unknown",
        children: kids.map((k) => buildNode(k.workerId)),
      };
    }

    // Root workers have no parentWorkerId
    const roots = childrenOf.get(undefined) ?? [];
    const rootNode: SpawnTreeNode =
      roots.length === 1
        ? buildNode(roots[0]!.workerId)
        : {
            agentId: "root",
            workerId: "root",
            status: "virtual",
            children: roots.map((r) => buildNode(r.workerId)),
          };

    return { root: rootNode };
  });
}

// ---------------------------------------------------------------------------
// Command tool handlers
// ---------------------------------------------------------------------------

function handleSpawnAgent(
  readModel: OrchestrationReadModel,
  dispatch: OrchestrationEngineService["Type"]["dispatch"],
  threadId: string,
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const raw = asObject(input) ?? {};
    const requestedRunId = readOptionalString(raw, "runId", "run_id");
    const requestedTaskKey = readOptionalString(raw, "taskId", "task_id");
    const taskLabel = readOptionalString(raw, "task", "title", "label");
    const objective = readOptionalString(raw, "objective", "instructions", "prompt", "message");
    const acceptanceCriteria = readOptionalStringArray(
      raw,
      "acceptanceCriteria",
      "acceptance_criteria",
      "criteria",
    );
    const visibility = normalizeVisibility(readOptionalString(raw, "visibility", "mode", "panel"));
    const provider = readOptionalString(raw, "provider");
    const model = readOptionalString(raw, "model");
    const worktreePath = readOptionalString(raw, "worktreePath", "worktree_path", "worktree");
    const branch = readOptionalString(raw, "branch");
    const spawnBudget =
      raw.spawnBudget && typeof raw.spawnBudget === "object" && !Array.isArray(raw.spawnBudget)
        ? yield* decodeInput(SpawnBudgetInputSchema, raw.spawnBudget).pipe(
            Effect.orElseSucceed(() => undefined),
          )
        : undefined;

    const callingThread =
      readModel.threads.find((thread) => thread.id === (threadId as any)) ?? null;
    if (!callingThread) {
      return { error: `Calling orchestrator thread not found: ${threadId}` };
    }

    const existingTask =
      requestedTaskKey !== undefined
        ? (readModel.orchestratorTasks ?? []).find(
            (task) => task.taskId === (requestedTaskKey as any),
          )
        : null;

    let resolvedRun =
      (existingTask
        ? (readModel.orchestratorRuns ?? []).find((run) => run.runId === existingTask.runId)
        : null) ?? resolveActiveRunForThread(readModel, callingThread, requestedRunId);

    let resolvedRunId = resolvedRun?.runId ?? null;
    const normalizedTaskLabel = taskLabel ?? (!existingTask ? requestedTaskKey : undefined);
    const normalizedObjective = resolveSpawnObjective({
      taskLabel: normalizedTaskLabel,
      objective,
    });
    if (objectiveContainsFabricatedReport(normalizedObjective)) {
      return {
        error:
          "Objective contains a fabricated REPORT block. REPORT blocks must be authored by the spawned worker on its final turn. Strip the '## REPORT' section from the objective and try again.",
      };
    }
    // ORC-206: defense in depth. The objective is set by the orchestrator,
    // but a replayed-history or injected-message orchestrator could plant
    // orchestrator-control directives inside the objective text to pivot
    // the worker. Reject at the spawn boundary.
    const injection = detectObjectiveInjection(normalizedObjective);
    if (injection) {
      return {
        error:
          "Objective contains an orchestrator-control directive (" +
          injection.pattern +
          "): \"" +
          injection.excerpt +
          "\". Strip the directive from the objective; the orchestrator must not pass control sequences through the spawn boundary.",
      };
    }
    const normalizedCriteria = resolveSpawnAcceptanceCriteria({
      taskLabel: normalizedTaskLabel,
      acceptanceCriteria,
    });

    const resolvedSpawnBudget = resolveSpawnBudget({
      override: spawnBudget,
      inherited: resolvedRun?.spawnBudget,
    });

    if (!resolvedRunId) {
      resolvedRunId = uuid() as any;
      yield* dispatch({
        type: "orchestrator.run.create" as const,
        commandId: uuid() as any,
        runId: resolvedRunId,
        projectId: callingThread.projectId,
        userRequest: normalizedTaskLabel ?? normalizedObjective,
        goals: [...normalizedCriteria],
        spawnBudget: resolvedSpawnBudget as any,
        createdAt: now() as any,
      }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

      resolvedRun = {
        runId: resolvedRunId,
        projectId: callingThread.projectId,
        userRequest: normalizedTaskLabel ?? normalizedObjective,
        status: "active",
        rootTaskId: "" as any,
        goals: [...normalizedCriteria],
        spawnBudget: resolvedSpawnBudget as any,
        createdAt: now(),
        updatedAt: now(),
      } as (typeof readModel.orchestratorRuns)[number];
    }

    const resolvedTaskId = existingTask?.taskId ?? (uuid() as any);
    if (!existingTask) {
      yield* dispatch({
        type: "orchestrator.task.create" as const,
        commandId: uuid() as any,
        taskId: resolvedTaskId,
        runId: resolvedRunId,
        ...(resolvedRun?.rootTaskId ? { parentTaskId: resolvedRun.rootTaskId } : {}),
        title: resolveSpawnTaskTitle({
          taskLabel: normalizedTaskLabel,
          objective,
        }),
        objective: normalizedObjective,
        acceptanceCriteria: [...normalizedCriteria],
        maxIterations: 3,
        createdAt: now() as any,
      }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));
    }

    const workerId = uuid();
    const workerThreadId = uuid();
    const modelBinding = buildRequestedModelBinding({
      workerId,
      provider,
      model,
    });

    // Resolve provider/model for the worker thread. Explicit provider wins;
    // otherwise infer from the model name so a Claude model never lands on
    // Codex (or vice versa). Fall back to the orchestrator thread's selection
    // only when neither an explicit nor an inferable provider is available.
    const resolvedProvider =
      normalizeProvider(provider) ??
      inferProviderFromModel(model) ??
      callingThread.modelSelection.provider;
    const resolvedModel = model?.trim() || callingThread.modelSelection.model;

    // Create a real thread for the worker so the provider runtime can attach.
    yield* dispatch({
      type: "thread.create" as const,
      commandId: uuid() as any,
      threadId: workerThreadId as any,
      projectId: callingThread.projectId,
      title: ((taskLabel ?? objective ?? "Agent") as string).slice(0, 50) as any,
      modelSelection: { provider: resolvedProvider, model: resolvedModel } as any,
      runtimeMode: "full-access" as any,
      interactionMode: "default" as any,
      threadType: "agent" as any,
      parentThreadId: threadId as any,
      branch: (branch ?? null) as any,
      worktreePath: (worktreePath ?? null) as any,
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    yield* dispatch({
      type: "orchestrator.worker.spawn" as const,
      commandId: uuid() as any,
      workerId: workerId as any,
      runId: resolvedRunId as any,
      taskId: resolvedTaskId as any,
      threadId: workerThreadId as any,
      spawnBudget: resolvedSpawnBudget as any,
      workspace: {
        mode: worktreePath ? ("worktree" as const) : ("local" as const),
        branch,
        worktreePath,
        cwd:
          worktreePath ??
          callingThread.associatedWorktreePath ??
          callingThread.worktreePath ??
          process.cwd(),
        terminalIds: [],
      },
      ...(modelBinding ? { modelBinding } : {}),
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    if (visibility === "background") {
      yield* dispatch({
        type: "orchestrator.worker.demote" as const,
        commandId: uuid() as any,
        workerId: workerId as any,
        visibility: "background" as any,
        createdAt: now() as any,
      }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));
    }

    // Kick off the first turn on the newly-created worker thread so the
    // provider runtime picks it up immediately.
    //
    // Gap L2: workers have no orchestrator.task.submit tool on their MCP
    // surface — the submit happens server-side via accept_work / reject_work
    // auto-submit. So the reminder asks workers to emit a REPORT block in
    // their FINAL assistant message. The orchestrator's review flow reads
    // this block (via get_agent_logs) plus get_agent_diff to accept/reject.
    // Inject the resolved write scope into the kickoff so the worker actually
    // knows where it's allowed to write. Without this, workers have been
    // observed silently writing to /tmp/ when given a project-relative
    // objective, then reporting filesWritten paths the orchestrator's
    // git-scoped diff cannot see — leaving the orchestrator in a "no work
    // produced" loop while the worker insists it shipped.
    const taskMessage = workerKickoffMessage(normalizedObjective, {
      writeScope: resolvedSpawnBudget.writeScope,
    });
    yield* dispatch({
      type: "thread.turn.start" as const,
      commandId: uuid() as any,
      threadId: workerThreadId as any,
      message: {
        messageId: uuid() as any,
        role: "user" as const,
        text: taskMessage,
        attachments: [],
      },
      modelSelection: { provider: resolvedProvider, model: resolvedModel } as any,
      runtimeMode: "full-access" as any,
      interactionMode: "default" as any,
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    return {
      agentId: workerId,
      threadId: workerThreadId,
      workerId,
      runId: resolvedRunId,
      taskId: resolvedTaskId,
      visibility,
    };
  });
}

function handleTerminateAgent(
  dispatch: OrchestrationEngineService["Type"]["dispatch"],
  readModel: any,
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.TerminateAgentInput, input);

    // 1. Mark the worker terminated in the orchestrator read model.
    yield* dispatch({
      type: "orchestrator.worker.terminate" as const,
      commandId: uuid() as any,
      workerId: decoded.agentId as any,
      reason: decoded.reason ?? "Terminated by orchestrator",
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    // 2. Stop the underlying provider session so the child Codex/Claude
    //    process is actually killed and resources are released. Without this
    //    the worker row disappears from the UI but the process keeps running.
    const worker = (readModel.orchestratorWorkers ?? []).find(
      (w: any) => w.workerId === decoded.agentId,
    );
    const workerThreadId = worker?.threadId;
    if (workerThreadId) {
      yield* dispatch({
        type: "thread.session.stop" as const,
        commandId: uuid() as any,
        threadId: workerThreadId as any,
        reason: decoded.reason ?? "Terminated by orchestrator",
        createdAt: now() as any,
      }).pipe(Effect.catch(() => Effect.void));
    }

    return {
      agentId: decoded.agentId,
      terminated: true,
      ...(workerThreadId ? { sessionStopped: true, threadId: workerThreadId } : {}),
    };
  });
}

function handlePauseAgent(
  dispatch: OrchestrationEngineService["Type"]["dispatch"],
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.PauseAgentInput, input);
    yield* dispatch({
      type: "orchestrator.worker.pause" as const,
      commandId: uuid() as any,
      workerId: decoded.agentId as any,
      reason: decoded.reason,
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    return { agentId: decoded.agentId, paused: true };
  });
}

function handleResumeAgent(
  dispatch: OrchestrationEngineService["Type"]["dispatch"],
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.ResumeAgentInput, input);
    yield* dispatch({
      type: "orchestrator.worker.resume" as const,
      commandId: uuid() as any,
      workerId: decoded.agentId as any,
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    return { agentId: decoded.agentId, resumed: true };
  });
}

function handlePromoteToForeground(
  dispatch: OrchestrationEngineService["Type"]["dispatch"],
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.PromoteToForegroundInput, input);
    yield* dispatch({
      type: "orchestrator.worker.promote" as const,
      commandId: uuid() as any,
      workerId: decoded.agentId as any,
      visibility: "foreground" as any,
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    return { agentId: decoded.agentId, visibility: "foreground" as const };
  });
}

function handleFocusAgent(
  readModel: OrchestrationReadModel,
  dispatch: OrchestrationEngineService["Type"]["dispatch"],
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const agentId = resolveWorkerIdFromToolInput(readModel, input);
    if (!agentId) {
      return { error: "Missing agent id for focus_agent." };
    }

    yield* dispatch({
      type: "orchestrator.worker.promote" as const,
      commandId: uuid() as any,
      workerId: agentId as any,
      visibility: "foreground" as any,
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    const worker = (readModel.orchestratorWorkers ?? []).find(
      (w) => w.workerId === (agentId as any),
    );
    return {
      success: true,
      focused: true,
      directive: "focus" as const,
      threadId: worker?.threadId ?? null,
      workerId: agentId,
      agentId,
    };
  });
}

function handlePromotePanel(
  readModel: OrchestrationReadModel,
  dispatch: OrchestrationEngineService["Type"]["dispatch"],
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const agentId = resolveWorkerIdFromToolInput(readModel, input);
    if (!agentId) {
      return { error: "Missing agent id for promote_panel." };
    }

    yield* dispatch({
      type: "orchestrator.worker.promote" as const,
      commandId: uuid() as any,
      workerId: agentId as any,
      visibility: "foreground" as any,
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    return { promoted: true, agentId };
  });
}

function handleCollapsePanel(
  readModel: OrchestrationReadModel,
  dispatch: OrchestrationEngineService["Type"]["dispatch"],
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const agentId = resolveWorkerIdFromToolInput(readModel, input);
    if (!agentId) {
      return { error: "Missing agent id for collapse_panel." };
    }

    yield* dispatch({
      type: "orchestrator.worker.demote" as const,
      commandId: uuid() as any,
      workerId: agentId as any,
      visibility: "background" as any,
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    const worker = (readModel.orchestratorWorkers ?? []).find(
      (w) => w.workerId === (agentId as any),
    );
    return {
      success: true,
      collapsed: true,
      directive: "collapse" as const,
      threadId: worker?.threadId ?? null,
      workerId: agentId,
      agentId,
    };
  });
}

function handleDemoteToBackground(
  dispatch: OrchestrationEngineService["Type"]["dispatch"],
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.DemoteToBackgroundInput, input);
    yield* dispatch({
      type: "orchestrator.worker.demote" as const,
      commandId: uuid() as any,
      workerId: decoded.agentId as any,
      visibility: "background" as any,
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    return { agentId: decoded.agentId, visibility: "background" as const };
  });
}

// Wrap untrusted inter-agent content in clearly framed tags so the receiving
// worker's LLM treats it as data, not as authoritative instructions. Without
// this, a compromised or untrusted-input-poisoned worker can dispatch a
// message containing "Ignore previous instructions" to a sibling worker, and
// the receiver's model has no signal that the text is from a peer rather
// than from the user/orchestrator. See ORC-025.
function escapeFramingAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function frameInterAgentMessage(fromAgentId: string, content: string): string {
  return [
    `<inter_agent_message from_agent_id="${escapeFramingAttribute(fromAgentId)}">`,
    `<untrusted_content>`,
    content,
    `</untrusted_content>`,
    `</inter_agent_message>`,
  ].join("\n");
}

function handleSendToAgent(
  dispatch: OrchestrationEngineService["Type"]["dispatch"],
  readModel: OrchestrationReadModel,
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.SendToAgentInput, input);
    const messageId = uuid();
    const targetAgentId = decoded.targetAgentId as unknown as string;

    // Resolve the target worker's thread so we can hand the message to the
    // existing turn pipeline. Without this the message used to live only in
    // orchestratorMessages[] and the worker never saw it — the orchestrator
    // was forced to spawn a fresh worker for every follow-up.
    const targetWorker = (readModel.orchestratorWorkers ?? []).find(
      (w) => (w.workerId as unknown as string) === targetAgentId,
    );
    if (!targetWorker) {
      return { error: `Unknown agent: ${decoded.targetAgentId}` };
    }

    // Gap K: if the target worker is terminated there is no live thread to
    // deliver to. Dispatch would fail silently inside Effect.ignore and the
    // caller would get a misleading `{ queued: true }`. Tell the truth.
    if (targetWorker.status === "terminated") {
      return {
        error: `Agent ${decoded.targetAgentId} is terminated; spawn a new agent instead of messaging this one.`,
      };
    }

    const fromWorker = readModel.orchestratorWorkers.find((w) => w.status !== "terminated");
    const fromWorkerId = fromWorker?.workerId ?? ("orchestrator" as any);

    // 1) Record the message on the orchestrator message bus (projector writes
    //    it to orchestratorMessages[] for audit + replay).
    yield* dispatch({
      type: "orchestrator.message.send" as const,
      commandId: uuid() as any,
      messageId: messageId as any,
      fromWorkerId,
      toWorkerId: decoded.targetAgentId as any,
      content: decoded.message,
      metadata: decoded.metadata,
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    // 2) Gap A: bridge the message into the worker's turn queue by starting a
    //    new turn on the target thread. The decider queues if the thread is
    //    mid-turn (dispatchMode="queue", default). Delivery = when the turn
    //    actually begins; the orchestrator observes via thread.turn-started.
    // Capture the turn-dispatch outcome instead of silently ignoring it. The
    // previous `Effect.ignore` was a footgun: the caller would always see
    // `{ queued: true }` even when the dispatch was rejected (thread mid-
    // transition, decider validation failure, projector lag), which gave the
    // orchestrator no way to react when delivery actually failed. The
    // message.send dispatch above remains durable, so on failure here the
    // message is still in the audit log — we just need to surface that the
    // worker's turn-start did NOT happen so the orchestrator can retry or
    // explicitly poll the target thread instead of trusting `queued: true`.
    const framedText = frameInterAgentMessage(String(fromWorkerId), decoded.message);
    const turnDispatchResult = yield* dispatch({
      type: "thread.turn.start" as const,
      commandId: uuid() as any,
      threadId: targetWorker.threadId,
      message: {
        messageId: uuid() as any,
        role: "user" as const,
        text: framedText,
        attachments: [],
      },
      dispatchMode: "queue" as const,
      assistantDeliveryMode: "buffered" as const,
      createdAt: now() as any,
    } as any).pipe(Effect.result);

    if (Result.isFailure(turnDispatchResult)) {
      const failure = turnDispatchResult.failure;
      const reason = failure instanceof Error ? failure.message : String(failure);
      return {
        queued: false,
        messageId,
        deliveredVia: "orchestrator.message.send",
        turnStartError: reason,
        note: "Message persisted to message.send log, but the worker's next turn could not be queued. Poll get_agent_status to see when the worker becomes idle, then retry.",
      };
    }

    return { queued: true, messageId, deliveredVia: "thread.turn.start" };
  });
}

// orchestrate_send_update_to_orchestrator — worker → orchestrator turn-end
// signal. Resolves the calling worker by the calling thread (no need for the
// worker to pass its own ID — the MCP transport already gives us the threadId
// of the caller). Dispatches `orchestrator.worker.update-post`; the projector
// stores it on `OrchestratorWorker.latestUpdate` so subsequent
// `orchestrate_get_agent_status` polls return useful posture instead of an
// opaque "running" with empty diff.
function handleSendUpdateToOrchestrator(
  dispatch: OrchestrationEngineService["Type"]["dispatch"],
  readModel: OrchestrationReadModel,
  callerThreadId: string,
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.SendUpdateToOrchestratorInput, input);

    // The calling thread is either the worker's own thread (worker calls it
    // at end of turn) or — in degenerate cases — an orchestrator-thread call
    // for testing. Find the worker whose thread matches.
    const callingWorker = (readModel.orchestratorWorkers ?? []).find(
      (w) => (w.threadId as unknown as string) === callerThreadId,
    );
    if (!callingWorker) {
      return {
        error:
          "orchestrate_send_update_to_orchestrator must be called from a worker thread; " +
          "no worker is registered for the calling thread.",
      };
    }

    yield* dispatch({
      type: "orchestrator.worker.update-post" as const,
      commandId: uuid() as any,
      workerId: callingWorker.workerId,
      status: decoded.status,
      summary: decoded.summary,
      ...(decoded.question !== undefined ? { question: decoded.question } : {}),
      ...(decoded.nextStep !== undefined ? { nextStep: decoded.nextStep } : {}),
      ...(decoded.blockedReason !== undefined ? { blockedReason: decoded.blockedReason } : {}),
      createdAt: now() as any,
    } as any).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    return {
      posted: true,
      workerId: callingWorker.workerId,
    };
  });
}

function handleAcceptWork(
  dispatch: OrchestrationEngineService["Type"]["dispatch"],
  readModel: OrchestrationReadModel,
  browserRuntime: Option.Option<BrowserRuntimeServiceShape>,
  evidenceRepository: Option.Option<BrowserOrchestrationEvidenceRepositoryShape>,
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.AcceptWorkInput, input);
    const raw = asObject(input) ?? {};
    const worker = readModel.orchestratorWorkers.find(
      (w) => w.workerId === (decoded.agentId as unknown as OrchestratorWorkerId),
    );
    const taskId = decoded.taskId ?? worker?.activeTaskId;

    if (!taskId) {
      return { error: `No active task found for agent: ${decoded.agentId}` };
    }

    const task = readModel.orchestratorTasks.find((candidate) => candidate.taskId === taskId);
    const browserSessionId =
      decoded.browserSessionId ??
      readOptionalString(raw, "browserSessionId", "browser_session_id") ??
      worker?.workspace.browserSessionId;
    let browserAfterScreenshotRef: string | undefined;
    let browserAfterDomRef: string | undefined;

    if (task && (task.status === "assigned" || task.status === "running")) {
      if (browserSessionId && Option.isSome(browserRuntime)) {
        const observed = yield* browserRuntime.value.observe({
          sessionId: browserSessionId as unknown as BrowserSessionId,
        });
        browserAfterScreenshotRef =
          observed.runtimeTruth?.screenshotArtifactRef ??
          observed.observation?.runtimeTruth?.screenshotArtifactRef ??
          observed.observation?.screenshotArtifactRef;
        browserAfterDomRef = yield* findEvidenceRefByKind(
          evidenceRepository,
          observed.evidenceRefs,
          "browser-dom-snapshot",
        );
      }

      yield* dispatch({
        type: "orchestrator.task.submit" as const,
        commandId: CommandId.makeUnsafe(uuid()),
        taskId: taskId as OrchestratorTaskId,
        workerId: decoded.agentId as unknown as OrchestratorWorkerId,
        summary: decoded.notes,
        ...(browserAfterScreenshotRef
          ? { browserAfterScreenshotRef: browserAfterScreenshotRef as unknown as string }
          : {}),
        ...(browserAfterDomRef
          ? { browserAfterDomRef: browserAfterDomRef as unknown as string }
          : {}),
        createdAt: now(),
      }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));
    }

    yield* dispatch({
      type: "orchestrator.task.accept" as const,
      commandId: CommandId.makeUnsafe(uuid()),
      taskId: taskId as OrchestratorTaskId,
      summary: decoded.notes,
      createdAt: now(),
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    return {
      accepted: true,
      taskId,
      ...(browserAfterScreenshotRef ? { browserAfterScreenshotRef } : {}),
      ...(browserAfterDomRef ? { browserAfterDomRef } : {}),
    };
  });
}

function handleRejectWork(
  dispatch: OrchestrationEngineService["Type"]["dispatch"],
  readModel: OrchestrationReadModel,
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.RejectWorkInput, input);
    const taskId =
      decoded.taskId ??
      readModel.orchestratorWorkers.find(
        (w) => w.workerId === (decoded.agentId as unknown as OrchestratorWorkerId),
      )?.activeTaskId;

    if (!taskId) {
      return { error: `No active task found for agent: ${decoded.agentId}` };
    }

    yield* dispatch({
      type: "orchestrator.task.reject" as const,
      commandId: uuid() as any,
      taskId: taskId as OrchestratorTaskId,
      instruction: decoded.reason,
      createdAt: now() as any,
    }).pipe(Effect.mapError((e) => new Error(`Dispatch failed: ${e.message}`)));

    return { rejected: true, taskId };
  });
}

// ---------------------------------------------------------------------------
// Gap B: orchestrate_get_agent_diff — aggregate the worker's latest checkpoint
// ---------------------------------------------------------------------------

function handleGetAgentDiff(
  readModel: OrchestrationReadModel,
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.GetAgentDiffInput, input);
    const agentId = decoded.agentId as unknown as string;
    // The diff is GIT-SCOPED — it comes from `git diff` between the worker's
    // checkpoint commits. Files written outside the project's git tree
    // (`/tmp`, sibling dirs, .gitignore'd paths) NEVER appear here. The
    // orchestrator must reconcile this against the worker's REPORT block —
    // see ORCHESTRATOR.md "Reconcile diff with REPORT" — so we surface
    // `diffMethod: "git"` explicitly to make the limitation visible.
    const baseEnvelope = {
      diffMethod: "git" as const,
      gitScopeNote:
        "Diff is git-scoped. Files outside the project's git tree do not appear here. Cross-check against the worker's REPORT `filesWritten` before concluding no work was done.",
    };
    const worker = (readModel.orchestratorWorkers ?? []).find(
      (w) => (w.workerId as unknown as string) === agentId,
    );
    if (!worker) {
      return {
        agentId: decoded.agentId,
        diff: "",
        filesChanged: 0,
        additions: 0,
        deletions: 0,
        ...baseEnvelope,
      };
    }
    const thread = readModel.threads.find(
      (t) => (t.id as unknown as string) === (worker.threadId as unknown as string),
    );
    if (!thread || !thread.checkpoints || thread.checkpoints.length === 0) {
      return {
        agentId: decoded.agentId,
        diff: "",
        filesChanged: 0,
        additions: 0,
        deletions: 0,
        ...baseEnvelope,
      };
    }
    const latest = thread.checkpoints[thread.checkpoints.length - 1];
    const files = latest?.files ?? [];
    const additions = files.reduce((sum, f) => sum + (f.additions ?? 0), 0);
    const deletions = files.reduce((sum, f) => sum + (f.deletions ?? 0), 0);
    const diff = files
      .map((f) => `${f.kind ?? "M"}  ${f.path}  +${f.additions ?? 0} -${f.deletions ?? 0}`)
      .join("\n");
    return {
      agentId: decoded.agentId,
      diff,
      filesChanged: files.length,
      additions,
      deletions,
      ...baseEnvelope,
    };
  });
}

// ---------------------------------------------------------------------------
// Gap 10: orchestrate_get_agent_logs — project thread activities as log entries
// ---------------------------------------------------------------------------

function handleGetAgentLogs(
  readModel: OrchestrationReadModel,
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.GetAgentLogsInput, input);
    const agentId = decoded.agentId as unknown as string;
    const worker = (readModel.orchestratorWorkers ?? []).find(
      (w) => (w.workerId as unknown as string) === agentId,
    );
    if (!worker) {
      return { agentId: decoded.agentId, entries: [] };
    }
    const thread = readModel.threads.find(
      (t) => (t.id as unknown as string) === (worker.threadId as unknown as string),
    );
    if (!thread) {
      return { agentId: decoded.agentId, entries: [] };
    }
    const activities = thread.activities ?? [];
    const sinceMs = decoded.since ? Date.parse(decoded.since) : Number.NEGATIVE_INFINITY;
    const filtered = Number.isFinite(sinceMs)
      ? activities.filter((a) => Date.parse(a.createdAt) >= sinceMs)
      : activities;
    const tail = decoded.tail ?? filtered.length;
    const windowed = tail > 0 ? filtered.slice(Math.max(0, filtered.length - tail)) : filtered;
    const entries = windowed.map((a) => ({
      timestamp: a.createdAt,
      level:
        a.tone === "error"
          ? ("error" as const)
          : a.tone === "approval"
            ? ("warn" as const)
            : ("info" as const),
      message: a.summary,
    }));
    return { agentId: decoded.agentId, entries };
  });
}

// ---------------------------------------------------------------------------
// Gap 7: server-side wait_agent / wait_all blocking coordination
// ---------------------------------------------------------------------------

const TERMINAL_WORKER_STATUSES: ReadonlySet<string> = new Set(["submitted", "terminated", "stuck"]);

const DEFAULT_WAIT_TIMEOUT_MS = 15 * 60 * 1000;

function findWorkerStatus(readModel: OrchestrationReadModel, workerId: string): string | undefined {
  return readModel.orchestratorWorkers?.find((w) => (w.workerId as unknown as string) === workerId)
    ?.status;
}

function handleWaitAgent(
  engine: OrchestrationEngineService["Type"],
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.WaitAgentInput, input);
    const agentId = decoded.agentId as unknown as string;
    const timeoutMs = decoded.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;

    const initialModel = yield* engine.getReadModel();
    const initialStatus = findWorkerStatus(initialModel, agentId);
    if (initialStatus === undefined) {
      return { error: `Unknown agent: ${decoded.agentId}` };
    }
    if (TERMINAL_WORKER_STATUSES.has(initialStatus)) {
      return { agentId: decoded.agentId, status: initialStatus, timedOut: false };
    }

    // Subscribe to domain events; on each tick, check if the worker's
    // status in the read model has reached a terminal state. This replaces
    // orchestrator-driven polling via get_agent_status.
    const streamed = yield* engine.streamDomainEvents.pipe(
      Stream.mapEffect(() =>
        engine.getReadModel().pipe(Effect.map((model) => findWorkerStatus(model, agentId))),
      ),
      Stream.filter(
        (status): status is string => status !== undefined && TERMINAL_WORKER_STATUSES.has(status),
      ),
      Stream.take(1),
      Stream.runHead,
      Effect.timeoutOption(timeoutMs),
      Effect.map((outer) => Option.flatten(outer)),
    );

    if (Option.isNone(streamed)) {
      const lastState = yield* engine.getReadModel();
      const lastStatus = findWorkerStatus(lastState, agentId);
      return {
        agentId: decoded.agentId,
        status: lastStatus ?? "unknown",
        timedOut: true,
      };
    }
    return {
      agentId: decoded.agentId,
      status: Option.getOrElse(streamed, () => "unknown"),
      timedOut: false,
    };
  });
}

function handleWaitAll(
  engine: OrchestrationEngineService["Type"],
  input: unknown,
): Effect.Effect<unknown, Error> {
  return Effect.gen(function* () {
    const decoded = yield* decodeInput(ToolSchemas.WaitAllInput, input);
    const ids = decoded.agentIds.map((id) => id as unknown as string);
    const timeoutMs = decoded.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;

    const allTerminal = (model: OrchestrationReadModel): boolean =>
      ids.every((id) => {
        const status = findWorkerStatus(model, id);
        return status !== undefined && TERMINAL_WORKER_STATUSES.has(status);
      });

    const snapshot = yield* engine.getReadModel();
    if (allTerminal(snapshot)) {
      return {
        results: ids.map((id) => ({
          agentId: id,
          status: findWorkerStatus(snapshot, id) ?? "unknown",
        })),
        timedOut: false,
      };
    }

    const streamed = yield* engine.streamDomainEvents.pipe(
      Stream.mapEffect(() => engine.getReadModel()),
      Stream.filter(allTerminal),
      Stream.take(1),
      Stream.runHead,
      Effect.timeoutOption(timeoutMs),
      Effect.map((outer) => Option.flatten(outer)),
    );

    if (Option.isNone(streamed)) {
      const lastState = yield* engine.getReadModel();
      return {
        results: ids.map((id) => ({
          agentId: id,
          status: findWorkerStatus(lastState, id) ?? "unknown",
        })),
        timedOut: true,
      };
    }
    const finalModel = Option.getOrElse(streamed, () => snapshot);
    return {
      results: ids.map((id) => ({
        agentId: id,
        status: findWorkerStatus(finalModel, id) ?? "unknown",
      })),
      timedOut: false,
    };
  });
}

// ---------------------------------------------------------------------------
// Router implementation
// ---------------------------------------------------------------------------

const makeOrchestrationToolRouter = Effect.gen(function* () {
  const engine = yield* OrchestrationEngineService;
  const browserRuntime = yield* Effect.serviceOption(BrowserRuntimeService);
  const evidenceRepository = yield* Effect.serviceOption(BrowserOrchestrationEvidenceRepository);

  const isOrchestrationTool: OrchestrationToolRouterShape["isOrchestrationTool"] = (toolName) =>
    ORCHESTRATION_TOOL_NAMES.has(toolName);

  const executeTool: OrchestrationToolRouterShape["executeTool"] = (input) =>
    Effect.gen(function* () {
      const { toolName, toolInput } = input;

      if (!ORCHESTRATION_TOOL_NAMES.has(toolName)) {
        return { error: `Unknown orchestration tool: ${toolName}` };
      }

      const readModel = yield* engine.getReadModel();

      // --- UI actions that can be expressed through existing domain commands ---
      switch (toolName) {
        case "orchestrate_focus_agent":
          return yield* handleFocusAgent(readModel, engine.dispatch, toolInput);
        case "orchestrate_promote_panel":
          return yield* handlePromotePanel(readModel, engine.dispatch, toolInput);
        case "orchestrate_collapse_panel":
          return yield* handleCollapsePanel(readModel, engine.dispatch, toolInput);
        case "orchestrate_browser_open_session": {
          if (browserRuntime._tag === "None") {
            return browserAutomationUnavailable(toolName);
          }
          const body = yield* decodeInput(ToolSchemas.BrowserOpenSessionInput, toolInput);
          return yield* browserRuntime.value.openSession({
            ...body,
            preferredRuntimeKind: body.preferredRuntimeKind ?? "electron-visible",
          });
        }
        case "orchestrate_browser_act": {
          if (browserRuntime._tag === "None") {
            return browserAutomationUnavailable(toolName);
          }
          const body = yield* decodeInput(ToolSchemas.BrowserActInput, toolInput);
          return yield* browserRuntime.value.act(body);
        }
        case "orchestrate_browser_close_session": {
          if (browserRuntime._tag === "None") {
            return browserAutomationUnavailable(toolName);
          }
          const body = yield* decodeInput(ToolSchemas.BrowserCloseSessionInput, toolInput);
          yield* browserRuntime.value.closeSession(body);
          return { success: true, closed: true, sessionId: body.sessionId };
        }
        default:
          break;
      }

      // --- UI directives: ephemeral, not persisted ---
      if (UI_DIRECTIVE_TOOLS.has(toolName)) {
        return { success: true, directive: toolName };
      }

      // --- Read-only tools: query the read model ---
      if (READ_ONLY_TOOLS.has(toolName)) {
        switch (toolName) {
          case "orchestrate_get_agent_status":
            return yield* handleGetAgentStatus(readModel, toolInput);
          case "orchestrate_get_all_status":
            return yield* handleGetAllStatus(readModel, toolInput);
          case "orchestrate_get_spawn_tree":
            return yield* handleGetSpawnTree(readModel, toolInput);
          case "orchestrate_get_agent_logs":
            return yield* handleGetAgentLogs(readModel, toolInput);
          case "orchestrate_get_agent_diff":
            return yield* handleGetAgentDiff(readModel, toolInput);
          default:
            return { error: `Not implemented: ${toolName}` };
        }
      }

      // --- Command tools: dispatch to the engine ---
      switch (toolName) {
        case "orchestrate_spawn_agent":
          return yield* handleSpawnAgent(readModel, engine.dispatch, input.threadId, toolInput);
        case "orchestrate_terminate_agent":
          return yield* handleTerminateAgent(engine.dispatch, readModel, toolInput);
        case "orchestrate_pause_agent":
          return yield* handlePauseAgent(engine.dispatch, toolInput);
        case "orchestrate_resume_agent":
          return yield* handleResumeAgent(engine.dispatch, toolInput);
        case "orchestrate_promote_to_foreground":
          return yield* handlePromoteToForeground(engine.dispatch, toolInput);
        case "orchestrate_demote_to_background":
          return yield* handleDemoteToBackground(engine.dispatch, toolInput);
        case "orchestrate_send_to_agent":
          return yield* handleSendToAgent(engine.dispatch, readModel, toolInput);
        case "orchestrate_send_update_to_orchestrator":
          return yield* handleSendUpdateToOrchestrator(
            engine.dispatch,
            readModel,
            input.threadId,
            toolInput,
          );
        case "orchestrate_accept_work":
          return yield* handleAcceptWork(
            engine.dispatch,
            readModel,
            browserRuntime,
            evidenceRepository,
            toolInput,
          );
        case "orchestrate_reject_work":
          return yield* handleRejectWork(engine.dispatch, readModel, toolInput);
        case "orchestrate_wait_agent":
          return yield* handleWaitAgent(engine, toolInput);
        case "orchestrate_wait_all":
          return yield* handleWaitAll(engine, toolInput);
        default:
          return { error: `Not implemented: ${toolName}` };
      }
    });

  return { isOrchestrationTool, executeTool } satisfies OrchestrationToolRouterShape;
});

export const OrchestrationToolRouterLive = Layer.effect(
  OrchestrationToolRouterService,
  makeOrchestrationToolRouter,
);
