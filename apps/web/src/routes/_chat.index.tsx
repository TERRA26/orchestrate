import { createFileRoute } from "@tanstack/react-router";

import { OrchestratorPanel } from "../components/OrchestratorPanel";

function ChatIndexRouteView() {
  return <OrchestratorPanel />;
}

export const Route = createFileRoute("/_chat/")({
  component: ChatIndexRouteView,
});
