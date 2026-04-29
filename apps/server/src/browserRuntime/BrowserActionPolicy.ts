import {
  type BrowserAction,
  type BrowserElementSummary,
  type BrowserPolicyDecision,
  type BrowserTargetResolution,
  type PreviewTarget,
} from "@orchestrate/contracts";

export type BrowserActionKind = "observation" | "safe-interaction" | "consequential-interaction";

export function classifyBrowserAction(action: BrowserAction): BrowserActionKind {
  if (action.kind === "wait") return "observation";
  if (action.kind === "evaluate") return "consequential-interaction";
  if (action.kind === "clickTarget" || action.kind === "fillTarget") {
    return hasConsequentialTargetText(action) ? "consequential-interaction" : "safe-interaction";
  }
  if (action.kind === "navigate") return "safe-interaction";
  return "safe-interaction";
}

const CONSEQUENTIAL_TARGET_PATTERN =
  /\b(delete|submit|send|post|purchase|buy|checkout|upload|export|login|sign[\s_-]?in|auth)\b/i;
const SENSITIVE_FILL_PATTERN =
  /\b(password|credit\s*card|card|token|secret|api\s*key|login|auth)\b/i;

function elementText(target: BrowserElementSummary | undefined): string {
  if (!target) return "";
  return [
    target.role,
    target.name,
    target.text,
    target.testId,
    target.inputType,
    target.href,
    target.tagName,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

function targetText(action: BrowserAction, resolvedTarget?: BrowserElementSummary): string {
  const resolved = elementText(resolvedTarget);
  if (resolved) return resolved;
  if (action.kind !== "clickTarget" && action.kind !== "fillTarget") return "";
  const target = action.target;
  switch (target.kind) {
    case "selector":
      return target.selector;
    case "test-id":
      return target.testId;
    case "role-name":
      return `${target.role} ${target.name}`;
    case "text":
      return target.text;
    case "element-ref":
      return target.elementId;
    case "point":
      return "";
  }
}

function hasConsequentialTargetText(
  action: BrowserAction,
  resolvedTarget?: BrowserElementSummary,
): boolean {
  const text = targetText(action, resolvedTarget);
  if (action.kind === "fillTarget") return SENSITIVE_FILL_PATTERN.test(text);
  return CONSEQUENTIAL_TARGET_PATTERN.test(text);
}

export const BrowserActionPolicy = {
  validate(
    action: BrowserAction,
    target: PreviewTarget,
    context: {
      readonly resolvedTarget?: BrowserElementSummary;
      readonly targetResolution?: BrowserTargetResolution;
    } = {},
  ): BrowserPolicyDecision {
    if (action.kind === "evaluate" && target.permissionTier !== "isolated-local-preview") {
      return {
        outcome: "deny",
        reason: "Unsafe browser evaluation is only allowed for isolated local previews.",
      };
    }

    if (action.kind === "navigate") {
      let requestedUrl: URL;
      try {
        requestedUrl = new URL(action.url, target.baseUrl);
      } catch {
        return {
          outcome: "deny",
          reason: `Invalid navigation URL: ${action.url}`,
        };
      }

      if (target.deniedOrigins.includes(requestedUrl.origin)) {
        return {
          outcome: "deny",
          reason: `Navigation origin is explicitly denied: ${requestedUrl.origin}`,
        };
      }

      if (!target.allowedOrigins.includes(requestedUrl.origin)) {
        return {
          outcome: "requires-approval",
          approvalKind: "external-navigation",
          reason: `Navigation origin is outside the preview target policy: ${requestedUrl.origin}`,
        };
      }
    }

    if (
      (action.kind === "clickTarget" || action.kind === "fillTarget") &&
      hasConsequentialTargetText(action, context.resolvedTarget)
    ) {
      return {
        outcome: "requires-approval",
        approvalKind:
          action.kind === "fillTarget" &&
          SENSITIVE_FILL_PATTERN.test(targetText(action, context.resolvedTarget))
            ? "authenticate"
            : "submit-form",
        reason: `Targeted ${action.kind === "clickTarget" ? "click" : "fill"} may be consequential: ${targetText(action, context.resolvedTarget).slice(0, 120)}`,
      };
    }

    return { outcome: "allow" };
  },
};
