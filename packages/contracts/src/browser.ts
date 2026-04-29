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
const BROWSER_MAX_ELEMENT_SUMMARIES = 80;

export const BrowserSessionId = TrimmedNonEmptyString.check(Schema.isMaxLength(128));
export type BrowserSessionId = typeof BrowserSessionId.Type;

export const BrowserApprovalId = TrimmedNonEmptyString.check(Schema.isMaxLength(128));
export type BrowserApprovalId = typeof BrowserApprovalId.Type;

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

export const BrowserElementTargetKind = Schema.Literals([
  "selector",
  "test-id",
  "role-name",
  "text",
  "point",
  "element-ref",
]);
export type BrowserElementTargetKind = typeof BrowserElementTargetKind.Type;

export const BrowserElementBox = Schema.Struct({
  x: NonNegativeInt,
  y: NonNegativeInt,
  width: NonNegativeInt,
  height: NonNegativeInt,
  coordinateSpace: Schema.Literal("css-pixels"),
});
export type BrowserElementBox = typeof BrowserElementBox.Type;

export const BrowserElementSummary = Schema.Struct({
  id: BrowserTargetId,
  tagName: Schema.optionalKey(TrimmedNonEmptyString.check(Schema.isMaxLength(64))),
  role: Schema.optionalKey(TrimmedNonEmptyString.check(Schema.isMaxLength(64))),
  name: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(512))),
  text: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(512))),
  selector: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(512))),
  testId: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(256))),
  href: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(BROWSER_MAX_URL_LENGTH))),
  inputType: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(64))),
  visible: Schema.Boolean,
  enabled: Schema.optionalKey(Schema.Boolean),
  box: Schema.optionalKey(BrowserElementBox),
});
export type BrowserElementSummary = typeof BrowserElementSummary.Type;

export const BrowserElementTarget = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("selector"),
    selector: TrimmedNonEmptyString.check(Schema.isMaxLength(512)),
  }),
  Schema.Struct({
    kind: Schema.Literal("test-id"),
    testId: TrimmedNonEmptyString.check(Schema.isMaxLength(256)),
  }),
  Schema.Struct({
    kind: Schema.Literal("role-name"),
    role: TrimmedNonEmptyString.check(Schema.isMaxLength(64)),
    name: TrimmedNonEmptyString.check(Schema.isMaxLength(512)),
  }),
  Schema.Struct({
    kind: Schema.Literal("text"),
    text: TrimmedNonEmptyString.check(Schema.isMaxLength(512)),
  }),
  Schema.Struct({
    kind: Schema.Literal("point"),
    x: NonNegativeInt.check(Schema.isLessThanOrEqualTo(BROWSER_MAX_VIEWPORT_WIDTH)),
    y: NonNegativeInt.check(Schema.isLessThanOrEqualTo(BROWSER_MAX_VIEWPORT_HEIGHT)),
  }),
  Schema.Struct({
    kind: Schema.Literal("element-ref"),
    elementId: BrowserTargetId,
  }),
]);
export type BrowserElementTarget = typeof BrowserElementTarget.Type;

export const BrowserTargetResolution = Schema.Struct({
  requested: BrowserElementTarget,
  status: Schema.Literals(["resolved", "not-found", "ambiguous", "not-actionable"]),
  reason: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(512))),
  candidates: Schema.optionalKey(
    Schema.Array(BrowserElementSummary).check(Schema.isMaxLength(BROWSER_MAX_ELEMENT_SUMMARIES)),
  ),
});
export type BrowserTargetResolution = typeof BrowserTargetResolution.Type;

export const BrowserResolvedElementDomSnippet = Schema.Struct({
  tagName: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(64))),
  role: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(64))),
  name: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(512))),
  selector: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(512))),
  testId: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(256))),
  outerHTMLPreview: Schema.String.check(Schema.isMaxLength(2_000)),
  parentSummary: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(1_000))),
});
export type BrowserResolvedElementDomSnippet = typeof BrowserResolvedElementDomSnippet.Type;

export const BrowserResolvedElementStyleSummary = Schema.Struct({
  display: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(128))),
  position: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(128))),
  margin: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(256))),
  padding: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(256))),
  font: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(512))),
  color: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(128))),
  backgroundColor: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(128))),
  width: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(128))),
  height: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(128))),
  alignItems: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(128))),
  justifyContent: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(128))),
});
export type BrowserResolvedElementStyleSummary = typeof BrowserResolvedElementStyleSummary.Type;

