import { randomUUID } from "node:crypto";

import {
  type AcceptanceCriteria,
  type AcceptanceCriterionResult,
  type BrowserAssertion,
  type BrowserAssertionResult,
  type BrowserSnapshot,
  type BrowserWorkflowRun,
  BrowserSessionId,
  EvidenceBundleId,
  type EvidenceArtifactId,
  SessionEventId,
  type CodeStateRef,
  type PermissionPolicyId,
  type PreviewTarget,
  type PreviewViewport,
  type TaskSpecId,
  type WorkflowRunId,
} from "@orchestrate/contracts";
import { Effect } from "effect";

import type { BrowserOrchestrationEvidenceRepositoryShape } from "../persistence/Services/BrowserOrchestrationEvidence.ts";
import type { BrowserRuntime } from "../browserRuntime/BrowserRuntime.ts";

export type BrowserWorkflowStartInput = {
  readonly sessionId: string;
  readonly workflowRunId: WorkflowRunId;
  readonly taskSpecId: TaskSpecId;
  readonly acceptanceCriteria: AcceptanceCriteria;
  readonly permissionPolicyId: PermissionPolicyId;
  readonly previewTarget: PreviewTarget;
  readonly codeState: CodeStateRef;
  readonly assertions: ReadonlyArray<BrowserAssertion>;
  readonly routes?: ReadonlyArray<string> | undefined;
  readonly viewports?: ReadonlyArray<PreviewViewport> | undefined;
  readonly retryBudget: number;
};

export type BrowserWorkflowResult = {
  readonly workflow: BrowserWorkflowRun;
  readonly snapshots: ReadonlyArray<BrowserSnapshot>;
  readonly assertionResults: ReadonlyArray<BrowserAssertionResult>;
  readonly criterionResults: ReadonlyArray<AcceptanceCriterionResult>;
  readonly evidenceBundleId: EvidenceBundleId;
};

export class BrowserWorkflowManager {
  constructor(
    private readonly runtime: BrowserRuntime,
    private readonly evidenceRepository?: BrowserOrchestrationEvidenceRepositoryShape,
  ) {}

  async start(input: BrowserWorkflowStartInput): Promise<BrowserWorkflowResult> {
    const createdAt = new Date().toISOString();
    const routes = resolveRoutes(input);
    const viewports = input.viewports?.length ? input.viewports : input.previewTarget.viewports;
    let browserSessionId: BrowserSessionId | undefined;

    await this.appendEvent(input, "BrowserWorkflowStarted", "system", [], {
      routes,
      viewportIds: viewports.map((viewport) => viewport.id),
    });

    const snapshots: BrowserSnapshot[] = [];
    const assertionResults: BrowserAssertionResult[] = [];

    try {
      for (const [viewportIndex, viewport] of viewports.entries()) {
        const session = await this.runtime.openSession({
          previewTarget: withCanonicalRoute(input.previewTarget, routes[0] ?? "/"),
          viewport,
        });
        browserSessionId = session.browserSessionId;
        await this.appendEvent(input, "BrowserSessionCreated", "system", [], {
          browserSessionId,
          runtimeKind: session.runtimeKind,
          viewportId: viewport.id,
        });

        for (const [routeIndex, route] of routes.entries()) {
          if (viewportIndex > 0 || routeIndex > 0) {
            const actResult = await this.runtime.act({
              browserSessionId,
              action: { kind: "navigate", url: absoluteRoute(input.previewTarget, route) },
            });
            if (!actResult.ok) {
              assertionResults.push({
                assertion: { type: "url-matches", pattern: route },
                status: "fail",
                evidenceRefs: [],
                message: actResult.policyDecision.reason,
              });
              continue;
            }
          }

          const snapshot = await this.runtime.captureSnapshot({ browserSessionId });
          snapshots.push(snapshot);
          const snapshotEvidenceRefs = collectSnapshotEvidenceRefs(snapshot);
          await this.appendEvent(input, "BrowserSnapshotCaptured", "agent", snapshotEvidenceRefs, {
            browserSessionId,
            snapshotId: snapshot.id,
            route,
            viewportId: viewport.id,
          });

          for (const assertion of input.assertions) {
            assertionResults.push(evaluateAssertion(assertion, snapshot));
          }
        }

        await this.runtime.closeSession({ browserSessionId });
        browserSessionId = undefined;
      }

      const evidenceBundleId = EvidenceBundleId.makeUnsafe(`evidence-bundle-${randomUUID()}`);
      const artifactRefs = uniqueEvidenceRefs(snapshots.flatMap(collectSnapshotEvidenceRefs));
      const eventRefs = await this.createEvidenceBundle(input, evidenceBundleId, {
        artifactRefs,
        browserSessionId: snapshots[0]?.browserSessionId ?? BrowserSessionId.makeUnsafe("none"),
      });
      const criterionResults = buildCriterionResults(input, assertionResults, artifactRefs);
      const updatedAt = new Date().toISOString();
      const workflow: BrowserWorkflowRun = {
        id: input.workflowRunId,
        sessionId: input.sessionId,
        previewTargetId: input.previewTarget.id,
        taskSpecId: input.taskSpecId,
        acceptanceCriteriaId: input.acceptanceCriteria.id,
        permissionPolicyId: input.permissionPolicyId,
        ...(snapshots[0] ? { browserSessionId: snapshots[0].browserSessionId } : {}),
        status: assertionResults.some((result) => result.status === "fail")
          ? "failed"
          : "completed",
        routes,
        viewports,
        retryBudget: input.retryBudget,
        createdAt,
        updatedAt,
        evidenceBundleId,
      };

      await this.appendEvent(input, "EvidenceBundleCreated", "system", artifactRefs, {
        evidenceBundleId,
        eventRefs,
      });

      return {
        workflow,
        snapshots,
        assertionResults,
        criterionResults,
        evidenceBundleId,
      };
    } finally {
      if (browserSessionId) {
        await this.runtime.closeSession({ browserSessionId });
      }
    }
  }

