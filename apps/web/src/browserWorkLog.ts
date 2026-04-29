import type {
  BrowserAction,
  BrowserApprovalRisk,
  BrowserApprovalStatus,
} from "@orchestrate/contracts";
import type {
  EmbeddedBrowserSession,
  EmbeddedBrowserSessionSource,
} from "./embeddedBrowserStateStore";
import {
  browserActionStatusLabel as presentBrowserActionStatusLabel,
  browserObservationTitle,
  browserRuntimeEvidenceLabel,
  browserSurfaceModeLabel,
} from "./orchestratorPresentation";
import type { WorkLogEntry } from "./session-logic";

export interface BrowserScreenshotDataUrls {
  thumbnailDataUrl: string;
  fullDataUrl?: string;
}

export interface BrowserRuntimeTruthSummary {
  runtimeKind: string;
  surfaceMode: string;
  isUserVisibleSurface: boolean;
  urlAgreement?: string;
}

export interface BrowserEvidenceWorkSummary {
  title: string;
  statusLabel: string;
  runtimeLabel: string;
  runtimeKind: string;
  surfaceMode: string;
  isDurable: boolean;
  observedUrl?: string;
  visiblePanelUrl?: string;
  urlAgreement?: string;
  screenshotArtifactRef?: string;
  evidenceRefs: string[];
  screenshot?: BrowserScreenshotDataUrls;
}

export interface ReviewerDecisionWorkSummary {
  outcome: string;
  purpose?: string;
  confidence?: string;
  gates: Array<{ name: string; status: string; message?: string }>;
  criterionResults: Array<{ criterionId: string; status: string; reason?: string }>;
  findings: Array<{ severity: string; title: string; description?: string }>;
  actionPacket?: {
    kind: string;
    recommendedNextActions: string[];
    focusedRoutes: string[];
    relevantEvidenceRefs: string[];
  };
  evidenceBundleId?: string;
  userVisibleSummaryRef?: string;
}

export interface BrowserApprovalWorkSummary {
  approvalId: string;
  browserSessionId?: string;
  action?: BrowserAction;
  actionHash?: string;
  risk: BrowserApprovalRisk | "unknown";
  reason?: string;
  status: BrowserApprovalStatus | "pending";
  targetLabel?: string;
  origin?: string;
  observedUrl?: string;
  evidenceRefs: string[];
  detailsUnavailable?: boolean;
}

export interface BrowserTargetedActionWorkSummary {
  readonly title: string;
  readonly actionKind: "clickTarget" | "fillTarget";
  readonly targetLabel: string;
  readonly status: "ok" | "blocked" | "requires-approval" | "failed" | "unknown";
  readonly reason?: string;
  readonly evidenceRefs: readonly string[];
}

export interface BrowserControlWorkSummary {
  label: string;
  eventType: string;
  browserSessionId?: string;
  holder?: string;
  state?: string;
  reason?: string;
  evidenceRefs: string[];
}

export interface BrowserAnnotationWorkSummary {
  label: string;
  annotationId?: string;
  comment?: string;
  url?: string;
  targetLabel?: string;
  status?: string;
  cropArtifactRef?: string;
  evidenceRefs: string[];
}

