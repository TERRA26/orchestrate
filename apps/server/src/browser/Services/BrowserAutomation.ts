/**
 * BrowserAutomation - Browser session orchestration service interface.
 *
 * Owns short-lived automated browser sessions used by the orchestrator to
 * validate web deliverables before they are marked complete.
 *
 * @module BrowserAutomation
 */
import {
  type BrowserActInput,
  type BrowserActResult,
  type BrowserCloseSessionInput,
  type BrowserOpenSessionInput,
  type BrowserOpenSessionResult,
} from "@t3tools/contracts";
import { Effect, Schema, ServiceMap } from "effect";

export class BrowserAutomationError extends Schema.TaggedErrorClass<BrowserAutomationError>()(
  "BrowserAutomationError",
  {
    operation: Schema.String,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message() {
    return `${this.operation}: ${this.detail}`;
  }
}

export class BrowserAutomationSessionNotFoundError extends Schema.TaggedErrorClass<BrowserAutomationSessionNotFoundError>()(
  "BrowserAutomationSessionNotFoundError",
  {
    sessionId: Schema.String,
  },
) {
  override get message() {
    return `Unknown browser automation session: ${this.sessionId}`;
  }
}

export type BrowserAutomationServiceError =
  | BrowserAutomationError
  | BrowserAutomationSessionNotFoundError;

export interface BrowserAutomationShape {
  readonly openSession: (
    input: BrowserOpenSessionInput,
  ) => Effect.Effect<BrowserOpenSessionResult, BrowserAutomationServiceError>;
  readonly act: (
    input: BrowserActInput,
  ) => Effect.Effect<BrowserActResult, BrowserAutomationServiceError>;
  readonly closeSession: (
    input: BrowserCloseSessionInput,
  ) => Effect.Effect<void, BrowserAutomationServiceError>;
}

export class BrowserAutomation extends ServiceMap.Service<
  BrowserAutomation,
  BrowserAutomationShape
>()("t3/browser/Services/BrowserAutomation") {}
