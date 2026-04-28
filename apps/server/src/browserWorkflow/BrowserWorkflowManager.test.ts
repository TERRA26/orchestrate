import {
  AcceptanceCriteriaId,
  AcceptanceCriterionId,
  BrowserSessionId,
  EvidenceArtifactId,
  PermissionPolicyId,
  TaskSpecId,
  WorkflowRunId,
  type BrowserSnapshot,
} from "@orchestrate/contracts";
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";

import type { BrowserRuntime } from "../browserRuntime/BrowserRuntime.ts";
import { makePreviewTarget } from "../browserRuntime/testFixtures.ts";
import type {
  BrowserOrchestrationEvidenceRepositoryShape,
  BrowserSessionEventRow,
  EvidenceBundleRow,
} from "../persistence/Services/BrowserOrchestrationEvidence.ts";
import { BrowserWorkflowManager } from "./BrowserWorkflowManager.ts";

const now = "2026-04-27T00:00:00.000Z";
const browserSessionId = BrowserSessionId.makeUnsafe("browser-session-workflow");
const screenshotRef = EvidenceArtifactId.makeUnsafe("artifact-workflow-shot");
const domRef = EvidenceArtifactId.makeUnsafe("artifact-workflow-dom");

function makeRuntime(snapshotOverrides: Partial<BrowserSnapshot> = {}): BrowserRuntime {
  const snapshot: BrowserSnapshot = {
    id: "snapshot-workflow",
    runtimeKind: "playwright-headless",
    permissionTier: "isolated-local-preview",
    previewTargetId: makePreviewTarget().id,
    browserSessionId,
    pageId: "page-workflow",
    url: "http://127.0.0.1:5173/",
    title: "Workflow",
    viewport: {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
    },
    scroll: {
      x: 0,
      y: 0,
    },
    artifactRefs: {
      screenshot: screenshotRef,
      domSnapshot: domRef,
    },
    summary: {
      visibleText: ["Fixture page", "Submit"],
      consoleErrorCount: 0,
      networkFailureCount: 0,
      pageErrorCount: 0,
    },
    capturedAt: now,
    ...snapshotOverrides,
  };

  return {
    openSession: async (input) => ({
      browserSessionId,
      previewTarget: input.previewTarget,
      runtimeKind: "playwright-headless",
      lastSnapshot: snapshot,
    }),
    observe: async () => snapshot,
    captureSnapshot: async () => snapshot,
    act: async () => ({ ok: true, snapshot }),
    closeSession: async () => {},
  };
}

function makeRepository(): BrowserOrchestrationEvidenceRepositoryShape & {
  readonly events: BrowserSessionEventRow[];
  readonly bundles: EvidenceBundleRow[];
} {
  const events: BrowserSessionEventRow[] = [];
  const bundles: EvidenceBundleRow[] = [];

  return {
    events,
    bundles,
    appendSessionEvent: (row) => {
      events.push(row);
      return Effect.void;
    },
    getSessionEvents: () => Effect.succeed(events),
    writeEvidenceArtifact: () => Effect.void,
    getEvidenceArtifact: () => Effect.succeed(Option.none()),
    createEvidenceBundle: (row) => {
      bundles.push(row);
      return Effect.void;
    },
    getEvidenceBundle: () => Effect.succeed(Option.none()),
    createReviewerDecision: () => Effect.void,
    getReviewerDecision: () => Effect.succeed(Option.none()),
  };
}

function makeStartInput() {
  return {
    sessionId: "session-workflow",
    workflowRunId: WorkflowRunId.makeUnsafe("workflow-run-1"),
    taskSpecId: TaskSpecId.makeUnsafe("task-spec-1"),
    acceptanceCriteria: {
      id: AcceptanceCriteriaId.makeUnsafe("criteria-1"),
      taskSpecId: TaskSpecId.makeUnsafe("task-spec-1"),
      criteria: [
        {
          id: AcceptanceCriterionId.makeUnsafe("criterion-1"),
          description: "Page loads without runtime failures",
          requiredEvidence: ["screenshot", "dom", "console", "network"],
          routes: ["/"],
        },
      ],
      createdAt: now,
    },
    permissionPolicyId: PermissionPolicyId.makeUnsafe("policy-1"),
    previewTarget: makePreviewTarget(),
    codeState: {
      repoRoot: "/tmp/orchestrate",
      headSha: "head",
      dirtyHash: "dirty",
      changedFiles: ["apps/web/src/App.tsx"],
      diffArtifactRef: EvidenceArtifactId.makeUnsafe("artifact-diff"),
      capturedAt: now,
    },
    assertions: [
      { type: "url-matches", pattern: "127\\.0\\.0\\.1" },
      { type: "text-visible", text: "Submit" },
      { type: "screenshot-captured" },
      { type: "no-console-errors" },
      { type: "no-network-failures" },
    ],
    retryBudget: 1,
  } as const;
}

describe("BrowserWorkflowManager", () => {
  it("runs deterministic assertions and creates an evidence bundle", async () => {
    const repository = makeRepository();
    const manager = new BrowserWorkflowManager(makeRuntime(), repository);

    const result = await manager.start(makeStartInput());

    expect(result.workflow.status).toBe("completed");
    expect(result.criterionResults[0]?.status).toBe("pass");
    expect(result.evidenceBundleId).toMatch(/^evidence-bundle-/);
    expect(repository.events.map((event) => event.type)).toContain("BrowserSnapshotCaptured");
    expect(repository.bundles).toHaveLength(1);
    expect(repository.bundles[0]?.schemaVersion).toBeUndefined();
    expect(JSON.parse(repository.bundles[0]?.artifactRefsJson ?? "[]")).toContain(screenshotRef);
  });

  it("fails workflow criteria when hard browser gates fail", async () => {
    const manager = new BrowserWorkflowManager(
      makeRuntime({
        summary: {
          visibleText: ["Fixture page"],
          consoleErrorCount: 1,
          networkFailureCount: 0,
          pageErrorCount: 0,
        },
      }),
    );

    const result = await manager.start(makeStartInput());

    expect(result.workflow.status).toBe("failed");
    expect(result.assertionResults.some((assertion) => assertion.status === "fail")).toBe(true);
    expect(result.criterionResults[0]?.status).toBe("fail");
  });

  it("marks selector assertions as not evaluated until DOM selector evidence is materialized", async () => {
    const manager = new BrowserWorkflowManager(makeRuntime());

    const result = await manager.start({
      ...makeStartInput(),
      assertions: [{ type: "selector-visible", selector: "[data-testid='submit']" }],
    });

    expect(result.workflow.status).toBe("completed");
    expect(result.assertionResults[0]?.status).toBe("not-evaluated");
    expect(result.criterionResults[0]?.status).toBe("not-evaluated");
  });
});
