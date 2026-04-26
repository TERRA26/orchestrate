// FILE: BranchToolbar.tsx
// Purpose: Renders the chat thread's compact workspace controls, including the
// local usage popover, workspace handoff actions, and runtime access toggle.
import type { ThreadId, RuntimeMode } from "@orchestrate/contracts";
import { useQuery } from "@tanstack/react-query";
import { deriveAssociatedWorktreeMetadata } from "@orchestrate/shared/threadWorkspace";
import { ChevronRightIcon, ExternalLinkIcon, GitForkIcon, HandoffIcon } from "~/lib/icons";
import { LiaUnlockAltSolid, LiaLockSolid } from "react-icons/lia";
import { useCallback, useMemo, useState } from "react";

import { newCommandId, cn } from "../lib/utils";
import { readNativeApi } from "../nativeApi";
import { useComposerDraftStore } from "../composerDraftStore";
import { useStore } from "../store";
import {
  EnvMode,
  resolveDraftEnvModeAfterBranchChange,
  resolveEffectiveEnvMode,
} from "./BranchToolbar.logic";
import { BranchToolbarBranchSelector } from "./BranchToolbarBranchSelector";
import { ContextWindowMeter } from "./chat/ContextWindowMeter";
import type { ContextWindowSnapshot } from "../lib/contextWindow";
import { LocalWorkspacePopover } from "./LocalWorkspacePopover";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "./ui/collapsible";
import type { ThreadWorkspacePatch } from "../types";
import {
  deriveAccountRateLimits,
  deriveRateLimitLearnMoreHref,
  mergeProviderRateLimits,
} from "~/lib/rateLimits";
import { normalizeOpenUsageSnapshot } from "~/lib/openUsageRateLimits";
import { openUsageProviderSnapshotQueryOptions } from "~/lib/openUsageReactQuery";
import { RateLimitSummaryList } from "./RateLimitSummaryList";

interface BranchToolbarProps {
  threadId: ThreadId;
  onEnvModeChange: (mode: EnvMode) => void;
  envLocked: boolean;
  runtimeMode?: RuntimeMode;
  onRuntimeModeChange?: (mode: RuntimeMode) => void;
  onHandoffToWorktree?: () => void;
  onHandoffToLocal?: () => void;
  handoffBusy?: boolean;
  onCheckoutPullRequestRequest?: (reference: string) => void;
  onComposerFocusRequest?: () => void;
  contextWindow?: ContextWindowSnapshot | null;
  cumulativeCostUsd?: number | null;
}

