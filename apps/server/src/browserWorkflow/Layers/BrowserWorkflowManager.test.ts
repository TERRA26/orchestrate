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
import { BrowserOrchestrationEvidenceRepositoryLive } from "../../persistence/Layers/BrowserOrchestrationEvidence.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import {
  BrowserOrchestrationEvidenceRepository,
  type BrowserOrchestrationEvidenceRepositoryShape,
} from "../../persistence/Services/BrowserOrchestrationEvidence.ts";
import { BrowserWorkflowManager } from "../Services/BrowserWorkflowManager.ts";
import { BrowserWorkflowManagerLive } from "./BrowserWorkflowManager.ts";

const previewTarget: PreviewTarget = {
  id: PreviewTargetId.makeUnsafe("preview-target-workflow"),
  version: 1,
  sessionId: "workflow-session",
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
  readinessEvidenceRef: EvidenceArtifactId.makeUnsafe("health-workflow"),
  serverLogRefs: [EvidenceArtifactId.makeUnsafe("server-log-workflow")],
  createdAt: "2026-04-28T00:00:00.000Z",
};

function seedScreenshotArtifact(
  repository: BrowserOrchestrationEvidenceRepositoryShape,
  artifactId: EvidenceArtifactId,
) {
  return Effect.gen(function* () {
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

function makeObservation(input: {
  readonly sessionId?: BrowserSessionId;
  readonly url?: string;
  readonly textSummary?: string;
  readonly consoleError?: boolean;
  readonly screenshotRef?: EvidenceArtifactId;
}): BrowserObservation {
  const sessionId = input.sessionId ?? BrowserSessionId.makeUnsafe("browser-session-workflow");
  const screenshotRef = input.screenshotRef ?? EvidenceArtifactId.makeUnsafe("screenshot-workflow");
  return {
    sessionId,
    url: input.url ?? "http://127.0.0.1:5173/",
    title: "Workflow fixture",
    readyState: "complete",
    textSummary: input.textSummary ?? "Workflow fixture page",
    screenshotDataUrl: "data:image/png;base64,workflow",
    screenshotArtifactRef: screenshotRef,
    evidenceRefs: [screenshotRef],
    consoleErrors: input.consoleError
      ? [
          {
            level: "error",
            text: "boom",
          },
        ]
      : [],
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

function makeBrowserRuntimeLayer(
  options: {
    readonly consoleError?: boolean;
    readonly runtimeKind?: "electron-visible" | "playwright-headless";
    readonly actCalls?: string[];
  } = {},
) {
  const sessionId = BrowserSessionId.makeUnsafe("browser-session-workflow");
  const runtimeKind = options.runtimeKind ?? "playwright-headless";
  const surfaceMode =
    runtimeKind === "electron-visible" ? "live-shared-browser" : "headless-validation-mirror";
  const isUserVisibleSurface = runtimeKind === "electron-visible";
  return Layer.succeed(BrowserRuntimeService, {
    openSession: () =>
      Effect.succeed({
        sessionId,
        observation: {
          ...makeObservation({ sessionId }),
          runtimeKind,
          surfaceMode,
          isUserVisibleSurface,
          runtimeTruth: {
            ...makeObservation({ sessionId }).runtimeTruth!,
            runtimeKind,
            surfaceMode,
            isUserVisibleSurface,
            visiblePanelUrl: "http://127.0.0.1:5173/",
            urlAgreement: "same",
          },
        },
        runtimeTruth: {
          ...makeObservation({ sessionId }).runtimeTruth!,
          runtimeKind,
          surfaceMode,
          isUserVisibleSurface,
          visiblePanelUrl: "http://127.0.0.1:5173/",
          urlAgreement: "same",
        },
        evidenceRefs: [EvidenceArtifactId.makeUnsafe("open-evidence-workflow")],
      }),
    act: (input) => {
      options.actCalls?.push(input.action.kind);
      return Effect.succeed({
        observation: makeObservation({
          sessionId: input.sessionId,
          url: input.action.kind === "navigate" ? input.action.url : "http://127.0.0.1:5173/",
          textSummary: "Workflow fixture page",
          consoleError: options.consoleError,
          screenshotRef: EvidenceArtifactId.makeUnsafe(`screenshot-${input.action.kind}`),
        }),
        runtimeTruth: makeObservation({ sessionId: input.sessionId }).runtimeTruth,
        evidenceRefs: [EvidenceArtifactId.makeUnsafe(`evidence-${input.action.kind}`)],
      });
    },
    closeSession: () => Effect.void,
  });
}

function makeLayer(
  options: {
    readonly consoleError?: boolean;
    readonly runtimeKind?: "electron-visible" | "playwright-headless";
    readonly actCalls?: string[];
  } = {},
) {
  const evidenceRepositoryLayer = BrowserOrchestrationEvidenceRepositoryLive.pipe(
    Layer.provide(SqlitePersistenceMemory),
  );
  return it.layer(
    Layer.mergeAll(
      BrowserWorkflowManagerLive.pipe(
        Layer.provide(makeBrowserRuntimeLayer(options)),
        Layer.provide(evidenceRepositoryLayer),
      ),
      evidenceRepositoryLayer,
    ),
  );
}

makeLayer()("BrowserWorkflowManagerLive", (it) => {
  it.effect("runs a PreviewTarget workflow and records durable assertion events", () =>
    Effect.gen(function* () {
      const workflows = yield* BrowserWorkflowManager;
      const repository = yield* BrowserOrchestrationEvidenceRepository;
      yield* seedScreenshotArtifact(
        repository,
        EvidenceArtifactId.makeUnsafe("screenshot-navigate"),
      );

      const result = yield* workflows.start({
        sessionId: "workflow-session",
        previewTarget,
        assertions: [
          { id: "url", type: "url-matches", pattern: "/$" },
          { id: "text", type: "text-visible", text: "Workflow fixture" },
          { id: "screenshot", type: "screenshot-captured" },
          { id: "console", type: "no-console-errors" },
        ],
      });

      assert.strictEqual(result.workflow.status, "completed");
      assert.ok(result.workflow.browserSessionId);
      assert.ok(result.workflow.evidenceRefs && result.workflow.evidenceRefs.length > 0);
      assert.ok(
        result.workflow.assertionResults?.some(
          (assertion) => assertion.assertionId === "screenshot" && assertion.status === "pass",
        ),
      );

      const events = yield* repository.getSessionEvents({ sessionId: "workflow-session" });
      assert.ok(events.some((event) => event.type === "BrowserWorkflowCreated"));
      assert.ok(events.some((event) => event.type === "BrowserWorkflowStatusChanged"));
      assert.ok(events.some((event) => event.type === "BrowserWorkflowAssertionResult"));
      assert.ok(events.some((event) => event.type === "BrowserWorkflowCompleted"));
    }),
  );

  it.effect("returns workflow state through get/status/list", () =>
    Effect.gen(function* () {
      const workflows = yield* BrowserWorkflowManager;
      const repository = yield* BrowserOrchestrationEvidenceRepository;
      yield* seedScreenshotArtifact(
        repository,
        EvidenceArtifactId.makeUnsafe("screenshot-navigate"),
      );
      const result = yield* workflows.start({
        sessionId: "workflow-session",
        previewTarget,
      });

      const status = yield* workflows.status({ workflowRunId: result.workflow.id });
      assert.strictEqual(status.workflow?.id, result.workflow.id);

      const fetched = yield* workflows.get({ workflowRunId: result.workflow.id });
      assert.strictEqual(fetched.workflow?.id, result.workflow.id);

      const listed = yield* workflows.list({ sessionId: "workflow-session" });
      assert.ok(listed.workflows.some((workflow) => workflow.id === result.workflow.id));
    }),
  );
});

makeLayer({ consoleError: true })("BrowserWorkflowManagerLive assertion failures", (it) => {
  it.effect("records failed deterministic assertions without failing the workflow run", () =>
    Effect.gen(function* () {
      const workflows = yield* BrowserWorkflowManager;

      const result = yield* workflows.start({
        sessionId: "workflow-session",
        previewTarget,
        assertions: [{ id: "console", type: "no-console-errors" }],
      });

      assert.strictEqual(result.workflow.status, "completed");
      assert.ok(
        result.workflow.assertionResults?.some(
          (assertion) => assertion.assertionId === "console" && assertion.status === "fail",
        ),
      );
    }),
  );
});

const observeOnlyActCalls: string[] = [];

makeLayer({ runtimeKind: "electron-visible", actCalls: observeOnlyActCalls })(
  "BrowserWorkflowManagerLive observe-only current-page mode",
  (it) => {
    it.effect("captures assertions without unsupported route or viewport actions", () =>
      Effect.gen(function* () {
        observeOnlyActCalls.length = 0;
        const workflows = yield* BrowserWorkflowManager;
        const repository = yield* BrowserOrchestrationEvidenceRepository;
        yield* seedScreenshotArtifact(
          repository,
          EvidenceArtifactId.makeUnsafe("screenshot-workflow"),
        );

        const result = yield* workflows.start({
          sessionId: "workflow-session",
          previewTarget,
          preferredRuntimeKind: "electron-visible",
          controlMode: "observe-only-current-page",
          routePlan: [{ route: "/settings", label: "settings should not be navigated" }],
          viewportPlan: [
            {
              id: "mobile",
              label: "Mobile should not resize",
              width: 390,
              height: 844,
              deviceScaleFactor: 2,
            },
          ],
          assertions: [
            { id: "url", type: "url-matches", pattern: "127.0.0.1" },
            { id: "screenshot", type: "screenshot-captured" },
          ],
        });

        assert.strictEqual(result.workflow.status, "completed");
        assert.deepStrictEqual(observeOnlyActCalls, []);
        assert.deepStrictEqual(result.workflow.routes, ["http://127.0.0.1:5173/"]);
        assert.deepStrictEqual(
          result.workflow.viewports.map((viewport) => viewport.id),
          ["desktop"],
        );
        assert.ok(
          result.workflow.assertionResults?.some(
            (assertion) => assertion.assertionId === "screenshot" && assertion.status === "pass",
          ),
        );
        assert.ok(result.workflow.screenshotArtifactRefs?.includes("screenshot-workflow"));
      }),
    );

    it.effect(
      "runs limited full-control route checks without resizing electron-visible runtime",
      () =>
        Effect.gen(function* () {
          observeOnlyActCalls.length = 0;
          const workflows = yield* BrowserWorkflowManager;
          const repository = yield* BrowserOrchestrationEvidenceRepository;
          yield* seedScreenshotArtifact(
            repository,
            EvidenceArtifactId.makeUnsafe("screenshot-navigate"),
          );

          const result = yield* workflows.start({
            sessionId: "workflow-session",
            previewTarget,
            preferredRuntimeKind: "electron-visible",
            controlMode: "full-control",
            routePlan: [{ route: "/settings", label: "settings" }],
            assertions: [
              { id: "url", type: "url-matches", pattern: "/settings" },
              { id: "screenshot", type: "screenshot-captured" },
            ],
          });

          assert.strictEqual(result.workflow.status, "completed");
          assert.deepStrictEqual(observeOnlyActCalls, ["navigate"]);
          assert.ok(
            result.workflow.assertionResults?.some(
              (assertion) => assertion.assertionId === "screenshot" && assertion.status === "pass",
            ),
          );
        }),
    );
  },
);
