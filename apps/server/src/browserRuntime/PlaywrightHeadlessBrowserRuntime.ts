import { randomUUID } from "node:crypto";

import {
  type BrowserObservation,
  type BrowserRuntimeKind,
  type BrowserSnapshot,
  EvidenceArtifactId,
  type PreviewTarget,
} from "@orchestrate/contracts";
import { Effect } from "effect";

import type { BrowserAutomationShape } from "../browser/Services/BrowserAutomation.ts";
import type {
  BrowserRuntime,
  BrowserRuntimeActInput,
  BrowserRuntimeActResult,
  BrowserRuntimeObserveInput,
  BrowserRuntimeOpenSessionInput,
  BrowserRuntimeSession,
} from "./BrowserRuntime.ts";
import { BrowserActionPolicy } from "./BrowserActionPolicy.ts";

export class PlaywrightHeadlessBrowserRuntime implements BrowserRuntime {
  private readonly sessions = new Map<string, BrowserRuntimeSession>();

  constructor(private readonly browserAutomation: BrowserAutomationShape) {}

  async openSession(input: BrowserRuntimeOpenSessionInput): Promise<BrowserRuntimeSession> {
    const firstViewport = input.viewport ?? input.previewTarget.viewports[0];
    const result = await Effect.runPromise(
      this.browserAutomation.openSession({
        url: input.previewTarget.canonicalUrl,
        ...(firstViewport
          ? {
              viewportWidth: firstViewport.width,
              viewportHeight: firstViewport.height,
            }
          : {}),
      }),
    );
    const snapshot = toBrowserSnapshot({
      observation: result.observation,
      previewTarget: input.previewTarget,
      runtimeKind: "playwright-headless",
    });
    const session: BrowserRuntimeSession = {
      browserSessionId: result.sessionId,
      previewTarget: input.previewTarget,
      runtimeKind: "playwright-headless",
      lastSnapshot: snapshot,
    };
    this.sessions.set(result.sessionId, session);
    return session;
  }

  async observe(input: BrowserRuntimeObserveInput): Promise<BrowserSnapshot> {
    return this.captureSnapshot(input);
  }

  async captureSnapshot(input: BrowserRuntimeObserveInput): Promise<BrowserSnapshot> {
    const session = this.requireSession(input.browserSessionId);
    const result = await Effect.runPromise(
      this.browserAutomation.act({
        sessionId: input.browserSessionId,
        action: { kind: "wait", ms: 0 },
      }),
    );
    const snapshot = toBrowserSnapshot({
      observation: result.observation,
      previewTarget: session.previewTarget,
      runtimeKind: session.runtimeKind,
    });
    this.sessions.set(input.browserSessionId, {
      ...session,
      lastSnapshot: snapshot,
    });
    return snapshot;
  }

  async act(input: BrowserRuntimeActInput): Promise<BrowserRuntimeActResult> {
    const session = this.requireSession(input.browserSessionId);
    const policyDecision = BrowserActionPolicy.validate(input.action, session.previewTarget);
    if (policyDecision.outcome !== "allow") {
      return { ok: false, policyDecision };
    }

    const result = await Effect.runPromise(
      this.browserAutomation.act({
        sessionId: input.browserSessionId,
        action: input.action,
      }),
    );
    const snapshot = toBrowserSnapshot({
      observation: result.observation,
      previewTarget: session.previewTarget,
      runtimeKind: session.runtimeKind,
    });
    this.sessions.set(input.browserSessionId, {
      ...session,
      lastSnapshot: snapshot,
    });
    return { ok: true, snapshot };
  }

  async closeSession(input: BrowserRuntimeObserveInput): Promise<void> {
    await Effect.runPromise(
      this.browserAutomation.closeSession({ sessionId: input.browserSessionId }),
    );
    this.sessions.delete(input.browserSessionId);
  }

  private requireSession(browserSessionId: BrowserSessionId): BrowserRuntimeSession {
    const session = this.sessions.get(browserSessionId);
    if (!session) {
      throw new Error(`Unknown browser runtime session: ${browserSessionId}`);
    }
    return session;
  }
}

function toBrowserSnapshot(input: {
  readonly observation: BrowserObservation;
  readonly previewTarget: PreviewTarget;
  readonly runtimeKind: BrowserRuntimeKind;
}): BrowserSnapshot {
  const snapshotId = `browser-snapshot-${randomUUID()}`;
  const pageMetrics = input.observation.pageMetrics;
  return {
    id: snapshotId,
    runtimeKind: input.runtimeKind,
    permissionTier: input.previewTarget.permissionTier,
    previewTargetId: input.previewTarget.id,
    browserSessionId: input.observation.sessionId,
    pageId: `page-${input.observation.sessionId}`,
    url: input.observation.url,
    title: input.observation.title,
    viewport: {
      width: pageMetrics?.viewportWidth ?? input.previewTarget.viewports[0]?.width ?? 1440,
      height: pageMetrics?.viewportHeight ?? input.previewTarget.viewports[0]?.height ?? 900,
      deviceScaleFactor: input.previewTarget.viewports[0]?.deviceScaleFactor ?? 1,
    },
    scroll: {
      x: 0,
      y: pageMetrics?.scrollTop ?? 0,
    },
    artifactRefs: {
      ...(input.observation.screenshotDataUrl
        ? { screenshot: artifactId("screenshot", snapshotId) }
        : {}),
      ...(input.observation.textSummary ? { domSnapshot: artifactId("dom", snapshotId) } : {}),
      ...(input.observation.ariaSnapshot
        ? { accessibilitySnapshot: artifactId("accessibility", snapshotId) }
        : {}),
      ...(input.observation.consoleErrors
        ? {
            consoleLog: artifactId("console", snapshotId),
            pageErrors: artifactId("page-errors", snapshotId),
          }
        : {}),
      ...(input.observation.networkErrors ? { networkLog: artifactId("network", snapshotId) } : {}),
    },
    summary: {
      visibleText: splitVisibleText(input.observation.textSummary),
      consoleErrorCount:
        input.observation.consoleErrors?.filter((entry) => entry.level === "error").length ?? 0,
      networkFailureCount: input.observation.networkErrors?.length ?? 0,
      pageErrorCount:
        input.observation.consoleErrors?.filter((entry) => entry.level === "error").length ?? 0,
    },
    capturedAt: input.observation.observedAt,
  };
}

function splitVisibleText(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 64);
}

function artifactId(kind: string, snapshotId: string) {
  return EvidenceArtifactId.makeUnsafe(`${kind}-${snapshotId}`);
}
