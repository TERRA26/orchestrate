import type {
  OrchestrationEvent,
  OrchestrationReadModel,
  OrchestratorDependency,
  OrchestratorInterWorkerMessage,
  OrchestratorRun,
  OrchestratorTask,
  OrchestratorTaskId,
  OrchestratorWorker,
  OrchestratorWorkerId,
  ThreadId,
} from "@orchestrate/contracts";
import {
  OrchestrationCheckpointSummary,
  OrchestrationMessage,
  OrchestrationSession,
  OrchestrationThread,
  OrchestratorChecklistUpdatedPayload,
  OrchestratorContextTransferredPayload,
  OrchestratorDecisionRecordedPayload,
  OrchestratorDependencySetPayload,
  OrchestratorEvidenceCapturedPayload,
  OrchestratorMessageBroadcastSentPayload,
  OrchestratorMessageSentPayload,
  OrchestratorRunCancelledPayload,
  OrchestratorRunCompletedPayload,
  OrchestratorRunCreatedPayload,
  OrchestratorRunFailedPayload,
  OrchestratorTaskAcceptedPayload,
  OrchestratorTaskAssignedPayload,
  OrchestratorTaskBlockedPayload,
  OrchestratorTaskCancelledPayload,
  OrchestratorTaskCreatedPayload,
  OrchestratorTaskFailedPayload,
  OrchestratorTaskRejectedPayload,
  OrchestratorTaskSubmittedPayload,
  OrchestratorWorkerDemotedPayload,
  OrchestratorWorkerPausedPayload,
  OrchestratorWorkerPromotedPayload,
  OrchestratorWorkerResumedPayload,
  OrchestratorWorkerSpawnedPayload,
  OrchestratorWorkerTerminatedPayload,
  OrchestratorWorkMergeRequestedPayload,
} from "@orchestrate/contracts";
import { Effect, Schema } from "effect";

import { toProjectorDecodeError, type OrchestrationProjectorDecodeError } from "./Errors.ts";
import {
  MessageSentPayloadSchema,
  ProjectCreatedPayload,
  ProjectDeletedPayload,
  ProjectMetaUpdatedPayload,
  ThreadActivityAppendedPayload,
  ThreadArchivedPayload,
  ThreadCreatedPayload,
  ThreadDeletedPayload,
  ThreadInteractionModeSetPayload,
  ThreadMetaUpdatedPayload,
  ThreadProposedPlanUpsertedPayload,
  ThreadRuntimeModeSetPayload,
  ThreadRevertedPayload,
  ThreadSessionSetPayload,
  ThreadTurnDiffCompletedPayload,
  ThreadUnarchivedPayload,
} from "./Schemas.ts";

type ThreadPatch = Partial<Omit<OrchestrationThread, "id" | "projectId">>;
type RunPatch = Partial<Omit<OrchestratorRun, "runId">>;
type TaskPatch = Partial<Omit<OrchestratorTask, "taskId" | "runId">>;
type WorkerPatch = Partial<Omit<OrchestratorWorker, "workerId" | "runId">>;
const MAX_THREAD_MESSAGES = 2_000;
const MAX_THREAD_CHECKPOINTS = 500;

function checkpointStatusToLatestTurnState(status: "ready" | "missing" | "error") {
  if (status === "error") return "error" as const;
  if (status === "missing") return "interrupted" as const;
  return "completed" as const;
}

function updateThread(
  threads: ReadonlyArray<OrchestrationThread>,
  threadId: ThreadId,
  patch: ThreadPatch,
): OrchestrationThread[] {
  return threads.map((thread) => (thread.id === threadId ? { ...thread, ...patch } : thread));
}

function updateRun(
  runs: ReadonlyArray<OrchestratorRun>,
  runId: OrchestratorRun["runId"],
  patch: RunPatch,
): OrchestratorRun[] {
  return runs.map((run) => (run.runId === runId ? { ...run, ...patch } : run));
}

function updateTask(
  tasks: ReadonlyArray<OrchestratorTask>,
  taskId: OrchestratorTaskId,
  patch: TaskPatch,
): OrchestratorTask[] {
  return tasks.map((task) => (task.taskId === taskId ? { ...task, ...patch } : task));
}

function updateWorker(
  workers: ReadonlyArray<OrchestratorWorker>,
  workerId: OrchestratorWorkerId,
  patch: WorkerPatch,
): OrchestratorWorker[] {
  return workers.map((worker) => (worker.workerId === workerId ? { ...worker, ...patch } : worker));
}