export const BrowserResolveTargetSessionInput = Schema.Struct({
  sessionId: BrowserSessionId,
  target: BrowserElementTarget,
  actionKind: Schema.Literals(["clickTarget", "fillTarget"]),
});
export type BrowserResolveTargetSessionInput = typeof BrowserResolveTargetSessionInput.Type;

export const BrowserResolveTargetSessionResult = Schema.Struct({
  browserSessionId: BrowserSessionId,
  targetResolution: BrowserTargetResolution,
  resolvedTarget: Schema.optionalKey(BrowserElementSummary),
  domSnippet: Schema.optionalKey(BrowserResolvedElementDomSnippet),
  computedStyle: Schema.optionalKey(BrowserResolvedElementStyleSummary),
});
export type BrowserResolveTargetSessionResult = typeof BrowserResolveTargetSessionResult.Type;

export const BrowserTargetFailure = Schema.Struct({
  code: Schema.Literals(["target-not-found", "target-ambiguous", "target-not-actionable"]),
  targetResolution: BrowserTargetResolution,
  resolvedTarget: Schema.optionalKey(BrowserElementSummary),
});
export type BrowserTargetFailure = typeof BrowserTargetFailure.Type;

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

const BrowserOpenSessionPreviewViewport = Schema.Struct({
  id: TrimmedNonEmptyString.check(Schema.isMaxLength(128)),
  label: Schema.String.check(Schema.isMaxLength(128)),
  width: PositiveInt.check(Schema.isLessThanOrEqualTo(BROWSER_MAX_VIEWPORT_WIDTH)),
  height: PositiveInt.check(Schema.isLessThanOrEqualTo(BROWSER_MAX_VIEWPORT_HEIGHT)),
  deviceScaleFactor: Schema.optional(
    Schema.Number.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(4)),
  ),
});