  private async appendEvent(
    input: BrowserWorkflowStartInput,
    type: string,
    actor: "system" | "agent" | "human" | "reviewer",
    artifactRefs: ReadonlyArray<EvidenceArtifactId>,
    payload: Record<string, unknown>,
  ): Promise<SessionEventId | null> {
    if (!this.evidenceRepository) {
      return null;
    }

    const eventId = SessionEventId.makeUnsafe(`browser-event-${randomUUID()}`);
    await Effect.runPromise(
      this.evidenceRepository.appendSessionEvent({
        eventId,
        sessionId: input.sessionId,
        workflowRunId: input.workflowRunId,
        type,
        actor,
        artifactRefsJson: JSON.stringify(artifactRefs),
        payloadJson: JSON.stringify(payload),
        occurredAt: new Date().toISOString(),
      }),
    );
    return eventId;
  }

  private async createEvidenceBundle(
    input: BrowserWorkflowStartInput,
    evidenceBundleId: EvidenceBundleId,
    refs: {
      readonly artifactRefs: ReadonlyArray<EvidenceArtifactId>;
      readonly browserSessionId: BrowserSessionId;
    },
  ): Promise<ReadonlyArray<SessionEventId>> {
    if (!this.evidenceRepository) {
      return [];
    }

    const events = await Effect.runPromise(
      this.evidenceRepository.getSessionEvents({ sessionId: input.sessionId }),
    );
    const eventRefs = events
      .filter((event) => event.workflowRunId === input.workflowRunId)
      .map((event) => event.eventId);

    await Effect.runPromise(
      this.evidenceRepository.createEvidenceBundle({
        bundleId: evidenceBundleId,
        sessionId: input.sessionId,
        workflowRunId: input.workflowRunId,
        previewTargetId: input.previewTarget.id,
        taskSpecId: input.taskSpecId,
        acceptanceCriteriaId: input.acceptanceCriteria.id,
        permissionPolicyId: input.permissionPolicyId,
        browserSessionId: refs.browserSessionId,
        codeStateJson: JSON.stringify(input.codeState),
        artifactRefsJson: JSON.stringify(refs.artifactRefs),
        eventRefsJson: JSON.stringify(eventRefs),
        createdAt: new Date().toISOString(),
      }),
    );

    return eventRefs;
  }
}

function resolveRoutes(input: BrowserWorkflowStartInput): string[] {
  if (input.routes?.length) {
    return [...new Set(input.routes)];
  }

  const criteriaRoutes = input.acceptanceCriteria.criteria.flatMap((criterion) =>
    criterion.routes?.length ? criterion.routes : [],
  );
  return criteriaRoutes.length ? [...new Set(criteriaRoutes)] : [input.previewTarget.initialRoute];
}

function withCanonicalRoute(previewTarget: PreviewTarget, route: string): PreviewTarget {
  return {
    ...previewTarget,
    canonicalUrl: absoluteRoute(previewTarget, route),
  };
}

