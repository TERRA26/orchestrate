import {
  type BrowserAddAnnotationInput,
  BrowserAnnotationId,
  type BrowserAnnotationResult,
  type BrowserAnnotationsResult,
  type BrowserSessionId,
  type ThreadId,
} from "@orchestrate/contracts";
import { Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";

export type BrowserAnnotationGeometryContext = {
  readonly bboxCssPx: {
    readonly x: number;
    readonly y: number;
    readonly width?: number | undefined;
    readonly height?: number | undefined;
  };
  readonly viewport?: {
    readonly width?: number | undefined;
    readonly height?: number | undefined;
    readonly deviceScaleFactor?: number | undefined;
  };
  readonly scroll?: {
    readonly x?: number | undefined;
    readonly y?: number | undefined;
  };
  readonly zoom?: number | undefined;
  readonly screenshotPixelSize?: {
    readonly width?: number | undefined;
    readonly height?: number | undefined;
  };
};

export type BrowserAnnotationTarget =
  | {
      readonly type: "element";
      readonly targetId?: string | undefined;
      readonly label?: string | undefined;
      readonly stableSelector?: string | undefined;
      readonly role?: string | undefined;
      readonly name?: string | undefined;
      readonly testId?: string | undefined;
    }
  | {
      readonly type: "region";
    };

export class BrowserAnnotationNotFoundError extends Schema.TaggedErrorClass<BrowserAnnotationNotFoundError>()(
  "BrowserAnnotationNotFoundError",
  {
    annotationId: BrowserAnnotationId,
  },
) {
  override get message(): string {
    return `Browser annotation not found: ${this.annotationId}`;
  }
}

export interface BrowserAnnotationServiceShape {
  readonly create: (
    input: BrowserAddAnnotationInput,
  ) => Effect.Effect<BrowserAnnotationResult, ProjectionRepositoryError>;
  readonly list: (input: {
    readonly threadId: ThreadId;
    readonly sessionId?: BrowserSessionId | undefined;
  }) => Effect.Effect<BrowserAnnotationsResult, ProjectionRepositoryError>;
  readonly resolve: (input: {
    readonly annotationId: BrowserAnnotationId;
  }) => Effect.Effect<void, ProjectionRepositoryError | BrowserAnnotationNotFoundError>;
  readonly reopen: (input: {
    readonly annotationId: BrowserAnnotationId;
  }) => Effect.Effect<void, ProjectionRepositoryError | BrowserAnnotationNotFoundError>;
}

export class BrowserAnnotationService extends ServiceMap.Service<
  BrowserAnnotationService,
  BrowserAnnotationServiceShape
>()("t3/browserAnnotations/Services/BrowserAnnotationService") {}
