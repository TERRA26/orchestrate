import assert from "node:assert/strict";
import { it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import {
  BrowserActInput,
  BrowserActResult,
  BrowserAnnotation,
  BrowserAnnotationResolveTargetAtPointInput,
  BrowserAnnotationResolveTargetAtPointResult,
  BrowserInspectResult,
  BrowserResolveTargetSessionResult,
  BrowserApprovalRequest,
  BrowserObservation,
  BrowserObserveSessionInput,
  BrowserOpenSessionInput,
} from "./browser";

const decodeBrowserOpenSessionInput = Schema.decodeUnknownEffect(BrowserOpenSessionInput);
const decodeBrowserObserveSessionInput = Schema.decodeUnknownEffect(BrowserObserveSessionInput);
const decodeBrowserObservation = Schema.decodeUnknownEffect(BrowserObservation);
const decodeBrowserActInput = Schema.decodeUnknownEffect(BrowserActInput);
const decodeBrowserActResult = Schema.decodeUnknownEffect(BrowserActResult);
const decodeBrowserApprovalRequest = Schema.decodeUnknownEffect(BrowserApprovalRequest);
const decodeBrowserAnnotation = Schema.decodeUnknownEffect(BrowserAnnotation);
const decodeBrowserAnnotationResolveTargetAtPointInput = Schema.decodeUnknownEffect(
  BrowserAnnotationResolveTargetAtPointInput,
);
const decodeBrowserAnnotationResolveTargetAtPointResult = Schema.decodeUnknownEffect(
  BrowserAnnotationResolveTargetAtPointResult,
);
const decodeBrowserInspectResult = Schema.decodeUnknownEffect(BrowserInspectResult);
const decodeBrowserResolveTargetSessionResult = Schema.decodeUnknownEffect(
  BrowserResolveTargetSessionResult,
);

it.effect("decodes electron-visible open-session preference", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeBrowserOpenSessionInput({
      threadId: "thread-electron-visible",
      url: "http://127.0.0.1:5173/",
      preferredRuntimeKind: "electron-visible",
    });

    assert.strictEqual(parsed.preferredRuntimeKind, "electron-visible");
  }),
);

it.effect("decodes observe-session input separately from close-session input", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeBrowserObserveSessionInput({
      sessionId: "browser-session-electron-visible",
      include: ["screenshot", "visibleText", "pageMetrics"],
    });

    assert.deepStrictEqual(parsed.include, ["screenshot", "visibleText", "pageMetrics"]);
  }),
);

it.effect("decodes live shared browser observation truth", () =>
  Effect.gen(function* () {
    const parsed = yield* decodeBrowserObservation({
      sessionId: "browser-session-electron-visible",
      url: "http://127.0.0.1:5173/",
      title: "Fixture",
      readyState: "complete",
      textSummary: "Fixture page",
      screenshotDataUrl: "data:image/png;base64,AAAA",
      targets: [],
      runtimeKind: "electron-visible",
      surfaceMode: "live-shared-browser",
      isUserVisibleSurface: true,
      observedUrl: "http://127.0.0.1:5173/",
      visiblePanelUrl: "http://127.0.0.1:5173/",
      urlAgreement: "same",
      runtimeTruth: {
        runtimeKind: "electron-visible",
        surfaceMode: "live-shared-browser",
        isUserVisibleSurface: true,
        browserSessionId: "browser-session-electron-visible",
        observedUrl: "http://127.0.0.1:5173/",
        visiblePanelUrl: "http://127.0.0.1:5173/",
        urlAgreement: "same",
        screenshotDataUrl: "data:image/png;base64,AAAA",
      },
      observedAt: "2026-04-29T00:00:00.000Z",
    });

    assert.strictEqual(parsed.runtimeTruth?.runtimeKind, "electron-visible");
    assert.strictEqual(parsed.runtimeTruth?.surfaceMode, "live-shared-browser");
    assert.strictEqual(parsed.runtimeTruth?.isUserVisibleSurface, true);
    assert.strictEqual(parsed.runtimeTruth?.urlAgreement, "same");
  }),
);