export function stripOrchestrationToolPrefix(toolName: string | undefined): string | null {
  if (!toolName) return null;
  const trimmed = toolName.replace(/^mcp__orchestrate__/, "");
  return trimmed.startsWith("orchestrate_") ? trimmed : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readDataUrl(value: unknown): string | null {
  return typeof value === "string" && value.startsWith("data:image/") ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readArray(value: unknown): ReadonlyArray<unknown> {
  return Array.isArray(value) ? value : [];
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function parseJsonLikeString(value: string): unknown | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function parseWorkPayload(value: unknown): unknown {
  if (typeof value === "string") {
    return parseJsonLikeString(value) ?? value;
  }
  const record = readRecord(value);
  if (!record) return value;
  const payloadJson = readString(record.payloadJson);
  if (payloadJson) {
    const parsed = parseJsonLikeString(payloadJson);
    if (parsed !== null) return parsed;
  }
  return value;
}

function looksLikeBrowserObservation(value: Record<string, unknown> | null): boolean {
  return (
    typeof value?.url === "string" &&
    (typeof value.sessionId === "string" ||
      typeof value.observedAt === "string" ||
      Array.isArray(value.targets) ||
      typeof value.title === "string")
  );
}

function findBrowserObservation(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): Record<string, unknown> | null {
  if (depth > 8) {
    return null;
  }

  if (typeof value === "string") {
    const parsed = parseJsonLikeString(value);
    return parsed === null ? null : findBrowserObservation(parsed, depth + 1, seen);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const observation = findBrowserObservation(item, depth + 1, seen);
      if (observation) {
        return observation;
      }
    }
    return null;
  }

  const record = readRecord(value);
  if (!record) {
    return null;
  }
  if (seen.has(record)) {
    return null;
  }
  seen.add(record);

  const directObservation = readRecord(record.observation);
  if (looksLikeBrowserObservation(directObservation)) {
    return directObservation;
  }
  if (looksLikeBrowserObservation(record)) {
    return record;
  }

  for (const key of ["result", "data", "payload", "output", "response", "content", "text"]) {
    const observation = findBrowserObservation(record[key], depth + 1, seen);
    if (observation) {
      return observation;
    }
  }

  return null;
}

function looksLikeReviewerDecision(value: Record<string, unknown> | null): boolean {
  return (
    typeof value?.outcome === "string" &&
    typeof value.evidenceBundleId === "string" &&
    typeof value.userVisibleSummaryRef === "string"
  );
}

function looksLikeBrowserApproval(value: Record<string, unknown> | null): boolean {
  return (
    typeof value?.id === "string" &&
    typeof value.browserSessionId === "string" &&
    typeof readRecord(value.action)?.kind === "string" &&
    typeof value.status === "string"
  );
}

function looksLikeBrowserApprovalResult(value: Record<string, unknown> | null): boolean {
  return (
    typeof value?.approvalRequestId === "string" &&
    typeof value.status === "string" &&
    value.status === "requires-approval"
  );
}

function isBrowserApprovalEventType(value: string | null): boolean {
  return (
    value === "BrowserApprovalRequestCreated" ||
    value === "BrowserApprovalRequested" ||
    value === "BrowserApprovalApproved" ||
    value === "BrowserApprovalRejected" ||
    value === "BrowserApprovalExpired" ||
    value === "BrowserApprovalConsumed"
  );
}

function looksLikeBrowserAction(value: Record<string, unknown> | null): boolean {
  return typeof value?.kind === "string";
}

function findBrowserActionLike(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): Record<string, unknown> | null {
  if (depth > 6) return null;
  if (typeof value === "string") {
    const parsed = parseJsonLikeString(value);
    return parsed === null ? null : findBrowserActionLike(parsed, depth + 1, seen);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const action = findBrowserActionLike(item, depth + 1, seen);
      if (action) return action;
    }
    return null;
  }
  const record = readRecord(value);
  if (!record) return null;
  if (seen.has(record)) return null;
  seen.add(record);

  const directAction = readRecord(record.action);
  if (looksLikeBrowserAction(directAction)) return directAction;
  if (looksLikeBrowserAction(record)) return record;

  for (const key of ["result", "data", "payload", "input", "content", "text"]) {
    const action = findBrowserActionLike(record[key], depth + 1, seen);
    if (action) return action;
  }
  return null;
}

function findBrowserApprovalLike(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): Record<string, unknown> | null {
  if (depth > 8) return null;
  if (typeof value === "string") {
    const parsed = parseJsonLikeString(value);
    return parsed === null ? null : findBrowserApprovalLike(parsed, depth + 1, seen);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const approval = findBrowserApprovalLike(item, depth + 1, seen);
      if (approval) return approval;
    }
    return null;
  }
  const record = readRecord(value);
  if (!record) return null;
  if (seen.has(record)) return null;
  seen.add(record);

  const parsedPayload = parseWorkPayload(record.payload ?? record.payloadJson);
  if (
    parsedPayload !== record &&
    parsedPayload !== record.payload &&
    parsedPayload !== record.payloadJson
  ) {
    const approval = findBrowserApprovalLike(parsedPayload, depth + 1, seen);
    if (approval) return approval;
  }

  const directApproval = readRecord(record.approval);
  if (looksLikeBrowserApproval(directApproval)) return directApproval;
  if (looksLikeBrowserApproval(record)) return record;
  if (looksLikeBrowserApprovalResult(record)) return record;

  const eventType = readString(record.type) ?? readString(record.eventType);
  if (isBrowserApprovalEventType(eventType)) return record;

  for (const key of ["result", "data", "payload", "output", "response", "content", "text"]) {
    const approval = findBrowserApprovalLike(record[key], depth + 1, seen);
    if (approval) return approval;
  }
  return null;
}

