import { describe, expect, it } from "vitest";

import {
  buildSanitizedSubprocessEnv,
  isAllowedSubprocessEnvKey,
} from "./subprocessEnvAllowlist.ts";

describe("isAllowedSubprocessEnvKey (ORC-011)", () => {
  it("allows core unix env keys", () => {
    expect(isAllowedSubprocessEnvKey("HOME")).toBe(true);
    expect(isAllowedSubprocessEnvKey("PATH")).toBe(true);
    expect(isAllowedSubprocessEnvKey("USER")).toBe(true);
    expect(isAllowedSubprocessEnvKey("LANG")).toBe(true);
    expect(isAllowedSubprocessEnvKey("TZ")).toBe(true);
  });

  it("allows locale extensions via LC_ prefix", () => {
    expect(isAllowedSubprocessEnvKey("LC_ALL")).toBe(true);
    expect(isAllowedSubprocessEnvKey("LC_MESSAGES")).toBe(true);
    expect(isAllowedSubprocessEnvKey("LC_CTYPE")).toBe(true);
  });

  it("allows provider-specific prefixes (Claude SDK config)", () => {
    expect(isAllowedSubprocessEnvKey("ANTHROPIC_API_KEY")).toBe(true);
    expect(isAllowedSubprocessEnvKey("ANTHROPIC_BASE_URL")).toBe(true);
    expect(isAllowedSubprocessEnvKey("CLAUDE_CONFIG_DIR")).toBe(true);
    expect(isAllowedSubprocessEnvKey("OPENAI_API_KEY")).toBe(true);
    expect(isAllowedSubprocessEnvKey("CODEX_HOME")).toBe(true);
  });

  it("rejects ORCHESTRATE_* server-private secrets (ORC-011 core case)", () => {
    expect(isAllowedSubprocessEnvKey("ORCHESTRATE_AUTH_TOKEN")).toBe(false);
    expect(isAllowedSubprocessEnvKey("ORCHESTRATE_AUTH_TOKEN_FILE")).toBe(false);
    expect(isAllowedSubprocessEnvKey("ORCHESTRATE_DB_URL")).toBe(false);
    expect(isAllowedSubprocessEnvKey("ORCHESTRATE_PARENT_THREAD_ID")).toBe(false);
  });

  it("rejects unbranded cloud credential prefixes", () => {
    expect(isAllowedSubprocessEnvKey("AWS_ACCESS_KEY_ID")).toBe(false);
    expect(isAllowedSubprocessEnvKey("AWS_SECRET_ACCESS_KEY")).toBe(false);
    expect(isAllowedSubprocessEnvKey("GCP_SERVICE_ACCOUNT_KEY")).toBe(false);
    expect(isAllowedSubprocessEnvKey("GOOGLE_APPLICATION_CREDENTIALS")).toBe(false);
    expect(isAllowedSubprocessEnvKey("DATABASE_URL")).toBe(false);
    expect(isAllowedSubprocessEnvKey("REDIS_URL")).toBe(false);
  });

  it("rejects arbitrary unknown keys", () => {
    expect(isAllowedSubprocessEnvKey("MY_CUSTOM_SECRET")).toBe(false);
    expect(isAllowedSubprocessEnvKey("API_KEY")).toBe(false);
  });
});

describe("buildSanitizedSubprocessEnv (ORC-011)", () => {
  it("keeps only allowed keys from the parent env", () => {
    const result = buildSanitizedSubprocessEnv({
      HOME: "/home/test",
      PATH: "/usr/bin",
      USER: "test",
      ORCHESTRATE_AUTH_TOKEN: "leak-this",
      AWS_ACCESS_KEY_ID: "leak-this-too",
      ANTHROPIC_API_KEY: "keep-this",
    });
    expect(result.HOME).toBe("/home/test");
    expect(result.PATH).toBe("/usr/bin");
    expect(result.USER).toBe("test");
    expect(result.ANTHROPIC_API_KEY).toBe("keep-this");
    expect(result.ORCHESTRATE_AUTH_TOKEN).toBeUndefined();
    expect(result.AWS_ACCESS_KEY_ID).toBeUndefined();
  });

  it("merges additions on top of the sanitized parent", () => {
    const result = buildSanitizedSubprocessEnv(
      { HOME: "/home/test", ORCHESTRATE_AUTH_TOKEN: "leak" },
      { ORCHESTRATE_WS_PORT: "5555", ORCHESTRATE_AUTH_TOKEN_FILE: "/tmp/x" },
    );
    expect(result.HOME).toBe("/home/test");
    expect(result.ORCHESTRATE_AUTH_TOKEN).toBeUndefined(); // stripped from parent
    expect(result.ORCHESTRATE_WS_PORT).toBe("5555"); // injected via additions
    expect(result.ORCHESTRATE_AUTH_TOKEN_FILE).toBe("/tmp/x"); // injected via additions
  });

  it("treats undefined additions values as no-op", () => {
    const result = buildSanitizedSubprocessEnv(
      { HOME: "/home/test" },
      { OPTIONAL_KEY: undefined },
    );
    expect(result.HOME).toBe("/home/test");
    expect(result.OPTIONAL_KEY).toBeUndefined();
  });

  it("drops undefined parent values", () => {
    const parent: NodeJS.ProcessEnv = { HOME: "/home/test" };
    parent.PATH = undefined; // simulate a parent with explicitly-undefined keys
    const result = buildSanitizedSubprocessEnv(parent);
    expect(result.HOME).toBe("/home/test");
    expect(Object.prototype.hasOwnProperty.call(result, "PATH")).toBe(false);
  });

  it("additions override parent values for the same key", () => {
    const result = buildSanitizedSubprocessEnv({ HOME: "/parent-home" }, { HOME: "/override" });
    expect(result.HOME).toBe("/override");
  });
});
