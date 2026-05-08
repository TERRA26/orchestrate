// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { WorkEntryRow } from "./WorkEntryRow";
import type { WorkLogEntry } from "../../session-logic";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const baseSpawnEntry: WorkLogEntry = {
  id: "work-1",
  createdAt: "2026-04-09T12:00:00.000Z",
  label: "spawn agent",
  tone: "thinking",
  toolName: "orchestrate_spawn_agent",
  toolTitle: "Build CRUD endpoints",
  detail: "Build CRUD endpoints for users",
};

describe("WorkEntryRow elapsed-time indicator (ORC-109)", () => {
  it("renders a working timer for a still-running spawn entry", () => {
    const startedAtMs = Date.parse(baseSpawnEntry.createdAt);
    vi.useFakeTimers();
    vi.setSystemTime(startedAtMs + 12_000);

    const { container } = render(<WorkEntryRow workEntry={baseSpawnEntry} />);
    const timer = container.querySelector("[data-working-timer]");
    expect(timer).not.toBeNull();
    expect(timer?.textContent).toContain("12s");
  });

  it("does not render a working timer when the spawn entry is completed", () => {
    const completed: WorkLogEntry = { ...baseSpawnEntry, tone: "tool" };
    const { container } = render(<WorkEntryRow workEntry={completed} />);
    expect(container.querySelector("[data-working-timer]")).toBeNull();
  });

  it("renders a working timer for a still-running review entry", () => {
    const reviewEntry: WorkLogEntry = {
      id: "work-2",
      createdAt: "2026-04-09T12:00:00.000Z",
      label: "review agent work",
      tone: "thinking",
      toolName: "orchestrate_review_agent_work",
      toolTitle: "Reviewing agent work",
      detail: "Reviewing recent agent output",
    };
    const startedAtMs = Date.parse(reviewEntry.createdAt);
    vi.useFakeTimers();
    vi.setSystemTime(startedAtMs + 90_000);

    const { container } = render(<WorkEntryRow workEntry={reviewEntry} />);
    const timer = container.querySelector("[data-working-timer]");
    expect(timer).not.toBeNull();
    expect(timer?.textContent).toContain("1m 30s");
  });

  it("does not render a working timer when createdAt is missing", () => {
    const entryWithoutTime: WorkLogEntry = {
      ...baseSpawnEntry,
      createdAt: "",
    };
    const { container } = render(<WorkEntryRow workEntry={entryWithoutTime} />);
    expect(container.querySelector("[data-working-timer]")).toBeNull();
  });
});
