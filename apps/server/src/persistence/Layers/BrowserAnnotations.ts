import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceSqlError } from "../Errors.ts";
import {
  BrowserAnnotationRepository,
  type BrowserAnnotationRepositoryShape,
  BrowserAnnotationRow,
  GetBrowserAnnotationRowInput,
  ListBrowserAnnotationRowsInput,
  UpdateBrowserAnnotationStatusInput,
} from "../Services/BrowserAnnotations.ts";

const makeBrowserAnnotationRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const insertAnnotationRow = SqlSchema.void({
    Request: BrowserAnnotationRow,
    execute: (row) =>
      sql`
        INSERT INTO browser_annotations (
          annotation_id, thread_id, session_id, status, annotation_json,
          target_json, geometry_context_json, created_at, updated_at,
          resolved_at, reopened_at
        )
        VALUES (
          ${row.annotationId}, ${row.threadId}, ${row.sessionId}, ${row.status},
          ${row.annotationJson}, ${row.targetJson}, ${row.geometryContextJson},
          ${row.createdAt}, ${row.updatedAt}, ${row.resolvedAt}, ${row.reopenedAt}
        )
        ON CONFLICT (annotation_id) DO NOTHING
      `,
  });

  const getAnnotationRow = SqlSchema.findOneOption({
    Request: GetBrowserAnnotationRowInput,
    Result: BrowserAnnotationRow,
    execute: ({ annotationId }) =>
      sql`
        SELECT
          annotation_id AS "annotationId",
          thread_id AS "threadId",
          session_id AS "sessionId",
          status,
          annotation_json AS "annotationJson",
          target_json AS "targetJson",
          geometry_context_json AS "geometryContextJson",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          resolved_at AS "resolvedAt",
          reopened_at AS "reopenedAt"
        FROM browser_annotations
        WHERE annotation_id = ${annotationId}
      `,
  });

  const listAnnotationRows = SqlSchema.findAll({
    Request: ListBrowserAnnotationRowsInput,
    Result: BrowserAnnotationRow,
    execute: ({ threadId, sessionId, includeResolved }) =>
      sql`
        SELECT
          annotation_id AS "annotationId",
          thread_id AS "threadId",
          session_id AS "sessionId",
          status,
          annotation_json AS "annotationJson",
          target_json AS "targetJson",
          geometry_context_json AS "geometryContextJson",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          resolved_at AS "resolvedAt",
          reopened_at AS "reopenedAt"
        FROM browser_annotations
        WHERE thread_id = ${threadId}
          AND (${sessionId ?? null} IS NULL OR session_id = ${sessionId ?? null})
          AND (${includeResolved === true ? 1 : 0} = 1 OR status <> 'resolved')
        ORDER BY created_at DESC, annotation_id ASC
        LIMIT 100
      `,
  });

  const updateAnnotationStatus = SqlSchema.void({
    Request: UpdateBrowserAnnotationStatusInput,
    execute: (input) =>
      sql`
        UPDATE browser_annotations
        SET
          status = ${input.status},
          updated_at = ${input.updatedAt},
          resolved_at = ${input.resolvedAt},
          reopened_at = ${input.reopenedAt}
        WHERE annotation_id = ${input.annotationId}
      `,
  });

  const insert: BrowserAnnotationRepositoryShape["insert"] = (row) =>
    insertAnnotationRow(row).pipe(
      Effect.mapError(toPersistenceSqlError("BrowserAnnotationRepository.insert:query")),
    );

  const getById: BrowserAnnotationRepositoryShape["getById"] = (input) =>
    getAnnotationRow(input).pipe(
      Effect.mapError(toPersistenceSqlError("BrowserAnnotationRepository.getById:query")),
    );

  const listByThread: BrowserAnnotationRepositoryShape["listByThread"] = (input) =>
    listAnnotationRows(input).pipe(
      Effect.mapError(toPersistenceSqlError("BrowserAnnotationRepository.listByThread:query")),
    );

  const updateStatus: BrowserAnnotationRepositoryShape["updateStatus"] = (input) =>
    updateAnnotationStatus(input).pipe(
      Effect.mapError(toPersistenceSqlError("BrowserAnnotationRepository.updateStatus:query")),
    );

  return {
    insert,
    getById,
    listByThread,
    updateStatus,
  } satisfies BrowserAnnotationRepositoryShape;
});

export const BrowserAnnotationRepositoryLive = Layer.effect(
  BrowserAnnotationRepository,
  makeBrowserAnnotationRepository,
);
