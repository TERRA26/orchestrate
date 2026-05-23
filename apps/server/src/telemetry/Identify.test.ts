import {
  chmodSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { validateRestrictedConfigFile } from "./Identify";

/**
 * Pins the restricted-config-file integrity check introduced by ORC-187.
 *
 * @see ORC-187
 */

describe("validateRestrictedConfigFile (ORC-187)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "orc-187-test-"));
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  it("accepts a regular file owned by the current uid with mode 0o600", () => {
    const file = path.join(tempDir, "auth.json");
    writeFileSync(file, "{}", { mode: 0o600 });

    const result = validateRestrictedConfigFile(file);
    expect(result.ok).toBe(true);
  });

  it("rejects a missing file", () => {
    const result = validateRestrictedConfigFile(
      path.join(tempDir, "does-not-exist.json"),
    );
    expect(result.ok).toBe(false);
    expect(typeof result.reason).toBe("string");
  });

  it("rejects a symlink even if the link target is owned by the current uid", () => {
    const target = path.join(tempDir, "real.json");
    writeFileSync(target, "{}", { mode: 0o600 });

    const link = path.join(tempDir, "link.json");
    symlinkSync(target, link);

    const result = validateRestrictedConfigFile(link);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("not-a-regular-file");
  });

  it("rejects a directory passed as a config-file path", () => {
    const dir = path.join(tempDir, "dir");
    require("node:fs").mkdirSync(dir, { mode: 0o700 });
    const result = validateRestrictedConfigFile(dir);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("not-a-regular-file");
  });

  it("rejects a file with mode 0o644 (group/world readable)", () => {
    const file = path.join(tempDir, "open.json");
    writeFileSync(file, "{}", { mode: 0o644 });
    chmodSync(file, 0o644);
    const result = validateRestrictedConfigFile(file);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("mode-too-permissive");
  });

  it("rejects a file with mode 0o640 (group readable)", () => {
    const file = path.join(tempDir, "group.json");
    writeFileSync(file, "{}", { mode: 0o600 });
    chmodSync(file, 0o640);
    const result = validateRestrictedConfigFile(file);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("mode-too-permissive");
  });

  it("accepts mode 0o400 (read-only owner)", () => {
    const file = path.join(tempDir, "ro.json");
    writeFileSync(file, "{}", { mode: 0o600 });
    chmodSync(file, 0o400);
    const result = validateRestrictedConfigFile(file);
    expect(result.ok).toBe(true);
  });

  it("returns an ok result on platforms without getuid (best-effort)", () => {
    // On Windows or in environments without getuid, the helper still
    // performs the lstat + mode check. We can't unit-test the !getuid
    // branch without monkey-patching, but we can confirm the file
    // case still passes.
    const file = path.join(tempDir, "auth.json");
    writeFileSync(file, "{}", { mode: 0o600 });
    const result = validateRestrictedConfigFile(file);
    expect(result.ok).toBe(true);
  });
});
