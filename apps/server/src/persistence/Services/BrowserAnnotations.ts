import { BrowserAnnotationId, IsoDateTime, ThreadId } from "@orchestrate/contracts";
import { Option, Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const BrowserAnnotationStatus = Schema.Literals(["open", "resolved", "reopened"]);
export type BrowserAnnotationStatus = typeof BrowserAnnotationStatus.Type;

export const BrowserAnnotationRow = Schema.Struct({
  annotationId: BrowserAnnotationId,
  threadId: ThreadId,
  sessionId: Schema.NullOr(Schema.String),
  status: BrowserAnnotationStatus,
  annotationJson: Schema.String,
  targetJson: Schema.NullOr(Schema.String),
  geometryContextJson: Schema.NullOr(Schema.String),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  resolvedAt: Schema.NullOr(IsoDateTime),
  reopenedAt: Schema.NullOr(IsoDateTime),
});
export type BrowserAnnotationRow = typeof BrowserAnnotationRow.Type;

export const ListBrowserAnnotationRowsInput = Schema.Struct({
  threadId: ThreadId,
  sessionId: Schema.optional(Schema.String),
  includeResolved: Schema.optional(Schema.Boolean),
});
export type ListBrowserAnnotationRowsInput = typeof ListBrowserAnnotationRowsInput.Type;

export const GetBrowserAnnotationRowInput = Schema.Struct({
  annotationId: BrowserAnnotationId,
});
export type GetBrowserAnnotationRowInput = typeof GetBrowserAnnotationRowInput.Type;

export const UpdateBrowserAnnotationStatusInput = Schema.Struct({
  annotationId: BrowserAnnotationId,
  status: BrowserAnnotationStatus,
  updatedAt: IsoDateTime,
  resolvedAt: Schema.NullOr(IsoDateTime),
  reopenedAt: Schema.NullOr(IsoDateTime),
});
export type UpdateBrowserAnnotationStatusInput = typeof UpdateBrowserAnnotationStatusInput.Type;

export interface BrowserAnnotationRepositoryShape {
  readonly insert: (row: BrowserAnnotationRow) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly getById: (
    input: GetBrowserAnnotationRowInput,
  ) => Effect.Effect<Option.Option<BrowserAnnotationRow>, ProjectionRepositoryError>;
  readonly listByThread: (
    input: ListBrowserAnnotationRowsInput,
  ) => Effect.Effect<ReadonlyArray<BrowserAnnotationRow>, ProjectionRepositoryError>;
  readonly updateStatus: (
    input: UpdateBrowserAnnotationStatusInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
}

export class BrowserAnnotationRepository extends ServiceMap.Service<
  BrowserAnnotationRepository,
  BrowserAnnotationRepositoryShape
>()("t3/persistence/Services/BrowserAnnotations/Repository") {}
