/**
 * Pure JSX shell for the catch-all "Not Found" route (ORC-175).
 *
 * Extracted from `__root.tsx` so it can be tested without pulling
 * the route module's side-effect imports (theme bootstrapping,
 * native bridge, query client, etc.).
 *
 * @see ORC-175
 */

import { APP_DISPLAY_NAME } from "../branding";
import { Button } from "./ui/button";

export interface RouteNotFoundShellProps {
  readonly pathname: string;
  readonly onGoHome: () => void;
  readonly onGoBack: () => void;
}

export function RouteNotFoundShell({
  pathname,
  onGoHome,
  onGoBack,
}: RouteNotFoundShellProps) {
  return (
    <div
      role="alert"
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground sm:px-6"
    >
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute inset-x-0 top-0 h-44 bg-[radial-gradient(44rem_16rem_at_top,color-mix(in_srgb,var(--color-blue-500)_12%,transparent),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(145deg,color-mix(in_srgb,var(--background)_90%,var(--color-black))_0%,var(--background)_55%)]" />
      </div>

      <section className="relative w-full max-w-xl rounded-2xl border border-border/80 bg-card/90 p-6 shadow-2xl shadow-black/20 backdrop-blur-md sm:p-8">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          {APP_DISPLAY_NAME}
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          Page not found.
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The path{" "}
          <code className="rounded bg-background/60 px-1.5 py-0.5 font-mono text-xs">
            {pathname}
          </code>{" "}
          does not match any known route. The link may be stale or the route may have been removed.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" onClick={onGoHome}>
            Go home
          </Button>
          <Button size="sm" variant="outline" onClick={onGoBack}>
            Go back
          </Button>
        </div>
      </section>
    </div>
  );
}
