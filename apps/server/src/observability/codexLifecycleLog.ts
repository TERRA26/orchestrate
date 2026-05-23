/**
 * Pure helper that turns a Codex session lifecycle transition into a
 * structured log entry. Lets the manager emit a parallel log line for each
 * client-facing lifecycle event without re-deriving the level/fields at
 * every call site.
 *
 * @see ORC-064
 * @module observability/codexLifecycleLog
 */

import type { ThreadId } from "@orchestrate/contracts";

export type CodexLifecycleLogLevel = "info" | "warning" | "error";

export type CodexLifecycleEvent =
  | {
      readonly kind: "starting";
      readonly threadId: ThreadId;
      readonly cwd: string | undefined;
      readonly model: string | null | undefined;
      readonly runtimeMode: string | undefined;
    }
  | {
      readonly kind: "ready";
      readonly threadId: ThreadId;
      readonly cwd: string | undefined;
      readonly model: string | null | undefined;
      readonly providerThreadId: string | undefined;
      readonly pid: number | undefined;
    }
  | {
      readonly kind: "retry";
      readonly threadId: ThreadId;
      readonly attempt: number;
      readonly reason: string;
    }
  | {
      readonly kind: "closed-graceful";
      readonly threadId: ThreadId;
    }
  | {
      readonly kind: "exited-unexpected";
      readonly threadId: ThreadId;
      readonly code: number | null;
      readonly signal: string | null;
      readonly pid: number | undefined;
    }
  | {
      readonly kind: "process-error";
      readonly threadId: ThreadId;
      readonly errorMessage: string;
      readonly pid: number | undefined;
    };

export interface CodexLifecycleLogPayload {
  readonly level: CodexLifecycleLogLevel;
  readonly message: string;
  readonly fields: Record<string, unknown>;
}

const baseFields = (input: { threadId: ThreadId }): Record<string, unknown> => ({
  scope: "codex.session",
  threadId: input.threadId,
});

export const buildCodexLifecycleLog = (
  event: CodexLifecycleEvent,
): CodexLifecycleLogPayload => {
  switch (event.kind) {
    case "starting":
      return {
        level: "info",
        message: "codex session starting",
        fields: {
          ...baseFields(event),
          event: "codex.session.starting",
          cwd: event.cwd ?? null,
          model: event.model ?? null,
          runtimeMode: event.runtimeMode ?? null,
        },
      };
    case "ready":
      return {
        level: "info",
        message: "codex session ready",
        fields: {
          ...baseFields(event),
          event: "codex.session.ready",
          cwd: event.cwd ?? null,
          model: event.model ?? null,
          providerThreadId: event.providerThreadId ?? null,
          pid: event.pid ?? null,
        },
      };
    case "retry":
      return {
        level: "warning",
        message: "codex session retry",
        fields: {
          ...baseFields(event),
          event: "codex.session.retry",
          attempt: event.attempt,
          reason: event.reason,
        },
      };
    case "closed-graceful":
      return {
        level: "info",
        message: "codex session closed",
        fields: {
          ...baseFields(event),
          event: "codex.session.closed",
        },
      };
    case "exited-unexpected":
      return {
        level: "error",
        message: "codex session exited unexpectedly",
        fields: {
          ...baseFields(event),
          event: "codex.session.exited-unexpected",
          code: event.code,
          signal: event.signal,
          pid: event.pid ?? null,
        },
      };
    case "process-error":
      return {
        level: "error",
        message: "codex session process error",
        fields: {
          ...baseFields(event),
          event: "codex.session.process-error",
          errorMessage: event.errorMessage,
          pid: event.pid ?? null,
        },
      };
  }
};
