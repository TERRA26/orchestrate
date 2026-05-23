import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_CODEX_MAX_FRAME_BYTES,
  readMaxFrameBytes,
} from "./codexAppServerManager";

/**
 * Pins the Codex frame-size cap helper introduced by ORC-246.
 *
 * The cap protects the event loop from JSON.parse stalls on
 * runaway frames (malicious base64 leaks, screenshot blobs, etc.).
 *
 * @see ORC-246
 */

describe("readMaxFrameBytes (ORC-246)", () => {
  const saved = process.env.ORCHESTRATE_CODEX_MAX_FRAME_BYTES;

  beforeEach(() => {
    delete process.env.ORCHESTRATE_CODEX_MAX_FRAME_BYTES;
  });

  afterEach(() => {
    if (saved === undefined) {
      delete process.env.ORCHESTRATE_CODEX_MAX_FRAME_BYTES;
    } else {
      process.env.ORCHESTRATE_CODEX_MAX_FRAME_BYTES = saved;
    }
  });

  it("returns the default 16MB when the env var is unset", () => {
    expect(readMaxFrameBytes()).toBe(DEFAULT_CODEX_MAX_FRAME_BYTES);
    expect(DEFAULT_CODEX_MAX_FRAME_BYTES).toBe(16 * 1024 * 1024);
  });

  it("returns the parsed env value when valid", () => {
    process.env.ORCHESTRATE_CODEX_MAX_FRAME_BYTES = "65536";
    expect(readMaxFrameBytes()).toBe(65536);
  });

  it("falls back to default when the env value is below 1024 (sanity floor)", () => {
    process.env.ORCHESTRATE_CODEX_MAX_FRAME_BYTES = "100";
    expect(readMaxFrameBytes()).toBe(DEFAULT_CODEX_MAX_FRAME_BYTES);
  });

  it("falls back to default when the env value is non-numeric", () => {
    process.env.ORCHESTRATE_CODEX_MAX_FRAME_BYTES = "not-a-number";
    expect(readMaxFrameBytes()).toBe(DEFAULT_CODEX_MAX_FRAME_BYTES);
  });

  it("falls back to default when the env value is empty", () => {
    process.env.ORCHESTRATE_CODEX_MAX_FRAME_BYTES = "";
    expect(readMaxFrameBytes()).toBe(DEFAULT_CODEX_MAX_FRAME_BYTES);
  });

  it("accepts a custom cap larger than the default for special-case workloads", () => {
    process.env.ORCHESTRATE_CODEX_MAX_FRAME_BYTES = String(64 * 1024 * 1024);
    expect(readMaxFrameBytes()).toBe(64 * 1024 * 1024);
  });

  it("accepts the lowest legal cap (1024)", () => {
    process.env.ORCHESTRATE_CODEX_MAX_FRAME_BYTES = "1024";
    expect(readMaxFrameBytes()).toBe(1024);
  });
});
