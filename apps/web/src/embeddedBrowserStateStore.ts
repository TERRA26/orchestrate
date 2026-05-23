import { type BrowserObservation, type ThreadId } from "@orchestrate/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const EMBEDDED_BROWSER_STATE_STORAGE_KEY = "orchestrate:embedded-browser-state:v1";

export type EmbeddedBrowserSessionSource = "orchestrator" | "sidebar";
export type EmbeddedBrowserInternalPageId = "learn-ai";

interface EmbeddedBrowserSessionBase {
  openedAt: string;
  source: EmbeddedBrowserSessionSource;
  title: string;
}

export type EmbeddedBrowserSession =
  | (EmbeddedBrowserSessionBase & {
      kind: "automation";
      sessionId?: string;
      url: string;
      readyState: string;
      observedAt: string;
      targetCount: number;
      textSummary: string;
      screenshotDataUrl?: string;
      screenshotArtifactRef?: string;
      evidenceRefs?: string[];
      lastActionSummary?: string;
    })
  | (EmbeddedBrowserSessionBase & {
      kind: "internal";
      pageId: EmbeddedBrowserInternalPageId;
      path: string;
    })
  | (EmbeddedBrowserSessionBase & {
      kind: "url";
      url: string;
    });

interface EmbeddedBrowserState {
  globalSession: EmbeddedBrowserSession | null;
  threadSessionsById: Partial<Record<ThreadId, EmbeddedBrowserSession>>;
  threadSessionVisibilityById: Partial<Record<ThreadId, boolean>>;
  closeGlobalSession: () => void;
  closeThreadSession: (threadId: ThreadId) => void;
  openGlobalSession: (session: EmbeddedBrowserSession) => void;
  openThreadSession: (threadId: ThreadId, session: EmbeddedBrowserSession) => void;
  setThreadSessionVisible: (threadId: ThreadId, visible: boolean) => void;
}

export function createLearnAiEmbeddedBrowserSession(
  source: EmbeddedBrowserSessionSource,
): EmbeddedBrowserSession {
  return {
    kind: "internal",
    openedAt: new Date().toISOString(),
    pageId: "learn-ai",
    path: "app://learn-ai",
    source,
    title: "Learn AI",
  };
}

export function createEmbeddedBrowserAutomationSession(input: {
  source: EmbeddedBrowserSessionSource;
  observation: BrowserObservation;
  title?: string | null | undefined;
  lastActionSummary?: string | null | undefined;
}): EmbeddedBrowserSession {
  return {
    kind: "automation",
    openedAt: new Date().toISOString(),
    source: input.source,
    title: input.title?.trim() || input.observation.title.trim() || "Computer Use Preview",
    ...(input.observation.sessionId.trim().length > 0
      ? { sessionId: input.observation.sessionId }
      : {}),
    url: input.observation.url,
    readyState: input.observation.readyState,
    observedAt: input.observation.observedAt,
    targetCount: input.observation.targets.length,
    textSummary: input.observation.textSummary,
    ...(input.observation.screenshotDataUrl
      ? { screenshotDataUrl: input.observation.screenshotDataUrl }
      : {}),
    ...(input.observation.screenshotArtifactRef
      ? { screenshotArtifactRef: input.observation.screenshotArtifactRef }
      : {}),
    ...(input.observation.evidenceRefs?.length
      ? { evidenceRefs: [...input.observation.evidenceRefs] }
      : {}),
    ...(input.lastActionSummary?.trim()
      ? { lastActionSummary: input.lastActionSummary.trim() }
      : {}),
  };
}

