import type {
  OrchestrationCommand,
  OrchestrationEvent,
  OrchestrationReadModel,
} from "@t3tools/contracts";
import {
  deriveAssociatedWorktreeMetadata,
  deriveAssociatedWorktreeMetadataPatch,
} from "@t3tools/shared/threadWorkspace";
import { Effect } from "effect";

import { OrchestrationCommandInvariantError } from "./Errors.ts";
import { hasNativeHandoffMessages } from "./handoff.ts";
import {
  requireOrchestratorRunAbsent,
  requireOrchestratorRunActive,
  requireOrchestratorTask,
  requireOrchestratorTaskStatus,
  requireOrchestratorWorker,
  requireProject,
  requireProjectAbsent,
  requireThread,
  requireThreadAbsent,
} from "./commandInvariants.ts";

const nowIso = () => new Date().toISOString();
const DEFAULT_ASSISTANT_DELIVERY_MODE = "buffered" as const;

const defaultMetadata: Omit<OrchestrationEvent, "sequence" | "type" | "payload"> = {
  eventId: crypto.randomUUID() as OrchestrationEvent["eventId"],
  aggregateKind: "thread",
  aggregateId: "" as OrchestrationEvent["aggregateId"],
  occurredAt: nowIso(),
  commandId: null,
  causationEventId: null,
  correlationId: null,
  metadata: {},
};

function withEventBase(
  input: Pick<OrchestrationCommand, "commandId"> & {
    readonly aggregateKind: OrchestrationEvent["aggregateKind"];
    readonly aggregateId: OrchestrationEvent["aggregateId"];
    readonly occurredAt: string;
    readonly metadata?: OrchestrationEvent["metadata"];
  },
): Omit<OrchestrationEvent, "sequence" | "type" | "payload"> {
  return {
    ...defaultMetadata,
    eventId: crypto.randomUUID() as OrchestrationEvent["eventId"],
    aggregateKind: input.aggregateKind,
    aggregateId: input.aggregateId,
    occurredAt: input.occurredAt,
    commandId: input.commandId,
    correlationId: input.commandId,
    metadata: input.metadata ?? {},
  };
}

