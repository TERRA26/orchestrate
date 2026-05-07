import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  consumeAuthTokenFile,
  provisionAuthTokenFile,
  resolveOrchestrateAuthToken,
} from "./authTokenProvisioning.ts";

function makeDir(): string {
  return mkdtempSync(join(tmpdir(), "orc188-test-"));
}

describe("authTokenProvisioning (ORC-188)", () => {
  it("provisionAuthTokenFile creates a file with mode 0o600 and the right contents", () => {
    const dir = makeDir();
    const provisioned = provisionAuthTokenFile("super-secret", dir);

    expect(existsSync(provisioned.filePath)).toBe(true);
    const stat = statSync(provisioned.filePath);
    // Mode bits & 0o777 should equal 0o600 — only owner read+write.
    expect(stat.mode & 0o777).toBe(0o600);
    expect(readFileSync(provisioned.filePath, "utf8")).toBe("super-secret");

    provisioned.cleanup();
    expect(existsSync(provisioned.filePath)).toBe(false);
  });

  it("provisionAuthTokenFile cleanup is idempotent", () => {
    const dir = makeDir();
    const provisioned = provisionAuthTokenFile("token-x", dir);
    provisioned.cleanup();
    expect(() => provisioned.cleanup()).not.toThrow();
  });

  it("consumeAuthTokenFile returns content and unlinks the file", () => {
    const dir = makeDir();
    const filePath = join(dir, "manual.token");
    writeFileSync(filePath, "manual-token", { encoding: "utf8" });

    const token = consumeAuthTokenFile(filePath);
    expect(token).toBe("manual-token");
    expect(existsSync(filePath)).toBe(false);
  });

  it("consumeAuthTokenFile trims trailing whitespace", () => {
    const dir = makeDir();
    const filePath = join(dir, "trim.token");
    writeFileSync(filePath, "trimmed-token\n", { encoding: "utf8" });

    expect(consumeAuthTokenFile(filePath)).toBe("trimmed-token");
  });

  it("resolveOrchestrateAuthToken: prefers ORCHESTRATE_AUTH_TOKEN_FILE", () => {
    const dir = makeDir();
    const provisioned = provisionAuthTokenFile("file-token", dir);

    const token = resolveOrchestrateAuthToken({
      ORCHESTRATE_AUTH_TOKEN_FILE: provisioned.filePath,
      ORCHESTRATE_AUTH_TOKEN: "env-fallback-token",
    });

    expect(token).toBe("file-token");
    // The file should have been unlinked by the consumer.
    expect(existsSync(provisioned.filePath)).toBe(false);
  });

  it("resolveOrchestrateAuthToken: falls back to ORCHESTRATE_AUTH_TOKEN if no file", () => {
    expect(
      resolveOrchestrateAuthToken({
        ORCHESTRATE_AUTH_TOKEN: "legacy-token",
      }),
    ).toBe("legacy-token");
  });

  it("resolveOrchestrateAuthToken: returns undefined when neither is set", () => {
    expect(resolveOrchestrateAuthToken({})).toBeUndefined();
  });

  it("resolveOrchestrateAuthToken: empty file path env var falls back to direct env", () => {
    expect(
      resolveOrchestrateAuthToken({
        ORCHESTRATE_AUTH_TOKEN_FILE: "",
        ORCHESTRATE_AUTH_TOKEN: "fallback",
      }),
    ).toBe("fallback");
  });

  it("resolveOrchestrateAuthToken: empty direct env returns undefined", () => {
    expect(resolveOrchestrateAuthToken({ ORCHESTRATE_AUTH_TOKEN: "" })).toBeUndefined();
  });
});
