import { useEffect } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { cn } from "~/lib/utils";
import { XIcon } from "~/lib/icons";
import { type SettingsModalTab, useSettingsModalStore } from "../settingsModalStore";
import { SettingsView } from "../routes/_chat.settings";

const TABS: ReadonlyArray<{ value: SettingsModalTab; label: string }> = [
  { value: "general", label: "General" },
  { value: "models", label: "Models" },
  { value: "advanced", label: "Advanced" },
  { value: "about", label: "About" },
];

export function SettingsModal() {
  const isOpen = useSettingsModalStore((s) => s.isOpen);
  const tab = useSettingsModalStore((s) => s.tab);
  const close = useSettingsModalStore((s) => s.close);
  const setTab = useSettingsModalStore((s) => s.setTab);
  const open = useSettingsModalStore((s) => s.open);

  // Global ⌘, / Ctrl+, shortcut to toggle, and Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        if (isOpen) close();
        else open();
        return;
      }
      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, open, close]);

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(next) => (next ? open() : close())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          onClick={() => close()}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[4px] transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0"
        />
        <DialogPrimitive.Viewport className="fixed inset-0 z-50 grid place-items-center p-4">
          <DialogPrimitive.Popup
            className={cn(
              "relative flex h-[560px] w-[720px] max-w-full max-h-full min-h-0 flex-col overflow-hidden rounded-[12px] text-foreground",
              "transition-[opacity,transform] duration-200 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0 data-ending-style:scale-[0.98] data-starting-style:scale-[0.98]",
            )}
            style={{
              backgroundColor: "var(--card)",
              boxShadow:
                "0 24px 72px rgba(0,0,0,0.55), 0 0 0 1px color-mix(in srgb, var(--foreground) 14%, transparent)",
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-border/50 px-5 py-3">
              <DialogPrimitive.Title className="text-[14px] font-semibold tracking-tight">
                Settings
              </DialogPrimitive.Title>
              <button
                type="button"
                aria-label="Close settings"
                onClick={() => close()}
                className="ml-auto inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <XIcon className="size-4" />
              </button>
            </div>

            {/* Body — vertical tab rail + scrollable content */}
            <div className="flex min-h-0 flex-1">
              <nav
                className="flex w-[160px] shrink-0 flex-col gap-0.5 border-r border-border/50 p-2"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--surface-sunken) 60%, transparent)",
                }}
                aria-label="Settings categories"
              >
                {TABS.map((t) => {
                  const active = t.value === tab;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setTab(t.value)}
                      className={cn(
                        "h-8 rounded-md px-2.5 text-left text-[12.5px] transition-colors",
                        active
                          ? "text-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                      style={
                        active
                          ? {
                              backgroundColor: "var(--surface-raised)",
                              boxShadow:
                                "inset 0 0 0 1px color-mix(in srgb, var(--foreground) 8%, transparent)",
                            }
                          : undefined
                      }
                      aria-current={active ? "page" : undefined}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </nav>

              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <SettingsView embedded embeddedTab={tab} />
              </div>
            </div>

            {/* Footer */}
            <div
              className="flex items-center justify-between gap-2 border-t border-border/50 px-5 py-3"
              style={{
                backgroundColor: "color-mix(in srgb, var(--surface-sunken) 60%, transparent)",
              }}
            >
              <span className="text-[11px] text-muted-foreground">
                Changes apply immediately. Press{" "}
                <kbd className="rounded border border-border/50 bg-background/50 px-1 font-mono text-[10px] text-muted-foreground">
                  Esc
                </kbd>{" "}
                to close.
              </span>
              <button
                type="button"
                onClick={() => close()}
                className="inline-flex h-7 items-center rounded-md px-3 text-[12px] font-medium hover:opacity-90"
                style={{ backgroundColor: "var(--foreground)", color: "var(--background)" }}
              >
                Done
              </button>
            </div>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Viewport>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
