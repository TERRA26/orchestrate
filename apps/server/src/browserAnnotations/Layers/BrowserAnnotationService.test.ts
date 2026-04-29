import { BrowserAnnotationId, ThreadId } from "@orchestrate/contracts";
import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { BrowserAnnotationService } from "../Services/BrowserAnnotationService.ts";
import { BrowserAnnotationServiceLive } from "./BrowserAnnotationService.ts";
import { BrowserAnnotationRepositoryLive } from "../../persistence/Layers/BrowserAnnotations.ts";
import { BrowserOrchestrationEvidenceRepositoryLive } from "../../persistence/Layers/BrowserOrchestrationEvidence.ts";
import { BrowserOrchestrationEvidenceRepository } from "../../persistence/Services/BrowserOrchestrationEvidence.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";

const layer = it.layer(
  BrowserAnnotationServiceLive.pipe(
    Layer.provideMerge(BrowserAnnotationRepositoryLive),
    Layer.provideMerge(BrowserOrchestrationEvidenceRepositoryLive),
    Layer.provideMerge(SqlitePersistenceMemory),
  ),
);

layer("BrowserAnnotationService", (it) => {
  it.effect("creates durable annotations while preserving legacy API response shape", () =>
    Effect.gen(function* () {
      const service = yield* BrowserAnnotationService;

      const result = yield* service.create({
        threadId: ThreadId.makeUnsafe("thread-service"),
        sessionId: "browser-session-service",
        url: "https://example.com",
        comment: "Check this button",
        kind: "rect",
        x: 1.2,
        y: -0.5,
        width: 0.4,
        height: 2,
        viewportWidth: 1280,
        viewportHeight: 720,
        scrollTop: 120,
        targetId: "target-button",
        targetLabel: "Submit",
        screenshotDataUrl: "data:image/png;base64,annotationcrop",
        target: {
          kind: "element",
          element: {
            id: "target-button",
            tagName: "button",
            role: "button",
            name: "Submit",
            visible: true,
            box: { x: 10, y: 20, width: 80, height: 32, coordinateSpace: "css-pixels" },
          },
          geometry: {
            coordinateSpace: "css-pixels",
            rect: { x: 10, y: 20, width: 80, height: 32 },
            viewport: { width: 1280, height: 720, deviceScaleFactor: 2 },
            scroll: { x: 0, y: 120 },
          },
        },
      });

      assert.strictEqual(result.annotation.x, 1);
      assert.strictEqual(result.annotation.y, 0);
      assert.strictEqual(result.annotation.height, 1);
      assert.strictEqual(result.annotation.status, "open");
      assert.ok(result.annotation.artifactRefs?.some((ref) => ref.startsWith("browser-comment-")));
      assert.ok(result.annotation.cropArtifactRef?.startsWith("screenshot-crop-"));
      assert.ok(result.annotation.domSnippetArtifactRef?.startsWith("dom-snapshot-"));
      assert.ok(result.annotation.styleSummaryArtifactRef?.startsWith("browser-comment-"));
      assert.strictEqual(result.annotations.length, 1);

      const evidence = yield* BrowserOrchestrationEvidenceRepository;
      const artifact = yield* evidence.getEvidenceArtifact({
        artifactId: result.annotation.artifactRefs![0]!,
      });
      assert.strictEqual(artifact._tag, "Some");

      const listed = yield* service.list({
        threadId: ThreadId.makeUnsafe("thread-service"),
        sessionId: "browser-session-service",
      });
      assert.strictEqual(listed.annotations.length, 1);
      assert.strictEqual(listed.annotations[0]?.comment, "Check this button");
    }),
  );

  it.effect("hides resolved annotations and shows reopened annotations", () =>
    Effect.gen(function* () {
      const service = yield* BrowserAnnotationService;

      const result = yield* service.create({
        threadId: ThreadId.makeUnsafe("thread-service-lifecycle"),
        url: "https://example.com",
        comment: "Lifecycle",
        kind: "point",
        x: 0.5,
        y: 0.5,
      });
      const annotationId = BrowserAnnotationId.makeUnsafe(result.annotation.id);

      yield* service.resolve({ annotationId });
      const afterResolve = yield* service.list({
        threadId: ThreadId.makeUnsafe("thread-service-lifecycle"),
      });
      assert.strictEqual(afterResolve.annotations.length, 0);

      yield* service.reopen({ annotationId });
      const afterReopen = yield* service.list({
        threadId: ThreadId.makeUnsafe("thread-service-lifecycle"),
      });
      assert.strictEqual(afterReopen.annotations.length, 1);
      assert.strictEqual(afterReopen.annotations[0]?.id, annotationId);
    }),
  );
});