export const decideOrchestrationCommand = Effect.fn("decideOrchestrationCommand")(function* ({
  command,
  readModel,
}: {
  readonly command: OrchestrationCommand;
  readonly readModel: OrchestrationReadModel;
}): Effect.fn.Return<
  Omit<OrchestrationEvent, "sequence"> | ReadonlyArray<Omit<OrchestrationEvent, "sequence">>,
  OrchestrationCommandInvariantError
> {
  switch (command.type) {
    case "project.create": {
      yield* requireProjectAbsent({
        readModel,
        command,
        projectId: command.projectId,
      });

      return {
        ...withEventBase({
          aggregateKind: "project",
          aggregateId: command.projectId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "project.created",
        payload: {
          projectId: command.projectId,
          title: command.title,
          workspaceRoot: command.workspaceRoot,
          defaultModelSelection: command.defaultModelSelection ?? null,
          scripts: [],
          createdAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
    }

    case "project.meta.update": {
      yield* requireProject({
        readModel,
        command,
        projectId: command.projectId,
      });
      const occurredAt = nowIso();
      return {
        ...withEventBase({
          aggregateKind: "project",
          aggregateId: command.projectId,
          occurredAt,
          commandId: command.commandId,
        }),
        type: "project.meta-updated",
        payload: {
          projectId: command.projectId,
          ...(command.title !== undefined ? { title: command.title } : {}),
          ...(command.workspaceRoot !== undefined ? { workspaceRoot: command.workspaceRoot } : {}),
          ...(command.defaultModelSelection !== undefined
            ? { defaultModelSelection: command.defaultModelSelection }
            : {}),
          ...(command.scripts !== undefined ? { scripts: command.scripts } : {}),
          updatedAt: occurredAt,
        },
      };
    }

    case "project.delete": {
      yield* requireProject({
        readModel,
        command,
        projectId: command.projectId,
      });
      const occurredAt = nowIso();
      return {
        ...withEventBase({
          aggregateKind: "project",
          aggregateId: command.projectId,
          occurredAt,
          commandId: command.commandId,
        }),
        type: "project.deleted",
        payload: {
          projectId: command.projectId,
          deletedAt: occurredAt,
        },
      };
    }

    case "thread.create": {
      yield* requireProject({
        readModel,
        command,
        projectId: command.projectId,
      });
      yield* requireThreadAbsent({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "thread.created",
        payload: {
          threadId: command.threadId,
          projectId: command.projectId,
          title: command.title,
          modelSelection: command.modelSelection,
          runtimeMode: command.runtimeMode,
          interactionMode: command.interactionMode,
          envMode: command.envMode,
          branch: command.branch,
          worktreePath: command.worktreePath,
          ...deriveAssociatedWorktreeMetadata({
            branch: command.branch,
            worktreePath: command.worktreePath,
            associatedWorktreePath: command.associatedWorktreePath ?? null,
            associatedWorktreeBranch: command.associatedWorktreeBranch ?? null,
            associatedWorktreeRef: command.associatedWorktreeRef ?? null,
          }),
          forkSourceThreadId: null,
          handoff: null,
          createdAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
    }

    case "thread.handoff.create": {
      yield* requireProject({
        readModel,
        command,
        projectId: command.projectId,
      });
      yield* requireThread({
        readModel,
        command,
        threadId: command.sourceThreadId,
      });
      yield* requireThreadAbsent({
        readModel,
        command,
        threadId: command.threadId,
      });

      const sourceThread = yield* requireThread({
        readModel,
        command,
        threadId: command.sourceThreadId,
      });
      if (sourceThread.projectId !== command.projectId) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Source thread '${command.sourceThreadId}' belongs to a different project.`,
        });
      }
      if (sourceThread.handoff !== null && !hasNativeHandoffMessages(sourceThread)) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Source thread '${command.sourceThreadId}' must contain at least one native chat message after handoff before it can be handed off again.`,
        });
      }

      const createdEvent: Omit<OrchestrationEvent, "sequence"> = {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "thread.created",
        payload: {
          threadId: command.threadId,
          projectId: command.projectId,
          title: command.title,
          modelSelection: command.modelSelection,
          runtimeMode: command.runtimeMode,
          interactionMode: command.interactionMode,
          envMode: command.envMode,
          branch: command.branch,
          worktreePath: command.worktreePath,
          ...deriveAssociatedWorktreeMetadata({
            branch: command.branch,
            worktreePath: command.worktreePath,
            associatedWorktreePath: command.associatedWorktreePath ?? null,
            associatedWorktreeBranch: command.associatedWorktreeBranch ?? null,
            associatedWorktreeRef: command.associatedWorktreeRef ?? null,
          }),
          forkSourceThreadId: null,
          handoff: {
            sourceThreadId: command.sourceThreadId,
            sourceProvider: sourceThread.modelSelection.provider,
            importedAt: command.createdAt,
            bootstrapStatus: "pending",
          },
          createdAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };

      const importedMessageEvents: ReadonlyArray<Omit<OrchestrationEvent, "sequence">> =
        command.importedMessages.map((message) => ({
          ...withEventBase({
            aggregateKind: "thread",
            aggregateId: command.threadId,
            occurredAt: command.createdAt,
            commandId: command.commandId,
          }),
          type: "thread.message-sent",
          payload: {
            threadId: command.threadId,
            messageId: message.messageId,
            role: message.role,
            text: message.text,
            ...(message.attachments !== undefined ? { attachments: message.attachments } : {}),
            turnId: null,
            streaming: false,
            source: "handoff-import",
            createdAt: message.createdAt,
            updatedAt: message.updatedAt,
          },
        }));

      return [createdEvent, ...importedMessageEvents];
    }

    case "thread.fork.create": {
      yield* requireProject({
        readModel,
        command,
        projectId: command.projectId,
      });
      yield* requireThread({
        readModel,
        command,
        threadId: command.sourceThreadId,
      });
      yield* requireThreadAbsent({
        readModel,
        command,
        threadId: command.threadId,
      });

      const sourceThread = yield* requireThread({
        readModel,
        command,
        threadId: command.sourceThreadId,
      });
      if (sourceThread.projectId !== command.projectId) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Source thread '${command.sourceThreadId}' belongs to a different project.`,
        });
      }

      const createdEvent: Omit<OrchestrationEvent, "sequence"> = {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "thread.created",
        payload: {
          threadId: command.threadId,
          projectId: command.projectId,
          title: command.title,
          modelSelection: command.modelSelection,
          runtimeMode: command.runtimeMode,
          interactionMode: command.interactionMode,
          envMode: command.envMode,
          branch: command.branch,
          worktreePath: command.worktreePath,
          ...deriveAssociatedWorktreeMetadata({
            branch: command.branch,
            worktreePath: command.worktreePath,
            associatedWorktreePath: command.associatedWorktreePath ?? null,
            associatedWorktreeBranch: command.associatedWorktreeBranch ?? null,
            associatedWorktreeRef: command.associatedWorktreeRef ?? null,
          }),
          forkSourceThreadId: command.sourceThreadId,
          handoff: null,
          createdAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };

      const importedMessageEvents: ReadonlyArray<Omit<OrchestrationEvent, "sequence">> =
        command.importedMessages.map((message) => ({
          ...withEventBase({
            aggregateKind: "thread",
            aggregateId: command.threadId,
            occurredAt: command.createdAt,
            commandId: command.commandId,
          }),
          type: "thread.message-sent",
          payload: {
            threadId: command.threadId,
            messageId: message.messageId,
            role: message.role,
            text: message.text,
            ...(message.attachments !== undefined ? { attachments: message.attachments } : {}),
            turnId: null,
            streaming: false,
            source: "fork-import",
            createdAt: message.createdAt,
            updatedAt: message.updatedAt,
          },
        }));

      return [createdEvent, ...importedMessageEvents];
    }

    case "thread.delete": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      const occurredAt = nowIso();
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt,
          commandId: command.commandId,
        }),
        type: "thread.deleted",
        payload: {
          threadId: command.threadId,
          deletedAt: occurredAt,
        },
      };
    }

    case "thread.archive": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      const occurredAt = nowIso();
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt,
          commandId: command.commandId,
        }),
        type: "thread.archived",
        payload: {
          threadId: command.threadId,
          archivedAt: command.archivedAt,
        },
      };
    }

    case "thread.unarchive": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      const occurredAt = nowIso();
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt,
          commandId: command.commandId,
        }),
        type: "thread.unarchived",
        payload: {
          threadId: command.threadId,
        },
      };
    }

    case "thread.meta.update": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      const occurredAt = nowIso();
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt,
          commandId: command.commandId,
        }),
        type: "thread.meta-updated",
        payload: {
          threadId: command.threadId,
          ...(command.title !== undefined ? { title: command.title } : {}),
          ...(command.modelSelection !== undefined
            ? { modelSelection: command.modelSelection }
            : {}),
          ...(command.envMode !== undefined ? { envMode: command.envMode } : {}),
          ...(command.branch !== undefined ? { branch: command.branch } : {}),
          ...(command.worktreePath !== undefined ? { worktreePath: command.worktreePath } : {}),
          ...deriveAssociatedWorktreeMetadataPatch({
            branch: command.branch ?? null,
            worktreePath: command.worktreePath ?? null,
            associatedWorktreePath: command.associatedWorktreePath ?? null,
            associatedWorktreeBranch: command.associatedWorktreeBranch ?? null,
            associatedWorktreeRef: command.associatedWorktreeRef ?? null,
          }),
          ...(command.handoff !== undefined ? { handoff: command.handoff } : {}),
          updatedAt: occurredAt,
        },
      };
    }

    case "thread.runtime-mode.set": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      const occurredAt = nowIso();
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt,
          commandId: command.commandId,
        }),
        type: "thread.runtime-mode-set",
        payload: {
          threadId: command.threadId,
          runtimeMode: command.runtimeMode,
          updatedAt: occurredAt,
        },
      };
    }

    case "thread.interaction-mode.set": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      const occurredAt = nowIso();
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt,
          commandId: command.commandId,
        }),
        type: "thread.interaction-mode-set",
        payload: {
          threadId: command.threadId,
          interactionMode: command.interactionMode,
          updatedAt: occurredAt,
        },
      };
    }

    case "thread.turn.start": {
      const targetThread = yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      const sourceProposedPlan = command.sourceProposedPlan;
      const sourceThread = sourceProposedPlan
        ? yield* requireThread({
            readModel,
            command,
            threadId: sourceProposedPlan.threadId,
          })
        : null;
      const sourcePlan =
        sourceProposedPlan && sourceThread
          ? sourceThread.proposedPlans.find((entry) => entry.id === sourceProposedPlan.planId)
          : null;
      const dispatchMode = command.dispatchMode ?? "queue";
      if (sourceProposedPlan && !sourcePlan) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Proposed plan '${sourceProposedPlan.planId}' does not exist on thread '${sourceProposedPlan.threadId}'.`,
        });
      }
      if (sourceThread && sourceThread.projectId !== targetThread.projectId) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Proposed plan '${sourceProposedPlan?.planId}' belongs to thread '${sourceThread.id}' in a different project.`,
        });
      }
      const userMessageEvent: Omit<OrchestrationEvent, "sequence"> = {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "thread.message-sent",
        payload: {
          threadId: command.threadId,
          messageId: command.message.messageId,
          role: "user",
          text: command.message.text,
          attachments: command.message.attachments,
          ...(command.message.skills !== undefined ? { skills: command.message.skills } : {}),
          ...(command.message.mentions !== undefined ? { mentions: command.message.mentions } : {}),
          turnId: null,
          streaming: false,
          source: "native",
          createdAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
      const turnRequestPayload = {
        threadId: command.threadId,
        messageId: command.message.messageId,
        ...(command.modelSelection !== undefined ? { modelSelection: command.modelSelection } : {}),
        ...(command.providerOptions !== undefined
          ? { providerOptions: command.providerOptions }
          : {}),
        ...(command.reviewTarget !== undefined ? { reviewTarget: command.reviewTarget } : {}),
        assistantDeliveryMode: command.assistantDeliveryMode ?? DEFAULT_ASSISTANT_DELIVERY_MODE,
        dispatchMode,
        runtimeMode: targetThread.runtimeMode,
        interactionMode: targetThread.interactionMode,
        ...(sourceProposedPlan !== undefined ? { sourceProposedPlan } : {}),
        createdAt: command.createdAt,
      } as const;
      const activeProvider =
        targetThread.session?.providerName ?? targetThread.modelSelection.provider;
      const isThreadRunning =
        targetThread.session?.status === "running" && targetThread.session.activeTurnId !== null;
      const shouldQueue =
        isThreadRunning && (dispatchMode === "queue" || activeProvider !== "codex");
      const queuedEvent: Omit<OrchestrationEvent, "sequence"> = {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        causationEventId: userMessageEvent.eventId,
        type: shouldQueue ? "thread.turn-queued" : "thread.turn-start-requested",
        payload: turnRequestPayload,
      };
      if (shouldQueue && dispatchMode === "steer") {
        return [
          userMessageEvent,
          queuedEvent,
          {
            ...withEventBase({
              aggregateKind: "thread",
              aggregateId: command.threadId,
              occurredAt: command.createdAt,
              commandId: command.commandId,
            }),
            causationEventId: queuedEvent.eventId,
            type: "thread.turn-interrupt-requested",
            payload: {
              threadId: command.threadId,
              turnId: targetThread.session?.activeTurnId ?? undefined,
              createdAt: command.createdAt,
            },
          },
        ];
      }
      return [userMessageEvent, queuedEvent];
    }

    case "thread.turn.dispatch-queued": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "thread.turn-start-requested",
        payload: {
          threadId: command.threadId,
          messageId: command.messageId,
          ...(command.modelSelection !== undefined
            ? { modelSelection: command.modelSelection }
            : {}),
          ...(command.providerOptions !== undefined
            ? { providerOptions: command.providerOptions }
            : {}),
          ...(command.reviewTarget !== undefined ? { reviewTarget: command.reviewTarget } : {}),
          assistantDeliveryMode: command.assistantDeliveryMode ?? DEFAULT_ASSISTANT_DELIVERY_MODE,
          dispatchMode: command.dispatchMode ?? "queue",
          runtimeMode: command.runtimeMode,
          interactionMode: command.interactionMode,
          ...(command.sourceProposedPlan !== undefined
            ? { sourceProposedPlan: command.sourceProposedPlan }
            : {}),
          createdAt: command.createdAt,
        },
      };
    }

    case "thread.turn.interrupt": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "thread.turn-interrupt-requested",
        payload: {
          threadId: command.threadId,
          ...(command.turnId !== undefined ? { turnId: command.turnId } : {}),
          createdAt: command.createdAt,
        },
      };
    }

    case "thread.approval.respond": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
          metadata: {
            requestId: command.requestId,
          },
        }),
        type: "thread.approval-response-requested",
        payload: {
          threadId: command.threadId,
          requestId: command.requestId,
          decision: command.decision,
          createdAt: command.createdAt,
        },
      };
    }

    case "thread.user-input.respond": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
          metadata: {
            requestId: command.requestId,
          },
        }),
        type: "thread.user-input-response-requested",
        payload: {
          threadId: command.threadId,
          requestId: command.requestId,
          answers: command.answers,
          createdAt: command.createdAt,
        },
      };
    }

    case "thread.checkpoint.revert": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "thread.checkpoint-revert-requested",
        payload: {
          threadId: command.threadId,
          turnCount: command.turnCount,
          createdAt: command.createdAt,
        },
      };
    }

    case "thread.session.stop": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "thread.session-stop-requested",
        payload: {
          threadId: command.threadId,
          createdAt: command.createdAt,
        },
      };
    }

    case "thread.session.set": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
          metadata: {},
        }),
        type: "thread.session-set",
        payload: {
          threadId: command.threadId,
          session: command.session,
        },
      };
    }

    case "thread.message.assistant.delta": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "thread.message-sent",
        payload: {
          threadId: command.threadId,
          messageId: command.messageId,
          role: "assistant",
          text: command.delta,
          turnId: command.turnId ?? null,
          streaming: true,
          createdAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
    }

    case "thread.message.assistant.complete": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "thread.message-sent",
        payload: {
          threadId: command.threadId,
          messageId: command.messageId,
          role: "assistant",
          text: "",
          turnId: command.turnId ?? null,
          streaming: false,
          createdAt: command.createdAt,
          updatedAt: command.createdAt,
        },
      };
    }

    case "thread.proposed-plan.upsert": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "thread.proposed-plan-upserted",
        payload: {
          threadId: command.threadId,
          proposedPlan: command.proposedPlan,
        },
      };
    }

    case "thread.turn.diff.complete": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "thread.turn-diff-completed",
        payload: {
          threadId: command.threadId,
          turnId: command.turnId,
          checkpointTurnCount: command.checkpointTurnCount,
          checkpointRef: command.checkpointRef,
          status: command.status,
          files: command.files,
          assistantMessageId: command.assistantMessageId ?? null,
          completedAt: command.completedAt,
        },
      };
    }

    case "thread.revert.complete": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "thread.reverted",
        payload: {
          threadId: command.threadId,
          turnCount: command.turnCount,
        },
      };
    }

    case "thread.activity.append": {
      yield* requireThread({
        readModel,
        command,
        threadId: command.threadId,
      });
      const requestId =
        typeof command.activity.payload === "object" &&
        command.activity.payload !== null &&
        "requestId" in command.activity.payload &&
        typeof (command.activity.payload as { requestId?: unknown }).requestId === "string"
          ? ((command.activity.payload as { requestId: string })
              .requestId as OrchestrationEvent["metadata"]["requestId"])
          : undefined;
      return {
        ...withEventBase({
          aggregateKind: "thread",
          aggregateId: command.threadId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
          ...(requestId !== undefined ? { metadata: { requestId } } : {}),
        }),
        type: "thread.activity-appended",
        payload: {
          threadId: command.threadId,
          activity: command.activity,
        },
      };
    }

    // --- Orchestrator commands ---

    case "orchestrator.run.create": {
      yield* requireOrchestratorRunAbsent({
        readModel,
        command,
        runId: command.runId,
      });
      yield* requireProject({
        readModel,
        command,
        projectId: command.projectId,
      });
      return {
        ...withEventBase({
          aggregateKind: "orchestrator",
          aggregateId: command.runId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "orchestrator.run.created",
        payload: {
          runId: command.runId,
          projectId: command.projectId,
          userRequest: command.userRequest,
          goals: command.goals,
          constraints: command.constraints,
          spawnBudget: command.spawnBudget,
          createdAt: command.createdAt,
        },
      };
    }

    case "orchestrator.run.cancel": {
      yield* requireOrchestratorRunActive({
        readModel,
        command,
        runId: command.runId,
      });
      return {
        ...withEventBase({
          aggregateKind: "orchestrator",
          aggregateId: command.runId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "orchestrator.run.cancelled",
        payload: {
          runId: command.runId,
          reason: command.reason,
          cancelledAt: command.createdAt,
        },
      };
    }

    case "orchestrator.run.complete": {
      yield* requireOrchestratorRunActive({
        readModel,
        command,
        runId: command.runId,
      });
      return {
        ...withEventBase({
          aggregateKind: "orchestrator",
          aggregateId: command.runId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "orchestrator.run.completed",
        payload: {
          runId: command.runId,
          summary: command.summary,
          completedAt: command.createdAt,
        },
      };
    }

    case "orchestrator.run.fail": {
      yield* requireOrchestratorRunActive({
        readModel,
        command,
        runId: command.runId,
      });
      return {
        ...withEventBase({
          aggregateKind: "orchestrator",
          aggregateId: command.runId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "orchestrator.run.failed",
        payload: {
          runId: command.runId,
          reason: command.reason,
          failedAt: command.createdAt,
        },
      };
    }

    case "orchestrator.task.create": {
      yield* requireOrchestratorRunActive({
        readModel,
        command,
        runId: command.runId,
      });
      return {
        ...withEventBase({
          aggregateKind: "orchestrator",
          aggregateId: command.runId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "orchestrator.task.created",
        payload: {
          taskId: command.taskId,
          runId: command.runId,
          parentTaskId: command.parentTaskId,
          title: command.title,
          objective: command.objective,
          acceptanceCriteria: command.acceptanceCriteria,
          stopCondition: command.stopCondition,
          readScope: command.readScope,
          writeScope: command.writeScope,
          allowedTools: command.allowedTools,
          evidenceRequired: command.evidenceRequired,
          dependsOn: command.dependsOn,
          modelPolicy: command.modelPolicy,
          maxIterations: command.maxIterations,
          createdAt: command.createdAt,
        },
      };
    }

    case "orchestrator.task.assign": {
      yield* requireOrchestratorTaskStatus({
        readModel,
        command,
        taskId: command.taskId,
        expectedStatus: ["pending", "needs-rework"],
      });
      return {
        ...withEventBase({
          aggregateKind: "orchestrator",
          aggregateId: command.taskId as unknown as OrchestrationEvent["aggregateId"],
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "orchestrator.task.assigned",
        payload: {
          taskId: command.taskId,
          assigneeKind: command.assigneeKind,
          assigneeId: command.assigneeId,
          assignedAt: command.createdAt,
        },
      };
    }

    case "orchestrator.task.submit": {
      const submittingTask = yield* requireOrchestratorTaskStatus({
        readModel,
        command,
        taskId: command.taskId,
        expectedStatus: ["assigned", "running"],
      });
      if (
        submittingTask.assignedWorkerId !== undefined &&
        submittingTask.assignedWorkerId !== (command.workerId as unknown as string)
      ) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Worker '${command.workerId}' cannot submit task '${command.taskId}' — it is assigned to worker '${submittingTask.assignedWorkerId}'.`,
        });
      }
      return {
        ...withEventBase({
          aggregateKind: "orchestrator",
          aggregateId: command.taskId as unknown as OrchestrationEvent["aggregateId"],
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "orchestrator.task.submitted",
        payload: {
          taskId: command.taskId,
          workerId: command.workerId,
          summary: command.summary,
          submittedAt: command.createdAt,
        },
      };
    }

    case "orchestrator.task.accept": {
      yield* requireOrchestratorTaskStatus({
        readModel,
        command,
        taskId: command.taskId,
        expectedStatus: "submitted",
      });
      return {
        ...withEventBase({
          aggregateKind: "orchestrator",
          aggregateId: command.taskId as unknown as OrchestrationEvent["aggregateId"],
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "orchestrator.task.accepted",
        payload: {
          taskId: command.taskId,
          summary: command.summary,
          acceptedAt: command.createdAt,
        },
      };
    }

    case "orchestrator.task.reject": {
      yield* requireOrchestratorTaskStatus({
        readModel,
        command,
        taskId: command.taskId,
        expectedStatus: "submitted",
      });
      return {
        ...withEventBase({
          aggregateKind: "orchestrator",
          aggregateId: command.taskId as unknown as OrchestrationEvent["aggregateId"],
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "orchestrator.task.rejected",
        payload: {
          taskId: command.taskId,
          instruction: command.instruction,
          rejectedAt: command.createdAt,
        },
      };
    }

    case "orchestrator.task.block": {
      yield* requireOrchestratorTask({
        readModel,
        command,
        taskId: command.taskId,
      });
      return {
        ...withEventBase({
          aggregateKind: "orchestrator",
          aggregateId: command.taskId as unknown as OrchestrationEvent["aggregateId"],
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "orchestrator.task.blocked",
        payload: {
          taskId: command.taskId,
          reason: command.reason,
          blockedAt: command.createdAt,
        },
      };
    }

    case "orchestrator.task.cancel": {
      yield* requireOrchestratorTask({
        readModel,
        command,
        taskId: command.taskId,
      });
      return {
        ...withEventBase({
          aggregateKind: "orchestrator",
          aggregateId: command.taskId as unknown as OrchestrationEvent["aggregateId"],
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "orchestrator.task.cancelled",
        payload: {
          taskId: command.taskId,
          reason: command.reason,
          cancelledAt: command.createdAt,
        },
      };
    }

    case "orchestrator.task.fail": {
      yield* requireOrchestratorTask({
        readModel,
        command,
        taskId: command.taskId,
      });
      return {
        ...withEventBase({
          aggregateKind: "orchestrator",
          aggregateId: command.taskId as unknown as OrchestrationEvent["aggregateId"],
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "orchestrator.task.failed",
        payload: {
          taskId: command.taskId,
          reason: command.reason,
          failedAt: command.createdAt,
        },
      };
    }

    case "orchestrator.worker.spawn": {
      const activeRun = yield* requireOrchestratorRunActive({
        readModel,
        command,
        runId: command.runId,
      });
      yield* requireOrchestratorTask({
        readModel,
        command,
        taskId: command.taskId,
      });

      // Budget enforcement: reject if maxTotalWorkers would be exceeded
      const existingWorkerCount = (readModel.orchestratorWorkers ?? []).filter(
        (w) => w.runId === command.runId && w.status !== "terminated",
      ).length;
      if (existingWorkerCount >= activeRun.spawnBudget.maxTotalWorkers) {
        return yield* new OrchestrationCommandInvariantError({
          commandType: command.type,
          detail: `Spawn budget exceeded: run '${command.runId}' already has ${existingWorkerCount} active worker(s) (maxTotalWorkers=${activeRun.spawnBudget.maxTotalWorkers}).`,
        });
      }

      return {
        ...withEventBase({
          aggregateKind: "orchestrator",
          aggregateId: command.runId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "orchestrator.worker.spawned",
        payload: {
          workerId: command.workerId,
          runId: command.runId,
          taskId: command.taskId,
          threadId: command.threadId,
          spawnBudget: command.spawnBudget,
          workspace: command.workspace,
          modelBinding: command.modelBinding,
          spawnedAt: command.createdAt,
        },
      };
    }

    case "orchestrator.worker.terminate": {
      yield* requireOrchestratorWorker({
        readModel,
        command,
        workerId: command.workerId,
      });
      return {
        ...withEventBase({
          aggregateKind: "orchestrator",
          aggregateId: command.workerId as unknown as OrchestrationEvent["aggregateId"],
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "orchestrator.worker.terminated",
        payload: {
          workerId: command.workerId,
          reason: command.reason,
          terminatedAt: command.createdAt,
        },
      };
    }

    case "orchestrator.evidence.capture": {
      yield* requireOrchestratorTask({
        readModel,
        command,
        taskId: command.taskId,
      });
      return {
        ...withEventBase({
          aggregateKind: "orchestrator",
          aggregateId: command.taskId as unknown as OrchestrationEvent["aggregateId"],
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "orchestrator.evidence.captured",
        payload: {
          evidenceId: command.evidenceId,
          taskId: command.taskId,
          workerId: command.workerId,
          evidenceType: command.evidenceType,
          content: command.content,
          contentTruncated: command.contentTruncated,
          metadata: command.metadata,
          capturedAt: command.createdAt,
        },
      };
    }

    case "orchestrator.decision.record": {
      yield* requireOrchestratorRunActive({
        readModel,
        command,
        runId: command.runId,
      });
      return {
        ...withEventBase({
          aggregateKind: "orchestrator",
          aggregateId: command.runId,
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "orchestrator.decision.recorded",
        payload: {
          decisionId: command.decisionId,
          runId: command.runId,
          taskId: command.taskId,
          decisionType: command.decisionType,
          reason: command.reason,
          inputs: command.inputs,
          recordedAt: command.createdAt,
        },
      };
    }

    case "orchestrator.checklist.update": {
      yield* requireOrchestratorTask({
        readModel,
        command,
        taskId: command.taskId,
      });
      return {
        ...withEventBase({
          aggregateKind: "orchestrator",
          aggregateId: command.taskId as unknown as OrchestrationEvent["aggregateId"],
          occurredAt: command.createdAt,
          commandId: command.commandId,
        }),
        type: "orchestrator.checklist.updated",
        payload: {
          taskId: command.taskId,
          checklist: command.checklist,
          updatedAt: command.createdAt,
        },
      };
    }

    default: {
      command satisfies never;
      const fallback = command as never as { type: string };
      return yield* new OrchestrationCommandInvariantError({
        commandType: fallback.type,
        detail: `Unknown command type: ${fallback.type}`,
      });
    }
  }
});
