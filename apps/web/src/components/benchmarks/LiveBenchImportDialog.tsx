// FILE: LiveBenchImportDialog.tsx
// Purpose: Browse and bulk-import LiveBench questions (pulled live from HuggingFace) as benchmarks.
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
  LIVEBENCH_CATEGORIES,
  LIVEBENCH_CATEGORY_LABELS,
  type LiveBenchCategory,
  type LiveBenchRow,
  benchmarkNameFromRow,
  extractPromptFromRow,
  useLivebenchRows,
} from "~/lib/livebenchApi";
import { cn } from "~/lib/utils";

const MAX_ROWS_PER_CATEGORY = 400;
const ALL_TASKS = "__all__";

function benchmarkIdForRow(row: LiveBenchRow): string {
  return `livebench:${row.category}:${row.question_id}`;
}

function createInputForRow(row: LiveBenchRow): BenchmarkCreateInput {
  return {
    id: benchmarkIdForRow(row),
    name: benchmarkNameFromRow(row),
    prompt: extractPromptFromRow(row),
    expected: row.ground_truth,
  };
}

interface LiveBenchImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (ids: string[]) => void;
}

export default function LiveBenchImportDialog({
  open,
  onOpenChange,
  onImported,
}: LiveBenchImportDialogProps) {
  const [category, setCategory] = useState<LiveBenchCategory>("reasoning");
  const [taskFilter, setTaskFilter] = useState<string>(ALL_TASKS);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());

  const benchmarks = useBenchmarksStore((state) => state.benchmarks);
  const existingIds = useMemo(
    () => new Set(benchmarks.map((benchmark) => benchmark.id)),
    [benchmarks],
  );
  const createBenchmarksBulk = useBenchmarksStore((state) => state.createBenchmarksBulk);

  const rowsQuery = useLivebenchRows(category, MAX_ROWS_PER_CATEGORY);

  const tasksForCategory = useMemo(() => {
    const tasks = new Set<string>();
    for (const row of rowsQuery.data ?? []) {
      tasks.add(row.task);
    }
    return Array.from(tasks).toSorted();
  }, [rowsQuery.data]);

  const filteredRows = useMemo(() => {
    const rows = rowsQuery.data ?? [];
    if (taskFilter === ALL_TASKS) {
      return rows;
    }
    return rows.filter((row) => row.task === taskFilter);
  }, [rowsQuery.data, taskFilter]);

  const handleCategoryChange = (next: string | null) => {
    if (!next) return;
    if ((LIVEBENCH_CATEGORIES as readonly string[]).includes(next)) {
      setCategory(next as LiveBenchCategory);
      setTaskFilter(ALL_TASKS);
      setSelectedIds(new Set());
    }
  };
  const handleTaskFilterChange = (next: string | null) => {
    if (next) setTaskFilter(next);
  };

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
        next.add(benchmarkIdForRow(row));
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleImport = () => {
    const inputs: BenchmarkCreateInput[] = [];
    for (const row of rowsQuery.data ?? []) {
      const id = benchmarkIdForRow(row);
      if (!selectedIds.has(id)) {
        continue;
      }
      if (existingIds.has(id)) {
        continue;
      }
      inputs.push(createInputForRow(row));
    }
    if (inputs.length === 0) {
      return;
    }
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
          <DialogTitle>Import from LiveBench</DialogTitle>
          <DialogDescription>
            Questions are fetched live from the LiveBench HuggingFace datasets. Select any number of
            questions and import them as benchmarks.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Category</span>
              <Select value={category} onValueChange={handleCategoryChange}>
                <SelectTrigger className="w-48" aria-label="LiveBench category">
                  <SelectValue>{LIVEBENCH_CATEGORY_LABELS[category]}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="start" alignItemWithTrigger={false}>
                  {LIVEBENCH_CATEGORIES.map((cat) => (
                    <SelectItem hideIndicator key={cat} value={cat}>
                      {LIVEBENCH_CATEGORY_LABELS[cat]}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Task</span>
              <Select value={taskFilter} onValueChange={handleTaskFilterChange}>
                <SelectTrigger
                  className="w-56"
                  aria-label="LiveBench task"
                  disabled={tasksForCategory.length === 0}
                >
                  <SelectValue>
                    {taskFilter === ALL_TASKS ? "All tasks" : taskFilter.replace(/_/g, " ")}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="start" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value={ALL_TASKS}>
                    All tasks
                  </SelectItem>
                  {tasksForCategory.map((task) => (
                    <SelectItem hideIndicator key={task} value={task}>
                      {task.replace(/_/g, " ")}
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
                Fetching questions…
              </div>
            ) : rowsQuery.isError ? (
              <div className="p-4 text-xs text-destructive-foreground">
                Could not reach huggingface.co/datasets-server. Check your network and retry.
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground">
                No questions match this filter.
              </div>
            ) : (
              <ul className="divide-y divide-border/40">
                {filteredRows.map((row) => {
                  const id = benchmarkIdForRow(row);
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
                          aria-label={`Select ${row.task} question`}
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-medium text-foreground">
                              {row.task.replace(/_/g, " ")}
                            </span>
                            <span className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              level {row.level}
                            </span>
                            {alreadyImported && (
                              <span className="rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[10px] text-emerald-600">
                                already imported
                              </span>
                            )}
                          </div>
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {row.turns[0]?.slice(0, 220) ?? ""}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground/80">
                            <span className="font-medium">answer:</span>{" "}
                            <span className="font-mono">{row.ground_truth.slice(0, 120)}</span>
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
