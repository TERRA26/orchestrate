import { createHash, randomUUID } from "node:crypto";

import {
  BROWSER_ORCHESTRATION_SCHEMA_VERSION,
  type BrowserObservation,
  type BrowserRuntimeTruth,
  EvidenceArtifactId,
  type EvidenceArtifactKind,
  SessionEventId,
} from "@orchestrate/contracts";
import { Effect, Layer } from "effect";

import { BrowserOrchestrationEvidenceRepository } from "../../persistence/Services/BrowserOrchestrationEvidence.ts";
import {
  BrowserEvidenceRecorder,
  type BrowserEvidenceRecorderShape,
  type BrowserEvidenceRecordResult,
  type BrowserEvidenceRuntimeContext,
} from "../Services/BrowserEvidenceRecorder.ts";

function now() {
  return new Date().toISOString();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function artifactId(kind: EvidenceArtifactKind, seed: string): EvidenceArtifactId {
  return EvidenceArtifactId.makeUnsafe(`${kind}-${sha256(seed).slice(0, 24)}`);
}

function contentTypeFromDataUrl(dataUrl: string): string {
  const match = /^data:([^;,]+)[;,]/.exec(dataUrl);
  return match?.[1] ?? "application/octet-stream";
}

function screenshotDataUrlFor(observation: BrowserObservation): string | undefined {
  return (
    observation.previewScreenshotDataUrl ??
    observation.screenshotDataUrl ??
    observation.fullPageScreenshotDataUrl
  );
}

function sanitizeObservation(observation: BrowserObservation) {
  const {
    screenshotDataUrl: _screenshotDataUrl,
    previewScreenshotDataUrl: _previewScreenshotDataUrl,
    fullPageScreenshotDataUrl: _fullPageScreenshotDataUrl,
    runtimeTruth,
    ...rest
  } = observation;
  return {
    ...rest,
    runtimeTruth: runtimeTruth
      ? {
          ...runtimeTruth,
          screenshotDataUrl: runtimeTruth.screenshotDataUrl
            ? "[legacy-data-url-redacted]"
            : undefined,
        }
      : undefined,
  };
}

function observationSummary(input: {
  readonly observation: BrowserObservation;
  readonly runtimeTruth: BrowserRuntimeTruth | undefined;
}) {
  const { observation, runtimeTruth } = input;
  return {
    browserSessionId: observation.sessionId,
    runtimeKind: runtimeTruth?.runtimeKind ?? observation.runtimeKind ?? "playwright-headless",
    surfaceMode:
      runtimeTruth?.surfaceMode ?? observation.surfaceMode ?? "headless-validation-mirror",
    isUserVisibleSurface:
      runtimeTruth?.isUserVisibleSurface ?? observation.isUserVisibleSurface ?? false,
    observedUrl: runtimeTruth?.observedUrl ?? observation.observedUrl ?? observation.url,
    visiblePanelUrl: runtimeTruth?.visiblePanelUrl ?? observation.visiblePanelUrl ?? null,
    urlAgreement: runtimeTruth?.urlAgreement ?? observation.urlAgreement ?? "unknown",
  };
}

export const BrowserEvidenceRecorderLive = Layer.effect(
  BrowserEvidenceRecorder,
  Effect.gen(function* () {
    const repository = yield* BrowserOrchestrationEvidenceRepository;

    const writeJsonArtifact = (
      context: BrowserEvidenceRuntimeContext,
      kind: EvidenceArtifactKind,
      payload: unknown,
      metadata: Record<string, unknown> = {},
    ) =>
      Effect.gen(function* () {
        const content = JSON.stringify(payload);
        const createdAt = now();
        const id = artifactId(kind, `${context.browserSessionId}:${kind}:${content}`);
        yield* repository.writeEvidenceArtifact({
          artifactId: id,
          schemaVersion: BROWSER_ORCHESTRATION_SCHEMA_VERSION,
          kind,
          sha256: sha256(content),
          byteSize: Buffer.byteLength(content),
          contentType: "application/json",
          storageUri: `sqlite://evidence_artifact_contents/${id}`,
          sensitivity: "workspace-internal",
          access: "safe-for-user-report",
          redactedArtifactId: null,
          supersededByArtifactId: null,
          metadataJson: JSON.stringify({
            browserSessionId: context.browserSessionId,
            previewTargetId: context.previewTarget.id,
            ...metadata,
          }),
          createdAt,
        });
        yield* repository.writeEvidenceArtifactContent({
          artifactId: id,
          contentText: content,
          createdAt,
        });
        return id;
      });

    const writeDataUrlArtifact = (
      context: BrowserEvidenceRuntimeContext,
      dataUrl: string,
      metadata: Record<string, unknown> = {},
    ) =>
      Effect.gen(function* () {
        const createdAt = now();
        const id = artifactId("browser-screenshot", `${context.browserSessionId}:${dataUrl}`);
        yield* repository.writeEvidenceArtifact({
          artifactId: id,
          schemaVersion: BROWSER_ORCHESTRATION_SCHEMA_VERSION,
          kind: "browser-screenshot",
          sha256: sha256(dataUrl),
          byteSize: Buffer.byteLength(dataUrl),
          contentType: contentTypeFromDataUrl(dataUrl),
          storageUri: `sqlite://evidence_artifact_contents/${id}`,
          sensitivity: "workspace-internal",
          access: "safe-for-user-report",
          redactedArtifactId: null,
          supersededByArtifactId: null,
          metadataJson: JSON.stringify({
            browserSessionId: context.browserSessionId,
            previewTargetId: context.previewTarget.id,
            legacyDataUrl: true,
            ...metadata,
          }),
          createdAt,
        });
        yield* repository.writeEvidenceArtifactContent({
          artifactId: id,
          contentText: dataUrl,
          createdAt,
        });
        return id;
      });

    const appendEvent = (
      context: BrowserEvidenceRuntimeContext,
      type: string,
      artifactRefs: ReadonlyArray<EvidenceArtifactId>,
      payload: unknown,
    ) =>
      repository.appendSessionEvent({
        eventId: SessionEventId.makeUnsafe(`browser-event-${randomUUID()}`),
        sessionId: context.previewTarget.sessionId,
        workflowRunId: null,
        type,
        actor: "agent",
        artifactRefsJson: JSON.stringify(artifactRefs),
        payloadJson: JSON.stringify(payload),
        occurredAt: now(),
      });

    const recordSessionOpened: BrowserEvidenceRecorderShape["recordSessionOpened"] = (context) =>
      Effect.gen(function* () {
        const artifactRef = yield* writeJsonArtifact(
          context,
          "browser-session",
          {
            browserSessionId: context.browserSessionId,
            previewTargetId: context.previewTarget.id,
            runtimeKind: context.runtimeTruth?.runtimeKind ?? "playwright-headless",
            surfaceMode: context.runtimeTruth?.surfaceMode ?? "headless-validation-mirror",
            isUserVisibleSurface: context.runtimeTruth?.isUserVisibleSurface ?? false,
            observedUrl: context.runtimeTruth?.observedUrl ?? null,
            visiblePanelUrl: context.runtimeTruth?.visiblePanelUrl ?? null,
            urlAgreement: context.runtimeTruth?.urlAgreement ?? "unknown",
          },
          { type: "session-opened" },
        );
        yield* appendEvent(context, "BrowserSessionCreated", [artifactRef], {
          browserSessionId: context.browserSessionId,
          previewTargetId: context.previewTarget.id,
        });
        return { evidenceRefs: [artifactRef] };
      });

    const recordAction: BrowserEvidenceRecorderShape["recordAction"] = (input) =>
      Effect.gen(function* () {
        const artifactRef = yield* writeJsonArtifact(
          input,
          input.policyDecision && input.policyDecision.outcome !== "allow"
            ? "browser-action"
            : "browser-action",
          {
            browserSessionId: input.browserSessionId,
            previewTargetId: input.previewTarget.id,
            action: input.action,
            policyDecision: input.policyDecision ?? { outcome: "allow" },
            ...(input.resolvedTarget ? { resolvedTarget: input.resolvedTarget } : {}),
            ...(input.targetResolution ? { targetResolution: input.targetResolution } : {}),
          },
          { type: input.policyDecision ? "policy-decision" : "browser-action" },
        );
        yield* appendEvent(
          input,
          input.policyDecision && input.policyDecision.outcome !== "allow"
            ? "BrowserPolicyDecisionRecorded"
            : "BrowserActionRecorded",
          [artifactRef],
          {
            action: input.action,
            policyDecision: input.policyDecision ?? { outcome: "allow" },
            ...(input.resolvedTarget ? { resolvedTarget: input.resolvedTarget } : {}),
            ...(input.targetResolution ? { targetResolution: input.targetResolution } : {}),
          },
        );
        return { evidenceRefs: [artifactRef] };
      });

    const recordInspection: BrowserEvidenceRecorderShape["recordInspection"] = (input) =>
      Effect.gen(function* () {
        const artifactRef = yield* writeJsonArtifact(
          input,
          "browser-inspection",
          input.inspection,
          {
            type: "browser-inspection",
            url: input.inspection.url,
            screenshotArtifactRef: input.inspection.screenshotArtifactRef ?? null,
          },
        );
        yield* appendEvent(input, "BrowserInspectionCaptured", [artifactRef], {
          browserSessionId: input.browserSessionId,
          url: input.inspection.url,
          elementCount: input.inspection.elements.length,
          screenshotArtifactRef: input.inspection.screenshotArtifactRef ?? null,
        });
        return { evidenceRefs: [artifactRef] };
      });

    const recordObservation: BrowserEvidenceRecorderShape["recordObservation"] = (input) =>
      Effect.gen(function* () {
        const artifactRefs: EvidenceArtifactId[] = [];
        let screenshotArtifactRef: EvidenceArtifactId | undefined;
        const screenshotDataUrl = screenshotDataUrlFor(input.observation);
        if (screenshotDataUrl) {
          screenshotArtifactRef = yield* writeDataUrlArtifact(input, screenshotDataUrl, {
            type: "browser-screenshot",
            url: input.observation.url,
          });
          artifactRefs.push(screenshotArtifactRef);
        }

        const observationRef = yield* writeJsonArtifact(
          input,
          "browser-observation",
          {
            ...observationSummary(input),
            observation: sanitizeObservation(input.observation),
          },
          { type: "browser-observation", url: input.observation.url },
        );
        artifactRefs.push(observationRef);

        const urlAgreementRef = yield* writeJsonArtifact(
          input,
          "browser-url-agreement",
          observationSummary(input),
          { type: "browser-url-agreement" },
        );
        artifactRefs.push(urlAgreementRef);

        if (input.observation.consoleErrors) {
          artifactRefs.push(
            yield* writeJsonArtifact(
              input,
              "browser-console-summary",
              {
                errors: input.observation.consoleErrors,
                count: input.observation.consoleErrors.length,
              },
              { type: "browser-console-summary" },
            ),
          );
          artifactRefs.push(
            yield* writeJsonArtifact(
              input,
              "browser-page-error-summary",
              {
                errors: input.observation.consoleErrors.filter((entry) => entry.level === "error"),
              },
              { type: "browser-page-error-summary" },
            ),
          );
        }

        if (input.observation.networkErrors) {
          artifactRefs.push(
            yield* writeJsonArtifact(
              input,
              "browser-network-summary",
              {
                failures: input.observation.networkErrors,
                count: input.observation.networkErrors.length,
              },
              { type: "browser-network-summary" },
            ),
          );
        }

        yield* appendEvent(input, "BrowserObservationCaptured", artifactRefs, {
          observationId: input.runtimeTruth?.observationId ?? null,
          ...observationSummary(input),
        });
        return {
          evidenceRefs: artifactRefs,
          ...(screenshotArtifactRef ? { screenshotArtifactRef } : {}),
        } satisfies BrowserEvidenceRecordResult;
      });

    const recordClaimGate: BrowserEvidenceRecorderShape["recordClaimGate"] = (input) =>
      Effect.gen(function* () {
        if (input.reports.length === 0) {
          return { evidenceRefs: [] };
        }
        const artifactRef = yield* writeJsonArtifact(
          input,
          "browser-claim-gate",
          {
            browserSessionId: input.browserSessionId,
            observationUrl: input.observation.url,
            reports: input.reports,
          },
          { type: "browser-claim-gate" },
        );
        yield* appendEvent(input, "BrowserClaimGateEvaluated", [artifactRef], {
          reports: input.reports,
          observationUrl: input.observation.url,
        });
        return { evidenceRefs: [artifactRef] };
      });

    return {
      recordSessionOpened,
      recordAction,
      recordInspection,
      recordObservation,
      recordClaimGate,
    } satisfies BrowserEvidenceRecorderShape;
  }),
);