function findBrowserControlEventLike(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): Record<string, unknown> | null {
  if (depth > 8) return null;
  if (typeof value === "string") {
    const parsed = parseJsonLikeString(value);
    return parsed === null ? null : findBrowserControlEventLike(parsed, depth + 1, seen);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const event = findBrowserControlEventLike(item, depth + 1, seen);
      if (event) return event;
    }
    return null;
  }
  const record = readRecord(value);
  if (!record) return null;
  if (seen.has(record)) return null;
  seen.add(record);

  const parsedPayload = parseWorkPayload(record.payload ?? record.payloadJson);
  const parsedPayloadRecord = readRecord(parsedPayload);
  const type =
    readString(record.type) ??
    readString(record.eventType) ??
    readString(parsedPayloadRecord?.type) ??
    readString(parsedPayloadRecord?.eventType);
  if (type?.startsWith("BrowserControl")) return record;

  for (const key of ["result", "data", "payload", "output", "response", "content", "text"]) {
    const event = findBrowserControlEventLike(record[key], depth + 1, seen);
    if (event) return event;
  }
  return null;
}

function isBrowserAnnotationEventType(value: string | null): boolean {
  return (
    value === "BrowserAnnotationCreated" ||
    value === "BrowserAnnotationResolved" ||
    value === "BrowserAnnotationReopened"
  );
}

function looksLikeBrowserAnnotation(value: Record<string, unknown> | null): boolean {
  return (
    typeof value?.id === "string" &&
    typeof value.comment === "string" &&
    typeof value.url === "string"
  );
}

function findBrowserAnnotationLike(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): Record<string, unknown> | null {
  if (depth > 8) return null;
  if (typeof value === "string") {
    const parsed = parseJsonLikeString(value);
    return parsed === null ? null : findBrowserAnnotationLike(parsed, depth + 1, seen);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const annotation = findBrowserAnnotationLike(item, depth + 1, seen);
      if (annotation) return annotation;
    }
    return null;
  }
  const record = readRecord(value);
  if (!record) return null;
  if (seen.has(record)) return null;
  seen.add(record);

  const parsedPayload = parseWorkPayload(record.payload ?? record.payloadJson);
  if (
    parsedPayload !== record &&
    parsedPayload !== record.payload &&
    parsedPayload !== record.payloadJson
  ) {
    const annotation = findBrowserAnnotationLike(parsedPayload, depth + 1, seen);
    if (annotation) return annotation;
  }

  const directAnnotation = readRecord(record.annotation);
  if (looksLikeBrowserAnnotation(directAnnotation)) return directAnnotation;
  if (looksLikeBrowserAnnotation(record)) return record;

  const eventType = readString(record.type) ?? readString(record.eventType);
  if (isBrowserAnnotationEventType(eventType)) return record;

  for (const key of ["result", "data", "payload", "input", "content", "text"]) {
    const annotation = findBrowserAnnotationLike(record[key], depth + 1, seen);
    if (annotation) return annotation;
  }
  return null;
}

function findReviewerDecision(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): Record<string, unknown> | null {
  if (depth > 8) return null;
  if (typeof value === "string") {
    const parsed = parseJsonLikeString(value);
    return parsed === null ? null : findReviewerDecision(parsed, depth + 1, seen);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const decision = findReviewerDecision(item, depth + 1, seen);
      if (decision) return decision;
    }
    return null;
  }
  const record = readRecord(value);
  if (!record) return null;
  if (seen.has(record)) return null;
  seen.add(record);

  const directDecision = readRecord(record.decision);
  if (looksLikeReviewerDecision(directDecision)) return directDecision;
  if (looksLikeReviewerDecision(record)) return record;

  for (const key of ["result", "data", "payload", "output", "response", "content", "text"]) {
    const decision = findReviewerDecision(record[key], depth + 1, seen);
    if (decision) return decision;
  }
  return null;
}

function readGateSummaries(value: unknown): ReviewerDecisionWorkSummary["gates"] {
  return readArray(value)
    .map(readRecord)
    .flatMap((item) =>
      typeof item?.name === "string" && typeof item.status === "string"
        ? [
            {
              name: item.name,
              status: item.status,
              ...(readString(item.message) ? { message: readString(item.message)! } : {}),
            },
          ]
        : [],
    );
}

function readCriterionSummaries(value: unknown): ReviewerDecisionWorkSummary["criterionResults"] {
  return readArray(value)
    .map(readRecord)
    .flatMap((item) =>
      typeof item?.criterionId === "string" && typeof item.status === "string"
        ? [
            {
              criterionId: item.criterionId,
              status: item.status,
              ...(readString(item.reason) ? { reason: readString(item.reason)! } : {}),
            },
          ]
        : [],
    );
}

function readFindingSummaries(value: unknown): ReviewerDecisionWorkSummary["findings"] {
  return readArray(value)
    .map(readRecord)
    .flatMap((item) =>
      typeof item?.severity === "string" && typeof item.title === "string"
        ? [
            {
              severity: item.severity,
              title: item.title,
              ...(readString(item.description)
                ? { description: readString(item.description)! }
                : {}),
            },
          ]
        : [],
    );
}

