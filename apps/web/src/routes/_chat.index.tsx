import { createFileRoute } from "@tanstack/react-router";

import { OrchestratorPanel } from "../components/OrchestratorPanel";

// `SidebarProvider` only sets `min-h-svh`, so children that rely on percentage
// heights (`h-full`) collapse to content height. Match the thread route's
// pattern by giving the panel an explicit `h-dvh` flex shell so the composer
// pins to the viewport bottom and the transcript area fills the gap.
function ChatIndexRouteView() {
  return (
    <div className="flex h-dvh min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
      <OrchestratorPanel />
    </div>
  );
}

export const Route = createFileRoute("/_chat/")({
  component: ChatIndexRouteView,
});
