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

export type OrchestratorToolPhase =
  | "Planning"
  | "Reading files"
  | "Editing"
  | "Running command"
  | "Reviewing evidence"
  | "Waiting"
  | "Started worker"
  | "Done"
  | "Blocked";

export type ToolPhaseEvent = {
  readonly toolName?: string | null | undefined;
  readonly itemType?: string | null | undefined;
  readonly requestKind?: string | null | undefined;
  readonly label?: string | null | undefined;
  readonly tone?: string | null | undefined;
  readonly command?: string | null | undefined;
  readonly changedFiles?: ReadonlyArray<string> | null | undefined;
};

function normalizeToolName(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/^mcp__orchestrate__/, "")
    .replace(/^functions\./, "")
    .trim()
    .toLowerCase();
}

export function phaseForToolEvent(event: ToolPhaseEvent): OrchestratorToolPhase | null {
  if (event.tone === "error") return "Blocked";

  const toolName = normalizeToolName(event.toolName);
  const itemType = normalizeToolName(event.itemType);
  const requestKind = normalizeToolName(event.requestKind);
  const label = normalizeToolName(event.label);

  if (event.changedFiles && event.changedFiles.length > 0) return "Editing";
  if (event.command || requestKind === "command" || itemType === "command_execution") {
    return "Running command";
  }

  if (
    toolName === "read" ||
    toolName === "read_file" ||
    requestKind === "file-read" ||
    label === "file read"
  ) {
    return "Reading files";
  }

  if (
    toolName === "edit" ||
    toolName === "write" ||
    toolName === "write_file" ||
    requestKind === "file-change" ||
    itemType === "file_change" ||
    label === "file change"
  ) {
    return "Editing";
  }

  if (toolName === "bash" || toolName === "terminal" || toolName === "shell") {
    return "Running command";
  }

  if (toolName === "plan_update" || toolName === "todowrite" || itemType === "plan_update") {
    return "Planning";
  }

  if (
    toolName === "wait_agent" ||
    toolName === "orchestrate_wait_agent" ||
    toolName === "orchestrate_wait_all" ||
    label.includes("sleep")
  ) {
    return "Waiting";
  }

  if (toolName === "orchestrate_spawn_agent" || toolName === "spawn_agent") {
    return "Started worker";
  }

  if (
    toolName === "orchestrate_accept_work" ||
    toolName === "orchestrate_reject_work" ||
    toolName === "orchestrate_review_agent_work" ||
    toolName === "reviewer.decision.create"
  ) {
    return "Reviewing evidence";
  }

  if (label === "done" || label === "completed") return "Done";

  return null;
}

export function browserSurfaceModeLabel(surfaceMode: BrowserSurfaceMode): string {
  if (surfaceMode === "live-shared-browser") return "Live shared browser";
  if (surfaceMode === "headless-validation-mirror") return "Headless validation mirror";
  if (surfaceMode === "static-screenshot-evidence") return "Static screenshot evidence";
  if (surfaceMode === "unknown") return "Browser runtime unknown";
  return surfaceMode;
}

export function browserRuntimeKindLabel(kind: string): string {
  if (kind === "electron-visible") return "Electron desktop";
  if (kind === "playwright-headless") return "Playwright headless";
  if (kind === "chrome-extension") return "Chrome extension";
  if (kind === "unknown") return "Runtime unknown";
  return kind;
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
