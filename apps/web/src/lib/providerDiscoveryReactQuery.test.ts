import { describe, expect, it } from "vitest";

import {
  providerComposerCapabilitiesQueryOptions,
  providerCommandsQueryOptions,
  providerDiscoveryQueryKeys,
  providerModelsQueryOptions,
  providerPluginsQueryOptions,
  providerReadPluginQueryOptions,
  providerSkillsQueryOptions,
} from "./providerDiscoveryReactQuery";

const FIVE_MINUTES = 5 * 60 * 1000;
const TWO_MINUTES = 2 * 60 * 1000;

describe("providerDiscoveryReactQuery (ORC-050)", () => {
  describe("queryKey stability", () => {
    it("returns the same key shape for capabilities across calls", () => {
      const a = providerDiscoveryQueryKeys.composerCapabilities("codex");
      const b = providerDiscoveryQueryKeys.composerCapabilities("codex");
      expect(a).toEqual(b);
      expect(a).toEqual(["provider-discovery", "composer-capabilities", "codex"]);
    });

    it("returns the same key for skills with identical inputs", () => {
      const a = providerDiscoveryQueryKeys.skills("codex", "/repo", "");
      const b = providerDiscoveryQueryKeys.skills("codex", "/repo", "");
      expect(a).toEqual(b);
    });

    it("differentiates skill keys by query string", () => {
      const a = providerDiscoveryQueryKeys.skills("codex", "/repo", "deploy");
      const b = providerDiscoveryQueryKeys.skills("codex", "/repo", "test");
      expect(a).not.toEqual(b);
    });

    it("differentiates plugin keys by cwd", () => {
      const a = providerDiscoveryQueryKeys.plugins("codex", "/repo-a");
      const b = providerDiscoveryQueryKeys.plugins("codex", "/repo-b");
      expect(a).not.toEqual(b);
    });

    it("treats null cwd as a distinct key from an explicit cwd", () => {
      const a = providerDiscoveryQueryKeys.plugins("codex", null);
      const b = providerDiscoveryQueryKeys.plugins("codex", "/repo");
      expect(a).not.toEqual(b);
    });
  });

  describe("staleTime is high enough to survive split-view remount churn", () => {
    it("composer capabilities stale at >= 5 minutes (essentially-static config)", () => {
      const opts = providerComposerCapabilitiesQueryOptions("codex");
      expect(opts.staleTime).toBeGreaterThanOrEqual(FIVE_MINUTES);
    });

    it("skills stale at >= 2 minutes (catalog rarely changes mid-session)", () => {
      const opts = providerSkillsQueryOptions({
        provider: "codex",
        cwd: "/repo",
        query: "",
      });
      expect(opts.staleTime).toBeGreaterThanOrEqual(TWO_MINUTES);
    });

    it("commands stale at >= 2 minutes", () => {
      const opts = providerCommandsQueryOptions({
        provider: "codex",
        cwd: "/repo",
        query: "",
      });
      expect(opts.staleTime).toBeGreaterThanOrEqual(TWO_MINUTES);
    });

    it("plugins stale at >= 2 minutes", () => {
      const opts = providerPluginsQueryOptions({ provider: "codex", cwd: "/repo" });
      expect(opts.staleTime).toBeGreaterThanOrEqual(TWO_MINUTES);
    });

    it("models stale at >= 5 minutes (model lists are basically immutable per session)", () => {
      const opts = providerModelsQueryOptions({ provider: "codex" });
      expect(opts.staleTime).toBeGreaterThanOrEqual(FIVE_MINUTES);
    });

    it("plugin read stale at >= 5 minutes", () => {
      const opts = providerReadPluginQueryOptions({
        provider: "codex",
        marketplacePath: "/path",
        pluginName: "x",
      });
      expect(opts.staleTime).toBeGreaterThanOrEqual(FIVE_MINUTES);
    });
  });

  describe("gcTime keeps cached results across unmount/remount cycles", () => {
    it("capabilities gcTime is at least 10 minutes", () => {
      const opts = providerComposerCapabilitiesQueryOptions("codex");
      expect(opts.gcTime).toBeGreaterThanOrEqual(10 * 60 * 1000);
    });

    it("skills gcTime is at least 5 minutes", () => {
      const opts = providerSkillsQueryOptions({
        provider: "codex",
        cwd: "/repo",
        query: "",
      });
      expect(opts.gcTime).toBeGreaterThanOrEqual(5 * 60 * 1000);
    });

    it("plugins gcTime is at least 5 minutes", () => {
      const opts = providerPluginsQueryOptions({ provider: "codex", cwd: "/repo" });
      expect(opts.gcTime).toBeGreaterThanOrEqual(5 * 60 * 1000);
    });
  });
});
