import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  consumeAuthTokenFile,
  parseSpawnEnvelopeBody,
  provisionAuthTokenFile,
  resolveOrchestrateAuthToken,
  resolveOrchestrateSpawnEnvelope,
} from "./authTokenProvisioning.ts";

function makeDir(): string {
  return mkdtempSync(join(tmpdir(), "orc188-test-"));
}

describe("authTokenProvisioning (ORC-188 + ORC-002)", () => {
  it("provisionAuthTokenFile creates a file with mode 0o600 and the right contents", () => {
    const dir = makeDir();
    const provisioned = provisionAuthTokenFile("super-secret", dir);

    expect(existsSync(provisioned.filePath)).toBe(true);
    const stat = statSync(provisioned.filePath);
    // Mode bits & 0o777 should equal 0o600 — only owner read+write.
    expect(stat.mode & 0o777).toBe(0o600);
    // The file body is now a small JSON envelope; the token must still
    // round-trip via the consumer.
    const body = readFileSync(provisioned.filePath, "utf8");
    expect(parseSpawnEnvelopeBody(body).token).toBe("super-secret");

    provisioned.cleanup();
    expect(existsSync(provisioned.filePath)).toBe(false);
  });

  it("provisionAuthTokenFile cleanup is idempotent", () => {
    const dir = makeDir();
    const provisioned = provisionAuthTokenFile("token-x", dir);
    provisioned.cleanup();
    expect(() => provisioned.cleanup()).not.toThrow();
  });

  it("consumeAuthTokenFile returns the envelope and unlinks the file", () => {
    const dir = makeDir();
    const filePath = join(dir, "manual.token");
    writeFileSync(filePath, JSON.stringify({ token: "manual-token" }), { encoding: "utf8" });

    const envelope = consumeAuthTokenFile(filePath);
    expect(envelope.token).toBe("manual-token");
    expect(envelope.parentThreadId).toBeUndefined();
    expect(existsSync(filePath)).toBe(false);
  });

  it("consumeAuthTokenFile trims trailing whitespace from a legacy plain-text file", () => {
    const dir = makeDir();
    const filePath = join(dir, "trim.token");
    writeFileSync(filePath, "trimmed-token\n", { encoding: "utf8" });

    expect(consumeAuthTokenFile(filePath).token).toBe("trimmed-token");
  });

  it("ORC-002 round-trips parentThreadId via the envelope", () => {
    const dir = makeDir();
    const provisioned = provisionAuthTokenFile(
      { token: "tok", parentThreadId: "thread-abc-123" },
      dir,
    );
    const envelope = consumeAuthTokenFile(provisioned.filePath);
    expect(envelope.token).toBe("tok");
    expect(envelope.parentThreadId).toBe("thread-abc-123");
  });

  it("ORC-002 parseSpawnEnvelopeBody falls back to legacy plain-text", () => {
    expect(parseSpawnEnvelopeBody("plain-token-no-json")).toEqual({
      token: "plain-token-no-json",
    });
  });

  it("ORC-002 parseSpawnEnvelopeBody handles a malformed JSON body by treating it as plain token", () => {
    expect(parseSpawnEnvelopeBody("{not real json")).toEqual({ token: "{not real json" });
  });

  it("ORC-002 resolveOrchestrateSpawnEnvelope prefers file envelope over env vars", () => {
    const dir = makeDir();
    const provisioned = provisionAuthTokenFile(
      { token: "file-token", parentThreadId: "file-thread" },
      dir,
    );

    const envelope = resolveOrchestrateSpawnEnvelope({
      ORCHESTRATE_AUTH_TOKEN_FILE: provisioned.filePath,
      ORCHESTRATE_AUTH_TOKEN: "env-token",
      ORCHESTRATE_PARENT_THREAD_ID: "env-thread",
    });

    expect(envelope?.token).toBe("file-token");
    expect(envelope?.parentThreadId).toBe("file-thread");
    expect(existsSync(provisioned.filePath)).toBe(false);
  });

  it("ORC-002 resolveOrchestrateSpawnEnvelope falls back to env when file is unavailable", () => {
    const envelope = resolveOrchestrateSpawnEnvelope({
      ORCHESTRATE_AUTH_TOKEN: "legacy-token",
      ORCHESTRATE_PARENT_THREAD_ID: "legacy-thread",
    });
    expect(envelope?.token).toBe("legacy-token");
    expect(envelope?.parentThreadId).toBe("legacy-thread");
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
