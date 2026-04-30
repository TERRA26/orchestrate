import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OrchestrationToolCallCard } from "./OrchestrationToolCallCard";

describe("OrchestrationToolCallCard", () => {
  it("renders orchestration tools with semantic visible labels", () => {
    const markup = renderToStaticMarkup(
      <OrchestrationToolCallCard
        toolName="orchestrate_spawn_agent"
        input={{ task: "Implement settings screen" }}
        result={{ workerId: "worker_12345678", threadId: "thread_12345678" }}
      />,
    );

    expect(markup).toContain("Started worker");
    expect(markup).toContain("Tool details");
    expect(markup).toContain("orchestrate_spawn_agent");
    expect(markup).not.toContain('class="orch-spawn-tool">orchestrate_spawn_agent');
  });
});
