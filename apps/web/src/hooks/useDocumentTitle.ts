import { useEffect } from "react";

/**
 * Manage document.title from React. Sets the title to a hyphen-joined
 * `parts.join(" - ")` when mounted; restores the prior title on
 * unmount.
 *
 * Empty / nullish parts are filtered out so partial loading states do
 * not produce dangling separators.
 *
 * Originally introduced by ORC-248. Screen reader users rely on the
 * window/page title to know what context they are in; without this
 * hook, navigation between threads and projects produced no auditory
 * cue because main.tsx sets the title once at app boot.
 *
 * @see ORC-248
 */
export function useDocumentTitle(parts: ReadonlyArray<string | null | undefined>): void {
  const composed = formatDocumentTitle(parts);
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const previous = document.title;
    if (composed.length > 0) {
      document.title = composed;
    }
    return () => {
      document.title = previous;
    };
  }, [composed]);
}

/**
 * Compose a title from the given parts. Exposed for tests and for
 * non-React surfaces (e.g. an effect-only update from outside a
 * component tree).
 *
 * @see ORC-248
 */
export function formatDocumentTitle(
  parts: ReadonlyArray<string | null | undefined>,
): string {
  const filtered: string[] = [];
  for (const part of parts) {
    if (typeof part !== "string") continue;
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    filtered.push(trimmed);
  }
  return filtered.length > 0 ? filtered.join(" - ") : "";
}
