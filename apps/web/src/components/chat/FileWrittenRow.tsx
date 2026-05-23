// FILE: FileWrittenRow.tsx
// Purpose: Render an absolute-path file mention (typically inside a worker
//          REPORT block's `filesWritten` list) as a clickable row that
//          expands a dropdown showing the file's content. Replaces the flat
//          unstyled `<li>` that ReactMarkdown would otherwise produce.
// Layer: Chat surface (markdown-rendered worker reports)

import {
  type DiffsHighlighter,
  getSharedHighlighter,
  type SupportedLanguages,
} from "@pierre/diffs";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { Suspense, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import React from "react";
import { useTheme } from "~/hooks/useTheme";
import { useTurnDiffSummaries } from "~/hooks/useTurnDiffSummaries";
import { ChevronRightIcon } from "~/lib/icons";
import { resolveDiffThemeName, type DiffThemeName } from "~/lib/diffRendering";
import { checkpointDiffQueryOptions } from "~/lib/providerReactQuery";
import { cn } from "~/lib/utils";
import { readNativeApi } from "~/nativeApi";
import { useStore } from "~/store";
import type { ThreadId } from "@orchestrate/contracts";

const ABS_PATH_RE = /^\/[^\s]+(?:\.[A-Za-z0-9]+)?$/;
const PREVIEW_LIMIT = 200_000;
const ROW_HEIGHT_CLASS = "h-7";

export function looksLikeAbsoluteFilePath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return false;
  if (trimmed.includes(" ")) return false;
  if (trimmed.length > 512) return false;
  return ABS_PATH_RE.test(trimmed);
}

function basenameOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(idx + 1) : path;
}

function dirnameOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx > 0 ? path.slice(0, idx) : path;
}

function extOf(path: string): string {
  const base = basenameOf(path);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

// Map common source-file extensions to Shiki's language identifiers. Anything
// not listed falls back to "text" — Shiki still renders the file, just without
// syntax highlighting. Languages absent from Shiki's grammar list (e.g.
// "gitignore") get redirected to a structural near-match ("ini") in the same
// way ChatMarkdown.tsx handles them.
const FILE_EXT_LANGUAGE_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  cts: "typescript",
  mts: "typescript",
  js: "javascript",
  jsx: "jsx",
  cjs: "javascript",
  mjs: "javascript",
  json: "json",
  jsonc: "jsonc",
  json5: "json5",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  html: "html",
  htm: "html",
  vue: "vue",
  svelte: "svelte",
  astro: "astro",
  md: "markdown",
  mdx: "mdx",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  svg: "xml",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "fish",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  php: "php",
  c: "c",
  cpp: "cpp",
  cc: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  dart: "dart",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  prisma: "prisma",
  proto: "proto",
  dockerfile: "docker",
  env: "ini",
  ini: "ini",
  toml2: "toml",
  log: "log",
  txt: "text",
};

function languageForFile(fileName: string, ext: string): string {
  if (fileName.toLowerCase() === "dockerfile") return "docker";
  return FILE_EXT_LANGUAGE_MAP[ext] ?? "text";
}

// Per-language highlighter promise cache. Mirrors ChatMarkdown's pattern: the
// underlying `getSharedHighlighter` from @pierre/diffs already caches the
// engine instance, but we still want to avoid re-creating the wrapper promise
// per render. On grammar-load failure for a non-text language, fall back to
// "text" so the Suspense boundary doesn't error indefinitely.
const fileHighlighterPromiseCache = new Map<string, Promise<DiffsHighlighter>>();
function getFileHighlighterPromise(language: string): Promise<DiffsHighlighter> {
  const cached = fileHighlighterPromiseCache.get(language);
  if (cached) return cached;

  const promise = getSharedHighlighter({
    themes: [resolveDiffThemeName("dark"), resolveDiffThemeName("light")],
    langs: [language as SupportedLanguages],
    preferredHighlighter: "shiki-js",
  }).catch((err) => {
    fileHighlighterPromiseCache.delete(language);
    if (language === "text") throw err;
    return getFileHighlighterPromise("text");
  });
  fileHighlighterPromiseCache.set(language, promise);
  return promise;
}

