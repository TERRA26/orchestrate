import {
  type BrowserAction,
  type BrowserPolicyDecision,
  type PreviewTarget,
} from "@orchestrate/contracts";

export type BrowserActionKind = "observation" | "safe-interaction" | "consequential-interaction";

export function classifyBrowserAction(action: BrowserAction): BrowserActionKind {
  if (action.kind === "wait") return "observation";
  if (action.kind === "evaluate") return "consequential-interaction";
  if (action.kind === "navigate") return "safe-interaction";
  return "safe-interaction";
}

export const BrowserActionPolicy = {
  validate(action: BrowserAction, target: PreviewTarget): BrowserPolicyDecision {
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

    return { outcome: "allow" };
  },
};
