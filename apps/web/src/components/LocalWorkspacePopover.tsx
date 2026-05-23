import { useState, type ReactNode } from "react";
import { PiLaptop } from "react-icons/pi";

import { ChevronDownIcon } from "~/lib/icons";
import { Popover, PopoverPopup, PopoverTrigger } from "./ui/popover";

interface LocalWorkspacePopoverProps {
  children?: ReactNode;
}

export function LocalWorkspacePopover({ children }: LocalWorkspacePopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex cursor-pointer items-center gap-1 px-1.5 text-[10px] font-normal text-muted-foreground/60 transition-colors hover:text-foreground/85">
        <PiLaptop className="size-3" />
        Local
        <ChevronDownIcon className="size-3 opacity-50" />
      </PopoverTrigger>
      <PopoverPopup
        align="start"
        side="top"
        sideOffset={6}
        className="w-56 [&_[data-slot=popover-viewport]]:py-0 [&_[data-slot=popover-viewport]]:[--viewport-inline-padding:0px]"
      >
        <div className="py-1.5">
          <p className="px-3 pb-1 pt-1 text-[11px] font-medium text-muted-foreground">
            Continue in
          </p>
          <div className="flex w-full items-center gap-2 px-3 py-1.5 text-sm">
            <PiLaptop className="size-4 text-muted-foreground" />
            <span>Local project</span>
            <svg
              className="ml-auto size-4 text-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>
        {children ? (
          <>
            <div className="mx-3 border-t border-border/50" />
            {children}
          </>
        ) : null}
      </PopoverPopup>
    </Popover>
  );
}