const BrowserOpenSessionPreviewTarget = Schema.Struct({
  id: TrimmedNonEmptyString.check(Schema.isMaxLength(128)),
  version: PositiveInt,
  sessionId: TrimmedNonEmptyString.check(Schema.isMaxLength(128)),
  kind: Schema.Literals([
    "local-dev-server",
    "file-backed",
    "public-unauthenticated",
    "authenticated-extension",
  ]),
  canonicalUrl: TrimmedNonEmptyString.check(Schema.isMaxLength(BROWSER_MAX_URL_LENGTH)),
  baseUrl: TrimmedNonEmptyString.check(Schema.isMaxLength(BROWSER_MAX_URL_LENGTH)),
  initialRoute: TrimmedNonEmptyString.check(Schema.isMaxLength(BROWSER_MAX_URL_LENGTH)),
  devServerInstanceId: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  launchConfigId: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  allowedOrigins: Schema.Array(Schema.String.check(Schema.isMaxLength(BROWSER_MAX_URL_LENGTH))),
  deniedOrigins: Schema.Array(Schema.String.check(Schema.isMaxLength(BROWSER_MAX_URL_LENGTH))),
  authMode: Schema.Literals(["none", "isolated-preview", "real-browser-extension"]),
  permissionTier: Schema.Literals([
    "isolated-local-preview",
    "approved-public",
    "authenticated-browser",
    "computer-use-fallback",
  ]),
  viewports: Schema.Array(BrowserOpenSessionPreviewViewport).check(Schema.isMinLength(1)),
  readinessEvidenceRef: TrimmedNonEmptyString.check(Schema.isMaxLength(128)),
  serverLogRefs: Schema.Array(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  createdAt: IsoDateTime,
  supersedesPreviewTargetId: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
});

export const BrowserRuntimeTruth = Schema.Struct({
  runtimeKind: BrowserRuntimeTruthKind,
  surfaceMode: BrowserSurfaceMode,
  isUserVisibleSurface: Schema.Boolean,
  browserSessionId: BrowserSessionId,
  previewTargetId: Schema.optionalKey(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  observationId: Schema.optionalKey(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  screenshotArtifactRef: Schema.optionalKey(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  evidenceRefs: Schema.optionalKey(
    Schema.Array(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  ),
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
  elements: Schema.optionalKey(
    Schema.Array(BrowserElementSummary).check(Schema.isMaxLength(BROWSER_MAX_ELEMENT_SUMMARIES)),
  ),
  resolvedTarget: Schema.optionalKey(BrowserElementSummary),
  targetResolution: Schema.optionalKey(BrowserTargetResolution),
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
  evidenceRefs: Schema.optionalKey(
    Schema.Array(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  ),
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
  preferredRuntimeKind: Schema.optionalKey(BrowserRuntimeTruthKind),
  previewTarget: Schema.optionalKey(BrowserOpenSessionPreviewTarget),
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
  evidenceRefs: Schema.optionalKey(
    Schema.Array(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  ),
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

const BrowserClickTargetAction = Schema.Struct({
  kind: Schema.Literal("clickTarget"),
  target: BrowserElementTarget,
});

const BrowserFillTargetAction = Schema.Struct({
  kind: Schema.Literal("fillTarget"),
  target: BrowserElementTarget,
  value: Schema.String.check(Schema.isMaxLength(BROWSER_MAX_TYPE_TEXT_LENGTH)),
  clearFirst: Schema.Boolean.pipe(Schema.withDecodingDefault(() => true)),
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
  BrowserClickTargetAction,
  BrowserFillTargetAction,
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
  approvalRef: Schema.optionalKey(BrowserApprovalId),
});
export type BrowserActInput = typeof BrowserActInput.Type;

export const BrowserApprovalStatus = Schema.Literals([
  "pending",
  "approved",
  "rejected",
  "expired",
  "consumed",
]);
export type BrowserApprovalStatus = typeof BrowserApprovalStatus.Type;

export const BrowserApprovalRisk = Schema.Literals([
  "external-navigation",
  "consequential-action",
  "auth",
  "file",
  "unknown",
]);
export type BrowserApprovalRisk = typeof BrowserApprovalRisk.Type;

export const BrowserApprovalRequest = Schema.Struct({
  id: BrowserApprovalId,
  browserSessionId: BrowserSessionId,
  desktopClientId: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(128))),
  action: BrowserAction,
  resolvedTarget: Schema.optionalKey(BrowserElementSummary),
  targetResolution: Schema.optionalKey(BrowserTargetResolution),
  actionHash: TrimmedNonEmptyString.check(Schema.isMaxLength(128)),
  reason: TrimmedNonEmptyString.check(Schema.isMaxLength(512)),
  risk: BrowserApprovalRisk,
  preApprovalObservationRef: Schema.optionalKey(
    TrimmedNonEmptyString.check(Schema.isMaxLength(128)),
  ),
  observedUrl: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(BROWSER_MAX_URL_LENGTH))),
  origin: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(BROWSER_MAX_URL_LENGTH))),
  status: BrowserApprovalStatus,
  evidenceRefs: Schema.Array(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  expiresAt: Schema.optionalKey(IsoDateTime),
  consumedAt: Schema.optionalKey(IsoDateTime),
  executedActionRef: Schema.optionalKey(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  decisionReason: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(512))),
});
export type BrowserApprovalRequest = typeof BrowserApprovalRequest.Type;

export const BrowserActResult = Schema.Struct({
  actionId: Schema.optionalKey(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  status: Schema.optionalKey(Schema.Literals(["ok", "blocked", "requires-approval", "failed"])),
  reason: Schema.optionalKey(TrimmedNonEmptyString.check(Schema.isMaxLength(512))),
  policyDecisionRef: Schema.optionalKey(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  approvalRequestId: Schema.optionalKey(BrowserApprovalId),
  observation: BrowserObservation,
  runtimeTruth: Schema.optionalKey(BrowserRuntimeTruth),
  screenshotArtifactRef: Schema.optionalKey(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  evidenceRefs: Schema.optionalKey(
    Schema.Array(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  ),
  claimGate: Schema.optionalKey(Schema.Array(BrowserClaimGateReport)),
  target: Schema.optionalKey(BrowserElementSummary),
  resolvedTarget: Schema.optionalKey(BrowserElementSummary),
  targetResolution: Schema.optionalKey(BrowserTargetResolution),
});
export type BrowserActResult = typeof BrowserActResult.Type;

export const BrowserCloseSessionInput = Schema.Struct({
  sessionId: BrowserSessionId,
});
export type BrowserCloseSessionInput = typeof BrowserCloseSessionInput.Type;

export const BrowserObservationInclude = Schema.Literals([
  "screenshot",
  "visibleText",
  "pageMetrics",
  "console",
  "network",
  "pageErrors",
]);
export type BrowserObservationInclude = typeof BrowserObservationInclude.Type;

export const BrowserObserveSessionInput = Schema.Struct({
  sessionId: BrowserSessionId,
  include: Schema.optionalKey(Schema.Array(BrowserObservationInclude)),
});
export type BrowserObserveSessionInput = typeof BrowserObserveSessionInput.Type;

export const BrowserInspectSessionInput = Schema.Struct({
  sessionId: BrowserSessionId,
  query: Schema.optionalKey(BrowserElementTarget),
});
export type BrowserInspectSessionInput = typeof BrowserInspectSessionInput.Type;

export const BrowserInspectResult = Schema.Struct({
  browserSessionId: BrowserSessionId,
  runtimeTruth: BrowserRuntimeTruth,
  url: TrimmedNonEmptyString.check(Schema.isMaxLength(BROWSER_MAX_URL_LENGTH)),
  title: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(512))),
  elements: Schema.Array(BrowserElementSummary).check(
    Schema.isMaxLength(BROWSER_MAX_ELEMENT_SUMMARIES),
  ),
  screenshotArtifactRef: Schema.optionalKey(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  evidenceRefs: Schema.Array(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
});
export type BrowserInspectResult = typeof BrowserInspectResult.Type;

export const BrowserInspectionArtifact = Schema.Struct({
  browserSessionId: BrowserSessionId,
  runtimeTruth: BrowserRuntimeTruth,
  url: TrimmedNonEmptyString.check(Schema.isMaxLength(BROWSER_MAX_URL_LENGTH)),
  title: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(512))),
  viewport: Schema.optionalKey(
    Schema.Struct({
      width: NonNegativeInt,
      height: NonNegativeInt,
      deviceScaleFactor: Schema.optionalKey(
        Schema.Number.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(8)),
      ),
    }),
  ),
  scroll: Schema.optionalKey(
    Schema.Struct({
      x: NonNegativeInt,
      y: NonNegativeInt,
    }),
  ),
  elements: Schema.Array(BrowserElementSummary).check(
    Schema.isMaxLength(BROWSER_MAX_ELEMENT_SUMMARIES),
  ),
  screenshotArtifactRef: Schema.optionalKey(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  capturedAt: IsoDateTime,
});
export type BrowserInspectionArtifact = typeof BrowserInspectionArtifact.Type;

export const BrowserAnnotationId = TrimmedNonEmptyString.check(Schema.isMaxLength(128));
export type BrowserAnnotationId = typeof BrowserAnnotationId.Type;

export const BrowserAnnotationStatus = Schema.Literals(["open", "resolved", "reopened"]);
export type BrowserAnnotationStatus = typeof BrowserAnnotationStatus.Type;

export const BrowserAnnotationTargetKind = Schema.Literals(["element", "region", "point"]);
export type BrowserAnnotationTargetKind = typeof BrowserAnnotationTargetKind.Type;

export const BrowserAnnotationGeometry = Schema.Struct({
  coordinateSpace: Schema.Literal("css-pixels"),
  rect: Schema.optionalKey(
    Schema.Struct({
      x: Schema.Number,
      y: Schema.Number,
      width: Schema.Number,
      height: Schema.Number,
    }),
  ),
  point: Schema.optionalKey(
    Schema.Struct({
      x: Schema.Number,
      y: Schema.Number,
    }),
  ),
  viewport: Schema.Struct({
    width: NonNegativeInt,
    height: NonNegativeInt,
    deviceScaleFactor: Schema.optionalKey(
      Schema.Number.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(8)),
    ),
  }),
  scroll: Schema.Struct({
    x: NonNegativeInt,
    y: NonNegativeInt,
  }),
  pageZoom: Schema.optionalKey(Schema.Number.check(Schema.isGreaterThan(0))),
  screenshotPixelSize: Schema.optionalKey(
    Schema.Struct({
      width: NonNegativeInt,
      height: NonNegativeInt,
    }),
  ),
});
export type BrowserAnnotationGeometry = typeof BrowserAnnotationGeometry.Type;

export const BrowserAnnotationTarget = Schema.Struct({
  kind: BrowserAnnotationTargetKind,
  element: Schema.optionalKey(BrowserElementSummary),
  targetResolution: Schema.optionalKey(BrowserTargetResolution),
  geometry: BrowserAnnotationGeometry,
  domSnippet: Schema.optionalKey(BrowserResolvedElementDomSnippet),
  computedStyle: Schema.optionalKey(BrowserResolvedElementStyleSummary),
});
export type BrowserAnnotationTarget = typeof BrowserAnnotationTarget.Type;

export const BrowserAnnotationResolveTargetAtPointInput = Schema.Struct({
  browserSessionId: BrowserSessionId,
  point: Schema.Struct({
    x: NonNegativeInt.check(Schema.isLessThanOrEqualTo(BROWSER_MAX_VIEWPORT_WIDTH)),
    y: NonNegativeInt.check(Schema.isLessThanOrEqualTo(BROWSER_MAX_VIEWPORT_HEIGHT)),
  }),
  geometryContext: Schema.Struct({
    viewport: Schema.Struct({
      width: NonNegativeInt,
      height: NonNegativeInt,
      deviceScaleFactor: Schema.optionalKey(
        Schema.Number.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(8)),
      ),
    }),
    scroll: Schema.Struct({
      x: NonNegativeInt,
      y: NonNegativeInt,
    }),
    screenshotPixelSize: Schema.optionalKey(
      Schema.Struct({
        width: NonNegativeInt,
        height: NonNegativeInt,
      }),
    ),
  }),
  includeDomSnippet: Schema.optionalKey(Schema.Boolean),
  includeComputedStyle: Schema.optionalKey(Schema.Boolean),
});
export type BrowserAnnotationResolveTargetAtPointInput =
  typeof BrowserAnnotationResolveTargetAtPointInput.Type;

export const BrowserAnnotationResolveTargetAtPointResult = Schema.Struct({
  browserSessionId: BrowserSessionId,
  runtimeTruth: BrowserRuntimeTruth,
  url: TrimmedNonEmptyString.check(Schema.isMaxLength(BROWSER_MAX_URL_LENGTH)),
  targetResolution: BrowserTargetResolution,
  element: Schema.optionalKey(BrowserElementSummary),
  geometry: BrowserAnnotationGeometry,
  screenshotArtifactRef: Schema.optionalKey(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  evidenceRefs: Schema.Array(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  domSnippet: Schema.optionalKey(BrowserResolvedElementDomSnippet),
  computedStyle: Schema.optionalKey(BrowserResolvedElementStyleSummary),
});
export type BrowserAnnotationResolveTargetAtPointResult =
  typeof BrowserAnnotationResolveTargetAtPointResult.Type;

export const BrowserAnnotation = Schema.Struct({
  id: BrowserAnnotationId,
  threadId: ThreadId,
  sessionId: Schema.optional(BrowserSessionId),
  browserSessionId: Schema.optional(BrowserSessionId),
  previewTargetId: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  workflowRunId: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
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
  status: Schema.optional(BrowserAnnotationStatus),
  target: Schema.optionalKey(BrowserAnnotationTarget),
  artifactRefs: Schema.optionalKey(
    Schema.Array(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  ),
  screenshotArtifactRef: Schema.optionalKey(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  cropArtifactRef: Schema.optionalKey(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  domSnippetArtifactRef: Schema.optionalKey(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  styleSummaryArtifactRef: Schema.optionalKey(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  createdAt: IsoDateTime,
  updatedAt: Schema.optional(IsoDateTime),
  resolvedAt: Schema.optional(IsoDateTime),
  reopenedAt: Schema.optional(IsoDateTime),
});
export type BrowserAnnotation = typeof BrowserAnnotation.Type;

export const BrowserAddAnnotationInput = Schema.Struct({
  threadId: ThreadId,
  sessionId: Schema.optional(BrowserSessionId),
  browserSessionId: Schema.optional(BrowserSessionId),
  previewTargetId: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  workflowRunId: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
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
  target: Schema.optionalKey(BrowserAnnotationTarget),
  fullScreenshotArtifactRef: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
  browserInspectionRef: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(128))),
});
export type BrowserAddAnnotationInput = typeof BrowserAddAnnotationInput.Type;

export const BrowserListAnnotationsInput = Schema.Struct({
  threadId: ThreadId,
  sessionId: Schema.optional(BrowserSessionId),
  browserSessionId: Schema.optional(BrowserSessionId),
  includeResolved: Schema.optional(Schema.Boolean),
});
export type BrowserListAnnotationsInput = typeof BrowserListAnnotationsInput.Type;

export const BrowserAnnotationInput = Schema.Struct({
  annotationId: BrowserAnnotationId,
});
export type BrowserAnnotationInput = typeof BrowserAnnotationInput.Type;

export const BrowserAnnotationResult = Schema.Struct({
  annotation: BrowserAnnotation,
  annotations: Schema.Array(BrowserAnnotation),
});
export type BrowserAnnotationResult = typeof BrowserAnnotationResult.Type;

export const BrowserAnnotationsResult = Schema.Struct({
  annotations: Schema.Array(BrowserAnnotation),
});
export type BrowserAnnotationsResult = typeof BrowserAnnotationsResult.Type;
