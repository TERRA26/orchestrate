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
import { Effect, Layer, Option } from "effect";

import { BrowserRuntimeService } from "../browserRuntime/Services/BrowserRuntimeService.ts";
import { BrowserWorkflowManagerLive } from "../browserWorkflow/Layers/BrowserWorkflowManager.ts";
import { BrowserWorkflowManager } from "../browserWorkflow/Services/BrowserWorkflowManager.ts";
import { ServerConfig } from "../config.ts";
import { BrowserAnnotationRepositoryLive } from "../persistence/Layers/BrowserAnnotations.ts";
import { BrowserOrchestrationEvidenceRepositoryLive } from "../persistence/Layers/BrowserOrchestrationEvidence.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { BrowserOrchestrationEvidenceRepository } from "../persistence/Services/BrowserOrchestrationEvidence.ts";
import { PreviewServiceLive } from "../preview/Layers/PreviewService.ts";
import { PreviewService } from "../preview/Services/PreviewService.ts";
import { ReviewerDecisionServiceLive } from "./Layers/ReviewerDecisionService.ts";
import { ReviewerDecisionService } from "./Services/ReviewerDecisionService.ts";

const SERVER_SCRIPT = `
const http = require("node:http");
const port = Number(process.env.PORT);
const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end("<main>reviewer loop ready</main>");
});
server.listen(port, "127.0.0.1", () => {
  console.log("reviewer loop ready " + port);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
`;

