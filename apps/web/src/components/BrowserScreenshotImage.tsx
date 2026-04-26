import { useEffect, useState } from "react";

import { XIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";

export interface BrowserScreenshotImageProps {
  thumbnailDataUrl: string;
  fullDataUrl?: string;
  className?: string;
  imageClassName?: string;
}

export function BrowserScreenshotImage({
  thumbnailDataUrl,
  fullDataUrl,
  className,
  imageClassName,
}: BrowserScreenshotImageProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverImageUrl = fullDataUrl ?? thumbnailDataUrl;

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        className={cn(
          "block overflow-hidden rounded border border-border/50 bg-background/45 p-1 transition-colors hover:border-border/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          className,
        )}
        onClick={() => setIsOpen(true)}
        title="Open captured screenshot"
      >
        <img
          src={thumbnailDataUrl}
          alt="Captured browser screenshot"
          className={cn("block h-full w-full object-contain", imageClassName)}
          loading="lazy"
        />
      </button>
      {isOpen ? (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-5 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Captured browser screenshot"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="relative max-h-full max-w-full"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-2 top-2 rounded bg-black/70 p-1.5 text-white/80 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              onClick={() => setIsOpen(false)}
              title="Close screenshot"
            >
              <XIcon className="size-4" />
            </button>
            <img
              src={popoverImageUrl}
              alt="Captured browser screenshot enlarged"
              className="max-h-[88vh] max-w-[88vw] rounded border border-white/15 bg-white object-contain shadow-2xl"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
