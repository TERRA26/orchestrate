import { Layer } from "effect";

import { BrowserAutomationLive } from "../../browser/Layers/BrowserAutomation.ts";
import { BrowserRuntimeServiceLive } from "./BrowserRuntimeService.ts";

const browserAutomationLayer = BrowserAutomationLive;

export const BrowserRuntimeStackLive = Layer.mergeAll(
  browserAutomationLayer,
  BrowserRuntimeServiceLive.pipe(Layer.provide(browserAutomationLayer)),
);
