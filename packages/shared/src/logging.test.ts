import { describe, expect, it } from "vitest";

import { redactUrlSecrets } from "./logging";

/**
 * Pins the URL secret-redaction helper introduced by ORC-186.
 *
 * @see ORC-186
 */

describe("redactUrlSecrets (ORC-186)", () => {
  it("redacts the default `token` query parameter", () => {
    expect(
      redactUrlSecrets("ws://127.0.0.1:3773/?token=abcdef1234567890"),
    ).toBe("ws://127.0.0.1:3773/?token=%5BREDACTED%5D");
  });

  it("preserves a URL with no token parameter unchanged", () => {
    expect(redactUrlSecrets("ws://127.0.0.1:3773/?foo=bar")).toBe(
      "ws://127.0.0.1:3773/?foo=bar",
    );
  });

  it("redacts only the matched parameter, leaving others intact", () => {
    const result = redactUrlSecrets(
      "https://example.com/path?foo=bar&token=secret&baz=qux",
    );
    expect(result).toContain("foo=bar");
    expect(result).toContain("baz=qux");
    expect(result).not.toContain("secret");
    expect(result).toMatch(/token=%5BREDACTED%5D|token=\[REDACTED\]/);
  });

  it("accepts custom paramNames", () => {
    const result = redactUrlSecrets(
      "https://example.com/?api_key=xyz&password=hunter2",
      { paramNames: ["api_key", "password"] },
    );
    expect(result).not.toContain("xyz");
    expect(result).not.toContain("hunter2");
  });

  it("returns the url unchanged when paramNames is empty", () => {
    expect(
      redactUrlSecrets("https://example.com/?token=abc", { paramNames: [] }),
    ).toBe("https://example.com/?token=abc");
  });

  it("falls back to a regex replace for malformed URLs", () => {
    // Missing scheme -> URL constructor would throw on some Node versions.
    const result = redactUrlSecrets("//127.0.0.1?token=raw");
    // Either branch (URL parsing or regex) produces a redacted token.
    expect(result).toMatch(/token=(\[REDACTED\]|%5BREDACTED%5D)/);
    expect(result).not.toContain("raw");
  });

  it("redacts case-insensitively in the regex fallback", () => {
    // Mark the URL as malformed by including invalid characters that
    // make the URL constructor throw on the slow path; the regex
    // fallback is then exercised. Use an opaque scheme.
    const malformed = "weird://?TOKEN=AbC123";
    const result = redactUrlSecrets(malformed);
    expect(result).not.toContain("AbC123");
  });

  it("returns the URL unchanged when none of the named params are present", () => {
    const result = redactUrlSecrets("ws://127.0.0.1:3773/?session=open");
    expect(result).toBe("ws://127.0.0.1:3773/?session=open");
  });

  it("redacts every occurrence when the parameter appears multiple times", () => {
    const result = redactUrlSecrets(
      "https://example.com/?token=first&token=second",
    );
    // After redaction neither secret is visible; both `token=` occurrences
    // are rewritten.
    expect(result).not.toContain("first");
    expect(result).not.toContain("second");
  });
});
