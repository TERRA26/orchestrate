// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("~/components/ChatMarkdown", () => ({
  default: ({ text }: { text: string }) => <p>{text}</p>,
}));

import { DecisionCard } from "./OrchestratorBlockRenderer";

describe("DecisionCard", () => {
  it("does not expose delegation implementation labels in the orchestrator chat", () => {
    const markup = renderToStaticMarkup(
      <DecisionCard
        decision={{
          type: "delegated",
          reason: "Hey! What would you like to work on?",
          createdAt: "2026-05-09T03:25:12.000Z",
        }}
      />,
    );

    expect(markup).not.toContain("Delegated");
    expect(markup).toContain("Hey! What would you like to work on?");
  });
});
