import { describe, expect, it } from "vitest";
import { ThreadId } from "@orchestrate/contracts";

import { SETTINGS_THREAD_ID } from "./settingsThreadId";

/**
 * Pins the SETTINGS_THREAD_ID sentinel introduced by ORC-260. The
 * settings panel reuses TraitsPicker but has no real thread; the
 * sentinel removes a load-bearing `as unknown as ThreadId` cast.
 *
 * @see ORC-260
 */
describe("SETTINGS_THREAD_ID (ORC-260)", () => {
  it("equals the literal 'settings' at runtime", () => {
    expect(SETTINGS_THREAD_ID).toBe("settings");
  });

  it("is type-assignable to ThreadId without a cast", () => {
    // If the import returned a plain string the next line would
    // fail at compile time. Wrapping in a function ensures the
    // type-check is exercised as a real assignment, not just a
    // declaration.
    const accept = (id: ThreadId): ThreadId => id;
    const result = accept(SETTINGS_THREAD_ID);
    expect(result).toBe(SETTINGS_THREAD_ID);
  });

  it("is non-empty so it cannot be confused with an unset thread", () => {
    expect(SETTINGS_THREAD_ID.length).toBeGreaterThan(0);
  });
});
