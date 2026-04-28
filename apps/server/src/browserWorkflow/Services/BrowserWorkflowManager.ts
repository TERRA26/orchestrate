import type {
  BrowserWorkflowListInput,
  BrowserWorkflowListResult,
  BrowserWorkflowRunInput,
  BrowserWorkflowRunResult,
  BrowserWorkflowStartInput,
  BrowserWorkflowStartResult,
} from "@orchestrate/contracts";
import { ServiceMap } from "effect";
import type { Effect } from "effect";

export interface BrowserWorkflowManagerShape {
  readonly start: (
    input: BrowserWorkflowStartInput,
  ) => Effect.Effect<BrowserWorkflowStartResult, Error>;
  readonly status: (
    input: BrowserWorkflowRunInput,
  ) => Effect.Effect<BrowserWorkflowRunResult, Error>;
  readonly get: (input: BrowserWorkflowRunInput) => Effect.Effect<BrowserWorkflowRunResult, Error>;
  readonly cancel: (
    input: BrowserWorkflowRunInput,
  ) => Effect.Effect<BrowserWorkflowRunResult, Error>;
  readonly list: (
    input: BrowserWorkflowListInput,
  ) => Effect.Effect<BrowserWorkflowListResult, Error>;
}

export class BrowserWorkflowManager extends ServiceMap.Service<
  BrowserWorkflowManager,
  BrowserWorkflowManagerShape
>()("t3/browserWorkflow/Services/BrowserWorkflowManager") {}