// ORC-218: inner boundary is truly local. The outer
// OrchestratorErrorBoundary does NOT see errors caught here.
// componentDidCatch surfaces the swallowed error to console.error
// so it is debuggable instead of disappearing.
class HighlightErrorBoundary extends React.Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallback: ReactNode; children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("[HighlightErrorBoundary] caught", error, info.componentStack);
  }
  override render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

interface HighlightedFileBodyProps {
  code: string;
  language: string;
  themeName: DiffThemeName;
}

function HighlightedFileBody({ code, language, themeName }: HighlightedFileBodyProps) {
  const highlighter = use(getFileHighlighterPromise(language));
  const html = useMemo(() => {
    try {
      return highlighter.codeToHtml(code, { lang: language, theme: themeName });
    } catch {
      // Grammar exists but rendering threw — fall back to plain text.
      return highlighter.codeToHtml(code, { lang: "text", theme: themeName });
    }
  }, [code, highlighter, language, themeName]);

  return <div className="file-viewer-shiki-host" dangerouslySetInnerHTML={{ __html: html }} />;
}

// ── Diff extraction & rendering ─────────────────────────────────────────────
// We get a unified-diff string for the entire turn from `getFullThreadDiff`.
// To render only the chunk that pertains to the file the user clicked on,
// we slice the multi-file patch into per-file sections, find the section
// matching `path`, and feed the sliced text to Shiki using `lang: "diff"`.
//
// Shiki colors `+`/`-` markers but does NOT add row backgrounds. After
// rendering, a small DOM walk tags each `<span class="line">` with a
// `data-diff-kind` attribute (add | del | hunk | meta | context) so the CSS
// in `index.css` can paint the GitHub-style row backgrounds.

interface ExtractedFileDiff {
  /** The unified diff text for this file only (header + hunks). */
  diff: string;
  /** True if a section matching `relativePath` was found. */
  found: boolean;
}

function extractFileDiff(fullThreadDiff: string, relativePath: string): ExtractedFileDiff {
  // The patch text uses `diff --git a/<path> b/<path>` boundaries between
  // files. Split on a leading-line "diff --git" while keeping the marker.
  const sections = fullThreadDiff.split(/(?=^diff --git )/m).filter(Boolean);
  // Match against either `a/<path>` or `b/<path>` (covers create/delete cases
  // where one side is /dev/null).
  const target = sections.find((section) => {
    const firstLine = section.slice(0, section.indexOf("\n"));
    return (
      firstLine.includes(` a/${relativePath}`) ||
      firstLine.includes(` b/${relativePath}`) ||
      firstLine.endsWith(` a/${relativePath} b/${relativePath}`)
    );
  });
  if (!target) return { diff: "", found: false };
  return { diff: target.trimEnd(), found: true };
}

interface HighlightedDiffBodyProps {
  diffText: string;
  themeName: DiffThemeName;
}

