import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import Path from "node:path";
import { createServer } from "node:net";

import {
  BROWSER_ORCHESTRATION_SCHEMA_VERSION,
  DevServerInstanceId,
  type DevServerFailureReason,
  type DevServerInstance,
  type DevServerReady,
  EvidenceArtifactId,
  LaunchConfigFile,
  type LaunchConfig,
  LaunchConfigId,
  PreviewTargetId,
  type PreviewTarget,
  type PreviewViewport,
} from "@orchestrate/contracts";
import { Schema } from "effect";

const DEFAULT_HEALTH_TIMEOUT_MS = 30_000;
const DEFAULT_ROUTE = "/";
const DEFAULT_VIEWPORTS: PreviewViewport[] = [
  {
    id: "desktop",
    label: "Desktop",
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
  },
  {
    id: "mobile",
    label: "Mobile",
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
  },
];

const ALLOWED_EXECUTABLES = new Set(["bun", "node", "npm", "pnpm", "yarn"]);

export type DevServerSupervisorError = {
  readonly reason: DevServerFailureReason;
  readonly message: string;
  readonly instance?: DevServerInstance;
};

export type DevServerStartResult =
  | { readonly ok: true; readonly ready: DevServerReady }
  | { readonly ok: false; readonly error: DevServerSupervisorError };

export type DevServerStopReason = "stopped-by-user" | "stopped-by-workflow";

type RunningServer = {
  readonly child: ChildProcessWithoutNullStreams;
  readonly config: LaunchConfig;
  instance: DevServerInstance;
  stdout: string[];
  stderr: string[];
};

type PreviewTargetRecord = {
  readonly signature: string;
  readonly target: PreviewTarget;
};

export class DevServerSupervisor {
  private readonly runningServers = new Map<string, RunningServer>();
  private readonly previewTargetsByKey = new Map<string, PreviewTargetRecord>();

  constructor(private readonly repoRoot: string) {}

  async loadLaunchConfig(): Promise<LaunchConfig[]> {
    const filePath = Path.join(this.repoRoot, ".orchestrate", "launch.json");
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return [...Schema.decodeUnknownSync(LaunchConfigFile)(parsed).configurations];
  }