export function reviewerDecisionWorkSummary(
  workEntry: WorkLogEntry,
): ReviewerDecisionWorkSummary | null {
  const decision = findReviewerDecision(workEntry.output ?? workEntry.detail);
  if (!decision) return null;
  const actionPacket = readRecord(decision.actionPacket);
  return {
    outcome: String(decision.outcome),
    ...(readString(decision.purpose) ? { purpose: readString(decision.purpose)! } : {}),
    ...(readString(decision.confidence) ? { confidence: readString(decision.confidence)! } : {}),
    gates: readGateSummaries(decision.gates),
    criterionResults: readCriterionSummaries(decision.criterionResults ?? decision.criteria),
    findings: readFindingSummaries(decision.findings),
    ...(actionPacket && readString(actionPacket.kind)
      ? {
          actionPacket: {
            kind: readString(actionPacket.kind)!,
            recommendedNextActions: readStringArray(actionPacket.recommendedNextActions),
            focusedRoutes: readStringArray(actionPacket.focusedRoutes),
            relevantEvidenceRefs: readStringArray(actionPacket.relevantEvidenceRefs),
          },
        }
      : {}),
    ...(readString(decision.evidenceBundleId)
      ? { evidenceBundleId: readString(decision.evidenceBundleId)! }
      : {}),
    ...(readString(decision.userVisibleSummaryRef)
      ? { userVisibleSummaryRef: readString(decision.userVisibleSummaryRef)! }
      : {}),
  };
}

export function browserApprovalWorkSummary(
  workEntry: WorkLogEntry,
): BrowserApprovalWorkSummary | null {
  const candidate = findBrowserApprovalLike(workEntry.output ?? workEntry.detail);
  if (!candidate) return null;

  const payload = readRecord(parseWorkPayload(candidate.payload ?? candidate.payloadJson));
  const source = payload ?? candidate;
  const eventType =
    readString(candidate.type) ??
    readString(candidate.eventType) ??
    readString(source.type) ??
    readString(source.eventType);
  const eventApproval = readRecord(source.approval);
  const approvalCandidate =
    looksLikeBrowserApproval(eventApproval) && eventApproval ? eventApproval : candidate;
  const embeddedApproval = looksLikeBrowserApproval(candidate);
  const action =
    readRecord(approvalCandidate.action) ??
    readRecord(source.action) ??
    findBrowserActionLike(workEntry.detail ?? workEntry.output);
  const resolvedTarget =
    readRecord(approvalCandidate.resolvedTarget) ?? readRecord(source.resolvedTarget);
  const observation = findBrowserObservation(workEntry.output ?? workEntry.detail);
  const runtimeTruth = readRecord(observation?.runtimeTruth);
  const approvalId =
    readString(approvalCandidate.id) ??
    readString(source.approvalId) ??
    readString(candidate.approvalId) ??
    readString(candidate.approvalRequestId);
  const browserSessionId =
    readString(approvalCandidate.browserSessionId) ??
    readString(source.browserSessionId) ??
    readString(observation?.sessionId) ??
    readString(runtimeTruth?.browserSessionId);
  if (!approvalId) {
    return null;
  }
  const detailsUnavailable = !browserSessionId || !action || typeof action.kind !== "string";

  const risk = readString(approvalCandidate.risk) ?? readString(source.risk) ?? "unknown";
  const rawStatus =
    readString(approvalCandidate.status) ??
    readString(source.status) ??
    (eventType === "BrowserApprovalApproved"
      ? "approved"
      : eventType === "BrowserApprovalRejected"
        ? "rejected"
        : eventType === "BrowserApprovalExpired"
          ? "expired"
          : eventType === "BrowserApprovalConsumed"
            ? "consumed"
            : "pending");
  const screenshotArtifactRef =
    readString(runtimeTruth?.screenshotArtifactRef) ??
    readString(observation?.screenshotArtifactRef);
  const evidenceRefs = Array.from(
    new Set([
      ...readStringArray(approvalCandidate.evidenceRefs),
      ...readStringArray(source.evidenceRefs),
      ...readStringArray(candidate.artifactRefs),
      ...readStringArray(runtimeTruth?.evidenceRefs),
      ...readStringArray(observation?.evidenceRefs),
      ...(screenshotArtifactRef ? [screenshotArtifactRef] : []),
    ]),
  );
  const targetLabel =
    browserElementSummaryLabel(resolvedTarget) ??
    (action ? browserElementTargetLabel(readRecord(action)?.target) : null);
  return {
    approvalId,
    ...(browserSessionId ? { browserSessionId } : {}),
    ...(action && typeof action.kind === "string" ? { action: action as BrowserAction } : {}),
    risk: risk as BrowserApprovalWorkSummary["risk"],
    status:
      embeddedApproval || isBrowserApprovalEventType(eventType)
        ? (rawStatus as BrowserApprovalWorkSummary["status"])
        : "pending",
    ...(targetLabel ? { targetLabel } : {}),
    evidenceRefs,
    ...(detailsUnavailable ? { detailsUnavailable: true } : {}),
    ...((readString(approvalCandidate.actionHash) ?? readString(source.actionHash))
      ? { actionHash: (readString(approvalCandidate.actionHash) ?? readString(source.actionHash))! }
      : {}),
    ...((readString(approvalCandidate.reason) ?? readString(source.reason))
      ? { reason: (readString(approvalCandidate.reason) ?? readString(source.reason))! }
      : {}),
    ...((readString(approvalCandidate.origin) ?? readString(source.origin))
      ? { origin: (readString(approvalCandidate.origin) ?? readString(source.origin))! }
      : {}),
    ...((readString(approvalCandidate.observedUrl) ?? readString(source.observedUrl))
      ? {
          observedUrl: (readString(approvalCandidate.observedUrl) ??
            readString(source.observedUrl))!,
        }
      : readString(observation?.url)
        ? { observedUrl: readString(observation?.url)! }
        : {}),
  };
}

