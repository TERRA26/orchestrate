import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  acquireDatabaseLock,
  acquireDatabaseLockOrThrow,
} from "./dbProcessLock";

/**
 * Pins the per-process database lock introduced by ORC-196.
 *
 * @see ORC-196
 */

describe("acquireDatabaseLock (ORC-196)", () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "orc-196-test-"));
    dbPath = path.join(tempDir, "state.sqlite");
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  it("creates a sentinel file with the current PID on first acquire", () => {
    const result = acquireDatabaseLock(dbPath, { pid: 12345 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.sentinelPath).toBe(dbPath + ".lock");
    expect(existsSync(result.sentinelPath)).toBe(true);
    expect(readFileSync(result.sentinelPath, "utf-8").trim()).toBe("12345");

    result.release();
    expect(existsSync(result.sentinelPath)).toBe(false);
  });

  it("refuses a second acquire while the first PID is alive", () => {
    const first = acquireDatabaseLock(dbPath, {
      pid: 11111,
      isProcessAlive: () => true,
    });
    expect(first.ok).toBe(true);

    const second = acquireDatabaseLock(dbPath, {
      pid: 22222,
      isProcessAlive: () => true,
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe("held-by-live-process");
    expect(second.heldByPid).toBe(11111);
  });

  it("reclaims a stale sentinel when the recorded PID is dead", () => {
    // Pre-write a sentinel for a "dead" PID.
    writeFileSync(dbPath + ".lock", "99999");

    const result = acquireDatabaseLock(dbPath, {
      pid: 33333,
      isProcessAlive: () => false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(readFileSync(result.sentinelPath, "utf-8").trim()).toBe("33333");
  });

  it("reclaims when sentinel is malformed (non-numeric)", () => {
    writeFileSync(dbPath + ".lock", "not a number");

    const result = acquireDatabaseLock(dbPath, {
      pid: 44444,
      isProcessAlive: () => true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(readFileSync(result.sentinelPath, "utf-8").trim()).toBe("44444");
  });

  it("supports overriding the sentinel path explicitly", () => {
    const customPath = path.join(tempDir, "custom-lock.txt");
    const result = acquireDatabaseLock(dbPath, {
      pid: 55555,
      sentinelPath: customPath,
      isProcessAlive: () => true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sentinelPath).toBe(customPath);
    expect(existsSync(customPath)).toBe(true);
  });

  it("release() removes the sentinel and a subsequent acquire succeeds", () => {
    const first = acquireDatabaseLock(dbPath, { pid: 66666 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    first.release();

    const second = acquireDatabaseLock(dbPath, { pid: 77777 });
    expect(second.ok).toBe(true);
  });
});

describe("acquireDatabaseLockOrThrow (ORC-196)", () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "orc-196-throw-"));
    dbPath = path.join(tempDir, "state.sqlite");
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  it("throws with a clear message when held-by-live-process", () => {
    acquireDatabaseLock(dbPath, { pid: 11111, isProcessAlive: () => true });
    expect(() =>
      acquireDatabaseLockOrThrow(dbPath, {
        pid: 22222,
        isProcessAlive: () => true,
      }),
    ).toThrow(/held by live process 11111/);
  });

  it("returns the lock object on success", () => {
    const handle = acquireDatabaseLockOrThrow(dbPath, { pid: 88888 });
    expect(typeof handle.sentinelPath).toBe("string");
    expect(typeof handle.release).toBe("function");
    handle.release();
  });
});
