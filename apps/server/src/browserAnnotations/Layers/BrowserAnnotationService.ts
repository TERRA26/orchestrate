import {
  BROWSER_ORCHESTRATION_SCHEMA_VERSION,
  BrowserAnnotationId,
  type BrowserAddAnnotationInput,
  type BrowserAnnotation,
  EvidenceArtifactId,
  type EvidenceArtifactKind,
  SessionEventId,
} from "@orchestrate/contracts";
import { Effect, Layer, Option } from "effect";
import { createHash, randomUUID } from "node:crypto";

import { BrowserAnnotationRepository } from "../../persistence/Services/BrowserAnnotations.ts";
import { BrowserOrchestrationEvidenceRepository } from "../../persistence/Services/BrowserOrchestrationEvidence.ts";
import {
  BrowserAnnotationNotFoundError,
  BrowserAnnotationService,
  type BrowserAnnotationGeometryContext,
  type BrowserAnnotationServiceShape,
  type BrowserAnnotationTarget,
} from "../Services/BrowserAnnotationService.ts";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function artifactId(kind: EvidenceArtifactKind, seed: string): EvidenceArtifactId {
  return EvidenceArtifactId.makeUnsafe(`${kind}-${sha256(seed).slice(0, 24)}`);
}

function clampAnnotationUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function makeAnnotation(input: BrowserAddAnnotationInput, createdAt: string): BrowserAnnotation {
  const browserSessionId = input.browserSessionId ?? input.sessionId;
  const artifactRefs = [input.fullScreenshotArtifactRef, input.browserInspectionRef].filter(
    (ref): ref is NonNullable<typeof ref> => typeof ref === "string",
  );
  return {
    id: BrowserAnnotationId.makeUnsafe(randomUUID()),
    threadId: input.threadId,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(browserSessionId ? { browserSessionId } : {}),
    ...(input.previewTargetId ? { previewTargetId: input.previewTargetId } : {}),
    ...(input.workflowRunId ? { workflowRunId: input.workflowRunId } : {}),
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
    status: "open",
    ...(input.target ? { target: input.target } : {}),
    ...(artifactRefs.length ? { artifactRefs } : {}),
    ...(input.fullScreenshotArtifactRef
      ? { screenshotArtifactRef: input.fullScreenshotArtifactRef }
      : {}),
    ...(input.fullScreenshotArtifactRef
      ? { beforeScreenshotArtifactRef: input.fullScreenshotArtifactRef }
      : {}),
    ...(input.browserInspectionRef ? { beforeDomArtifactRef: input.browserInspectionRef } : {}),
    createdAt,
    updatedAt: createdAt,
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
            x: 0,
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

function decodeAnnotationRow(row: {
  readonly annotationJson: string;
  readonly status: "open" | "resolved" | "reopened";
  readonly updatedAt: string;
  readonly resolvedAt: string | null;
  readonly reopenedAt: string | null;
}): BrowserAnnotation {
  const annotation = JSON.parse(row.annotationJson) as BrowserAnnotation;
  return {
    ...annotation,
    status: row.status,
    updatedAt: row.updatedAt,
    ...(row.resolvedAt ? { resolvedAt: row.resolvedAt } : {}),
    ...(row.reopenedAt ? { reopenedAt: row.reopenedAt } : {}),
  };
}

const makeBrowserAnnotationService = Effect.gen(function* () {
  const repository = yield* BrowserAnnotationRepository;
  const evidenceRepository = yield* BrowserOrchestrationEvidenceRepository;

  const writeArtifact = (
    kind: EvidenceArtifactKind,
    content: string,
    contentType: string,
    metadata: Record<string, unknown>,
  ) =>
    Effect.gen(function* () {
      const id = artifactId(kind, `${kind}:${content}`);
      const createdAt = new Date().toISOString();
      yield* evidenceRepository.writeEvidenceArtifact({
        artifactId: id,
        schemaVersion: BROWSER_ORCHESTRATION_SCHEMA_VERSION,
        kind,
        sha256: sha256(content),
        byteSize: Buffer.byteLength(content),
        contentType,
        storageUri: `sqlite://evidence_artifact_contents/${id}`,
        sensitivity: "workspace-internal",
        access: "safe-for-user-report",
        redactedArtifactId: null,
        supersededByArtifactId: null,
        metadataJson: JSON.stringify(metadata),
        createdAt,
      });
      yield* evidenceRepository.writeEvidenceArtifactContent({
        artifactId: id,
        contentText: content,
        createdAt,
      });
      return id;
    });

  const appendLifecycleEvent = (
    annotation: BrowserAnnotation,
    type: "BrowserAnnotationCreated" | "BrowserAnnotationResolved" | "BrowserAnnotationReopened",
  ) =>
    evidenceRepository.appendSessionEvent({
      eventId: SessionEventId.makeUnsafe(`annotation-event-${randomUUID()}`),
      sessionId: annotation.browserSessionId ?? annotation.sessionId ?? annotation.threadId,
      workflowRunId: null,
      type,
      actor: "human",
      artifactRefsJson: JSON.stringify(annotation.artifactRefs ?? []),
      payloadJson: JSON.stringify({ annotationId: annotation.id, annotation }),
      occurredAt: new Date().toISOString(),
    });

  const listAnnotations: BrowserAnnotationServiceShape["list"] = (input) =>
    repository
      .listByThread({
        threadId: input.threadId,
        ...((input.browserSessionId ?? input.sessionId)
          ? { sessionId: input.browserSessionId ?? input.sessionId }
          : {}),
        ...(input.includeResolved !== undefined ? { includeResolved: input.includeResolved } : {}),
      })
      .pipe(
        Effect.map((rows) => ({
          annotations: rows.map(decodeAnnotationRow),
        })),
      );

  const create: BrowserAnnotationServiceShape["create"] = (input) =>
    Effect.gen(function* () {
      const createdAt = new Date().toISOString();
      const baseAnnotation = makeAnnotation(input, createdAt);
      const artifactRefs: EvidenceArtifactId[] = (baseAnnotation.artifactRefs ?? []).map((ref) =>
        EvidenceArtifactId.makeUnsafe(ref),
      );
      const metadata = {
        type: "browser-annotation",
        annotationId: baseAnnotation.id,
        url: baseAnnotation.url,
        target: baseAnnotation.target ?? makeTarget(baseAnnotation),
      };
      const summaryRef = yield* writeArtifact(
        "browser-comment",
        JSON.stringify({
          annotationId: baseAnnotation.id,
          comment: baseAnnotation.comment,
          url: baseAnnotation.url,
          target: baseAnnotation.target ?? makeTarget(baseAnnotation),
        }),
        "application/json",
        { ...metadata, artifactType: "browser-annotation-summary" },
      );
      artifactRefs.push(summaryRef);
      const cropRef = input.screenshotDataUrl
        ? yield* writeArtifact(
            "screenshot-crop",
            input.screenshotDataUrl,
            input.screenshotDataUrl.match(/^data:([^;,]+)[;,]/)?.[1] ?? "image/png",
            { ...metadata, artifactType: "browser-annotation-crop" },
          )
        : undefined;
      if (cropRef) artifactRefs.push(cropRef);
      const element = input.target?.element;
      const domSnippetRef = element
        ? yield* writeArtifact(
            "dom-snapshot",
            JSON.stringify(
              input.target?.domSnippet ?? {
                tagName: element.tagName ?? null,
                role: element.role ?? null,
                name: element.name ?? null,
                selector: element.selector ?? null,
                testId: element.testId ?? null,
                outerHTMLPreview: element.text ?? element.name ?? element.testId ?? "",
                parentSummary: null,
              },
            ),
            "application/json",
            { ...metadata, artifactType: "browser-annotation-dom-snippet" },
          )
        : undefined;
      if (domSnippetRef) artifactRefs.push(domSnippetRef);
      const styleSummaryRef = element
        ? yield* writeArtifact(
            "browser-comment",
            JSON.stringify(
              input.target?.computedStyle ?? {
                display: "unknown",
                position: "unknown",
                margin: "unknown",
                padding: "unknown",
                font: "unknown",
                color: "unknown",
                backgroundColor: "unknown",
                width: element.box?.width ? `${element.box.width}px` : "unknown",
                height: element.box?.height ? `${element.box.height}px` : "unknown",
              },
            ),
            "application/json",
            { ...metadata, artifactType: "browser-annotation-style-summary" },
          )
        : undefined;
      if (styleSummaryRef) artifactRefs.push(styleSummaryRef);
      const annotation: BrowserAnnotation = {
        ...baseAnnotation,
        artifactRefs: artifactRefs.map(String),
        ...(cropRef ? { cropArtifactRef: cropRef } : {}),
        ...(domSnippetRef ? { domSnippetArtifactRef: domSnippetRef } : {}),
        ...(styleSummaryRef ? { styleSummaryArtifactRef: styleSummaryRef } : {}),
      };

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

      yield* appendLifecycleEvent(annotation, "BrowserAnnotationCreated");

      const { annotations } = yield* listAnnotations({
        threadId: input.threadId,
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      });

      return { annotation, annotations };
    });

  const get: BrowserAnnotationServiceShape["get"] = (input) =>
    Effect.gen(function* () {
      const row = yield* repository.getById(input);
      if (Option.isNone(row)) {
        return yield* Effect.fail(
          new BrowserAnnotationNotFoundError({ annotationId: input.annotationId }),
        );
      }
      const annotation = decodeAnnotationRow(row.value);
      return { annotation, annotations: [annotation] };
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
      const row = yield* repository.getById(input);
      const annotation = decodeAnnotationRow(Option.getOrThrow(row));
      yield* appendLifecycleEvent(
        annotation,
        status === "resolved" ? "BrowserAnnotationResolved" : "BrowserAnnotationReopened",
      );
      const { annotations } = yield* listAnnotations({
        threadId: annotation.threadId,
        ...((annotation.browserSessionId ?? annotation.sessionId)
          ? { sessionId: annotation.browserSessionId ?? annotation.sessionId }
          : {}),
      });
      return { annotation, annotations };
    });

  return {
    create,
    get,
    list: listAnnotations,
    resolve: (input) => updateExistingStatus(input, "resolved"),
    reopen: (input) => updateExistingStatus(input, "reopened"),
  } satisfies BrowserAnnotationServiceShape;
});

export const BrowserAnnotationServiceLive = Layer.effect(
  BrowserAnnotationService,
  makeBrowserAnnotationService,
);
