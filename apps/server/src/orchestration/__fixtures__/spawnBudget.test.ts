import { describe, expect, it } from "vitest";
import { Effect, Schema } from "effect";
import { SpawnBudget } from "@orchestrate/contracts";

import { DEFAULT_SPAWN_BUDGET_FIXTURE } from "./spawnBudget";

/**
 * Pins the shared SpawnBudget fixture introduced by ORC-268. The
 * fixture is the canonical default budget for orchestration tests
 * that do not need to exercise budget-exhaustion edges. If the
 * SpawnBudget schema gains or renames a required field, this
 * decode test fails immediately and every consuming test points
 * to the same place to fix.
 *
 * @see ORC-268
 */

describe("DEFAULT_SPAWN_BUDGET_FIXTURE (ORC-268)", () => {
  it("decodes successfully against the SpawnBudget schema", () => {
    const result = Effect.runSync(
      Schema.decodeUnknownEffect(SpawnBudget)(DEFAULT_SPAWN_BUDGET_FIXTURE).pipe(
        Effect.exit,
      ),
    );
    expect(result._tag).toBe("Success");
  });

  it("uses sane defaults that allow normal orchestration paths", () => {
    expect(DEFAULT_SPAWN_BUDGET_FIXTURE.maxDepth).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_SPAWN_BUDGET_FIXTURE.maxChildren).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_SPAWN_BUDGET_FIXTURE.maxTotalWorkers).toBeGreaterThanOrEqual(
      DEFAULT_SPAWN_BUDGET_FIXTURE.maxChildren,
    );
    expect(DEFAULT_SPAWN_BUDGET_FIXTURE.maxConcurrentWriters).toBeGreaterThanOrEqual(1);
  });

  it("includes the standard read/write/bash tool set", () => {
    expect(DEFAULT_SPAWN_BUDGET_FIXTURE.allowedTools).toEqual(
      expect.arrayContaining(["read", "write", "bash"]),
    );
  });

  it("scopes writes to a non-empty path pattern set", () => {
    expect(DEFAULT_SPAWN_BUDGET_FIXTURE.writeScope.length).toBeGreaterThan(0);
  });
});
