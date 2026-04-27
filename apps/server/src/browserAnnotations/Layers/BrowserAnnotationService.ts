import {
  BrowserAnnotationId,
  type BrowserAddAnnotationInput,
  type BrowserAnnotation,
} from "@orchestrate/contracts";
import { Effect, Layer, Option } from "effect";
import { randomUUID } from "node:crypto";

import { BrowserAnnotationRepository } from "../../persistence/Services/BrowserAnnotations.ts";
import {
  BrowserAnnotationNotFoundError,
  BrowserAnnotationService,
  type BrowserAnnotationGeometryContext,
  type BrowserAnnotationServiceShape,
  type BrowserAnnotationTarget,
} from "../Services/BrowserAnnotationService.ts";

function clampAnnotationUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function makeAnnotation(input: BrowserAddAnnotationInput, createdAt: string): BrowserAnnotation {
  return {
    id: BrowserAnnotationId.makeUnsafe(randomUUID()),
    threadId: input.threadId,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    url: input.url,
    ...(input.title ? { title: input.title } : {}),
    comment: input.comment,
    kind: input.kind,
    x: clampAnnotationUnit(input.x),
    y: clampAnnotationUnit(input.y),
    ...(input.width !== undefined ? { width: clampAnnotationUnit(input.width) } : {}),
    ...(input.height !== undefined ? { height: clampAnnotationUnit(input.height) } : {}),
    ...(input.viewportWidth !== undefined ? { viewportWidth: input.viewportWidth } : {}),
    ...(input.viewportHeight !== undefined ? { viewportHeight: input.viewportHeight } : {}),
    ...(input.scrollTop !== undefined ? { scrollTop: input.scrollTop } : {}),
    ...(input.targetId ? { targetId: input.targetId } : {}),
    ...(input.targetLabel ? { targetLabel: input.targetLabel } : {}),
    ...(input.screenshotDataUrl ? { screenshotDataUrl: input.screenshotDataUrl } : {}),
    createdAt,
  };
}

function makeGeometryContext(annotation: BrowserAnnotation): BrowserAnnotationGeometryContext {
  return {
    bboxCssPx: {
      x: annotation.x,
      y: annotation.y,
      ...(annotation.width !== undefined ? { width: annotation.width } : {}),
      ...(annotation.height !== undefined ? { height: annotation.height } : {}),
    },
    ...(annotation.viewportWidth !== undefined || annotation.viewportHeight !== undefined
      ? {
          viewport: {
            ...(annotation.viewportWidth !== undefined ? { width: annotation.viewportWidth } : {}),
            ...(annotation.viewportHeight !== undefined
              ? { height: annotation.viewportHeight }
              : {}),
          },
        }
      : {}),
    ...(annotation.scrollTop !== undefined
      ? {
          scroll: {
            y: annotation.scrollTop,
          },
        }
      : {}),
  };
}

function makeTarget(annotation: BrowserAnnotation): BrowserAnnotationTarget {
  if (annotation.targetId || annotation.targetLabel) {
    return {
      type: "element",
      ...(annotation.targetId ? { targetId: annotation.targetId } : {}),
      ...(annotation.targetLabel ? { label: annotation.targetLabel } : {}),
    };
  }
  return { type: "region" };
}

function decodeAnnotation(json: string): BrowserAnnotation {
  return JSON.parse(json) as BrowserAnnotation;
}

const makeBrowserAnnotationService = Effect.gen(function* () {
  const repository = yield* BrowserAnnotationRepository;

  const listAnnotations: BrowserAnnotationServiceShape["list"] = (input) =>
    repository
      .listByThread({
        threadId: input.threadId,
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      })
      .pipe(
        Effect.map((rows) => ({
          annotations: rows.map((row) => decodeAnnotation(row.annotationJson)),
        })),
      );

  const create: BrowserAnnotationServiceShape["create"] = (input) =>
    Effect.gen(function* () {
      const createdAt = new Date().toISOString();
      const annotation = makeAnnotation(input, createdAt);

      yield* repository.insert({
        annotationId: annotation.id,
        threadId: annotation.threadId,
        sessionId: annotation.sessionId ?? null,
        status: "open",
        annotationJson: JSON.stringify(annotation),
        targetJson: JSON.stringify(makeTarget(annotation)),
        geometryContextJson: JSON.stringify(makeGeometryContext(annotation)),
        createdAt,
        updatedAt: createdAt,
        resolvedAt: null,
        reopenedAt: null,
      });

      const { annotations } = yield* listAnnotations({
        threadId: input.threadId,
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      });

      return { annotation, annotations };
    });

  const updateExistingStatus = (
    input: {
      readonly annotationId: BrowserAnnotationId;
    },
    status: "resolved" | "reopened",
  ) =>
    Effect.gen(function* () {
      const existing = yield* repository.getById(input);
      if (Option.isNone(existing)) {
        return yield* Effect.fail(
          new BrowserAnnotationNotFoundError({ annotationId: input.annotationId }),
        );
      }

      const updatedAt = new Date().toISOString();
      yield* repository.updateStatus({
        annotationId: input.annotationId,
        status,
        updatedAt,
        resolvedAt: status === "resolved" ? updatedAt : Option.getOrThrow(existing).resolvedAt,
        reopenedAt: status === "reopened" ? updatedAt : Option.getOrThrow(existing).reopenedAt,
      });
    });

  return {
    create,
    list: listAnnotations,
    resolve: (input) => updateExistingStatus(input, "resolved"),
    reopen: (input) => updateExistingStatus(input, "reopened"),
  } satisfies BrowserAnnotationServiceShape;
});

export const BrowserAnnotationServiceLive = Layer.effect(
  BrowserAnnotationService,
  makeBrowserAnnotationService,
);
