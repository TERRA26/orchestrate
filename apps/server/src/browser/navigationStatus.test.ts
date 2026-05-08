import { describe, expect, it } from "vitest";

import { looksLikeErrorPage } from "./navigationStatus";

/**
 * Pins the `looksLikeErrorPage` heuristic introduced by ORC-151.
 *
 * @see ORC-151
 */

describe("looksLikeErrorPage (ORC-151)", () => {
  it("flags HTTP 404 with a status detail", () => {
    const verdict = looksLikeErrorPage({ status: 404, statusText: "Not Found" });
    expect(verdict.kind).toBe("error");
    if (verdict.kind === "error") {
      expect(verdict.reason).toBe("http-status");
      expect(verdict.detail).toBe("404 Not Found");
    }
  });

  it("flags HTTP 500 even without statusText", () => {
    const verdict = looksLikeErrorPage({ status: 500 });
    expect(verdict.kind).toBe("error");
    if (verdict.kind === "error") {
      expect(verdict.reason).toBe("http-status");
      expect(verdict.detail).toBe("500");
    }
  });

  it("flags HTTP 200 with 'Page not found' text (custom 404 UI)", () => {
    const verdict = looksLikeErrorPage({
      status: 200,
      title: "Acme",
      textSummary: "Page not found. The link you followed may be broken.",
    });
    expect(verdict.kind).toBe("error");
    if (verdict.kind === "error") {
      expect(verdict.reason).toBe("error-text-pattern");
    }
  });

  it("flags HTTP 200 with 'Something went wrong' text", () => {
    const verdict = looksLikeErrorPage({
      status: 200,
      textSummary: "Something went wrong. Please try again later.",
    });
    expect(verdict.kind).toBe("error");
  });

  it("flags HTTP 200 with empty body (likely JS shell crash)", () => {
    const verdict = looksLikeErrorPage({
      status: 200,
      title: "Loading",
      textSummary: "  ",
    });
    expect(verdict.kind).toBe("error");
    if (verdict.kind === "error") {
      expect(verdict.reason).toBe("empty-body");
    }
  });

  it("accepts a successful HTTP 200 with normal body", () => {
    const verdict = looksLikeErrorPage({
      status: 200,
      title: "Welcome to Acme",
      textSummary: "Sign in to manage your account. Forgot password? Click here.",
    });
    expect(verdict.kind).toBe("ok");
  });

  it("accepts an undefined-status capture if the body looks healthy", () => {
    const verdict = looksLikeErrorPage({
      title: "Dashboard",
      textSummary: "You have 3 pending tasks. Open the inbox to review them.",
    });
    expect(verdict.kind).toBe("ok");
  });

  it("does not flag a successful page that legitimately mentions errors as a topic", () => {
    const verdict = looksLikeErrorPage({
      status: 200,
      title: "Error Tracking",
      textSummary:
        "Our error tracking dashboard surfaces uncaught exceptions across your services.",
    });
    // "error tracking" / "uncaught exceptions" are topical mentions, not the
    // error patterns. The heuristic is intentionally conservative here.
    expect(verdict.kind).toBe("ok");
  });

  it("flags 'Internal Server Error' message in body", () => {
    const verdict = looksLikeErrorPage({
      status: 200,
      title: "Acme",
      textSummary: "Internal Server Error. Please try again.",
    });
    expect(verdict.kind).toBe("error");
  });

  it("does not flag HTTP 3xx (redirects are not errors)", () => {
    const verdict = looksLikeErrorPage({
      status: 302,
      title: "Acme",
      textSummary: "Some normal content here that should not flag as error.",
    });
    expect(verdict.kind).toBe("ok");
  });
});
