import type { ContextMenuItem } from "@t3tools/contracts";

/**
 * Imperative DOM-based context menu for non-Electron environments.
 * Shows a positioned dropdown and returns a promise that resolves
 * with the clicked item id, or null if dismissed.
 */
export function showContextMenuFallback<T extends string>(
  items: readonly ContextMenuItem<T>[],
  position?: { x: number; y: number },
): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:99999";

    const menu = document.createElement("div");
    menu.className =
      "fixed z-[100000] min-w-[160px] rounded-lg border border-border bg-popover py-1.5 shadow-2xl";

    const x = position?.x ?? 0;
    const y = position?.y ?? 0;
    menu.style.top = `${y}px`;
    menu.style.left = `${x}px`;

    function cleanup(result: T | null) {
      document.removeEventListener("keydown", onKeyDown);
      overlay.remove();
      menu.remove();
      resolve(result);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        cleanup(null);
      }
    }

    overlay.addEventListener("mousedown", () => cleanup(null));
    document.addEventListener("keydown", onKeyDown);

    for (const item of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = item.label;
      const isDestructiveAction = item.destructive === true || item.id === "delete";
      const isDisabled = item.disabled === true;
      btn.disabled = isDisabled;
      btn.className = isDisabled
        ? "flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground/60 cursor-not-allowed"
        : isDestructiveAction
          ? "flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-destructive hover:bg-destructive/10 cursor-default"
          : "flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-popover-foreground hover:bg-accent cursor-default";
      if (!isDisabled) {
        btn.addEventListener("click", () => cleanup(item.id));
      }
      menu.appendChild(btn);
    }

    document.body.appendChild(overlay);
    document.body.appendChild(menu);

    // Adjust if menu overflows viewport
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menu.style.left = `${window.innerWidth - rect.width - 4}px`;
      }
      if (rect.bottom > window.innerHeight) {
        menu.style.top = `${window.innerHeight - rect.height - 4}px`;
      }
    });
  });
}