it.effect("decodes electron-visible action inputs and structured action results", () =>
  Effect.gen(function* () {
    const click = yield* decodeBrowserActInput({
      sessionId: "electron-visible-thread-tab-main",
      action: { kind: "clickAt", x: 10, y: 20 },
      approvalRef: "browser-approval-1",
    });
    assert.strictEqual(click.action.kind, "clickAt");
    assert.strictEqual(click.approvalRef, "browser-approval-1");

    const result = yield* decodeBrowserActResult({
      actionId: "browser-action-1",
      status: "requires-approval",
      reason: "External navigation requires approval.",
      policyDecisionRef: "policy-decision-1",
      approvalRequestId: "browser-approval-1",
      screenshotArtifactRef: "browser-screenshot-1",
      evidenceRefs: ["policy-decision-1", "browser-screenshot-1"],
      observation: {
        sessionId: "electron-visible-thread-tab-main",
        url: "http://127.0.0.1:5173/",
        title: "Fixture",
        readyState: "complete",
        textSummary: "Fixture page",
        targets: [],
        observedAt: "2026-04-29T00:00:00.000Z",
      },
    });

    assert.strictEqual(result.status, "requires-approval");
    assert.strictEqual(result.policyDecisionRef, "policy-decision-1");
    assert.strictEqual(result.approvalRequestId, "browser-approval-1");
  }),
);

it.effect("decodes targeted element actions and inspect results", () =>
  Effect.gen(function* () {
    const click = yield* decodeBrowserActInput({
      sessionId: "electron-visible-thread-tab-main",
      action: { kind: "clickTarget", target: { kind: "test-id", testId: "save-button" } },
    });
    assert.strictEqual(click.action.kind, "clickTarget");
    assert.strictEqual(click.action.target.kind, "test-id");

    const fill = yield* decodeBrowserActInput({
      sessionId: "electron-visible-thread-tab-main",
      action: {
        kind: "fillTarget",
        target: { kind: "role-name", role: "textbox", name: "Email" },
        value: "user@example.test",
      },
    });
    assert.strictEqual(fill.action.kind, "fillTarget");
    assert.strictEqual(fill.action.clearFirst, true);

    const inspect = yield* decodeBrowserInspectResult({
      browserSessionId: "electron-visible-thread-tab-main",
      runtimeTruth: {
        runtimeKind: "electron-visible",
        surfaceMode: "live-shared-browser",
        isUserVisibleSurface: true,
        browserSessionId: "electron-visible-thread-tab-main",
        observedUrl: "http://127.0.0.1:5173/",
        visiblePanelUrl: "http://127.0.0.1:5173/",
        urlAgreement: "same",
      },
      url: "http://127.0.0.1:5173/",
      title: "Fixture",
      elements: [
        {
          id: "target-save",
          tagName: "button",
          role: "button",
          name: "Save",
          testId: "save-button",
          visible: true,
          enabled: true,
          box: { x: 10, y: 20, width: 80, height: 32, coordinateSpace: "css-pixels" },
        },
      ],
      evidenceRefs: ["browser-screenshot-1"],
    });

    assert.strictEqual(inspect.elements[0]?.box?.coordinateSpace, "css-pixels");

    const result = yield* decodeBrowserActResult({
      status: "ok",
      observation: {
        sessionId: "electron-visible-thread-tab-main",
        url: "http://127.0.0.1:5173/",
        title: "Fixture",
        readyState: "complete",
        textSummary: "Fixture page",
        targets: [],
        observedAt: "2026-04-29T00:00:00.000Z",
      },
      resolvedTarget: inspect.elements[0],
      targetResolution: {
        requested: { kind: "test-id", testId: "save-button" },
        status: "resolved",
        candidates: [inspect.elements[0]],
      },
    });

    assert.strictEqual(result.targetResolution?.status, "resolved");
  }),
);

it.effect("decodes browser approval requests", () =>
  Effect.gen(function* () {
    const approval = yield* decodeBrowserApprovalRequest({
      id: "browser-approval-1",
      browserSessionId: "electron-visible-thread-tab-main",
      action: { kind: "navigate", url: "https://example.com/" },
      resolvedTarget: {
        id: "target-delete",
        tagName: "button",
        role: "button",
        name: "Delete project",
        visible: true,
      },
      targetResolution: {
        requested: { kind: "test-id", testId: "primary-button" },
        status: "resolved",
      },
      actionHash: "action-hash-1",
      reason: "External navigation requires approval.",
      risk: "external-navigation",
      observedUrl: "http://127.0.0.1:5173/",
      origin: "http://127.0.0.1:5173",
      status: "approved",
      evidenceRefs: ["policy-decision-1"],
      createdAt: "2026-04-29T00:00:00.000Z",
      updatedAt: "2026-04-29T00:00:01.000Z",
    });

    assert.strictEqual(approval.status, "approved");
    assert.strictEqual(approval.risk, "external-navigation");
    assert.strictEqual(approval.actionHash, "action-hash-1");
    assert.strictEqual(approval.resolvedTarget?.name, "Delete project");
  }),
);

