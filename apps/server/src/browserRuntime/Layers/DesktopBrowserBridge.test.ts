import { assert, it } from "@effect/vitest";
import { Effect } from "effect";

import { DesktopBrowserBridge } from "../Services/DesktopBrowserBridge.ts";
import {
  clearDesktopBrowserBridgePendingRequests,
  DesktopBrowserBridgeBrokerLive,
  handleDesktopBrowserBridgeResponse,
  registerDesktopBrowserBridgeClient,
  setDesktopBrowserBridgePublisher,
  unregisterDesktopBrowserBridgeClient,
} from "./DesktopBrowserBridge.ts";

const layer = it.layer(DesktopBrowserBridgeBrokerLive);

layer("DesktopBrowserBridgeBrokerLive", (it) => {
  it.effect("resolves openSession through a brokered desktop response", () =>
    Effect.gen(function* () {
      const bridge = yield* DesktopBrowserBridge;
      const requests: string[] = [];
      registerDesktopBrowserBridgeClient("desktop-client-a");
      setDesktopBrowserBridgePublisher((clientId, _channel, data) =>
        Effect.sync(() => {
          assert.strictEqual(clientId, "desktop-client-a");
          requests.push(data.kind);
          handleDesktopBrowserBridgeResponse({
            requestId: data.requestId,
            status: "ok",
            result: {
              sessionId: "electron-visible-thread-bridge-tab-main",
              observation: {
                sessionId: "electron-visible-thread-bridge-tab-main",
                url: "http://127.0.0.1:5173/",
                title: "Bridge fixture",
                readyState: "complete",
                textSummary: "Bridge fixture page",
                screenshotDataUrl: "data:image/png;base64,bridge",
                targets: [],
                consoleErrors: [],
                networkErrors: [],
                runtimeKind: "electron-visible",
                surfaceMode: "live-shared-browser",
                isUserVisibleSurface: true,
                observedUrl: "http://127.0.0.1:5173/",
                visiblePanelUrl: "http://127.0.0.1:5173/",
                urlAgreement: "same",
                observedAt: "2026-04-28T00:00:00.000Z",
              },
            },
          });
          return true;
        }),
      );

      const observation = yield* bridge.openSession({
        url: "http://127.0.0.1:5173/",
        threadId: "thread-bridge",
        preferredRuntimeKind: "electron-visible",
      });

      assert.deepStrictEqual(requests, ["openSession"]);
      assert.strictEqual(observation.sessionId, "electron-visible-thread-bridge-tab-main");
      assert.strictEqual(observation.runtimeKind, "electron-visible");
      unregisterDesktopBrowserBridgeClient("desktop-client-a");
      setDesktopBrowserBridgePublisher(null);
    }),
  );

  it.effect("fails closed when no desktop bridge publisher is connected", () =>
    Effect.gen(function* () {
      setDesktopBrowserBridgePublisher(null);
      clearDesktopBrowserBridgePendingRequests("test reset");
      const bridge = yield* DesktopBrowserBridge;

      const exit = yield* Effect.exit(
        bridge.observeSession({
          sessionId: "electron-visible-thread-bridge-tab-main",
        }),
      );

      assert.strictEqual(exit._tag, "Failure");
      assert.match(String(exit.cause), /refusing headless fallback/);
    }),
  );

  it.effect("resolves getCdpEndpoint through the connected desktop client", () =>
    Effect.gen(function* () {
      const bridge = yield* DesktopBrowserBridge;
      const requests: string[] = [];
      registerDesktopBrowserBridgeClient("desktop-client-cdp");
      setDesktopBrowserBridgePublisher((clientId, _channel, data) =>
        Effect.sync(() => {
          requests.push(`${data.kind}:${clientId}`);
          handleDesktopBrowserBridgeResponse({
            requestId: data.requestId,
            status: "ok",
            result: {
              endpointUrl: "http://127.0.0.1:9333",
              port: 9333,
              sessions: [
                {
                  sessionId: "electron-visible-thread-bridge-tab-main",
                  webContentsId: 42,
                  targetId: "target-visible-42",
                  url: "http://127.0.0.1:5173/",
                  title: "Bridge fixture",
                },
              ],
            },
          });
          return true;
        }),
      );

      const endpoint = yield* bridge.getCdpEndpoint();

      assert.deepStrictEqual(requests, ["getCdpEndpoint:desktop-client-cdp"]);
      assert.strictEqual(endpoint.endpointUrl, "http://127.0.0.1:9333");
      assert.strictEqual(endpoint.sessions[0]?.targetId, "target-visible-42");
      unregisterDesktopBrowserBridgeClient("desktop-client-cdp");
      setDesktopBrowserBridgePublisher(null);
    }),
  );

  it.effect("routes follow-up session requests to the owning desktop client", () =>
    Effect.gen(function* () {
      const bridge = yield* DesktopBrowserBridge;
      const routedClients: string[] = [];
      registerDesktopBrowserBridgeClient("desktop-client-a");
      registerDesktopBrowserBridgeClient("desktop-client-b");
      setDesktopBrowserBridgePublisher((clientId, _channel, data) =>
        Effect.sync(() => {
          routedClients.push(`${data.kind}:${clientId}`);
          handleDesktopBrowserBridgeResponse({
            requestId: data.requestId,
            status: "ok",
            result:
              data.kind === "openSession"
                ? {
                    sessionId: "electron-visible-owned-session",
                    observation: {
                      sessionId: "electron-visible-owned-session",
                      url: "http://127.0.0.1:5173/",
                      title: "Owned fixture",
                      readyState: "complete",
                      textSummary: "Owned fixture page",
                      screenshotDataUrl: "data:image/png;base64,owned",
                      targets: [],
                      consoleErrors: [],
                      networkErrors: [],
                      runtimeKind: "electron-visible",
                      surfaceMode: "live-shared-browser",
                      isUserVisibleSurface: true,
                      observedUrl: "http://127.0.0.1:5173/",
                      visiblePanelUrl: "http://127.0.0.1:5173/",
                      urlAgreement: "same",
                      observedAt: "2026-04-28T00:00:00.000Z",
                    },
                  }
                : {
                    sessionId: "electron-visible-owned-session",
                    url: "http://127.0.0.1:5173/",
                    title: "Owned fixture",
                    readyState: "complete",
                    textSummary: "Owned fixture page",
                    screenshotDataUrl: "data:image/png;base64,owned",
                    targets: [],
                    consoleErrors: [],
                    networkErrors: [],
                    runtimeKind: "electron-visible",
                    surfaceMode: "live-shared-browser",
                    isUserVisibleSurface: true,
                    observedUrl: "http://127.0.0.1:5173/",
                    visiblePanelUrl: "http://127.0.0.1:5173/",
                    urlAgreement: "same",
                    observedAt: "2026-04-28T00:00:00.000Z",
                  },
          });
          return true;
        }),
      );

      const opened = yield* bridge.openSession({
        url: "http://127.0.0.1:5173/",
        threadId: "thread-bridge-owned",
        preferredRuntimeKind: "electron-visible",
      });
      const observed = yield* bridge.observeSession({ sessionId: opened.sessionId });

      assert.strictEqual(observed.sessionId, opened.sessionId);
      assert.deepStrictEqual(routedClients, [
        "openSession:desktop-client-a",
        "observeSession:desktop-client-a",
      ]);
      unregisterDesktopBrowserBridgeClient("desktop-client-a");
      unregisterDesktopBrowserBridgeClient("desktop-client-b");
      setDesktopBrowserBridgePublisher(null);
    }),
  );

  it.effect("routes inspectSession through the owning desktop client", () =>
    Effect.gen(function* () {
      const bridge = yield* DesktopBrowserBridge;
      const requests: string[] = [];
      registerDesktopBrowserBridgeClient("desktop-client-inspect");
      setDesktopBrowserBridgePublisher((clientId, _channel, data) =>
        Effect.sync(() => {
          requests.push(`${data.kind}:${clientId}`);
          handleDesktopBrowserBridgeResponse({
            requestId: data.requestId,
            status: "ok",
            result: {
              browserSessionId: "electron-visible-inspect-session",
              runtimeTruth: {
                runtimeKind: "electron-visible",
                surfaceMode: "live-shared-browser",
                isUserVisibleSurface: true,
                browserSessionId: "electron-visible-inspect-session",
                observedUrl: "http://127.0.0.1:5173/",
                visiblePanelUrl: "http://127.0.0.1:5173/",
                urlAgreement: "same",
              },
              url: "http://127.0.0.1:5173/",
              title: "Inspect fixture",
              elements: [
                {
                  id: "target-save",
                  tagName: "button",
                  role: "button",
                  name: "Save",
                  visible: true,
                  enabled: true,
                  box: { x: 1, y: 2, width: 30, height: 20, coordinateSpace: "css-pixels" },
                },
              ],
              evidenceRefs: [],
            },
          });
          return true;
        }),
      );

      const inspect = yield* bridge.inspectSession({
        sessionId: "electron-visible-inspect-session",
      });

      assert.deepStrictEqual(requests, ["inspectSession:desktop-client-inspect"]);
      assert.strictEqual(inspect.elements[0]?.box?.coordinateSpace, "css-pixels");
      unregisterDesktopBrowserBridgeClient("desktop-client-inspect");
      setDesktopBrowserBridgePublisher(null);
    }),
  );

  it.effect("marks owned sessions unavailable when the desktop client disconnects", () =>
    Effect.gen(function* () {
      const bridge = yield* DesktopBrowserBridge;
      registerDesktopBrowserBridgeClient("desktop-client-a");
      setDesktopBrowserBridgePublisher((clientId, _channel, data) =>
        Effect.sync(() => {
          assert.strictEqual(clientId, "desktop-client-a");
          handleDesktopBrowserBridgeResponse({
            requestId: data.requestId,
            status: "ok",
            result: {
              sessionId: "electron-visible-disconnected-session",
              observation: {
                sessionId: "electron-visible-disconnected-session",
                url: "http://127.0.0.1:5173/",
                title: "Disconnected fixture",
                readyState: "complete",
                textSummary: "Disconnected fixture page",
                screenshotDataUrl: "data:image/png;base64,disconnected",
                targets: [],
                consoleErrors: [],
                networkErrors: [],
                runtimeKind: "electron-visible",
                surfaceMode: "live-shared-browser",
                isUserVisibleSurface: true,
                observedUrl: "http://127.0.0.1:5173/",
                visiblePanelUrl: "http://127.0.0.1:5173/",
                urlAgreement: "same",
                observedAt: "2026-04-28T00:00:00.000Z",
              },
            },
          });
          return true;
        }),
      );

      const opened = yield* bridge.openSession({
        url: "http://127.0.0.1:5173/",
        threadId: "thread-bridge-disconnected",
        preferredRuntimeKind: "electron-visible",
      });

      unregisterDesktopBrowserBridgeClient("desktop-client-a");
      const exit = yield* Effect.exit(bridge.observeSession({ sessionId: opened.sessionId }));

      assert.strictEqual(exit._tag, "Failure");
      assert.match(String(exit.cause), /no connected desktop-capable client/);
      setDesktopBrowserBridgePublisher(null);
    }),
  );
});
