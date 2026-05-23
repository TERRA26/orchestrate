import {
  type LaunchConfig,
  type PreviewDetectInput,
  type PreviewDetectResult,
  type PreviewInstanceInput,
  type PreviewLogsResult,
  type PreviewStartInput,
  type PreviewStartResult,
  type PreviewStatusResult,
  type PreviewStopInput,
  type PreviewTarget,
  type PreviewTargetGetInput,
  type PreviewTargetListInput,
  type PreviewTargetListResult,
} from "@orchestrate/contracts";
import { ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";
import type { DevServerSupervisorError } from "../DevServerSupervisor.ts";

export type PreviewServiceError = ProjectionRepositoryError | DevServerSupervisorError | Error;

export interface PreviewServiceShape {
  readonly detect: (
    input?: PreviewDetectInput,
  ) => Effect.Effect<PreviewDetectResult, PreviewServiceError>;
  readonly start: (
    input?: PreviewStartInput,
  ) => Effect.Effect<PreviewStartResult, PreviewServiceError>;
  readonly stop: (
    input: PreviewStopInput,
  ) => Effect.Effect<PreviewStatusResult, PreviewServiceError>;
  readonly restart: (
    input: PreviewInstanceInput,
  ) => Effect.Effect<PreviewStartResult, PreviewServiceError>;
  readonly status: (
    input: PreviewInstanceInput,
  ) => Effect.Effect<PreviewStatusResult, PreviewServiceError>;
  readonly logs: (
    input: PreviewInstanceInput,
  ) => Effect.Effect<PreviewLogsResult, PreviewServiceError>;
  readonly getTarget: (
    input: PreviewTargetGetInput,
  ) => Effect.Effect<PreviewTarget | null, PreviewServiceError>;
  readonly listTargets: (
    input?: PreviewTargetListInput,
  ) => Effect.Effect<PreviewTargetListResult, PreviewServiceError>;
  readonly openSessionInputForTarget: (input: {
    readonly previewTarget: PreviewTarget;
  }) => Effect.Effect<{
    readonly url: string;
    readonly previewTarget: PreviewTarget;
  }>;
  readonly getLaunchConfigs: () => Effect.Effect<ReadonlyArray<LaunchConfig>, PreviewServiceError>;
}

export class PreviewService extends ServiceMap.Service<PreviewService, PreviewServiceShape>()(
  "t3/preview/Services/PreviewService",
) {}
