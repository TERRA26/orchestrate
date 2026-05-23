import type { BrowserActInput, BrowserElementSummary } from "@orchestrate/contracts";

export interface TargetActionWebContents {
  executeJavaScript(script: string, userGesture?: boolean): Promise<unknown>;
  sendInputEvent(event: unknown): void;
  insertText(text: string): void;
}

export function centerPointForTarget(target: BrowserElementSummary): { x: number; y: number } {
  return {
    x: Math.floor((target.box?.x ?? 0) + (target.box?.width ?? 0) / 2),
    y: Math.floor((target.box?.y ?? 0) + (target.box?.height ?? 0) / 2),
  };
}

export function clickResolvedTarget(
  webContents: TargetActionWebContents,
  target: BrowserElementSummary,
): void {
  const { x, y } = centerPointForTarget(target);
  webContents.sendInputEvent({ type: "mouseDown", button: "left", x, y });
  webContents.sendInputEvent({ type: "mouseUp", button: "left", x, y });
}

export async function fillResolvedTarget(
  webContents: TargetActionWebContents,
  input: {
    readonly target: BrowserElementSummary;
    readonly value: string;
    readonly clearFirst: boolean;
    readonly focusScript: string;
  },
): Promise<void> {
  const focused = await webContents.executeJavaScript(input.focusScript, true);
  if (focused !== true) throw new Error("Could not focus target element.");
  webContents.insertText(input.value);
}

export function fillActionSemantics(
  action: Extract<BrowserActInput["action"], { kind: "fillTarget" }>,
): string {
  return action.clearFirst
    ? "focus target, select existing input contents, then insert text"
    : "focus target, then insert text";
}