async function makeRepoFixture() {
  const repoRoot = await mkdtemp(Path.join(tmpdir(), "orchestrate-reviewer-loop-"));
  await mkdir(Path.join(repoRoot, ".orchestrate"), { recursive: true });
  await writeFile(Path.join(repoRoot, "package.json"), JSON.stringify({ scripts: {} }));
  await writeFile(
    Path.join(repoRoot, ".orchestrate", "launch.json"),
    JSON.stringify({
      version: "1.0",
      configurations: [
        {
          id: "reviewer-loop",
          name: "Reviewer loop",
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

function makeObservation(
  url: string,
  sessionId: BrowserSessionId,
  runtimeKind: "playwright-headless" | "electron-visible" = "playwright-headless",
): BrowserObservation {
  const screenshotRef = EvidenceArtifactId.makeUnsafe("reviewer-loop-screenshot");
  const surfaceMode =
    runtimeKind === "electron-visible" ? "live-shared-browser" : "headless-validation-mirror";
  const isUserVisibleSurface = runtimeKind === "electron-visible";
  return {
    sessionId,
    url,
    title: "Reviewer loop",
    readyState: "complete",
    textSummary: "reviewer loop ready",
    screenshotDataUrl: "data:image/png;base64,reviewerloop",
    screenshotArtifactRef: screenshotRef,
    evidenceRefs: [screenshotRef],
    consoleErrors: [],
    networkErrors: [],
    targets: [],
    runtimeKind,
    surfaceMode,
    isUserVisibleSurface,
    ...(runtimeKind === "electron-visible" ? { visiblePanelUrl: url, urlAgreement: "same" } : {}),
    runtimeTruth: {
      runtimeKind,
      surfaceMode,
      isUserVisibleSurface,
      browserSessionId: sessionId,
      screenshotArtifactRef: screenshotRef,
      evidenceRefs: [screenshotRef],
      observedUrl: url,
      ...(runtimeKind === "electron-visible"
        ? { visiblePanelUrl: url, urlAgreement: "same" }
        : { urlAgreement: "unknown" }),
    },
    observedAt: "2026-04-28T00:00:00.000Z",
  };
}

function makeBrowserRuntimeLayer(
  runtimeKind: "playwright-headless" | "electron-visible" = "playwright-headless",
) {
  const sessionId = BrowserSessionId.makeUnsafe("reviewer-loop-browser-session");
  return Layer.succeed(BrowserRuntimeService, {
    openSession: (input) =>
      Effect.succeed({
        sessionId,
        observation: makeObservation(input.url, sessionId, runtimeKind),
        runtimeTruth: makeObservation(input.url, sessionId, runtimeKind).runtimeTruth,
        evidenceRefs: [EvidenceArtifactId.makeUnsafe("reviewer-loop-open")],
      }),
    act: (input) => {
      const url = input.action.kind === "navigate" ? input.action.url : "http://127.0.0.1/";
      return Effect.succeed({
        observation: makeObservation(url, input.sessionId, runtimeKind),
        runtimeTruth: makeObservation(url, input.sessionId, runtimeKind).runtimeTruth,
        evidenceRefs: [EvidenceArtifactId.makeUnsafe(`reviewer-loop-${input.action.kind}`)],
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

async function makeLayer(
  repoRoot: string,
  runtimeKind: "playwright-headless" | "electron-visible" = "playwright-headless",
) {
  const evidenceRepositoryLayer = BrowserOrchestrationEvidenceRepositoryLive.pipe(
    Layer.provide(SqlitePersistenceMemory),
  );
  const annotationRepositoryLayer = BrowserAnnotationRepositoryLive.pipe(
    Layer.provide(SqlitePersistenceMemory),
  );
  const workflowLayer = BrowserWorkflowManagerLive.pipe(
    Layer.provide(makeBrowserRuntimeLayer(runtimeKind)),
    Layer.provide(evidenceRepositoryLayer),
  );
  return Layer.mergeAll(
    PreviewServiceLive.pipe(
      Layer.provide(evidenceRepositoryLayer),
      Layer.provide(ServerConfig.layerTest(repoRoot, { prefix: "orchestrate-reviewer-loop" })),
    ),
    ReviewerDecisionServiceLive.pipe(
      Layer.provideMerge(workflowLayer),
      Layer.provide(annotationRepositoryLayer),
      Layer.provide(evidenceRepositoryLayer),
    ),
    workflowLayer,
    evidenceRepositoryLayer,
    annotationRepositoryLayer,
  ).pipe(Layer.provide(NodeServices.layer));
}

it.effect(
  "runs preview, browser workflow, evidence bundle, reviewer decision, and summary artifact",
  () =>
    Effect.gen(function* () {
      const repoRoot = yield* Effect.promise(makeRepoFixture);
      const layer = yield* Effect.promise(() => makeLayer(repoRoot));

      yield* Effect.gen(function* () {
        const preview = yield* PreviewService;
        const workflows = yield* BrowserWorkflowManager;
        const reviewer = yield* ReviewerDecisionService;
        const repository = yield* BrowserOrchestrationEvidenceRepository;

        yield* seedScreenshotArtifact(EvidenceArtifactId.makeUnsafe("reviewer-loop-screenshot"));

        const started = yield* preview.start({ sessionId: "reviewer-loop-session" });
        assert.strictEqual(started.status, "started");
        assert.ok(started.instance);
        assert.ok(started.previewTarget);

        const workflowResult = yield* workflows.start({
          sessionId: "reviewer-loop-session",
          previewTarget: started.previewTarget,
          purpose: "initial-preview",
          assertions: [
            { id: "text", type: "text-visible", text: "reviewer loop ready" },
            { id: "screenshot", type: "screenshot-captured" },
          ],
        });
        assert.strictEqual(workflowResult.workflow.status, "completed");

        const bundleResult = yield* reviewer.createEvidenceBundle({
          workflowRunId: workflowResult.workflow.id,
        });
        assert.ok(bundleResult.evidenceBundle.browser?.screenshotArtifactRefs.length);
        assert.ok(bundleResult.evidenceBundle.workflow.assertionResultRefs.length);

        const decisionResult = yield* reviewer.createDecision({
          evidenceBundleId: bundleResult.evidenceBundle.id,
          workflowRunId: workflowResult.workflow.id,
        });
        assert.strictEqual(decisionResult.decision.outcome, "accepted");
        assert.strictEqual(decisionResult.decision.purpose, "browser-smoke");
        assert.ok(decisionResult.decision.userVisibleSummaryRef);

        const summaryArtifact = yield* repository.getEvidenceArtifactContent({
          artifactId: decisionResult.decision.userVisibleSummaryRef,
        });
        assert.ok(Option.isSome(summaryArtifact));
        const summary = JSON.parse(summaryArtifact.value.contentText);
        assert.strictEqual(summary.decisionId, decisionResult.decision.id);
        assert.strictEqual(summary.evidence.evidenceBundleId, bundleResult.evidenceBundle.id);

        const listed = yield* reviewer.listDecisions({ sessionId: "reviewer-loop-session" });
        assert.strictEqual(listed.decisions.length, 1);
        assert.strictEqual(listed.decisions[0]?.id, decisionResult.decision.id);

        const stopped = yield* preview.stop({
          instanceId: started.instance.id,
          reason: "stopped-by-reviewer-loop",
        });
        assert.strictEqual(stopped.instance?.status, "stopped");
      }).pipe(Effect.provide(layer));
    }),
);

it.effect("runs an electron-visible observe-only workflow into a reviewer decision", () =>
  Effect.gen(function* () {
    const repoRoot = yield* Effect.promise(makeRepoFixture);
    const layer = yield* Effect.promise(() => makeLayer(repoRoot, "electron-visible"));

    yield* Effect.gen(function* () {
      const preview = yield* PreviewService;
      const workflows = yield* BrowserWorkflowManager;
      const reviewer = yield* ReviewerDecisionService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;

      yield* seedScreenshotArtifact(EvidenceArtifactId.makeUnsafe("reviewer-loop-screenshot"));

      const started = yield* preview.start({ sessionId: "reviewer-loop-electron-session" });
      assert.ok(started.previewTarget);

      const workflowResult = yield* workflows.start({
        sessionId: "reviewer-loop-electron-session",
        previewTarget: started.previewTarget,
        preferredRuntimeKind: "electron-visible",
        controlMode: "observe-only-current-page",
        purpose: "initial-preview",
        routePlan: [
          { route: "/", label: "current route" },
          { route: "/settings", label: "unobserved route" },
        ],
        assertions: [
          { id: "text", type: "text-visible", text: "reviewer loop ready" },
          { id: "screenshot", type: "screenshot-captured" },
        ],
      });

      assert.strictEqual(workflowResult.workflow.status, "completed");
      assert.strictEqual(workflowResult.workflow.routes.length, 1);
      assert.strictEqual(workflowResult.workflow.assertionResults?.at(-1)?.status, "pass");
      assert.strictEqual(
        workflowResult.workflow.assertionResults?.[0]?.evidenceRefs.some((ref) =>
          ref.includes("reviewer-loop-open"),
        ),
        true,
      );

      const bundleResult = yield* reviewer.createEvidenceBundle({
        workflowRunId: workflowResult.workflow.id,
      });
      assert.ok(bundleResult.evidenceBundle.browser?.screenshotArtifactRefs.length);

      const decisionResult = yield* reviewer.createDecision({
        evidenceBundleId: bundleResult.evidenceBundle.id,
        workflowRunId: workflowResult.workflow.id,
      });
      assert.ok(["accepted", "accepted-with-notes"].includes(decisionResult.decision.outcome));
      assert.ok(decisionResult.decision.userVisibleSummaryRef);

      const summaryArtifact = yield* repository.getEvidenceArtifactContent({
        artifactId: decisionResult.decision.userVisibleSummaryRef,
      });
      assert.ok(Option.isSome(summaryArtifact));

      const stopped = yield* preview.stop({
        instanceId: started.instance!.id,
        reason: "stopped-by-electron-reviewer-loop",
      });
      assert.strictEqual(stopped.instance?.status, "stopped");
    }).pipe(Effect.provide(layer));
  }),
);
