import type {
  BrowserAction,
  BrowserPolicyDecision,
  BrowserSnapshot,
  BrowserSessionId,
  PreviewTarget,
  PreviewViewport,
  ThreadId,
} from "@orchestrate/contracts";

export type BrowserRuntimeSession = {
  readonly browserSessionId: BrowserSessionId;
  readonly previewTarget: PreviewTarget;
  readonly runtimeKind: "electron-visible" | "playwright-headless" | "chrome-extension";
  readonly lastSnapshot?: BrowserSnapshot;
  /**
   * Owning thread, if known. Used by ORC-158 thread-scoped lifecycle
   * hooks so a terminated thread no longer leaks browser sessions.
   */
  readonly ownerThreadId?: ThreadId;
};

export type BrowserRuntimeOpenSessionInput = {
  readonly previewTarget: PreviewTarget;
  readonly viewport?: PreviewViewport;
  readonly cdpEndpointUrl?: string;
  readonly cdpTargetId?: string;
  readonly attachedBrowserSessionId?: BrowserSessionId;
  /**
   * ORC-158: tag the session with its owning thread so that
   * `closeSessionsForThread(threadId)` can drain it on
   * thread.terminated / run.completed events.
   */
  readonly ownerThreadId?: ThreadId;
};

export type BrowserRuntimeActInput = {
  readonly browserSessionId: BrowserSessionId;
  readonly action: BrowserAction;
};

export type BrowserRuntimeObserveInput = {
  readonly browserSessionId: BrowserSessionId;
};

export type BrowserRuntimeActResult =
  | { readonly ok: true; readonly snapshot: BrowserSnapshot }
  | {
      readonly ok: false;
      readonly policyDecision: BrowserPolicyDecision;
    };

export interface BrowserRuntime {
  readonly openSession: (input: BrowserRuntimeOpenSessionInput) => Promise<BrowserRuntimeSession>;
  readonly observe: (input: BrowserRuntimeObserveInput) => Promise<BrowserSnapshot>;
  readonly act: (input: BrowserRuntimeActInput) => Promise<BrowserRuntimeActResult>;
  readonly captureSnapshot: (input: BrowserRuntimeObserveInput) => Promise<BrowserSnapshot>;
  readonly closeSession: (input: BrowserRuntimeObserveInput) => Promise<void>;
  /**
   * ORC-158: close every session owned by `threadId` (best-effort).
   * Called on thread.terminated / run.completed events to prevent
   * leaked browser instances when an orchestrator process dies
   * mid-validation.
   */
  readonly closeSessionsForThread?: (threadId: ThreadId) => Promise<{
    readonly closed: number;
    readonly errors: ReadonlyArray<{ readonly browserSessionId: BrowserSessionId; readonly reason: string }>;
  }>;
  /**
   * ORC-158: close every active session (best-effort). Called from
   * a process-level shutdown hook to avoid orphaned browsers.
   */
  readonly closeAll?: () => Promise<{
    readonly closed: number;
    readonly errors: ReadonlyArray<{ readonly browserSessionId: BrowserSessionId; readonly reason: string }>;
  }>;
}
