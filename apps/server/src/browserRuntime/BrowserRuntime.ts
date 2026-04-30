import type {
  BrowserAction,
  BrowserPolicyDecision,
  BrowserSnapshot,
  BrowserSessionId,
  PreviewTarget,
  PreviewViewport,
} from "@orchestrate/contracts";

export type BrowserRuntimeSession = {
  readonly browserSessionId: BrowserSessionId;
  readonly previewTarget: PreviewTarget;
  readonly runtimeKind: "electron-visible" | "playwright-headless" | "chrome-extension";
  readonly lastSnapshot?: BrowserSnapshot;
};

export type BrowserRuntimeOpenSessionInput = {
  readonly previewTarget: PreviewTarget;
  readonly viewport?: PreviewViewport;
  readonly cdpEndpointUrl?: string;
  readonly cdpTargetId?: string;
  readonly attachedBrowserSessionId?: BrowserSessionId;
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
}
