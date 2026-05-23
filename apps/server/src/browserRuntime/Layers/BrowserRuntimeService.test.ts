import { assert, it } from "@effect/vitest";
import {
  BrowserApprovalId,
  BrowserSessionId,
  EvidenceArtifactId,
  PreviewTargetId,
  type BrowserAction,
  type PreviewTarget,
} from "@orchestrate/contracts";
import { Effect, Layer, Option } from "effect";
import { createHash } from "node:crypto";

import { BrowserAutomation } from "../../browser/Services/BrowserAutomation.ts";
import { BrowserControlLeaseServiceLive } from "../../browserControl/Layers/BrowserControlLeaseService.ts";
import { BrowserControlLeaseService } from "../../browserControl/Services/BrowserControlLeaseService.ts";
import { BrowserEvidenceRecorderLive } from "../../browserEvidence/Layers/BrowserEvidenceRecorder.ts";
import { BrowserOrchestrationEvidenceRepositoryLive } from "../../persistence/Layers/BrowserOrchestrationEvidence.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { BrowserOrchestrationEvidenceRepository } from "../../persistence/Services/BrowserOrchestrationEvidence.ts";
import { BrowserRuntimeService } from "../Services/BrowserRuntimeService.ts";
import { DesktopBrowserBridge } from "../Services/DesktopBrowserBridge.ts";
import { DesktopBrowserBridgeUnavailableLive } from "./DesktopBrowserBridge.ts";
import { BrowserRuntimeServiceLive } from "./BrowserRuntimeService.ts";

function makeBrowserAutomationLayer() {
  return Layer.succeed(BrowserAutomation, {
    openSession: (input) =>
      Effect.succeed({
        sessionId: "browser-session-service",
        observation: {
          sessionId: "browser-session-service",
          url: input.url,
          title: "Fixture",
          readyState: "complete",
          textSummary: "Fixture page",
          screenshotDataUrl: "data:image/png;base64,open",
          consoleErrors: [],
          networkErrors: [],
          targets: [],
          observedAt: "2026-04-28T00:00:00.000Z",
        },
      }),
    act: (input) =>
      Effect.succeed({
        observation: {
          sessionId: input.sessionId,
          url: "http://127.0.0.1:5173/next",
          title: "Next",
          readyState: "complete",
          textSummary: "Next page",
          screenshotDataUrl: "data:image/png;base64,next",
          consoleErrors: [],
          networkErrors: [],
          targets: [],
          observedAt: "2026-04-28T00:00:01.000Z",
        },
      }),
    closeSession: () => Effect.void,
  });
}

const browserAutomationLayer = makeBrowserAutomationLayer();
const evidenceRepositoryLayer = BrowserOrchestrationEvidenceRepositoryLive.pipe(
  Layer.provide(SqlitePersistenceMemory),
);
const evidenceRecorderLayer = BrowserEvidenceRecorderLive.pipe(
  Layer.provide(evidenceRepositoryLayer),
);
const controlLeaseLayer = BrowserControlLeaseServiceLive.pipe(
  Layer.provide(evidenceRepositoryLayer),
);
function makeHeadlessAttachBridgeLayer(input?: {
  readonly cdpSessionId?: string;
  readonly includeTargetId?: boolean;
}) {
  const visibleSessionId = "electron-visible-thread-runtime-service-tab-main";
  return Layer.succeed(DesktopBrowserBridge, {
    openSession: (openInput) =>
      Effect.succeed({
        sessionId: visibleSessionId,
        url: openInput.url,
        title: "Visible fixture",
        readyState: "complete",
        textSummary: "Visible fixture page",
        screenshotDataUrl: "data:image/png;base64,electron",
        targets: [],
        consoleErrors: [],
        networkErrors: [],
        runtimeKind: "electron-visible" as const,
        surfaceMode: "live-shared-browser" as const,
        isUserVisibleSurface: true,
        observedUrl: openInput.url,
        visiblePanelUrl: openInput.url,
        urlAgreement: "same" as const,
        observedAt: "2026-04-28T00:00:02.000Z",
      }),
    observeSession: (observeInput) =>
      Effect.succeed({
        sessionId: observeInput.sessionId,
        url: "http://127.0.0.1:5173/",
        title: "Visible fixture observed",
        readyState: "complete",
        textSummary: "Visible fixture observed page",
        screenshotDataUrl: "data:image/png;base64,electron-observed",
        targets: [],
        consoleErrors: [],
        networkErrors: [],
        runtimeKind: "electron-visible" as const,
        surfaceMode: "live-shared-browser" as const,
        isUserVisibleSurface: true,
        observedUrl: "http://127.0.0.1:5173/",
        visiblePanelUrl: "http://127.0.0.1:5173/",
        urlAgreement: "same" as const,
        observedAt: "2026-04-28T00:00:03.000Z",
      }),
    inspectSession: () => Effect.fail(new Error("inspectSession not used by attach tests")),
    resolveTargetSession: () =>
      Effect.fail(new Error("resolveTargetSession not used by attach tests")),
    actSession: () => Effect.fail(new Error("actSession not used by attach tests")),
    closeSession: () => Effect.void,
    getSessionOwnerClientId: () => Effect.succeed("desktop-client-runtime-test"),
    getCdpEndpoint: () =>
      Effect.succeed({
        endpointUrl: "http://127.0.0.1:9333",
        port: 9333,
        sessions: [
          {
            sessionId: input?.cdpSessionId ?? visibleSessionId,
            webContentsId: 42,
            ...(input?.includeTargetId === false
              ? {}
              : { targetId: "target-visible-runtime-service" }),
            url: "http://127.0.0.1:5173/",
            title: "Visible fixture",
          },
        ],
      }),
  });
}

const headlessAttachBridgeLayer = makeHeadlessAttachBridgeLayer();
const layer = it.layer(
  Layer.mergeAll(
    BrowserRuntimeServiceLive.pipe(
      Layer.provide(browserAutomationLayer),
      Layer.provide(evidenceRecorderLayer),
      Layer.provide(headlessAttachBridgeLayer),
      Layer.provide(controlLeaseLayer),
      Layer.provide(evidenceRepositoryLayer),
    ),
    evidenceRepositoryLayer,
    controlLeaseLayer,
  ),
);

