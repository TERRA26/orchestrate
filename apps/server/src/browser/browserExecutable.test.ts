import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  isMissingPlaywrightBrowserExecutableError,
  resolveFallbackChromiumExecutablePath,
} from "./browserExecutable.ts";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("browserExecutable", () => {
  it("detects a missing Playwright browser executable error", () => {
    expect(
      isMissingPlaywrightBrowserExecutableError(
        new Error("browserType.launch: Executable doesn't exist at /tmp/browser"),
      ),
    ).toBe(true);
    expect(isMissingPlaywrightBrowserExecutableError(new Error("Other launch failure"))).toBe(
      false,
    );
  });

  it("picks the newest available Chromium executable from the local cache", async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), "playwright-cache-"));
    tempDirectories.push(cacheRoot);

    const olderChromium = join(
      cacheRoot,
      "chromium-1169",
      "chrome-mac",
      "Chromium.app",
      "Contents",
      "MacOS",
      "Chromium",
    );
    await mkdir(dirname(olderChromium), { recursive: true });
    await writeFile(olderChromium, "");

    const newerHeadlessShell = join(
      cacheRoot,
      "chromium_headless_shell-1208",
      "chrome-mac",
      "headless_shell",
    );
    await mkdir(dirname(newerHeadlessShell), { recursive: true });
    await writeFile(newerHeadlessShell, "");

    await expect(
      resolveFallbackChromiumExecutablePath({
        cacheRoots: [cacheRoot],
      }),
    ).resolves.toBe(newerHeadlessShell);
  });
});
