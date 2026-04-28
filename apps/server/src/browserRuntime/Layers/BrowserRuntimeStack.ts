import { Layer } from "effect";

import { BrowserAutomationLive } from "../../browser/Layers/BrowserAutomation.ts";
import { BrowserEvidenceRecorderLive } from "../../browserEvidence/Layers/BrowserEvidenceRecorder.ts";
import { BrowserOrchestrationEvidenceRepositoryLive } from "../../persistence/Layers/BrowserOrchestrationEvidence.ts";
import { BrowserRuntimeServiceLive } from "./BrowserRuntimeService.ts";

const browserAutomationLayer = BrowserAutomationLive;
const browserEvidenceRecorderLayer = BrowserEvidenceRecorderLive.pipe(
  Layer.provide(BrowserOrchestrationEvidenceRepositoryLive),
);

export const BrowserRuntimeStackLive = Layer.mergeAll(
  browserAutomationLayer,
  browserEvidenceRecorderLayer,
  BrowserRuntimeServiceLive.pipe(
    Layer.provide(browserAutomationLayer),
    Layer.provide(browserEvidenceRecorderLayer),
  ),
);
