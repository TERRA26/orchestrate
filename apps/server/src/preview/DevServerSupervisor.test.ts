import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import Path from "node:path";
import { createServer } from "node:net";

import { LaunchConfigId } from "@orchestrate/contracts";
import { describe, expect, it } from "vitest";

import { DevServerSupervisor } from "./DevServerSupervisor";

const SERVER_SCRIPT = `
const http = require("node:http");
const port = Number(process.env.PORT);
const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("ok");
});
server.listen(port, "127.0.0.1", () => {
  console.log("ready " + port);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
`;

async function makeRepoFixture() {
  const repoRoot = await mkdtemp(Path.join(tmpdir(), "orchestrate-dev-server-"));
  await mkdir(Path.join(repoRoot, ".orchestrate"), { recursive: true });
  await writeFile(
    Path.join(repoRoot, "package.json"),
    JSON.stringify({ scripts: { "dev:web": "vite --host 127.0.0.1" } }),
  );
  await writeFile(
    Path.join(repoRoot, ".orchestrate", "launch.json"),
    JSON.stringify({
      version: "1.0",
      configurations: [
        {
          id: "fixture",
          name: "Fixture",
          cwd: ".",
          runtimeExecutable: "node",
          runtimeArgs: ["-e", SERVER_SCRIPT],
          autoPort: true,
          defaultRoute: "/",
          healthCheck: { path: "/", timeoutMs: 5_000, expectedStatus: 200 },
          tags: ["fixture"],
        },
      ],
    }),
  );
  return repoRoot;
}

describe("DevServerSupervisor", () => {
  it("loads launch config and detects fallback configs", async () => {
    const repoRoot = await makeRepoFixture();
    const supervisor = new DevServerSupervisor(repoRoot);

    const configs = await supervisor.loadLaunchConfig();
    expect(configs).toHaveLength(1);
    expect(configs[0]?.id).toBe("fixture");

    const detected = await supervisor.detectLaunchConfigs();
    expect(detected[0]?.runtimeArgs).toEqual(["run", "dev:web"]);
  });

  it("starts, health-checks, exposes logs, and stops a dev server", async () => {
    const repoRoot = await makeRepoFixture();
    const supervisor = new DevServerSupervisor(repoRoot);
    const [config] = await supervisor.loadLaunchConfig();
    expect(config).toBeDefined();

    const result = await supervisor.startServer("session-1", config!);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.ready.instance.status).toBe("healthy");
    expect(result.ready.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    const logs = supervisor.getLogs(result.ready.instance.id);
    expect(logs?.stdout).toContain("ready");

    const stopped = await supervisor.stopServer(result.ready.instance.id, "stopped-by-workflow");
    expect(stopped?.status).toBe("stopped");
    expect(stopped?.failureReason).toBe("stopped-by-workflow");
  });

  it("uses a new immutable PreviewTarget version when target details change", async () => {
    const repoRoot = await makeRepoFixture();
    const supervisor = new DevServerSupervisor(repoRoot);
    const [config] = await supervisor.loadLaunchConfig();
    const result = await supervisor.startServer("session-immutable", config!);
    if (!result.ok) throw new Error(result.error.message);

    try {
      const first = supervisor.createPreviewTarget({
        sessionId: "session-immutable",
        ready: result.ready,
        config: config!,
      });
      const same = supervisor.createPreviewTarget({
        sessionId: "session-immutable",
        ready: result.ready,
        config: config!,
      });
      const changed = supervisor.createPreviewTarget({
        sessionId: "session-immutable",
        ready: result.ready,
        config: {
          ...config!,
          defaultRoute: "/changed",
        },
      });

      expect(same.id).toBe(first.id);
      expect(changed.id).not.toBe(first.id);
      expect(changed.version).toBe(2);
      expect(changed.supersedesPreviewTargetId).toBe(first.id);
      expect(changed.canonicalUrl).toContain("/changed");
    } finally {
      await supervisor.stopServer(result.ready.instance.id, "stopped-by-workflow");
    }
  });

  it("returns port-in-use when fixed ports are occupied and autoPort is disabled", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (typeof address !== "object" || address === null) {
      throw new Error("Failed to allocate occupied port fixture.");
    }

    const repoRoot = await makeRepoFixture();
    const supervisor = new DevServerSupervisor(repoRoot);
    const result = await supervisor.startServer("session-port", {
      id: LaunchConfigId.makeUnsafe("occupied"),
      name: "Occupied",
      cwd: ".",
      runtimeExecutable: "node",
      runtimeArgs: ["-e", SERVER_SCRIPT],
      port: address.port,
      autoPort: false,
      healthCheck: { path: "/", timeoutMs: 500 },
    });

    server.close();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected occupied port failure.");
    expect(result.error.reason).toBe("port-in-use");
  });
});