layer("BrowserRuntimeServiceLive", (it) => {
  it.effect("opens a supplied PreviewTarget instead of synthesizing one from the URL", () =>
    Effect.gen(function* () {
      const runtime = yield* BrowserRuntimeService;

      const previewTarget: PreviewTarget = {
        id: PreviewTargetId.makeUnsafe("preview-target-runtime-service"),
        version: 1,
        sessionId: "thread-runtime-preview-target",
        kind: "local-dev-server",
        canonicalUrl: "http://127.0.0.1:5173/from-target",
        baseUrl: "http://127.0.0.1:5173/",
        initialRoute: "/from-target",
        allowedOrigins: ["http://127.0.0.1:5173"],
        deniedOrigins: [],
        authMode: "none",
        permissionTier: "isolated-local-preview",
        viewports: [
          {
            id: "desktop",
            label: "Desktop",
            width: 1440,
            height: 900,
            deviceScaleFactor: 1,
          },
        ],
        readinessEvidenceRef: EvidenceArtifactId.makeUnsafe("health-runtime-service"),
        serverLogRefs: [EvidenceArtifactId.makeUnsafe("server-log-runtime-service")],
        createdAt: "2026-04-28T00:00:00.000Z",
      };

      const openResult = yield* runtime.openSession({
        url: previewTarget.canonicalUrl,
        threadId: "thread-runtime-preview-target",
        previewTarget,
        preferredRuntimeKind: "playwright-headless",
      });

      assert.strictEqual(openResult.runtimeTruth?.previewTargetId, previewTarget.id);
    }),
  );

  it.effect("writes durable evidence for openSession and act", () =>
    Effect.gen(function* () {
      const runtime = yield* BrowserRuntimeService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;

      const openResult = yield* runtime.openSession({
        url: "http://127.0.0.1:5173/",
        threadId: "thread-runtime-service",
        preferredRuntimeKind: "playwright-headless",
      });
      assert.ok(openResult.runtimeTruth?.screenshotArtifactRef);
      assert.ok(openResult.evidenceRefs && openResult.evidenceRefs.length > 0);

      const openScreenshot = yield* repository.getEvidenceArtifact({
        artifactId: openResult.runtimeTruth!.screenshotArtifactRef!,
      });
      assert.ok(Option.isSome(openScreenshot));
      assert.strictEqual(Option.getOrThrow(openScreenshot).kind, "browser-screenshot");

      const actResult = yield* runtime.act({
        sessionId: openResult.sessionId,
        action: { kind: "navigate", url: "http://127.0.0.1:5173/next" },
      });
      assert.ok(actResult.runtimeTruth?.screenshotArtifactRef);
      assert.ok(actResult.evidenceRefs && actResult.evidenceRefs.length > 0);

      const events = yield* repository.getSessionEvents({ sessionId: "thread-runtime-service" });
      assert.ok(events.some((event) => event.type === "BrowserSessionCreated"));
      assert.ok(events.some((event) => event.type === "BrowserActionRecorded"));
      assert.ok(events.some((event) => event.type === "BrowserObservationCaptured"));
      assert.ok(events.some((event) => event.type === "BrowserClaimGateEvaluated"));
    }),
  );

  it.effect("observe captures fresh durable evidence without a browser action", () =>
    Effect.gen(function* () {
      const runtime = yield* BrowserRuntimeService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;

      const openResult = yield* runtime.openSession({
        url: "http://127.0.0.1:5173/",
        threadId: "thread-runtime-observe-fresh",
        preferredRuntimeKind: "playwright-headless",
      });

      const observed = yield* runtime.observe({ sessionId: openResult.sessionId });
      assert.strictEqual(observed.status, "ok");
      assert.ok(observed.runtimeTruth?.screenshotArtifactRef);
      assert.ok(observed.evidenceRefs && observed.evidenceRefs.length > 0);

      const events = yield* repository.getSessionEvents({
        sessionId: "thread-runtime-observe-fresh",
      });
      assert.ok(events.some((event) => event.type === "BrowserObservationCaptured"));
      assert.ok(events.some((event) => event.type === "BrowserClaimGateEvaluated"));
    }),
  );

  it.effect("writes policy-denied evidence when an action is blocked", () =>
    Effect.gen(function* () {
      const runtime = yield* BrowserRuntimeService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;

      const openResult = yield* runtime.openSession({
        url: "https://example.com/",
        threadId: "thread-runtime-denied",
        preferredRuntimeKind: "playwright-headless",
      });

      const exit = yield* Effect.exit(
        runtime.act({
          sessionId: openResult.sessionId,
          action: { kind: "navigate", url: "https://blocked.example/" },
        }),
      );
      assert.strictEqual(exit._tag, "Failure");

      const events = yield* repository.getSessionEvents({ sessionId: "thread-runtime-denied" });
      assert.ok(events.some((event) => event.type === "BrowserPolicyDecisionRecorded"));
    }),
  );
});

const noMatchingCdpSessionLayer = it.layer(
  Layer.mergeAll(
    BrowserRuntimeServiceLive.pipe(
      Layer.provide(browserAutomationLayer),
      Layer.provide(evidenceRecorderLayer),
      Layer.provide(
        makeHeadlessAttachBridgeLayer({
          cdpSessionId: "electron-visible-other-session",
        }),
      ),
      Layer.provide(controlLeaseLayer),
      Layer.provide(evidenceRepositoryLayer),
    ),
    evidenceRepositoryLayer,
    controlLeaseLayer,
  ),
);

noMatchingCdpSessionLayer("BrowserRuntimeServiceLive CDP attach fail-closed", (it) => {
  it.effect("fails closed when the CDP endpoint has no matching visible session", () =>
    Effect.gen(function* () {
      const runtime = yield* BrowserRuntimeService;

      const exit = yield* Effect.exit(
        runtime.openSession({
          url: "http://127.0.0.1:5173/",
          threadId: "thread-runtime-cdp-no-match",
          preferredRuntimeKind: "playwright-headless",
        }),
      );

      assert.strictEqual(exit._tag, "Failure");
      assert.match(String(exit.cause), /did not expose a targetId/);
    }),
  );
});

const missingTargetIdLayer = it.layer(
  Layer.mergeAll(
    BrowserRuntimeServiceLive.pipe(
      Layer.provide(browserAutomationLayer),
      Layer.provide(evidenceRecorderLayer),
      Layer.provide(makeHeadlessAttachBridgeLayer({ includeTargetId: false })),
      Layer.provide(controlLeaseLayer),
      Layer.provide(evidenceRepositoryLayer),
    ),
    evidenceRepositoryLayer,
    controlLeaseLayer,
  ),
);

