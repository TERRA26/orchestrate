import { Schema } from "effect";
import {
  IsoDateTime,
  NonNegativeInt,
  PositiveInt,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas";

const BROWSER_MAX_URL_LENGTH = 2_048;
const BROWSER_MAX_KEY_LENGTH = 64;
const BROWSER_MAX_VIEWPORT_WIDTH = 3_840;
const BROWSER_MAX_VIEWPORT_HEIGHT = 2_160;
const BROWSER_MAX_WAIT_MS = 10_000;
const BROWSER_MAX_SCROLL_AMOUNT = 4_000;
const BROWSER_MAX_TYPE_TEXT_LENGTH = 4_000;
const BROWSER_MAX_TEXT_SUMMARY_LENGTH = 4_000;
const BROWSER_MAX_SCREENSHOT_DATA_URL_LENGTH = 2_000_000;
const BROWSER_MAX_CONSOLE_ENTRIES = 50;
const BROWSER_MAX_NETWORK_ERROR_ENTRIES = 50;
const BROWSER_MAX_CONSOLE_MESSAGE_LENGTH = 512;
const BROWSER_MAX_ARIA_SNAPSHOT_LENGTH = 16_000;
const BROWSER_MAX_WAIT_FOR_TEXT_LENGTH = 512;
const BROWSER_MAX_EVALUATE_EXPRESSION_LENGTH = 4_000;
const BROWSER_MAX_EVALUATE_RESULT_LENGTH = 8_000;
const BROWSER_MAX_ANNOTATION_COMMENT_LENGTH = 2_000;

export const BrowserSessionId = TrimmedNonEmptyString.check(Schema.isMaxLength(128));
export type BrowserSessionId = typeof BrowserSessionId.Type;

export const BrowserTargetId = TrimmedNonEmptyString.check(Schema.isMaxLength(64));
export type BrowserTargetId = typeof BrowserTargetId.Type;

export const BrowserObservedTarget = Schema.Struct({
  id: BrowserTargetId,
  role: TrimmedNonEmptyString.check(Schema.isMaxLength(64)),
  tagName: TrimmedNonEmptyString.check(Schema.isMaxLength(64)),
  label: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(512))),
  text: Schema.optional(Schema.String.check(Schema.isMaxLength(512))),
  placeholder: Schema.optional(Schema.String.check(Schema.isMaxLength(512))),
  disabled: Schema.Boolean,
  x: NonNegativeInt,
  y: NonNegativeInt,
  width: NonNegativeInt,
  height: NonNegativeInt,
});
export type BrowserObservedTarget = typeof BrowserObservedTarget.Type;

export const BrowserConsoleEntry = Schema.Struct({
  level: Schema.Literals(["error", "warning"]),
  text: Schema.String.check(Schema.isMaxLength(BROWSER_MAX_CONSOLE_MESSAGE_LENGTH)),
});
export type BrowserConsoleEntry = typeof BrowserConsoleEntry.Type;

export const BrowserNetworkError = Schema.Struct({
  url: Schema.String.check(Schema.isMaxLength(BROWSER_MAX_URL_LENGTH)),
  method: Schema.String.check(Schema.isMaxLength(16)),
  failure: Schema.String.check(Schema.isMaxLength(256)),
});
export type BrowserNetworkError = typeof BrowserNetworkError.Type;

export const BrowserPageMetrics = Schema.Struct({
  totalInteractiveElements: NonNegativeInt,
  totalImages: NonNegativeInt,
  totalLinks: NonNegativeInt,
  totalInputs: NonNegativeInt,
  headings: Schema.Array(Schema.String.check(Schema.isMaxLength(256))),
  viewportWidth: NonNegativeInt,
  viewportHeight: NonNegativeInt,
  scrollHeight: NonNegativeInt,
  scrollTop: NonNegativeInt,
});
export type BrowserPageMetrics = typeof BrowserPageMetrics.Type;

