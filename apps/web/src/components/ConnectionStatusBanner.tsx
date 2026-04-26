import { useEffect, useState } from "react";

import { getWsQueuedRequestCount, onWsStateChange } from "../wsNativeApi";

type WsState = "connecting" | "open" | "reconnecting" | "closed" | "disposed";

/**
 * A small top-of-screen banner that surfaces WebSocket disconnects. Appears
 * only when the transport is NOT in "open" state, so the steady-state UI is
 * unaffected. Auto-reconnect keeps running in the background; this just tells
 * the user what's happening so they don't think their actions were lost.
 */
export function ConnectionStatusBanner() {
  const [state, setState] = useState<WsState>("connecting");
  const [queuedCount, setQueuedCount] = useState(0);
  const [shownSince, setShownSince] = useState<number | null>(null);

  useEffect(() => {
    const unsub = onWsStateChange((next) => setState(next));
    return unsub;
  }, []);

  // Delay showing the banner for the first second so brief reconnects don't
  // flicker on-screen. If we're still not "open" after 800ms, show it.
  useEffect(() => {
    if (state === "open" || state === "disposed") {
      setShownSince(null);
      return;
    }
    const timer = setTimeout(() => setShownSince(Date.now()), 800);
    return () => clearTimeout(timer);
  }, [state]);

  // Poll queued count while banner is visible.
  useEffect(() => {
    if (shownSince === null) return;
    const interval = setInterval(() => setQueuedCount(getWsQueuedRequestCount()), 500);
    return () => clearInterval(interval);
  }, [shownSince]);

  if (state === "open" || state === "disposed" || shownSince === null) {
    return null;
  }

  const label =
    state === "connecting"
      ? "Connecting to Orchestrate server…"
      : state === "reconnecting"
        ? "Reconnecting to Orchestrate server…"
        : "Connection to Orchestrate server lost";

  const accentBg = state === "closed" ? "bg-rose-500/15" : "bg-amber-500/12";
  const accentDot = state === "closed" ? "bg-rose-400" : "bg-amber-400";
  const accentBorder = state === "closed" ? "border-rose-500/30" : "border-amber-500/30";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-2`}
    >
      <div
        className={`pointer-events-auto flex items-center gap-2.5 rounded-full border ${accentBorder} ${accentBg} px-3 py-1.5 text-[12px] font-medium text-foreground/85 shadow-lg shadow-black/20 backdrop-blur-xl`}
      >
        <span
          className={`inline-flex size-2 shrink-0 rounded-full ${accentDot} ${state !== "closed" ? "animate-pulse" : ""}`}
          aria-hidden
        />
        <span>{label}</span>
        {queuedCount > 0 && (
          <span className="rounded-full border border-border/40 bg-background/50 px-1.5 py-0.5 text-[10px] text-muted-foreground/80">
            {queuedCount} queued
          </span>
        )}
      </div>
    </div>
  );
}
