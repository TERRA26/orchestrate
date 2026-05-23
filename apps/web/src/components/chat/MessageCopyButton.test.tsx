// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { MessageCopyButton } from "./MessageCopyButton";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("MessageCopyButton (ORC-102)", () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  it("renders with a copy title and the copy icon by default", () => {
    render(<MessageCopyButton text="hello" />);
    const button = screen.getByTitle("Copy message");
    expect(button).not.toBeNull();
    // Lucide icons render as <svg> with the icon name as data-* / aria-* hint.
    expect(button.querySelector("svg")).not.toBeNull();
  });

  it("invokes navigator.clipboard.writeText with the text prop on click", () => {
    render(<MessageCopyButton text="ship the fix" />);
    const button = screen.getByTitle("Copy message");
    fireEvent.click(button);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("ship the fix");
  });

  it("does not call writeText for empty text (the hook short-circuits)", () => {
    render(<MessageCopyButton text="" />);
    fireEvent.click(screen.getByTitle("Copy message"));
    expect(writeText).not.toHaveBeenCalled();
  });

  it("flips to the success state after a successful copy", async () => {
    render(<MessageCopyButton text="ok" />);
    const button = screen.getByTitle("Copy message");

    // The first render shows CopyIcon (not the success path). After the
    // promise resolves, isCopied flips and the icon swaps to CheckIcon
    // (which has the text-success utility class).
    fireEvent.click(button);
    // Allow the resolved promise's microtask to flush.
    await act(async () => {
      await Promise.resolve();
    });
    expect(button.querySelector(".text-success")).not.toBeNull();
  });

  it("returns to the default state after the timeout window elapses", async () => {
    vi.useFakeTimers();
    render(<MessageCopyButton text="ok" />);
    const button = screen.getByTitle("Copy message");
    fireEvent.click(button);
    await act(async () => {
      await Promise.resolve();
    });
    expect(button.querySelector(".text-success")).not.toBeNull();

    // Default timeout is 2000ms; advance past it.
    await act(async () => {
      vi.advanceTimersByTime(2_500);
    });
    expect(button.querySelector(".text-success")).toBeNull();
  });
});
