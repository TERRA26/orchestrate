/**
 * EvidenceCaptureLive - Captures evidence from checkpoint and browser validation events.
 *
 * Reacts to `thread.turn-diff-completed` domain events to capture file diffs as
 * evidence records, and provides a browser validation evidence capture method for
 * use by browser validation code. All evidence is keyed to task and worker via
 * the OrchestratorRuntimeService.
 *
 * @module EvidenceCaptureLive
 */
import { Effect, Layer, ServiceMap } from "effect";

import { OrchestratorRuntimeService } from "../Services/OrchestratorRuntime.ts";
import type { OrchestratorTaskId, OrchestratorWorkerId } from "@t3tools/contracts";
import type { OrchestrationDispatchError } from "../Errors.ts";

// ---------------------------------------------------------------------------
// Service shape
// ---------------------------------------------------------------------------

export interface EvidenceCaptureShape {
  /** Capture file diff and file-snapshot evidence from a turn completion. */
  readonly captureFromTurnCompletion: (input: {
    readonly taskId: string;
    readonly workerId?: string;
    readonly diff: string;
    readonly files: ReadonlyArray<{ readonly path: string; readonly kind: string }>;
  }) => Effect.Effect<void, OrchestrationDispatchError>;

  /** Capture browser validation evidence (action log, screenshot, ARIA snapshot). */
  readonly captureFromBrowserValidation: (input: {
    readonly taskId: string;
    readonly workerId?: string;
    readonly actionLog: string;
    readonly screenshot?: string;
    readonly ariaSnapshot?: string;
  }) => Effect.Effect<void, OrchestrationDispatchError>;
}

export class EvidenceCaptureService extends ServiceMap.Service<
  EvidenceCaptureService,
  EvidenceCaptureShape
>()("t3/orchestration/Layers/EvidenceCapture/EvidenceCaptureService") {}

// ---------------------------------------------------------------------------
// Layer implementation
// ---------------------------------------------------------------------------

const MAX_DIFF_CONTENT_LENGTH = 100_000;
const MAX_SCREENSHOT_CONTENT_LENGTH = 500_000;

import type { CaptureEvidenceInput } from "../Services/OrchestratorRuntime.ts";

/** Build a CaptureEvidenceInput, only including workerId when defined. */
function evidenceInput(
  base: Omit<CaptureEvidenceInput, "workerId">,
  workerId?: string,
): CaptureEvidenceInput {
  if (workerId) {
    return { ...base, workerId: workerId as OrchestratorWorkerId };
  }
  return base;
}

const makeEvidenceCapture = Effect.gen(function* () {
  const runtime = yield* OrchestratorRuntimeService;

  const captureFromTurnCompletion: EvidenceCaptureShape["captureFromTurnCompletion"] = (input) =>
    Effect.gen(function* () {
      if (input.diff) {
        yield* runtime.captureEvidence(
          evidenceInput(
            {
              taskId: input.taskId as OrchestratorTaskId,
              evidenceType: "diff",
              content: input.diff,
              contentTruncated: input.diff.length > MAX_DIFF_CONTENT_LENGTH,
            },
            input.workerId,
          ),
        );
      }

      for (const file of input.files) {
        yield* runtime.captureEvidence(
          evidenceInput(
            {
              taskId: input.taskId as OrchestratorTaskId,
              evidenceType: "file-snapshot",
              content: `${file.path}: ${file.kind}`,
              contentTruncated: false,
              metadata: { path: file.path, kind: file.kind },
            },
            input.workerId,
          ),
        );
      }
    });

  const captureFromBrowserValidation: EvidenceCaptureShape["captureFromBrowserValidation"] = (
    input,
  ) =>
    Effect.gen(function* () {
      yield* runtime.captureEvidence(
        evidenceInput(
          {
            taskId: input.taskId as OrchestratorTaskId,
            evidenceType: "browser-trace",
            content: input.actionLog,
            contentTruncated: false,
          },
          input.workerId,
        ),
      );

      if (input.screenshot) {
        yield* runtime.captureEvidence(
          evidenceInput(
            {
              taskId: input.taskId as OrchestratorTaskId,
              evidenceType: "screenshot",
              content: input.screenshot,
              contentTruncated: input.screenshot.length > MAX_SCREENSHOT_CONTENT_LENGTH,
            },
            input.workerId,
          ),
        );
      }

      if (input.ariaSnapshot) {
        yield* runtime.captureEvidence(
          evidenceInput(
            {
              taskId: input.taskId as OrchestratorTaskId,
              evidenceType: "aria-snapshot",
              content: input.ariaSnapshot,
              contentTruncated: false,
            },
            input.workerId,
          ),
        );
      }
    });

  return {
    captureFromTurnCompletion,
    captureFromBrowserValidation,
  } satisfies EvidenceCaptureShape;
});

export const EvidenceCaptureLive = Layer.effect(EvidenceCaptureService, makeEvidenceCapture);
