import { BrowserAnnotationId, ThreadId } from "@orchestrate/contracts";
import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { BrowserAnnotationService } from "../Services/BrowserAnnotationService.ts";
import { BrowserAnnotationServiceLive } from "./BrowserAnnotationService.ts";
import { BrowserAnnotationRepositoryLive } from "../../persistence/Layers/BrowserAnnotations.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";

const layer = it.layer(
  BrowserAnnotationServiceLive.pipe(
    Layer.provide(BrowserAnnotationRepositoryLive),
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
      });

      assert.strictEqual(result.annotation.x, 1);
      assert.strictEqual(result.annotation.y, 0);
      assert.strictEqual(result.annotation.height, 1);
      assert.strictEqual(result.annotations.length, 1);

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
