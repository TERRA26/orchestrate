import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __resetLogFileSinkForTests,
  createLogger,
  redactLogValue,
} from "./logger";

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

describe("rotating file sink (ORC-230)", () => {
  const savedFile = process.env.ORCHESTRATE_LOG_FILE;
  const savedMaxBytes = process.env.ORCHESTRATE_LOG_MAX_BYTES;
  const savedMaxFiles = process.env.ORCHESTRATE_LOG_MAX_FILES;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "orc-230-test-"));
    delete process.env.ORCHESTRATE_LOG_FILE;
    delete process.env.ORCHESTRATE_LOG_MAX_BYTES;
    delete process.env.ORCHESTRATE_LOG_MAX_FILES;
    __resetLogFileSinkForTests();
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
    if (savedFile === undefined) delete process.env.ORCHESTRATE_LOG_FILE;
    else process.env.ORCHESTRATE_LOG_FILE = savedFile;
    if (savedMaxBytes === undefined) delete process.env.ORCHESTRATE_LOG_MAX_BYTES;
    else process.env.ORCHESTRATE_LOG_MAX_BYTES = savedMaxBytes;
    if (savedMaxFiles === undefined) delete process.env.ORCHESTRATE_LOG_MAX_FILES;
    else process.env.ORCHESTRATE_LOG_MAX_FILES = savedMaxFiles;
    __resetLogFileSinkForTests();
  });

  function withSilencedConsole(fn: () => void): void {
    const origLog = console.log;
    const origWarn = console.warn;
    const origErr = console.error;
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
    try {
      fn();
    } finally {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origErr;
    }
  }

  it("does NOT create a sink file when ORCHESTRATE_LOG_FILE is unset", () => {
    const ghostPath = path.join(tempDir, "ghost.log");
    withSilencedConsole(() => {
      createLogger("test").info("ping", { workerId: "w-1" });
    });
    expect(existsSync(ghostPath)).toBe(false);
  });

  it("appends each log line to the rotating sink when ORCHESTRATE_LOG_FILE is set", () => {
    const filePath = path.join(tempDir, "server.log");
    process.env.ORCHESTRATE_LOG_FILE = filePath;

    withSilencedConsole(() => {
      const log = createLogger("test");
      log.info("hello", { workerId: "w-1" });
      log.warn("noise", { count: 3 });
      log.error("boom", { reason: "exploded" });
    });

    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("INFO [test] hello");
    expect(content).toContain("workerId=\"w-1\"");
    expect(content).toContain("WARN [test] noise");
    expect(content).toContain("count=3");
    expect(content).toContain("ERROR [test] boom");
  });

  it("strips ANSI color codes from the file sink output", () => {
    const filePath = path.join(tempDir, "no-color.log");
    process.env.ORCHESTRATE_LOG_FILE = filePath;

    withSilencedConsole(() => {
      // Force the colorizer on by simulating a TTY environment.
      const origIsTTY = process.stdout.isTTY;
      Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
      try {
        createLogger("test").info("colorful", { workerId: "w-1" });
      } finally {
        Object.defineProperty(process.stdout, "isTTY", { value: origIsTTY, configurable: true });
      }
    });

    const content = readFileSync(filePath, "utf-8");
    expect(content).not.toContain("[");
    expect(content).toContain("INFO [test] colorful");
  });

  it("rotates the sink file once it exceeds ORCHESTRATE_LOG_MAX_BYTES", () => {
    const filePath = path.join(tempDir, "rotating.log");
    process.env.ORCHESTRATE_LOG_FILE = filePath;
    // 200 bytes per write; rotate after about 4 lines.
    process.env.ORCHESTRATE_LOG_MAX_BYTES = "300";
    process.env.ORCHESTRATE_LOG_MAX_FILES = "3";

    withSilencedConsole(() => {
      const log = createLogger("test");
      for (let i = 0; i < 8; i += 1) {
        log.info(`line-${i}`, {
          payload: "x".repeat(50),
        });
      }
    });

    expect(existsSync(filePath)).toBe(true);
    expect(existsSync(filePath + ".1")).toBe(true);
  });

  it("falls back gracefully (returns null sink) when the path is unwritable", () => {
    // Try to write into a non-existent dir whose parent doesn't exist.
    process.env.ORCHESTRATE_LOG_FILE = "/dev/null/cannot/exist/log";
    // Should not throw when the constructor fails internally.
    expect(() =>
      withSilencedConsole(() => {
        createLogger("test").info("ping", { workerId: "w-1" });
      }),
    ).not.toThrow();
  });

  it("uses default 10MB and 10 files when env values are absent or invalid", () => {
    const filePath = path.join(tempDir, "defaults.log");
    process.env.ORCHESTRATE_LOG_FILE = filePath;
    process.env.ORCHESTRATE_LOG_MAX_BYTES = "not-a-number";
    process.env.ORCHESTRATE_LOG_MAX_FILES = "0";

    withSilencedConsole(() => {
      createLogger("test").info("ping", { workerId: "w-1" });
    });

    // The file is created (defaults applied successfully).
    expect(existsSync(filePath)).toBe(true);
  });
});
