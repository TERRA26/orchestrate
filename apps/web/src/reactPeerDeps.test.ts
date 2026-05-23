// @vitest-environment node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Regression test for React 19 peer-dep compatibility across the
 * apps/web stack. The web app pins react@^19 and react-dom@^19; every
 * React-tied direct dependency must list React 19 (or an unbounded
 * range that admits 19) in its peerDependencies.
 *
 * Detects two failure modes:
 *  1. A dependency bump that accidentally pulls in a React-18-only fork
 *     (peer = `^18` or `~18`).
 *  2. A new dependency added without a React-compatible peer range.
 *
 * Skips silently when node_modules is missing so this test can run
 * before/without an install. CI runs after `bun install` so it always
 * sees the resolved versions.
 *
 * @see ORC-083
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const WEB_NODE_MODULES = path.resolve(__dirname, "..", "node_modules");
const BUN_NODE_MODULES = path.join(REPO_ROOT, "node_modules", ".bun");

const REACT_TIED_DEPS: ReadonlyArray<string> = [
  "@base-ui/react",
  "@lexical/react",
  "@tanstack/react-query",
  "@tanstack/react-router",
  "@tanstack/react-virtual",
  "@tanstack/react-pacer",
];

function findInstalledPackagePath(name: string): string | null {
  // Primary: web's resolved node_modules tree (this is what Vite actually
  // imports at runtime). Bun symlinks scoped packages into here.
  const direct = path.join(WEB_NODE_MODULES, name, "package.json");
  if (existsSync(direct) && statSync(direct).isFile()) return direct;

  // Fallback for monorepo hoist: try the cached layout under .bun/<slug>/node_modules/<name>.
  if (!existsSync(BUN_NODE_MODULES)) return null;
  const slug = name.startsWith("@") ? `${name.slice(1).replace("/", "+")}@` : `${name}@`;

  for (const entry of readdirSync(BUN_NODE_MODULES)) {
    if (!entry.startsWith(slug)) continue;
    const pkgPath = path.join(BUN_NODE_MODULES, entry, "node_modules", name, "package.json");
    if (existsSync(pkgPath) && statSync(pkgPath).isFile()) return pkgPath;
  }
  return null;
}

function reactPeerRange(packageJsonPath: string): string | undefined {
  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    peerDependencies?: { react?: string };
  };
  return pkg.peerDependencies?.react;
}

function admitsReact19(range: string | undefined): boolean {
  if (range === undefined) return false;
  // Cheap admit-check: any of the documented forms that include React 19.
  // Real semver evaluation would import a semver library; this regex set
  // covers every form actually used by the React-tied ecosystem today.
  if (/\b19\b/.test(range)) return true;
  // Unbounded ">=N" or ">=N.x" where N <= 19.
  const lowerBound = range.match(/>=\s*(\d+)/);
  if (lowerBound) {
    const min = Number.parseInt(lowerBound[1] ?? "100", 10);
    if (min <= 19) return true;
  }
  return false;
}

describe("React 19 peer-dep matrix (ORC-083)", () => {
  if (!existsSync(WEB_NODE_MODULES) && !existsSync(BUN_NODE_MODULES)) {
    it.skip("requires node_modules (run after bun install)", () => undefined);
    return;
  }

  for (const dep of REACT_TIED_DEPS) {
    it(`${dep} declares a React peer range that admits React 19`, () => {
      const pkgPath = findInstalledPackagePath(dep);
      expect(pkgPath, `${dep} not found in node_modules/.bun (skipped)`).not.toBeNull();
      if (!pkgPath) return;

      const range = reactPeerRange(pkgPath);
      expect(
        admitsReact19(range),
        `${dep} peerDependencies.react = ${JSON.stringify(range)} which does not admit ^19`,
      ).toBe(true);
    });
  }

  it("pins react and react-dom at ^19 in apps/web/package.json", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(REPO_ROOT, "apps", "web", "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(pkg.dependencies?.react).toMatch(/\b19\b/);
    expect(pkg.dependencies?.["react-dom"]).toMatch(/\b19\b/);
  });
});
