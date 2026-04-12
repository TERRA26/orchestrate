import { defineConfig, mergeConfig } from "vitest/config";

import baseConfig from "../../vitest.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      // Server tests exercise real git + sqlite + provider orchestration flows,
      // so the default 15s cap is too aggressive under whole-suite load.
      testTimeout: 120_000,
      hookTimeout: 120_000,
    },
  }),
);
