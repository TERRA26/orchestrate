import {
  BrainIcon,
  CheckCircleIcon,
  CircleIcon,
  EyeIcon,
  EyeOffIcon,
  LoaderIcon,
  PauseIcon,
  SendIcon,
  SquarePenIcon,
} from "lucide-react";

import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import type { OrchestratorStatus } from "./useOrchestratorEngine";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type AgentPhase = "disconnected" | "connecting" | "ready" | "running";

function AgentStatusBadge({ phase }: { phase: AgentPhase }) {
  if (phase === "running") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-amber-500">
        <LoaderIcon className="size-3 animate-spin" />
        Running
      </span>
    );
  }
  if (phase === "connecting") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <LoaderIcon className="size-3 animate-spin" />
        Connecting
      </span>
    );
  }
  if (phase === "ready") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-green-500">
        <CircleIcon className="size-2.5 fill-current" />
        Ready
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <PauseIcon className="size-3" />
      Idle
    </span>
  );
}

function OrchestratorStatusBar({
  status,
  detail,
}: {
  status: OrchestratorStatus;
  detail?: string | null;
}) {
  if (status === "idle") return null;

  const config = {
    thinking: { icon: LoaderIcon, label: "Thinking...", color: "text-amber-500", spin: true },
    sending: { icon: SendIcon, label: "Sending to agent...", color: "text-blue-500", spin: false },
    waiting: { icon: LoaderIcon, label: "Agent working...", color: "text-amber-500", spin: true },
    reviewing: {
      icon: CheckCircleIcon,
      label: "Reviewing output",
      color: "text-green-500",
      spin: false,
    },
  }[status];

  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2 border-b border-border/50 px-3 py-1.5">
      <Icon className={cn("size-3 shrink-0", config.color, config.spin && "animate-spin")} />
      <span className="truncate text-xs text-muted-foreground">{detail ?? config.label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface OrchestratorHeaderProps {
  managedThread: { title: string; activities?: ReadonlyArray<{ summary: string }> } | undefined;
  agentPhase: string;
  latestActivity: { summary: string } | null;
  status: OrchestratorStatus;
  statusDetail: string | null;
  threadBrowserSession: unknown;
  isThreadBrowserSessionVisible: boolean;
  isBusy: boolean;
  onToggleBrowserPreview: () => void;
  onStartNewChat: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OrchestratorHeader({
  managedThread,
  agentPhase,
  latestActivity,
  status,
  statusDetail,
  threadBrowserSession,
  isThreadBrowserSessionVisible,
  isBusy,
  onToggleBrowserPreview,
  onStartNewChat,
}: OrchestratorHeaderProps) {
  return (
    <>
      {/* ---- Title bar ---- */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/30 px-3 dark:border-white/[0.03]">
        <div className="flex items-center gap-2">
          <BrainIcon className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Orchestrator</span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 text-muted-foreground hover:text-foreground disabled:opacity-45"
            title={
              threadBrowserSession
                ? isThreadBrowserSessionVisible
                  ? "Hide browser preview"
                  : "Show browser preview"
                : "No browser preview for this thread"
            }
            aria-label={
              threadBrowserSession
                ? isThreadBrowserSessionVisible
                  ? "Hide browser preview"
                  : "Show browser preview"
                : "No browser preview for this thread"
            }
            disabled={!threadBrowserSession}
            onClick={onToggleBrowserPreview}
          >
            {threadBrowserSession && !isThreadBrowserSessionVisible ? (
              <EyeOffIcon className="size-3.5" />
            ) : (
              <EyeIcon className="size-3.5" />
            )}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 text-muted-foreground hover:text-foreground"
            title="New orchestrator chat"
            aria-label="New orchestrator chat"
            disabled={isBusy}
            onClick={onStartNewChat}
          >
            <SquarePenIcon className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* ---- Agent context bar ---- */}
      {managedThread ? (
        <div className="flex shrink-0 items-center justify-between border-b border-border/30 px-3 py-1.5 dark:border-white/[0.03]">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs">
              <span className="text-muted-foreground">Agent:</span>{" "}
              <span className="font-medium">{managedThread.title}</span>
            </p>
            {latestActivity ? (
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {latestActivity.summary}
              </p>
            ) : null}
          </div>
          <div className="ml-2 shrink-0">
            <AgentStatusBadge phase={agentPhase as AgentPhase} />
          </div>
        </div>
      ) : null}

      {/* ---- Status bar ---- */}
      <OrchestratorStatusBar status={status} detail={statusDetail} />
    </>
  );
}
