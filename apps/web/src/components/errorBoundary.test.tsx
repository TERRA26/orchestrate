// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Pins the error-boundary contract for ORC-218.
 *
 * The codebase has three React error boundaries:
 *  - OrchestratorErrorBoundary (outer, OrchestratorPanel.tsx)
 *  - CodeHighlightErrorBoundary (inner, ChatMarkdown.tsx)
 *  - HighlightErrorBoundary (inner, FileWrittenRow.tsx)
 *
 * The original bug filing claimed errors could "render twice or not
 * at all" when both inner and outer boundaries were active. This test
 * pins the actual React contract: the nearest boundary catches first,
 * does NOT re-throw, and the outer boundary therefore never sees the
 * error.
 *
 * @see ORC-218
 */

interface InnerProps {
  fallback: React.ReactNode;
  children: React.ReactNode;
}

class InnerBoundary extends React.Component<InnerProps, { hasError: boolean }> {
  override state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  innerCaught = false;
  override componentDidCatch(): void {
    this.innerCaught = true;
  }
  override render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

interface OuterProps {
  children: React.ReactNode;
}

class OuterBoundary extends React.Component<
  OuterProps,
  { error: Error | null }
> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  outerCaught = false;
  override componentDidCatch(): void {
    this.outerCaught = true;
  }
  override render() {
    if (this.state.error) {
      return <div data-testid="outer-fallback">outer caught: {this.state.error.message}</div>;
    }
    return this.props.children;
  }
}

function ExplodingChild({ when }: { when: boolean }): React.ReactElement {
  if (when) {
    throw new Error("kaboom");
  }
  return <span data-testid="child-ok">ok</span>;
}

describe("error boundary contract (ORC-218)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("inner boundary catches its subtree's error and shows its fallback", () => {
    // Suppress React's expected-error console.error for the throw.
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <OuterBoundary>
        <InnerBoundary fallback={<div data-testid="inner-fallback">inner</div>}>
          <ExplodingChild when={true} />
        </InnerBoundary>
      </OuterBoundary>,
    );

    expect(screen.queryByTestId("inner-fallback")).not.toBeNull();
    // Outer boundary fallback must NOT have rendered.
    expect(screen.queryByTestId("outer-fallback")).toBeNull();
  });

  it("outer boundary catches errors raised OUTSIDE the inner boundary subtree", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <OuterBoundary>
        <InnerBoundary fallback={<div data-testid="inner-fallback">inner</div>}>
          <span>safe child</span>
        </InnerBoundary>
        <ExplodingChild when={true} />
      </OuterBoundary>,
    );

    expect(screen.queryByTestId("outer-fallback")).not.toBeNull();
    // Inner boundary did NOT trigger because the error was outside its subtree.
    expect(screen.queryByTestId("inner-fallback")).toBeNull();
  });

  it("inner boundary stops the error; outer never observes it (no double-handling)", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const refs: { outer: OuterBoundary | null; inner: InnerBoundary | null } = {
      outer: null,
      inner: null,
    };
    render(
      <OuterBoundary
        ref={(r: OuterBoundary | null) => {
          refs.outer = r;
        }}
      >
        <InnerBoundary
          ref={(r: InnerBoundary | null) => {
            refs.inner = r;
          }}
          fallback={<div data-testid="inner-fallback">inner</div>}
        >
          <ExplodingChild when={true} />
        </InnerBoundary>
      </OuterBoundary>,
    );

    // The inner boundary's componentDidCatch fired exactly once.
    expect(refs.inner?.innerCaught).toBe(true);
    // The outer boundary's componentDidCatch did NOT fire (error
    // never propagated past the inner boundary).
    expect(refs.outer?.outerCaught).toBe(false);
  });

  it("renders normally when no child throws", () => {
    render(
      <OuterBoundary>
        <InnerBoundary fallback={<div>inner</div>}>
          <ExplodingChild when={false} />
        </InnerBoundary>
      </OuterBoundary>,
    );
    expect(screen.queryByTestId("child-ok")).not.toBeNull();
  });
});