export const BrowserRuntimeTruthKind = Schema.Literals([
  "electron-visible",
  "playwright-headless",
  "chrome-extension",
]);
export type BrowserRuntimeTruthKind = typeof BrowserRuntimeTruthKind.Type;

export const BrowserSurfaceMode = Schema.Literals([
  "live-shared-browser",
  "headless-validation-mirror",
  "static-screenshot-evidence",
]);
export type BrowserSurfaceMode = typeof BrowserSurfaceMode.Type;

export const BrowserUrlAgreement = Schema.Literals(["same", "different", "unknown"]);
export type BrowserUrlAgreement = typeof BrowserUrlAgreement.Type;

export const BrowserRuntimeTruth = Schema.Struct({
  runtimeKind: BrowserRuntimeTruthKind,
  surfaceMode: BrowserSurfaceMode,
  isUserVisibleSurface: Schema.Boolean,
  browserSessionId: BrowserSessionId,
  previewTargetId: Schema.optionalKey(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  observationId: Schema.optionalKey(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  screenshotArtifactRef: Schema.optionalKey(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  screenshotDataUrl: Schema.optionalKey(
    Schema.String.check(Schema.isMaxLength(BROWSER_MAX_SCREENSHOT_DATA_URL_LENGTH)),
  ),
  observedUrl: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(BROWSER_MAX_URL_LENGTH))),
  visiblePanelUrl: Schema.optionalKey(
    Schema.String.check(Schema.isMaxLength(BROWSER_MAX_URL_LENGTH)),
  ),
  urlAgreement: Schema.optionalKey(BrowserUrlAgreement),
});
export type BrowserRuntimeTruth = typeof BrowserRuntimeTruth.Type;

export const BrowserClaimKind = Schema.Literals([
  "loaded",
  "playing",
  "submitted",
  "navigated",
  "verified",
  "accepted",
]);
export type BrowserClaimKind = typeof BrowserClaimKind.Type;

export const BrowserClaimGateDecision = Schema.Union([
  Schema.Struct({
    outcome: Schema.Literal("allow"),
    evidenceRefs: Schema.Array(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  }),
  Schema.Struct({
    outcome: Schema.Literal("downgrade"),
    replacementText: Schema.String.check(Schema.isMaxLength(1_000)),
    reason: Schema.String.check(Schema.isMaxLength(1_000)),
    evidenceRefs: Schema.Array(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  }),
  Schema.Struct({
    outcome: Schema.Literal("block"),
    reason: Schema.String.check(Schema.isMaxLength(1_000)),
    missingEvidence: Schema.Array(Schema.String.check(Schema.isMaxLength(256))),
  }),
]);
export type BrowserClaimGateDecision = typeof BrowserClaimGateDecision.Type;

export const BrowserClaimGateReport = Schema.Struct({
  claimKind: BrowserClaimKind,
  decision: BrowserClaimGateDecision,
});
export type BrowserClaimGateReport = typeof BrowserClaimGateReport.Type;

export const BrowserObservation = Schema.Struct({
  sessionId: BrowserSessionId,
  url: TrimmedNonEmptyString.check(Schema.isMaxLength(BROWSER_MAX_URL_LENGTH)),
  title: Schema.String.check(Schema.isMaxLength(512)),
  readyState: TrimmedNonEmptyString.check(Schema.isMaxLength(32)),
  textSummary: Schema.String.check(Schema.isMaxLength(BROWSER_MAX_TEXT_SUMMARY_LENGTH)),
  screenshotDataUrl: Schema.optional(
    Schema.String.check(Schema.isMaxLength(BROWSER_MAX_SCREENSHOT_DATA_URL_LENGTH)),
  ),
  previewScreenshotDataUrl: Schema.optional(
    Schema.String.check(Schema.isMaxLength(BROWSER_MAX_SCREENSHOT_DATA_URL_LENGTH)),
  ),
  fullPageScreenshotDataUrl: Schema.optional(
    Schema.String.check(Schema.isMaxLength(BROWSER_MAX_SCREENSHOT_DATA_URL_LENGTH)),
  ),
  targets: Schema.Array(BrowserObservedTarget),
  consoleErrors: Schema.optionalKey(
    Schema.Array(BrowserConsoleEntry).check(Schema.isMaxLength(BROWSER_MAX_CONSOLE_ENTRIES)),
  ),
  networkErrors: Schema.optionalKey(
    Schema.Array(BrowserNetworkError).check(Schema.isMaxLength(BROWSER_MAX_NETWORK_ERROR_ENTRIES)),
  ),
  pageMetrics: Schema.optionalKey(BrowserPageMetrics),
  ariaSnapshot: Schema.optionalKey(
    Schema.String.check(Schema.isMaxLength(BROWSER_MAX_ARIA_SNAPSHOT_LENGTH)),
  ),
  navigationError: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(512))),
  evaluateResult: Schema.optionalKey(
    Schema.String.check(Schema.isMaxLength(BROWSER_MAX_EVALUATE_RESULT_LENGTH)),
  ),
  runtimeKind: Schema.optionalKey(BrowserRuntimeTruthKind),
  surfaceMode: Schema.optionalKey(BrowserSurfaceMode),
  isUserVisibleSurface: Schema.optionalKey(Schema.Boolean),
  screenshotArtifactRef: Schema.optionalKey(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  observedUrl: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(BROWSER_MAX_URL_LENGTH))),
  visiblePanelUrl: Schema.optionalKey(
    Schema.String.check(Schema.isMaxLength(BROWSER_MAX_URL_LENGTH)),
  ),
  urlAgreement: Schema.optionalKey(BrowserUrlAgreement),
  runtimeTruth: Schema.optionalKey(BrowserRuntimeTruth),
  observedAt: IsoDateTime,
});
export type BrowserObservation = typeof BrowserObservation.Type;

