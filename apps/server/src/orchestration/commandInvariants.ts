import type {
  OrchestrationCommand,
  OrchestrationProject,
  OrchestrationReadModel,
  OrchestrationThread,
  OrchestratorRun,
  OrchestratorRunId,
  OrchestratorTask,
  OrchestratorTaskId,
  OrchestratorWorker,
  OrchestratorWorkerId,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
import { Effect } from "effect";

import { OrchestrationCommandInvariantError } from "./Errors.ts";

function invariantError(commandType: string, detail: string): OrchestrationCommandInvariantError {
  return new OrchestrationCommandInvariantError({
    commandType,
    detail,
  });
}

export function findThreadById(
  readModel: OrchestrationReadModel,
  threadId: ThreadId,
): OrchestrationThread | undefined {
  return readModel.threads.find((thread) => thread.id === threadId);
}

export function findProjectById(
  readModel: OrchestrationReadModel,
  projectId: ProjectId,
): OrchestrationProject | undefined {
  return readModel.projects.find((project) => project.id === projectId);
}

export function listThreadsByProjectId(
  readModel: OrchestrationReadModel,
  projectId: ProjectId,
): ReadonlyArray<OrchestrationThread> {
  return readModel.threads.filter((thread) => thread.projectId === projectId);
}

export function requireProject(input: {
  readonly readModel: OrchestrationReadModel;
  readonly command: OrchestrationCommand;
  readonly projectId: ProjectId;
}): Effect.Effect<OrchestrationProject, OrchestrationCommandInvariantError> {
  const project = findProjectById(input.readModel, input.projectId);
  if (project) {
    return Effect.succeed(project);
  }
  return Effect.fail(
    invariantError(
      input.command.type,
      `Project '${input.projectId}' does not exist for command '${input.command.type}'.`,
    ),
  );
}

export function requireProjectAbsent(input: {
  readonly readModel: OrchestrationReadModel;
  readonly command: OrchestrationCommand;
  readonly projectId: ProjectId;
}): Effect.Effect<void, OrchestrationCommandInvariantError> {
  if (!findProjectById(input.readModel, input.projectId)) {
    return Effect.void;
  }
  return Effect.fail(
    invariantError(
      input.command.type,
      `Project '${input.projectId}' already exists and cannot be created twice.`,
    ),
  );
}

export function requireThread(input: {
  readonly readModel: OrchestrationReadModel;
  readonly command: OrchestrationCommand;
  readonly threadId: ThreadId;
}): Effect.Effect<OrchestrationThread, OrchestrationCommandInvariantError> {
  const thread = findThreadById(input.readModel, input.threadId);
  if (thread) {
    return Effect.succeed(thread);
  }
  return Effect.fail(
    invariantError(
      input.command.type,
      `Thread '${input.threadId}' does not exist for command '${input.command.type}'.`,
    ),
  );
}

export function requireThreadArchived(input: {
  readonly readModel: OrchestrationReadModel;
  readonly command: OrchestrationCommand;
  readonly threadId: ThreadId;
}): Effect.Effect<OrchestrationThread, OrchestrationCommandInvariantError> {
  return requireThread(input).pipe(
    Effect.flatMap((thread) =>
      thread.archivedAt !== null
        ? Effect.succeed(thread)
        : Effect.fail(
            invariantError(
              input.command.type,
              `Thread '${input.threadId}' is not archived for command '${input.command.type}'.`,
            ),
          ),
    ),
  );
}

export function requireThreadNotArchived(input: {
  readonly readModel: OrchestrationReadModel;
  readonly command: OrchestrationCommand;
  readonly threadId: ThreadId;
}): Effect.Effect<OrchestrationThread, OrchestrationCommandInvariantError> {
  return requireThread(input).pipe(
    Effect.flatMap((thread) =>
      thread.archivedAt === null
        ? Effect.succeed(thread)
        : Effect.fail(
            invariantError(
              input.command.type,
              `Thread '${input.threadId}' is already archived and cannot handle command '${input.command.type}'.`,
            ),
          ),
    ),
  );
}

export function requireThreadAbsent(input: {
  readonly readModel: OrchestrationReadModel;
  readonly command: OrchestrationCommand;
  readonly threadId: ThreadId;
}): Effect.Effect<void, OrchestrationCommandInvariantError> {
  if (!findThreadById(input.readModel, input.threadId)) {
    return Effect.void;
  }
  return Effect.fail(
    invariantError(
      input.command.type,
      `Thread '${input.threadId}' already exists and cannot be created twice.`,
    ),
  );
}

export function requireNonNegativeInteger(input: {
  readonly commandType: OrchestrationCommand["type"];
  readonly field: string;
  readonly value: number;
}): Effect.Effect<void, OrchestrationCommandInvariantError> {
  if (Number.isInteger(input.value) && input.value >= 0) {
    return Effect.void;
  }
  return Effect.fail(
    invariantError(
      input.commandType,
      `${input.field} must be an integer greater than or equal to 0.`,
    ),
  );
}

// ---------------------------------------------------------------------------
// Orchestrator invariant helpers
// ---------------------------------------------------------------------------

export function findOrchestratorRunById(
  readModel: OrchestrationReadModel,
  runId: OrchestratorRunId,
): OrchestratorRun | undefined {
  return (readModel.orchestratorRuns ?? []).find((run) => run.runId === runId);
}

export function findOrchestratorTaskById(
  readModel: OrchestrationReadModel,
  taskId: OrchestratorTaskId,
): OrchestratorTask | undefined {
  return (readModel.orchestratorTasks ?? []).find((task) => task.taskId === taskId);
}

export function findOrchestratorWorkerById(
  readModel: OrchestrationReadModel,
  workerId: OrchestratorWorkerId,
): OrchestratorWorker | undefined {
  return (readModel.orchestratorWorkers ?? []).find((worker) => worker.workerId === workerId);
}

export function requireOrchestratorRun(input: {
  readonly readModel: OrchestrationReadModel;
  readonly command: OrchestrationCommand;
  readonly runId: OrchestratorRunId;
}): Effect.Effect<OrchestratorRun, OrchestrationCommandInvariantError> {
  const run = findOrchestratorRunById(input.readModel, input.runId);
  if (run) {
    return Effect.succeed(run);
  }
  return Effect.fail(
    invariantError(
      input.command.type,
      `Orchestrator run '${input.runId}' does not exist for command '${input.command.type}'.`,
    ),
  );
}

export function requireOrchestratorRunAbsent(input: {
  readonly readModel: OrchestrationReadModel;
  readonly command: OrchestrationCommand;
  readonly runId: OrchestratorRunId;
}): Effect.Effect<void, OrchestrationCommandInvariantError> {
  if (!findOrchestratorRunById(input.readModel, input.runId)) {
    return Effect.void;
  }
  return Effect.fail(
    invariantError(
      input.command.type,
      `Orchestrator run '${input.runId}' already exists and cannot be created twice.`,
    ),
  );
}

export function requireOrchestratorRunActive(input: {
  readonly readModel: OrchestrationReadModel;
  readonly command: OrchestrationCommand;
  readonly runId: OrchestratorRunId;
}): Effect.Effect<OrchestratorRun, OrchestrationCommandInvariantError> {
  return requireOrchestratorRun(input).pipe(
    Effect.flatMap((run) =>
      run.status === "active"
        ? Effect.succeed(run)
        : Effect.fail(
            invariantError(
              input.command.type,
              `Orchestrator run '${input.runId}' is not active (status: '${run.status}').`,
            ),
          ),
    ),
  );
}

export function requireOrchestratorTask(input: {
  readonly readModel: OrchestrationReadModel;
  readonly command: OrchestrationCommand;
  readonly taskId: OrchestratorTaskId;
}): Effect.Effect<OrchestratorTask, OrchestrationCommandInvariantError> {
  const task = findOrchestratorTaskById(input.readModel, input.taskId);
  if (task) {
    return Effect.succeed(task);
  }
  return Effect.fail(
    invariantError(
      input.command.type,
      `Orchestrator task '${input.taskId}' does not exist for command '${input.command.type}'.`,
    ),
  );
}

export function requireOrchestratorTaskStatus(input: {
  readonly readModel: OrchestrationReadModel;
  readonly command: OrchestrationCommand;
  readonly taskId: OrchestratorTaskId;
  readonly expectedStatus: OrchestratorTask["status"] | ReadonlyArray<OrchestratorTask["status"]>;
}): Effect.Effect<OrchestratorTask, OrchestrationCommandInvariantError> {
  const expected = Array.isArray(input.expectedStatus)
    ? input.expectedStatus
    : [input.expectedStatus];
  return requireOrchestratorTask(input).pipe(
    Effect.flatMap((task) =>
      expected.includes(task.status)
        ? Effect.succeed(task)
        : Effect.fail(
            invariantError(
              input.command.type,
              `Orchestrator task '${input.taskId}' must be in status [${expected.join(", ")}] but is '${task.status}'.`,
            ),
          ),
    ),
  );
}

export function requireOrchestratorWorker(input: {
  readonly readModel: OrchestrationReadModel;
  readonly command: OrchestrationCommand;
  readonly workerId: OrchestratorWorkerId;
}): Effect.Effect<OrchestratorWorker, OrchestrationCommandInvariantError> {
  const worker = findOrchestratorWorkerById(input.readModel, input.workerId);
  if (worker) {
    return Effect.succeed(worker);
  }
  return Effect.fail(
    invariantError(
      input.command.type,
      `Orchestrator worker '${input.workerId}' does not exist for command '${input.command.type}'.`,
    ),
  );
}

export function requireOrchestratorWorkerStatus(input: {
  readonly readModel: OrchestrationReadModel;
  readonly command: OrchestrationCommand;
  readonly workerId: OrchestratorWorkerId;
  readonly expectedStatus:
    | OrchestratorWorker["status"]
    | ReadonlyArray<OrchestratorWorker["status"]>;
}): Effect.Effect<OrchestratorWorker, OrchestrationCommandInvariantError> {
  const expected = Array.isArray(input.expectedStatus)
    ? input.expectedStatus
    : [input.expectedStatus];
  return requireOrchestratorWorker(input).pipe(
    Effect.flatMap((worker) =>
      expected.includes(worker.status)
        ? Effect.succeed(worker)
        : Effect.fail(
            invariantError(
              input.command.type,
              `Orchestrator worker '${input.workerId}' must be in status [${expected.join(", ")}] but is '${worker.status}'.`,
            ),
          ),
    ),
  );
}
