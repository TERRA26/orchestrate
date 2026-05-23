import * as Http from "node:http";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it, vi } from "@effect/vitest";
import type { OrchestrationReadModel } from "@orchestrate/contracts";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Layer from "effect/Layer";
import * as Command from "effect/unstable/cli/Command";
import { FetchHttpClient } from "effect/unstable/http";
import { beforeEach } from "vitest";
import { NetService } from "@orchestrate/shared/Net";

import { CliConfig, recordStartupHeartbeat, t3Cli, type CliConfigShape } from "./main";
import { ServerConfig, type ServerConfigShape } from "./config";
import { Open, type OpenShape } from "./open";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery";
import { AnalyticsService } from "./telemetry/Services/AnalyticsService";
import { Server, type ServerShape } from "./wsServer";

const start = vi.fn(() => undefined);
const stop = vi.fn(() => undefined);
let resolvedConfig: ServerConfigShape | null = null;
const serverStart = Effect.acquireRelease(
  Effect.gen(function* () {
    resolvedConfig = yield* ServerConfig;
    start();
    return {} as unknown as Http.Server;
  }),
  () => Effect.sync(() => stop()),
);
const findAvailablePort = vi.fn((preferred: number) => Effect.succeed(preferred));

// Shared service layer used by this CLI test suite.
const testLayer = Layer.mergeAll(
  Layer.succeed(CliConfig, {
    cwd: "/tmp/t3-test-workspace",
    fixPath: Effect.void,
    resolveStaticDir: Effect.undefined,
  } satisfies CliConfigShape),
  Layer.succeed(NetService, {
    canListenOnHost: () => Effect.succeed(true),
    canConnectToHost: () => Effect.succeed(false),
    isPortAvailableOnLoopback: () => Effect.succeed(true),
    reserveLoopbackPort: () => Effect.succeed(0),
    findAvailablePort,
  }),
  Layer.succeed(Server, {
    start: serverStart,
    stopSignal: Effect.void,
  } satisfies ServerShape),
  Layer.succeed(Open, {
    openBrowser: (_target: string) => Effect.void,
    openInEditor: () => Effect.void,
  } satisfies OpenShape),
  AnalyticsService.layerTest,
  FetchHttpClient.layer,
  NodeServices.layer,
);

// Default env for CLI tests. ORC-041: include a benign ORCHESTRATE_AUTH_TOKEN
// so the binding-security check (which refuses to start on a wildcard host
// without an auth token) does not abort tests that aren't exercising it.
// Tests that DO want to exercise the security check can pass an env that
// explicitly leaves the token unset (e.g. by setting it to undefined and
// using a host of 0.0.0.0).
const DEFAULT_CLI_ENV: Record<string, string> = {
  ORCHESTRATE_NO_BROWSER: "true",
  ORCHESTRATE_AUTH_TOKEN: "test-auth-token",
};

const runCli = (args: ReadonlyArray<string>, env: Record<string, string> = {}) => {
  const mergedEnv = { ...DEFAULT_CLI_ENV, ...env };
  return Command.runWith(t3Cli, { version: "0.0.0-test" })(args).pipe(
    Effect.provide(
      ConfigProvider.layer(
        ConfigProvider.fromEnv({
          env: mergedEnv,
        }),
      ),
    ),
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  resolvedConfig = null;
  start.mockImplementation(() => undefined);
  stop.mockImplementation(() => undefined);
  findAvailablePort.mockImplementation((preferred: number) => Effect.succeed(preferred));
});