function browserElementTargetLabel(target: unknown): string {
  const record = readRecord(target);
  const kind = readString(record?.kind);
  if (kind === "selector") return readString(record?.selector) ?? "selector target";
  if (kind === "test-id") return readString(record?.testId) ?? "test id target";
  if (kind === "role-name") {
    const role = readString(record?.role);
    const name = readString(record?.name);
    return [role, name].filter(Boolean).join(" ") || "role target";
  }
  if (kind === "text") return readString(record?.text) ?? "text target";
  if (kind === "element-ref") return readString(record?.elementId) ?? "element target";
  if (kind === "point") return `point ${String(record?.x ?? "?")},${String(record?.y ?? "?")}`;
  return "target";
}

function browserElementSummaryLabel(target: unknown): string | null {
  const record = readRecord(target);
  if (!record) return null;
  const role = readString(record.role);
  const name = readString(record.name);
  const testId = readString(record.testId);
  const text = readString(record.text);
  const tagName = readString(record.tagName);
  if (role && name) return `${role} ${name}`;
  if (name) return name;
  if (testId) return testId;
  if (text) return text;
  if (tagName) return tagName;
  return null;
}

export function browserTargetedActionWorkSummary(
  workEntry: WorkLogEntry,
): BrowserTargetedActionWorkSummary | null {
  const parsed = readRecord(parseWorkPayload(workEntry.output ?? workEntry.detail));
  const action = findBrowserActionLike(parsed ?? workEntry.detail ?? workEntry.output);
  if (!action || (action.kind !== "clickTarget" && action.kind !== "fillTarget")) return null;
  const resolvedTarget = readRecord(parsed?.resolvedTarget) ?? readRecord(parsed?.target);
  const targetResolution = readRecord(parsed?.targetResolution);
  const evidenceRefs = Array.from(
    new Set([
      ...readStringArray(parsed?.evidenceRefs),
      ...readStringArray(parsed?.artifactRefs),
      ...(readString(parsed?.screenshotArtifactRef)
        ? [readString(parsed?.screenshotArtifactRef)!]
        : []),
    ]),
  );
  const status = readString(parsed?.status) as BrowserTargetedActionWorkSummary["status"] | null;
  const targetLabel =
    browserElementSummaryLabel(resolvedTarget) ?? browserElementTargetLabel(action.target);
  const verb = action.kind === "clickTarget" ? "Clicked" : "Filled";
  const resolutionStatus = readString(targetResolution?.status);
  return {
    title:
      status === "requires-approval"
        ? `${verb} ${targetLabel} — approval required`
        : resolutionStatus === "not-found"
          ? action.kind === "fillTarget"
            ? "Could not fill target — target not found"
            : "Could not click target — target not found"
          : resolutionStatus === "ambiguous"
            ? action.kind === "fillTarget"
              ? "Could not fill target — multiple matches"
              : "Could not click target — multiple matches"
            : resolutionStatus === "not-actionable"
              ? action.kind === "fillTarget"
                ? "Could not fill target — not an input"
                : "Could not click target"
              : status === "blocked" || status === "failed"
                ? action.kind === "fillTarget"
                  ? "Could not fill target"
                  : "Could not click target"
                : `${verb} ${targetLabel}`,
    actionKind: action.kind,
    targetLabel,
    status: status ?? "unknown",
    evidenceRefs,
    ...(readString(parsed?.reason) ? { reason: readString(parsed?.reason)! } : {}),
  };
}