missingTargetIdLayer("BrowserRuntimeServiceLive CDP attach missing target", (it) => {
  it.effect("fails closed when the matching CDP session has no target id", () =>
    Effect.gen(function* () {
      const runtime = yield* BrowserRuntimeService;

      const exit = yield* Effect.exit(
        runtime.openSession({
          url: "http://127.0.0.1:5173/",
          threadId: "thread-runtime-cdp-missing-target",
          preferredRuntimeKind: "playwright-headless",
        }),
      );

      assert.strictEqual(exit._tag, "Failure");
      assert.match(String(exit.cause), /did not expose a targetId/);
    }),
  );
});

const unavailableLayer = it.layer(
  Layer.mergeAll(
    BrowserRuntimeServiceLive.pipe(
      Layer.provide(browserAutomationLayer),
      Layer.provide(evidenceRecorderLayer),
      Layer.provide(DesktopBrowserBridgeUnavailableLive),
      Layer.provide(controlLeaseLayer),
      Layer.provide(evidenceRepositoryLayer),
    ),
    evidenceRepositoryLayer,
    controlLeaseLayer,
  ),
);

unavailableLayer("BrowserRuntimeServiceLive unavailable desktop bridge", (it) => {
  it.effect("refuses default electron-visible sessions instead of falling back to headless", () =>
    Effect.gen(function* () {
      const runtime = yield* BrowserRuntimeService;

      const exit = yield* Effect.exit(
        runtime.openSession({
          url: "http://127.0.0.1:5173/",
          threadId: "thread-runtime-electron-visible",
        }),
      );

      assert.strictEqual(exit._tag, "Failure");
      assert.match(String(exit.cause), /refusing headless fallback/);
    }),
  );
});

let electronBridgeOwnerClientId: string | null = "desktop-client-runtime-test";

const electronBridgeLayer = Layer.succeed(DesktopBrowserBridge, {
  openSession: (input) =>
    Effect.succeed({
      sessionId: "electron-visible-thread-runtime-electron-tab-main",
      url: input.url,
      title: "Visible fixture",
      readyState: "complete",
      textSummary: "Visible fixture page",
      screenshotDataUrl: "data:image/png;base64,electron",
      targets: [],
      consoleErrors: [],
      networkErrors: [],
      pageMetrics: {
        totalInteractiveElements: 0,
        totalImages: 0,
        totalInputs: 0,
        totalLinks: 0,
        headings: ["Visible fixture"],
        viewportWidth: 1440,
        viewportHeight: 900,
        scrollHeight: 900,
        scrollTop: 0,
      },
      runtimeKind: "electron-visible",
      surfaceMode: "live-shared-browser",
      isUserVisibleSurface: true,
      observedUrl: input.url,
      visiblePanelUrl: input.url,
      urlAgreement: "same",
      observedAt: "2026-04-28T00:00:02.000Z",
    }),
  observeSession: (input) =>
    Effect.succeed({
      sessionId: input.sessionId,
      url: "http://127.0.0.1:5173/",
      title: "Visible fixture observed",
      readyState: "complete",
      textSummary: "Visible fixture observed page",
      screenshotDataUrl: "data:image/png;base64,electron-observed",
      targets: [],
      consoleErrors: [],
      networkErrors: [],
      runtimeKind: "electron-visible",
      surfaceMode: "live-shared-browser",
      isUserVisibleSurface: true,
      observedUrl: "http://127.0.0.1:5173/",
      visiblePanelUrl: "http://127.0.0.1:5173/",
      urlAgreement: "same",
      observedAt: "2026-04-28T00:00:03.000Z",
    }),
  inspectSession: (input) =>
    Effect.succeed({
      browserSessionId: input.sessionId,
      runtimeTruth: {
        runtimeKind: "electron-visible" as const,
        surfaceMode: "live-shared-browser" as const,
        isUserVisibleSurface: true,
        browserSessionId: input.sessionId,
        observedUrl: "http://127.0.0.1:5173/",
        visiblePanelUrl: "http://127.0.0.1:5173/",
        urlAgreement: "same" as const,
      },
      url: "http://127.0.0.1:5173/",
      title: "Visible fixture inspected",
      elements: [
        {
          id: "element-save",
          tagName: "button",
          role: "button",
          name: "Save",
          testId: "save-button",
          visible: true,
          enabled: true,
          box: { x: 10, y: 20, width: 80, height: 32, coordinateSpace: "css-pixels" as const },
        },
      ],
      evidenceRefs: [],
    }),
  resolveTargetSession: (input) =>
    Effect.sync(() => {
      if (input.target.kind === "test-id" && input.target.testId === "missing-button") {
        return {
          browserSessionId: input.sessionId,
          targetResolution: {
            requested: input.target,
            status: "not-found" as const,
            reason: "Target element was not found.",
            candidates: [],
          },
        };
      }
      if (input.target.kind === "test-id" && input.target.testId === "plain-div") {
        return {
          browserSessionId: input.sessionId,
          targetResolution: {
            requested: input.target,
            status: "not-actionable" as const,
            reason: "Target is not an input, textarea, or contenteditable element.",
            candidates: [
              {
                id: "plain-div",
                tagName: "div",
                name: "Plain div",
                visible: true,
                enabled: true,
                box: {
                  x: 10,
                  y: 20,
                  width: 80,
                  height: 32,
                  coordinateSpace: "css-pixels" as const,
                },
              },
            ],
          },
        };
      }
      if (input.target.kind === "text" && input.target.text === "Duplicate Save") {
        return {
          browserSessionId: input.sessionId,
          targetResolution: {
            requested: input.target,
            status: "ambiguous" as const,
            reason: "Multiple visible elements matched text Duplicate Save.",
            candidates: [
              {
                id: "save-button",
                tagName: "button",
                role: "button",
                name: "Duplicate Save",
                visible: true,
                enabled: true,
                box: {
                  x: 10,
                  y: 20,
                  width: 80,
                  height: 32,
                  coordinateSpace: "css-pixels" as const,
                },
              },
              {
                id: "save-link",
                tagName: "a",
                role: "link",
                name: "Duplicate Save",
                visible: true,
                enabled: true,
                box: {
                  x: 100,
                  y: 20,
                  width: 80,
                  height: 32,
                  coordinateSpace: "css-pixels" as const,
                },
              },
            ],
          },
        };
      }
      const resolvedTarget = {
        id: input.target.kind === "test-id" ? input.target.testId : "element-save",
        tagName: "button",
        role: "button",
        name:
          input.target.kind === "test-id" && input.target.testId === "primary-button"
            ? "Delete project"
            : input.target.kind === "text"
              ? input.target.text
              : "Save",
        testId: input.target.kind === "test-id" ? input.target.testId : "save-button",
        visible: true,
        enabled: true,
        box: { x: 10, y: 20, width: 80, height: 32, coordinateSpace: "css-pixels" as const },
      };
      return {
        browserSessionId: input.sessionId,
        resolvedTarget,
        targetResolution: {
          requested: input.target,
          status: "resolved" as const,
          candidates: [resolvedTarget],
        },
      };
    }),
  actSession: (input) =>
    Effect.sync(() => {
      electronBridgeActCount += 1;
      const resolvedTarget =
        input.action.kind === "clickTarget" || input.action.kind === "fillTarget"
          ? {
              id: "element-save",
              tagName: "button",
              role: "button",
              name: input.action.target.kind === "text" ? input.action.target.text : "Save",
              testId: "save-button",
              visible: true,
              enabled: true,
              box: { x: 10, y: 20, width: 80, height: 32, coordinateSpace: "css-pixels" as const },
            }
          : undefined;
      return {
        sessionId: input.sessionId,
        url: input.action.kind === "navigate" ? input.action.url : "http://127.0.0.1:5173/",
        title: "Visible fixture acted",
        readyState: "complete",
        textSummary: "Visible fixture acted page",
        screenshotDataUrl: "data:image/png;base64,electron-acted",
        targets: [],
        consoleErrors: [],
        networkErrors: [],
        runtimeKind: "electron-visible" as const,
        surfaceMode: "live-shared-browser" as const,
        isUserVisibleSurface: true,
        observedUrl: input.action.kind === "navigate" ? input.action.url : "http://127.0.0.1:5173/",
        visiblePanelUrl:
          input.action.kind === "navigate" ? input.action.url : "http://127.0.0.1:5173/",
        urlAgreement: "same" as const,
        ...(resolvedTarget
          ? {
              resolvedTarget,
              targetResolution: {
                requested:
                  input.action.kind === "clickTarget" || input.action.kind === "fillTarget"
                    ? input.action.target
                    : { kind: "element-ref" as const, elementId: resolvedTarget.id },
                status: "resolved" as const,
                candidates: [resolvedTarget],
              },
            }
          : {}),
        observedAt: "2026-04-28T00:00:04.000Z",
      };
    }),
  closeSession: () => Effect.void,
  getSessionOwnerClientId: () => Effect.succeed(electronBridgeOwnerClientId),
});

