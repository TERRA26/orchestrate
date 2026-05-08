// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RouteNotFoundShell } from "../components/RouteNotFoundShell";

/**
 * Pins the not-found shell rendered for unknown URLs (ORC-175).
 *
 * @see ORC-175
 */

describe("RouteNotFoundShell (ORC-175)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the heading 'Page not found.'", () => {
    render(
      <RouteNotFoundShell
        pathname="/does-not-exist"
        onGoHome={() => {}}
        onGoBack={() => {}}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Page not found.",
    );
  });

  it("displays the offending pathname inside a code element", () => {
    render(
      <RouteNotFoundShell
        pathname="/projects/abc/threads/xyz"
        onGoHome={() => {}}
        onGoBack={() => {}}
      />,
    );
    const code = screen
      .getByRole("alert")
      .querySelector("code");
    expect(code?.textContent).toBe("/projects/abc/threads/xyz");
  });

  it("invokes onGoHome when the 'Go home' button is clicked", () => {
    const onGoHome = vi.fn();
    render(
      <RouteNotFoundShell
        pathname="/x"
        onGoHome={onGoHome}
        onGoBack={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /go home/i }));
    expect(onGoHome).toHaveBeenCalledTimes(1);
  });

  it("invokes onGoBack when the 'Go back' button is clicked", () => {
    const onGoBack = vi.fn();
    render(
      <RouteNotFoundShell
        pathname="/x"
        onGoHome={() => {}}
        onGoBack={onGoBack}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /go back/i }));
    expect(onGoBack).toHaveBeenCalledTimes(1);
  });

  it("uses role=alert so the error is announced to assistive tech", () => {
    render(
      <RouteNotFoundShell
        pathname="/y"
        onGoHome={() => {}}
        onGoBack={() => {}}
      />,
    );
    expect(screen.getByRole("alert")).not.toBeNull();
  });
});
