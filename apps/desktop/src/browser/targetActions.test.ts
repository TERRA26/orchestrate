import { describe, expect, it, vi } from "vitest";

import {
  centerPointForTarget,
  clickResolvedTarget,
  fillResolvedTarget,
  fillActionSemantics,
  type TargetActionWebContents,
} from "./targetActions";

function fakeWebContents(): TargetActionWebContents & {
  readonly events: unknown[];
  readonly scripts: unknown[];
  readonly insertedText: string[];
} {
  const events: unknown[] = [];
  const scripts: unknown[] = [];
  const insertedText: string[] = [];
  return {
    events,
    scripts,
    insertedText,
    executeJavaScript: vi.fn(async (script: string) => {
      scripts.push(script);
      return true;
    }),
    sendInputEvent: vi.fn((event: unknown) => {
      events.push(event);
    }),
    insertText: vi.fn((text: string) => {
      insertedText.push(text);
    }),
  };
}

const target = {
  id: "target-save",
  role: "button",
  name: "Save",
  visible: true,
  box: { x: 10, y: 20, width: 81, height: 33, coordinateSpace: "css-pixels" as const },
};

describe("targetActions", () => {
  it("computes click center points in CSS pixels", () => {
    expect(centerPointForTarget(target)).toEqual({ x: 50, y: 36 });
  });

  it("clickTarget sends mouseDown and mouseUp at the resolved target center", () => {
    const webContents = fakeWebContents();

    clickResolvedTarget(webContents, target);

    expect(webContents.events).toEqual([
      { type: "mouseDown", button: "left", x: 50, y: 36 },
      { type: "mouseUp", button: "left", x: 50, y: 36 },
    ]);
  });

  it("fillTarget focuses/selects before inserting text", async () => {
    const webContents = fakeWebContents();

    await fillResolvedTarget(webContents, {
      target,
      value: "updated value",
      clearFirst: true,
      focusScript: "focus-script",
    });

    expect(webContents.scripts).toEqual(["focus-script"]);
    expect(webContents.insertedText).toEqual(["updated value"]);
  });

  it("documents clear-first fill semantics", () => {
    expect(
      fillActionSemantics({
        kind: "fillTarget",
        target: { kind: "test-id", testId: "email" },
        value: "a@example.com",
        clearFirst: true,
      }),
    ).toContain("select existing input contents");
  });
});
