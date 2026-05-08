import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Pins the version-probe AND auth-probe retry-on-timeout pattern in
 * CodexProvider, mirroring the ClaudeProvider regression net (ORC-072
 * follow-up). Without these, "codex --version" or "codex login status"
 * under heavy host load (concurrent vitest workers, dev server,
 * multiple Claude Code sessions) trips the 4s shared timeout and
 * surfaces as "Codex CLI is installed but failed to run. Timed out
 * while running command." even though the binary is healthy.
 *
 * @see ORC-101
 */

const SOURCE_PATH = path.resolve(__dirname, "CodexProvider.ts");

describe("CodexProvider probes (ORC-101)", () => {
  it("declares VERSION_PROBE_TIMEOUT_MS at >= 12 seconds", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    const match = source.match(/VERSION_PROBE_TIMEOUT_MS\s*=\s*(\d[\d_]*)/);
    expect(match, "VERSION_PROBE_TIMEOUT_MS constant must exist").not.toBeNull();
    const ms = Number((match?.[1] ?? "0").replace(/_/g, ""));
    expect(ms).toBeGreaterThanOrEqual(12_000);
  });

  it("declares AUTH_PROBE_TIMEOUT_MS at >= 12 seconds", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    const match = source.match(/AUTH_PROBE_TIMEOUT_MS\s*=\s*(\d[\d_]*)/);
    expect(match, "AUTH_PROBE_TIMEOUT_MS constant must exist").not.toBeNull();
    const ms = Number((match?.[1] ?? "0").replace(/_/g, ""));
    expect(ms).toBeGreaterThanOrEqual(12_000);
  });

  it("retries the version probe via runVersionProbe + isSuccess + isNone", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    expect(source).toContain("runVersionProbe");
    expect(source).toContain("VERSION_PROBE_TIMEOUT_MS");
    const block = source.match(/runVersionProbe[\s\S]{0,400}/);
    expect(block).not.toBeNull();
    expect(block?.[0]).toMatch(/Result\.isSuccess.*firstVersionAttempt/);
    expect(block?.[0]).toMatch(/Option\.isNone.*firstVersionAttempt/);
    expect(block?.[0]).toContain("VERSION_PROBE_RETRY_SETTLE_MS");
  });

  it("retries the auth probe via runAuthProbe + isSuccess + isNone", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    expect(source).toContain("runAuthProbe");
    expect(source).toContain("AUTH_PROBE_TIMEOUT_MS");
    const block = source.match(/runAuthProbe[\s\S]{0,400}/);
    expect(block).not.toBeNull();
    expect(block?.[0]).toMatch(/Result\.isSuccess.*firstAuthAttempt/);
    expect(block?.[0]).toMatch(/Option\.isNone.*firstAuthAttempt/);
    expect(block?.[0]).toContain("AUTH_PROBE_RETRY_SETTLE_MS");
  });

  it("no longer imports DEFAULT_TIMEOUT_MS from providerSnapshot", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    const importBlockMatch = source.match(/import\s*\{[\s\S]+?\}\s*from\s*"\.\.\/providerSnapshot"/);
    expect(importBlockMatch, "providerSnapshot import block must exist").not.toBeNull();
    expect(importBlockMatch?.[0]).not.toContain("DEFAULT_TIMEOUT_MS");
  });

  it("no longer pipes DEFAULT_TIMEOUT_MS through Effect.timeoutOption", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    expect(source).not.toMatch(/timeoutOption\s*\(\s*DEFAULT_TIMEOUT_MS\s*\)/);
  });
});
