import { createFileRoute } from "@tanstack/react-router";

import BenchmarksListView from "~/components/benchmarks/BenchmarksListView";

function BenchmarksIndexRouteView() {
  return <BenchmarksListView />;
}

export const Route = createFileRoute("/_chat/benchmarks/")({
  component: BenchmarksIndexRouteView,
});
