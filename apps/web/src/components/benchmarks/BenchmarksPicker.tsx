// FILE: BenchmarksPicker.tsx
// Purpose: Compose-time menu to load a saved benchmark's prompt into the composer input.
// Layer: Chat composer toolbar control

import { useState } from "react";

import { useBenchmarksStore } from "~/benchmarksStore";
import { Button } from "~/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/components/ui/menu";
import { ChevronDownIcon, FlaskConicalIcon } from "~/lib/icons";

interface BenchmarksPickerProps {
  disabled?: boolean;
  onInsertPrompt: (prompt: string, benchmarkId: string) => void;
}

export function BenchmarksPicker({ disabled, onInsertPrompt }: BenchmarksPickerProps) {
  const benchmarks = useBenchmarksStore((state) => state.benchmarks);
  const [open, setOpen] = useState(false);

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 whitespace-nowrap gap-1.5 px-2 text-[12px] sm:text-[12px] font-normal text-muted-foreground/70 hover:text-foreground/80 sm:px-3"
            disabled={disabled}
            aria-label="Load benchmark prompt"
          />
        }
      >
        <FlaskConicalIcon aria-hidden="true" className="size-3.5 shrink-0" />
        <span>Benchmark</span>
        <ChevronDownIcon aria-hidden="true" className="size-3 opacity-60" />
      </MenuTrigger>
      <MenuPopup align="start" className="max-w-sm">
        {benchmarks.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            No benchmarks yet. Create one in the Benchmarks tab.
          </div>
        ) : (
          benchmarks.map((benchmark) => (
            <MenuItem
              key={benchmark.id}
              onClick={() => {
                onInsertPrompt(benchmark.prompt, benchmark.id);
                setOpen(false);
              }}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[13px] font-medium">{benchmark.name}</span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {benchmark.prompt.slice(0, 80) || "(empty prompt)"}
                </span>
              </div>
            </MenuItem>
          ))
        )}
      </MenuPopup>
    </Menu>
  );
}
