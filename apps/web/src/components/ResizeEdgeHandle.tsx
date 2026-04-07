import { useCallback, useEffect, useRef } from "react";

import { cn } from "~/lib/utils";

export function ResizeEdgeHandle({
  onResize,
  side = "right",
  label = "Resize panel",
  className,
}: {
  onResize: (delta: number) => void;
  side?: "left" | "right";
  label?: string;
  className?: string;
}) {
  const stateRef = useRef<{
    pointerId: number;
    startX: number;
    moved: boolean;
  } | null>(null);

  const cleanupDocumentStyles = useCallback(() => {
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
  }, []);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    stateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const state = stateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      event.preventDefault();
      const delta = event.clientX - state.startX;
      if (Math.abs(delta) > 2) {
        state.moved = true;
      }
      if (state.moved) {
        onResize(side === "left" ? -delta : delta);
        state.startX = event.clientX;
      }
    },
    [onResize, side],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const state = stateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      event.preventDefault();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      cleanupDocumentStyles();
      stateRef.current = null;
    },
    [cleanupDocumentStyles],
  );

  useEffect(() => {
    return () => {
      stateRef.current = null;
      cleanupDocumentStyles();
    };
  }, [cleanupDocumentStyles]);

  return (
    <button
      type="button"
      aria-label={label}
      title="Drag to resize"
      tabIndex={-1}
      className={cn(
        "absolute inset-y-0 z-20 w-1 cursor-col-resize transition-colors hover:bg-border/80 active:bg-primary/30",
        side === "left" ? "left-0" : "right-0",
        className,
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
}
