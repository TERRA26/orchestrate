import { randomUUID } from "node:crypto";

import {
  type BrowserObservation,
  BrowserPageId,
  type BrowserRuntimeKind,
  type BrowserSnapshot,
  BrowserSessionId,
  EvidenceArtifactId,
  type BrowserOpenSessionResult,
  type PreviewTarget,
  type ThreadId,
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
  private readonly automationSessionIds = new Map<string, string>();
  // ORC-158: track session ownership by thread id so a terminated
  // thread can have all of its browser sessions drained at once.
  // Each thread maps to a Set of browserSessionIds.
  private readonly sessionsByThread = new Map<ThreadId, Set<BrowserSessionId>>();

  constructor(private readonly browserAutomation: BrowserAutomationShape) {}

  async openSession(input: BrowserRuntimeOpenSessionInput): Promise<BrowserRuntimeSession> {
    const firstViewport = input.viewport ?? input.previewTarget.viewports[0];
    const result = await Effect.runPromise(
      this.browserAutomation.openSession({
        url: input.previewTarget.canonicalUrl,
        ...(input.cdpEndpointUrl ? { cdpEndpointUrl: input.cdpEndpointUrl } : {}),
        ...(input.cdpTargetId ? { cdpTargetId: input.cdpTargetId } : {}),
        ...(firstViewport
          ? {
              viewportWidth: firstViewport.width,
              viewportHeight: firstViewport.height,
            }
          : {}),
      }),
    );
    const snapshot = toBrowserSnapshot({
      observation: withBrowserSessionId(result.observation, sessionBrowserSessionId(input, result)),
      previewTarget: input.previewTarget,
      runtimeKind: "playwright-headless",
    });
    const session: BrowserRuntimeSession = {
      browserSessionId: sessionBrowserSessionId(input, result),
      previewTarget: input.previewTarget,
      runtimeKind: "playwright-headless",
      lastSnapshot: snapshot,
      ...(input.ownerThreadId ? { ownerThreadId: input.ownerThreadId } : {}),
    };
    this.sessions.set(session.browserSessionId, session);
    this.automationSessionIds.set(session.browserSessionId, result.sessionId);
    if (input.ownerThreadId) {
      const existing = this.sessionsByThread.get(input.ownerThreadId);
      if (existing) {
        existing.add(session.browserSessionId);
      } else {
        this.sessionsByThread.set(input.ownerThreadId, new Set([session.browserSessionId]));
      }
    }
    return session;
  }

  async observe(input: BrowserRuntimeObserveInput): Promise<BrowserSnapshot> {
    return this.captureSnapshot(input);
  }

  async observeObservation(input: BrowserRuntimeObserveInput): Promise<BrowserObservation> {
    const result = await Effect.runPromise(
      this.browserAutomation.act({
        sessionId: this.requireAutomationSessionId(input.browserSessionId),
        action: { kind: "wait", ms: 0 },
      }),
    );
    return withBrowserSessionId(result.observation, input.browserSessionId);
  }

  async captureSnapshot(input: BrowserRuntimeObserveInput): Promise<BrowserSnapshot> {
    const session = this.requireSession(input.browserSessionId);
    const observation = await this.observeObservation(input);
    const snapshot = toBrowserSnapshot({
      observation,
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
        sessionId: this.requireAutomationSessionId(input.browserSessionId),
        action: input.action,
      }),
    );
    const snapshot = toBrowserSnapshot({
      observation: withBrowserSessionId(result.observation, input.browserSessionId),
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
      this.browserAutomation.closeSession({
        sessionId: this.requireAutomationSessionId(input.browserSessionId),
      }),
    );
    this.dropSession(input.browserSessionId);
  }

  /**
   * ORC-158: best-effort close every session owned by `threadId`.
   * Returns counts of closures and a list of per-session errors so
   * the caller can log them. Does NOT throw on individual failures.
   */
  async closeSessionsForThread(threadId: ThreadId): Promise<{
    readonly closed: number;
    readonly errors: ReadonlyArray<{
      readonly browserSessionId: BrowserSessionId;
      readonly reason: string;
    }>;
  }> {
    const owned = this.sessionsByThread.get(threadId);
    if (!owned || owned.size === 0) {
      return { closed: 0, errors: [] };
    }
    const ids = Array.from(owned);
    return this.closeMany(ids);
  }

  /**
   * ORC-158: best-effort close every active session. Used from
   * process-shutdown hooks so a process exit no longer leaks
   * browser instances.
   */
  async closeAll(): Promise<{
    readonly closed: number;
    readonly errors: ReadonlyArray<{
      readonly browserSessionId: BrowserSessionId;
      readonly reason: string;
    }>;
  }> {
    const ids = Array.from(this.sessions.keys()).map((id) => id as BrowserSessionId);
    return this.closeMany(ids);
  }

  private async closeMany(ids: ReadonlyArray<BrowserSessionId>): Promise<{
    readonly closed: number;
    readonly errors: ReadonlyArray<{
      readonly browserSessionId: BrowserSessionId;
      readonly reason: string;
    }>;
  }> {
    const errors: Array<{ browserSessionId: BrowserSessionId; reason: string }> = [];
    let closed = 0;
    for (const id of ids) {
      const automationId = this.automationSessionIds.get(id);
      if (!automationId) {
        // Already gone or never opened by this runtime.
        this.dropSession(id);
        continue;
      }
      try {
        await Effect.runPromise(
          this.browserAutomation.closeSession({ sessionId: automationId }),
        );
        closed += 1;
      } catch (error) {
        errors.push({
          browserSessionId: id,
          reason: error instanceof Error ? error.message : String(error),
        });
      } finally {
        this.dropSession(id);
      }
    }
    return { closed, errors };
  }

  private dropSession(browserSessionId: BrowserSessionId): void {
    const session = this.sessions.get(browserSessionId);
    this.sessions.delete(browserSessionId);
    this.automationSessionIds.delete(browserSessionId);
    if (session?.ownerThreadId) {
      const owned = this.sessionsByThread.get(session.ownerThreadId);
      if (owned) {
        owned.delete(browserSessionId);
        if (owned.size === 0) {
          this.sessionsByThread.delete(session.ownerThreadId);
        }
      }
    }
  }

  private requireSession(browserSessionId: BrowserSessionId): BrowserRuntimeSession {
    const session = this.sessions.get(browserSessionId);
    if (!session) {
      throw new Error(`Unknown browser runtime session: ${browserSessionId}`);
    }
    return session;
  }

  private requireAutomationSessionId(browserSessionId: BrowserSessionId): string {
    const sessionId = this.automationSessionIds.get(browserSessionId);
    if (!sessionId) {
      throw new Error(`Unknown browser automation session: ${browserSessionId}`);
    }
    return sessionId;
  }
}

function sessionBrowserSessionId(
  input: BrowserRuntimeOpenSessionInput,
  result: BrowserOpenSessionResult,
): BrowserSessionId {
  return input.attachedBrowserSessionId ?? BrowserSessionId.makeUnsafe(result.sessionId);
}

function withBrowserSessionId(
  observation: BrowserObservation,
  browserSessionId: BrowserSessionId,
): BrowserObservation {
  return {
    ...observation,
    sessionId: browserSessionId,
  };
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
    pageId: BrowserPageId.makeUnsafe(`page-${input.observation.sessionId}`),
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
