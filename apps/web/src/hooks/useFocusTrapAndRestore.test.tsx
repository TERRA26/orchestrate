// @vitest-environment jsdom
import { useRef, useState } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useFocusTrapAndRestore } from "./useFocusTrapAndRestore";

afterEach(() => {
  cleanup();
});

function Harness({ initialOpen, onClose }: { initialOpen: boolean; onClose?: () => void }) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(initialOpen);
  useFocusTrapAndRestore({
    isOpen: open,
    overlayRef,
    onClose: () => {
      onClose?.();
      setOpen(false);
    },
  });
  return (
    <div>
      <button data-testid="opener" onClick={() => setOpen(true)}>
        open
      </button>
      <button data-testid="other" onClick={() => undefined}>
        other
      </button>
      {open ? (
        <div data-testid="overlay" ref={overlayRef} role="dialog">
          overlay content
        </div>
      ) : null}
    </div>
  );
}

describe("useFocusTrapAndRestore (ORC-073)", () => {
  it("focuses the overlay element when opened", () => {
    render(<Harness initialOpen={false} />);
    const opener = screen.getByTestId("opener");
    opener.focus();
    expect(document.activeElement).toBe(opener);

    act(() => {
      opener.click();
    });

    const overlay = screen.getByTestId("overlay");
    expect(document.activeElement).toBe(overlay);
  });

  it("restores focus to the previously-focused element when closed", () => {
    render(<Harness initialOpen={false} />);
    const opener = screen.getByTestId("opener");
    opener.focus();

    act(() => {
      opener.click();
    });
    const overlay = screen.getByTestId("overlay");
    expect(document.activeElement).toBe(overlay);

    act(() => {
      // Press Escape on document; the hook listens at the document level.
      const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
      document.dispatchEvent(event);
    });

    expect(document.activeElement).toBe(opener);
  });

  it("invokes the onClose callback on Escape", () => {
    const onClose = vi.fn();
    render(<Harness initialOpen={false} onClose={onClose} />);
    const opener = screen.getByTestId("opener");
    opener.focus();

    act(() => {
      opener.click();
    });

    act(() => {
      const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
      document.dispatchEvent(event);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose for non-Escape keys", () => {
    const onClose = vi.fn();
    render(<Harness initialOpen={true} onClose={onClose} />);

    act(() => {
      const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
      document.dispatchEvent(enter);
      const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true });
      document.dispatchEvent(tab);
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("removes the keydown listener on unmount", () => {
    const onClose = vi.fn();
    const { unmount } = render(<Harness initialOpen={true} onClose={onClose} />);

    unmount();

    act(() => {
      const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
      document.dispatchEvent(event);
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("sets tabindex=-1 on the overlay node so it can receive programmatic focus", () => {
    render(<Harness initialOpen={true} />);
    const overlay = screen.getByTestId("overlay");
    expect(overlay.getAttribute("tabindex")).toBe("-1");
  });
});
