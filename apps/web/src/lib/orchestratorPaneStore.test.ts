import { describe, expect, it } from "vitest";

import * as orchestratorPaneStore from "./orchestratorPaneStore";

const { useOrchestratorPaneStore } = orchestratorPaneStore;

function resetPaneStore() {
  useOrchestratorPaneStore.getState().clearAll();
}

describe("orchestratorPaneStore", () => {
  it("preserves the focused browser pane when the same orchestrator thread is re-selected", () => {
    resetPaneStore();

    useOrchestratorPaneStore.getState().setOrchestratorThread("thread-a");
    useOrchestratorPaneStore.getState().focusBrowser("thread-a");
    useOrchestratorPaneStore.getState().setOrchestratorThread("thread-a");

    expect(useOrchestratorPaneStore.getState().focusedBrowserThreadId).toBe("thread-a");
    expect(useOrchestratorPaneStore.getState().explicitBrowserThreadId).toBe("thread-a");

    useOrchestratorPaneStore.getState().setOrchestratorThread("thread-b");

    expect(useOrchestratorPaneStore.getState().focusedBrowserThreadId).toBe(null);
    expect(useOrchestratorPaneStore.getState().explicitBrowserThreadId).toBe(null);
  });

  it("closes the browser pane without changing the active orchestrator thread", () => {
    resetPaneStore();

    useOrchestratorPaneStore.getState().setOrchestratorThread("thread-a");
    useOrchestratorPaneStore.getState().focusBrowser("thread-a");
    useOrchestratorPaneStore.getState().closeBrowser();

    expect(useOrchestratorPaneStore.getState().orchestratorThreadId).toBe("thread-a");
    expect(useOrchestratorPaneStore.getState().focusedBrowserThreadId).toBe(null);
    expect(useOrchestratorPaneStore.getState().explicitBrowserThreadId).toBe(null);
  });
});

describe("shouldAutoFocusOrchestratorBrowserPane", () => {
  it("does not open the browser pane just because an orchestrator route is selected", () => {
    const shouldAutoFocusOrchestratorBrowserPane = (
      orchestratorPaneStore as typeof orchestratorPaneStore & {
        shouldAutoFocusOrchestratorBrowserPane?: (input: {
          showOrchestratorSurface: boolean;
          routeThreadId: string;
          orchestratorThreadId: string | null;
          focusedBrowserThreadId: string | null;
        }) => boolean;
      }
    ).shouldAutoFocusOrchestratorBrowserPane;

    expect(
      shouldAutoFocusOrchestratorBrowserPane?.({
        showOrchestratorSurface: true,
        routeThreadId: "thread-a",
        orchestratorThreadId: "thread-a",
        focusedBrowserThreadId: null,
      }),
    ).toBe(false);
    expect(
      shouldAutoFocusOrchestratorBrowserPane?.({
        showOrchestratorSurface: true,
        routeThreadId: "thread-a",
        orchestratorThreadId: "thread-a",
        focusedBrowserThreadId: "thread-a",
      }),
    ).toBe(false);
    expect(
      shouldAutoFocusOrchestratorBrowserPane?.({
        showOrchestratorSurface: true,
        routeThreadId: "thread-a",
        orchestratorThreadId: "thread-a",
        focusedBrowserThreadId: null,
      }),
    ).toBe(false);
    expect(
      shouldAutoFocusOrchestratorBrowserPane?.({
        showOrchestratorSurface: false,
        routeThreadId: "thread-a",
        orchestratorThreadId: "thread-a",
        focusedBrowserThreadId: null,
      }),
    ).toBe(false);
  });
});

describe("shouldRenderOrchestratorBrowserPane", () => {
  it("renders only from explicit route panel state, not stale in-memory focus", () => {
    const shouldRenderOrchestratorBrowserPane = (
      orchestratorPaneStore as typeof orchestratorPaneStore & {
        shouldRenderOrchestratorBrowserPane?: (input: {
          isOrchestratorThread: boolean;
          routePanel: string | null | undefined;
          focusedBrowserThreadId: string | null;
          orchestratorThreadId: string | null;
        }) => boolean;
      }
    ).shouldRenderOrchestratorBrowserPane;

    expect(
      shouldRenderOrchestratorBrowserPane?.({
        isOrchestratorThread: true,
        routePanel: undefined,
        focusedBrowserThreadId: "thread-a",
        orchestratorThreadId: "thread-a",
      }),
    ).toBe(false);
    expect(
      shouldRenderOrchestratorBrowserPane?.({
        isOrchestratorThread: true,
        routePanel: "browser",
        focusedBrowserThreadId: null,
        orchestratorThreadId: "thread-a",
      }),
    ).toBe(true);
    expect(
      shouldRenderOrchestratorBrowserPane?.({
        isOrchestratorThread: false,
        routePanel: "browser",
        focusedBrowserThreadId: "thread-a",
        orchestratorThreadId: "thread-a",
      }),
    ).toBe(false);
  });
});
