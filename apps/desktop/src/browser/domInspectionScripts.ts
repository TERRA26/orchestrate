import type { BrowserActInput } from "@orchestrate/contracts";

const MAX_INSPECTED_ELEMENTS = 80;

export function serializeScriptArg(value: unknown): string {
  return JSON.stringify(value).replaceAll("</script", "<\\/script");
}

export function collectVisibleElementsScript(): string {
  return `
    function inspectOrchestrateElements() {
      const candidates = Array.from(document.querySelectorAll([
        "a[href]",
        "button",
        "input",
        "textarea",
        "select",
        "[role]",
        "[data-testid]",
        "[data-test-id]",
        "[contenteditable=true]",
        "[tabindex]"
      ].join(",")));
      const visible = (node, rect) => {
        const style = window.getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 &&
          style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
      };
      const roleFor = (node) => {
        const explicit = node.getAttribute("role");
        if (explicit) return explicit;
        const tag = node.tagName.toLowerCase();
        if (tag === "button") return "button";
        if (tag === "a") return "link";
        if (tag === "textarea") return "textbox";
        if (tag === "input") {
          const type = String(node.getAttribute("type") || "text").toLowerCase();
          if (["button", "submit", "reset"].includes(type)) return "button";
          if (["checkbox", "radio"].includes(type)) return type;
          return "textbox";
        }
        return undefined;
      };
      const nameFor = (node) => {
        const labelledBy = node.getAttribute("aria-labelledby");
        if (labelledBy) {
          const label = labelledBy.split(/\\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" ").trim();
          if (label) return label;
        }
        return node.getAttribute("aria-label") ||
          node.getAttribute("title") ||
          node.getAttribute("placeholder") ||
          node.getAttribute("alt") ||
          node.value ||
          (node.textContent || "").trim();
      };
      const selectorFor = (node, index) => {
        const testId = node.getAttribute("data-testid") || node.getAttribute("data-test-id");
        if (testId) return '[data-testid="' + CSS.escape(testId) + '"], [data-test-id="' + CSS.escape(testId) + '"]';
        if (node.id) return "#" + CSS.escape(node.id);
        return node.tagName.toLowerCase() + ":nth-of-type(" + (index + 1) + ")";
      };
      return candidates.slice(0, ${MAX_INSPECTED_ELEMENTS}).map((node, index) => {
        const rect = node.getBoundingClientRect();
        const id = node.getAttribute("data-orchestrate-target-id") || "element-" + index;
        node.setAttribute("data-orchestrate-target-id", id);
        const text = (node.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 512);
        const testId = node.getAttribute("data-testid") || node.getAttribute("data-test-id") || undefined;
        return {
          id,
          tagName: node.tagName.toLowerCase(),
          role: roleFor(node),
          name: String(nameFor(node) || "").trim().replace(/\\s+/g, " ").slice(0, 512),
          text,
          selector: selectorFor(node, index),
          testId,
          href: node.href,
          inputType: node.getAttribute("type") || undefined,
          visible: visible(node, rect),
          enabled: !node.disabled && node.getAttribute("aria-disabled") !== "true",
          box: {
            x: Math.max(0, Math.floor(rect.x)),
            y: Math.max(0, Math.floor(rect.y)),
            width: Math.max(0, Math.floor(rect.width)),
            height: Math.max(0, Math.floor(rect.height)),
            coordinateSpace: "css-pixels"
          }
        };
      }).filter((element) => element.visible);
    }
  `;
}