  async detectLaunchConfigs(): Promise<LaunchConfig[]> {
    const packageJsonPath = Path.join(this.repoRoot, "package.json");
    const raw = await readFile(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as {
      readonly scripts?: Record<string, string>;
    };
    const scripts = parsed.scripts ?? {};
    const scriptName =
      "dev:web" in scripts
        ? "dev:web"
        : "dev" in scripts
          ? "dev"
          : "start" in scripts
            ? "start"
            : null;

    if (scriptName === null) return [];

    return [
      {
        id: LaunchConfigId.makeUnsafe("detected-web"),
        name: `Detected ${scriptName}`,
        cwd: ".",
        runtimeExecutable: "bun",
        runtimeArgs: ["run", scriptName],
        autoPort: true,
        defaultRoute: DEFAULT_ROUTE,
        healthCheck: {
          path: DEFAULT_ROUTE,
          timeoutMs: DEFAULT_HEALTH_TIMEOUT_MS,
          expectedStatus: [200, 304],
        },
        autoVerify: true,
        tags: ["detected", "local-preview"],
      },
    ];
  }

  validateConfig(config: LaunchConfig): DevServerSupervisorError | null {
    const cwd = Path.resolve(this.repoRoot, config.cwd);
    const relative = Path.relative(this.repoRoot, cwd);
    if (relative.startsWith("..") || Path.isAbsolute(relative)) {
      return {
        reason: "invalid-cwd",
        message: `Launch config cwd escapes repo root: ${config.cwd}`,
      };
    }

    const executable = Path.basename(config.runtimeExecutable);
    if (!ALLOWED_EXECUTABLES.has(executable)) {
      return {
        reason: "command-not-allowed",
        message: `Launch executable is not allowed: ${config.runtimeExecutable}`,
      };
    }

    return null;
  }

  async startServer(sessionId: string, config: LaunchConfig): Promise<DevServerStartResult> {
    const validationError = this.validateConfig(config);
    if (validationError !== null) {
      return { ok: false, error: validationError };
    }

    const cwd = Path.resolve(this.repoRoot, config.cwd);
    const assignedPort = await this.resolvePort(config);
    if (assignedPort === null) {
      return {
        ok: false,
        error: {
          reason: "port-in-use",
          message: `Port ${config.port} is already in use and autoPort is disabled.`,
        },
      };
    }

    const instanceId = DevServerInstanceId.makeUnsafe(`dev-server-${randomUUID()}`);
    const now = new Date().toISOString();
    const logStreamRef = artifactId("server-log", instanceId);
    const baseUrl = `http://127.0.0.1:${assignedPort}`;
    const command = [config.runtimeExecutable, ...config.runtimeArgs];
    const startingInstance: DevServerInstance = {
      id: instanceId,
      sessionId,
      launchConfigId: config.id,
      status: "starting",
      cwd,
      command,
      assignedPort,
      baseUrl,
      startedAt: now,
      logStreamRef,
      recentErrorRefs: [],
    };

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(config.runtimeExecutable, config.runtimeArgs, {
        cwd,
        env: {
          ...process.env,
          ...config.env,
          PORT: String(assignedPort),
        },
        shell: process.platform === "win32",
        detached: process.platform !== "win32",
        stdio: "pipe",
      });
    } catch (error) {
      return {
        ok: false,
        error: {
          reason: "process-start-failed",
          message: error instanceof Error ? error.message : "Failed to start process.",
          instance: {
            ...startingInstance,
            status: "unhealthy",
            failureReason: "process-start-failed",
          },
        },
      };
    }

    const running: RunningServer = {
      child,
      config,
      instance: {
        ...startingInstance,
        ...(child.pid === undefined ? {} : { pid: child.pid }),
      },
      stdout: [],
      stderr: [],
    };
    this.runningServers.set(instanceId, running);

    child.stdout.on("data", (chunk: Buffer | string) => {
      running.stdout.push(String(chunk));
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      running.stderr.push(String(chunk));
    });
    child.once("exit", () => {
      if (running.instance.status !== "stopping" && running.instance.status !== "stopped") {
        running.instance = {
          ...running.instance,
          status: "crashed",
          failureReason: "process-crashed",
        };
      }
    });

    const healthResult = await this.waitForHealthy(running, baseUrl);
    if (!healthResult.ok) {
      await this.stopServer(instanceId, "stopped-by-workflow");
      return {
        ok: false,
        error: {
          reason: healthResult.reason,
          message: healthResult.message,
          instance: running.instance,
        },
      };
    }

    const checkedAt = new Date().toISOString();
    running.instance = {
      ...running.instance,
      status: "healthy",
      lastHealthCheckAt: checkedAt,
    };

    return {
      ok: true,
      ready: {
        instance: running.instance,
        baseUrl,
        healthEvidenceRef: artifactId("health", instanceId),
        logsEvidenceRef: logStreamRef,
      },
    };
  }

  async stopServer(
    instanceId: DevServerInstanceId | string,
    reason: DevServerStopReason = "stopped-by-user",
  ): Promise<DevServerInstance | null> {
    const key = String(instanceId);
    const running = this.runningServers.get(key);
    if (!running) return null;

    running.instance = {
      ...running.instance,
      status: "stopping",
      failureReason: reason,
    };
    await killProcessTree(running.child);
    running.instance = {
      ...running.instance,
      status: "stopped",
      failureReason: reason,
    };
    this.runningServers.delete(key);
    return running.instance;
  }

  async restartServer(sessionId: string, instanceId: DevServerInstanceId | string) {
    const running = this.runningServers.get(String(instanceId));
    if (!running) return null;
    const config = running.config;
    await this.stopServer(instanceId, "stopped-by-workflow");
    return this.startServer(sessionId, config);
  }

  getStatus(instanceId: DevServerInstanceId | string): DevServerInstance | null {
    return this.runningServers.get(String(instanceId))?.instance ?? null;
  }

  getLogs(instanceId: DevServerInstanceId | string): { stdout: string; stderr: string } | null {
    const running = this.runningServers.get(String(instanceId));
    if (!running) return null;
    return {
      stdout: running.stdout.join(""),
      stderr: running.stderr.join(""),
    };
  }