export default function BranchToolbar({
  threadId,
  envLocked,
  runtimeMode,
  onRuntimeModeChange,
  onHandoffToWorktree,
  onHandoffToLocal,
  handoffBusy = false,
  onCheckoutPullRequestRequest,
  onComposerFocusRequest,
  contextWindow,
  cumulativeCostUsd,
}: BranchToolbarProps) {
  const threads = useStore((store) => store.threads);
  const projects = useStore((store) => store.projects);
  const setThreadWorkspaceAction = useStore((store) => store.setThreadWorkspace);
  const draftThread = useComposerDraftStore((store) => store.getDraftThread(threadId));
  const setDraftThreadContext = useComposerDraftStore((store) => store.setDraftThreadContext);

  const serverThread = threads.find((thread) => thread.id === threadId);
  const activeProjectId = serverThread?.projectId ?? draftThread?.projectId ?? null;
  const activeProject = projects.find((project) => project.id === activeProjectId);
  const activeThreadId = serverThread?.id ?? (draftThread ? threadId : undefined);
  const activeThreadBranch = serverThread?.branch ?? draftThread?.branch ?? null;
  const activeWorktreePath = serverThread?.worktreePath ?? draftThread?.worktreePath ?? null;
  const activeProvider =
    serverThread?.session?.provider ?? serverThread?.modelSelection.provider ?? null;
  const branchCwd = activeWorktreePath ?? activeProject?.cwd ?? null;
  const hasServerThread = serverThread !== undefined;
  const effectiveEnvMode = resolveEffectiveEnvMode({
    activeWorktreePath,
    hasServerThread,
    draftThreadEnvMode: draftThread?.envMode,
    serverThreadEnvMode: serverThread?.envMode,
  });

  const setThreadWorkspace = useCallback(
    (patch: ThreadWorkspacePatch) => {
      if (!activeThreadId) return;
      const branch = patch.branch !== undefined ? patch.branch : activeThreadBranch;
      const worktreePath =
        patch.worktreePath !== undefined ? patch.worktreePath : activeWorktreePath;
      const nextEnvMode =
        patch.envMode !== undefined ? patch.envMode : worktreePath ? "worktree" : effectiveEnvMode;
      const nextAssociatedWorktree = deriveAssociatedWorktreeMetadata({
        branch,
        worktreePath,
        associatedWorktreePath:
          patch.associatedWorktreePath !== undefined
            ? patch.associatedWorktreePath
            : (serverThread?.associatedWorktreePath ?? null),
        associatedWorktreeBranch:
          patch.associatedWorktreeBranch !== undefined ? patch.associatedWorktreeBranch : branch,
        associatedWorktreeRef:
          patch.associatedWorktreeRef !== undefined ? patch.associatedWorktreeRef : branch,
      });
      const api = readNativeApi();
      // If the effective cwd is about to change, stop the running session so the
      // next message creates a new one with the correct cwd.
      if (serverThread?.session && worktreePath !== activeWorktreePath && api) {
        void api.orchestration
          .dispatchCommand({
            type: "thread.session.stop",
            commandId: newCommandId(),
            threadId: activeThreadId,
            createdAt: new Date().toISOString(),
          })
          .catch(() => undefined);
      }
      if (api && hasServerThread) {
        void api.orchestration.dispatchCommand({
          type: "thread.meta.update",
          commandId: newCommandId(),
          threadId: activeThreadId,
          envMode: nextEnvMode,
          branch,
          worktreePath,
          associatedWorktreePath: nextAssociatedWorktree.associatedWorktreePath,
          associatedWorktreeBranch: nextAssociatedWorktree.associatedWorktreeBranch,
          associatedWorktreeRef: nextAssociatedWorktree.associatedWorktreeRef,
        });
      }
      if (hasServerThread) {
        setThreadWorkspaceAction(activeThreadId, {
          envMode: nextEnvMode,
          branch,
          worktreePath,
          ...nextAssociatedWorktree,
        });
        return;
      }
      const nextDraftEnvMode = resolveDraftEnvModeAfterBranchChange({
        nextWorktreePath: worktreePath,
        currentWorktreePath: activeWorktreePath,
        effectiveEnvMode,
      });
      setDraftThreadContext(threadId, {
        branch,
        worktreePath,
        envMode: nextDraftEnvMode,
      });
    },
    [
      activeThreadId,
      activeThreadBranch,
      serverThread?.session,
      activeWorktreePath,
      hasServerThread,
      setThreadWorkspaceAction,
      serverThread?.associatedWorktreePath,
      setDraftThreadContext,
      threadId,
      effectiveEnvMode,
    ],
  );

  const canHandoffToWorktree = Boolean(
    hasServerThread && envLocked && !activeWorktreePath && effectiveEnvMode === "local",
  );
  const canHandoffToLocal = Boolean(hasServerThread && activeWorktreePath);

  const openUsageSnapshotQuery = useQuery(
    openUsageProviderSnapshotQueryOptions(effectiveEnvMode === "local" ? activeProvider : null),
  );
  const runtimeRateLimits = useMemo(() => {
    const derived = deriveAccountRateLimits(threads);
    return activeProvider
      ? derived.filter((rateLimit) => rateLimit.provider === activeProvider)
      : derived;
  }, [activeProvider, threads]);
  const openUsageRateLimits = useMemo(() => {
    const normalized = normalizeOpenUsageSnapshot(openUsageSnapshotQuery.data, activeProvider);
    return normalized ? [normalized] : [];
  }, [activeProvider, openUsageSnapshotQuery.data]);
  const rateLimits = useMemo(
    () => mergeProviderRateLimits(runtimeRateLimits, openUsageRateLimits),
    [openUsageRateLimits, runtimeRateLimits],
  );
  const learnMoreHref = useMemo(() => deriveRateLimitLearnMoreHref(rateLimits), [rateLimits]);
  const [rateLimitsOpen, setRateLimitsOpen] = useState(true);

  if (!activeThreadId || !activeProject) return null;

  return (
    <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-3 pb-2 pt-0.5 font-mono">
      <div className="flex min-w-0 flex-1 items-center divide-x divide-border/35 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:whitespace-nowrap">
        {effectiveEnvMode === "local" ? (
          <LocalWorkspacePopover>
            <div className="py-1.5">
              <Collapsible open={rateLimitsOpen} onOpenChange={setRateLimitsOpen}>
                <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-accent">
                  <svg
                    className="size-4 text-muted-foreground"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span>Rate limits remaining</span>
                  <ChevronRightIcon
                    className={cn(
                      "ml-auto size-3.5 text-muted-foreground transition-transform duration-150",
                      rateLimitsOpen && "rotate-90",
                    )}
                  />
                </CollapsibleTrigger>
                <CollapsiblePanel>
                  <div className="space-y-2 px-3 pb-1 pt-1">
                    <RateLimitSummaryList rateLimits={rateLimits} />
                    {learnMoreHref ? (
                      <a
                        href={learnMoreHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 pt-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Learn more
                        <ExternalLinkIcon className="size-3" />
                      </a>
                    ) : null}
                  </div>
                </CollapsiblePanel>
              </Collapsible>
            </div>
          </LocalWorkspacePopover>
        ) : (
          <span className="inline-flex items-center gap-1 px-1.5 text-[10px] font-normal text-muted-foreground/60">
            <GitForkIcon className="size-3" />
            {activeWorktreePath ? "Worktree" : "New worktree"}
          </span>
        )}

        {canHandoffToWorktree && onHandoffToWorktree ? (
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1 px-1.5 text-[10px] font-normal text-muted-foreground/60 transition-colors hover:text-foreground/85 disabled:pointer-events-none disabled:opacity-50"
            disabled={handoffBusy}
            onClick={onHandoffToWorktree}
            title="Hand off to worktree"
          >
            <HandoffIcon className="size-3" />
            <span className="hidden @[460px]/pane:inline">Hand off</span>
          </button>
        ) : null}
        {canHandoffToLocal && onHandoffToLocal ? (
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1 px-1.5 text-[10px] font-normal text-muted-foreground/60 transition-colors hover:text-foreground/85 disabled:pointer-events-none disabled:opacity-50"
            disabled={handoffBusy}
            onClick={onHandoffToLocal}
            title="Hand off to local"
          >
            <HandoffIcon className="size-3" />
            <span className="hidden @[460px]/pane:inline">Hand off to local</span>
          </button>
        ) : null}
        {runtimeMode && onRuntimeModeChange ? (
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1 px-1.5 text-[10px] font-normal text-muted-foreground/60 transition-colors hover:text-foreground/85"
            onClick={() =>
              onRuntimeModeChange(
                runtimeMode === "full-access" ? "approval-required" : "full-access",
              )
            }
            title={
              runtimeMode === "full-access"
                ? "Full access — click to require approvals"
                : "Supervised — click for full access"
            }
          >
            {runtimeMode === "full-access" ? (
              <LiaUnlockAltSolid className="size-3 -scale-x-100" />
            ) : (
              <LiaLockSolid className="size-3" />
            )}
            <span className="hidden @[460px]/pane:inline">
              {runtimeMode === "full-access" ? "Full access" : "Supervised"}
            </span>
          </button>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <BranchToolbarBranchSelector
          activeProjectCwd={activeProject.cwd}
          activeThreadBranch={activeThreadBranch}
          activeWorktreePath={activeWorktreePath}
          branchCwd={branchCwd}
          effectiveEnvMode={effectiveEnvMode}
          envLocked={envLocked}
          onSetThreadWorkspace={setThreadWorkspace}
          {...(onCheckoutPullRequestRequest ? { onCheckoutPullRequestRequest } : {})}
          {...(onComposerFocusRequest ? { onComposerFocusRequest } : {})}
        />
        {contextWindow ? (
          <ContextWindowMeter
            usage={contextWindow}
            {...(cumulativeCostUsd != null ? { cumulativeCostUsd } : {})}
          />
        ) : null}
      </div>
    </div>
  );
}