export function browserControlWorkSummary(
  workEntry: WorkLogEntry,
): BrowserControlWorkSummary | null {
  const event = findBrowserControlEventLike(workEntry.output ?? workEntry.detail);
  if (!event) return null;

  const payload = readRecord(parseWorkPayload(event.payload ?? event.payloadJson)) ?? event;
  const eventType =
    readString(event.type) ??
    readString(event.eventType) ??
    readString(payload.type) ??
    readString(payload.eventType);
  if (!eventType) return null;
  const lease = readRecord(payload.lease);
  const evidenceRefs = Array.from(
    new Set([
      ...readStringArray(event.artifactRefs),
      ...readStringArray(payload.artifactRefs),
      ...(readString(payload.observationRef) ? [readString(payload.observationRef)!] : []),
      ...(readString(lease?.snapshotAfterReleaseRef)
        ? [readString(lease?.snapshotAfterReleaseRef)!]
        : []),
      ...(readString(lease?.lastObservationRef) ? [readString(lease?.lastObservationRef)!] : []),
    ]),
  );
  const label =
    eventType === "BrowserControlHumanInputDetected" ||
    eventType === "BrowserControlHumanControlTaken"
      ? "Human took control"
      : eventType === "BrowserControlLeaseAcquired"
        ? lease?.holder === "agent"
          ? "Agent control active"
          : lease?.holder === "human"
            ? "Human took control"
            : "Browser control updated"
        : eventType === "BrowserControlLeaseReleased"
          ? "Control released"
          : eventType === "BrowserControlFreshObservationRequired"
            ? "Fresh observation required"
            : eventType === "BrowserControlFreshObservationSatisfied"
              ? "Fresh observation captured"
              : eventType === "BrowserControlAgentPaused"
                ? "Agent paused"
                : eventType === "BrowserControlAgentResumed"
                  ? "Agent resumed"
                  : "Browser control updated";

  return {
    label,
    eventType,
    evidenceRefs,
    ...(readString(lease?.browserSessionId)
      ? { browserSessionId: readString(lease?.browserSessionId)! }
      : {}),
    ...(readString(lease?.holder) ? { holder: readString(lease?.holder)! } : {}),
    ...(readString(lease?.state) ? { state: readString(lease?.state)! } : {}),
    ...(readString(payload.reason) ? { reason: readString(payload.reason)! } : {}),
  };
}

export function browserAnnotationWorkSummary(
  workEntry: Pick<WorkLogEntry, "output" | "detail">,
): BrowserAnnotationWorkSummary | null {
  const candidate = findBrowserAnnotationLike(workEntry.output ?? workEntry.detail);
  const source = readRecord(parseWorkPayload(workEntry.output ?? workEntry.detail));
  const eventType =
    readString(source?.type) ??
    readString(source?.eventType) ??
    readString(readRecord(source?.payload)?.type) ??
    null;
  if (!candidate && !isBrowserAnnotationEventType(eventType)) return null;
  const annotation = readRecord(candidate?.annotation) ?? candidate;
  const label =
    eventType === "BrowserAnnotationResolved"
      ? "Browser comment resolved"
      : eventType === "BrowserAnnotationReopened"
        ? "Browser comment reopened"
        : "Browser comment added";
  const target = readRecord(annotation?.target);
  const element = readRecord(target?.element);
  const targetLabel =
    browserElementSummaryLabel(element) ??
    readString(annotation?.targetLabel) ??
    readString(readRecord(annotation?.targetResolution)?.requested) ??
    undefined;
  const evidenceRefs = readStringArray(annotation?.artifactRefs ?? source?.artifactRefs);
  const cropArtifactRef =
    readString(annotation?.cropArtifactRef) ??
    evidenceRefs.find((ref) => ref.includes("screenshot-crop"));
  const annotationId = readString(annotation?.id) ?? readString(candidate?.annotationId);
  const comment = readString(annotation?.comment);
  const url = readString(annotation?.url);
  const status = readString(annotation?.status);
  return {
    label,
    ...(annotationId ? { annotationId } : {}),
    ...(comment ? { comment } : {}),
    ...(url ? { url } : {}),
    ...(targetLabel ? { targetLabel } : {}),
    ...(status ? { status } : {}),
    ...(cropArtifactRef ? { cropArtifactRef } : {}),
    evidenceRefs,
  };
}

function browserTitleFromUrl(url: string): string {
  try {
    return new URL(url).hostname || "Browser";
  } catch {
    return "Browser";
  }
}

