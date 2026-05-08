import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Pins the version-probe retry-on-timeout pattern in ClaudeProvider.
 * Mirrors the auth-probe retry from ORC-167. Without this, "claude --version"
 * under heavy host load (concurrent vitest workers, dev server, multiple
 * Claude Code sessions) trips the 4s shared timeout and surfaces as
 * "Claude Agent CLI is installed but failed to run. Timed out while
 * running command." even though the binary is healthy.
 *
 * @see ORC-072 follow-up (claude provider version-probe timeout)
 */

const SOURCE_PATH = path.resolve(__dirname, "ClaudeProvider.ts");

describe("ClaudeProvider version probe (claude-not-working fix)", () => {
  it("declares VERSION_PROBE_TIMEOUT_MS at >= 12 seconds", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    const match = source.match(/VERSION_PROBE_TIMEOUT_MS\s*=\s*(\d[\d_]*)/);
    expect(match, "VERSION_PROBE_TIMEOUT_MS constant must exist").not.toBeNull();
    const ms = Number((match?.[1] ?? "0").replace(/_/g, ""));
    expect(ms).toBeGreaterThanOrEqual(12_000);
  });

  it("declares VERSION_PROBE_RETRY_SETTLE_MS in the small two-digit range", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    const match = source.match(/VERSION_PROBE_RETRY_SETTLE_MS\s*=\s*(\d+)/);
    expect(match, "VERSION_PROBE_RETRY_SETTLE_MS constant must exist").not.toBeNull();
    const ms = Number(match?.[1] ?? "0");
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(1000);
  });

  it("retries the version probe via runVersionProbe + Result.isSuccess + Option.isNone", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    expect(source).toContain("runVersionProbe");
    expect(source).toContain("VERSION_PROBE_TIMEOUT_MS");
    // The retry path must check that the first attempt was a Success<None>
    // (timeout), not a Failure (real CLI error). Without this guard the
    // retry would double the latency of every "command not found" path.
    const retryBlock = source.match(/runVersionProbe[\s\S]{0,400}/);
    expect(retryBlock).not.toBeNull();
    expect(retryBlock?.[0]).toMatch(/Result\.isSuccess.*firstVersionAttempt/);
    expect(retryBlock?.[0]).toMatch(/Option\.isNone.*firstVersionAttempt/);
    expect(retryBlock?.[0]).toContain("VERSION_PROBE_RETRY_SETTLE_MS");
  });

  it("no longer imports DEFAULT_TIMEOUT_MS from providerSnapshot", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    // The import block uses braces; the constant should not appear there.
    const importBlockMatch = source.match(/import\s*\{[\s\S]+?\}\s*from\s*"\.\.\/providerSnapshot"/);
    expect(importBlockMatch, "providerSnapshot import block must exist").not.toBeNull();
    expect(importBlockMatch?.[0]).not.toContain("DEFAULT_TIMEOUT_MS");
  });

  it("no longer calls Effect.timeoutOption(DEFAULT_TIMEOUT_MS) in the version probe", () => {
    const source = readFileSync(SOURCE_PATH, "utf8");
    expect(source).not.toMatch(/timeoutOption\s*\(\s*DEFAULT_TIMEOUT_MS\s*\)/);
  });
});
