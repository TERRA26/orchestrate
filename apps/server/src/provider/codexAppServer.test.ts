import { describe, expect, it } from "vitest";

import { buildProbeCodexEnv } from "./codexAppServer.ts";

describe("buildProbeCodexEnv (ORC-012)", () => {
  it("strips ORCHESTRATE_* server-private secrets from the codex subprocess env", () => {
    const env = buildProbeCodexEnv({
      HOME: "/home/test",
      PATH: "/usr/bin",
      ORCHESTRATE_AUTH_TOKEN: "leak-this",
      ORCHESTRATE_DB_URL: "postgres://leak",
      ORCHESTRATE_PARENT_THREAD_ID: "thread-abc",
    });
    expect(env.HOME).toBe("/home/test");
    expect(env.PATH).toBe("/usr/bin");
    expect(env.ORCHESTRATE_AUTH_TOKEN).toBeUndefined();
    expect(env.ORCHESTRATE_DB_URL).toBeUndefined();
    expect(env.ORCHESTRATE_PARENT_THREAD_ID).toBeUndefined();
  });

  it("keeps CODEX_* and provider prefixes the codex SDK needs", () => {
    const env = buildProbeCodexEnv({
      CODEX_HOME: "/parent/codex-home",
      CODEX_AUTH: "session-cookie",
      ANTHROPIC_API_KEY: "real-key",
      OPENAI_API_KEY: "real-key",
    });
    expect(env.CODEX_HOME).toBe("/parent/codex-home");
    expect(env.CODEX_AUTH).toBe("session-cookie");
    expect(env.ANTHROPIC_API_KEY).toBe("real-key");
    expect(env.OPENAI_API_KEY).toBe("real-key");
  });

  it("strips arbitrary cloud cred prefixes", () => {
    const env = buildProbeCodexEnv({
      AWS_ACCESS_KEY_ID: "leak",
      GOOGLE_APPLICATION_CREDENTIALS: "/path/leak.json",
      DATABASE_URL: "postgres://leak",
    });
    expect(env.AWS_ACCESS_KEY_ID).toBeUndefined();
    expect(env.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it("injects an explicit CODEX_HOME override when homePath is provided", () => {
    const env = buildProbeCodexEnv({ HOME: "/home/test", CODEX_HOME: "/inherited" }, "/explicit");
    expect(env.CODEX_HOME).toBe("/explicit");
  });

  it("preserves the inherited CODEX_HOME when no homePath override is provided", () => {
    const env = buildProbeCodexEnv({ HOME: "/home/test", CODEX_HOME: "/inherited" });
    expect(env.CODEX_HOME).toBe("/inherited");
  });
});
