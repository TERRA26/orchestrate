import { assert, it } from "@effect/vitest";
import {
  BROWSER_ORCHESTRATION_SCHEMA_VERSION,
  BrowserSessionId,
  EvidenceArtifactId,
  PreviewTargetId,
  type BrowserObservation,
  type PreviewTarget,
} from "@orchestrate/contracts";
import { Effect, Layer } from "effect";

import { BrowserRuntimeService } from "../../browserRuntime/Services/BrowserRuntimeService.ts";
import { BrowserWorkflowManager } from "../../browserWorkflow/Services/BrowserWorkflowManager.ts";
import { BrowserWorkflowManagerLive } from "../../browserWorkflow/Layers/BrowserWorkflowManager.ts";
import { BrowserOrchestrationEvidenceRepositoryLive } from "../../persistence/Layers/BrowserOrchestrationEvidence.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import {
  BrowserOrchestrationEvidenceRepository,
  type BrowserOrchestrationEvidenceRepositoryShape,
} from "../../persistence/Services/BrowserOrchestrationEvidence.ts";
import { ReviewerDecisionService } from "../Services/ReviewerDecisionService.ts";
import { ReviewerDecisionServiceLive } from "./ReviewerDecisionService.ts";

const previewTarget: PreviewTarget = {
  id: PreviewTargetId.makeUnsafe("preview-target-reviewer"),
  version: 1,
  sessionId: "reviewer-session",
  kind: "local-dev-server",
  canonicalUrl: "http://127.0.0.1:5173/",
  baseUrl: "http://127.0.0.1:5173/",
  initialRoute: "/",
  allowedOrigins: ["http://127.0.0.1:5173"],
  deniedOrigins: [],
  authMode: "none",
  permissionTier: "isolated-local-preview",
  viewports: [
    {
      id: "desktop",
      label: "Desktop",
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
    },
  ],
  readinessEvidenceRef: EvidenceArtifactId.makeUnsafe("health-reviewer"),
  serverLogRefs: [EvidenceArtifactId.makeUnsafe("server-log-reviewer")],
  createdAt: "2026-04-28T00:00:00.000Z",
};

