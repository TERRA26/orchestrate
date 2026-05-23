// FILE: benchmarksStore.ts
// Purpose: Persist benchmark runs (prompt + expected output + captured answer + score).
// Layer: Benchmarks view-model state

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type BenchmarkStatus = "draft" | "complete";

export interface BenchmarkRun {
  id: string;
  name: string;
  prompt: string;
  expected: string;
  output: string;
  model: string;
  threadId: string | null;
  score: number | null;
  status: BenchmarkStatus;
  createdAt: string;
  updatedAt: string;
  source?: string;
  sourceMetadata?: Record<string, string>;
}

export interface BenchmarkCreateInput {
  id?: string;
  name?: string;
  prompt: string;
  expected?: string;
  model?: string;
  source?: string;
  sourceMetadata?: Record<string, string>;
}

interface BenchmarksStoreState {
  benchmarks: BenchmarkRun[];
  createBenchmark: (input: BenchmarkCreateInput) => string;
  createBenchmarksBulk: (inputs: ReadonlyArray<BenchmarkCreateInput>) => string[];
  updateBenchmark: (
    id: string,
    patch: Partial<Pick<BenchmarkRun, "name" | "prompt" | "expected" | "output" | "model">>,
  ) => void;
  recordOutput: (id: string, output: string) => void;
  scoreBenchmark: (id: string) => void;
  attachThread: (id: string, threadId: string) => void;
  deleteBenchmark: (id: string) => void;
}

const BENCHMARKS_STORE_STORAGE_KEY = "orchestrate:benchmarks:v2";

function randomBenchmarkId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
}

function nowIso(): string {
  return new Date().toISOString();
}

function trimBenchmarkName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function nextBenchmarkName(
  benchmarks: readonly BenchmarkRun[],
  excludeBenchmarkId?: string | undefined,
): string {
  const takenNames = new Set(
    benchmarks
      .filter((benchmark) => benchmark.id !== excludeBenchmarkId)
      .map((benchmark) => benchmark.name.toLowerCase()),
  );
  let index = 1;
  while (true) {
    const candidate = `Benchmark ${index}`;
    if (!takenNames.has(candidate.toLowerCase())) {
      return candidate;
    }
    index += 1;
  }
}

function substringScore(expected: string, output: string): number {
  const normalizedExpected = expected.trim().toLowerCase();
  if (normalizedExpected.length === 0) {
    return 0;
  }
  return output.toLowerCase().includes(normalizedExpected) ? 1 : 0;
}

interface StarterBenchmarkSeed {
  id: string;
  name: string;
  prompt: string;
  expected: string;
}

const STARTER_BENCHMARK_SEEDS: readonly StarterBenchmarkSeed[] = [
  {
    id: "starter-web-of-lies",
    name: "Web of Lies — liar's paradox",
    prompt:
      'Assume each person either always tells the truth or always lies. Alice says: "I always lie." Can Alice be telling the truth? Think step by step, then put your final answer in **bold** as a single word (yes or no).',
    expected: "no",
  },
  {
    id: "starter-arithmetic",
    name: "Arithmetic — product",
    prompt:
      "Compute 17 × 23. Show your reasoning briefly, then put your final numeric answer in **bold**.",
    expected: "391",
  },
  {
    id: "starter-crt",
    name: "Reasoning — CRT bat and ball",
    prompt:
      "A bat and a ball cost $1.10 total. The bat costs $1.00 more than the ball. How much does the ball cost in dollars? Put your final numeric answer in **bold** (e.g., **$0.XX**).",
    expected: "0.05",
  },
  {
    id: "starter-instruction",
    name: "Instruction following — Europe rivers",
    prompt:
      "List exactly three rivers located in Europe. Format your reply as a single comma-separated line with nothing else. Include the Danube.",
    expected: "danube",
  },
];

function createStarterBenchmarks(): BenchmarkRun[] {
  const createdAt = nowIso();
  return STARTER_BENCHMARK_SEEDS.map((seed) => ({
    id: seed.id,
    name: seed.name,
    prompt: seed.prompt,
    expected: seed.expected,
    output: "",
    model: "",
    threadId: null,
    score: null,
    status: "draft" as const,
    createdAt,
    updatedAt: createdAt,
  }));
}