it.effect("decodes structured target resolution failures", () =>
  Effect.gen(function* () {
    const result = yield* decodeBrowserResolveTargetSessionResult({
      browserSessionId: "electron-visible-thread-tab-main",
      targetResolution: {
        requested: { kind: "test-id", testId: "missing-button" },
        status: "not-found",
        reason: "Target element was not found.",
        candidates: [],
      },
    });

    assert.strictEqual(result.targetResolution.status, "not-found");
  }),
);

it.effect("decodes CSS-pixel browser annotation geometry", () =>
  Effect.gen(function* () {
    const annotation = yield* decodeBrowserAnnotation({
      id: "browser-annotation-1",
      threadId: "thread-annotation",
      sessionId: "browser-session-1",
      browserSessionId: "browser-session-1",
      url: "http://127.0.0.1:5173/settings",
      comment: "Move this button down slightly",
      kind: "point",
      x: 0.5,
      y: 0.25,
      status: "open",
      target: {
        kind: "element",
        element: {
          id: "target-save",
          role: "button",
          name: "Save",
          visible: true,
          box: { x: 100, y: 40, width: 80, height: 32, coordinateSpace: "css-pixels" },
        },
        geometry: {
          coordinateSpace: "css-pixels",
          point: { x: 140, y: 56 },
          viewport: { width: 1280, height: 720, deviceScaleFactor: 2 },
          scroll: { x: 0, y: 120 },
          screenshotPixelSize: { width: 2560, height: 1440 },
        },
      },
      artifactRefs: ["browser-comment-1", "screenshot-crop-1"],
      cropArtifactRef: "screenshot-crop-1",
      createdAt: "2026-04-29T00:00:00.000Z",
    });

    assert.strictEqual(annotation.target?.geometry.coordinateSpace, "css-pixels");
    assert.strictEqual(annotation.target?.geometry.viewport.deviceScaleFactor, 2);
    assert.strictEqual(annotation.target?.kind, "element");
  }),
);

it.effect("decodes server-resolved annotation targets with live evidence summaries", () =>
  Effect.gen(function* () {
    const input = yield* decodeBrowserAnnotationResolveTargetAtPointInput({
      browserSessionId: "electron-visible-thread-tab",
      point: { x: 140, y: 56 },
      geometryContext: {
        viewport: { width: 1280, height: 720, deviceScaleFactor: 2 },
        scroll: { x: 0, y: 120 },
        screenshotPixelSize: { width: 2560, height: 1440 },
      },
      includeDomSnippet: true,
      includeComputedStyle: true,
    });
    const result = yield* decodeBrowserAnnotationResolveTargetAtPointResult({
      browserSessionId: input.browserSessionId,
      runtimeTruth: {
        runtimeKind: "electron-visible",
        surfaceMode: "live-shared-browser",
        isUserVisibleSurface: true,
        browserSessionId: input.browserSessionId,
      },
      url: "http://127.0.0.1:5173/settings",
      targetResolution: {
        requested: { kind: "point", x: 140, y: 56 },
        status: "resolved",
      },
      element: {
        id: "target-save",
        role: "button",
        name: "Save changes",
        visible: true,
        box: { x: 100, y: 40, width: 96, height: 32, coordinateSpace: "css-pixels" },
      },
      geometry: {
        coordinateSpace: "css-pixels",
        point: { x: 140, y: 56 },
        rect: { x: 100, y: 40, width: 96, height: 32 },
        viewport: { width: 1280, height: 720, deviceScaleFactor: 2 },
        scroll: { x: 0, y: 120 },
      },
      evidenceRefs: ["browser-observation-electron"],
      domSnippet: {
        tagName: "button",
        role: "button",
        name: "Save changes",
        selector: '[data-testid="save"]',
        outerHTMLPreview: '<button data-testid="save">Save changes</button>',
      },
      computedStyle: {
        display: "flex",
        position: "relative",
        width: "96px",
        height: "32px",
      },
    });

    assert.strictEqual(result.targetResolution.status, "resolved");
    assert.strictEqual(result.geometry.rect?.width, 96);
    assert.strictEqual(result.domSnippet?.outerHTMLPreview.includes("Save"), true);
    assert.strictEqual(result.computedStyle?.display, "flex");
  }),
);
