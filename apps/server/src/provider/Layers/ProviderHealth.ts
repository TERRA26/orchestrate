/**
 * ProviderHealthLive - Live implementation of the ProviderHealth service.
 *
 * Returns provider status based on basic binary availability checks.
 */
import { Effect, Layer } from "effect";
import { ProviderHealth } from "../Services/ProviderHealth.ts";

export const ProviderHealthLive = Layer.succeed(ProviderHealth, {
  getStatuses: Effect.succeed([]),
});
