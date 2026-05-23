import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import Path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import {
  BROWSER_ORCHESTRATION_SCHEMA_VERSION,
  BrowserSessionId,
  EvidenceArtifactId,
  type BrowserObservation,
  type EvidenceArtifactId as EvidenceArtifactIdType,
} from "@orchestrate/contracts";
import { Effect, Layer } from "effect";

import { BrowserRuntimeService } from "../../browserRuntime/Services/BrowserRuntimeService.ts";
import { BrowserOrchestrationEvidenceRepositoryLive } from "../../persistence/Layers/BrowserOrchestrationEvidence.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { BrowserWorkflowManager } from "../Services/BrowserWorkflowManager.ts";
import { ServerConfig } from "../../config.ts";
import { PreviewServiceLive } from "../../preview/Layers/PreviewService.ts";
import { PreviewService } from "../../preview/Services/PreviewService.ts";
import { BrowserOrchestrationEvidenceRepository } from "../../persistence/Services/BrowserOrchestrationEvidence.ts";
import { BrowserWorkflowManagerLive } from "./BrowserWorkflowManager.ts";

const SERVER_SCRIPT = `
const http = require("node:http");
const port = Number(process.env.PORT);
const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end("<main>workflow preview ready</main>");
});
server.listen(port, "127.0.0.1", () => {
  console.log("workflow preview ready " + port);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
`;

async function makeRepoFixture() {
  const repoRoot = await mkdtemp(Path.join(tmpdir(), "orchestrate-workflow-preview-"));
  await mkdir(Path.join(repoRoot, ".orchestrate"), { recursive: true });
  await writeFile(Path.join(repoRoot, "package.json"), JSON.stringify({ scripts: {} }));
  await writeFile(
    Path.join(repoRoot, ".orchestrate", "launch.json"),
    JSON.stringify({
      version: "1.0",
      configurations: [
        {
          id: "workflow-preview",
          name: "Workflow preview",
          cwd: ".",
          runtimeExecutable: "node",
          runtimeArgs: ["-e", SERVER_SCRIPT],
          autoPort: true,
          defaultRoute: "/",
          healthCheck: { path: "/", timeoutMs: 5_000, expectedStatus: 200 },
        },
      ],
    }),
  );
  return repoRoot;
}

function makeObservation(url: string, sessionId: BrowserSessionId): BrowserObservation {
  const screenshotRef = EvidenceArtifactId.makeUnsafe("workflow-integration-screenshot");
  return {
    sessionId,
    url,
    title: "Workflow preview",
    readyState: "complete",
    textSummary: "workflow preview ready",
    screenshotDataUrl: "data:image/png;base64,workflowintegration",
    screenshotArtifactRef: screenshotRef,
    evidenceRefs: [screenshotRef],
    consoleErrors: [],
    networkErrors: [],
    targets: [],
    runtimeKind: "playwright-headless",
    surfaceMode: "headless-validation-mirror",
    isUserVisibleSurface: false,
    runtimeTruth: {
      runtimeKind: "playwright-headless",
      surfaceMode: "headless-validation-mirror",
      isUserVisibleSurface: false,
      browserSessionId: sessionId,
      screenshotArtifactRef: screenshotRef,
      evidenceRefs: [screenshotRef],
      observedUrl: url,
      urlAgreement: "unknown",
    },
    observedAt: "2026-04-28T00:00:00.000Z",
  };
}

function makeBrowserRuntimeLayer() {
  const sessionId = BrowserSessionId.makeUnsafe("workflow-integration-browser-session");
  return Layer.succeed(BrowserRuntimeService, {
    openSession: (input) =>
      Effect.succeed({
        sessionId,
        observation: makeObservation(input.url, sessionId),
        runtimeTruth: makeObservation(input.url, sessionId).runtimeTruth,
        evidenceRefs: [EvidenceArtifactId.makeUnsafe("workflow-integration-open")],
      }),
    act: (input) => {
      const url = input.action.kind === "navigate" ? input.action.url : "http://127.0.0.1/";
      return Effect.succeed({
        observation: makeObservation(url, input.sessionId),
        runtimeTruth: makeObservation(url, input.sessionId).runtimeTruth,
        evidenceRefs: [EvidenceArtifactId.makeUnsafe(`workflow-integration-${input.action.kind}`)],
      });
    },
    closeSession: () => Effect.void,
  });
}

function seedScreenshotArtifact(artifactId: EvidenceArtifactIdType) {
  return Effect.gen(function* () {
    const repository = yield* BrowserOrchestrationEvidenceRepository;
    yield* repository.writeEvidenceArtifact({
      artifactId,
      schemaVersion: BROWSER_ORCHESTRATION_SCHEMA_VERSION,
      kind: "browser-screenshot",
      sha256: "fixture",
      byteSize: 7,
      contentType: "image/png",
      storageUri: `sqlite://evidence_artifact_contents/${artifactId}`,
      sensitivity: "workspace-internal",
      access: "safe-for-user-report",
      redactedArtifactId: null,
      supersededByArtifactId: null,
      metadataJson: null,
      createdAt: "2026-04-28T00:00:00.000Z",
    });
    yield* repository.writeEvidenceArtifactContent({
      artifactId,
      contentText: "fixture",
      createdAt: "2026-04-28T00:00:00.000Z",
    });
  });
}

async function makeLayer(repoRoot: string) {
  const evidenceRepositoryLayer = BrowserOrchestrationEvidenceRepositoryLive.pipe(
    Layer.provide(SqlitePersistenceMemory),
  );
  return Layer.mergeAll(
    PreviewServiceLive.pipe(
      Layer.provide(evidenceRepositoryLayer),
      Layer.provide(ServerConfig.layerTest(repoRoot, { prefix: "orchestrate-workflow-preview" })),
    ),
    BrowserWorkflowManagerLive.pipe(
      Layer.provide(makeBrowserRuntimeLayer()),
      Layer.provide(evidenceRepositoryLayer),
    ),
    evidenceRepositoryLayer,
  ).pipe(Layer.provide(NodeServices.layer));
}

it.effect("starts preview, runs a browser workflow, captures evidence, and stops preview", () =>
  Effect.gen(function* () {
    const repoRoot = yield* Effect.promise(makeRepoFixture);
    const layer = yield* Effect.promise(() => makeLayer(repoRoot));

    yield* Effect.gen(function* () {
      const preview = yield* PreviewService;
      const workflows = yield* BrowserWorkflowManager;
      yield* seedScreenshotArtifact(
        EvidenceArtifactId.makeUnsafe("workflow-integration-screenshot"),
      );

      const started = yield* preview.start({ sessionId: "workflow-integration-session" });
      assert.strictEqual(started.status, "started");
      assert.ok(started.instance);
      assert.ok(started.previewTarget);

      const result = yield* workflows.start({
        sessionId: "workflow-integration-session",
        previewTarget: started.previewTarget,
        assertions: [
          { id: "text", type: "text-visible", text: "workflow preview ready" },
          { id: "screenshot", type: "screenshot-captured" },
        ],
      });
      assert.strictEqual(result.workflow.status, "completed");
      assert.ok(result.workflow.screenshotArtifactRefs?.length);

      const stopped = yield* preview.stop({
        instanceId: started.instance.id,
        reason: "stopped-by-workflow",
      });
      assert.strictEqual(stopped.instance?.status, "stopped");
    }).pipe(Effect.provide(layer));
  }),
);
