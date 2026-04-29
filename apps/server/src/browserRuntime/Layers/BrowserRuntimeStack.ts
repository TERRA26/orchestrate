import { Layer } from "effect";

import { BrowserAutomationLive } from "../../browser/Layers/BrowserAutomation.ts";
import { BrowserControlLeaseServiceLive } from "../../browserControl/Layers/BrowserControlLeaseService.ts";
import { BrowserEvidenceRecorderLive } from "../../browserEvidence/Layers/BrowserEvidenceRecorder.ts";
import { BrowserOrchestrationEvidenceRepositoryLive } from "../../persistence/Layers/BrowserOrchestrationEvidence.ts";
import { DesktopBrowserBridgeBrokerLive } from "./DesktopBrowserBridge.ts";
import { BrowserRuntimeServiceLive } from "./BrowserRuntimeService.ts";

const browserAutomationLayer = BrowserAutomationLive;
const browserEvidenceRecorderLayer = BrowserEvidenceRecorderLive.pipe(
  Layer.provide(BrowserOrchestrationEvidenceRepositoryLive),
);
const browserControlLeaseLayer = BrowserControlLeaseServiceLive.pipe(
  Layer.provide(BrowserOrchestrationEvidenceRepositoryLive),
);

export const BrowserRuntimeStackLive = Layer.mergeAll(
  browserAutomationLayer,
  browserEvidenceRecorderLayer,
  BrowserRuntimeServiceLive.pipe(
    Layer.provide(browserAutomationLayer),
    Layer.provide(browserEvidenceRecorderLayer),
    Layer.provide(DesktopBrowserBridgeBrokerLive),
    Layer.provide(browserControlLeaseLayer),
    Layer.provide(BrowserOrchestrationEvidenceRepositoryLive),
  ),
  DesktopBrowserBridgeBrokerLive,
  browserControlLeaseLayer,
);