function summarizeBrowserWorkEntry(workEntry: WorkLogEntry): string {
  const toolName = stripOrchestrationToolPrefix(workEntry.toolName);
  if (toolName === "orchestrate_browser_open_session") {
    return "Opened browser session";
  }
  if (toolName !== "orchestrate_browser_act") {
    return workEntry.label;
  }

  const detail = workEntry.detail ?? "";
  if (detail.includes('"kind":"navigate"') || detail.includes('"kind": "navigate"')) {
    return "Navigated browser";
  }
  if (detail.includes('"kind":"scroll"') || detail.includes('"kind": "scroll"')) {
    return "Scrolled page";
  }
  if (detail.includes('"kind":"resize"') || detail.includes('"kind": "resize"')) {
    return "Resized browser viewport";
  }
  if (detail.includes('"kind":"evaluate"') || detail.includes('"kind": "evaluate"')) {
    return "Evaluated page";
  }
  if (detail.includes('"kind":"click"') || detail.includes('"kind": "click"')) {
    return "Clicked page";
  }
  if (detail.includes('"kind":"type"') || detail.includes('"kind": "type"')) {
    return "Typed into page";
  }
  return "Updated browser observation";
}

function parseBrowserToolObservation(workEntry: WorkLogEntry): Record<string, unknown> | null {
  const toolName = stripOrchestrationToolPrefix(workEntry.toolName);
  if (toolName !== "orchestrate_browser_open_session" && toolName !== "orchestrate_browser_act") {
    return null;
  }
  if (!workEntry.output) {
    return null;
  }
  return findBrowserObservation(workEntry.output);
}

export function browserScreenshotDataUrls(
  workEntry: WorkLogEntry,
): BrowserScreenshotDataUrls | null {
  const observation = parseBrowserToolObservation(workEntry);
  if (!observation) {
    return null;
  }

  const screenshot = readRecord(observation.screenshot);
  const previewDataUrl =
    readDataUrl(observation.previewScreenshotDataUrl) ?? readDataUrl(screenshot?.previewDataUrl);
  const fullDataUrl =
    readDataUrl(observation.screenshotDataUrl) ??
    readDataUrl(observation.fullPageScreenshotDataUrl) ??
    readDataUrl(screenshot?.dataUrl);
  const thumbnailDataUrl = previewDataUrl ?? fullDataUrl;
  if (!thumbnailDataUrl) {
    return null;
  }
  return {
    thumbnailDataUrl,
    ...(fullDataUrl ? { fullDataUrl } : {}),
  };
}

export function browserRuntimeTruthSummary(
  workEntry: WorkLogEntry,
): BrowserRuntimeTruthSummary | null {
  const observation = parseBrowserToolObservation(workEntry);
  if (!observation) {
    return null;
  }
  const runtimeTruth = readRecord(observation.runtimeTruth);
  const runtimeKind = readString(runtimeTruth?.runtimeKind) ?? readString(observation.runtimeKind);
  const surfaceMode = readString(runtimeTruth?.surfaceMode) ?? readString(observation.surfaceMode);
  const isUserVisibleSurface =
    readBoolean(runtimeTruth?.isUserVisibleSurface) ??
    readBoolean(observation.isUserVisibleSurface);
  if (!runtimeKind || !surfaceMode || isUserVisibleSurface === null) {
    return null;
  }
  return {
    runtimeKind,
    surfaceMode,
    isUserVisibleSurface,
    ...((readString(runtimeTruth?.urlAgreement) ?? readString(observation.urlAgreement))
      ? {
          urlAgreement:
            readString(runtimeTruth?.urlAgreement) ?? readString(observation.urlAgreement)!,
        }
      : {}),
  };
}

export function browserRuntimeTruthLabel(workEntry: WorkLogEntry): string | null {
  const truth = browserRuntimeTruthSummary(workEntry);
  if (!truth) {
    return null;
  }
  const surface = browserSurfaceModeLabel(truth.surfaceMode);
  const visibility = truth.isUserVisibleSurface ? "same surface" : "not the visible browser";
  const agreement =
    truth.urlAgreement && truth.urlAgreement !== "unknown" ? ` · URL ${truth.urlAgreement}` : "";
  return `${surface} · ${truth.runtimeKind} · ${visibility}${agreement}`;
}

