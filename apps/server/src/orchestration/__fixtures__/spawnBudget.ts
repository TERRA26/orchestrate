import type { SpawnBudget } from "@orchestrate/contracts";

/**
 * Shared SpawnBudget fixture used by orchestration tests
 * (recovery.test, decider.orchestrator.test, and others). Extracted
 * to a single source of truth so a future schema change to
 * SpawnBudget surfaces as a single typecheck failure here rather
 * than as silent stale copies in each test.
 *
 * Tests that need a different shape (e.g., projector.orchestrator.test
 * uses lower numbers to exercise budget-exhaustion paths) keep their
 * own bespoke fixtures.
 *
 * @see ORC-268
 */
export const DEFAULT_SPAWN_BUDGET_FIXTURE: SpawnBudget = {
  maxDepth: 2,
  maxChildren: 5,
  maxConcurrentWriters: 3,
  maxTotalWorkers: 10,
  allowedTools: ["read", "write", "bash"],
  writeScope: ["src/**"],
};
