import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Pin the canonical Node engines.node string across the canonical
 * package.json files so the root and apps/server cannot drift again.
 *
 * Why this matters: prior state had root pinning `^24.13.1` while
 * apps/server tolerated `^22.16 || ^23.11 || >=24.10`. The marketing
 * app's Astro toolchain requires Node 22.12+ and bun's node:sqlite
 * builtin requires 22.5+, so the union of all current requirements is
 * the apps/server range. Keeping the root in sync with the server
 * prevents "engines field says X but the server actually wants Y" drift.
 *
 * @see ORC-082
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");

const CANONICAL_NODE_RANGE = "^22.16 || ^23.11 || >=24.10";

interface PackageWithEngines {
  readonly relativePath: string;
  readonly engines: { readonly node?: string; readonly bun?: string } | undefined;
}

function readPackage(relativePath: string): PackageWithEngines {
  const full = path.join(REPO_ROOT, relativePath);
  const json = JSON.parse(readFileSync(full, "utf8")) as {
    engines?: { readonly node?: string; readonly bun?: string };
  };
  return { relativePath, engines: json.engines };
}

describe("Node engines field consistency (ORC-082)", () => {
  it("root package.json declares the canonical Node range", () => {
    const root = readPackage("package.json");
    expect(root.engines?.node).toBe(CANONICAL_NODE_RANGE);
  });

  it("apps/server declares the canonical Node range (matching root)", () => {
    const server = readPackage("apps/server/package.json");
    expect(server.engines?.node).toBe(CANONICAL_NODE_RANGE);
  });

  it("the canonical range admits Node 22.16 (Astro requirement)", () => {
    // Sanity: the canonical range string contains a 22.x clause.
    expect(CANONICAL_NODE_RANGE).toMatch(/\^22\./);
  });

  it("the canonical range admits Node 24.10 (bun-sqlite + production target)", () => {
    expect(CANONICAL_NODE_RANGE).toMatch(/>=24\./);
  });

  it("workspace packages that declare engines.node match the canonical range", () => {
    // Every package in the monorepo that has its own engines.node must
    // use the canonical string. A package without engines.node falls
    // through to the root's value, which is fine.
    const workspaces = [
      "apps/server/package.json",
      "apps/web/package.json",
      "apps/marketing/package.json",
      "apps/desktop/package.json",
      "packages/contracts/package.json",
      "packages/shared/package.json",
      "scripts/package.json",
    ];

    for (const ws of workspaces) {
      const pkg = readPackage(ws);
      const node = pkg.engines?.node;
      if (node === undefined) continue;
      expect(node, `${ws} declares engines.node=${node} which differs from canonical`).toBe(
        CANONICAL_NODE_RANGE,
      );
    }
  });
});
