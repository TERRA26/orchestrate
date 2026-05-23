/**
 * Decomposition fixture corpus pinned by ORC-148.
 *
 * The orchestrator's task-decomposition logic is fully prompt-driven.
 * If the prompt drifts (a section is reordered, a heuristic is
 * silently relaxed), decompositions can change without any code or
 * test failing. This module captures a small corpus of canonical
 * `(userRequest, expectedDecomposition)` pairs so prompt drift is
 * detectable in CI.
 *
 * The actual "did the live orchestrator produce this?" comparison is
 * deferred to a future integration test that runs the orchestrator
 * against a deterministic provider (mock or canned-output). For now,
 * this file pins the EXPECTED decomposition shapes so:
 *
 *   1. A reviewer can read the fixture and judge whether the
 *      orchestrator's intended behavior on each input is correct.
 *   2. A future harness can iterate over `DECOMPOSITION_FIXTURES`
 *      and compare against live output.
 *   3. Structural tests in `decompositionFixtures.test.ts` verify
 *      that every fixture entry has consistent dependsOn references,
 *      non-empty acceptance criteria, and a coherent expected
 *      capability profile.
 *
 * @see ORC-148
 */

export type ExpectedTaskCapability =
  | "any"
  | "vision"
  | "browser"
  | "large-context"
  | "native-repo-navigation";

export interface ExpectedTask {
  /** Stable id within a single fixture entry. Referenced by dependsOn of later tasks. */
  readonly id: string;
  /** Imperative one-line title describing the deliverable. */
  readonly title: string;
  /** Ordered ids of tasks that must complete before this one starts. */
  readonly dependsOn: readonly string[];
  /** At least one acceptance criterion, each tagged per ORC-137. */
  readonly acceptanceCriteria: readonly string[];
  /** Required capability per the ORC-143 Capability Matrix. */
  readonly requiredCapability: ExpectedTaskCapability;
}

export interface DecompositionFixture {
  /** Stable fixture id. Referenced by tests. */
  readonly id: string;
  /** Verbatim user request that should drive the expected decomposition. */
  readonly userRequest: string;
  /**
   * Expected task list. Length 1 means the orchestrator should NOT
   * decompose. Length >1 means the orchestrator should decompose
   * into exactly this set of tasks (subject to the granularity
   * heuristic in ORC-146).
   */
  readonly expectedTasks: readonly ExpectedTask[];
  /**
   * Why this fixture is shaped the way it is. Reviewers use this to
   * decide whether a future change to the expected output is
   * intentional or a regression.
   */
  readonly rationale: string;
}

export const DECOMPOSITION_FIXTURES: readonly DecompositionFixture[] = [
  {
    id: "fix-001-single-task-folded",
    userRequest:
      "Add a formatCurrency helper, use it in the cart summary, and write a unit test.",
    rationale:
      "Three steps share writeScope (apps/web/src/lib/) and capabilities. Per ORC-146 granularity heuristic, fold into one task with three acceptance criteria.",
    expectedTasks: [
      {
        id: "t1",
        title: "Add formatCurrency helper, integrate in cart summary, with test",
        dependsOn: [],
        acceptanceCriteria: [
          "test: vitest run formatCurrency.test.ts shows 0 failures",
          "test: bun typecheck passes",
          "manual: cart summary uses formatCurrency for all monetary fields",
        ],
        requiredCapability: "any",
      },
    ],
  },
  {
    id: "fix-002-three-task-parallel-services",
    userRequest:
      "Migrate the auth, billing, and analytics services to the new logging library.",
    rationale:
      "Disjoint writeScopes (services/auth, services/billing, services/analytics), no dependsOn. Per ORC-146, splitting earns wall-clock parallelism.",
    expectedTasks: [
      {
        id: "auth",
        title: "Migrate services/auth to the new logging library",
        dependsOn: [],
        acceptanceCriteria: [
          "test: services/auth tests pass",
          "test: bun typecheck passes",
        ],
        requiredCapability: "any",
      },
      {
        id: "billing",
        title: "Migrate services/billing to the new logging library",
        dependsOn: [],
        acceptanceCriteria: [
          "test: services/billing tests pass",
          "test: bun typecheck passes",
        ],
        requiredCapability: "any",
      },
      {
        id: "analytics",
        title: "Migrate services/analytics to the new logging library",
        dependsOn: [],
        acceptanceCriteria: [
          "test: services/analytics tests pass",
          "test: bun typecheck passes",
        ],
        requiredCapability: "any",
      },
    ],
  },
  {
    id: "fix-003-capability-split-vision-after-edit",
    userRequest:
      "Refactor the SQL query and verify the new dashboard renders correctly.",
    rationale:
      "Two materially different capability profiles (code edit + vision/browser). Per ORC-143 Capability Matrix and ORC-146 granularity, split so each task matches its model.",
    expectedTasks: [
      {
        id: "refactor",
        title: "Refactor the SQL query in the dashboard backend",
        dependsOn: [],
        acceptanceCriteria: [
          "test: dashboard query unit tests pass",
          "test: bun typecheck passes",
        ],
        requiredCapability: "any",
      },
      {
        id: "verify",
        title: "Verify the dashboard renders correctly with the refactored query",
        dependsOn: ["refactor"],
        acceptanceCriteria: [
          "screenshot: dashboard top-row metrics match the pre-refactor screenshot",
        ],
        requiredCapability: "browser",
      },
    ],
  },
  {
    id: "fix-004-approval-gate-design-then-run",
    userRequest:
      "Design the schema migration, then run it on staging.",
    rationale:
      "User mid-approval gate per ORC-146. The design task must be approved by the user before the run task is spawned. The orchestrator must NOT chain these via dependsOn alone; it should pause for approval after the design task submits.",
    expectedTasks: [
      {
        id: "design",
        title: "Draft the schema migration with rollback plan",
        dependsOn: [],
        acceptanceCriteria: [
          "manual: migration plan documents schema delta, backfill, and rollback",
          "manual: user approves the proposed migration before run",
        ],
        requiredCapability: "any",
      },
      {
        id: "run",
        title: "Run the approved schema migration on staging",
        dependsOn: ["design"],
        acceptanceCriteria: [
          "test: migration runner exits 0 on staging",
          "manual: post-migration smoke check confirms expected row counts",
        ],
        requiredCapability: "any",
      },
    ],
  },
  {
    id: "fix-005-anti-pattern-over-decomposed-folded",
    userRequest:
      "Add the const, add the type, add the function, add the export, add the test, update the import in cart.tsx, run the test.",
    rationale:
      "Anti-pattern: 7 micro-steps all in the same file. Per ORC-146, fold into one task with one acceptance criterion that gates the test.",
    expectedTasks: [
      {
        id: "t1",
        title: "Add helper (const, type, function, export, test) and wire into cart.tsx",
        dependsOn: [],
        acceptanceCriteria: [
          "test: vitest run cart.test.ts shows 0 failures",
          "test: bun typecheck passes",
        ],
        requiredCapability: "any",
      },
    ],
  },
];