function titleizeSegment(segment: string): string {
  const cleaned = segment.trim().replace(/[-_]+/g, " ");
  if (cleaned.length === 0) {
    return "Preview";
  }
  return cleaned
    .split(/\s+/)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function inferTitleFromUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed === "/learn-ai" || trimmed === "app://learn-ai") {
    return "Learn AI";
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const segment = parsed.pathname.split("/").findLast((part) => part.length > 0);
      return segment ? `${titleizeSegment(segment)} Preview` : parsed.host;
    } catch {
      return "Live Preview";
    }
  }
  const withoutQuery = trimmed.replace(/^\//, "").split("?")[0] ?? "";
  const segment = withoutQuery.split("/").findLast((part) => part.length > 0);
  return segment ? `${titleizeSegment(segment)} Preview` : "Live Preview";
}

export function createEmbeddedBrowserSessionFromUrl(input: {
  source: EmbeddedBrowserSessionSource;
  title?: string | null | undefined;
  url: string;
}): EmbeddedBrowserSession {
  const trimmedUrl = input.url.trim();
  if (trimmedUrl === "/learn-ai" || trimmedUrl === "app://learn-ai") {
    return {
      ...createLearnAiEmbeddedBrowserSession(input.source),
      ...(input.title?.trim() ? { title: input.title.trim() } : {}),
    };
  }

  return {
    kind: "url",
    openedAt: new Date().toISOString(),
    source: input.source,
    title: input.title?.trim() || inferTitleFromUrl(trimmedUrl),
    url: trimmedUrl,
  };
}

export function getEmbeddedBrowserAddress(session: EmbeddedBrowserSession): string {
  return session.kind === "internal" ? session.path : session.url;
}

export function resolveEmbeddedBrowserAbsoluteUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^(?:localhost|127\.0\.0\.1)(?::\d+)(?:\/.*)?$/i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  if (trimmed.startsWith("/") && typeof window !== "undefined") {
    return new URL(trimmed, window.location.origin).toString();
  }
  return null;
}

export function resolveEmbeddedBrowserSession(input: {
  globalSession: EmbeddedBrowserSession | null;
  threadId: ThreadId | null | undefined;
  threadSessionsById: Partial<Record<ThreadId, EmbeddedBrowserSession>>;
}): {
  scope: "global" | "thread" | null;
  session: EmbeddedBrowserSession | null;
} {
  const threadSession = input.threadId ? (input.threadSessionsById[input.threadId] ?? null) : null;
  if (threadSession) {
    return { scope: "thread", session: threadSession };
  }
  if (input.globalSession) {
    return { scope: "global", session: input.globalSession };
  }
  return { scope: null, session: null };
}

export const useEmbeddedBrowserStateStore = create<EmbeddedBrowserState>()(
  persist(
    (set) => ({
      globalSession: null,
      threadSessionsById: {},
      threadSessionVisibilityById: {},
      closeGlobalSession: () => set({ globalSession: null }),
      closeThreadSession: (threadId) =>
        set((state) => {
          if (state.threadSessionsById[threadId] === undefined) {
            return state;
          }
          const nextSessions = { ...state.threadSessionsById };
          delete nextSessions[threadId];
          const nextVisibility = { ...state.threadSessionVisibilityById };
          delete nextVisibility[threadId];
          return {
            threadSessionsById: nextSessions,
            threadSessionVisibilityById: nextVisibility,
          };
        }),
      openGlobalSession: (session) => set({ globalSession: session }),
      openThreadSession: (threadId, session) =>
        set((state) => ({
          threadSessionsById: {
            ...state.threadSessionsById,
            [threadId]: session,
          },
          threadSessionVisibilityById: {
            ...state.threadSessionVisibilityById,
            [threadId]: true,
          },
        })),
      setThreadSessionVisible: (threadId, visible) =>
        set((state) => ({
          threadSessionVisibilityById: {
            ...state.threadSessionVisibilityById,
            [threadId]: visible,
          },
        })),
    }),
    {
      name: EMBEDDED_BROWSER_STATE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        globalSession: state.globalSession,
        threadSessionsById: state.threadSessionsById,
        threadSessionVisibilityById: state.threadSessionVisibilityById,
      }),
    },
  ),
);
