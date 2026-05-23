import {
  type BrowserAction,
  type BrowserClaimGateReport,
  type BrowserInspectionArtifact,
  type BrowserObservation,
  type BrowserPolicyDecision,
  type BrowserElementSummary,
  type BrowserTargetResolution,
  type BrowserRuntimeTruth,
  type BrowserSessionId,
  type EvidenceArtifactId,
  type PreviewTarget,
} from "@orchestrate/contracts";
import { ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";

export type BrowserEvidenceRuntimeContext = {
  readonly previewTarget: PreviewTarget;
  readonly browserSessionId: BrowserSessionId;
  readonly runtimeTruth?: BrowserRuntimeTruth | undefined;
};

export type BrowserEvidenceRecordResult = {
  readonly evidenceRefs: ReadonlyArray<EvidenceArtifactId>;
  readonly screenshotArtifactRef?: EvidenceArtifactId;
};

export interface BrowserEvidenceRecorderShape {
  readonly recordSessionOpened: (
    input: BrowserEvidenceRuntimeContext,
  ) => Effect.Effect<BrowserEvidenceRecordResult, ProjectionRepositoryError>;
  readonly recordAction: (
    input: BrowserEvidenceRuntimeContext & {
      readonly action: BrowserAction;
      readonly policyDecision?: BrowserPolicyDecision;
      readonly resolvedTarget?: BrowserElementSummary;
      readonly targetResolution?: BrowserTargetResolution;
    },
  ) => Effect.Effect<BrowserEvidenceRecordResult, ProjectionRepositoryError>;
  readonly recordInspection: (
    input: BrowserEvidenceRuntimeContext & {
      readonly inspection: BrowserInspectionArtifact;
    },
  ) => Effect.Effect<BrowserEvidenceRecordResult, ProjectionRepositoryError>;
  readonly recordObservation: (
    input: BrowserEvidenceRuntimeContext & {
      readonly observation: BrowserObservation;
      readonly runtimeTruth: BrowserRuntimeTruth | undefined;
    },
  ) => Effect.Effect<BrowserEvidenceRecordResult, ProjectionRepositoryError>;
  readonly recordClaimGate: (
    input: BrowserEvidenceRuntimeContext & {
      readonly observation: BrowserObservation;
      readonly reports: ReadonlyArray<BrowserClaimGateReport>;
    },
  ) => Effect.Effect<BrowserEvidenceRecordResult, ProjectionRepositoryError>;
}

export class BrowserEvidenceRecorder extends ServiceMap.Service<
  BrowserEvidenceRecorder,
  BrowserEvidenceRecorderShape
>()("t3/browserEvidence/Services/BrowserEvidenceRecorder") {}
