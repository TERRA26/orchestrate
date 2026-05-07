/**
 * Split-view project ownership guard (ORC-005).
 *
 * A split-view pane is anchored to a project (`splitView.ownerProjectId`).
 * Without this guard, the pane's thread picker could pick a thread from
 * any project, resulting in cross-project navigation that confuses both
 * the orchestrator scope (each project has its own runs / agents) and
 * the user (a single split-view should not span project boundaries).
 *
 * The pure helper here classifies whether a target thread is allowed
 * to enter a pane given the pane's owner project. Wiring callers
 * consult it before invoking navigate to a per-thread route.
 */
import type { ProjectId, ThreadId } from "@orchestrate/contracts";

export interface CrossProjectNavigationInput {
  readonly targetThreadId: ThreadId;
  readonly paneOwnerProjectId: ProjectId | null | undefined;
  readonly threads: ReadonlyArray<{
    readonly id: ThreadId;
    readonly projectId: ProjectId;
  }>;
}

export type CrossProjectNavigationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

export function classifyCrossProjectNavigation(
  input: CrossProjectNavigationInput,
): CrossProjectNavigationResult {
  // No project anchor on the pane = no constraint. (Should not normally
  // happen, but we don't want to break navigation when state is weird.)
  if (!input.paneOwnerProjectId) {
    return { ok: true };
  }

  const target = input.threads.find((t) => t.id === input.targetThreadId);

  // Target thread is not in the loaded threads list yet (still hydrating
  // or stale draft). Let other guards (routeThreadExists) handle that;
  // we don't reject just because we can't see the target.
  if (!target) {
    return { ok: true };
  }

  if (target.projectId === input.paneOwnerProjectId) {
    return { ok: true };
  }

  return {
    ok: false,
    reason:
      `Cross-project navigation rejected: target thread ${input.targetThreadId} ` +
      `is in project ${target.projectId}, but the split-view pane is ` +
      `anchored to project ${input.paneOwnerProjectId}.`,
  };
}

export function filterThreadsForProject<
  T extends { readonly id: ThreadId; readonly projectId: ProjectId },
>(threads: ReadonlyArray<T>, paneOwnerProjectId: ProjectId | null | undefined): ReadonlyArray<T> {
  if (!paneOwnerProjectId) return threads;
  return threads.filter((t) => t.projectId === paneOwnerProjectId);
}
