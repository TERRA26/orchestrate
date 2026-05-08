import { useEffect, useRef } from "react";

/**
 * Capture the previously-focused element when an overlay opens, focus the
 * overlay's mount node, and restore focus to the original element when it
 * closes. Also wires an Escape keydown handler that fires `onClose`.
 *
 * For dialogs that need full WAI-ARIA focus-trap semantics (Tab cycles
 * inside the dialog, etc.) prefer the @base-ui Dialog primitive. Use this
 * hook when a custom overlay can't be ported.
 *
 * @see ORC-073
 * @module hooks/useFocusTrapAndRestore
 */

export interface UseFocusTrapAndRestoreOptions {
  /** Whether the overlay is currently open (mounted/visible). */
  readonly isOpen: boolean;
  /** Ref to the overlay's outermost element to focus when it opens. */
  readonly overlayRef: React.RefObject<HTMLElement | null>;
  /** Optional callback fired when the user presses Escape while open. */
  readonly onClose?: () => void;
}

export const useFocusTrapAndRestore = ({
  isOpen,
  overlayRef,
  onClose,
}: UseFocusTrapAndRestoreOptions): void => {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  // Latest onClose; let callers pass a fresh closure each render without
  // re-installing the keydown listener.
  const onCloseRef = useRef<UseFocusTrapAndRestoreOptions["onClose"]>(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    previousFocusRef.current = previouslyFocused;

    const overlayNode = overlayRef.current;
    if (overlayNode) {
      // Focus the overlay itself if it's tabbable, else give it tabIndex=-1
      // so we can focus it programmatically without making it tab-stop.
      const currentTabIndex = overlayNode.getAttribute("tabindex");
      if (currentTabIndex === null) {
        overlayNode.setAttribute("tabindex", "-1");
      }
      overlayNode.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        const cb = onCloseRef.current;
        if (cb) {
          event.preventDefault();
          cb();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const target = previousFocusRef.current;
      previousFocusRef.current = null;
      // Restore focus only if the previous element is still in the DOM and
      // focusable. If it was removed (rare) we silently leave focus where
      // it is rather than throwing.
      if (target && document.contains(target) && typeof target.focus === "function") {
        target.focus();
      }
    };
  }, [isOpen, overlayRef]);
};