export function browserEvidenceWorkSummary(
  workEntry: WorkLogEntry,
): BrowserEvidenceWorkSummary | null {
  const observation = parseBrowserToolObservation(workEntry);
  if (!observation) return null;

  const runtimeTruth = readRecord(observation.runtimeTruth);
  const runtimeKind =
    readString(runtimeTruth?.runtimeKind) ?? readString(observation.runtimeKind) ?? "unknown";
  const surfaceMode =
    readString(runtimeTruth?.surfaceMode) ??
    readString(observation.surfaceMode) ??
    "static-screenshot-evidence";
  const observedUrl =
    readString(runtimeTruth?.observedUrl) ??
    readString(observation.observedUrl) ??
    readString(observation.url) ??
    undefined;
  const visiblePanelUrl =
    readString(runtimeTruth?.visiblePanelUrl) ??
    readString(observation.visiblePanelUrl) ??
    undefined;
  const urlAgreement =
    readString(runtimeTruth?.urlAgreement) ?? readString(observation.urlAgreement) ?? undefined;
  const screenshotArtifactRef =
    readString(runtimeTruth?.screenshotArtifactRef) ??
    readString(observation.screenshotArtifactRef) ??
    undefined;
  const evidenceRefs = Array.from(
    new Set([
      ...readStringArray(runtimeTruth?.evidenceRefs),
      ...readStringArray(observation.evidenceRefs),
      ...(screenshotArtifactRef ? [screenshotArtifactRef] : []),
    ]),
  );
  const isDurable = evidenceRefs.length > 0 || Boolean(screenshotArtifactRef);
  const runtimeLabel = browserRuntimeEvidenceLabel({ surfaceMode, isDurable });
  const hasScreenshot = Boolean(screenshotArtifactRef || browserScreenshotDataUrls(workEntry));
  return {
    title: browserObservationTitle({ isChecking: workEntry.tone === "thinking" }),
    statusLabel: presentBrowserActionStatusLabel({
      label: workEntry.label,
      toolTitle: workEntry.toolTitle,
      detail: workEntry.detail,
      hasScreenshot,
    }),
    runtimeLabel,
    runtimeKind,
    surfaceMode,
    isDurable,
    ...(observedUrl ? { observedUrl } : {}),
    ...(visiblePanelUrl ? { visiblePanelUrl } : {}),
    ...(urlAgreement ? { urlAgreement } : {}),
    ...(screenshotArtifactRef ? { screenshotArtifactRef } : {}),
    evidenceRefs,
    ...(browserScreenshotDataUrls(workEntry)
      ? { screenshot: browserScreenshotDataUrls(workEntry)! }
      : {}),
  };
}

export function embeddedBrowserSessionFromBrowserWorkEntry(
  workEntry: WorkLogEntry,
  source: EmbeddedBrowserSessionSource,
): EmbeddedBrowserSession | null {
  const observation = parseBrowserToolObservation(workEntry);
  const screenshot = browserScreenshotDataUrls(workEntry);
  const url = readString(observation?.url);
  if (!observation || !screenshot || !url) {
    return null;
  }

  const title = readString(observation.title)?.trim() || browserTitleFromUrl(url);
  const sessionId = readString(observation.sessionId)?.trim() ?? "";
  const runtimeTruth = readRecord(observation.runtimeTruth);
  const screenshotArtifactRef =
    readString(runtimeTruth?.screenshotArtifactRef) ??
    readString(observation.screenshotArtifactRef);
  const evidenceRefs = [
    ...readStringArray(runtimeTruth?.evidenceRefs),
    ...readStringArray(observation.evidenceRefs),
  ];
  return {
    kind: "automation",
    openedAt: workEntry.createdAt,
    source,
    title,
    ...(sessionId ? { sessionId } : {}),
    url,
    readyState: readString(observation.readyState)?.trim() || "complete",
    observedAt: readString(observation.observedAt) ?? workEntry.createdAt,
    targetCount: readArray(observation.targets).length,
    textSummary: readString(observation.textSummary) ?? "",
    screenshotDataUrl: screenshot.fullDataUrl ?? screenshot.thumbnailDataUrl,
    ...(screenshotArtifactRef ? { screenshotArtifactRef } : {}),
    ...(evidenceRefs.length > 0 ? { evidenceRefs: Array.from(new Set(evidenceRefs)) } : {}),
    lastActionSummary: summarizeBrowserWorkEntry(workEntry),
  };
}

export function latestEmbeddedBrowserSessionFromBrowserWorkEntries(
  workLogEntries: readonly WorkLogEntry[],
  source: EmbeddedBrowserSessionSource,
): { entryId: string; session: EmbeddedBrowserSession } | null {
  for (let index = workLogEntries.length - 1; index >= 0; index -= 1) {
    const entry = workLogEntries[index];
    if (!entry) {
      continue;
    }
    const session = embeddedBrowserSessionFromBrowserWorkEntry(entry, source);
    if (session) {
      return { entryId: entry.id, session };
    }
  }
  return null;
}
