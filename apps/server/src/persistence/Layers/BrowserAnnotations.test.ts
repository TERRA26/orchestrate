import { BrowserAnnotationId, ThreadId } from "@orchestrate/contracts";
import { assert, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";

import { BrowserAnnotationRepository } from "../Services/BrowserAnnotations.ts";
import { BrowserAnnotationRepositoryLive } from "./BrowserAnnotations.ts";
import { SqlitePersistenceMemory } from "./Sqlite.ts";

const layer = it.layer(
  BrowserAnnotationRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
);

const now = "2026-04-27T00:00:00.000Z";
const later = "2026-04-27T00:00:01.000Z";

layer("BrowserAnnotationRepository", (it) => {
  it.effect("persists browser annotations and lists unresolved rows newest first", () =>
    Effect.gen(function* () {
      const repo = yield* BrowserAnnotationRepository;

      yield* repo.insert({
        annotationId: BrowserAnnotationId.makeUnsafe("annotation-old"),
        threadId: ThreadId.makeUnsafe("thread-annotations"),
        sessionId: "browser-session-1",
        status: "open",
        annotationJson: JSON.stringify({ id: "annotation-old", comment: "old" }),
        targetJson: JSON.stringify({ type: "region" }),
        geometryContextJson: JSON.stringify({ bboxCssPx: { x: 0.1, y: 0.2 } }),
        createdAt: now,
        updatedAt: now,
        resolvedAt: null,
        reopenedAt: null,
      });

      yield* repo.insert({
        annotationId: BrowserAnnotationId.makeUnsafe("annotation-new"),
        threadId: ThreadId.makeUnsafe("thread-annotations"),
        sessionId: "browser-session-1",
        status: "open",
        annotationJson: JSON.stringify({ id: "annotation-new", comment: "new" }),
        targetJson: JSON.stringify({ type: "region" }),
        geometryContextJson: JSON.stringify({ bboxCssPx: { x: 0.3, y: 0.4 } }),
        createdAt: later,
        updatedAt: later,
        resolvedAt: null,
        reopenedAt: null,
      });

      const rows = yield* repo.listByThread({
        threadId: ThreadId.makeUnsafe("thread-annotations"),
        sessionId: "browser-session-1",
      });

      assert.strictEqual(rows.length, 2);
      assert.strictEqual(rows[0]?.annotationId, "annotation-new");
      assert.strictEqual(rows[1]?.annotationId, "annotation-old");
    }),
  );

  it.effect("resolves and reopens annotations", () =>
    Effect.gen(function* () {
      const repo = yield* BrowserAnnotationRepository;
      const annotationId = BrowserAnnotationId.makeUnsafe("annotation-lifecycle");

      yield* repo.insert({
        annotationId,
        threadId: ThreadId.makeUnsafe("thread-lifecycle"),
        sessionId: null,
        status: "open",
        annotationJson: JSON.stringify({ id: annotationId, comment: "lifecycle" }),
        targetJson: null,
        geometryContextJson: null,
        createdAt: now,
        updatedAt: now,
        resolvedAt: null,
        reopenedAt: null,
      });

      yield* repo.updateStatus({
        annotationId,
        status: "resolved",
        updatedAt: later,
        resolvedAt: later,
        reopenedAt: null,
      });

      const unresolvedRows = yield* repo.listByThread({
        threadId: ThreadId.makeUnsafe("thread-lifecycle"),
      });
      assert.strictEqual(unresolvedRows.length, 0);

      const resolved = yield* repo.getById({ annotationId });
      assert.ok(Option.isSome(resolved));
      assert.strictEqual(Option.getOrThrow(resolved).status, "resolved");

      yield* repo.updateStatus({
        annotationId,
        status: "reopened",
        updatedAt: later,
        resolvedAt: later,
        reopenedAt: later,
      });

      const reopenedRows = yield* repo.listByThread({
        threadId: ThreadId.makeUnsafe("thread-lifecycle"),
      });
      assert.strictEqual(reopenedRows.length, 1);
      assert.strictEqual(reopenedRows[0]?.status, "reopened");
    }),
  );
});
