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
});
