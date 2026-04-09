/**
 * OrchestratorRouterLive - Layer implementation for OrchestratorRouterService.
 *
 * V1 router uses heuristic capability classification (no LLM needed yet):
 * 1. If no active run: simple requests get direct answers, complex ones delegate.
 * 2. If request scope is small (few files, narrow focus): answer directly.
 * 3. If multiple subtasks are identifiable: decompose.
 * 4. If single non-trivial task: delegate.
 * 5. If needs investigation: inspect.
 *
 * @module OrchestratorRouterLive
 */
import { Effect, Layer } from "effect";

import {
  OrchestratorRouterService,
  type OrchestratorRouterShape,
  type RoutingDecision,
  type RoutingInput,
  type TaskDraft,
} from "../Services/OrchestratorRouter.ts";

// ---------------------------------------------------------------------------
// Heuristic helpers
// ---------------------------------------------------------------------------

/** Keywords that signal a multi-part request suitable for decomposition. */
const DECOMPOSE_SIGNALS = [
  /\band\s+(?:also|then)\b/i,
  /\bfirst\b.*\bthen\b/i,
  /\bstep\s*\d/i,
  /\b(?:1\)|2\)|3\))/,
  /\b(?:1\.|2\.|3\.)\s/,
  /\bmultiple\b/i,
  /\bseveral\b/i,
];

/** Keywords that signal a request needs investigation before action. */
const INSPECT_SIGNALS = [
  /\bwhy\b/i,
  /\bhow does\b/i,
  /\bexplain\b/i,
  /\binvestigate\b/i,
  /\bdiagnose\b/i,
  /\bdebug\b/i,
  /\bfind\b.*\bbug\b/i,
  /\bwhat\s+(?:is|are)\b/i,
  /\bwhere\s+(?:is|are)\b/i,
];

/** Keywords that signal a simple/short request answerable directly. */
const SIMPLE_SIGNALS = [
  /^(?:yes|no|ok|sure|thanks|thank you|got it)\b/i,
  /^\/\w+/,
  /\bstatus\b/i,
  /\bhelp\b/i,
  /\bversion\b/i,
];

function isSimpleRequest(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length < 30) return true;
  return SIMPLE_SIGNALS.some((pattern) => pattern.test(trimmed));
}

function needsInspection(message: string): boolean {
  return INSPECT_SIGNALS.some((pattern) => pattern.test(message));
}

function isDecomposable(message: string): boolean {
  return DECOMPOSE_SIGNALS.some((pattern) => pattern.test(message));
}

function extractTitle(message: string): string {
  // Take the first line or first 80 characters, whichever is shorter
  const firstLine = message.split("\n")[0] ?? message;
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
}

function extractSubtasks(message: string): ReadonlyArray<TaskDraft> {
  // Simple heuristic: split on numbered patterns or "and then"
  const parts = message
    .split(/(?:\d+[.)]\s)|(?:\band\s+(?:also|then)\b)/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);

  if (parts.length < 2) {
    // Fallback: treat the whole message as two tasks (implementation + verification)
    return [
      {
        title: extractTitle(message),
        objective: message,
        acceptanceCriteria: ["Implementation matches request"],
      },
      {
        title: `Verify: ${extractTitle(message)}`,
        objective: `Verify that the implementation of "${extractTitle(message)}" is correct`,
        acceptanceCriteria: ["All acceptance criteria from parent task are met"],
      },
    ];
  }

  return parts.map((part) => ({
    title: extractTitle(part),
    objective: part,
    acceptanceCriteria: ["Implementation matches the objective"],
  }));
}

function extractInspectionPlan(message: string) {
  return {
    steps: [
      { action: "search", target: "relevant source files" },
      { action: "read", target: "identified code paths" },
      { action: "analyze", target: "root cause or answer" },
    ],
  };
}

// ---------------------------------------------------------------------------
// Router implementation
// ---------------------------------------------------------------------------

const makeOrchestratorRouter = Effect.gen(function* () {
  const route: OrchestratorRouterShape["route"] = (input: RoutingInput) =>
    Effect.sync((): RoutingDecision => {
      const msg = input.userMessage;

      // No active run: classify from scratch
      if (!input.activeRun) {
        if (isSimpleRequest(msg)) {
          return {
            action: "answer",
            response: msg,
            shouldContinueRun: false,
          };
        }

        if (needsInspection(msg)) {
          return {
            action: "inspect",
            plan: extractInspectionPlan(msg),
          };
        }

        if (isDecomposable(msg)) {
          return {
            action: "decompose",
            subtasks: extractSubtasks(msg),
          };
        }

        // Default for non-trivial: delegate to a single worker
        return {
          action: "delegate",
          taskDraft: {
            title: extractTitle(msg),
            objective: msg,
            acceptanceCriteria: ["Implementation matches request"],
          },
        };
      }

      // Active run exists: classify within context

      // If all tasks are completed/accepted, a new message likely means
      // follow-up work
      const pendingTasks = input.activeTasks.filter(
        (t) => t.status !== "accepted" && t.status !== "cancelled" && t.status !== "failed",
      );

      if (pendingTasks.length === 0) {
        // No pending work, treat like a fresh request
        if (isSimpleRequest(msg)) {
          return {
            action: "answer",
            response: msg,
            shouldContinueRun: true,
          };
        }
        return {
          action: "delegate",
          taskDraft: {
            title: extractTitle(msg),
            objective: msg,
            acceptanceCriteria: ["Implementation matches request"],
          },
        };
      }

      // Workers are busy: if the message is an investigation request, inspect
      if (needsInspection(msg)) {
        return {
          action: "inspect",
          plan: extractInspectionPlan(msg),
        };
      }

      // Otherwise: simple status-like or acknowledgement -> answer
      if (isSimpleRequest(msg)) {
        return {
          action: "answer",
          response: "",
          shouldContinueRun: true,
        };
      }

      // Complex follow-up: delegate as new task under the current run
      return {
        action: "delegate",
        taskDraft: {
          title: extractTitle(msg),
          objective: msg,
          acceptanceCriteria: ["Implementation matches request"],
        },
      };
    });

  return { route } satisfies OrchestratorRouterShape;
});

export const OrchestratorRouterLive = Layer.effect(
  OrchestratorRouterService,
  makeOrchestratorRouter,
);