export const BrowserOpenSessionInput = Schema.Struct({
  threadId: Schema.optionalKey(ThreadId),
  url: TrimmedNonEmptyString.check(Schema.isMaxLength(BROWSER_MAX_URL_LENGTH)),
  viewportWidth: Schema.optionalKey(
    PositiveInt.check(Schema.isLessThanOrEqualTo(BROWSER_MAX_VIEWPORT_WIDTH)),
  ),
  viewportHeight: Schema.optionalKey(
    PositiveInt.check(Schema.isLessThanOrEqualTo(BROWSER_MAX_VIEWPORT_HEIGHT)),
  ),
});
export type BrowserOpenSessionInput = typeof BrowserOpenSessionInput.Type;

export const BrowserOpenSessionResult = Schema.Struct({
  sessionId: BrowserSessionId,
  observation: BrowserObservation,
  runtimeTruth: Schema.optionalKey(BrowserRuntimeTruth),
  claimGate: Schema.optionalKey(Schema.Array(BrowserClaimGateReport)),
});
export type BrowserOpenSessionResult = typeof BrowserOpenSessionResult.Type;

const BrowserNavigateAction = Schema.Struct({
  kind: Schema.Literal("navigate"),
  url: TrimmedNonEmptyString.check(Schema.isMaxLength(BROWSER_MAX_URL_LENGTH)),
});

const BrowserClickAction = Schema.Struct({
  kind: Schema.Literal("click"),
  targetId: BrowserTargetId,
});

const BrowserClickAtAction = Schema.Struct({
  kind: Schema.Literal("clickAt"),
  x: NonNegativeInt.check(Schema.isLessThanOrEqualTo(BROWSER_MAX_VIEWPORT_WIDTH)),
  y: NonNegativeInt.check(Schema.isLessThanOrEqualTo(BROWSER_MAX_VIEWPORT_HEIGHT)),
});