  createPreviewTarget(input: {
    readonly sessionId: string;
    readonly ready: DevServerReady;
    readonly config: LaunchConfig;
    readonly allowedOrigins?: readonly string[];
    readonly deniedOrigins?: readonly string[];
    readonly viewports?: readonly PreviewViewport[];
  }): PreviewTarget {
    const baseUrl = input.ready.baseUrl;
    const initialRoute = input.config.defaultRoute ?? DEFAULT_ROUTE;
    const canonicalUrl = new URL(initialRoute, baseUrl).toString();
    const allowedOrigins = [...(input.allowedOrigins ?? [new URL(baseUrl).origin])];
    const deniedOrigins = [...(input.deniedOrigins ?? [])];
    const viewports = [...(input.viewports ?? DEFAULT_VIEWPORTS)];
    const signature = stableHash({
      baseUrl,
      initialRoute,
      canonicalUrl,
      allowedOrigins,
      deniedOrigins,
      viewports,
    });
    const key = `${input.sessionId}:${input.config.id}`;
    const previous = this.previewTargetsByKey.get(key);
    if (previous?.signature === signature) {
      return previous.target;
    }

    const nextVersion = previous ? previous.target.version + 1 : 1;
    const target: PreviewTarget = {
      id: PreviewTargetId.makeUnsafe(`preview-target-${randomUUID()}`),
      version: nextVersion,
      sessionId: input.sessionId,
      kind: "local-dev-server",
      canonicalUrl,
      baseUrl,
      initialRoute,
      devServerInstanceId: input.ready.instance.id,
      launchConfigId: input.config.id,
      allowedOrigins,
      deniedOrigins,
      authMode: "none",
      permissionTier: "isolated-local-preview",
      viewports,
      readinessEvidenceRef: input.ready.healthEvidenceRef,
      serverLogRefs: [input.ready.logsEvidenceRef],
      createdAt: new Date().toISOString(),
      supersedesPreviewTargetId: previous?.target.id,
    };

    this.previewTargetsByKey.set(key, { signature, target });
    return target;
  }

  async makeTemporaryArtifactDir() {
    return mkdtemp(Path.join(tmpdir(), "orchestrate-preview-artifacts-"));
  }

  private async resolvePort(config: LaunchConfig): Promise<number | null> {
    if (config.port !== undefined && (await isPortAvailable(config.port))) {
      return config.port;
    }
    if (config.port !== undefined && config.autoPort !== true) {
      return null;
    }
    return reserveAvailablePort();
  }

  private async waitForHealthy(
    running: RunningServer,
    baseUrl: string,
  ): Promise<
    | { readonly ok: true }
    | {
        readonly ok: false;
        readonly reason: "readiness-timeout" | "health-check-failed";
        readonly message: string;
      }
  > {
    const config = running.config;
    const healthCheck = config.healthCheck;
    const timeoutMs =
      healthCheck?.timeoutMs ?? config.readiness?.timeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS;
    const expected = normalizeExpectedStatus(healthCheck?.expectedStatus);
    const healthUrl =
      healthCheck?.url ?? new URL(healthCheck?.path ?? DEFAULT_ROUTE, baseUrl).toString();
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      if (running.instance.status === "crashed") {
        return {
          ok: false,
          reason: "health-check-failed",
          message: "Dev server process exited before health check passed.",
        };
      }

      try {
        const response = await fetch(healthUrl, { method: "GET" });
        if (expected.has(response.status)) {
          return { ok: true };
        }
      } catch {
        // Retry until timeout.
      }

      await delay(100);
    }

    return {
      ok: false,
      reason: config.readiness ? "readiness-timeout" : "health-check-failed",
      message: `Timed out waiting for healthy preview at ${healthUrl}.`,
    };
  }
}

function normalizeExpectedStatus(
  expected: NonNullable<LaunchConfig["healthCheck"]>["expectedStatus"],
): Set<number> {
  if (expected === undefined) return new Set([200]);
  if (typeof expected === "number") return new Set([expected]);
  return new Set(expected);
}

async function reserveAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === "object" && address !== null) {
          resolve(address.port);
          return;
        }
        reject(new Error("Failed to reserve a port."));
      });
    });
    server.once("error", reject);
  });
}

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

async function killProcessTree(child: ChildProcessWithoutNullStreams): Promise<void> {
  const pid = child.pid;
  if (pid === undefined) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      return;
    }
  }

  await delay(250);
  if (child.exitCode === null && child.signalCode === null) {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

function artifactId(kind: string, id: string): EvidenceArtifactId {
  return EvidenceArtifactId.makeUnsafe(`${kind}-${id}`);
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { BROWSER_ORCHESTRATION_SCHEMA_VERSION };
