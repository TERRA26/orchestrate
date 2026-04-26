import {
  AlertTriangleIcon,
  BrainIcon,
  CheckCircleIcon,
  CircleAlertIcon,
  GlobeIcon,
  LoaderIcon,
  SendIcon,
  SquarePenIcon,
} from "lucide-react";

import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import type { OrchestratorStatus } from "./useOrchestratorEngine";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type StatusBarConfig = {
  icon: typeof LoaderIcon;
  label: string;
  color: string;
  spin: boolean;
};

const STATUS_BAR_CONFIG: Record<Exclude<OrchestratorStatus, "idle">, StatusBarConfig> = {
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
  completed: {
    icon: CheckCircleIcon,
    label: "Finished",
    color: "text-emerald-500",
    spin: false,
  },
  failed: {
    icon: CircleAlertIcon,
    label: "Orchestrator run failed",
    color: "text-destructive",
    spin: false,
  },
  stuck: {
    icon: AlertTriangleIcon,
    label: "Agent appears stuck",
    color: "text-amber-500",
    spin: false,
  },
};

function OrchestratorStatusBar({
  status,
  detail,
}: {
  status: OrchestratorStatus;
  detail?: string | null;
}) {
  if (status === "idle") return null;
  const config = STATUS_BAR_CONFIG[status];
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
      {/* ---- Title bar (Orchestrate design: slim 36px + orch-tag) ---- */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/40 px-3">
        <div className="orch-tag">
          <span className="orch-tag-dot" />
          <BrainIcon className="size-3.5 opacity-60" />
          <span>Orchestrator</span>
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

      {/* ---- Status bar ---- */}
      <OrchestratorStatusBar status={status} detail={statusDetail} />
    </>
  );
}
