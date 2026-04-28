import { assert, it } from "@effect/vitest";
import { EvidenceArtifactId, PreviewTargetId, type PreviewTarget } from "@orchestrate/contracts";
import { Effect, Layer, Option } from "effect";

import { BrowserAutomation } from "../../browser/Services/BrowserAutomation.ts";
import { BrowserEvidenceRecorderLive } from "../../browserEvidence/Layers/BrowserEvidenceRecorder.ts";
import { BrowserOrchestrationEvidenceRepositoryLive } from "../../persistence/Layers/BrowserOrchestrationEvidence.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { BrowserOrchestrationEvidenceRepository } from "../../persistence/Services/BrowserOrchestrationEvidence.ts";
import { BrowserRuntimeService } from "../Services/BrowserRuntimeService.ts";
import { BrowserRuntimeServiceLive } from "./BrowserRuntimeService.ts";

function makeBrowserAutomationLayer() {
  return Layer.succeed(BrowserAutomation, {
    openSession: (input) =>
      Effect.succeed({
        sessionId: "browser-session-service",
        observation: {
          sessionId: "browser-session-service",
          url: input.url,
          title: "Fixture",
          readyState: "complete",
          textSummary: "Fixture page",
          screenshotDataUrl: "data:image/png;base64,open",
          consoleErrors: [],
          networkErrors: [],
          targets: [],
          observedAt: "2026-04-28T00:00:00.000Z",
        },
      }),
    act: (input) =>
      Effect.succeed({
        observation: {
          sessionId: input.sessionId,
          url: "http://127.0.0.1:5173/next",
          title: "Next",
          readyState: "complete",
          textSummary: "Next page",
          screenshotDataUrl: "data:image/png;base64,next",
          consoleErrors: [],
          networkErrors: [],
          targets: [],
          observedAt: "2026-04-28T00:00:01.000Z",
        },
      }),
    closeSession: () => Effect.void,
  });
}

const browserAutomationLayer = makeBrowserAutomationLayer();
const evidenceRepositoryLayer = BrowserOrchestrationEvidenceRepositoryLive.pipe(
  Layer.provide(SqlitePersistenceMemory),
);
const evidenceRecorderLayer = BrowserEvidenceRecorderLive.pipe(
  Layer.provide(evidenceRepositoryLayer),
);
const layer = it.layer(
  Layer.mergeAll(
    BrowserRuntimeServiceLive.pipe(
      Layer.provide(browserAutomationLayer),
      Layer.provide(evidenceRecorderLayer),
    ),
    evidenceRepositoryLayer,
  ),
);

layer("BrowserRuntimeServiceLive", (it) => {
  it.effect("opens a supplied PreviewTarget instead of synthesizing one from the URL", () =>
    Effect.gen(function* () {
      const runtime = yield* BrowserRuntimeService;

      const previewTarget: PreviewTarget = {
        id: PreviewTargetId.makeUnsafe("preview-target-runtime-service"),
        version: 1,
        sessionId: "thread-runtime-preview-target",
        kind: "local-dev-server",
        canonicalUrl: "http://127.0.0.1:5173/from-target",
        baseUrl: "http://127.0.0.1:5173/",
        initialRoute: "/from-target",
        allowedOrigins: ["http://127.0.0.1:5173"],
        deniedOrigins: [],
        authMode: "none",
        permissionTier: "isolated-local-preview",
        viewports: [
          {
            id: "desktop",
            label: "Desktop",
            width: 1440,
            height: 900,
            deviceScaleFactor: 1,
          },
        ],
        readinessEvidenceRef: EvidenceArtifactId.makeUnsafe("health-runtime-service"),
        serverLogRefs: [EvidenceArtifactId.makeUnsafe("server-log-runtime-service")],
        createdAt: "2026-04-28T00:00:00.000Z",
      };

      const openResult = yield* runtime.openSession({
        url: previewTarget.canonicalUrl,
        threadId: "thread-runtime-preview-target",
        previewTarget,
      });

      assert.strictEqual(openResult.runtimeTruth?.previewTargetId, previewTarget.id);
    }),
  );

  it.effect("writes durable evidence for openSession and act", () =>
    Effect.gen(function* () {
      const runtime = yield* BrowserRuntimeService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;

      const openResult = yield* runtime.openSession({
        url: "http://127.0.0.1:5173/",
        threadId: "thread-runtime-service",
      });
      assert.ok(openResult.runtimeTruth?.screenshotArtifactRef);
      assert.ok(openResult.evidenceRefs && openResult.evidenceRefs.length > 0);

      const openScreenshot = yield* repository.getEvidenceArtifact({
        artifactId: openResult.runtimeTruth!.screenshotArtifactRef!,
      });
      assert.ok(Option.isSome(openScreenshot));
      assert.strictEqual(Option.getOrThrow(openScreenshot).kind, "browser-screenshot");

      const actResult = yield* runtime.act({
        sessionId: openResult.sessionId,
        action: { kind: "navigate", url: "http://127.0.0.1:5173/next" },
      });
      assert.ok(actResult.runtimeTruth?.screenshotArtifactRef);
      assert.ok(actResult.evidenceRefs && actResult.evidenceRefs.length > 0);

      const events = yield* repository.getSessionEvents({ sessionId: "thread-runtime-service" });
      assert.ok(events.some((event) => event.type === "BrowserSessionCreated"));
      assert.ok(events.some((event) => event.type === "BrowserActionRecorded"));
      assert.ok(events.some((event) => event.type === "BrowserObservationCaptured"));
      assert.ok(events.some((event) => event.type === "BrowserClaimGateEvaluated"));
    }),
  );

  it.effect("writes policy-denied evidence when an action is blocked", () =>
    Effect.gen(function* () {
      const runtime = yield* BrowserRuntimeService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;

      const openResult = yield* runtime.openSession({
        url: "https://example.com/",
        threadId: "thread-runtime-denied",
      });

      const exit = yield* Effect.exit(
        runtime.act({
          sessionId: openResult.sessionId,
          action: { kind: "evaluate", expression: "document.title" },
        }),
      );
      assert.strictEqual(exit._tag, "Failure");

      const events = yield* repository.getSessionEvents({ sessionId: "thread-runtime-denied" });
      assert.ok(events.some((event) => event.type === "BrowserPolicyDecisionRecorded"));
    }),
  );
});
