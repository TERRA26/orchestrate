import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createLogger, redactLogValue } from "./logger";

/**
 * Pins the PII redaction added to the structured logger by ORC-228.
 *
 * @see ORC-228
 */

describe("redactLogValue (ORC-228)", () => {
  const savedRaw = process.env.ORCHESTRATE_LOG_RAW;
  const savedExtra = process.env.ORCHESTRATE_LOG_REDACT_KEYS;

  beforeEach(() => {
    delete process.env.ORCHESTRATE_LOG_RAW;
    delete process.env.ORCHESTRATE_LOG_REDACT_KEYS;
  });

  afterEach(() => {
    if (savedRaw === undefined) delete process.env.ORCHESTRATE_LOG_RAW;
    else process.env.ORCHESTRATE_LOG_RAW = savedRaw;
    if (savedExtra === undefined) delete process.env.ORCHESTRATE_LOG_REDACT_KEYS;
    else process.env.ORCHESTRATE_LOG_REDACT_KEYS = savedExtra;
  });

  it("redacts a value under a default PII key (prompt) and emits length signal", () => {
    const out = redactLogValue("prompt", "user typed a long sensitive message");
    expect(out).toBe("[REDACTED](len=35)");
  });

  it("redacts filePath, projectTitle, body, text, summary by default", () => {
    expect(redactLogValue("filePath", "/Users/me/secret/key.pem")).toMatch(/^\[REDACTED\]/);
    expect(redactLogValue("projectTitle", "Acme Q4")).toMatch(/^\[REDACTED\]/);
    expect(redactLogValue("body", "POST body bytes")).toMatch(/^\[REDACTED\]/);
    expect(redactLogValue("text", "assistant said")).toMatch(/^\[REDACTED\]/);
    expect(redactLogValue("summary", "summary content")).toMatch(/^\[REDACTED\]/);
  });

  it("redacts case-insensitively (FilePath, FILEPATH)", () => {
    expect(redactLogValue("FilePath", "x")).toMatch(/^\[REDACTED\]/);
    expect(redactLogValue("FILEPATH", "x")).toMatch(/^\[REDACTED\]/);
  });

  it("emits empty placeholder for empty string values", () => {
    expect(redactLogValue("prompt", "")).toBe("[REDACTED]");
  });

  it("emits array length signal for array values under a PII key", () => {
    expect(redactLogValue("acceptanceCriteria", ["a", "b", "c"])).toBe(
      "[REDACTED](array,len=3)",
    );
  });

  it("does NOT redact values under non-PII keys", () => {
    expect(redactLogValue("workerId", "worker-123")).toBe("worker-123");
    expect(redactLogValue("status", "running")).toBe("running");
    expect(redactLogValue("count", 42)).toBe(42);
  });

  it("returns the raw value when ORCHESTRATE_LOG_RAW=1", () => {
    process.env.ORCHESTRATE_LOG_RAW = "1";
    expect(redactLogValue("prompt", "secret")).toBe("secret");
  });

  it("treats undefined and null as pass-through", () => {
    expect(redactLogValue("prompt", undefined)).toBeUndefined();
    expect(redactLogValue("prompt", null)).toBeNull();
  });

  it("respects ORCHESTRATE_LOG_REDACT_KEYS extension", () => {
    process.env.ORCHESTRATE_LOG_REDACT_KEYS = "customField,otherCustom";
    expect(redactLogValue("customField", "secret-value")).toMatch(/^\[REDACTED\]/);
    expect(redactLogValue("otherCustom", "another-secret")).toMatch(/^\[REDACTED\]/);
    expect(redactLogValue("workerId", "still-not-redacted")).toBe("still-not-redacted");
  });
});

describe("createLogger format integration (ORC-228)", () => {
  const savedRaw = process.env.ORCHESTRATE_LOG_RAW;

  beforeEach(() => {
    delete process.env.ORCHESTRATE_LOG_RAW;
  });

  afterEach(() => {
    if (savedRaw === undefined) delete process.env.ORCHESTRATE_LOG_RAW;
    else process.env.ORCHESTRATE_LOG_RAW = savedRaw;
  });

  it("redacts PII keys in the formatted line written to console", () => {
    const captured: string[] = [];
    const originalLog = console.log;
    console.log = (line: unknown) => {
      captured.push(String(line));
    };
    try {
      const log = createLogger("test");
      log.info("ping", {
        prompt: "user typed something secret",
        workerId: "w-1",
      });
    } finally {
      console.log = originalLog;
    }
    expect(captured).toHaveLength(1);
    const line = captured[0]!;
    expect(line).not.toContain("user typed something secret");
    expect(line).toContain("prompt=");
    expect(line).toMatch(/\[REDACTED\]/);
    // Non-PII keys still emit their values.
    expect(line).toContain("workerId=");
    expect(line).toContain("w-1");
  });

  it("emits raw values when ORCHESTRATE_LOG_RAW=1", () => {
    process.env.ORCHESTRATE_LOG_RAW = "1";
    const captured: string[] = [];
    const originalLog = console.log;
    console.log = (line: unknown) => {
      captured.push(String(line));
    };
    try {
      createLogger("test").info("ping", { prompt: "raw-mode-value" });
    } finally {
      console.log = originalLog;
    }
    expect(captured[0]).toContain("raw-mode-value");
  });
});
