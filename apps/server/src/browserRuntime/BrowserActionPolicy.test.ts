import { describe, expect, it } from "vitest";

import { BrowserActionPolicy, classifyBrowserAction } from "./BrowserActionPolicy";
import { makePreviewTarget } from "./testFixtures";

describe("BrowserActionPolicy", () => {
  it("requires approval for external navigation outside the preview policy", () => {
    const decision = BrowserActionPolicy.validate(
      { kind: "navigate", url: "https://example.com" },
      makePreviewTarget(),
    );

    expect(decision.outcome).toBe("requires-approval");
    if (decision.outcome === "requires-approval") {
      expect(decision.approvalKind).toBe("external-navigation");
    }
  });

  it("denies unsafe evaluation outside isolated local preview mode", () => {
    const decision = BrowserActionPolicy.validate(
      { kind: "evaluate", expression: "document.cookie" },
      makePreviewTarget({ permissionTier: "approved-public" }),
    );

    expect(decision.outcome).toBe("deny");
  });

  it("allows local-preview evaluation and classifies it as consequential", () => {
    const action = { kind: "evaluate", expression: "document.body.innerText" } as const;
    const decision = BrowserActionPolicy.validate(action, makePreviewTarget());

    expect(decision.outcome).toBe("allow");
    expect(classifyBrowserAction(action)).toBe("consequential-interaction");
  });

  it("requires approval for consequential targeted clicks", () => {
    const action = {
      kind: "clickTarget",
      target: { kind: "role-name", role: "button", name: "Delete project" },
    } as const;
    const decision = BrowserActionPolicy.validate(action, makePreviewTarget());

    expect(classifyBrowserAction(action)).toBe("consequential-interaction");
    expect(decision.outcome).toBe("requires-approval");
  });

  it("allows ordinary targeted clicks", () => {
    const action = {
      kind: "clickTarget",
      target: { kind: "test-id", testId: "settings-tab" },
    } as const;
    const decision = BrowserActionPolicy.validate(action, makePreviewTarget());

    expect(classifyBrowserAction(action)).toBe("safe-interaction");
    expect(decision.outcome).toBe("allow");
  });

  it("requires approval when resolved target text is destructive", () => {
    const action = {
      kind: "clickTarget",
      target: { kind: "test-id", testId: "primary-button" },
    } as const;
    const decision = BrowserActionPolicy.validate(action, makePreviewTarget(), {
      resolvedTarget: {
        id: "primary-button",
        role: "button",
        name: "Delete project",
        visible: true,
      },
    });

    expect(decision.outcome).toBe("requires-approval");
  });

  it("requires approval for sensitive resolved fill targets", () => {
    const action = {
      kind: "fillTarget",
      target: { kind: "test-id", testId: "credential-field" },
      value: "secret",
      clearFirst: true,
    } as const;
    const decision = BrowserActionPolicy.validate(action, makePreviewTarget(), {
      resolvedTarget: {
        id: "credential-field",
        role: "textbox",
        name: "API key",
        inputType: "password",
        visible: true,
      },
    });

    expect(decision.outcome).toBe("requires-approval");
  });
});
