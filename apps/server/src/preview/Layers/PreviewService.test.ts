import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import Path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";

import { ServerConfig } from "../../config.ts";
import { BrowserOrchestrationEvidenceRepositoryLive } from "../../persistence/Layers/BrowserOrchestrationEvidence.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { BrowserOrchestrationEvidenceRepository } from "../../persistence/Services/BrowserOrchestrationEvidence.ts";
import { PreviewService } from "../Services/PreviewService.ts";
import { PreviewServiceLive } from "./PreviewService.ts";

const SERVER_SCRIPT = `
const http = require("node:http");
const port = Number(process.env.PORT);
const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("preview-ok");
});
server.listen(port, "127.0.0.1", () => {
  console.log("preview ready " + port);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
`;

async function makeRepoFixture() {
  const repoRoot = await mkdtemp(Path.join(tmpdir(), "orchestrate-preview-service-"));
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
          id: "fixture-preview",
          name: "Fixture preview",
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

async function makeLayer(repoRoot: string) {
  const evidenceRepositoryLayer = BrowserOrchestrationEvidenceRepositoryLive.pipe(
    Layer.provide(SqlitePersistenceMemory),
  );
  return Layer.mergeAll(
    PreviewServiceLive.pipe(
      Layer.provide(evidenceRepositoryLayer),
      Layer.provide(ServerConfig.layerTest(repoRoot, { prefix: "orchestrate-preview-service" })),
    ),
    evidenceRepositoryLayer,
  ).pipe(Layer.provide(NodeServices.layer));
}

it.effect("PreviewService starts a dev server and creates an evidence-backed target", () =>
  Effect.gen(function* () {
    const repoRoot = yield* Effect.promise(makeRepoFixture);
    const layer = yield* Effect.promise(() => makeLayer(repoRoot));
    yield* Effect.gen(function* () {
      const preview = yield* PreviewService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;

      const detected = yield* preview.detect({ sessionId: "preview-service-session" });
      assert.strictEqual(detected.status, "detected");
      assert.ok(detected.configs.length > 0);

      const started = yield* preview.start({ sessionId: "preview-service-session" });
      assert.strictEqual(started.status, "started");
      assert.ok(started.instance);
      assert.ok(started.previewTarget);
      assert.strictEqual(started.previewTarget.kind, "local-dev-server");
      assert.strictEqual(started.previewTarget.devServerInstanceId, started.instance.id);
      assert.ok(started.previewTarget.readinessEvidenceRef);
      assert.ok(started.previewTarget.serverLogRefs.length > 0);

      const readinessArtifact = yield* repository.getEvidenceArtifact({
        artifactId: started.previewTarget.readinessEvidenceRef,
      });
      assert.ok(Option.isSome(readinessArtifact));
      assert.strictEqual(Option.getOrThrow(readinessArtifact).kind, "dev-server-health-check");

      const listed = yield* preview.listTargets({ sessionId: "preview-service-session" });
      assert.ok(listed.targets.some((target) => target.id === started.previewTarget!.id));

      const status = yield* preview.status({ instanceId: started.instance.id });
      assert.strictEqual(status.instance?.status, "healthy");
      assert.strictEqual(status.previewTarget?.id, started.previewTarget.id);

      const logs = yield* preview.logs({ instanceId: started.instance.id });
      assert.match(logs.stdout, /preview ready/);
      assert.ok(logs.logRefs.length >= 2);

      const stopped = yield* preview.stop({
        instanceId: started.instance.id,
        reason: "stopped-by-workflow",
      });
      assert.strictEqual(stopped.instance?.status, "stopped");
    }).pipe(Effect.provide(layer));
  }),
);
