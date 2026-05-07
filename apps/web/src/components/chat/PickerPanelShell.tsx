// FILE: PickerPanelShell.tsx
// Purpose: Shared visual shell for combobox-style pickers (search input + scrollable list + optional footer).
// Layer: Chat picker UI
// Depends on: shared input styling and caller-provided content slots.

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "~/lib/utils";
import { Input } from "../ui/input";

const MENU_NAVIGATION_KEYS = new Set([
  "ArrowDown",
  "ArrowUp",
  "Home",
  "End",
  "PageDown",
  "PageUp",
  "Enter",
  "Escape",
]);

export function PickerPanelShell(props: {
  searchPlaceholder?: string;
  query?: string;
  onQueryChange?: (query: string) => void;
  /**
   * When true, the search input swallows printable keys so they reach the
   * search field instead of being interpreted as menu shortcuts. Menu nav
   * keys (arrows, Enter, Escape, etc.) still propagate so list navigation
   * keeps working.
   */
  stopSearchKeyPropagation?: boolean;
  autoFocusSearch?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  widthClassName?: string;
  /** When true, expand the shell to cancel the parent menu's padding. */
  bleedParentPadding?: boolean;
}) {
  const {
    searchPlaceholder = "Search",
    query = "",
    onQueryChange,
    stopSearchKeyPropagation = false,
    autoFocusSearch = false,
    children,
    footer,
    widthClassName = "w-72",
    bleedParentPadding = false,
  } = props;
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!autoFocusSearch || !onQueryChange) return;
    const frame = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [autoFocusSearch, onQueryChange]);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col",
        widthClassName,
        bleedParentPadding ? "-m-1 overflow-clip rounded-xl" : null,
      )}
    >
      {onQueryChange ? (
        <div
          className={cn(
            "sticky z-20 overflow-clip border-b border-border bg-popover p-1",
            bleedParentPadding ? "-top-1 pt-2" : "top-0",
          )}
        >
          <Input
            className="rounded-md border-border/60 bg-background shadow-none [&_input]:font-sans"
            nativeInput
            ref={searchInputRef}
            size="sm"
            type="search"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDownCapture={
              stopSearchKeyPropagation
                ? (event) => {
                    if (!MENU_NAVIGATION_KEYS.has(event.key)) {
                      event.stopPropagation();
                    }
                  }
                : undefined
            }
          />
        </div>
      ) : null}
      <div className="min-h-0 flex-1">{children}</div>
      {footer ? <div className="border-t p-1">{footer}</div> : null}
    </div>
  );
}
