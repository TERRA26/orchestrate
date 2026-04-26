import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import BenchmarksDetailView from "~/components/benchmarks/BenchmarksDetailView";
import { useBenchmarksStore } from "~/benchmarksStore";

function BenchmarksDetailRouteView() {
  const navigate = useNavigate();
  const { runId } = Route.useParams();
  const benchmark = useBenchmarksStore((state) =>
    state.benchmarks.find((entry) => entry.id === runId),
  );
  const hasAnyBenchmarks = useBenchmarksStore((state) => state.benchmarks.length > 0);

  useEffect(() => {
    if (benchmark || !hasAnyBenchmarks) {
      return;
    }
    void navigate({ to: "/benchmarks", replace: true });
  }, [benchmark, hasAnyBenchmarks, navigate]);

  if (!benchmark) {
    return null;
  }

  return <BenchmarksDetailView benchmarkId={benchmark.id} />;
}

export const Route = createFileRoute("/_chat/benchmarks/$runId")({
  component: BenchmarksDetailRouteView,
});
