// FILE: livebenchApi.ts
// Purpose: Fetch LiveBench questions from HuggingFace datasets-server for import.
// Layer: Client HTTP wrapper + react-query hooks

import { queryOptions, useQuery } from "@tanstack/react-query";

export const LIVEBENCH_CATEGORIES = [
  "reasoning",
  "math",
  "coding",
  "language",
  "data_analysis",
  "instruction_following",
] as const;

export type LiveBenchCategory = (typeof LIVEBENCH_CATEGORIES)[number];

export const LIVEBENCH_CATEGORY_LABELS: Record<LiveBenchCategory, string> = {
  reasoning: "Reasoning",
  math: "Math",
  coding: "Coding",
  language: "Language",
  data_analysis: "Data Analysis",
  instruction_following: "Instruction Following",
};

export interface LiveBenchRow {
  question_id: string;
  category: string;
  ground_truth: string;
  turns: string[];
  task: string;
  livebench_release_date: string;
  livebench_removal_date: string;
  level: number;
}

interface DatasetsServerRowsResponse {
  rows: Array<{ row_idx: number; row: LiveBenchRow }>;
  num_rows_total?: number;
  num_rows_per_page?: number;
}

interface DatasetsServerSizeResponse {
  size?: { dataset?: { num_rows?: number } };
}

const DATASETS_SERVER_BASE = "https://datasets-server.huggingface.co";
const ROWS_PAGE_SIZE = 100;

function datasetSlug(category: LiveBenchCategory): string {
  return `livebench/${category}`;
}

export async function fetchLivebenchSize(category: LiveBenchCategory): Promise<number> {
  const url = `${DATASETS_SERVER_BASE}/size?dataset=${encodeURIComponent(datasetSlug(category))}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load size for ${category}: ${response.status}`);
  }
  const body = (await response.json()) as DatasetsServerSizeResponse;
  return body.size?.dataset?.num_rows ?? 0;
}

export async function fetchLivebenchRows(
  category: LiveBenchCategory,
  offset: number,
  length: number = ROWS_PAGE_SIZE,
): Promise<{ rows: LiveBenchRow[]; total: number }> {
  const params = new URLSearchParams({
    dataset: datasetSlug(category),
    config: "default",
    split: "test",
    offset: String(offset),
    length: String(Math.min(length, ROWS_PAGE_SIZE)),
  });
  const url = `${DATASETS_SERVER_BASE}/rows?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load rows for ${category}: ${response.status}`);
  }
  const body = (await response.json()) as DatasetsServerRowsResponse;
  return {
    rows: body.rows.map((entry) => entry.row),
    total: body.num_rows_total ?? body.rows.length,
  };
}

export async function fetchAllLivebenchRows(
  category: LiveBenchCategory,
  maxRows: number = 500,
): Promise<LiveBenchRow[]> {
  const aggregated: LiveBenchRow[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  while (offset < total && aggregated.length < maxRows) {
    const batch = await fetchLivebenchRows(category, offset, ROWS_PAGE_SIZE);
    aggregated.push(...batch.rows);
    total = batch.total;
    if (batch.rows.length === 0) {
      break;
    }
    offset += batch.rows.length;
  }
  return aggregated.slice(0, maxRows);
}

export function livebenchSizeQueryOptions(category: LiveBenchCategory) {
  return queryOptions({
    queryKey: ["livebench", "size", category] as const,
    queryFn: () => fetchLivebenchSize(category),
    staleTime: 10 * 60 * 1000,
  });
}

export function livebenchRowsQueryOptions(category: LiveBenchCategory, maxRows: number = 500) {
  return queryOptions({
    queryKey: ["livebench", "rows", category, maxRows] as const,
    queryFn: () => fetchAllLivebenchRows(category, maxRows),
    staleTime: 10 * 60 * 1000,
  });
}

export function useLivebenchRows(category: LiveBenchCategory, maxRows?: number) {
  return useQuery(livebenchRowsQueryOptions(category, maxRows));
}

export function extractPromptFromRow(row: LiveBenchRow): string {
  return row.turns.join("\n\n");
}

export function benchmarkNameFromRow(row: LiveBenchRow): string {
  const taskLabel = row.task.replace(/_/g, " ");
  const preview = row.turns[0]?.slice(0, 60).replace(/\s+/g, " ").trim() ?? "";
  return `${taskLabel} — ${preview}${preview.length >= 60 ? "…" : ""}`;
}