function absoluteRoute(previewTarget: PreviewTarget, route: string): string {
  return new URL(route, previewTarget.baseUrl).toString();
}

function collectSnapshotEvidenceRefs(snapshot: BrowserSnapshot): EvidenceArtifactId[] {
  return Object.values(snapshot.artifactRefs).filter(
    (ref): ref is EvidenceArtifactId => ref !== undefined,
  );
}

function uniqueEvidenceRefs(refs: ReadonlyArray<EvidenceArtifactId>): EvidenceArtifactId[] {
  return [...new Set(refs)];
}

function evaluateAssertion(
  assertion: BrowserAssertion,
  snapshot: BrowserSnapshot,
): BrowserAssertionResult {
  const evidenceRefs = collectSnapshotEvidenceRefs(snapshot);

  switch (assertion.type) {
    case "url-matches": {
      let matches = false;
      try {
        matches = new RegExp(assertion.pattern).test(snapshot.url);
      } catch {
        matches = snapshot.url.includes(assertion.pattern);
      }
      return {
        assertion,
        status: matches ? "pass" : "fail",
        evidenceRefs,
        message: matches
          ? `URL matched ${assertion.pattern}.`
          : `URL ${snapshot.url} did not match ${assertion.pattern}.`,
      };
    }

    case "text-visible": {
      const visible = snapshot.summary.visibleText.join("\n").includes(assertion.text);
      return {
        assertion,
        status: visible ? "pass" : "fail",
        evidenceRefs,
        message: visible
          ? `Text is visible: ${assertion.text}`
          : `Text is not visible: ${assertion.text}`,
      };
    }

    case "no-console-errors":
      return {
        assertion,
        status: snapshot.summary.consoleErrorCount === 0 ? "pass" : "fail",
        evidenceRefs,
        message:
          snapshot.summary.consoleErrorCount === 0
            ? "No console errors observed."
            : `${snapshot.summary.consoleErrorCount} console error(s) observed.`,
      };

    case "no-page-errors":
      return {
        assertion,
        status: snapshot.summary.pageErrorCount === 0 ? "pass" : "fail",
        evidenceRefs,
        message:
          snapshot.summary.pageErrorCount === 0
            ? "No page errors observed."
            : `${snapshot.summary.pageErrorCount} page error(s) observed.`,
      };

    case "no-network-failures":
      return {
        assertion,
        status: snapshot.summary.networkFailureCount === 0 ? "pass" : "fail",
        evidenceRefs,
        message:
          snapshot.summary.networkFailureCount === 0
            ? "No network failures observed."
            : `${snapshot.summary.networkFailureCount} network failure(s) observed.`,
      };

    case "screenshot-captured":
      return {
        assertion,
        status: snapshot.artifactRefs.screenshot ? "pass" : "fail",
        evidenceRefs,
        message: snapshot.artifactRefs.screenshot
          ? "Screenshot artifact captured."
          : "Screenshot artifact missing.",
      };

    case "selector-visible":
    case "selector-not-visible":
    case "http-status-ok":
    case "annotation-resolved":
      return {
        assertion,
        status: "not-evaluated",
        evidenceRefs,
        message: `${assertion.type} requires DOM/network/comment evidence that is not yet materialized in the snapshot contract.`,
      };
  }
}

function buildCriterionResults(
  input: BrowserWorkflowStartInput,
  assertionResults: ReadonlyArray<BrowserAssertionResult>,
  artifactRefs: ReadonlyArray<EvidenceArtifactId>,
): AcceptanceCriterionResult[] {
  return input.acceptanceCriteria.criteria.map((criterion) => {
    const failedAssertion = assertionResults.find((result) => result.status === "fail");
    if (failedAssertion) {
      return {
        criterionId: criterion.id,
        status: "fail",
        evidenceRefs: failedAssertion.evidenceRefs.length
          ? failedAssertion.evidenceRefs
          : artifactRefs,
        reason: failedAssertion.message,
      };
    }

    const notEvaluatedAssertion = assertionResults.find(
      (result) => result.status === "not-evaluated",
    );
    if (notEvaluatedAssertion) {
      return {
        criterionId: criterion.id,
        status: "not-evaluated",
        evidenceRefs: notEvaluatedAssertion.evidenceRefs.length
          ? notEvaluatedAssertion.evidenceRefs
          : artifactRefs,
        reason: notEvaluatedAssertion.message,
      };
    }

    return {
      criterionId: criterion.id,
      status: "pass",
      evidenceRefs: artifactRefs,
      reason: "All deterministic browser assertions passed.",
    };
  });
}
