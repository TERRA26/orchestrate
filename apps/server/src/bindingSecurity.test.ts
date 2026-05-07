import { describe, expect, it } from "vitest";

import { isLoopbackHost, isWildcardHost, validateBindingSecurity } from "./bindingSecurity.ts";

describe("bindingSecurity", () => {
  it("isLoopbackHost recognizes loopback addresses", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("LOCALHOST")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("[::1]")).toBe(true);
  });

  it("isLoopbackHost rejects non-loopback addresses", () => {
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("::")).toBe(false);
    expect(isLoopbackHost("192.168.1.10")).toBe(false);
    expect(isLoopbackHost(undefined)).toBe(false);
    expect(isLoopbackHost("")).toBe(false);
  });

  it("isWildcardHost treats undefined and empty as wildcard (Node default behavior)", () => {
    expect(isWildcardHost(undefined)).toBe(true);
    expect(isWildcardHost("")).toBe(true);
  });

  it("isWildcardHost recognizes explicit wildcard strings", () => {
    expect(isWildcardHost("0.0.0.0")).toBe(true);
    expect(isWildcardHost("::")).toBe(true);
    expect(isWildcardHost("[::]")).toBe(true);
  });

  it("isWildcardHost returns false for loopback and named hosts", () => {
    expect(isWildcardHost("127.0.0.1")).toBe(false);
    expect(isWildcardHost("localhost")).toBe(false);
    expect(isWildcardHost("server.local")).toBe(false);
  });

  it("validateBindingSecurity: loopback host without token is OK", () => {
    expect(validateBindingSecurity({ host: "127.0.0.1", authToken: undefined })).toEqual({
      ok: true,
    });
    expect(validateBindingSecurity({ host: "localhost", authToken: undefined })).toEqual({
      ok: true,
    });
    expect(validateBindingSecurity({ host: "::1", authToken: undefined })).toEqual({ ok: true });
  });

  it("validateBindingSecurity: wildcard host with non-empty token is OK", () => {
    expect(validateBindingSecurity({ host: "0.0.0.0", authToken: "secret" })).toEqual({ ok: true });
    expect(validateBindingSecurity({ host: undefined, authToken: "secret" })).toEqual({ ok: true });
  });

  it("validateBindingSecurity: wildcard host without token is rejected (ORC-041)", () => {
    const result = validateBindingSecurity({ host: "0.0.0.0", authToken: undefined });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("all interfaces");
      expect(result.reason).toContain("ORCHESTRATE_AUTH_TOKEN");
      expect(result.reason).toContain("--host 127.0.0.1");
    }
  });

  it("validateBindingSecurity: undefined host without token is rejected (Node default = all interfaces)", () => {
    const result = validateBindingSecurity({ host: undefined, authToken: undefined });
    expect(result.ok).toBe(false);
  });

  it("validateBindingSecurity: empty token treated as missing", () => {
    const result = validateBindingSecurity({ host: "0.0.0.0", authToken: "" });
    expect(result.ok).toBe(false);
  });

  it("validateBindingSecurity: whitespace-only token treated as missing", () => {
    const result = validateBindingSecurity({ host: "0.0.0.0", authToken: "   " });
    expect(result.ok).toBe(false);
  });
});