function decodeForEvent<A>(
  schema: Schema.Schema<A>,
  value: unknown,
  eventType: OrchestrationEvent["type"],
  field: string,
): Effect.Effect<A, OrchestrationProjectorDecodeError> {
  return Effect.try({
    try: () => Schema.decodeUnknownSync(schema as any)(value),
    catch: (error) => toProjectorDecodeError(`${eventType}:${field}`)(error as Schema.SchemaError),
  });
}

function retainThreadMessagesAfterRevert(
  messages: ReadonlyArray<OrchestrationMessage>,
  retainedTurnIds: ReadonlySet<string>,
  turnCount: number,
): ReadonlyArray<OrchestrationMessage> {
  const retainedMessageIds = new Set<string>();
  for (const message of messages) {
    if (message.role === "system") {
      retainedMessageIds.add(message.id);
      continue;
    }
    if (message.turnId !== null && retainedTurnIds.has(message.turnId)) {
      retainedMessageIds.add(message.id);
    }
  }

  const retainedUserCount = messages.filter(
    (message) => message.role === "user" && retainedMessageIds.has(message.id),
  ).length;
  const missingUserCount = Math.max(0, turnCount - retainedUserCount);
  if (missingUserCount > 0) {
    const fallbackUserMessages = messages
      .filter(
        (message) =>
          message.role === "user" &&
          !retainedMessageIds.has(message.id) &&
          (message.turnId === null || retainedTurnIds.has(message.turnId)),
      )
      .toSorted(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
      )
      .slice(0, missingUserCount);
    for (const message of fallbackUserMessages) {
      retainedMessageIds.add(message.id);
    }
  }

  const retainedAssistantCount = messages.filter(
    (message) => message.role === "assistant" && retainedMessageIds.has(message.id),
  ).length;
  const missingAssistantCount = Math.max(0, turnCount - retainedAssistantCount);
  if (missingAssistantCount > 0) {
    const fallbackAssistantMessages = messages
      .filter(
        (message) =>
          message.role === "assistant" &&
          !retainedMessageIds.has(message.id) &&
          (message.turnId === null || retainedTurnIds.has(message.turnId)),
      )
      .toSorted(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
      )
      .slice(0, missingAssistantCount);
    for (const message of fallbackAssistantMessages) {
      retainedMessageIds.add(message.id);
    }
  }

  return messages.filter((message) => retainedMessageIds.has(message.id));
}

function retainThreadActivitiesAfterRevert(
  activities: ReadonlyArray<OrchestrationThread["activities"][number]>,
  retainedTurnIds: ReadonlySet<string>,
): ReadonlyArray<OrchestrationThread["activities"][number]> {
  return activities.filter(
    (activity) => activity.turnId === null || retainedTurnIds.has(activity.turnId),
  );
}

function retainThreadProposedPlansAfterRevert(
  proposedPlans: ReadonlyArray<OrchestrationThread["proposedPlans"][number]>,
  retainedTurnIds: ReadonlySet<string>,
): ReadonlyArray<OrchestrationThread["proposedPlans"][number]> {
  return proposedPlans.filter(
    (proposedPlan) => proposedPlan.turnId === null || retainedTurnIds.has(proposedPlan.turnId),
  );
}

