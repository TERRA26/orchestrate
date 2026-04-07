import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { APP_DISPLAY_NAME } from "~/branding";
import { LearnAiExperience as LearnAiExperienceContent } from "~/components/LearnAiExperience";

export const Route = createFileRoute("/learn-ai")({
  component: LearnAiRouteView,
  head: () => ({
    meta: [{ name: "title", content: `Discover AI · ${APP_DISPLAY_NAME}` }],
  }),
});

function LearnAiRouteView() {
  const navigate = useNavigate();

  return <LearnAiExperienceContent onOpenWorkspace={() => navigate({ to: "/" })} />;
}