const BrowserClickTargetOrAtAction = Schema.Struct({
  kind: Schema.Literal("clickTargetOrAt"),
  targetId: BrowserTargetId,
  x: NonNegativeInt.check(Schema.isLessThanOrEqualTo(BROWSER_MAX_VIEWPORT_WIDTH)),
  y: NonNegativeInt.check(Schema.isLessThanOrEqualTo(BROWSER_MAX_VIEWPORT_HEIGHT)),
});

const BrowserTypeAction = Schema.Struct({
  kind: Schema.Literal("type"),
  targetId: BrowserTargetId,
  text: Schema.String.check(Schema.isMaxLength(BROWSER_MAX_TYPE_TEXT_LENGTH)),
  clearFirst: Schema.Boolean.pipe(Schema.withDecodingDefault(() => true)),
});

const BrowserTypeFocusedAction = Schema.Struct({
  kind: Schema.Literal("typeFocused"),
  text: Schema.String.check(Schema.isMaxLength(BROWSER_MAX_TYPE_TEXT_LENGTH)),
});

const BrowserPressAction = Schema.Struct({
  kind: Schema.Literal("press"),
  key: TrimmedNonEmptyString.check(
    Schema.isMaxLength(BROWSER_MAX_KEY_LENGTH),
    Schema.isPattern(/^[A-Za-z0-9+._-]+$/),
  ),
});

const BrowserScrollAction = Schema.Struct({
  kind: Schema.Literal("scroll"),
  direction: Schema.Literals(["up", "down"]),
  amount: PositiveInt.check(Schema.isLessThanOrEqualTo(BROWSER_MAX_SCROLL_AMOUNT)),
});

const BrowserWaitAction = Schema.Struct({
  kind: Schema.Literal("wait"),
  ms: NonNegativeInt.check(Schema.isLessThanOrEqualTo(BROWSER_MAX_WAIT_MS)),
});

const BrowserResizeAction = Schema.Struct({
  kind: Schema.Literal("resize"),
  width: PositiveInt.check(Schema.isLessThanOrEqualTo(BROWSER_MAX_VIEWPORT_WIDTH)),
  height: PositiveInt.check(Schema.isLessThanOrEqualTo(BROWSER_MAX_VIEWPORT_HEIGHT)),
});

const BrowserWaitForAction = Schema.Struct({
  kind: Schema.Literal("waitFor"),
  text: Schema.optionalKey(
    Schema.String.check(Schema.isMaxLength(BROWSER_MAX_WAIT_FOR_TEXT_LENGTH)),
  ),
  textGone: Schema.optionalKey(
    Schema.String.check(Schema.isMaxLength(BROWSER_MAX_WAIT_FOR_TEXT_LENGTH)),
  ),
  timeout: Schema.optionalKey(PositiveInt.check(Schema.isLessThanOrEqualTo(BROWSER_MAX_WAIT_MS))),
});

const BrowserEvaluateAction = Schema.Struct({
  kind: Schema.Literal("evaluate"),
  expression: Schema.String.check(Schema.isMaxLength(BROWSER_MAX_EVALUATE_EXPRESSION_LENGTH)),
});

export const BrowserAction = Schema.Union([
  BrowserNavigateAction,
  BrowserClickAction,
  BrowserClickAtAction,
  BrowserClickTargetOrAtAction,
  BrowserTypeAction,
  BrowserTypeFocusedAction,
  BrowserPressAction,
  BrowserScrollAction,
  BrowserWaitAction,
  BrowserResizeAction,
  BrowserWaitForAction,
  BrowserEvaluateAction,
]);
export type BrowserAction = typeof BrowserAction.Type;

export const BrowserActInput = Schema.Struct({
  threadId: Schema.optionalKey(ThreadId),
  sessionId: BrowserSessionId,
  action: BrowserAction,
});
export type BrowserActInput = typeof BrowserActInput.Type;

