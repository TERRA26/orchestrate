import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { WorkLogEntry } from "~/session-logic";
import { CompactActivityRow } from "./CompactActivityRow";

const BASE_WORK_ENTRY = {
  id: "activity-1",
  createdAt: "2026-04-29T00:00:00.000Z",
  label: "tool call",
  tone: "tool",
} satisfies WorkLogEntry;

function renderCompactActivityRow(workEntry: Partial<WorkLogEntry>) {
  return renderToStaticMarkup(
    <CompactActivityRow
      workEntry={{
        ...BASE_WORK_ENTRY,
        ...workEntry,
      }}
    />,
  );
}

describe("CompactActivityRow", () => {
  it.each([
    {
      toolName: "orchestrate_accept_work",
      expected: "Reviewing evidence",
      forbidden: "accept work",
    },
    {
      toolName: "orchestrate_spawn_agent",
      expected: "Started worker",
      forbidden: "spawn agent",
    },
    {
      toolName: "orchestrate_wait_agent",
      expected: "Waiting",
      forbidden: "wait agent",
    },
    {
      toolName: "orchestrate_review_agent_work",
      expected: "Reviewing evidence",
      forbidden: "review agent work",
    },
  ])("renders $toolName with a semantic label", ({ toolName, expected, forbidden }) => {
    const markup = renderCompactActivityRow({
      toolName,
      workerId: "worker_12345678",
    });

    expect(markup).toContain(expected);
    expect(markup).toContain("@12345678");
    expect(markup).not.toContain("orchestrate_");
    expect(markup.toLowerCase()).not.toContain(forbidden);
  });

  it("does not leak unknown raw orchestration tool names", () => {
    const markup = renderCompactActivityRow({
      toolName: "orchestrate_unknown_future_tool",
      label: "tool call",
    });

    expect(markup).toContain("tool call");
    expect(markup).not.toContain("orchestrate_");
    expect(markup.toLowerCase()).not.toContain("unknown future tool");
  });
});
