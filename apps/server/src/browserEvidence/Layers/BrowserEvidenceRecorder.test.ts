import { assert, it } from "@effect/vitest";
import { BrowserSessionId } from "@orchestrate/contracts";
import { Effect, Layer, Option } from "effect";

import { BrowserOrchestrationEvidenceRepositoryLive } from "../../persistence/Layers/BrowserOrchestrationEvidence.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { BrowserOrchestrationEvidenceRepository } from "../../persistence/Services/BrowserOrchestrationEvidence.ts";
import { makePreviewTarget } from "../../browserRuntime/testFixtures.ts";
import { BrowserEvidenceRecorder } from "../Services/BrowserEvidenceRecorder.ts";
import { BrowserEvidenceRecorderLive } from "./BrowserEvidenceRecorder.ts";

const layer = it.layer(
  Layer.mergeAll(
    BrowserEvidenceRecorderLive.pipe(Layer.provide(BrowserOrchestrationEvidenceRepositoryLive)),
    BrowserOrchestrationEvidenceRepositoryLive,
  ).pipe(Layer.provide(SqlitePersistenceMemory)),
);

layer("BrowserEvidenceRecorder", (it) => {
  it.effect("writes durable screenshot, observation, URL agreement, and claim-gate evidence", () =>
    Effect.gen(function* () {
      const recorder = yield* BrowserEvidenceRecorder;
      const repository = yield* BrowserOrchestrationEvidenceRepository;
      const previewTarget = makePreviewTarget();
      const browserSessionId = BrowserSessionId.makeUnsafe("browser-session-recorder");

      const observationResult = yield* recorder.recordObservation({
        previewTarget,
        browserSessionId,
        observation: {
          sessionId: browserSessionId,
          url: "http://127.0.0.1:5173/",
          title: "Fixture",
          readyState: "complete",
          textSummary: "Fixture page",
          screenshotDataUrl: "data:image/png;base64,abc",
          consoleErrors: [],
          networkErrors: [],
          targets: [],
          runtimeKind: "playwright-headless",
          surfaceMode: "headless-validation-mirror",
          isUserVisibleSurface: false,
          observedUrl: "http://127.0.0.1:5173/",
          urlAgreement: "unknown",
          observedAt: "2026-04-28T00:00:00.000Z",
        },
        runtimeTruth: {
          runtimeKind: "playwright-headless",
          surfaceMode: "headless-validation-mirror",
          isUserVisibleSurface: false,
          browserSessionId,
          observedUrl: "http://127.0.0.1:5173/",
          urlAgreement: "unknown",
        },
      });

      assert.ok(observationResult.screenshotArtifactRef);
      assert.ok(observationResult.evidenceRefs.length >= 3);

      const screenshot = yield* repository.getEvidenceArtifact({
        artifactId: observationResult.screenshotArtifactRef!,
      });
      assert.ok(Option.isSome(screenshot));
      assert.strictEqual(Option.getOrThrow(screenshot).kind, "browser-screenshot");

      const screenshotContent = yield* repository.getEvidenceArtifactContent({
        artifactId: observationResult.screenshotArtifactRef!,
      });
      assert.ok(Option.isSome(screenshotContent));
      assert.strictEqual(
        Option.getOrThrow(screenshotContent).contentText,
        "data:image/png;base64,abc",
      );

      const claimGateResult = yield* recorder.recordClaimGate({
        previewTarget,
        browserSessionId,
        observation: {
          sessionId: browserSessionId,
          url: "https://www.youtube.com/watch?v=test",
          title: "YouTube",
          readyState: "complete",
          textSummary: "",
          targets: [],
          observedAt: "2026-04-28T00:00:01.000Z",
        },
        reports: [
          {
            claimKind: "playing",
            decision: {
              outcome: "block",
              reason: "Playback not proven.",
              missingEvidence: ["video.paused === false"],
            },
          },
        ],
      });

      assert.strictEqual(claimGateResult.evidenceRefs.length, 1);
      const events = yield* repository.getSessionEvents({ sessionId: previewTarget.sessionId });
      assert.ok(events.some((event) => event.type === "BrowserObservationCaptured"));
      assert.ok(events.some((event) => event.type === "BrowserClaimGateEvaluated"));
    }),
  );
});