export const BrowserActResult = Schema.Struct({
  observation: BrowserObservation,
  runtimeTruth: Schema.optionalKey(BrowserRuntimeTruth),
  claimGate: Schema.optionalKey(Schema.Array(BrowserClaimGateReport)),
});
export type BrowserActResult = typeof BrowserActResult.Type;

export const BrowserCloseSessionInput = Schema.Struct({
  sessionId: BrowserSessionId,
});
export type BrowserCloseSessionInput = typeof BrowserCloseSessionInput.Type;

export const BrowserAnnotationId = TrimmedNonEmptyString.check(Schema.isMaxLength(128));
export type BrowserAnnotationId = typeof BrowserAnnotationId.Type;

export const BrowserAnnotation = Schema.Struct({
  id: BrowserAnnotationId,
  threadId: ThreadId,
  sessionId: Schema.optional(BrowserSessionId),
  url: TrimmedNonEmptyString.check(Schema.isMaxLength(BROWSER_MAX_URL_LENGTH)),
  title: Schema.optional(Schema.String.check(Schema.isMaxLength(512))),
  comment: Schema.String.check(Schema.isMaxLength(BROWSER_MAX_ANNOTATION_COMMENT_LENGTH)),
  kind: Schema.Literals(["point", "rect"]),
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.optional(Schema.Number),
  height: Schema.optional(Schema.Number),
  viewportWidth: Schema.optional(NonNegativeInt),
  viewportHeight: Schema.optional(NonNegativeInt),
  scrollTop: Schema.optional(NonNegativeInt),
  targetId: Schema.optional(BrowserTargetId),
  targetLabel: Schema.optional(Schema.String.check(Schema.isMaxLength(512))),
  screenshotDataUrl: Schema.optional(
    Schema.String.check(Schema.isMaxLength(BROWSER_MAX_SCREENSHOT_DATA_URL_LENGTH)),
  ),
  createdAt: IsoDateTime,
});
export type BrowserAnnotation = typeof BrowserAnnotation.Type;

export const BrowserAddAnnotationInput = Schema.Struct({
  threadId: ThreadId,
  sessionId: Schema.optional(BrowserSessionId),
  url: TrimmedNonEmptyString.check(Schema.isMaxLength(BROWSER_MAX_URL_LENGTH)),
  title: Schema.optional(Schema.String.check(Schema.isMaxLength(512))),
  comment: Schema.String.check(Schema.isMaxLength(BROWSER_MAX_ANNOTATION_COMMENT_LENGTH)),
  kind: Schema.Literals(["point", "rect"]),
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.optional(Schema.Number),
  height: Schema.optional(Schema.Number),
  viewportWidth: Schema.optional(NonNegativeInt),
  viewportHeight: Schema.optional(NonNegativeInt),
  scrollTop: Schema.optional(NonNegativeInt),
  targetId: Schema.optional(BrowserTargetId),
  targetLabel: Schema.optional(Schema.String.check(Schema.isMaxLength(512))),
  screenshotDataUrl: Schema.optional(
    Schema.String.check(Schema.isMaxLength(BROWSER_MAX_SCREENSHOT_DATA_URL_LENGTH)),
  ),
});
export type BrowserAddAnnotationInput = typeof BrowserAddAnnotationInput.Type;

export const BrowserListAnnotationsInput = Schema.Struct({
  threadId: ThreadId,
  sessionId: Schema.optional(BrowserSessionId),
});
export type BrowserListAnnotationsInput = typeof BrowserListAnnotationsInput.Type;

export const BrowserAnnotationResult = Schema.Struct({
  annotation: BrowserAnnotation,
  annotations: Schema.Array(BrowserAnnotation),
});
export type BrowserAnnotationResult = typeof BrowserAnnotationResult.Type;

export const BrowserAnnotationsResult = Schema.Struct({
  annotations: Schema.Array(BrowserAnnotation),
});
export type BrowserAnnotationsResult = typeof BrowserAnnotationsResult.Type;
