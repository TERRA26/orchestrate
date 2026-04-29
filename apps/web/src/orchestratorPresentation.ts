export type BrowserSurfaceMode =
  | "live-shared-browser"
  | "headless-validation-mirror"
  | "static-screenshot-evidence"
  | (string & {});

export type BrowserPresentationStatusInput = {
  readonly label?: string;
  readonly toolTitle?: string | undefined;
  readonly detail?: string | undefined;
  readonly hasScreenshot: boolean;
};

export function browserSurfaceModeLabel(surfaceMode: BrowserSurfaceMode): string {
  if (surfaceMode === "live-shared-browser") return "Live shared browser";
  if (surfaceMode === "headless-validation-mirror") return "Headless validation mirror";
  if (surfaceMode === "static-screenshot-evidence") return "Static screenshot evidence";
  if (surfaceMode === "unknown") return "Browser runtime unknown";
  return surfaceMode;
}

export function browserRuntimeEvidenceLabel(input: {
  readonly surfaceMode: BrowserSurfaceMode;
  readonly isDurable: boolean;
}): string {
  if (input.surfaceMode === "live-shared-browser" && !input.isDurable) {
    return "Live local browser · not recorded";
  }
  if (input.surfaceMode === "live-shared-browser") {
    return "Live shared browser · evidence captured";
  }
  if (input.surfaceMode === "unknown") {
    return "Browser runtime unknown · evidence incomplete";
  }
  return browserSurfaceModeLabel(input.surfaceMode);
}

export function browserObservationTitle(input: { readonly isChecking: boolean }): string {
  return input.isChecking ? "Checking browser" : "Browser evidence";
}

export function browserActionStatusLabel(input: BrowserPresentationStatusInput): string {
  const raw = `${input.label ?? ""} ${input.toolTitle ?? ""} ${input.detail ?? ""}`;
  if (/approval required|requires-approval/i.test(raw)) return "Approval required";
  if (/blocked/i.test(raw)) return "Action blocked";
  if (/navigate|opened browser session/i.test(raw)) return "Navigated";
  if (/click/i.test(raw)) return "Clicked";
  if (/type|fill/i.test(raw)) return "Typed";
  if (/scroll/i.test(raw)) return "Scrolled";
  if (/wait/i.test(raw)) return "Waiting for page";
  if (/press|key/i.test(raw)) return "Pressed key";
  return input.hasScreenshot ? "Screenshot captured" : "Observation captured";
}
