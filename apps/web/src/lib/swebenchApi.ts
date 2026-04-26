// FILE: swebenchApi.ts
// Purpose: Fetch SWE-bench Verified tasks from HuggingFace datasets-server for import.
// Layer: Client HTTP wrapper + react-query hooks

import { queryOptions, useQuery } from "@tanstack/react-query";

export interface SwebenchRow {
  repo: string;
  instance_id: string;
  base_commit: string;
  patch: string;
  test_patch: string;
  problem_statement: string;
  hints_text: string;
  created_at: string;
  version: string;
  FAIL_TO_PASS: string;
  PASS_TO_PASS: string;
  environment_setup_commit: string;
  difficulty: string;
}

interface DatasetsServerRowsResponse {
  rows: Array<{ row_idx: number; row: SwebenchRow }>;
  num_rows_total?: number;
  num_rows_per_page?: number;
}

const DATASETS_SERVER_BASE = "https://datasets-server.huggingface.co";
const DATASET_SLUG = "SWE-bench/SWE-bench_Verified";
const ROWS_PAGE_SIZE = 100;

export async function fetchSwebenchRows(
  offset: number,
  length: number = ROWS_PAGE_SIZE,
): Promise<{ rows: SwebenchRow[]; total: number }> {
  const params = new URLSearchParams({
    dataset: DATASET_SLUG,
    config: "default",
    split: "test",
    offset: String(offset),
    length: String(Math.min(length, ROWS_PAGE_SIZE)),
  });
  const url = `${DATASETS_SERVER_BASE}/rows?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load SWE-Bench rows: ${response.status}`);
  }
  const body = (await response.json()) as DatasetsServerRowsResponse;
  return {
    rows: body.rows.map((entry) => entry.row),
    total: body.num_rows_total ?? body.rows.length,
  };
}

export async function fetchAllSwebenchRows(maxRows: number = 500): Promise<SwebenchRow[]> {
  const aggregated: SwebenchRow[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  while (offset < total && aggregated.length < maxRows) {
    const batch = await fetchSwebenchRows(offset, ROWS_PAGE_SIZE);
    aggregated.push(...batch.rows);
    total = batch.total;
    if (batch.rows.length === 0) {
      break;
    }
    offset += batch.rows.length;
  }
  return aggregated.slice(0, maxRows);
}

export function swebenchRowsQueryOptions(maxRows: number = 500) {
  return queryOptions({
    queryKey: ["swebench", "rows", maxRows] as const,
    queryFn: () => fetchAllSwebenchRows(maxRows),
    staleTime: 10 * 60 * 1000,
  });
}

export function useSwebenchRows(maxRows?: number) {
  return useQuery(swebenchRowsQueryOptions(maxRows));
}

function parseTestList(raw: string): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed.length === 0) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((value): value is string => typeof value === "string");
    }
    return [];
  } catch {
    return trimmed
      .split(/[\n,]/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
}

export function swebenchPrompt(row: SwebenchRow): string {
  const header = [
    `Repository: ${row.repo}`,
    `Base commit: ${row.base_commit}`,
    `Instance: ${row.instance_id}`,
    row.version ? `Version: ${row.version}` : null,
    row.difficulty ? `Difficulty: ${row.difficulty}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const parts = [header, "", "## Problem statement", row.problem_statement.trim()];
  if (row.hints_text && row.hints_text.trim().length > 0) {
    parts.push("", "## Hints", row.hints_text.trim());
  }
  const failTests = parseTestList(row.FAIL_TO_PASS);
  if (failTests.length > 0) {
    parts.push(
      "",
      "## Tests that must pass after the fix",
      failTests.map((t) => `- ${t}`).join("\n"),
    );
  }
  parts.push(
    "",
    "Produce a patch in unified-diff format that resolves the issue. The patch will be validated against hidden test cases.",
  );
  return parts.join("\n");
}

export function swebenchBenchmarkId(row: SwebenchRow): string {
  return `swebench-verified:${row.instance_id}`;
}

export function swebenchBenchmarkName(row: SwebenchRow): string {
  return `${row.repo} — ${row.instance_id}`;
}

export function swebenchSourceMetadata(row: SwebenchRow): Record<string, string> {
  return {
    repo: row.repo,
    instanceId: row.instance_id,
    baseCommit: row.base_commit,
    difficulty: row.difficulty ?? "",
    version: row.version ?? "",
    failToPass: row.FAIL_TO_PASS ?? "",
    passToPass: row.PASS_TO_PASS ?? "",
    environmentSetupCommit: row.environment_setup_commit ?? "",
    goldPatch: row.patch ?? "",
  };
}