export function resolveTargetScript(input: {
  readonly target: Extract<
    BrowserActInput["action"],
    { kind: "clickTarget" | "fillTarget" }
  >["target"];
  readonly fillableOnly?: boolean;
  readonly includeDomSnippet?: boolean;
  readonly includeComputedStyle?: boolean;
}): string {
  return `(() => {
    const target = ${serializeScriptArg(input.target)};
    const fillableOnly = ${serializeScriptArg(input.fillableOnly === true)};
    const includeDomSnippet = ${serializeScriptArg(input.includeDomSnippet === true)};
    const includeComputedStyle = ${serializeScriptArg(input.includeComputedStyle === true)};
    ${collectVisibleElementsScript()}
    const elements = inspectOrchestrateElements();
    const normalized = (value) => String(value || "").trim().toLowerCase();
    const byTarget = (element) => {
      if (target.kind === "selector") return element.selector === target.selector;
      if (target.kind === "test-id") return element.testId === target.testId;
      if (target.kind === "role-name") {
        return normalized(element.role) === normalized(target.role) &&
          normalized(element.name).includes(normalized(target.name));
      }
      if (target.kind === "text") return normalized(element.text).includes(normalized(target.text));
      if (target.kind === "element-ref") return element.id === target.elementId;
      if (target.kind === "point") {
        const box = element.box;
        return !!box && target.x >= box.x && target.y >= box.y &&
          target.x <= box.x + box.width && target.y <= box.y + box.height;
      }
      return false;
    };
    const fillable = (element) => {
      const node = document.querySelector('[data-orchestrate-target-id="' + CSS.escape(element.id) + '"]');
      if (!node) return false;
      const tag = node.tagName.toLowerCase();
      return tag === "textarea" || node.isContentEditable ||
        (tag === "input" && !["button","checkbox","file","hidden","image","radio","reset","submit"].includes(String(node.type || "").toLowerCase()));
    };
    const candidates = elements.filter((element) => byTarget(element));
    const actionableCandidates = fillableOnly
      ? candidates.filter((element) => fillable(element))
      : candidates;
    if (actionableCandidates.length > 1) {
      return {
        targetResolution: {
          requested: target,
          status: "ambiguous",
          candidates: actionableCandidates,
          reason: "Multiple visible elements matched the requested target."
        }
      };
    }
    const matched = actionableCandidates[0];
    if (!matched) {
      return {
        targetResolution: {
          requested: target,
          status: candidates.length > 0 ? "not-actionable" : "not-found",
          candidates,
          reason: candidates.length > 0 ? "Target is not an input, textarea, or contenteditable element." : "Target element was not found."
        }
      };
    }
    const matchedNode = document.querySelector('[data-orchestrate-target-id="' + CSS.escape(matched.id) + '"]');
    const compact = (value, max) => String(value || "").trim().replace(/\\s+/g, " ").slice(0, max);
    const domSnippet = includeDomSnippet && matchedNode ? {
      tagName: matchedNode.tagName.toLowerCase(),
      role: matched.role,
      name: matched.name,
      selector: matched.selector,
      testId: matched.testId,
      outerHTMLPreview: compact(matchedNode.outerHTML, 2000),
      parentSummary: matchedNode.parentElement ? compact(matchedNode.parentElement.outerHTML, 1000) : undefined
    } : undefined;
    const style = includeComputedStyle && matchedNode ? window.getComputedStyle(matchedNode) : null;
    const computedStyle = style ? {
      display: style.display,
      position: style.position,
      margin: style.margin,
      padding: style.padding,
      font: style.font,
      color: style.color,
      backgroundColor: style.backgroundColor,
      width: style.width,
      height: style.height,
      alignItems: style.alignItems,
      justifyContent: style.justifyContent
    } : undefined;
    return {
      resolvedTarget: matched,
      targetResolution: { requested: target, status: "resolved", candidates: [matched] },
      ...(domSnippet ? { domSnippet } : {}),
      ...(computedStyle ? { computedStyle } : {})
    };
  })()`;
}

export function collectVisibleElementsCallScript(): string {
  return `(() => {
    ${collectVisibleElementsScript()}
    return inspectOrchestrateElements();
  })()`;
}

export function highlightTargetScript(elementId: string): string {
  return `(() => {
    const targetId = ${serializeScriptArg(elementId)};
    const node = document.querySelector('[data-orchestrate-target-id="' + CSS.escape(targetId) + '"]');
    if (!node) return false;
    const previousOutline = node.style.outline;
    const previousOutlineOffset = node.style.outlineOffset;
    node.style.outline = "3px solid rgba(59, 130, 246, 0.95)";
    node.style.outlineOffset = "2px";
    window.setTimeout(() => {
      node.style.outline = previousOutline;
      node.style.outlineOffset = previousOutlineOffset;
    }, 500);
    return true;
  })()`;
}

export function focusAndSelectTargetScript(input: {
  readonly elementId: string;
  readonly clearFirst: boolean;
}): string {
  return `(() => {
    const targetId = ${serializeScriptArg(input.elementId)};
    const clearFirst = ${serializeScriptArg(input.clearFirst)};
    const node = document.querySelector('[data-orchestrate-target-id="' + CSS.escape(targetId) + '"]');
    if (!node) return false;
    node.focus();
    if (clearFirst) {
      if ("select" in node && typeof node.select === "function") {
        node.select();
      } else if (node.isContentEditable) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
    return true;
  })()`;
}
