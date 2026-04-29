import { describe, expect, it } from "vitest";

import {
  collectVisibleElementsCallScript,
  focusAndSelectTargetScript,
  highlightTargetScript,
  resolveTargetScript,
  serializeScriptArg,
} from "./domInspectionScripts";

describe("domInspectionScripts", () => {
  it("serializes target strings without raw script tag injection", () => {
    expect(serializeScriptArg('</script><script>alert("x")</script>')).toContain("<\\/script>");
  });

  it("builds controlled collection and resolution scripts", () => {
    const collect = collectVisibleElementsCallScript();
    const resolve = resolveTargetScript({
      target: { kind: "test-id", testId: 'save"; window.evil()' },
      includeDomSnippet: true,
      includeComputedStyle: true,
    });

    expect(collect).toContain("inspectOrchestrateElements");
    expect(resolve).toContain("const target =");
    expect(resolve).toContain("outerHTMLPreview");
    expect(resolve).toContain("includeComputedStyle");
    expect(resolve).toContain('\\"; window.evil()');
    expect(resolve).not.toContain('save"; window.evil()');
  });

  it("builds controlled highlight and focus scripts", () => {
    expect(highlightTargetScript("element-1")).toContain("data-orchestrate-target-id");
    expect(focusAndSelectTargetScript({ elementId: "element-1", clearFirst: true })).toContain(
      "node.focus()",
    );
  });
});