export const useBenchmarksStore = create<BenchmarksStoreState>()(
  persist(
    (set) => ({
      benchmarks: createStarterBenchmarks(),
      createBenchmark: (input) => {
        const id = input.id ?? randomBenchmarkId();
        set((state) => {
          const createdAt = nowIso();
          const run: BenchmarkRun = {
            id,
            name: trimBenchmarkName(input.name ?? "") || nextBenchmarkName(state.benchmarks),
            prompt: input.prompt,
            expected: input.expected ?? "",
            output: "",
            model: input.model ?? "",
            threadId: null,
            score: null,
            status: "draft",
            createdAt,
            updatedAt: createdAt,
            ...(input.source !== undefined ? { source: input.source } : {}),
            ...(input.sourceMetadata !== undefined ? { sourceMetadata: input.sourceMetadata } : {}),
          };
          return { benchmarks: [run, ...state.benchmarks] };
        });
        return id;
      },
      createBenchmarksBulk: (inputs) => {
        const createdIds: string[] = [];
        set((state) => {
          const createdAt = nowIso();
          const existingIds = new Set(state.benchmarks.map((benchmark) => benchmark.id));
          const newRuns: BenchmarkRun[] = [];
          const workingBenchmarks = [...state.benchmarks];
          for (const input of inputs) {
            const candidateId = input.id ?? randomBenchmarkId();
            if (existingIds.has(candidateId)) {
              continue;
            }
            existingIds.add(candidateId);
            const run: BenchmarkRun = {
              id: candidateId,
              name: trimBenchmarkName(input.name ?? "") || nextBenchmarkName(workingBenchmarks),
              prompt: input.prompt,
              expected: input.expected ?? "",
              output: "",
              model: input.model ?? "",
              threadId: null,
              score: null,
              status: "draft",
              createdAt,
              updatedAt: createdAt,
              ...(input.source !== undefined ? { source: input.source } : {}),
              ...(input.sourceMetadata !== undefined
                ? { sourceMetadata: input.sourceMetadata }
                : {}),
            };
            workingBenchmarks.unshift(run);
            newRuns.push(run);
            createdIds.push(candidateId);
          }
          return { benchmarks: [...newRuns, ...state.benchmarks] };
        });
        return createdIds;
      },
      updateBenchmark: (id, patch) =>
        set((state) => ({
          benchmarks: state.benchmarks.map((benchmark) => {
            if (benchmark.id !== id) {
              return benchmark;
            }
            return {
              ...benchmark,
              ...patch,
              name:
                patch.name !== undefined
                  ? trimBenchmarkName(patch.name) || nextBenchmarkName(state.benchmarks, id)
                  : benchmark.name,
              updatedAt: nowIso(),
            };
          }),
        })),
      recordOutput: (id, output) =>
        set((state) => ({
          benchmarks: state.benchmarks.map((benchmark) =>
            benchmark.id === id ? { ...benchmark, output, updatedAt: nowIso() } : benchmark,
          ),
        })),
      scoreBenchmark: (id) =>
        set((state) => ({
          benchmarks: state.benchmarks.map((benchmark) => {
            if (benchmark.id !== id) {
              return benchmark;
            }
            const score = substringScore(benchmark.expected, benchmark.output);
            return {
              ...benchmark,
              score,
              status: "complete",
              updatedAt: nowIso(),
            };
          }),
        })),
      attachThread: (id, threadId) =>
        set((state) => ({
          benchmarks: state.benchmarks.map((benchmark) =>
            benchmark.id === id ? { ...benchmark, threadId, updatedAt: nowIso() } : benchmark,
          ),
        })),
      deleteBenchmark: (id) =>
        set((state) => ({
          benchmarks: state.benchmarks.filter((benchmark) => benchmark.id !== id),
        })),
    }),
    {
      name: BENCHMARKS_STORE_STORAGE_KEY,
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ benchmarks: state.benchmarks }),
    },
  ),
);
