// FILE: BenchmarksListView.tsx
// Purpose: List saved benchmark runs with their score and status.
// Layer: Benchmarks route surface

import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { type BenchmarkRun, useBenchmarksStore } from "~/benchmarksStore";
import LiveBenchImportDialog from "~/components/benchmarks/LiveBenchImportDialog";
import NewBenchmarkDialog from "~/components/benchmarks/NewBenchmarkDialog";
import SwebenchImportDialog from "~/components/benchmarks/SwebenchImportDialog";
import { Button } from "~/components/ui/button";
import { SidebarInset, SidebarTrigger } from "~/components/ui/sidebar";
import { FlaskConicalIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";

function formatRelativeDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function ScoreBadge({ run }: { run: BenchmarkRun }) {
  if (run.status === "draft") {
    return (
      <span className="inline-flex items-center rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        Draft
      </span>
    );
  }
  const passed = (run.score ?? 0) > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        passed ? "bg-emerald-500/12 text-emerald-600" : "bg-rose-500/12 text-rose-600",
      )}
    >
      {passed ? "Pass" : "Fail"}
    </span>
  );
}

export default function BenchmarksListView() {
  const navigate = useNavigate();
  const benchmarks = useBenchmarksStore((state) => state.benchmarks);
  const createBenchmark = useBenchmarksStore((state) => state.createBenchmark);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [swebenchOpen, setSwebenchOpen] = useState(false);

  const handleCreated = (id: string) => {
    setDialogOpen(false);
    void navigate({ to: "/benchmarks/$runId", params: { runId: id } });
  };

  const handleImported = () => {
    setImportOpen(false);
  };

  const handleSwebenchImported = () => {
    setSwebenchOpen(false);
  };

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background isolate">
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
          <SidebarTrigger className="size-7 shrink-0 md:hidden" />
          <div className="flex flex-1 items-center gap-2">
            <FlaskConicalIcon className="size-4 text-muted-foreground" />
            <h1 className="font-heading text-base font-semibold tracking-tight">Benchmarks</h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            Import from LiveBench
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSwebenchOpen(true)}>
            Import from SWE-Bench
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            New benchmark
          </Button>
        </div>

        <div className="flex-1 overflow-auto px-4 py-6 sm:px-6">
          {benchmarks.length === 0 ? (
            <div className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 bg-background/40 px-6 py-10 text-center">
              <FlaskConicalIcon className="size-6 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">No benchmark runs yet</p>
                <p className="text-xs text-muted-foreground">
                  Save a prompt and expected answer, run it through the orchestrator, and record the
                  score here.
                </p>
              </div>
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                Create your first benchmark
              </Button>
            </div>
          ) : (
            <ul className="mx-auto flex max-w-3xl flex-col gap-2">
              {benchmarks.map((run) => (
                <li key={run.id}>
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 rounded-lg border border-border/60 bg-background/40 px-4 py-3 text-left transition-colors hover:bg-accent/40"
                    onClick={() =>
                      void navigate({
                        to: "/benchmarks/$runId",
                        params: { runId: run.id },
                      })
                    }
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {run.name}
                        </span>
                        <ScoreBadge run={run} />
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {run.prompt.slice(0, 140) || "(no prompt)"}
                      </p>
                    </div>
                    <div className="shrink-0 text-[11px] text-muted-foreground">
                      {formatRelativeDate(run.updatedAt)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <NewBenchmarkDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreate={(input) => {
          const id = createBenchmark(input);
          handleCreated(id);
        }}
      />
      <LiveBenchImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={handleImported}
      />
      <SwebenchImportDialog
        open={swebenchOpen}
        onOpenChange={setSwebenchOpen}
        onImported={handleSwebenchImported}
      />
    </SidebarInset>
  );
}
