import { createHash, randomUUID } from "node:crypto";

import {
  BROWSER_ORCHESTRATION_SCHEMA_VERSION,
  BrowserSessionId,
  type BrowserAssertion,
  type BrowserAssertionResult,
  type BrowserObservation,
  type BrowserWorkflowListInput,
  type BrowserWorkflowRun,
  type BrowserWorkflowRunInput,
  type BrowserWorkflowStartInput,
  type BrowserWorkflowStatus,
  EvidenceArtifactId,
  type EvidenceArtifactKind,
  PermissionPolicyId,
  type PreviewTarget,
  AcceptanceCriteriaId,
  SessionEventId,
  TaskSpecId,
  ThreadId,
  WorkflowRunId,
} from "@orchestrate/contracts";
import { Effect, Layer, Option } from "effect";

import { BrowserRuntimeService } from "../../browserRuntime/Services/BrowserRuntimeService.ts";
import { BrowserOrchestrationEvidenceRepository } from "../../persistence/Services/BrowserOrchestrationEvidence.ts";
import {
  BrowserWorkflowManager,
  type BrowserWorkflowManagerShape,
} from "../Services/BrowserWorkflowManager.ts";

type WorkflowRecord = BrowserWorkflowRun;

function now() {
  return new Date().toISOString();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function errorFromUnknown(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

function workflowArtifactId(kind: EvidenceArtifactKind, seed: string): EvidenceArtifactId {
  return EvidenceArtifactId.makeUnsafe(`${kind}-${sha256(seed).slice(0, 24)}`);
}

function eventId(): SessionEventId {
  return SessionEventId.makeUnsafe(`browser-workflow-event-${randomUUID()}`);
}

function evidenceRef(value: string): EvidenceArtifactId {
  return EvidenceArtifactId.makeUnsafe(value);
}

function assertionId(assertion: BrowserAssertion, index: number): string {
  return assertion.id ?? `${assertion.type}-${index + 1}`;
}

function resolveRoute(baseUrl: string, route: string): string {
  try {
    return new URL(route, baseUrl).toString();
  } catch {
    return route;
  }
}

function observedViewport(
  observation: BrowserObservation,
  fallback: PreviewTarget["viewports"][number] | undefined,
): PreviewTarget["viewports"][number] | undefined {
  const metrics = observation.pageMetrics;
  if (!metrics) return fallback;
  return {
    id: "observed-current-viewport",
    label: `${metrics.viewportWidth}x${metrics.viewportHeight}`,
    width: metrics.viewportWidth,
    height: metrics.viewportHeight,
    deviceScaleFactor: fallback?.deviceScaleFactor ?? 1,
  };
}

function observationEvidenceRefs(observation: BrowserObservation): EvidenceArtifactId[] {
  const refs = new Set<string>();
  for (const ref of observation.evidenceRefs ?? []) {
    refs.add(String(ref));
  }
  for (const ref of observation.runtimeTruth?.evidenceRefs ?? []) {
    refs.add(String(ref));
  }
  const screenshotRef =
    observation.screenshotArtifactRef ?? observation.runtimeTruth?.screenshotArtifactRef;
  if (screenshotRef) {
    refs.add(String(screenshotRef));
  }
  return [...refs].map(evidenceRef);
}

function screenshotRefs(observation: BrowserObservation): EvidenceArtifactId[] {
  const ref = observation.screenshotArtifactRef ?? observation.runtimeTruth?.screenshotArtifactRef;
  return ref ? [evidenceRef(String(ref))] : [];
}

function textIncludes(observation: BrowserObservation, text: string): boolean {
  return observation.textSummary.toLowerCase().includes(text.toLowerCase());
}

function runAssertion(
  assertion: BrowserAssertion,
  index: number,
  observation: BrowserObservation,
  evidenceRefs: ReadonlyArray<EvidenceArtifactId>,
  resolvedScreenshotRefs: ReadonlyArray<EvidenceArtifactId>,
): BrowserAssertionResult {
  const checkedAt = now();
  const id = assertionId(assertion, index);
  const result = (
    status: BrowserAssertionResult["status"],
    message: string,
    refs: ReadonlyArray<EvidenceArtifactId> = evidenceRefs,
  ): BrowserAssertionResult => ({
    assertion,
    assertionId: id,
    status,
    evidenceRefs: [...refs],
    message,
    checkedAt,
  });

  switch (assertion.type) {
    case "url-matches": {
      let matches = false;
      try {
        matches = new RegExp(assertion.pattern).test(observation.url);
      } catch {
        matches = observation.url.includes(assertion.pattern);
      }
      return result(
        matches ? "pass" : "fail",
        matches
          ? `Observed URL matched ${assertion.pattern}.`
          : `Observed URL ${observation.url} did not match ${assertion.pattern}.`,
      );
    }
    case "text-visible": {
      const visible = textIncludes(observation, assertion.text);
      return result(
        visible ? "pass" : "fail",
        visible
          ? `Observed text includes ${assertion.text}.`
          : `Observed text did not include ${assertion.text}.`,
      );
    }
    case "selector-visible":
    case "selector-not-visible":
      return result(
        "inconclusive",
        "Selector assertions require DOM selector evidence that is not yet captured by this runtime observation.",
      );
    case "no-console-errors": {
      const count = observation.consoleErrors?.length ?? 0;
      return result(
        count === 0 ? "pass" : "fail",
        count === 0 ? "No console errors were observed." : `${count} console error(s) observed.`,
      );
    }
    case "no-page-errors": {
      const hasError = Boolean(observation.navigationError);
      return result(
        hasError ? "fail" : "pass",
        hasError
          ? `Page/navigation error observed: ${observation.navigationError}`
          : "No page errors were observed.",
      );
    }
    case "no-network-failures": {
      const failures = (observation.networkErrors ?? []).filter((entry) => {
        if (!assertion.allowPatterns?.length) return true;
        return !assertion.allowPatterns.some((pattern) => {
          try {
            return new RegExp(pattern).test(entry.url);
          } catch {
            return entry.url.includes(pattern);
          }
        });
      });
      return result(
        failures.length === 0 ? "pass" : "fail",
        failures.length === 0
          ? "No disallowed network failures were observed."
          : `${failures.length} network failure(s) observed.`,
      );
    }
    case "screenshot-captured": {
      return result(
        resolvedScreenshotRefs.length > 0 ? "pass" : "fail",
        resolvedScreenshotRefs.length > 0
          ? "Screenshot artifact evidence was captured and resolved."
          : "No resolvable screenshot artifact evidence was captured.",
        resolvedScreenshotRefs.length > 0 ? resolvedScreenshotRefs : evidenceRefs,
      );
    }
    case "http-status-ok":
    case "annotation-resolved":
    case "claim-gate-passed":
      return result(
        "not-run",
        `${assertion.type} is not implemented in the Slice 4 deterministic workflow runner.`,
      );
  }
}

export const BrowserWorkflowManagerLive = Layer.effect(
  BrowserWorkflowManager,
  Effect.gen(function* () {
    const browserRuntime = yield* BrowserRuntimeService;
    const repository = yield* BrowserOrchestrationEvidenceRepository;
    const workflows = new Map<string, WorkflowRecord>();

    const writeJsonArtifact = (
      sessionId: string,
      kind: EvidenceArtifactKind,
      payload: unknown,
      metadata: Record<string, unknown> = {},
    ) =>
      Effect.gen(function* () {
        const createdAt = now();
        const content = JSON.stringify(payload);
        const artifactRef = workflowArtifactId(
          kind,
          `${sessionId}:${kind}:${content}:${createdAt}`,
        );
        yield* repository.writeEvidenceArtifact({
          artifactId: artifactRef,
          schemaVersion: BROWSER_ORCHESTRATION_SCHEMA_VERSION,
          kind,
          sha256: sha256(content),
          byteSize: Buffer.byteLength(content),
          contentType: "application/json",
          storageUri: `sqlite://evidence_artifact_contents/${artifactRef}`,
          sensitivity: "workspace-internal",
          access: "safe-for-user-report",
          redactedArtifactId: null,
          supersededByArtifactId: null,
          metadataJson: JSON.stringify(metadata),
          createdAt,
        });
        yield* repository.writeEvidenceArtifactContent({
          artifactId: artifactRef,
          contentText: content,
          createdAt,
        });
        return artifactRef;
      });

    const appendWorkflowEvent = (
      sessionId: string,
      workflowRunId: WorkflowRunId,
      type: string,
      artifactRefs: ReadonlyArray<EvidenceArtifactId>,
      payload: unknown,
    ) =>
      repository.appendSessionEvent({
        eventId: eventId(),
        sessionId,
        workflowRunId,
        type,
        actor: "agent",
        artifactRefsJson: JSON.stringify(artifactRefs),
        payloadJson: JSON.stringify(payload),
        occurredAt: now(),
      });

    const persistWorkflowEvent = (
      workflow: WorkflowRecord,
      kind: EvidenceArtifactKind,
      eventType: string,
      payload: unknown,
    ) =>
      Effect.gen(function* () {
        const artifactRef = yield* writeJsonArtifact(workflow.sessionId, kind, payload, {
          workflowRunId: workflow.id,
          previewTargetId: workflow.previewTargetId,
        });
        yield* appendWorkflowEvent(
          workflow.sessionId,
          workflow.id,
          eventType,
          [artifactRef],
          payload,
        );
        return artifactRef;
      });

    const resolveScreenshotRefs = (observation: BrowserObservation) =>
      Effect.gen(function* () {
        const resolved: EvidenceArtifactId[] = [];
        for (const ref of screenshotRefs(observation)) {
          const artifact = yield* repository.getEvidenceArtifact({ artifactId: ref });
          if (Option.isSome(artifact)) {
            resolved.push(ref);
          }
        }
        return resolved;
      });

    const saveWorkflow = (workflow: WorkflowRecord) =>
      Effect.sync(() => {
        workflows.set(String(workflow.id), workflow);
      });

    const updateStatus = (workflow: WorkflowRecord, status: BrowserWorkflowStatus) =>
      Effect.gen(function* () {
        const updated = { ...workflow, status, updatedAt: now() } satisfies WorkflowRecord;
        yield* saveWorkflow(updated);
        yield* persistWorkflowEvent(
          updated,
          "browser-workflow-status-changed",
          "BrowserWorkflowStatusChanged",
          {
            workflowRunId: updated.id,
            status,
          },
        );
        return updated;
      });

    const start: BrowserWorkflowManagerShape["start"] = (input: BrowserWorkflowStartInput) =>
      Effect.gen(function* () {
        const createdAt = now();
        const workflowRunId = WorkflowRunId.makeUnsafe(`browser-workflow-${randomUUID()}`);
        const routePlan = input.routePlan?.length
          ? input.routePlan
          : [{ route: input.previewTarget.initialRoute, label: "initial route" }];
        const viewportPlan = input.viewportPlan?.length
          ? input.viewportPlan
          : input.previewTarget.viewports;
        const assertions: ReadonlyArray<BrowserAssertion> = input.assertions?.length
          ? input.assertions
          : [
              { id: "url-matches", type: "url-matches", pattern: input.previewTarget.baseUrl },
              { id: "screenshot-captured", type: "screenshot-captured", label: "baseline" },
              { id: "no-console-errors", type: "no-console-errors" },
              { id: "no-page-errors", type: "no-page-errors" },
              { id: "no-network-failures", type: "no-network-failures" },
            ];
        let workflow: WorkflowRecord = {
          id: workflowRunId,
          sessionId: input.sessionId,
          previewTargetId: input.previewTarget.id,
          taskSpecId:
            input.taskSpecId ??
            TaskSpecId.makeUnsafe(`task-spec-${String(workflowRunId).slice(0, 32)}`),
          acceptanceCriteriaId:
            input.acceptanceCriteriaId ??
            AcceptanceCriteriaId.makeUnsafe(`acceptance-${String(workflowRunId).slice(0, 32)}`),
          permissionPolicyId:
            input.permissionPolicyId ??
            PermissionPolicyId.makeUnsafe(`permission-${String(workflowRunId).slice(0, 32)}`),
          status: "created",
          routes: routePlan.map((route) => route.route),
          viewports: viewportPlan,
          retryBudget: Math.max((input.maxAttempts ?? 1) - 1, 0),
          createdAt,
          updatedAt: createdAt,
          purpose: input.purpose ?? "initial-preview",
          routePlan,
          viewportPlan,
          assertions,
          maxAttempts: input.maxAttempts ?? 1,
          attempt: 1,
          evidenceRefs: [],
          observationRefs: [],
          screenshotArtifactRefs: [],
          assertionResults: [],
          startedAt: createdAt,
        };
        yield* saveWorkflow(workflow);
        yield* persistWorkflowEvent(
          workflow,
          "browser-workflow-created",
          "BrowserWorkflowCreated",
          {
            workflowRunId: workflow.id,
            previewTargetId: workflow.previewTargetId,
            purpose: workflow.purpose,
          },
        );

        const evidenceRefs = new Set<string>();
        const observationRefs = new Set<string>();
        const screenshotArtifactRefs = new Set<string>();
        const assertionResults: BrowserAssertionResult[] = [];
        let browserSessionId: BrowserSessionId | undefined;
        const runtimeKind = input.preferredRuntimeKind ?? "electron-visible";

        try {
          workflow = yield* updateStatus(workflow, "resolving-preview-target");
          workflow = yield* updateStatus(workflow, "starting-browser");
          const opened = yield* browserRuntime.openSession({
            threadId: ThreadId.makeUnsafe(input.sessionId),
            url: input.previewTarget.canonicalUrl,
            previewTarget: input.previewTarget,
            preferredRuntimeKind: runtimeKind,
          });
          browserSessionId = opened.sessionId;
          workflow = {
            ...workflow,
            browserSessionId,
            updatedAt: now(),
          };
          yield* saveWorkflow(workflow);
          for (const ref of opened.evidenceRefs ?? []) evidenceRefs.add(String(ref));
          for (const ref of observationEvidenceRefs(opened.observation)) {
            evidenceRefs.add(String(ref));
            observationRefs.add(String(ref));
          }
          for (const ref of screenshotRefs(opened.observation))
            screenshotArtifactRefs.add(String(ref));

          if (input.controlMode === "observe-only-current-page") {
            workflow = yield* updateStatus(workflow, "observing");
            const observation = opened.observation;
            const currentViewport = observedViewport(observation, input.previewTarget.viewports[0]);
            const observationArtifact = yield* persistWorkflowEvent(
              workflow,
              "browser-workflow-observation-captured",
              "BrowserWorkflowObservationCaptured",
              {
                workflowRunId: workflow.id,
                route: { route: observation.url, label: "current visible page" },
                viewport: currentViewport,
                url: observation.url,
                title: observation.title,
                evidenceRefs: observationEvidenceRefs(observation),
                screenshotArtifactRefs: screenshotRefs(observation),
                controlMode: input.controlMode,
              },
            );
            evidenceRefs.add(String(observationArtifact));

            workflow = yield* updateStatus(workflow, "verifying");
            const resolvedScreenshotRefs = yield* resolveScreenshotRefs(observation);
            for (const [index, assertion] of assertions.entries()) {
              assertionResults.push(
                runAssertion(
                  assertion,
                  index,
                  observation,
                  [...evidenceRefs].map(evidenceRef),
                  resolvedScreenshotRefs,
                ),
              );
            }
            for (const result of assertionResults) {
              const assertionArtifact = yield* persistWorkflowEvent(
                workflow,
                "browser-workflow-assertion-result",
                "BrowserWorkflowAssertionResult",
                { workflowRunId: workflow.id, result, controlMode: input.controlMode },
              );
              evidenceRefs.add(String(assertionArtifact));
            }

            workflow = {
              ...workflow,
              status: "completed",
              routes: [observation.url],
              viewports: currentViewport ? [currentViewport] : [],
              updatedAt: now(),
              completedAt: now(),
              evidenceRefs: [...evidenceRefs].map(evidenceRef),
              observationRefs: [...observationRefs].map(evidenceRef),
              screenshotArtifactRefs: [...screenshotArtifactRefs].map(evidenceRef),
              assertionResults,
            };
            yield* saveWorkflow(workflow);
            yield* persistWorkflowEvent(
              workflow,
              "browser-workflow-completed",
              "BrowserWorkflowCompleted",
              {
                workflowRunId: workflow.id,
                assertionResults,
                evidenceRefs: workflow.evidenceRefs,
                controlMode: input.controlMode,
              },
            );
            return { workflow };
          }

          for (const viewport of viewportPlan) {
            workflow = yield* updateStatus(workflow, "collecting-baseline");
            const viewportArtifact = yield* persistWorkflowEvent(
              workflow,
              "browser-workflow-viewport-started",
              "BrowserWorkflowViewportStarted",
              { workflowRunId: workflow.id, viewport },
            );
            evidenceRefs.add(String(viewportArtifact));
            if (runtimeKind !== "electron-visible") {
              const resized = yield* browserRuntime.act({
                threadId: ThreadId.makeUnsafe(input.sessionId),
                sessionId: opened.sessionId,
                action: { kind: "resize", width: viewport.width, height: viewport.height },
              });
              for (const ref of resized.evidenceRefs ?? []) evidenceRefs.add(String(ref));
            }

            for (const route of routePlan) {
              workflow = yield* updateStatus(workflow, "opening-route");
              const url = resolveRoute(input.previewTarget.baseUrl, route.route);
              const routeArtifact = yield* persistWorkflowEvent(
                workflow,
                "browser-workflow-route-started",
                "BrowserWorkflowRouteStarted",
                { workflowRunId: workflow.id, route, url },
              );
              evidenceRefs.add(String(routeArtifact));
              workflow = yield* updateStatus(workflow, "acting");
              const navigated = yield* browserRuntime.act({
                threadId: ThreadId.makeUnsafe(input.sessionId),
                sessionId: opened.sessionId,
                action: { kind: "navigate", url },
              });
              workflow = yield* updateStatus(workflow, "observing");
              const observation = navigated.observation;
              for (const ref of navigated.evidenceRefs ?? []) evidenceRefs.add(String(ref));
              for (const ref of observationEvidenceRefs(observation)) {
                evidenceRefs.add(String(ref));
                observationRefs.add(String(ref));
              }
              for (const ref of screenshotRefs(observation))
                screenshotArtifactRefs.add(String(ref));
              const observationArtifact = yield* persistWorkflowEvent(
                workflow,
                "browser-workflow-observation-captured",
                "BrowserWorkflowObservationCaptured",
                {
                  workflowRunId: workflow.id,
                  route,
                  viewport,
                  url: observation.url,
                  title: observation.title,
                  evidenceRefs: observationEvidenceRefs(observation),
                  screenshotArtifactRefs: screenshotRefs(observation),
                },
              );
              evidenceRefs.add(String(observationArtifact));

              workflow = yield* updateStatus(workflow, "verifying");
              const resolvedScreenshotRefs = yield* resolveScreenshotRefs(observation);
              for (const [index, assertion] of assertions.entries()) {
                assertionResults.push(
                  runAssertion(
                    assertion,
                    index,
                    observation,
                    [...evidenceRefs].map(evidenceRef),
                    resolvedScreenshotRefs,
                  ),
                );
              }
              for (const result of assertionResults.slice(-assertions.length)) {
                const assertionArtifact = yield* persistWorkflowEvent(
                  workflow,
                  "browser-workflow-assertion-result",
                  "BrowserWorkflowAssertionResult",
                  { workflowRunId: workflow.id, result },
                );
                evidenceRefs.add(String(assertionArtifact));
              }
            }
          }

          workflow = {
            ...workflow,
            status: "completed",
            updatedAt: now(),
            completedAt: now(),
            evidenceRefs: [...evidenceRefs].map(evidenceRef),
            observationRefs: [...observationRefs].map(evidenceRef),
            screenshotArtifactRefs: [...screenshotArtifactRefs].map(evidenceRef),
            assertionResults,
          };
          yield* saveWorkflow(workflow);
          yield* persistWorkflowEvent(
            workflow,
            "browser-workflow-completed",
            "BrowserWorkflowCompleted",
            {
              workflowRunId: workflow.id,
              assertionResults,
              evidenceRefs: workflow.evidenceRefs,
            },
          );
          return { workflow };
        } catch (cause) {
          const error = errorFromUnknown(cause);
          workflow = {
            ...workflow,
            status: "failed",
            updatedAt: now(),
            completedAt: now(),
            evidenceRefs: [...evidenceRefs].map(evidenceRef),
            observationRefs: [...observationRefs].map(evidenceRef),
            screenshotArtifactRefs: [...screenshotArtifactRefs].map(evidenceRef),
            assertionResults,
            error: {
              code: "browser-workflow-failed",
              message: error.message,
            },
          };
          yield* saveWorkflow(workflow);
          yield* persistWorkflowEvent(
            workflow,
            "browser-workflow-failed",
            "BrowserWorkflowFailed",
            {
              workflowRunId: workflow.id,
              error: workflow.error,
            },
          );
          return { workflow };
        } finally {
          if (browserSessionId) {
            yield* browserRuntime
              .closeSession({ sessionId: browserSessionId })
              .pipe(Effect.catch(() => Effect.void));
          }
        }
      }).pipe(Effect.mapError(errorFromUnknown));

    const getWorkflow = (input: BrowserWorkflowRunInput) =>
      Effect.sync(() => workflows.get(String(input.workflowRunId)) ?? null);

    const status: BrowserWorkflowManagerShape["status"] = (input) =>
      getWorkflow(input).pipe(Effect.map((workflow) => ({ workflow: workflow ?? undefined })));

    const get: BrowserWorkflowManagerShape["get"] = (input) =>
      getWorkflow(input).pipe(Effect.map((workflow) => ({ workflow: workflow ?? undefined })));

    const cancel: BrowserWorkflowManagerShape["cancel"] = (input) =>
      Effect.gen(function* () {
        const existing = yield* getWorkflow(input);
        if (!existing) return { workflow: undefined };
        if (["completed", "failed", "cancelled"].includes(existing.status)) {
          return { workflow: existing };
        }
        const updated = {
          ...existing,
          status: "cancelled",
          updatedAt: now(),
          completedAt: now(),
        } satisfies WorkflowRecord;
        yield* saveWorkflow(updated);
        yield* persistWorkflowEvent(
          updated,
          "browser-workflow-cancelled",
          "BrowserWorkflowCancelled",
          { workflowRunId: updated.id },
        );
        return { workflow: updated };
      }).pipe(Effect.mapError(errorFromUnknown));

    const list: BrowserWorkflowManagerShape["list"] = (input: BrowserWorkflowListInput) =>
      Effect.sync(() => {
        const all = [...workflows.values()];
        const filtered = input.sessionId
          ? all.filter((workflow) => String(workflow.sessionId) === String(input.sessionId))
          : all;
        return { workflows: filtered };
      });

    return { start, status, get, cancel, list } satisfies BrowserWorkflowManagerShape;
  }),
);
