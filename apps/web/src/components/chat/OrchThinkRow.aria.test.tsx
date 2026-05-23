// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { OrchThinkRow } from "./WorkEntryRow";

/**
 * Pins the aria-live announcement on the orchestrator "thinking"
 * status row introduced by ORC-251. Worker state transitions
 * (Waiting on agent -> Agent ready, Reviewing -> Review complete,
 * etc.) must reach screen reader users.
 *
 * @see ORC-251
 */

describe("OrchThinkRow aria-live (ORC-251)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders role=status with aria-live=polite and aria-atomic=true", () => {
    render(<OrchThinkRow label="Waiting on agent" isLoading={true} />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.getAttribute("aria-atomic")).toBe("true");
  });

  it("displays the label inside the status region", () => {
    render(<OrchThinkRow label="Agent ready" isLoading={false} />);
    expect(screen.getByRole("status").textContent).toContain("Agent ready");
  });

  it("hides the loading spinner svg from assistive tech", () => {
    render(<OrchThinkRow label="Waiting on agent" isLoading={true} />);
    const status = screen.getByRole("status");
    const svg = status.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("hides the success check glyph from assistive tech", () => {
    render(<OrchThinkRow label="Agent ready" isLoading={false} />);
    const status = screen.getByRole("status");
    const check = status.querySelector(".orch-think-check");
    expect(check?.getAttribute("aria-hidden")).toBe("true");
  });

  it("survives a label transition (announce-on-change pattern)", () => {
    const { rerender } = render(<OrchThinkRow label="Waiting on agent" isLoading={true} />);
    expect(screen.getByRole("status").textContent).toContain("Waiting on agent");

    // Simulate the worker transitioning to "ready" state.
    rerender(<OrchThinkRow label="Agent ready" isLoading={false} />);
    expect(screen.getByRole("status").textContent).toContain("Agent ready");
    expect(screen.getByRole("status").textContent).not.toContain("Waiting on agent");
  });
});
