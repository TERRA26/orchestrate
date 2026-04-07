/**
 * ProviderHealth - Service for querying provider health/status.
 *
 * Returns an array of ServerProvider objects representing the current
 * health status of all configured providers.
 */
import type { ServerProvider } from "@t3tools/contracts";
import { Effect, ServiceMap } from "effect";

export interface ProviderHealthShape {
  readonly getStatuses: Effect.Effect<ReadonlyArray<ServerProvider>>;
}

export class ProviderHealth extends ServiceMap.Service<ProviderHealth, ProviderHealthShape>()(
  "t3/provider/Services/ProviderHealth",
) {}
