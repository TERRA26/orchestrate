// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ChatThreadLoadingShell } from "./ChatThreadLoadingShell";

/**
 * Pins the thread-hydration loading shell introduced by ORC-177.
 *
 * @see ORC-177
 */

describe("ChatThreadLoadingShell (ORC-177)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders with role=status and aria-busy so assistive tech announces it", () => {
    render(<ChatThreadLoadingShell threadId="thread-abc" />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.getAttribute("aria-live")).toBe("polite");
  });

  it("displays a 'Loading thread...' label", () => {
    render(<ChatThreadLoadingShell threadId="thread-abc" />);
    expect(screen.getByText(/Loading thread\.\.\./i)).not.toBeNull();
  });

  it("includes the threadId in a screen-reader-only message for debugging", () => {
    render(<ChatThreadLoadingShell threadId="thread-deadbeef" />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("thread-deadbeef");
  });

  it("renders multiple Skeleton placeholders so the layout does not jump on hydration", () => {
    render(<ChatThreadLoadingShell threadId="thread-abc" />);
    const status = screen.getByRole("status");
    const skeletons = status.querySelectorAll("[data-slot='skeleton']");
    expect(skeletons.length).toBeGreaterThanOrEqual(5);
  });

  it("uses a stable test-id so route-level tests can assert the loading branch", () => {
    render(<ChatThreadLoadingShell threadId="thread-abc" />);
    expect(screen.getByTestId("chat-thread-loading-shell")).not.toBeNull();
  });
});
