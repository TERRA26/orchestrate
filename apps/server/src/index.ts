import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { CliConfig, t3Cli } from "./main";
import { OpenLive } from "./open";
import { Command } from "effect/unstable/cli";
import { version } from "../package.json" with { type: "json" };
import { ServerLive } from "./wsServer";
import { NetService } from "@orchestrate/shared/Net";
import { FetchHttpClient } from "effect/unstable/http";
import { installCrashHandlers } from "./processHandlers.ts";

// ORC-213: register process-level crash handlers BEFORE the Effect runtime
// starts so any sync or async throw outside Effect's scope at least logs
// a structured line and triggers a bounded graceful exit.
installCrashHandlers({
  logger: {
    error(payload, message) {
      // Use stderr directly so we do not depend on the structured logger
      // service (which is constructed inside the Effect runtime). This
      // path is the last-resort log line; structured pino logs continue
      // for in-runtime errors via Effect's reporter.
      try {
        process.stderr.write(JSON.stringify({ level: "error", ...payload, message }) + "\n");
      } catch {
        // best effort; stderr write should rarely fail.
      }
    },
  },
  shutdown: async () => {
    // Best-effort: NodeRuntime.runMain installs SIGINT/SIGTERM handling
    // on the runtime fiber, but for an unhandled async throw outside the
    // runtime we fall back to a hard exit after the timeout. The Effect
    // scope finalizers (DB close, server close, subprocess kill) run on
    // SIGINT/SIGTERM/normal-exit; for uncaught/unhandled cases that never
    // reach the fiber, we accept the brief loss and exit.
  },
  shutdownTimeoutMs: 500,
});

const RuntimeLayer = Layer.empty.pipe(
  Layer.provideMerge(CliConfig.layer),
  Layer.provideMerge(ServerLive),
  Layer.provideMerge(OpenLive),
  Layer.provideMerge(NetService.layer),
  Layer.provideMerge(NodeServices.layer),
  Layer.provideMerge(FetchHttpClient.layer),
);

// dev hot-reload watch sentinel: touch this line to trigger bun --watch restart (v2)
Command.run(t3Cli, { version }).pipe(Effect.provide(RuntimeLayer), NodeRuntime.runMain);
