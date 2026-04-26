// FILE: SwebenchImportDialog.tsx
// Purpose: Browse and bulk-import SWE-bench Verified tasks (pulled live from HuggingFace).
// Layer: Benchmarks route surface

import { useMemo, useState } from "react";

import { type BenchmarkCreateInput, useBenchmarksStore } from "~/benchmarksStore";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Spinner } from "~/components/ui/spinner";
import {
  type SwebenchRow,
  swebenchBenchmarkId,
  swebenchBenchmarkName,
  swebenchPrompt,
  swebenchSourceMetadata,
  useSwebenchRows,
} from "~/lib/swebenchApi";
import { cn } from "~/lib/utils";

const MAX_ROWS = 500;
const ALL_REPOS = "__all__";
const ALL_DIFFICULTIES = "__all__";

function createInputForRow(row: SwebenchRow): BenchmarkCreateInput {
  return {
    id: swebenchBenchmarkId(row),
    name: swebenchBenchmarkName(row),
    prompt: swebenchPrompt(row),
    expected: "",
    source: "swebench-verified",
    sourceMetadata: swebenchSourceMetadata(row),
  };
}

interface SwebenchImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (ids: string[]) => void;
}

export default function SwebenchImportDialog({
  open,
  onOpenChange,
  onImported,
}: SwebenchImportDialogProps) {
  const [repoFilter, setRepoFilter] = useState<string>(ALL_REPOS);
  const [difficultyFilter, setDifficultyFilter] = useState<string>(ALL_DIFFICULTIES);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());

  const benchmarks = useBenchmarksStore((state) => state.benchmarks);
  const existingIds = useMemo(
    () => new Set(benchmarks.map((benchmark) => benchmark.id)),
    [benchmarks],
  );
  const createBenchmarksBulk = useBenchmarksStore((state) => state.createBenchmarksBulk);

  const rowsQuery = useSwebenchRows(MAX_ROWS);

  const repos = useMemo(() => {
    const set = new Set<string>();
    for (const row of rowsQuery.data ?? []) {
      set.add(row.repo);
    }
    return Array.from(set).toSorted();
  }, [rowsQuery.data]);

  const difficulties = useMemo(() => {
    const set = new Set<string>();
    for (const row of rowsQuery.data ?? []) {
      if (row.difficulty && row.difficulty.length > 0) {
        set.add(row.difficulty);
      }
    }
    return Array.from(set).toSorted();
  }, [rowsQuery.data]);

  const filteredRows = useMemo(() => {
    const rows = rowsQuery.data ?? [];
    return rows.filter((row) => {
      if (repoFilter !== ALL_REPOS && row.repo !== repoFilter) return false;
      if (difficultyFilter !== ALL_DIFFICULTIES && row.difficulty !== difficultyFilter)
        return false;
      return true;
    });
  }, [rowsQuery.data, repoFilter, difficultyFilter]);

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const row of filteredRows) {
        next.add(swebenchBenchmarkId(row));
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleImport = () => {
    const inputs: BenchmarkCreateInput[] = [];
    for (const row of rowsQuery.data ?? []) {
      const id = swebenchBenchmarkId(row);
      if (!selectedIds.has(id)) continue;
      if (existingIds.has(id)) continue;
      inputs.push(createInputForRow(row));
    }
    if (inputs.length === 0) return;
    const created = createBenchmarksBulk(inputs);
    setSelectedIds(new Set());
    onImported(created);
  };

  const selectedCount = selectedIds.size;
  const importableCount = useMemo(() => {
    let count = 0;
    for (const id of selectedIds) {
      if (!existingIds.has(id)) count += 1;
    }
    return count;
  }, [selectedIds, existingIds]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import from SWE-Bench Verified</DialogTitle>
          <DialogDescription>
            Real GitHub bug-fix tasks. The prompt bundles the repo, commit, problem statement, and
            the tests that must pass. Auto-scoring requires Docker and is not yet wired — grade the
            orchestrator output manually for now.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Repository</span>
              <Select value={repoFilter} onValueChange={setRepoFilter}>
                <SelectTrigger className="w-56" aria-label="SWE-Bench repo">
                  <SelectValue>{repoFilter === ALL_REPOS ? "All repos" : repoFilter}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="start" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value={ALL_REPOS}>
                    All repos
                  </SelectItem>
                  {repos.map((repo) => (
                    <SelectItem hideIndicator key={repo} value={repo}>
                      {repo}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Difficulty</span>
              <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
                <SelectTrigger className="w-48" aria-label="SWE-Bench difficulty">
                  <SelectValue>
                    {difficultyFilter === ALL_DIFFICULTIES ? "All" : difficultyFilter}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="start" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value={ALL_DIFFICULTIES}>
                    All
                  </SelectItem>
                  {difficulties.map((d) => (
                    <SelectItem hideIndicator key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              {rowsQuery.isLoading && (
                <span className="inline-flex items-center gap-1.5">
                  <Spinner className="size-3.5" /> Loading…
                </span>
              )}
              {rowsQuery.isError && (
                <span className="text-destructive-foreground">Failed to load</span>
              )}
              {rowsQuery.isSuccess && (
                <span>
                  {filteredRows.length} of {rowsQuery.data?.length ?? 0} shown
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={selectAllFiltered}>
                Select visible
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                disabled={selectedCount === 0}
              >
                Clear
              </Button>
            </div>
            <span>
              {selectedCount} selected · {importableCount} new
            </span>
          </div>

          <div className="max-h-[50vh] overflow-auto rounded-lg border border-border/60">
            {rowsQuery.isLoading ? (
              <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
                Fetching SWE-Bench Verified tasks…
              </div>
            ) : rowsQuery.isError ? (
              <div className="p-4 text-xs text-destructive-foreground">
                Could not reach huggingface.co/datasets-server. Check your network and retry.
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground">No tasks match this filter.</div>
            ) : (
              <ul className="divide-y divide-border/40">
                {filteredRows.map((row) => {
                  const id = swebenchBenchmarkId(row);
                  const checked = selectedIds.has(id);
                  const alreadyImported = existingIds.has(id);
                  return (
                    <li key={id}>
                      <label
                        className={cn(
                          "flex w-full items-start gap-3 px-3 py-2 text-left transition-colors cursor-pointer",
                          alreadyImported ? "opacity-60 cursor-not-allowed" : "hover:bg-accent/40",
                          checked && !alreadyImported && "bg-accent/40",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked || alreadyImported}
                          disabled={alreadyImported}
                          onChange={() => toggleRow(id)}
                          className="mt-1 size-3.5 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                          aria-label={`Select ${row.instance_id}`}
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-medium text-foreground">{row.repo}</span>
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {row.instance_id}
                            </span>
                            {row.difficulty && (
                              <span className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {row.difficulty}
                              </span>
                            )}
                            {alreadyImported && (
                              <span className="rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[10px] text-emerald-600">
                                already imported
                              </span>
                            )}
                          </div>
                          <p className="line-clamp-3 text-xs text-muted-foreground">
                            {row.problem_statement.slice(0, 260)}
                            {row.problem_statement.length > 260 ? "…" : ""}
                          </p>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={importableCount === 0} onClick={handleImport}>
            Import {importableCount > 0 ? importableCount : ""}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
