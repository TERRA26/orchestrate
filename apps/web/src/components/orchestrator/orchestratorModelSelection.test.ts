import { describe, expect, it } from "vitest";
import type { ServerProvider } from "@t3tools/contracts";

import { resolveRequestedWorkerModelSelection } from "./orchestratorModelSelection";

const providers: ReadonlyArray<ServerProvider> = [
  {
    provider: "codex",
    status: "ready",
    enabled: true,
    installed: true,
    version: null,
    auth: { status: "authenticated" },
    checkedAt: "2026-04-10T00:00:00.000Z",
    models: [
      {
        slug: "gpt-5.4",
        name: "GPT-5.4",
        isCustom: false,
        capabilities: null,
      },
      {
        slug: "gpt-5.4-mini",
        name: "GPT-5.4 Mini",
        isCustom: false,
        capabilities: null,
      },
    ],
  },
  {
    provider: "claudeAgent",
    status: "ready",
    enabled: true,
    installed: true,
    version: null,
    auth: { status: "authenticated" },
    checkedAt: "2026-04-10T00:00:00.000Z",
    models: [
      {
        slug: "claude-opus-4-6",
        name: "Claude Opus 4.6",
        isCustom: false,
        capabilities: null,
      },
      {
        slug: "claude-sonnet-4-6",
        name: "Claude Sonnet 4.6",
        isCustom: false,
        capabilities: null,
      },
    ],
  },
];

describe("resolveRequestedWorkerModelSelection", () => {
  it("returns null when the prompt does not request a specific provider", () => {
    expect(
      resolveRequestedWorkerModelSelection({
        userRequest: "Fix the tests and update the failing route.",
        providers,
        fallbackSelection: { provider: "codex", model: "gpt-5.4" },
      }),
    ).toBeNull();
  });

  it("detects explicit Claude requests and resolves the hinted model", () => {
    expect(
      resolveRequestedWorkerModelSelection({
        userRequest: "Have the worker use Claude Sonnet for this task.",
        providers,
        fallbackSelection: { provider: "codex", model: "gpt-5.4" },
      }),
    ).toEqual({
      requestedProvider: "claudeAgent",
      matchedModel: "claude-sonnet-4-6",
      selection: {
        provider: "claudeAgent",
        model: "claude-sonnet-4-6",
      },
    });
  });

  it("keeps remembered provider options when switching to an explicitly requested provider", () => {
    expect(
      resolveRequestedWorkerModelSelection({
        userRequest: "Use GPT-5.4 for the managed agent.",
        providers,
        fallbackSelection: { provider: "claudeAgent", model: "claude-opus-4-6" },
        storedModelSelections: {
          codex: {
            provider: "codex",
            model: "gpt-5.4-mini",
            options: { reasoningEffort: "xhigh" },
          },
        },
      }),
    ).toEqual({
      requestedProvider: "codex",
      matchedModel: "gpt-5.4",
      selection: {
        provider: "codex",
        model: "gpt-5.4",
        options: { reasoningEffort: "xhigh" },
      },
    });
  });
});
