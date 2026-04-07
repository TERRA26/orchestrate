import { access, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const BROWSER_CACHE_DIR_PATTERN = /^(chromium|chromium_headless_shell)-(\d+)$/;
const EXECUTABLE_BASENAMES = new Set([
  "Chromium",
  "chrome",
  "chrome.exe",
  "chrome-headless-shell",
  "chrome-headless-shell.exe",
  "headless_shell",
  "headless_shell.exe",
]);

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function compareBrowserCacheDirectories(a: string, b: string): number {
  const matchA = BROWSER_CACHE_DIR_PATTERN.exec(a);
  const matchB = BROWSER_CACHE_DIR_PATTERN.exec(b);
  const versionA = matchA ? Number(matchA[2]) : 0;
  const versionB = matchB ? Number(matchB[2]) : 0;
  if (versionA !== versionB) {
    return versionB - versionA;
  }
  const prefersHeadlessA = a.startsWith("chromium_headless_shell-");
  const prefersHeadlessB = b.startsWith("chromium_headless_shell-");
  if (prefersHeadlessA === prefersHeadlessB) {
    return a.localeCompare(b);
  }
  return prefersHeadlessA ? -1 : 1;
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function findBrowserExecutableInDirectory(
  directory: string,
  remainingDepth: number,
): Promise<string | null> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    const candidatePath = path.join(directory, entry.name);
    if (entry.isFile() && EXECUTABLE_BASENAMES.has(entry.name)) {
      return candidatePath;
    }
  }

  if (remainingDepth <= 0) {
    return null;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const nested = await findBrowserExecutableInDirectory(
      path.join(directory, entry.name),
      remainingDepth - 1,
    );
    if (nested) {
      return nested;
    }
  }

  return null;
}

export function isMissingPlaywrightBrowserExecutableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Executable doesn't exist at");
}

function resolveBrowserCacheRootsFromEnvironment(): string[] {
  const roots: string[] = [];
  const configuredPlaywrightPath = process.env.PLAYWRIGHT_BROWSERS_PATH?.trim();
  if (configuredPlaywrightPath && configuredPlaywrightPath !== "0") {
    roots.push(configuredPlaywrightPath);
  }

  const home = homedir();
  if (home.length > 0) {
    roots.push(path.join(home, "Library", "Caches", "ms-playwright"));
    roots.push(path.join(home, ".cache", "ms-playwright"));
  }
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA?.trim();
    if (localAppData) {
      roots.push(path.join(localAppData, "ms-playwright"));
    }
  }

  return unique(roots);
}

export async function resolveFallbackChromiumExecutablePath(options?: {
  cacheRoots?: string[];
}): Promise<string | null> {
  const cacheRoots = options?.cacheRoots?.length
    ? unique(options.cacheRoots)
    : resolveBrowserCacheRootsFromEnvironment();

  for (const cacheRoot of cacheRoots) {
    if (!(await pathExists(cacheRoot))) {
      continue;
    }

    let entries;
    try {
      entries = await readdir(cacheRoot, { withFileTypes: true });
    } catch {
      continue;
    }

    const browserDirectories = entries
      .filter((entry) => entry.isDirectory() && BROWSER_CACHE_DIR_PATTERN.test(entry.name))
      .map((entry) => entry.name)
      .toSorted(compareBrowserCacheDirectories);

    for (const browserDirectory of browserDirectories) {
      const executablePath = await findBrowserExecutableInDirectory(
        path.join(cacheRoot, browserDirectory),
        5,
      );
      if (executablePath) {
        return executablePath;
      }
    }
  }

  return null;
}
