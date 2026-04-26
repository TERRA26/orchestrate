// FILE: BenchmarksDetailView.tsx
// Purpose: Edit a benchmark's prompt/expected, record the model output, and compute a score.
// Layer: Benchmarks route surface

import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { useBenchmarksStore } from "~/benchmarksStore";
import { Button } from "~/components/ui/button";
import { SidebarInset, SidebarTrigger } from "~/components/ui/sidebar";
import { Textarea } from "~/components/ui/textarea";
import { ArrowLeftIcon, FlaskConicalIcon, Trash2 } from "~/lib/icons";
import { cn } from "~/lib/utils";

export default function BenchmarksDetailView({ benchmarkId }: { benchmarkId: string }) {
  const navigate = useNavigate();
  const benchmark = useBenchmarksStore((state) =>
    state.benchmarks.find((entry) => entry.id === benchmarkId),
  );
  const updateBenchmark = useBenchmarksStore((state) => state.updateBenchmark);
  const recordOutput = useBenchmarksStore((state) => state.recordOutput);
  const scoreBenchmark = useBenchmarksStore((state) => state.scoreBenchmark);
  const deleteBenchmark = useBenchmarksStore((state) => state.deleteBenchmark);

  const [output, setOutput] = useState(benchmark?.output ?? "");

  const initialOutput = benchmark?.output ?? "";
  const isOutputDirty = output !== initialOutput;

  const scoreDisplay = useMemo(() => {
    if (!benchmark || benchmark.score === null) {
      return null;
    }
    return benchmark.score > 0 ? "Pass (1.0)" : "Fail (0.0)";
  }, [benchmark]);

  if (!benchmark) {
    return null;
  }

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background isolate">
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
          <SidebarTrigger className="size-7 shrink-0 md:hidden" />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back to benchmarks"
            onClick={() => void navigate({ to: "/benchmarks" })}
          >
            <ArrowLeftIcon className="size-4" />
          </Button>
          <div className="flex flex-1 items-center gap-2">
            <FlaskConicalIcon className="size-4 text-muted-foreground" />
            <input
              value={benchmark.name}
              onChange={(event) => updateBenchmark(benchmark.id, { name: event.target.value })}
              className="flex-1 bg-transparent font-heading text-base font-semibold tracking-tight outline-none"
            />
            {scoreDisplay && (
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                  (benchmark.score ?? 0) > 0
                    ? "bg-emerald-500/12 text-emerald-600"
                    : "bg-rose-500/12 text-rose-600",
                )}
              >
                {scoreDisplay}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete benchmark"
            onClick={() => {
              deleteBenchmark(benchmark.id);
              void navigate({ to: "/benchmarks" });
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-auto px-4 py-6 sm:px-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {benchmark.source === "swebench-verified" && benchmark.sourceMetadata && (
              <SwebenchMetadataSection metadata={benchmark.sourceMetadata} />
            )}
            <section className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Prompt</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void navigator.clipboard.writeText(benchmark.prompt)}
                >
                  Copy prompt
                </Button>
              </div>
              <Textarea
                value={benchmark.prompt}
                onChange={(event) => updateBenchmark(benchmark.id, { prompt: event.target.value })}
                size="lg"
              />
            </section>

            <section className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Expected answer</p>
              <Textarea
                value={benchmark.expected}
                onChange={(event) =>
                  updateBenchmark(benchmark.id, { expected: event.target.value })
                }
                size="sm"
                placeholder="Used for substring scoring"
              />
            </section>

            <section className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Model (free-form)</p>
              <input
                value={benchmark.model}
                onChange={(event) => updateBenchmark(benchmark.id, { model: event.target.value })}
                placeholder="e.g. claude-opus-4-7"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/16"
              />
            </section>

            <section className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Model output</p>
                <div className="flex items-center gap-2">
                  {isOutputDirty && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => recordOutput(benchmark.id, output)}
                    >
                      Save output
                    </Button>
                  )}
                  <Button
                    size="sm"
                    disabled={output.trim().length === 0 || benchmark.expected.trim().length === 0}
                    onClick={() => {
                      if (isOutputDirty) {
                        recordOutput(benchmark.id, output);
                      }
                      scoreBenchmark(benchmark.id);
                    }}
                  >
                    Score
                  </Button>
                </div>
              </div>
              <Textarea
                value={output}
                onChange={(event) => setOutput(event.target.value)}
                placeholder="Paste the orchestrator's response here"
                size="lg"
              />
              <p className="text-[11px] text-muted-foreground">
                {benchmark.source === "swebench-verified"
                  ? "SWE-Bench requires running hidden pytest cases inside a Docker image. Auto-scoring isn't wired yet — grade manually by reviewing the patch."
                  : "Scoring is substring-match (case-insensitive). A more rigorous scorer can be wired in when we integrate LiveBench's Python judges."}
              </p>
            </section>
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}

function SwebenchMetadataSection({ metadata }: { metadata: Record<string, string> }) {
  const repo = metadata.repo ?? "";
  const instanceId = metadata.instanceId ?? "";
  const baseCommit = metadata.baseCommit ?? "";
  const difficulty = metadata.difficulty ?? "";
  const failToPass = parseTestList(metadata.failToPass ?? "");
  const passToPass = parseTestList(metadata.passToPass ?? "");
  const goldPatch = metadata.goldPatch ?? "";
  const [goldExpanded, setGoldExpanded] = useState(false);

  return (
    <section className="rounded-lg border border-border/60 bg-muted/10 p-4 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          SWE-Bench Verified
        </p>
        {difficulty && (
          <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
            {difficulty}
          </span>
        )}
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <span className="text-muted-foreground">Repo</span>
        <a
          href={`https://github.com/${repo}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-foreground hover:underline"
        >
          {repo}
        </a>
        <span className="text-muted-foreground">Instance</span>
        <span className="font-mono text-foreground">{instanceId}</span>
        <span className="text-muted-foreground">Base commit</span>
        {repo && baseCommit ? (
          <a
            href={`https://github.com/${repo}/tree/${baseCommit}`}
            target="_blank"
            rel="noreferrer"
            className="truncate font-mono text-foreground hover:underline"
          >
            {baseCommit}
          </a>
        ) : (
          <span className="truncate font-mono text-foreground">{baseCommit}</span>
        )}
      </div>
      {failToPass.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-muted-foreground">Tests that must pass after the fix</p>
          <ul className="list-disc space-y-0.5 pl-4 font-mono text-[11px] text-foreground">
            {failToPass.slice(0, 10).map((test) => (
              <li key={test} className="break-all">
                {test}
              </li>
            ))}
            {failToPass.length > 10 && (
              <li className="list-none text-muted-foreground">+{failToPass.length - 10} more</li>
            )}
          </ul>
        </div>
      )}
      {passToPass.length > 0 && (
        <p className="mt-3 text-muted-foreground">
          Plus {passToPass.length} regression tests that must still pass.
        </p>
      )}
      {goldPatch && (
        <div className="mt-3">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setGoldExpanded((prev) => !prev)}
          >
            {goldExpanded ? "Hide" : "Show"} gold patch ({goldPatch.split("\n").length} lines)
          </button>
          {goldExpanded && (
            <pre className="mt-2 max-h-60 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-[11px] text-foreground">
              {goldPatch}
            </pre>
          )}
        </div>
      )}
    </section>
  );
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