function compareThreadActivities(
  left: OrchestrationThread["activities"][number],
  right: OrchestrationThread["activities"][number],
): number {
  if (left.sequence !== undefined && right.sequence !== undefined) {
    if (left.sequence !== right.sequence) {
      return left.sequence - right.sequence;
    }
  } else if (left.sequence !== undefined) {
    return 1;
  } else if (right.sequence !== undefined) {
    return -1;
  }

  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

export function createEmptyReadModel(nowIso: string): OrchestrationReadModel {
  return {
    snapshotSequence: 0,
    projects: [],
    threads: [],
    orchestratorRuns: [],
    orchestratorTasks: [],
    orchestratorWorkers: [],
    orchestratorMessages: [],
    orchestratorDependencies: [],
    updatedAt: nowIso,
  };
}

export function projectEvent(
  model: OrchestrationReadModel,
  event: OrchestrationEvent,
): Effect.Effect<OrchestrationReadModel, OrchestrationProjectorDecodeError> {
  const nextBase: OrchestrationReadModel = {
    ...model,
    snapshotSequence: event.sequence,
    updatedAt: event.occurredAt,
  };

  switch (event.type) {
    case "project.created":
      return decodeForEvent(ProjectCreatedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => {
          const existing = nextBase.projects.find((entry) => entry.id === payload.projectId);
          const nextProject = {
            id: payload.projectId,
            title: payload.title,
            workspaceRoot: payload.workspaceRoot,
            defaultModelSelection: payload.defaultModelSelection,
            scripts: payload.scripts,
            createdAt: payload.createdAt,
            updatedAt: payload.updatedAt,
            deletedAt: null,
          };

          return {
            ...nextBase,
            projects: existing
              ? nextBase.projects.map((entry) =>
                  entry.id === payload.projectId ? nextProject : entry,
                )
              : [...nextBase.projects, nextProject],
          };
        }),
      );

    case "project.meta-updated":
      return decodeForEvent(ProjectMetaUpdatedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          projects: nextBase.projects.map((project) =>
            project.id === payload.projectId
              ? {
                  ...project,
                  ...(payload.title !== undefined ? { title: payload.title } : {}),
                  ...(payload.workspaceRoot !== undefined
                    ? { workspaceRoot: payload.workspaceRoot }
                    : {}),
                  ...(payload.defaultModelSelection !== undefined
                    ? { defaultModelSelection: payload.defaultModelSelection }
                    : {}),
                  ...(payload.scripts !== undefined ? { scripts: payload.scripts } : {}),
                  updatedAt: payload.updatedAt,
                }
              : project,
          ),
        })),
      );

    case "project.deleted":
      return decodeForEvent(ProjectDeletedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          projects: nextBase.projects.map((project) =>
            project.id === payload.projectId
              ? {
                  ...project,
                  deletedAt: payload.deletedAt,
                  updatedAt: payload.deletedAt,
                }
              : project,
          ),
        })),
      );

    case "thread.created":
      return Effect.gen(function* () {
        const payload = yield* decodeForEvent(
          ThreadCreatedPayload,
          event.payload,
          event.type,
          "payload",
        );
        const thread: OrchestrationThread = yield* decodeForEvent(
          OrchestrationThread,
          {
            id: payload.threadId,
            projectId: payload.projectId,
            title: payload.title,
            threadType: payload.threadType ?? "orchestrator",
            parentThreadId: payload.parentThreadId ?? null,
            modelSelection: payload.modelSelection,
            runtimeMode: payload.runtimeMode,
            interactionMode: payload.interactionMode,
            envMode: payload.envMode,
            branch: payload.branch,
            worktreePath: payload.worktreePath,
            associatedWorktreePath: payload.associatedWorktreePath,
            associatedWorktreeBranch: payload.associatedWorktreeBranch,
            associatedWorktreeRef: payload.associatedWorktreeRef,
            forkSourceThreadId: payload.forkSourceThreadId,
            latestTurn: null,
            createdAt: payload.createdAt,
            updatedAt: payload.updatedAt,
            deletedAt: null,
            handoff: payload.handoff,
            messages: [],
            activities: [],
            checkpoints: [],
            session: null,
          },
          event.type,
          "thread",
        );
        const existing = nextBase.threads.find((entry) => entry.id === thread.id);
        return {
          ...nextBase,
          threads: existing
            ? nextBase.threads.map((entry) => (entry.id === thread.id ? thread : entry))
            : [...nextBase.threads, thread],
        };
      });

    case "thread.deleted":
      return decodeForEvent(ThreadDeletedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            deletedAt: payload.deletedAt,
            updatedAt: payload.deletedAt,
          }),
        })),
      );

    case "thread.archived":
      return decodeForEvent(ThreadArchivedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            archivedAt: payload.archivedAt,
            updatedAt: payload.archivedAt,
          }),
        })),
      );

    case "thread.unarchived":
      return decodeForEvent(ThreadUnarchivedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            archivedAt: null,
            updatedAt: event.occurredAt,
          }),
        })),
      );

    case "thread.meta-updated":
      return decodeForEvent(ThreadMetaUpdatedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            ...(payload.title !== undefined ? { title: payload.title } : {}),
            ...(payload.modelSelection !== undefined
              ? { modelSelection: payload.modelSelection }
              : {}),
            ...(payload.envMode !== undefined ? { envMode: payload.envMode } : {}),
            ...(payload.branch !== undefined ? { branch: payload.branch } : {}),
            ...(payload.worktreePath !== undefined ? { worktreePath: payload.worktreePath } : {}),
            ...(payload.associatedWorktreePath !== undefined
              ? { associatedWorktreePath: payload.associatedWorktreePath }
              : {}),
            ...(payload.associatedWorktreeBranch !== undefined
              ? { associatedWorktreeBranch: payload.associatedWorktreeBranch }
              : {}),
            ...(payload.associatedWorktreeRef !== undefined
              ? { associatedWorktreeRef: payload.associatedWorktreeRef }
              : {}),
            ...(payload.handoff !== undefined ? { handoff: payload.handoff } : {}),
            updatedAt: payload.updatedAt,
          }),
        })),
      );

    case "thread.runtime-mode-set":
      return decodeForEvent(ThreadRuntimeModeSetPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => ({
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            runtimeMode: payload.runtimeMode,
            updatedAt: payload.updatedAt,
          }),
        })),
      );

    case "thread.interaction-mode-set":
      return decodeForEvent(
        ThreadInteractionModeSetPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            interactionMode: payload.interactionMode,
            updatedAt: payload.updatedAt,
          }),
        })),
      );

    case "thread.message-sent":
      return Effect.gen(function* () {
        const payload = yield* decodeForEvent(
          MessageSentPayloadSchema,
          event.payload,
          event.type,
          "payload",
        );
        const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
        if (!thread) {
          return nextBase;
        }

        const message: OrchestrationMessage = yield* decodeForEvent(
          OrchestrationMessage,
          {
            id: payload.messageId,
            role: payload.role,
            text: payload.text,
            ...(payload.attachments !== undefined ? { attachments: payload.attachments } : {}),
            ...(payload.skills !== undefined ? { skills: payload.skills } : {}),
            ...(payload.mentions !== undefined ? { mentions: payload.mentions } : {}),
            turnId: payload.turnId,
            streaming: payload.streaming,
            source: payload.source,
            createdAt: payload.createdAt,
            updatedAt: payload.updatedAt,
          },
          event.type,
          "message",
        );

        const existingMessage = thread.messages.find((entry) => entry.id === message.id);
        const messages = existingMessage
          ? thread.messages.map((entry) =>
              entry.id === message.id
                ? {
                    ...entry,
                    text: message.streaming
                      ? `${entry.text}${message.text}`
                      : message.text.length > 0
                        ? message.text
                        : entry.text,
                    streaming: message.streaming,
                    source: message.source,
                    updatedAt: message.updatedAt,
                    turnId: message.turnId,
                    ...(message.attachments !== undefined
                      ? { attachments: message.attachments }
                      : {}),
                    ...(message.skills !== undefined ? { skills: message.skills } : {}),
                    ...(message.mentions !== undefined ? { mentions: message.mentions } : {}),
                  }
                : entry,
            )
          : [...thread.messages, message];
        const cappedMessages = messages.slice(-MAX_THREAD_MESSAGES);

        return {
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            messages: cappedMessages,
            updatedAt: event.occurredAt,
          }),
        };
      });

    case "thread.session-set":
      return Effect.gen(function* () {
        const payload = yield* decodeForEvent(
          ThreadSessionSetPayload,
          event.payload,
          event.type,
          "payload",
        );
        const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
        if (!thread) {
          return nextBase;
        }

        const session: OrchestrationSession = yield* decodeForEvent(
          OrchestrationSession,
          payload.session,
          event.type,
          "session",
        );

        return {
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            session,
            latestTurn:
              session.status === "running" && session.activeTurnId !== null
                ? {
                    turnId: session.activeTurnId,
                    state: "running",
                    requestedAt:
                      thread.latestTurn?.turnId === session.activeTurnId
                        ? thread.latestTurn.requestedAt
                        : session.updatedAt,
                    startedAt:
                      thread.latestTurn?.turnId === session.activeTurnId
                        ? (thread.latestTurn.startedAt ?? session.updatedAt)
                        : session.updatedAt,
                    completedAt: null,
                    assistantMessageId:
                      thread.latestTurn?.turnId === session.activeTurnId
                        ? thread.latestTurn.assistantMessageId
                        : null,
                  }
                : thread.latestTurn,
            updatedAt: event.occurredAt,
          }),
        };
      });

    case "thread.proposed-plan-upserted":
      return Effect.gen(function* () {
        const payload = yield* decodeForEvent(
          ThreadProposedPlanUpsertedPayload,
          event.payload,
          event.type,
          "payload",
        );
        const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
        if (!thread) {
          return nextBase;
        }

        const proposedPlans = [
          ...thread.proposedPlans.filter((entry) => entry.id !== payload.proposedPlan.id),
          payload.proposedPlan,
        ]
          .toSorted(
            (left, right) =>
              left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
          )
          .slice(-200);

        return {
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            proposedPlans,
            updatedAt: event.occurredAt,
          }),
        };
      });

    case "thread.turn-diff-completed":
      return Effect.gen(function* () {
        const payload = yield* decodeForEvent(
          ThreadTurnDiffCompletedPayload,
          event.payload,
          event.type,
          "payload",
        );
        const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
        if (!thread) {
          return nextBase;
        }

        const checkpoint = yield* decodeForEvent(
          OrchestrationCheckpointSummary,
          {
            turnId: payload.turnId,
            checkpointTurnCount: payload.checkpointTurnCount,
            checkpointRef: payload.checkpointRef,
            status: payload.status,
            files: payload.files,
            assistantMessageId: payload.assistantMessageId,
            completedAt: payload.completedAt,
          },
          event.type,
          "checkpoint",
        );

        // Do not let a placeholder (status "missing") overwrite a checkpoint
        // that has already been captured with a real git ref (status "ready").
        // ProviderRuntimeIngestion may fire multiple turn.diff.updated events
        // per turn; without this guard later placeholders would clobber the
        // real capture dispatched by CheckpointReactor.
        const existing = thread.checkpoints.find((entry) => entry.turnId === checkpoint.turnId);
        if (existing && existing.status !== "missing" && checkpoint.status === "missing") {
          return nextBase;
        }

        const checkpoints = [
          ...thread.checkpoints.filter((entry) => entry.turnId !== checkpoint.turnId),
          checkpoint,
        ]
          .toSorted((left, right) => left.checkpointTurnCount - right.checkpointTurnCount)
          .slice(-MAX_THREAD_CHECKPOINTS);

        return {
          ...nextBase,
          threads: updateThread(nextBase.threads, payload.threadId, {
            checkpoints,
            latestTurn: {
              turnId: payload.turnId,
              state: checkpointStatusToLatestTurnState(payload.status),
              requestedAt:
                thread.latestTurn?.turnId === payload.turnId
                  ? thread.latestTurn.requestedAt
                  : payload.completedAt,
              startedAt:
                thread.latestTurn?.turnId === payload.turnId
                  ? (thread.latestTurn.startedAt ?? payload.completedAt)
                  : payload.completedAt,
              completedAt: payload.completedAt,
              assistantMessageId: payload.assistantMessageId,
            },
            updatedAt: event.occurredAt,
          }),
        };
      });

    case "thread.reverted":
      return decodeForEvent(ThreadRevertedPayload, event.payload, event.type, "payload").pipe(
        Effect.map((payload) => {
          const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
          if (!thread) {
            return nextBase;
          }

          const checkpoints = thread.checkpoints
            .filter((entry) => entry.checkpointTurnCount <= payload.turnCount)
            .toSorted((left, right) => left.checkpointTurnCount - right.checkpointTurnCount)
            .slice(-MAX_THREAD_CHECKPOINTS);
          const retainedTurnIds = new Set(checkpoints.map((checkpoint) => checkpoint.turnId));
          const messages = retainThreadMessagesAfterRevert(
            thread.messages,
            retainedTurnIds,
            payload.turnCount,
          ).slice(-MAX_THREAD_MESSAGES);
          const proposedPlans = retainThreadProposedPlansAfterRevert(
            thread.proposedPlans,
            retainedTurnIds,
          ).slice(-200);
          const activities = retainThreadActivitiesAfterRevert(thread.activities, retainedTurnIds);

          const latestCheckpoint = checkpoints.at(-1) ?? null;
          const latestTurn =
            latestCheckpoint === null
              ? null
              : {
                  turnId: latestCheckpoint.turnId,
                  state: checkpointStatusToLatestTurnState(latestCheckpoint.status),
                  requestedAt: latestCheckpoint.completedAt,
                  startedAt: latestCheckpoint.completedAt,
                  completedAt: latestCheckpoint.completedAt,
                  assistantMessageId: latestCheckpoint.assistantMessageId,
                };

          return {
            ...nextBase,
            threads: updateThread(nextBase.threads, payload.threadId, {
              checkpoints,
              messages,
              proposedPlans,
              activities,
              latestTurn,
              updatedAt: event.occurredAt,
            }),
          };
        }),
      );

    case "thread.activity-appended":
      return decodeForEvent(
        ThreadActivityAppendedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => {
          const thread = nextBase.threads.find((entry) => entry.id === payload.threadId);
          if (!thread) {
            return nextBase;
          }

          const activities = [
            ...thread.activities.filter((entry) => entry.id !== payload.activity.id),
            payload.activity,
          ]
            .toSorted(compareThreadActivities)
            .slice(-500);

          return {
            ...nextBase,
            threads: updateThread(nextBase.threads, payload.threadId, {
              activities,
              updatedAt: event.occurredAt,
            }),
          };
        }),
      );

    // --- Orchestrator events ---

    case "orchestrator.run.created":
      return decodeForEvent(
        OrchestratorRunCreatedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          orchestratorRuns: [
            ...(nextBase.orchestratorRuns ?? []),
            {
              runId: payload.runId,
              projectId: payload.projectId,
              userRequest: payload.userRequest,
              status: "active" as const,
              rootTaskId: "" as OrchestratorTaskId,
              goals: payload.goals,
              constraints: payload.constraints,
              spawnBudget: payload.spawnBudget,
              createdAt: payload.createdAt,
              updatedAt: payload.createdAt,
            },
          ],
        })),
      );

    case "orchestrator.run.cancelled":
      return decodeForEvent(
        OrchestratorRunCancelledPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          orchestratorRuns: updateRun(nextBase.orchestratorRuns ?? [], payload.runId, {
            status: "cancelled",
            updatedAt: payload.cancelledAt,
            completedAt: payload.cancelledAt,
          }),
        })),
      );

    case "orchestrator.run.completed":
      return decodeForEvent(
        OrchestratorRunCompletedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          orchestratorRuns: updateRun(nextBase.orchestratorRuns ?? [], payload.runId, {
            status: "completed",
            updatedAt: payload.completedAt,
            completedAt: payload.completedAt,
            completionSummary: payload.summary,
          }),
        })),
      );

    case "orchestrator.run.failed":
      return decodeForEvent(
        OrchestratorRunFailedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          orchestratorRuns: updateRun(nextBase.orchestratorRuns ?? [], payload.runId, {
            status: "failed",
            updatedAt: payload.failedAt,
            completedAt: payload.failedAt,
            completionSummary: payload.reason,
          }),
        })),
      );

    case "orchestrator.task.created":
      return decodeForEvent(
        OrchestratorTaskCreatedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => {
          const newTask: OrchestratorTask = {
            taskId: payload.taskId,
            runId: payload.runId,
            parentTaskId: payload.parentTaskId,
            title: payload.title,
            objective: payload.objective,
            status: "pending",
            ownerKind: "orchestrator",
            stopCondition: payload.stopCondition,
            readScope: payload.readScope,
            writeScope: payload.writeScope,
            allowedTools: payload.allowedTools,
            evidenceRequired: payload.evidenceRequired,
            acceptanceCriteria: payload.acceptanceCriteria,
            checklist: [],
            dependsOn: payload.dependsOn,
            modelPolicy: payload.modelPolicy,
            iteration: 0,
            maxIterations: payload.maxIterations ?? 3,
            createdAt: payload.createdAt,
            updatedAt: payload.createdAt,
          };
          // If this is the first task for the run, set it as rootTaskId.
          const runs = (nextBase.orchestratorRuns ?? []).map((run) =>
            run.runId === payload.runId && run.rootTaskId === ("" as OrchestratorTaskId)
              ? Object.assign({}, run, {
                  rootTaskId: payload.taskId,
                  updatedAt: payload.createdAt,
                })
              : run,
          );
          return {
            ...nextBase,
            orchestratorRuns: runs,
            orchestratorTasks: [...(nextBase.orchestratorTasks ?? []), newTask],
          };
        }),
      );

    case "orchestrator.task.assigned":
      return decodeForEvent(
        OrchestratorTaskAssignedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          orchestratorTasks: updateTask(nextBase.orchestratorTasks ?? [], payload.taskId, {
            status: "assigned",
            ownerKind: payload.assigneeKind,
            ownerId: payload.assigneeId,
            assignedWorkerId: payload.assigneeId as OrchestratorWorkerId | undefined,
            updatedAt: payload.assignedAt,
          }),
        })),
      );

    case "orchestrator.task.submitted":
      return decodeForEvent(
        OrchestratorTaskSubmittedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          orchestratorTasks: updateTask(nextBase.orchestratorTasks ?? [], payload.taskId, {
            status: "submitted",
            updatedAt: payload.submittedAt,
            submittedAt: payload.submittedAt,
            // Gap 5+6: persist worker's self-report so accept can read it.
            ...(payload.hasChanges !== undefined ? { hasChanges: payload.hasChanges } : {}),
            ...(payload.diffStats !== undefined ? { diffStats: payload.diffStats } : {}),
            // Gap C+F: persist the structured submit report.
            ...(payload.summary !== undefined ? { submitSummary: payload.summary } : {}),
            ...(payload.filesWritten !== undefined ? { filesWritten: payload.filesWritten } : {}),
            ...(payload.testsRun !== undefined ? { testsRun: payload.testsRun } : {}),
            ...(payload.notes !== undefined ? { submitNotes: payload.notes } : {}),
          }),
        })),
      );

    case "orchestrator.task.accepted":
      return decodeForEvent(
        OrchestratorTaskAcceptedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          orchestratorTasks: updateTask(nextBase.orchestratorTasks ?? [], payload.taskId, {
            status: "accepted",
            updatedAt: payload.acceptedAt,
            acceptedAt: payload.acceptedAt,
          }),
        })),
      );

    case "orchestrator.task.rejected":
      return decodeForEvent(
        OrchestratorTaskRejectedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => {
          const existingTask = (nextBase.orchestratorTasks ?? []).find(
            (t) => t.taskId === payload.taskId,
          );
          return {
            ...nextBase,
            orchestratorTasks: updateTask(nextBase.orchestratorTasks ?? [], payload.taskId, {
              status: "needs-rework",
              iteration: (existingTask?.iteration ?? 0) + 1,
              updatedAt: payload.rejectedAt,
            }),
          };
        }),
      );

    case "orchestrator.task.blocked":
      return decodeForEvent(
        OrchestratorTaskBlockedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          orchestratorTasks: updateTask(nextBase.orchestratorTasks ?? [], payload.taskId, {
            status: "blocked",
            blockedBy: payload.reason,
            updatedAt: payload.blockedAt,
          }),
        })),
      );

    case "orchestrator.task.cancelled":
      return decodeForEvent(
        OrchestratorTaskCancelledPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          orchestratorTasks: updateTask(nextBase.orchestratorTasks ?? [], payload.taskId, {
            status: "cancelled",
            updatedAt: payload.cancelledAt,
          }),
        })),
      );

    case "orchestrator.task.failed":
      return decodeForEvent(
        OrchestratorTaskFailedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          orchestratorTasks: updateTask(nextBase.orchestratorTasks ?? [], payload.taskId, {
            status: "failed",
            updatedAt: payload.failedAt,
          }),
        })),
      );

    case "orchestrator.worker.spawned":
      return decodeForEvent(
        OrchestratorWorkerSpawnedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => {
          const newWorker: OrchestratorWorker = {
            workerId: payload.workerId,
            runId: payload.runId,
            threadId: payload.threadId,
            status: "running",
            visibility: "foreground",
            activeTaskId: payload.taskId,
            spawnBudget: payload.spawnBudget,
            workspace: payload.workspace,
            modelBinding: payload.modelBinding,
            createdAt: payload.spawnedAt,
            updatedAt: payload.spawnedAt,
          };
          return {
            ...nextBase,
            orchestratorWorkers: [...(nextBase.orchestratorWorkers ?? []), newWorker],
            // Also mark the task as running
            orchestratorTasks: updateTask(nextBase.orchestratorTasks ?? [], payload.taskId, {
              status: "running",
              assignedWorkerId: payload.workerId,
              updatedAt: payload.spawnedAt,
            }),
          };
        }),
      );

    case "orchestrator.worker.terminated":
      return decodeForEvent(
        OrchestratorWorkerTerminatedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          orchestratorWorkers: updateWorker(nextBase.orchestratorWorkers ?? [], payload.workerId, {
            status: "terminated",
            terminatedAt: payload.terminatedAt,
            terminationReason: payload.reason,
            updatedAt: payload.terminatedAt,
          }),
        })),
      );

    case "orchestrator.worker.update-posted":
      return decodeForEvent(
        OrchestratorWorkerUpdatePostedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          orchestratorWorkers: updateWorker(nextBase.orchestratorWorkers ?? [], payload.workerId, {
            // Overwrite — only the latest update is retained on the read
            // model (the activity log holds a history of past updates).
            // `summary` is required, `question`/`nextStep`/`blockedReason`
            // are optional in the schema; spread them conditionally so we
            // don't write `undefined` to the projection.
            latestUpdate: {
              status: payload.status,
              summary: payload.summary,
              ...(payload.question !== undefined ? { question: payload.question } : {}),
              ...(payload.nextStep !== undefined ? { nextStep: payload.nextStep } : {}),
              ...(payload.blockedReason !== undefined
                ? { blockedReason: payload.blockedReason }
                : {}),
              postedAt: payload.postedAt,
            },
            updatedAt: payload.postedAt,
          }),
        })),
      );

    case "orchestrator.evidence.captured":
      // Evidence is persisted directly to DB via the repository,
      // not stored in the in-memory read model.
      return decodeForEvent(
        OrchestratorEvidenceCapturedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(Effect.map(() => nextBase));

    case "orchestrator.decision.recorded":
      // Decisions are persisted directly to DB via the repository,
      // not stored in the in-memory read model.
      return decodeForEvent(
        OrchestratorDecisionRecordedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(Effect.map(() => nextBase));

    case "orchestrator.checklist.updated":
      return decodeForEvent(
        OrchestratorChecklistUpdatedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          orchestratorTasks: updateTask(nextBase.orchestratorTasks ?? [], payload.taskId, {
            checklist: payload.checklist,
            updatedAt: payload.updatedAt,
          }),
        })),
      );

    case "orchestrator.worker.paused":
      return decodeForEvent(
        OrchestratorWorkerPausedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          orchestratorWorkers: updateWorker(nextBase.orchestratorWorkers ?? [], payload.workerId, {
            status: "paused",
            updatedAt: payload.pausedAt,
          }),
        })),
      );

    case "orchestrator.worker.resumed":
      return decodeForEvent(
        OrchestratorWorkerResumedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          orchestratorWorkers: updateWorker(nextBase.orchestratorWorkers ?? [], payload.workerId, {
            status: "running",
            updatedAt: payload.resumedAt,
          }),
        })),
      );

    case "orchestrator.worker.promoted":
      return decodeForEvent(
        OrchestratorWorkerPromotedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          orchestratorWorkers: updateWorker(nextBase.orchestratorWorkers ?? [], payload.workerId, {
            visibility: "foreground",
            updatedAt: payload.promotedAt,
          }),
        })),
      );

    case "orchestrator.worker.demoted":
      return decodeForEvent(
        OrchestratorWorkerDemotedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => ({
          ...nextBase,
          orchestratorWorkers: updateWorker(nextBase.orchestratorWorkers ?? [], payload.workerId, {
            visibility: "background",
            updatedAt: payload.demotedAt,
          }),
        })),
      );

    case "orchestrator.message.sent":
      return decodeForEvent(
        OrchestratorMessageSentPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => {
          const message: OrchestratorInterWorkerMessage = {
            messageId: payload.messageId,
            fromWorkerId: payload.fromWorkerId,
            toWorkerId: payload.toWorkerId,
            broadcast: false,
            content: payload.content,
            metadata: payload.metadata,
            sentAt: payload.sentAt,
          };
          return {
            ...nextBase,
            orchestratorMessages: [...(nextBase.orchestratorMessages ?? []), message],
          };
        }),
      );

    case "orchestrator.message.broadcast-sent":
      // Broadcast events are tracked via individual sends; no-op for read model.
      return decodeForEvent(
        OrchestratorMessageBroadcastSentPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(Effect.map(() => nextBase));

    case "orchestrator.context.transferred":
      // Context transfers are ephemeral; no read-model state change.
      return decodeForEvent(
        OrchestratorContextTransferredPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(Effect.map(() => nextBase));

    case "orchestrator.dependency.set":
      return decodeForEvent(
        OrchestratorDependencySetPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(
        Effect.map((payload) => {
          const dependency: OrchestratorDependency = {
            dependencyId: payload.dependencyId,
            fromWorkerId: payload.fromWorkerId,
            toWorkerId: payload.toWorkerId,
            description: payload.description,
            setAt: payload.setAt,
          };
          // Upsert: replace existing dependency with same id, or append.
          const existing = (nextBase.orchestratorDependencies ?? []).find(
            (d) => d.dependencyId === payload.dependencyId,
          );
          return {
            ...nextBase,
            orchestratorDependencies: existing
              ? (nextBase.orchestratorDependencies ?? []).map((d) =>
                  d.dependencyId === payload.dependencyId ? dependency : d,
                )
              : [...(nextBase.orchestratorDependencies ?? []), dependency],
          };
        }),
      );

    case "orchestrator.work.merge-requested":
      // Merge state tracked separately; no-op for read model.
      return decodeForEvent(
        OrchestratorWorkMergeRequestedPayload,
        event.payload,
        event.type,
        "payload",
      ).pipe(Effect.map(() => nextBase));

    default:
      return Effect.succeed(nextBase);
  }
}