const electronLayer = it.layer(
  Layer.mergeAll(
    BrowserRuntimeServiceLive.pipe(
      Layer.provide(browserAutomationLayer),
      Layer.provide(evidenceRecorderLayer),
      Layer.provide(electronBridgeLayer),
      Layer.provide(controlLeaseLayer),
      Layer.provide(evidenceRepositoryLayer),
    ),
    evidenceRepositoryLayer,
    controlLeaseLayer,
  ),
);

function actionHash(action: BrowserAction): string {
  return createHash("sha256").update(JSON.stringify(action)).digest("hex");
}

let electronBridgeActCount = 0;

electronLayer("BrowserRuntimeServiceLive electron-visible bridge", (it) => {
  it.effect("defaults omitted openSession runtime preference to electron-visible", () =>
    Effect.gen(function* () {
      const runtime = yield* BrowserRuntimeService;

      const result = yield* runtime.openSession({
        url: "http://127.0.0.1:5173/",
        threadId: "thread-runtime-electron-visible-default",
      });

      assert.strictEqual(result.runtimeTruth?.runtimeKind, "electron-visible");
      assert.strictEqual(result.runtimeTruth?.surfaceMode, "live-shared-browser");
      assert.strictEqual(result.runtimeTruth?.isUserVisibleSurface, true);
      assert.match(String(result.sessionId), /^electron-visible-/);
    }),
  );

  it.effect("records durable same-surface evidence for electron-visible openSession", () =>
    Effect.gen(function* () {
      const runtime = yield* BrowserRuntimeService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;

      const result = yield* runtime.openSession({
        url: "http://127.0.0.1:5173/",
        threadId: "thread-runtime-electron-visible",
        preferredRuntimeKind: "electron-visible",
      });

      assert.strictEqual(result.runtimeTruth?.runtimeKind, "electron-visible");
      assert.strictEqual(result.runtimeTruth?.surfaceMode, "live-shared-browser");
      assert.strictEqual(result.runtimeTruth?.isUserVisibleSurface, true);
      assert.strictEqual(result.runtimeTruth?.urlAgreement, "same");
      assert.ok(result.runtimeTruth?.screenshotArtifactRef);
      assert.ok(result.evidenceRefs && result.evidenceRefs.length > 0);

      const screenshot = yield* repository.getEvidenceArtifact({
        artifactId: result.runtimeTruth!.screenshotArtifactRef!,
      });
      assert.ok(Option.isSome(screenshot));
      assert.strictEqual(Option.getOrThrow(screenshot).kind, "browser-screenshot");

      const events = yield* repository.getSessionEvents({
        sessionId: "thread-runtime-electron-visible",
      });
      assert.ok(events.some((event) => event.type === "BrowserSessionCreated"));
      assert.ok(events.some((event) => event.type === "BrowserObservationCaptured"));
      assert.ok(events.some((event) => event.type === "BrowserClaimGateEvaluated"));
    }),
  );

  it.effect(
    "returns a structured blocked result for unsupported electron-visible actions without recording allowed action evidence",
    () =>
      Effect.gen(function* () {
        const runtime = yield* BrowserRuntimeService;
        const repository = yield* BrowserOrchestrationEvidenceRepository;

        const result = yield* runtime.openSession({
          url: "http://127.0.0.1:5173/",
          threadId: "thread-runtime-electron-act-denied",
          preferredRuntimeKind: "electron-visible",
        });

        const actResult = yield* runtime.act({
          sessionId: result.sessionId,
          action: { kind: "evaluate", expression: "document.title" },
        });

        assert.strictEqual(actResult.status, "blocked");
        assert.match(actResult.reason ?? "", /does not support evaluate/);
        assert.strictEqual(actResult.runtimeTruth?.runtimeKind, "electron-visible");
        assert.ok(actResult.evidenceRefs && actResult.evidenceRefs.length > 0);

        const events = yield* repository.getSessionEvents({
          sessionId: "thread-runtime-electron-act-denied",
        });
        assert.ok(events.some((event) => event.type === "BrowserPolicyDecisionRecorded"));
        assert.ok(!events.some((event) => event.type === "BrowserActionRecorded"));
      }),
  );

  it.effect("records successful same-surface evidence for allowed electron-visible actions", () =>
    Effect.gen(function* () {
      const runtime = yield* BrowserRuntimeService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;

      const result = yield* runtime.openSession({
        url: "http://127.0.0.1:5173/",
        threadId: "thread-runtime-electron-action",
        preferredRuntimeKind: "electron-visible",
      });

      const actResult = yield* runtime.act({
        sessionId: result.sessionId,
        action: { kind: "navigate", url: "http://127.0.0.1:5173/settings" },
      });

      assert.strictEqual(actResult.status, "ok");
      assert.strictEqual(actResult.runtimeTruth?.runtimeKind, "electron-visible");
      assert.strictEqual(actResult.observation.url, "http://127.0.0.1:5173/settings");
      assert.ok(actResult.runtimeTruth?.screenshotArtifactRef);
      assert.ok(actResult.evidenceRefs && actResult.evidenceRefs.length > 0);

      const events = yield* repository.getSessionEvents({
        sessionId: "thread-runtime-electron-action",
      });
      assert.ok(events.some((event) => event.type === "BrowserActionRecorded"));
      assert.ok(events.some((event) => event.type === "BrowserObservationCaptured"));
    }),
  );

  it.effect(
    "inspects and executes targeted electron-visible actions through the desktop bridge",
    () =>
      Effect.gen(function* () {
        const runtime = yield* BrowserRuntimeService;
        const repository = yield* BrowserOrchestrationEvidenceRepository;

        const result = yield* runtime.openSession({
          url: "http://127.0.0.1:5173/",
          threadId: "thread-runtime-electron-targeted-action",
          preferredRuntimeKind: "electron-visible",
        });

        const inspect = yield* runtime.inspect({ sessionId: result.sessionId });
        assert.strictEqual(inspect.runtimeTruth.runtimeKind, "electron-visible");
        assert.strictEqual(inspect.elements[0]?.box?.coordinateSpace, "css-pixels");
        assert.ok(inspect.evidenceRefs.length > 0);
        const inspectArtifact = yield* repository.getEvidenceArtifact({
          artifactId: inspect.evidenceRefs.at(-1)!,
        });
        assert.strictEqual(Option.getOrThrow(inspectArtifact).kind, "browser-inspection");

        const actResult = yield* runtime.act({
          sessionId: result.sessionId,
          action: { kind: "clickTarget", target: { kind: "test-id", testId: "save-button" } },
        });

        assert.strictEqual(actResult.status, "ok");
        assert.strictEqual(actResult.runtimeTruth?.runtimeKind, "electron-visible");
        assert.strictEqual(actResult.resolvedTarget?.name, "Save");
        assert.strictEqual(actResult.targetResolution?.status, "resolved");
        assert.ok(actResult.evidenceRefs && actResult.evidenceRefs.length > 0);

        const events = yield* repository.getSessionEvents({
          sessionId: "thread-runtime-electron-targeted-action",
        });
        assert.ok(events.some((event) => event.type === "BrowserActionRecorded"));
        assert.ok(events.some((event) => event.type === "BrowserObservationCaptured"));
      }),
  );

  it.effect(
    "creates durable approval requests and executes approved retry only after approval",
    () =>
      Effect.gen(function* () {
        const runtime = yield* BrowserRuntimeService;
        const repository = yield* BrowserOrchestrationEvidenceRepository;

        const result = yield* runtime.openSession({
          url: "http://127.0.0.1:5173/",
          threadId: "thread-runtime-electron-approval",
          preferredRuntimeKind: "electron-visible",
        });

        const action = { kind: "navigate" as const, url: "https://example.com/external" };
        const pending = yield* runtime.act({
          sessionId: result.sessionId,
          action,
        });

        assert.strictEqual(pending.status, "requires-approval");
        assert.ok(pending.approvalRequestId);

        const approvals = yield* repository.listBrowserApprovalRequests({
          browserSessionId: result.sessionId,
        });
        assert.strictEqual(approvals.length, 1);
        assert.strictEqual(approvals[0]!.status, "pending");
        assert.ok(approvals[0]!.actionHash.length > 0);
        assert.strictEqual(approvals[0]!.desktopClientId, "desktop-client-runtime-test");
        assert.ok(approvals[0]!.expiresAt);
        assert.strictEqual(approvals[0]!.observedUrl, "http://127.0.0.1:5173/");

        const approvalEvents = yield* repository.getSessionEvents({
          sessionId: result.sessionId,
        });
        assert.ok(approvalEvents.some((event) => event.type === "BrowserApprovalRequestCreated"));

        let events = yield* repository.getSessionEvents({
          sessionId: "thread-runtime-electron-approval",
        });
        assert.ok(!events.some((event) => event.type === "BrowserActionRecorded"));

        yield* repository.updateBrowserApprovalStatus({
          approvalId: pending.approvalRequestId!,
          status: "approved",
          updatedAt: "2026-04-28T00:00:05.000Z",
        });

        const approved = yield* runtime.act({
          sessionId: result.sessionId,
          action,
          approvalRef: pending.approvalRequestId,
        });

        assert.strictEqual(approved.status, "ok");
        assert.strictEqual(approved.observation.url, "https://example.com/external");

        const consumedApproval = yield* repository.getBrowserApprovalRequest({
          approvalId: pending.approvalRequestId!,
        });
        assert.ok(Option.isSome(consumedApproval));
        assert.strictEqual(consumedApproval.value.status, "consumed");
        assert.ok(consumedApproval.value.consumedAt);
        assert.ok(consumedApproval.value.executedActionRef);

        const reuseBlocked = yield* runtime.act({
          sessionId: result.sessionId,
          action,
          approvalRef: pending.approvalRequestId,
        });
        assert.strictEqual(reuseBlocked.status, "requires-approval");
        assert.notStrictEqual(reuseBlocked.approvalRequestId, pending.approvalRequestId);

        events = yield* repository.getSessionEvents({
          sessionId: "thread-runtime-electron-approval",
        });
        assert.ok(events.some((event) => event.type === "BrowserActionRecorded"));
        const browserSessionEvents = yield* repository.getSessionEvents({
          sessionId: result.sessionId,
        });
        assert.ok(browserSessionEvents.some((event) => event.type === "BrowserApprovalConsumed"));
      }),
  );

  it.effect("blocks approved retry when the desktop owner changed", () =>
    Effect.gen(function* () {
      electronBridgeOwnerClientId = "desktop-client-runtime-test";
      const runtime = yield* BrowserRuntimeService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;

      const result = yield* runtime.openSession({
        url: "http://127.0.0.1:5173/",
        threadId: "thread-runtime-electron-approval-owner",
        preferredRuntimeKind: "electron-visible",
      });

      const action = { kind: "navigate" as const, url: "https://example.com/external" };
      const pending = yield* runtime.act({ sessionId: result.sessionId, action });
      assert.strictEqual(pending.status, "requires-approval");
      assert.ok(pending.approvalRequestId);

      yield* repository.updateBrowserApprovalStatus({
        approvalId: pending.approvalRequestId!,
        status: "approved",
        updatedAt: "2026-04-28T00:00:05.000Z",
      });

      electronBridgeOwnerClientId = "desktop-client-runtime-test-reattached";
      const blocked = yield* runtime.act({
        sessionId: result.sessionId,
        action,
        approvalRef: pending.approvalRequestId,
      });

      assert.strictEqual(blocked.status, "requires-approval");
      assert.notStrictEqual(blocked.approvalRequestId, pending.approvalRequestId);
      electronBridgeOwnerClientId = "desktop-client-runtime-test";
    }),
  );

  it.effect("blocks approved retry when the action hash changed", () =>
    Effect.gen(function* () {
      electronBridgeOwnerClientId = "desktop-client-runtime-test";
      const runtime = yield* BrowserRuntimeService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;

      const result = yield* runtime.openSession({
        url: "http://127.0.0.1:5173/",
        threadId: "thread-runtime-electron-approval-action-hash",
        preferredRuntimeKind: "electron-visible",
      });

      const approvedAction = { kind: "navigate" as const, url: "https://example.com/external" };
      const changedAction = { kind: "navigate" as const, url: "https://example.com/changed" };
      const pending = yield* runtime.act({ sessionId: result.sessionId, action: approvedAction });
      assert.strictEqual(pending.status, "requires-approval");
      assert.ok(pending.approvalRequestId);

      yield* repository.updateBrowserApprovalStatus({
        approvalId: pending.approvalRequestId!,
        status: "approved",
        updatedAt: "2026-04-28T00:00:05.000Z",
      });

      const blocked = yield* runtime.act({
        sessionId: result.sessionId,
        action: changedAction,
        approvalRef: pending.approvalRequestId,
      });

      assert.strictEqual(blocked.status, "requires-approval");
      assert.notStrictEqual(blocked.approvalRequestId, pending.approvalRequestId);

      const events = yield* repository.getSessionEvents({
        sessionId: "thread-runtime-electron-approval-action-hash",
      });
      assert.ok(!events.some((event) => event.type === "BrowserActionRecorded"));
    }),
  );

  it.effect("expires stale approval retries without executing the desktop action", () =>
    Effect.gen(function* () {
      electronBridgeOwnerClientId = "desktop-client-runtime-test";
      const runtime = yield* BrowserRuntimeService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;

      const result = yield* runtime.openSession({
        url: "http://127.0.0.1:5173/",
        threadId: "thread-runtime-electron-approval-expired",
        preferredRuntimeKind: "electron-visible",
      });

      const action = { kind: "navigate" as const, url: "https://example.com/external" };
      const approvalId = BrowserApprovalId.makeUnsafe("browser-approval-expired-retry");
      yield* repository.createBrowserApprovalRequest({
        approvalId,
        browserSessionId: BrowserSessionId.makeUnsafe(result.sessionId),
        sessionId: result.sessionId,
        desktopClientId: "desktop-client-runtime-test",
        actionJson: JSON.stringify(action),
        targetContextJson: null,
        actionHash: actionHash(action),
        reason: "External navigation requires approval.",
        risk: "external-navigation",
        preApprovalObservationRef: null,
        observedUrl: "http://127.0.0.1:5173/",
        origin: "http://127.0.0.1:5173",
        status: "approved",
        evidenceRefsJson: JSON.stringify([]),
        createdAt: "2026-04-28T00:00:00.000Z",
        updatedAt: "2026-04-28T00:00:01.000Z",
        expiresAt: "2026-04-28T00:00:02.000Z",
        consumedAt: null,
        executedActionRef: null,
        decisionReason: null,
      });

      const actCountBefore = electronBridgeActCount;
      const blocked = yield* runtime.act({
        sessionId: result.sessionId,
        action,
        approvalRef: approvalId,
      });

      assert.strictEqual(blocked.status, "requires-approval");
      assert.notStrictEqual(blocked.approvalRequestId, approvalId);
      assert.strictEqual(electronBridgeActCount, actCountBefore);

      const expired = yield* repository.getBrowserApprovalRequest({ approvalId });
      assert.ok(Option.isSome(expired));
      assert.strictEqual(expired.value.status, "expired");
      assert.match(expired.value.decisionReason ?? "", /expired/i);

      const events = yield* repository.getSessionEvents({
        sessionId: "thread-runtime-electron-approval-expired",
      });
      assert.ok(!events.some((event) => event.type === "BrowserActionRecorded"));
    }),
  );

  it.effect("blocks approved retry when the approval belongs to another browser session", () =>
    Effect.gen(function* () {
      electronBridgeOwnerClientId = "desktop-client-runtime-test";
      const runtime = yield* BrowserRuntimeService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;

      const result = yield* runtime.openSession({
        url: "http://127.0.0.1:5173/",
        threadId: "thread-runtime-electron-approval-wrong-session",
        preferredRuntimeKind: "electron-visible",
      });

      const action = { kind: "navigate" as const, url: "https://example.com/external" };
      const approvalId = BrowserApprovalId.makeUnsafe("browser-approval-wrong-session");
      yield* repository.createBrowserApprovalRequest({
        approvalId,
        browserSessionId: BrowserSessionId.makeUnsafe("electron-visible-other-session"),
        sessionId: "electron-visible-other-session",
        desktopClientId: "desktop-client-runtime-test",
        actionJson: JSON.stringify(action),
        targetContextJson: null,
        actionHash: actionHash(action),
        reason: "External navigation requires approval.",
        risk: "external-navigation",
        preApprovalObservationRef: null,
        observedUrl: "http://127.0.0.1:5173/",
        origin: "http://127.0.0.1:5173",
        status: "approved",
        evidenceRefsJson: JSON.stringify([]),
        createdAt: "2026-04-28T00:00:00.000Z",
        updatedAt: "2026-04-28T00:00:01.000Z",
        expiresAt: "2999-04-28T00:00:02.000Z",
        consumedAt: null,
        executedActionRef: null,
        decisionReason: null,
      });

      const actCountBefore = electronBridgeActCount;
      const blocked = yield* runtime.act({
        sessionId: result.sessionId,
        action,
        approvalRef: approvalId,
      });

      assert.strictEqual(blocked.status, "requires-approval");
      assert.notStrictEqual(blocked.approvalRequestId, approvalId);
      assert.strictEqual(electronBridgeActCount, actCountBefore);
    }),
  );

  it.effect("blocks approved retry when the observed origin is incompatible", () =>
    Effect.gen(function* () {
      electronBridgeOwnerClientId = "desktop-client-runtime-test";
      const runtime = yield* BrowserRuntimeService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;

      const result = yield* runtime.openSession({
        url: "http://127.0.0.1:5173/",
        threadId: "thread-runtime-electron-approval-incompatible-origin",
        preferredRuntimeKind: "electron-visible",
      });

      const action = { kind: "click" as const, targetId: "delete-button" };
      const approvalId = BrowserApprovalId.makeUnsafe("browser-approval-incompatible-origin");
      yield* repository.createBrowserApprovalRequest({
        approvalId,
        browserSessionId: BrowserSessionId.makeUnsafe(result.sessionId),
        sessionId: result.sessionId,
        desktopClientId: "desktop-client-runtime-test",
        actionJson: JSON.stringify(action),
        targetContextJson: null,
        actionHash: actionHash(action),
        reason: "Delete button requires approval.",
        risk: "consequential-action",
        preApprovalObservationRef: null,
        observedUrl: "https://evil.example/delete",
        origin: "https://evil.example",
        status: "approved",
        evidenceRefsJson: JSON.stringify([]),
        createdAt: "2026-04-28T00:00:00.000Z",
        updatedAt: "2026-04-28T00:00:01.000Z",
        expiresAt: "2999-04-28T00:00:02.000Z",
        consumedAt: null,
        executedActionRef: null,
        decisionReason: null,
      });

      const actCountBefore = electronBridgeActCount;
      const blocked = yield* runtime.act({
        sessionId: result.sessionId,
        action,
        approvalRef: approvalId,
      });

      assert.strictEqual(blocked.status, "requires-approval");
      assert.notStrictEqual(blocked.approvalRequestId, approvalId);
      assert.strictEqual(electronBridgeActCount, actCountBefore);

      const events = yield* repository.getSessionEvents({
        sessionId: "thread-runtime-electron-approval-incompatible-origin",
      });
      assert.ok(!events.some((event) => event.type === "BrowserActionRecorded"));
    }),
  );

  it.effect("blocks approved retry while a fresh observation is required", () =>
    Effect.gen(function* () {
      electronBridgeOwnerClientId = "desktop-client-runtime-test";
      const runtime = yield* BrowserRuntimeService;
      const control = yield* BrowserControlLeaseService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;

      const result = yield* runtime.openSession({
        url: "http://127.0.0.1:5173/",
        threadId: "thread-runtime-electron-approval-fresh-observation",
        preferredRuntimeKind: "electron-visible",
      });

      const action = { kind: "navigate" as const, url: "https://example.com/external" };
      const pending = yield* runtime.act({ sessionId: result.sessionId, action });
      assert.strictEqual(pending.status, "requires-approval");
      assert.ok(pending.approvalRequestId);

      yield* repository.updateBrowserApprovalStatus({
        approvalId: pending.approvalRequestId!,
        status: "approved",
        updatedAt: "2026-04-28T00:00:05.000Z",
      });

      const leaseResult = yield* control.acquire({
        browserSessionId: result.sessionId,
        requestedBy: "human",
        reason: "human-input",
      });
      yield* control.release({
        browserSessionId: result.sessionId,
        leaseId: leaseResult.lease.id,
      });

      const blocked = yield* runtime.act({
        sessionId: result.sessionId,
        action,
        approvalRef: pending.approvalRequestId,
      });

      assert.strictEqual(blocked.status, "blocked");
      assert.match(blocked.reason ?? "", /Fresh observation required/);

      const controlEvents = yield* repository.getSessionEvents({
        sessionId: result.sessionId,
      });
      assert.ok(
        controlEvents.some((event) => event.type === "BrowserControlFreshObservationRequired"),
      );

      const events = yield* repository.getSessionEvents({
        sessionId: "thread-runtime-electron-approval-fresh-observation",
      });
      assert.ok(!events.some((event) => event.type === "BrowserActionRecorded"));

      yield* control.observeFresh({
        browserSessionId: result.sessionId,
        observationRef: EvidenceArtifactId.makeUnsafe("fresh-after-approved-retry-block"),
      });
    }),
  );

  it.effect("does not execute rejected approval retries", () =>
    Effect.gen(function* () {
      electronBridgeOwnerClientId = "desktop-client-runtime-test";
      const runtime = yield* BrowserRuntimeService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;

      const result = yield* runtime.openSession({
        url: "http://127.0.0.1:5173/",
        threadId: "thread-runtime-electron-approval-rejected",
        preferredRuntimeKind: "electron-visible",
      });

      const action = { kind: "navigate" as const, url: "https://example.com/external" };
      const pending = yield* runtime.act({ sessionId: result.sessionId, action });
      assert.strictEqual(pending.status, "requires-approval");
      assert.ok(pending.approvalRequestId);

      yield* repository.updateBrowserApprovalStatus({
        approvalId: pending.approvalRequestId!,
        status: "rejected",
        updatedAt: "2026-04-28T00:00:05.000Z",
      });

      const blocked = yield* runtime.act({
        sessionId: result.sessionId,
        action,
        approvalRef: pending.approvalRequestId,
      });

      assert.strictEqual(blocked.status, "requires-approval");
      const events = yield* repository.getSessionEvents({
        sessionId: "thread-runtime-electron-approval-rejected",
      });
      assert.ok(!events.some((event) => event.type === "BrowserActionRecorded"));
    }),
  );

  it.effect("requires approval for consequential targeted electron-visible actions", () =>
    Effect.gen(function* () {
      const runtime = yield* BrowserRuntimeService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;

      const result = yield* runtime.openSession({
        url: "http://127.0.0.1:5173/",
        threadId: "thread-runtime-electron-targeted-approval",
        preferredRuntimeKind: "electron-visible",
      });

      const actResult = yield* runtime.act({
        sessionId: result.sessionId,
        action: { kind: "clickTarget", target: { kind: "text", text: "Delete" } },
      });

      assert.strictEqual(actResult.status, "requires-approval");
      assert.ok(actResult.approvalRequestId);

      const events = yield* repository.getSessionEvents({
        sessionId: "thread-runtime-electron-targeted-approval",
      });
      assert.ok(events.some((event) => event.type === "BrowserPolicyDecisionRecorded"));
      assert.ok(!events.some((event) => event.type === "BrowserActionRecorded"));
    }),
  );

  it.effect(
    "requires approval when a harmless requested target resolves to a destructive button",
    () =>
      Effect.gen(function* () {
        const runtime = yield* BrowserRuntimeService;
        const repository = yield* BrowserOrchestrationEvidenceRepository;

        const result = yield* runtime.openSession({
          url: "http://127.0.0.1:5173/",
          threadId: "thread-runtime-electron-resolved-target-approval",
          preferredRuntimeKind: "electron-visible",
        });

        const actResult = yield* runtime.act({
          sessionId: result.sessionId,
          action: { kind: "clickTarget", target: { kind: "test-id", testId: "primary-button" } },
        });

        assert.strictEqual(actResult.status, "requires-approval");
        assert.ok(actResult.approvalRequestId);
        const approval = yield* repository.getBrowserApprovalRequest({
          approvalId: actResult.approvalRequestId!,
        });
        assert.strictEqual(approval._tag, "Some");
        if (approval._tag === "Some") {
          const context = JSON.parse(approval.value.targetContextJson ?? "{}") as {
            resolvedTarget?: { name?: string };
          };
          assert.strictEqual(context.resolvedTarget?.name, "Delete project");
        }
      }),
  );

  it.effect("returns structured target failure without recording action success", () =>
    Effect.gen(function* () {
      const runtime = yield* BrowserRuntimeService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;

      const result = yield* runtime.openSession({
        url: "http://127.0.0.1:5173/",
        threadId: "thread-runtime-electron-target-not-found",
        preferredRuntimeKind: "electron-visible",
      });
      const beforeActCount = electronBridgeActCount;

      const actResult = yield* runtime.act({
        sessionId: result.sessionId,
        action: { kind: "clickTarget", target: { kind: "test-id", testId: "missing-button" } },
      });

      assert.strictEqual(actResult.status, "failed");
      assert.strictEqual(actResult.targetResolution?.status, "not-found");
      assert.ok(actResult.screenshotArtifactRef);
      assert.ok(actResult.evidenceRefs?.length);
      assert.strictEqual(electronBridgeActCount, beforeActCount);
      const events = yield* repository.getSessionEvents({
        sessionId: "thread-runtime-electron-target-not-found",
      });
      assert.ok(events.some((event) => event.type === "BrowserPolicyDecisionRecorded"));
      assert.ok(!events.some((event) => event.type === "BrowserActionRecorded"));
    }),
  );

  it.effect("returns structured ambiguous target failure without executing", () =>
    Effect.gen(function* () {
      const runtime = yield* BrowserRuntimeService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;

      const result = yield* runtime.openSession({
        url: "http://127.0.0.1:5173/",
        threadId: "thread-runtime-electron-target-ambiguous",
        preferredRuntimeKind: "electron-visible",
      });
      const beforeActCount = electronBridgeActCount;

      const actResult = yield* runtime.act({
        sessionId: result.sessionId,
        action: { kind: "clickTarget", target: { kind: "text", text: "Duplicate Save" } },
      });

      assert.strictEqual(actResult.status, "failed");
      assert.strictEqual(actResult.targetResolution?.status, "ambiguous");
      assert.strictEqual(actResult.targetResolution?.candidates?.length, 2);
      assert.ok(actResult.evidenceRefs?.length);
      assert.strictEqual(electronBridgeActCount, beforeActCount);
      const events = yield* repository.getSessionEvents({
        sessionId: "thread-runtime-electron-target-ambiguous",
      });
      assert.ok(events.some((event) => event.type === "BrowserPolicyDecisionRecorded"));
      assert.ok(!events.some((event) => event.type === "BrowserActionRecorded"));
    }),
  );

  it.effect("returns structured non-fillable target failure without executing", () =>
    Effect.gen(function* () {
      const runtime = yield* BrowserRuntimeService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;

      const result = yield* runtime.openSession({
        url: "http://127.0.0.1:5173/",
        threadId: "thread-runtime-electron-target-not-actionable",
        preferredRuntimeKind: "electron-visible",
      });
      const beforeActCount = electronBridgeActCount;

      const actResult = yield* runtime.act({
        sessionId: result.sessionId,
        action: {
          kind: "fillTarget",
          target: { kind: "test-id", testId: "plain-div" },
          value: "value",
          clearFirst: true,
        },
      });

      assert.strictEqual(actResult.status, "failed");
      assert.strictEqual(actResult.targetResolution?.status, "not-actionable");
      assert.match(actResult.reason ?? "", /not an input/i);
      assert.ok(actResult.evidenceRefs?.length);
      assert.strictEqual(electronBridgeActCount, beforeActCount);
      const events = yield* repository.getSessionEvents({
        sessionId: "thread-runtime-electron-target-not-actionable",
      });
      assert.ok(events.some((event) => event.type === "BrowserPolicyDecisionRecorded"));
      assert.ok(!events.some((event) => event.type === "BrowserActionRecorded"));
    }),
  );

  it.effect("blocks electron-visible actions while human control lease is active", () =>
    Effect.gen(function* () {
      const runtime = yield* BrowserRuntimeService;
      const control = yield* BrowserControlLeaseService;
      const repository = yield* BrowserOrchestrationEvidenceRepository;

      const result = yield* runtime.openSession({
        url: "http://127.0.0.1:5173/",
        threadId: "thread-runtime-electron-human-control",
        preferredRuntimeKind: "electron-visible",
      });

      yield* control.acquire({
        browserSessionId: result.sessionId,
        requestedBy: "human",
        reason: "user-takeover",
      });

      const actResult = yield* runtime.act({
        sessionId: result.sessionId,
        action: { kind: "scroll", direction: "down", amount: 100 },
      });

      assert.strictEqual(actResult.status, "blocked");
      assert.match(actResult.reason ?? "", /Human is currently controlling/);

      const events = yield* repository.getSessionEvents({
        sessionId: "thread-runtime-electron-human-control",
      });
      assert.ok(events.some((event) => event.type === "BrowserPolicyDecisionRecorded"));
      assert.ok(!events.some((event) => event.type === "BrowserActionRecorded"));
    }),
  );
});