function HighlightedDiffBody({ diffText, themeName }: HighlightedDiffBodyProps) {
  const highlighter = use(getFileHighlighterPromise("diff"));
  const html = useMemo(() => {
    try {
      return highlighter.codeToHtml(diffText, { lang: "diff", theme: themeName });
    } catch {
      return highlighter.codeToHtml(diffText, { lang: "text", theme: themeName });
    }
  }, [diffText, highlighter, themeName]);

  // Walk the rendered tree once, detect the original line's leading marker
  // by reading its plain text, and tag the `.line` element so CSS can apply
  // GitHub-style row backgrounds (green for add, red for del, faint for the
  // `@@` hunk header).
  const refCb = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const lines = node.querySelectorAll<HTMLElement>(".line");
    lines.forEach((line) => {
      const text = line.textContent ?? "";
      if (text.startsWith("@@ ")) line.dataset.diffKind = "hunk";
      else if (text.startsWith("+++") || text.startsWith("---") || text.startsWith("diff --git "))
        line.dataset.diffKind = "meta";
      else if (text.startsWith("+")) line.dataset.diffKind = "add";
      else if (text.startsWith("-")) line.dataset.diffKind = "del";
      else line.dataset.diffKind = "context";
    });
  }, []);

  return (
    <div
      ref={refCb}
      className="file-viewer-shiki-host"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

interface FetchState {
  status: "idle" | "loading" | "ready" | "error";
  contents?: string;
  truncated?: boolean;
  error?: string;
}

interface ResolvedProjectPath {
  cwd: string;
  relativePath: string;
}

/**
 * Map an absolute file path to a `(cwd, relativePath)` pair the server's
 * `projects.readFile` accepts. The server only requires that `relativePath`
 * be relative (not absolute) and not escape the `cwd` via `..`; it does NOT
 * require `cwd` to be a registered project. So we have two strategies:
 *
 * 1. Prefer a registered project whose cwd prefixes the path — this gives
 *    nicer error messages when the file is missing and matches the original
 *    write context.
 * 2. Fall back to using the file's parent directory as the cwd and the
 *    basename as the relative path. This works for any absolute path the
 *    worker wrote, including files outside any registered project (e.g.
 *    files in `sandbox/`).
 *
 * Returns null only when the input is not an absolute path.
 */
function resolveAbsolutePathForRead(
  absolutePath: string,
  projects: ReadonlyArray<{ cwd: string }>,
): ResolvedProjectPath | null {
  const trimmed = absolutePath.trim();
  if (!trimmed.startsWith("/")) return null;

  // Strategy 1: longest matching project prefix.
  const sorted = [...projects].sort((a, b) => b.cwd.length - a.cwd.length);
  for (const project of sorted) {
    const cwd = project.cwd.replace(/\/+$/, "");
    if (trimmed === cwd) continue; // path IS the project root, not a file
    if (trimmed.startsWith(`${cwd}/`)) {
      return { cwd, relativePath: trimmed.slice(cwd.length + 1) };
    }
  }

  // Strategy 2: split into (dirname, basename). The server's
  // `resolveWorkspaceWritePath` resolves `cwd + relativePath` and just
  // requires the result to stay inside `cwd` — which it trivially does
  // when relativePath is just a filename.
  const lastSlash = trimmed.lastIndexOf("/");
  if (lastSlash <= 0) return null;
  return {
    cwd: trimmed.slice(0, lastSlash),
    relativePath: trimmed.slice(lastSlash + 1),
  };
}

type ViewMode = "diff" | "file";

export function FileWrittenRow({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  const [fetchState, setFetchState] = useState<FetchState>({ status: "idle" });
  const [viewMode, setViewMode] = useState<ViewMode>("diff");
  const fileExt = extOf(path);
  const base = basenameOf(path);
  const dir = dirnameOf(path);
  const language = useMemo(() => languageForFile(base, fileExt), [base, fileExt]);
  const { resolvedTheme } = useTheme();
  const themeName = useMemo(() => resolveDiffThemeName(resolvedTheme), [resolvedTheme]);

  // Resolve the absolute path against the registered project roots so we
  // can hand the server a (cwd, relativePath) pair instead of a raw absolute
  // path (which the server rejects with "path must be relative").
  const projects = useStore((store) => store.projects);
  const resolved = useMemo(() => resolveAbsolutePathForRead(path, projects), [path, projects]);

  // Pull threadId out of the URL so we can fetch this thread's turn diff
  // without forcing every ChatMarkdown caller to thread context props down.
  // `strict: false` makes this safe to call from any tree position.
  const params = useParams({ strict: false }) as { threadId?: ThreadId };
  const threadId = params.threadId;
  const thread = useStore((store) =>
    threadId ? store.threads.find((t) => t.id === threadId) : undefined,
  );
  const { turnDiffSummaries } = useTurnDiffSummaries(thread);
  const toTurnCount = turnDiffSummaries.length;

  // The full-thread-diff query is gated on the row being open AND a real
  // turn diff being available. Cached by threadId+toTurnCount so opening
  // multiple rows in the same message reuses one network roundtrip.
  const diffQuery = useQuery(
    checkpointDiffQueryOptions({
      threadId: threadId ?? null,
      fromTurnCount: 0,
      toTurnCount: toTurnCount > 0 ? toTurnCount : null,
      cacheScope: "file-written-row",
      enabled: open && toTurnCount > 0 && Boolean(threadId),
    }),
  );

  // Slice this file's section out of the multi-file unified diff. We try the
  // path as relative-to-each-project; the matched relativePath is what the
  // git patch headers use.
  const fileDiffText = useMemo(() => {
    if (!diffQuery.data?.diff) return "";
    if (!resolved) return "";
    const candidates = [resolved.relativePath];
    // Also try relative paths against any other registered project, since
    // turn diffs are scoped to the project root, not the file's parent dir.
    for (const project of projects) {
      const cwd = project.cwd.replace(/\/+$/, "");
      if (path.startsWith(`${cwd}/`)) candidates.push(path.slice(cwd.length + 1));
    }
    for (const candidate of candidates) {
      const extracted = extractFileDiff(diffQuery.data.diff, candidate);
      if (extracted.found) return extracted.diff;
    }
    return "";
  }, [diffQuery.data, path, projects, resolved]);

  const hasDiff = fileDiffText.length > 0;
  const effectiveViewMode: ViewMode = hasDiff ? viewMode : "file";

  const loadContents = useCallback(async () => {
    setFetchState({ status: "loading" });
    const api = readNativeApi();
    if (!api) {
      setFetchState({
        status: "error",
        error: "Native API not connected — file preview is only available inside Orchestrate.",
      });
      return;
    }
    if (!resolved) {
      setFetchState({
        status: "error",
        error: "File path is not absolute — cannot resolve.",
      });
      return;
    }
    try {
      const result = await api.projects.readFile({
        cwd: resolved.cwd,
        relativePath: resolved.relativePath,
      });
      const contents = result.contents ?? "";
      const truncated = contents.length > PREVIEW_LIMIT;
      setFetchState({
        status: "ready",
        contents: truncated ? contents.slice(0, PREVIEW_LIMIT) : contents,
        truncated,
      });
    } catch (error) {
      setFetchState({
        status: "error",
        error: error instanceof Error ? error.message : "Could not read file",
      });
    }
  }, [path, resolved]);

  useEffect(() => {
    if (open && fetchState.status === "idle") {
      void loadContents();
    }
  }, [open, fetchState.status, loadContents]);

  const handleToggle = useCallback(() => setOpen((prev) => !prev), []);
  const handleOpenInEditor = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      const api = readNativeApi();
      if (!api) return;
      void api.shell.openInEditor(path, "vscode" as never).catch(() => {});
    },
    [path],
  );

  return (
    <div
      className={cn(
        "my-0.5 overflow-hidden rounded-md border transition-colors",
        open
          ? "border-border/60 bg-card/40"
          : "border-transparent hover:border-border/40 hover:bg-card/25",
      )}
      data-file-written-row="true"
    >
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          "group flex w-full items-center gap-2 px-2 text-left font-mono",
          ROW_HEIGHT_CLASS,
        )}
        aria-expanded={open}
        aria-controls={`file-written-${path}`}
      >
        <ChevronRightIcon
          aria-hidden="true"
          className={cn(
            "size-3 shrink-0 text-muted-foreground/55 transition-transform duration-150",
            open && "rotate-90",
          )}
        />
        <span className="text-[10.5px] font-medium text-foreground/80 group-hover:text-foreground">
          {base}
        </span>
        {fileExt ? (
          <span className="rounded bg-muted/40 px-1 py-0 text-[9px] font-medium uppercase tracking-[0.06em] text-muted-foreground/70">
            {fileExt}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground/45">{dir}</span>
      </button>
      {open ? (
        <div
          id={`file-written-${path}`}
          className="border-t border-border/40 bg-background/60"
          data-file-written-content
        >
          {fetchState.status === "loading" ? (
            <p className="px-3 py-2 font-mono text-[10.5px] text-muted-foreground/55">Loading…</p>
          ) : fetchState.status === "error" ? (
            <div className="space-y-1.5 px-3 py-2">
              <p className="font-mono text-[10.5px] text-rose-400/85">
                Could not read file: {fetchState.error}
              </p>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setFetchState({ status: "idle" });
                }}
                className="text-[10px] text-muted-foreground/60 underline-offset-2 hover:text-foreground hover:underline"
              >
                Retry
              </button>
            </div>
          ) : fetchState.status === "ready" ? (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-border/30 bg-background/30 px-3 py-1 text-[9.5px] text-muted-foreground/55">
                <span className="min-w-0 flex-1 truncate">{path}</span>
                {hasDiff ? (
                  <div
                    className="flex shrink-0 items-center gap-0.5 rounded border border-border/40 bg-card/30 p-0.5"
                    data-file-viewer-mode-toggle
                  >
                    <button
                      type="button"
                      onClick={() => setViewMode("diff")}
                      className={cn(
                        "rounded px-1.5 py-[1px] text-[9.5px] font-medium uppercase tracking-[0.06em] transition-colors",
                        effectiveViewMode === "diff"
                          ? "bg-primary/15 text-foreground"
                          : "text-muted-foreground/65 hover:text-foreground",
                      )}
                    >
                      Diff
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("file")}
                      className={cn(
                        "rounded px-1.5 py-[1px] text-[9.5px] font-medium uppercase tracking-[0.06em] transition-colors",
                        effectiveViewMode === "file"
                          ? "bg-primary/15 text-foreground"
                          : "text-muted-foreground/65 hover:text-foreground",
                      )}
                    >
                      File
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={handleOpenInEditor}
                  className="shrink-0 underline-offset-2 hover:text-foreground hover:underline"
                  title="Open in editor"
                >
                  Open in editor ↗
                </button>
              </div>
              <div
                className="file-viewer-shiki max-h-[420px] overflow-auto"
                data-file-viewer-language={language}
                data-file-viewer-mode={effectiveViewMode}
              >
                <HighlightErrorBoundary
                  fallback={
                    <pre className="m-0 px-3 py-2 font-mono text-[10.5px] leading-[1.5] text-foreground/85">
                      {effectiveViewMode === "diff" ? fileDiffText : fetchState.contents}
                    </pre>
                  }
                >
                  <Suspense
                    fallback={
                      <pre className="m-0 px-3 py-2 font-mono text-[10.5px] leading-[1.5] text-foreground/85">
                        {effectiveViewMode === "diff" ? fileDiffText : fetchState.contents}
                      </pre>
                    }
                  >
                    {effectiveViewMode === "diff" ? (
                      <HighlightedDiffBody diffText={fileDiffText} themeName={themeName} />
                    ) : (
                      <HighlightedFileBody
                        code={fetchState.contents ?? ""}
                        language={language}
                        themeName={themeName}
                      />
                    )}
                  </Suspense>
                </HighlightErrorBoundary>
                {fetchState.truncated && effectiveViewMode === "file" ? (
                  <p className="px-3 py-2 text-[10px] italic text-muted-foreground/50">
                    Truncated at {PREVIEW_LIMIT.toLocaleString()} chars. Open in editor for the full
                    file.
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