function seedArtifact(
  repository: BrowserOrchestrationEvidenceRepositoryShape,
  artifactId: EvidenceArtifactId,
  kind = "browser-screenshot" as const,
) {
  return Effect.gen(function* () {
    yield* repository.writeEvidenceArtifact({
      artifactId,
      schemaVersion: BROWSER_ORCHESTRATION_SCHEMA_VERSION,
      kind,
      sha256: "fixture",
      byteSize: 7,
      contentType: "application/json",
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

function makeObservation(input: {
  readonly sessionId?: BrowserSessionId;
  readonly url?: string;
  readonly consoleError?: boolean;
  readonly screenshotRef?: EvidenceArtifactId;
}): BrowserObservation {
  const sessionId = input.sessionId ?? BrowserSessionId.makeUnsafe("browser-session-reviewer");
  const screenshotRef = input.screenshotRef ?? EvidenceArtifactId.makeUnsafe("screenshot-reviewer");
  return {
    sessionId,
    url: input.url ?? "http://127.0.0.1:5173/",
    title: "Reviewer fixture",
    readyState: "complete",
    textSummary: "Reviewer fixture page",
    screenshotDataUrl: "data:image/png;base64,reviewer",
    screenshotArtifactRef: screenshotRef,
    evidenceRefs: [screenshotRef],
    consoleErrors: input.consoleError ? [{ level: "error", text: "boom" }] : [],
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
      previewTargetId: previewTarget.id,
      screenshotArtifactRef: screenshotRef,
      evidenceRefs: [screenshotRef],
      observedUrl: input.url ?? "http://127.0.0.1:5173/",
      urlAgreement: "unknown",
    },
    observedAt: "2026-04-28T00:00:00.000Z",
  };
}

function makeBrowserRuntimeLayer(options: { readonly consoleError?: boolean } = {}) {
  const sessionId = BrowserSessionId.makeUnsafe("browser-session-reviewer");
  return Layer.succeed(BrowserRuntimeService, {
    openSession: () =>
      Effect.succeed({
        sessionId,
        observation: makeObservation({ sessionId }),
        runtimeTruth: makeObservation({ sessionId }).runtimeTruth,
        evidenceRefs: [EvidenceArtifactId.makeUnsafe("open-evidence-reviewer")],
      }),
    act: (input) =>
      Effect.succeed({
        observation: makeObservation({
          sessionId: input.sessionId,
          url: input.action.kind === "navigate" ? input.action.url : "http://127.0.0.1:5173/",
          consoleError: options.consoleError,
          screenshotRef: EvidenceArtifactId.makeUnsafe(`screenshot-reviewer-${input.action.kind}`),
        }),
        runtimeTruth: makeObservation({ sessionId: input.sessionId }).runtimeTruth,
        evidenceRefs: [EvidenceArtifactId.makeUnsafe(`evidence-reviewer-${input.action.kind}`)],
      }),
    closeSession: () => Effect.void,
  });
}

function makeLayer(options: { readonly consoleError?: boolean } = {}) {
  const evidenceRepositoryLayer = BrowserOrchestrationEvidenceRepositoryLive.pipe(
    Layer.provide(SqlitePersistenceMemory),
  );
  const workflowLayer = BrowserWorkflowManagerLive.pipe(
    Layer.provide(makeBrowserRuntimeLayer(options)),
    Layer.provide(evidenceRepositoryLayer),
  );
  return it.layer(
    Layer.mergeAll(
      ReviewerDecisionServiceLive.pipe(
        Layer.provideMerge(workflowLayer),
        Layer.provide(evidenceRepositoryLayer),
      ),
      evidenceRepositoryLayer,
    ),
  );
}

makeLayer()("ReviewerDecisionServiceLive accepted path", (it) => {
  it.effect("creates an evidence bundle and accepted reviewer decision from a workflow", () =>
    Effect.gen(function* () {
      const workflows = yield* BrowserWorkflowManager;
      const reviewer = yield* ReviewerDecisionService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;
      yield* seedArtifact(
        repository,
        EvidenceArtifactId.makeUnsafe("screenshot-reviewer-navigate"),
      );

      const workflowResult = yield* workflows.start({
        sessionId: "reviewer-session",
        previewTarget,
        assertions: [
          { id: "screenshot", type: "screenshot-captured" },
          { id: "console", type: "no-console-errors" },
        ],
      });
      const bundleResult = yield* reviewer.createEvidenceBundle({
        workflowRunId: workflowResult.workflow.id,
      });
      const decisionResult = yield* reviewer.createDecision({
        evidenceBundleId: bundleResult.evidenceBundle.id,
      });

      assert.strictEqual(decisionResult.decision.outcome, "accepted");
      assert.ok(decisionResult.decision.gates?.some((gate) => gate.name === "assertions-passed"));
      assert.ok(decisionResult.decision.userVisibleSummaryRef);

      const fetched = yield* reviewer.getDecision({ decisionId: decisionResult.decision.id });
      assert.strictEqual(fetched.decision?.id, decisionResult.decision.id);
    }),
  );
});

makeLayer({ consoleError: true })("ReviewerDecisionServiceLive rework path", (it) => {
  it.effect("creates rework-required decisions with findings for failed assertions", () =>
    Effect.gen(function* () {
      const workflows = yield* BrowserWorkflowManager;
      const reviewer = yield* ReviewerDecisionService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;
      yield* seedArtifact(
        repository,
        EvidenceArtifactId.makeUnsafe("screenshot-reviewer-navigate"),
      );

      const workflowResult = yield* workflows.start({
        sessionId: "reviewer-session",
        previewTarget,
        assertions: [
          { id: "screenshot", type: "screenshot-captured" },
          { id: "console", type: "no-console-errors" },
        ],
      });
      const bundleResult = yield* reviewer.createEvidenceBundle({
        workflowRunId: workflowResult.workflow.id,
      });
      const decisionResult = yield* reviewer.createDecision({
        evidenceBundleId: bundleResult.evidenceBundle.id,
      });

      assert.strictEqual(decisionResult.decision.outcome, "rework-required");
      assert.ok(decisionResult.decision.findings.length > 0);
      assert.ok(decisionResult.decision.reworkPacket);
      assert.ok(
        decisionResult.decision.gates?.some(
          (gate) => gate.name === "no-console-errors" && gate.status === "fail",
        ),
      );
    }),
  );
});
