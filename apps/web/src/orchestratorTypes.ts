export type OrchestratorChecklistStatus = "pending" | "passed" | "failed";

export interface OrchestratorChecklistItem {
  id: string;
  label: string;
  status: OrchestratorChecklistStatus;
  notes: string | null;
}

export function countOrchestratorChecklistItems(items: ReadonlyArray<OrchestratorChecklistItem>): {
  pending: number;
  passed: number;
  failed: number;
} {
  let pending = 0;
  let passed = 0;
  let failed = 0;

  for (const item of items) {
    if (item.status === "passed") {
      passed += 1;
      continue;
    }
    if (item.status === "failed") {
      failed += 1;
      continue;
    }
    pending += 1;
  }

  return { pending, passed, failed };
}
