import {
  BrainIcon,
  CheckCircleIcon,
  CircleIcon,
  GlobeIcon,
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
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
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
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
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
    thinking: {
      icon: LoaderIcon,
      label: "Thinking...",
      color: "text-muted-foreground",
      spin: true,
    },
    sending: {
      icon: SendIcon,
      label: "Sending to agent...",
      color: "text-muted-foreground",
      spin: false,
    },
    waiting: {
      icon: LoaderIcon,
      label: "Agent working...",
      color: "text-muted-foreground",
      spin: true,
    },
    reviewing: {
      icon: CheckCircleIcon,
      label: "Reviewing output",
      color: "text-muted-foreground",
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
  hasBrowserContext: boolean;
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
  hasBrowserContext,
  isBusy,
  onToggleBrowserPreview,
  onStartNewChat,
}: OrchestratorHeaderProps) {
  const hasBrowserWorkspace = Boolean(threadBrowserSession);
  const browserState = hasBrowserWorkspace
    ? isThreadBrowserSessionVisible
      ? "live"
      : "hidden"
    : hasBrowserContext
      ? "idle"
      : "unavailable";
  const browserLabel =
    browserState === "live"
      ? "Browser live"
      : browserState === "hidden"
        ? "Browser hidden"
        : browserState === "idle"
          ? "Browser idle"
          : "Browser unavailable";
  const browserTitle =
    browserState === "live"
      ? "Hide browser workspace"
      : browserState === "hidden"
        ? "Show browser workspace"
        : browserState === "idle"
          ? "Browser workspace is ready and will attach when validation opens a session"
          : "No browser workspace is attached to this thread";

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
            variant="ghost"
            className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground/50 hover:text-foreground/70 disabled:opacity-45"
            title={browserTitle}
            aria-label={browserTitle}
            disabled={!hasBrowserWorkspace}
            onClick={onToggleBrowserPreview}
          >
            <span className="size-1 rounded-full bg-foreground/30" />
            <GlobeIcon className="size-3.5" />
            <span className="hidden sm:inline">{browserLabel}</span>
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