it.layer(testLayer)("server CLI command", (it) => {
  it.effect("parses all CLI flags and wires scoped start/stop", () =>
    Effect.gen(function* () {
      yield* runCli([
        "--mode",
        "desktop",
        "--port",
        "4010",
        "--host",
        "0.0.0.0",
        "--home-dir",
        "/tmp/t3-cli-home",
        "--dev-url",
        "http://127.0.0.1:5173",
        "--no-browser",
        "--auth-token",
        "auth-secret",
      ]);

      assert.equal(start.mock.calls.length, 1);
      assert.equal(resolvedConfig?.mode, "desktop");
      assert.equal(resolvedConfig?.port, 4010);
      assert.equal(resolvedConfig?.host, "0.0.0.0");
      assert.equal(resolvedConfig?.baseDir, "/tmp/t3-cli-home");
      assert.equal(resolvedConfig?.stateDir, "/tmp/t3-cli-home/dev");
      assert.equal(resolvedConfig?.devUrl?.toString(), "http://127.0.0.1:5173/");
      assert.equal(resolvedConfig?.noBrowser, true);
      assert.equal(resolvedConfig?.authToken, "auth-secret");
      assert.equal(resolvedConfig?.autoBootstrapProjectFromCwd, false);
      assert.equal(resolvedConfig?.logWebSocketEvents, false);
      assert.equal(stop.mock.calls.length, 1);
    }),
  );

  it.effect("supports --token as an alias for --auth-token", () =>
    Effect.gen(function* () {
      yield* runCli(["--token", "token-secret"]);

      assert.equal(start.mock.calls.length, 1);
      assert.equal(resolvedConfig?.authToken, "token-secret");
    }),
  );

  it.effect("uses env fallbacks when flags are not provided", () =>
    Effect.gen(function* () {
      yield* runCli([], {
        ORCHESTRATE_MODE: "desktop",
        ORCHESTRATE_PORT: "4999",
        ORCHESTRATE_HOST: "100.88.10.4",
        ORCHESTRATE_HOME: "/tmp/t3-env-home",
        VITE_DEV_SERVER_URL: "http://localhost:5173",
        ORCHESTRATE_NO_BROWSER: "true",
        ORCHESTRATE_AUTH_TOKEN: "env-token",
      });

      assert.equal(start.mock.calls.length, 1);
      assert.equal(resolvedConfig?.mode, "desktop");
      assert.equal(resolvedConfig?.port, 4999);
      assert.equal(resolvedConfig?.host, "100.88.10.4");
      assert.equal(resolvedConfig?.baseDir, "/tmp/t3-env-home");
      assert.equal(resolvedConfig?.stateDir, "/tmp/t3-env-home/dev");
      assert.equal(resolvedConfig?.devUrl?.toString(), "http://localhost:5173/");
      assert.equal(resolvedConfig?.noBrowser, true);
      assert.equal(resolvedConfig?.authToken, "env-token");
      assert.equal(resolvedConfig?.autoBootstrapProjectFromCwd, false);
      assert.equal(resolvedConfig?.logWebSocketEvents, false);
      assert.equal(findAvailablePort.mock.calls.length, 0);
    }),
  );

  it.effect("prefers --mode over ORCHESTRATE_MODE", () =>
    Effect.gen(function* () {
      findAvailablePort.mockImplementation((_preferred: number) => Effect.succeed(4666));
      yield* runCli(["--mode", "web"], {
        ORCHESTRATE_MODE: "desktop",
        ORCHESTRATE_NO_BROWSER: "true",
      });

      assert.deepStrictEqual(findAvailablePort.mock.calls, [[3773]]);
      assert.equal(start.mock.calls.length, 1);
      assert.equal(resolvedConfig?.mode, "web");
      assert.equal(resolvedConfig?.port, 4666);
      assert.equal(resolvedConfig?.host, undefined);
    }),
  );

  it.effect("prefers --no-browser over ORCHESTRATE_NO_BROWSER", () =>
    Effect.gen(function* () {
      yield* runCli(["--no-browser"], {
        ORCHESTRATE_NO_BROWSER: "false",
      });

      assert.equal(start.mock.calls.length, 1);
      assert.equal(resolvedConfig?.noBrowser, true);
    }),
  );

  it.effect("uses dynamic port discovery in web mode when port is omitted", () =>
    Effect.gen(function* () {
      findAvailablePort.mockImplementation((_preferred: number) => Effect.succeed(5444));
      yield* runCli([]);

      assert.deepStrictEqual(findAvailablePort.mock.calls, [[3773]]);
      assert.equal(start.mock.calls.length, 1);
      assert.equal(resolvedConfig?.port, 5444);
      assert.equal(resolvedConfig?.mode, "web");
    }),
  );

  it.effect("uses fixed localhost defaults in desktop mode", () =>
    Effect.gen(function* () {
      yield* runCli([], {
        ORCHESTRATE_MODE: "desktop",
        ORCHESTRATE_NO_BROWSER: "true",
      });

      assert.equal(findAvailablePort.mock.calls.length, 0);
      assert.equal(start.mock.calls.length, 1);
      assert.equal(resolvedConfig?.port, 3773);
      assert.equal(resolvedConfig?.host, "127.0.0.1");
      assert.equal(resolvedConfig?.mode, "desktop");
    }),
  );

  it.effect("allows overriding desktop host with --host", () =>
    Effect.gen(function* () {
      yield* runCli(["--host", "0.0.0.0"], {
        ORCHESTRATE_MODE: "desktop",
        ORCHESTRATE_NO_BROWSER: "true",
      });

      assert.equal(start.mock.calls.length, 1);
      assert.equal(resolvedConfig?.mode, "desktop");
      assert.equal(resolvedConfig?.host, "0.0.0.0");
    }),
  );

  it.effect("supports CLI and env for bootstrap/log websocket toggles", () =>
    Effect.gen(function* () {
      yield* runCli(["--auto-bootstrap-project-from-cwd"], {
        ORCHESTRATE_MODE: "desktop",
        ORCHESTRATE_LOG_WS_EVENTS: "false",
        ORCHESTRATE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD: "false",
        ORCHESTRATE_NO_BROWSER: "true",
      });

      assert.equal(start.mock.calls.length, 1);
      assert.equal(resolvedConfig?.autoBootstrapProjectFromCwd, true);
      assert.equal(resolvedConfig?.logWebSocketEvents, false);
    }),
  );

  it.effect("records a startup heartbeat with thread/project counts", () =>
    Effect.gen(function* () {
      const recordTelemetry = vi.fn(
        (_event: string, _properties?: Readonly<Record<string, unknown>>) => Effect.void,
      );
      const getSnapshot = vi.fn(() =>
        Effect.succeed({
          snapshotSequence: 2,
          projects: [{} as OrchestrationReadModel["projects"][number]],
          threads: [
            {} as OrchestrationReadModel["threads"][number],
            {} as OrchestrationReadModel["threads"][number],
          ],
          orchestratorRuns: [],
          orchestratorTasks: [],
          orchestratorWorkers: [],
          updatedAt: new Date(1).toISOString(),
        } satisfies OrchestrationReadModel),
      );

      yield* recordStartupHeartbeat.pipe(
        Effect.provideService(ProjectionSnapshotQuery, {
          getSnapshot,
          getCounts: () => Effect.succeed({ projectCount: 1, threadCount: 2 }),
          getActiveProjectByWorkspaceRoot: () => Effect.succeed(Option.none()),
          getFirstActiveThreadIdByProjectId: () => Effect.succeed(Option.none()),
          getThreadCheckpointContext: () => Effect.succeed(Option.none()),
        }),
        Effect.provideService(AnalyticsService, {
          record: recordTelemetry,
          flush: Effect.void,
        }),
      );

      assert.deepEqual(recordTelemetry.mock.calls[0], [
        "server.boot.heartbeat",
        {
          threadCount: 2,
          projectCount: 1,
        },
      ]);
    }),
  );

  it.effect("does not start server for invalid --mode values", () =>
    Effect.gen(function* () {
      yield* runCli(["--mode", "invalid"]).pipe(Effect.catch(() => Effect.void));

      assert.equal(start.mock.calls.length, 0);
      assert.equal(stop.mock.calls.length, 0);
    }),
  );

  it.effect("ORC-041 refuses to start when binding wildcard host with no auth token", () =>
    Effect.gen(function* () {
      // Override the default env to remove the auth token, simulating a
      // production startup with neither --token nor ORCHESTRATE_AUTH_TOKEN.
      yield* runCli(["--mode", "web", "--host", "0.0.0.0"], {
        ORCHESTRATE_NO_BROWSER: "true",
        ORCHESTRATE_AUTH_TOKEN: "",
      }).pipe(Effect.catch(() => Effect.void));

      assert.equal(start.mock.calls.length, 0);
      assert.equal(stop.mock.calls.length, 0);
    }),
  );

  it.effect("ORC-041 starts when binding to loopback even without an auth token", () =>
    Effect.gen(function* () {
      yield* runCli(["--mode", "web", "--host", "127.0.0.1"], {
        ORCHESTRATE_NO_BROWSER: "true",
        ORCHESTRATE_AUTH_TOKEN: "",
      });

      assert.equal(start.mock.calls.length, 1);
      assert.equal(resolvedConfig?.host, "127.0.0.1");
      // Empty env value passes through as empty string; the binding-security
      // check treats it as "no token" (trimmed length zero) and lets the
      // loopback bind through without complaint.
      assert.equal((resolvedConfig?.authToken ?? "").trim(), "");
    }),
  );

  it.effect("does not start server for invalid --dev-url values", () =>
    Effect.gen(function* () {
      yield* runCli(["--dev-url", "not-a-url"]).pipe(Effect.catch(() => Effect.void));

      assert.equal(start.mock.calls.length, 0);
      assert.equal(stop.mock.calls.length, 0);
    }),
  );

  it.effect("does not start server for out-of-range --port values", () =>
    Effect.gen(function* () {
      yield* runCli(["--port", "70000"]).pipe(Effect.catch(() => Effect.void));

      // effect/unstable/cli renders help/errors for parse failures and returns success.
      assert.equal(start.mock.calls.length, 0);
      assert.equal(stop.mock.calls.length, 0);
    }),
  );
});
