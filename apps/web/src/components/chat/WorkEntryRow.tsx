import { memo, useEffect, useState } from "react";

import type { WorkLogEntry } from "../../session-logic";
import {
  fetchEvidenceArtifactImageDataUrl,
  fetchReviewerUserVisibleSummary,
} from "~/browserEvidenceArtifacts";
import {
  browserEvidenceWorkSummary,
  browserApprovalWorkSummary,
  browserAnnotationWorkSummary,
  browserControlWorkSummary,
  browserRuntimeTruthLabel,
  browserScreenshotDataUrls,
  browserTargetedActionWorkSummary,
  reviewerDecisionWorkSummary,
  stripOrchestrationToolPrefix,
} from "~/browserWorkLog";
import { BrowserScreenshotImage } from "~/components/BrowserScreenshotImage";
import { cn } from "~/lib/utils";
import { ensureNativeApi } from "~/nativeApi";
import { browserRuntimeKindLabel } from "~/orchestratorPresentation";
import { normalizeCompactToolLabel } from "./MessagesTimeline.logic";
import { isOrchestrationToolCall } from "../orchestrator/OrchestrationToolCallCard";
import {
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  EyeIcon,
  GlobeIcon,
  HammerIcon,
  type LucideIcon,
  SquarePenIcon,
  TerminalIcon,
  WrenchIcon,
  ZapIcon,
} from "~/lib/icons";

export interface WorkEntryRowProps {
  workEntry: WorkLogEntry;
  className?: string;
  onOpenWorkerPanel?: (input: { workerId?: string; threadId?: string }) => void;
}

const ORCH_TOOL_DISPLAY_LABELS: Record<string, string> = {
  orchestrate_spawn_agent: "orchestrate_spawn_agent",
  orchestrate_accept_work: "orchestrate_accept_work",
  orchestrate_reject_work: "orchestrate_reject_work",
  orchestrate_terminate_agent: "orchestrate_terminate_agent",
  orchestrate_wait_agent: "orchestrate_wait_agent",
  orchestrate_wait_all: "orchestrate_wait_all",
  orchestrate_review_agent_work: "orchestrate_review_agent_work",
  orchestrate_send_to_agent: "orchestrate_send_to_agent",
  orchestrate_focus_agent: "orchestrate_focus_agent",
  orchestrate_open_browser_preview: "open browser preview",
  orchestrate_browser_open_session: "capture browser screenshot",
  orchestrate_browser_act: "browser observation",
  orchestrate_browser_close_session: "close browser session",
};

function shortWorkerId(workerId: string | undefined): string | null {
  if (!workerId) return null;
  return workerId.length > 8 ? workerId.slice(-8) : workerId;
}

function workToneIcon(tone: WorkLogEntry["tone"]): {
  icon: LucideIcon;
  className: string;
} {
  if (tone === "error") {
    return {
      icon: CircleAlertIcon,
      className: "text-foreground/92",
    };
  }
  if (tone === "thinking") {
    return {
      icon: BotIcon,
      className: "text-foreground/92",
    };
  }
  if (tone === "info") {
    return {
      icon: CheckIcon,
      className: "text-foreground/92",
    };
  }
  return {
    icon: ZapIcon,
    className: "text-foreground/92",
  };
}

function workToneClass(tone: "thinking" | "tool" | "info" | "error"): string {
  if (tone === "error") return "text-rose-300/50 dark:text-rose-300/50";
  if (tone === "tool") return "text-muted-foreground/70";
  if (tone === "thinking") return "text-muted-foreground/50";
  return "text-muted-foreground/40";
}

function compactPreviewText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function workEntryPreview(
  workEntry: Pick<WorkLogEntry, "detail" | "command" | "changedFiles" | "output">,
) {
  if (workEntry.command) return compactPreviewText(workEntry.command);
  if (workEntry.detail) return compactPreviewText(workEntry.detail);
  if (workEntry.output) return compactPreviewText(workEntry.output);
  if ((workEntry.changedFiles?.length ?? 0) === 0) return null;
  const [firstPath] = workEntry.changedFiles ?? [];
  if (!firstPath) return null;
  return workEntry.changedFiles!.length === 1
    ? firstPath
    : `${firstPath} +${workEntry.changedFiles!.length - 1} more`;
}

function BrowserScreenshotPreview({
  screenshot,
}: {
  screenshot: { thumbnailDataUrl: string; fullDataUrl?: string };
}) {
  return (
    <BrowserScreenshotImage
      thumbnailDataUrl={screenshot.thumbnailDataUrl}
      {...(screenshot.fullDataUrl ? { fullDataUrl: screenshot.fullDataUrl } : {})}
      className="mt-2 h-28 w-44"
    />
  );
}

function BrowserEvidenceCard({
  summary,
}: {
  summary: NonNullable<ReturnType<typeof browserEvidenceWorkSummary>>;
}) {
  const [artifactPreviewUrl, setArtifactPreviewUrl] = useState<string | null>(null);
  const [artifactFetchFailed, setArtifactFetchFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setArtifactPreviewUrl(null);
    setArtifactFetchFailed(false);
    if (!summary.screenshotArtifactRef) return;

    void fetchEvidenceArtifactImageDataUrl(ensureNativeApi(), summary.screenshotArtifactRef)
      .then((dataUrl) => {
        if (cancelled) return;
        if (!dataUrl) {
          setArtifactFetchFailed(true);
          return;
        }
        setArtifactPreviewUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setArtifactFetchFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [summary.screenshotArtifactRef]);

  const screenshot = artifactPreviewUrl
    ? { thumbnailDataUrl: artifactPreviewUrl, fullDataUrl: artifactPreviewUrl }
    : summary.screenshot;

  return (
    <div className="rounded-md border border-border/45 bg-background/45 px-3 py-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground/90">{summary.title}</span>
        <span
          className={cn(
            "rounded border px-1.5 py-0.5",
            summary.isDurable
              ? "border-emerald-500/25 text-emerald-300"
              : "border-amber-500/30 text-amber-300",
          )}
        >
          {summary.runtimeLabel}
        </span>
      </div>
      <div className="mt-1 text-muted-foreground">{summary.statusLabel}</div>
      {summary.observedUrl ? (
        <div className="mt-2 truncate text-muted-foreground/80" title={summary.observedUrl}>
          URL {summary.observedUrl}
        </div>
      ) : null}
      {summary.visiblePanelUrl && summary.visiblePanelUrl !== summary.observedUrl ? (
        <div className="mt-1 truncate text-muted-foreground/70" title={summary.visiblePanelUrl}>
          Visible {summary.visiblePanelUrl}
        </div>
      ) : null}
      {summary.urlAgreement && summary.urlAgreement !== "unknown" ? (
        <div className="mt-1 text-muted-foreground/70">URL {summary.urlAgreement}</div>
      ) : null}
      {screenshot ? <BrowserScreenshotPreview screenshot={screenshot} /> : null}
      <div className="mt-2 flex flex-wrap gap-1.5 text-muted-foreground/70">
        <span>{browserRuntimeKindLabel(summary.runtimeKind)}</span>
        {summary.screenshotArtifactRef ? (
          <span>Screenshot {summary.screenshotArtifactRef}</span>
        ) : null}
        {artifactFetchFailed ? <span>Artifact preview unavailable</span> : null}
        {summary.evidenceRefs.length > 0 ? (
          <span>{summary.evidenceRefs.length} evidence ref(s)</span>
        ) : (
          <span>Not recorded as durable evidence</span>
        )}
      </div>
    </div>
  );
}

function ReviewerDecisionCard({
  summary,
}: {
  summary: NonNullable<ReturnType<typeof reviewerDecisionWorkSummary>>;
}) {
  const [artifactSummary, setArtifactSummary] = useState<{
    readonly outcome?: string;
    readonly confidence?: string;
    readonly failedGateCount: number;
    readonly findingCount: number;
    readonly nextActions: ReadonlyArray<string>;
  } | null>(null);
  const [artifactFetchFailed, setArtifactFetchFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setArtifactSummary(null);
    setArtifactFetchFailed(false);
    if (!summary.userVisibleSummaryRef) return;

    void fetchReviewerUserVisibleSummary(ensureNativeApi(), summary.userVisibleSummaryRef)
      .then((next) => {
        if (cancelled) return;
        if (!next) {
          setArtifactFetchFailed(true);
          return;
        }
        setArtifactSummary({
          outcome: next.outcome,
          confidence: next.confidence,
          failedGateCount: next.gates.filter((gate) => gate.status === "fail").length,
          findingCount: next.findings.length,
          nextActions: next.actionPacket?.recommendedNextActions ?? [],
        });
      })
      .catch(() => {
        if (!cancelled) setArtifactFetchFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [summary.userVisibleSummaryRef]);

  const failedGates = summary.gates.filter((gate) => gate.status === "fail");
  const warningGates = summary.gates.filter((gate) => gate.status === "warn");
  const badgeLabel = (artifactSummary?.outcome ?? summary.outcome).replaceAll("-", " ");
  const nextActions =
    artifactSummary?.nextActions.length && artifactSummary.nextActions.length > 0
      ? artifactSummary.nextActions
      : (summary.actionPacket?.recommendedNextActions ?? []);
  return (
    <div className="rounded-md border border-border/45 bg-background/45 px-3 py-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium capitalize text-foreground/90">{badgeLabel}</span>
        {summary.purpose ? (
          <span className="rounded border border-border/50 px-1.5 py-0.5 text-muted-foreground">
            {summary.purpose}
          </span>
        ) : null}
        {summary.confidence ? (
          <span className="text-muted-foreground">confidence {summary.confidence}</span>
        ) : null}
      </div>
      {artifactSummary ? (
        <div className="mt-2 space-y-1 text-muted-foreground">
          <div className="font-medium text-foreground/85">Artifact-backed reviewer summary</div>
          <p>
            {artifactSummary.failedGateCount} failed gate
            {artifactSummary.failedGateCount === 1 ? "" : "s"} · {artifactSummary.findingCount}{" "}
            finding{artifactSummary.findingCount === 1 ? "" : "s"}
            {artifactSummary.confidence ? ` · confidence ${artifactSummary.confidence}` : ""}
          </p>
        </div>
      ) : null}
      {summary.gates.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {summary.gates.slice(0, 8).map((gate) => (
            <span
              key={gate.name}
              className={cn(
                "rounded border px-1.5 py-0.5",
                gate.status === "pass"
                  ? "border-emerald-500/25 text-emerald-300"
                  : gate.status === "fail"
                    ? "border-rose-500/30 text-rose-300"
                    : "border-amber-500/30 text-amber-300",
              )}
              title={gate.message}
            >
              {gate.name}: {gate.status}
            </span>
          ))}
        </div>
      ) : null}
      {nextActions.length > 0 ? (
        <div className="mt-2 border-t border-border/35 pt-2">
          <div className="font-medium text-foreground/80">
            Next actions
            {summary.actionPacket ? ` · ${summary.actionPacket.kind}` : ""}
          </div>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
            {nextActions.slice(0, 4).map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {failedGates.length > 0 || warningGates.length > 0 || summary.findings.length > 0 ? (
        <div className="mt-2 text-muted-foreground">
          {failedGates.length} failed gate{failedGates.length === 1 ? "" : "s"}
          {warningGates.length > 0 ? ` · ${warningGates.length} warning gate(s)` : ""}
          {summary.findings.length > 0 ? ` · ${summary.findings.length} finding(s)` : ""}
        </div>
      ) : null}
      <div className="mt-2 truncate text-muted-foreground/70">
        {summary.userVisibleSummaryRef ? `Summary ${summary.userVisibleSummaryRef}` : null}
        {summary.evidenceBundleId ? ` · Bundle ${summary.evidenceBundleId}` : null}
        {artifactFetchFailed ? " · embedded fallback" : null}
      </div>
    </div>
  );
}

function actionTargetSummary(
  action: NonNullable<ReturnType<typeof browserApprovalWorkSummary>>["action"] | undefined,
) {
  if (!action) return "Approval details unavailable";
  if (action.kind === "navigate") return action.url;
  if ("targetId" in action && typeof action.targetId === "string") return action.targetId;
  if ("text" in action && typeof action.text === "string")
    return `${action.kind} · ${action.text.slice(0, 48)}`;
  if ("key" in action && typeof action.key === "string") return `${action.kind} · ${action.key}`;
  return action.kind;
}

function BrowserApprovalCard({
  summary,
}: {
  summary: NonNullable<ReturnType<typeof browserApprovalWorkSummary>>;
}) {
  const [approval, setApproval] = useState(summary);
  const [busy, setBusy] = useState<"approved" | "rejected" | null>(null);

  const respond = async (decision: "approved" | "rejected") => {
    setBusy(decision);
    try {
      const result = await ensureNativeApi().browser.approval.respond({
        approvalId: summary.approvalId,
        decision,
      });
      setApproval({
        approvalId: result.approval.id,
        browserSessionId: result.approval.browserSessionId,
        action: result.approval.action,
        actionHash: result.approval.actionHash,
        risk: result.approval.risk,
        reason: result.approval.reason,
        status: result.approval.status,
        evidenceRefs: [...result.approval.evidenceRefs],
        ...(result.approval.origin ? { origin: result.approval.origin } : {}),
        ...(result.approval.observedUrl ? { observedUrl: result.approval.observedUrl } : {}),
        ...(result.approval.resolvedTarget
          ? {
              targetLabel:
                result.approval.resolvedTarget.role && result.approval.resolvedTarget.name
                  ? `${result.approval.resolvedTarget.role} ${result.approval.resolvedTarget.name}`
                  : (result.approval.resolvedTarget.name ??
                    result.approval.resolvedTarget.text ??
                    result.approval.resolvedTarget.testId),
            }
          : {}),
      });
    } finally {
      setBusy(null);
    }
  };

  const isPending = approval.status === "pending";
  const heading =
    approval.status === "approved"
      ? "Approved"
      : approval.status === "rejected"
        ? "Rejected"
        : approval.status === "expired"
          ? "Approval expired"
          : approval.status === "consumed"
            ? "Approved action executed"
            : "Approval required";
  return (
    <div className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground/90">{heading}</span>
        <span className="rounded border border-amber-500/35 px-1.5 py-0.5 text-amber-300">
          {approval.status}
        </span>
        <span className="text-muted-foreground">Risk: {approval.risk}</span>
      </div>
      <div
        className="mt-1 truncate text-muted-foreground/85"
        title={actionTargetSummary(approval.action)}
      >
        {approval.action ? (
          <>
            Action: {approval.action.kind} · {actionTargetSummary(approval.action)}
          </>
        ) : (
          "Approval details unavailable"
        )}
      </div>
      {approval.targetLabel ? (
        <div className="mt-1 truncate text-muted-foreground/85" title={approval.targetLabel}>
          Target: {approval.targetLabel}
        </div>
      ) : null}
      {!approval.browserSessionId ? (
        <div className="mt-1 text-muted-foreground/70">Browser session unavailable</div>
      ) : null}
      {approval.origin || approval.observedUrl ? (
        <div
          className="mt-1 truncate text-muted-foreground/70"
          title={approval.origin ?? approval.observedUrl}
        >
          {approval.origin ?? approval.observedUrl}
        </div>
      ) : null}
      {approval.reason ? (
        <div className="mt-1 text-muted-foreground/80">{approval.reason}</div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground/70">
        <span>{approval.evidenceRefs.length} evidence ref(s)</span>
        {approval.actionHash ? <span>Action {approval.actionHash.slice(0, 10)}</span> : null}
      </div>
      {isPending ? (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="rounded border border-emerald-500/35 px-2 py-1 text-emerald-300 disabled:opacity-50"
            disabled={busy !== null}
            onClick={() => void respond("approved")}
          >
            Approve
          </button>
          <button
            type="button"
            className="rounded border border-rose-500/35 px-2 py-1 text-rose-300 disabled:opacity-50"
            disabled={busy !== null}
            onClick={() => void respond("rejected")}
          >
            Reject
          </button>
        </div>
      ) : null}
    </div>
  );
}

function BrowserControlCard({
  summary,
}: {
  summary: NonNullable<ReturnType<typeof browserControlWorkSummary>>;
}) {
  return (
    <div className="rounded-md border border-sky-500/25 bg-sky-500/5 px-3 py-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground/90">{summary.label}</span>
        <span className="rounded border border-sky-500/35 px-1.5 py-0.5 text-sky-300">
          {summary.eventType}
        </span>
      </div>
      {summary.browserSessionId ? (
        <div className="mt-1 truncate text-muted-foreground/85" title={summary.browserSessionId}>
          Session: {summary.browserSessionId}
        </div>
      ) : null}
      {summary.reason ? (
        <div className="mt-1 text-muted-foreground/80">{summary.reason}</div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground/70">
        <span>{summary.evidenceRefs.length} evidence ref(s)</span>
      </div>
    </div>
  );
}

function BrowserAnnotationCard({
  summary,
}: {
  summary: NonNullable<ReturnType<typeof browserAnnotationWorkSummary>>;
}) {
  const [cropDataUrl, setCropDataUrl] = useState<string | null>(null);
  const [cropFailed, setCropFailed] = useState(false);
  const [actionState, setActionState] = useState<
    "idle" | "busy" | "done" | "failed" | "rework-drafted" | "rework-started"
  >("idle");

  useEffect(() => {
    let cancelled = false;
    setCropDataUrl(null);
    setCropFailed(false);
    if (!summary.cropArtifactRef) return;
    void fetchEvidenceArtifactImageDataUrl(ensureNativeApi(), summary.cropArtifactRef)
      .then((dataUrl) => {
        if (cancelled) return;
        if (dataUrl) setCropDataUrl(dataUrl);
        else setCropFailed(true);
      })
      .catch(() => {
        if (!cancelled) setCropFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [summary.cropArtifactRef]);

  const updateAnnotationStatus = (action: "resolve" | "reopen") => {
    if (!summary.annotationId) return;
    setActionState("busy");
    const api = ensureNativeApi();
    const request =
      action === "resolve"
        ? api.browser.resolveAnnotation({ annotationId: summary.annotationId })
        : api.browser.reopenAnnotation({ annotationId: summary.annotationId });
    void request.then(() => setActionState("done")).catch(() => setActionState("failed"));
  };

  const startRework = () => {
    if (!summary.annotationId) return;
    setActionState("busy");
    void ensureNativeApi()
      .reviewer.decision.startRework({
        annotationIds: [summary.annotationId],
        mode: "draft-task",
      })
      .then((result) => {
        setActionState(result.status === "started" ? "rework-started" : "rework-drafted");
      })
      .catch(() => setActionState("failed"));
  };

  return (
    <div className="rounded-md border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground/90">{summary.label}</span>
        {summary.status ? (
          <span className="rounded border border-emerald-500/35 px-1.5 py-0.5 text-emerald-300">
            {summary.status}
          </span>
        ) : null}
      </div>
      {summary.targetLabel ? (
        <div className="mt-1 truncate text-muted-foreground/85" title={summary.targetLabel}>
          Target: {summary.targetLabel}
        </div>
      ) : null}
      {summary.url ? (
        <div className="mt-1 truncate text-muted-foreground/70" title={summary.url}>
          {summary.url}
        </div>
      ) : null}
      {summary.comment ? (
        <div className="mt-1 text-muted-foreground/90">{summary.comment}</div>
      ) : null}
      {cropDataUrl ? (
        <img
          src={cropDataUrl}
          alt="Browser comment crop"
          className="mt-2 max-h-40 rounded border border-emerald-500/20 object-contain"
        />
      ) : summary.cropArtifactRef ? (
        <div className="mt-2 text-muted-foreground/70">
          {cropFailed ? "Crop unavailable" : "Loading crop..."}
        </div>
      ) : (
        <div className="mt-2 text-muted-foreground/70">No crop captured</div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground/70">
        <span>{summary.evidenceRefs.length} evidence ref(s)</span>
        {summary.cropArtifactRef ? <span>Crop {summary.cropArtifactRef}</span> : null}
      </div>
      {summary.annotationId ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-emerald-500/15 pt-2">
          {summary.status === "resolved" ? (
            <button
              type="button"
              className="rounded border border-emerald-500/35 px-2 py-1 text-emerald-200 disabled:opacity-60"
              disabled={actionState === "busy"}
              onClick={() => updateAnnotationStatus("reopen")}
            >
              Reopen
            </button>
          ) : (
            <>
              <button
                type="button"
                className="rounded border border-emerald-500/35 px-2 py-1 text-emerald-200 disabled:opacity-60"
                disabled={actionState === "busy"}
                onClick={() => updateAnnotationStatus("resolve")}
              >
                Resolve
              </button>
              <button
                type="button"
                className="rounded border border-border/45 px-2 py-1 text-muted-foreground disabled:opacity-60"
                disabled={actionState === "busy"}
                onClick={startRework}
              >
                Start rework
              </button>
            </>
          )}
          {actionState === "done" ? (
            <span className="text-emerald-300">Updated</span>
          ) : actionState === "failed" ? (
            <span className="text-rose-300">Update failed</span>
          ) : actionState === "rework-drafted" ? (
            <span className="text-emerald-300">Rework task drafted</span>
          ) : actionState === "rework-started" ? (
            <span className="text-emerald-300">Rework task started</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BrowserTargetedActionCard({
  summary,
}: {
  summary: NonNullable<ReturnType<typeof browserTargetedActionWorkSummary>>;
}) {
  return (
    <div className="rounded-md border border-blue-500/25 bg-blue-500/5 px-3 py-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground/90">{summary.title}</span>
        <span className="rounded border border-blue-500/35 px-1.5 py-0.5 text-blue-300">
          {summary.actionKind}
        </span>
        <span className="text-muted-foreground">Target: {summary.targetLabel}</span>
      </div>
      {summary.reason ? (
        <div className="mt-1 text-muted-foreground/80">{summary.reason}</div>
      ) : null}
      <div className="mt-2 text-muted-foreground/70">
        {summary.evidenceRefs.length} evidence ref(s)
        {summary.evidenceRefs.length > 0 ? " · Screenshot captured" : ""}
      </div>
    </div>
  );
}

function browserToolCallLabel(toolName: string, detail: string | undefined, isLoading: boolean) {
  if (toolName === "orchestrate_open_browser_preview") {
    return isLoading ? "Opening visible browser preview" : "Visible browser preview opened";
  }
  if (toolName === "orchestrate_browser_open_session") {
    return isLoading
      ? "Capturing browser screenshot and ARIA snapshot"
      : "Browser screenshot and ARIA snapshot captured";
  }
  if (toolName === "orchestrate_browser_close_session") {
    return isLoading ? "Closing browser session" : "Browser session closed";
  }
  if (toolName !== "orchestrate_browser_act") {
    return null;
  }

  const normalizedDetail = detail ?? "";
  if (
    normalizedDetail.includes('"kind":"scroll"') ||
    normalizedDetail.includes('"kind": "scroll"')
  ) {
    return isLoading
      ? "Scrolling and capturing browser screenshot"
      : "Scroll observation screenshot captured";
  }
  if (
    normalizedDetail.includes('"kind":"evaluate"') ||
    normalizedDetail.includes('"kind": "evaluate"')
  ) {
    return isLoading ? "Evaluating page after screenshot" : "Page evaluation observation captured";
  }
  if (
    normalizedDetail.includes('"kind":"navigate"') ||
    normalizedDetail.includes('"kind": "navigate"')
  ) {
    return isLoading ? "Navigating browser and observing" : "Navigation observation captured";
  }
  return isLoading ? "Acting in browser and capturing observation" : "Browser observation captured";
}

function workEntryIcon(workEntry: WorkLogEntry): LucideIcon {
  if (workEntry.requestKind === "command") return TerminalIcon;
  if (workEntry.requestKind === "file-read") return EyeIcon;
  if (workEntry.requestKind === "file-change") return SquarePenIcon;

  if (workEntry.itemType === "command_execution" || workEntry.command) {
    return TerminalIcon;
  }
  if (workEntry.itemType === "file_change" || (workEntry.changedFiles?.length ?? 0) > 0) {
    return SquarePenIcon;
  }
  if (workEntry.itemType === "web_search") return GlobeIcon;
  if (workEntry.itemType === "image_view") return EyeIcon;

  switch (workEntry.itemType) {
    case "mcp_tool_call":
      return WrenchIcon;
    case "dynamic_tool_call":
    case "collab_agent_tool_call":
      return HammerIcon;
  }

  return workToneIcon(workEntry.tone).icon;
}

function capitalizePhrase(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return value;
  }
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

function toolWorkEntryHeading(workEntry: WorkLogEntry): string {
  if (!workEntry.toolTitle) {
    return capitalizePhrase(normalizeCompactToolLabel(workEntry.label));
  }
  return capitalizePhrase(normalizeCompactToolLabel(workEntry.toolTitle));
}

function OrchSpawnCard({
  toolDisplay,
  workerBadge,
  title,
  threadId,
  isLoading,
  onOpenWorker,
}: {
  toolDisplay: string;
  workerBadge: string | null;
  title: string;
  threadId?: string;
  isLoading: boolean;
  onOpenWorker?: () => void;
}) {
  const statusLabel = isLoading ? "running" : "done";
  const statusClass = isLoading ? "orch-status-running" : "orch-status-done";
  return (
    <div
      className={cn("orch-spawn-card", onOpenWorker ? "" : "cursor-default")}
      onClick={onOpenWorker}
      role={onOpenWorker ? "button" : undefined}
    >
      <div className="orch-spawn-head">
        <span className="orch-spawn-tool">{toolDisplay}</span>
        <span className={cn("orch-spawn-status", statusClass)}>
          <span
            className={cn("orch-status-dot", isLoading ? "orch-pulsing" : "")}
            aria-hidden="true"
          />
          {statusLabel}
        </span>
      </div>
      <div className="orch-spawn-body">
        <div className="orch-spawn-worker-id">
          {workerBadge ? <span className="orch-worker-badge">{workerBadge}</span> : null}
          <span className="orch-spawn-title">{title}</span>
        </div>
        {threadId ? (
          <div className="orch-spawn-params">
            <span className="orch-id-chip">{threadId.slice(-8)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function OrchAcceptCard({
  toolDisplay,
  title,
  isLoading,
  isReject,
}: {
  toolDisplay: string;
  title: string;
  isLoading: boolean;
  isReject?: boolean;
}) {
  return (
    <div
      className="orch-accept-card"
      style={isReject ? { borderColor: "var(--warning)" } : undefined}
    >
      <div className="orch-accept-head">
        <span
          className="orch-accept-icon"
          style={isReject ? { background: "var(--warning)" } : undefined}
        >
          {isLoading ? "…" : isReject ? "↻" : "✓"}
        </span>
        <span
          className="orch-accept-label"
          style={isReject ? { color: "var(--warning)" } : undefined}
        >
          {toolDisplay}
        </span>
      </div>
      <div className="orch-accept-title">{title}</div>
    </div>
  );
}

function OrchThinkRow({
  label,
  isLoading,
  detail,
}: {
  label: string;
  isLoading: boolean;
  detail?: string;
}) {
  return (
    <div className={cn("orch-think-row", isLoading ? "orch-think-live" : "")}>
      {isLoading ? (
        <span className="orch-think-spin">
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            aria-hidden="true"
            className="animate-spin"
          >
            <path d="M21 12a9 9 0 1 1-9-9" />
          </svg>
        </span>
      ) : (
        <span className="orch-think-check">✓</span>
      )}
      <span>{label}</span>
      {detail ? <span className="orch-think-dur">{detail}</span> : null}
    </div>
  );
}

function OrchInstrumentBlock({
  badge,
  command,
  output,
  changedFiles,
  diffCount,
  duration,
  variant,
}: {
  badge: string;
  command?: string;
  output?: string;
  changedFiles?: ReadonlyArray<string>;
  diffCount?: { add?: number; del?: number };
  duration?: string;
  variant: "command" | "file";
}) {
  const hasExtraFiles =
    variant === "file" && Array.isArray(changedFiles) && changedFiles.length > 1;
  const isExpandable = Boolean(output) || hasExtraFiles;
  const [expanded, setExpanded] = useState(false);
  const toggle = () => {
    if (isExpandable) setExpanded((prev) => !prev);
  };

  return (
    <div
      className={cn(
        "orch-instrument",
        variant === "file" ? "orch-instrument-file" : "",
        isExpandable ? "orch-instrument-expandable" : "",
        expanded ? "orch-instrument-open" : "",
      )}
    >
      <button
        type="button"
        className="orch-instrument-head"
        onClick={toggle}
        aria-expanded={isExpandable ? expanded : undefined}
        disabled={!isExpandable}
      >
        {isExpandable ? (
          <span className="orch-instrument-caret" aria-hidden>
            {expanded ? (
              <ChevronDownIcon className="size-3" />
            ) : (
              <ChevronRightIcon className="size-3" />
            )}
          </span>
        ) : null}
        <span className="orch-instrument-badge">{badge}</span>
        {variant === "command" && command ? (
          <span
            className={cn(
              "orch-instrument-cmd-inline",
              expanded ? "orch-instrument-cmd-inline-wrap" : "",
            )}
          >
            {command}
          </span>
        ) : null}
        {variant === "file" && changedFiles && changedFiles[0] ? (
          <span className="orch-instrument-path">{changedFiles[0]}</span>
        ) : null}
        {duration ? <span className="orch-instrument-dur">{duration}</span> : null}
        {diffCount ? (
          <span className="orch-instrument-dur">
            {diffCount.add ? <span className="orch-diff-add">+{diffCount.add}</span> : null}
            {diffCount.add && diffCount.del ? " " : null}
            {diffCount.del ? <span className="orch-diff-del">−{diffCount.del}</span> : null}
          </span>
        ) : null}
      </button>
      {expanded && output ? <pre className="orch-instrument-out">{output}</pre> : null}
      {expanded && hasExtraFiles ? (
        <div className="orch-instrument-out">
          {changedFiles!.slice(1, 12).map((p) => (
            <div key={p}>{p}</div>
          ))}
          {changedFiles!.length > 12 ? (
            <div className="text-muted-foreground">+{changedFiles!.length - 12} more</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export const WorkEntryRow = memo(function WorkEntryRow({
  workEntry,
  className,
  onOpenWorkerPanel,
}: WorkEntryRowProps) {
  const isLoading = workEntry.tone === "thinking";
  const orchTool = stripOrchestrationToolPrefix(workEntry.toolName);
  const reviewerSummary = reviewerDecisionWorkSummary(workEntry);
  const annotationSummary = browserAnnotationWorkSummary(workEntry);
  const approvalSummary = browserApprovalWorkSummary(workEntry);
  const controlSummary = browserControlWorkSummary(workEntry);
  const targetedActionSummary = browserTargetedActionWorkSummary(workEntry);
  const handleOpenWorker = () => {
    if (!onOpenWorkerPanel) return;
    onOpenWorkerPanel({
      ...(workEntry.workerId ? { workerId: workEntry.workerId } : {}),
      ...(workEntry.threadId ? { threadId: workEntry.threadId } : {}),
    });
  };
  const wrap = (node: React.ReactNode) => (
    <div
      className={className}
      data-work-entry-tone={workEntry.tone}
      data-work-entry-label={workEntry.label}
      data-work-entry-tool-name={workEntry.toolName}
    >
      {node}
    </div>
  );

  if (reviewerSummary) {
    return wrap(<ReviewerDecisionCard summary={reviewerSummary} />);
  }

  if (annotationSummary) {
    return wrap(<BrowserAnnotationCard summary={annotationSummary} />);
  }

  if (approvalSummary) {
    return wrap(<BrowserApprovalCard summary={approvalSummary} />);
  }
  if (controlSummary) {
    return wrap(<BrowserControlCard summary={controlSummary} />);
  }
  if (targetedActionSummary) {
    return wrap(<BrowserTargetedActionCard summary={targetedActionSummary} />);
  }

  // ---------------- Orchestration tool calls — render as design cards ---------------- //
  if (orchTool || (workEntry.toolName && isOrchestrationToolCall(workEntry.toolName))) {
    const baseTool = orchTool ?? workEntry.toolName!;
    const toolDisplay = ORCH_TOOL_DISPLAY_LABELS[baseTool] ?? baseTool;
    const workerBadge = shortWorkerId(workEntry.workerId);
    const taskTitle = workEntry.toolTitle ?? workEntry.detail ?? workEntry.label;

    if (baseTool === "orchestrate_spawn_agent") {
      return wrap(
        <OrchSpawnCard
          toolDisplay={toolDisplay}
          workerBadge={workerBadge}
          title={taskTitle}
          isLoading={isLoading}
          {...(workEntry.threadId ? { threadId: workEntry.threadId } : {})}
          {...(onOpenWorkerPanel ? { onOpenWorker: handleOpenWorker } : {})}
        />,
      );
    }
    if (baseTool === "orchestrate_accept_work" || baseTool === "orchestrate_reject_work") {
      return wrap(
        <OrchAcceptCard
          toolDisplay={toolDisplay}
          title={taskTitle}
          isLoading={isLoading}
          isReject={baseTool === "orchestrate_reject_work"}
        />,
      );
    }
    if (baseTool === "orchestrate_terminate_agent") {
      return wrap(
        <div className="orch-accept-card" style={{ borderColor: "var(--destructive)" }}>
          <div className="orch-accept-head">
            <span className="orch-accept-icon" style={{ background: "var(--destructive)" }}>
              ×
            </span>
            <span className="orch-accept-label" style={{ color: "var(--destructive)" }}>
              {toolDisplay}
            </span>
          </div>
          {taskTitle ? <div className="orch-accept-title">{taskTitle}</div> : null}
        </div>,
      );
    }
    if (baseTool === "orchestrate_wait_agent" || baseTool === "orchestrate_wait_all") {
      const label = isLoading ? `Waiting on ${workerBadge ?? "agent"}` : "Agent ready";
      return wrap(<OrchThinkRow label={label} isLoading={isLoading} />);
    }
    if (baseTool === "orchestrate_review_agent_work") {
      return wrap(
        <OrchThinkRow
          label={isLoading ? "Reviewing agent work" : "Review complete"}
          isLoading={isLoading}
        />,
      );
    }
    const browserLabel = browserToolCallLabel(baseTool, workEntry.detail, isLoading);
    if (browserLabel) {
      const evidenceSummary = browserEvidenceWorkSummary(workEntry);
      if (evidenceSummary) {
        return wrap(<BrowserEvidenceCard summary={evidenceSummary} />);
      }
      const screenshot = browserScreenshotDataUrls(workEntry);
      const runtimeTruthLabel = browserRuntimeTruthLabel(workEntry);
      return wrap(
        <div>
          <OrchThinkRow label={browserLabel} isLoading={isLoading} />
          {runtimeTruthLabel ? (
            <div className="mt-1 text-xs text-muted-foreground/70">{runtimeTruthLabel}</div>
          ) : null}
          {screenshot ? <BrowserScreenshotPreview screenshot={screenshot} /> : null}
        </div>,
      );
    }
    return wrap(<OrchThinkRow label={toolDisplay} isLoading={isLoading} />);
  }

  // ---------------- Bash / file events — render as instrument readouts ---------------- //
  const changedFiles = workEntry.changedFiles ?? [];
  const lowerLabel = (workEntry.label ?? "").toLowerCase();
  const lowerToolName = (workEntry.toolName ?? "").toLowerCase();
  const isCommand =
    workEntry.requestKind === "command" ||
    workEntry.itemType === "command_execution" ||
    workEntry.command !== undefined ||
    lowerLabel === "command run" ||
    lowerToolName === "bash" ||
    lowerToolName === "shell";
  const isFile =
    !isCommand &&
    (workEntry.requestKind === "file-change" ||
      workEntry.itemType === "file_change" ||
      changedFiles.length > 0 ||
      lowerLabel === "file change" ||
      lowerLabel === "file read" ||
      lowerToolName === "write" ||
      lowerToolName === "edit" ||
      lowerToolName === "read");

  if (isCommand) {
    const command = workEntry.command ?? workEntry.detail ?? workEntry.toolTitle;
    const badge =
      lowerLabel === "command run" ? "RAN COMMAND" : (workEntry.label ?? "COMMAND").toUpperCase();
    return wrap(
      <OrchInstrumentBlock
        variant="command"
        badge={badge}
        {...(command ? { command } : {})}
        {...(workEntry.command && workEntry.detail ? { output: workEntry.detail } : {})}
      />,
    );
  }
  if (isFile) {
    const badge =
      lowerLabel === "file change" || lowerToolName === "write"
        ? "CREATED FILE"
        : lowerToolName === "edit"
          ? "EDITED FILE"
          : lowerLabel === "file read" || lowerToolName === "read"
            ? "READ FILE"
            : (workEntry.label ?? "FILE").toUpperCase();
    const filePath =
      changedFiles.length > 0 ? changedFiles[0] : (workEntry.detail ?? workEntry.toolTitle);
    return wrap(
      <OrchInstrumentBlock
        variant="file"
        badge={badge}
        {...(changedFiles.length === 0 && filePath ? { command: filePath } : {})}
        {...(changedFiles.length > 0 ? { changedFiles } : {})}
      />,
    );
  }

  // ---------------- Fallback: original compact row (preserves prior behavior) ---------------- //
  const iconConfig = workToneIcon(workEntry.tone);
  const EntryIcon = workEntryIcon(workEntry);
  const heading = toolWorkEntryHeading(workEntry);
  const preview = workEntryPreview(workEntry);
  const displayText = preview ? `${heading} - ${preview}` : heading;
  const canOpenWorker =
    onOpenWorkerPanel !== undefined &&
    (typeof workEntry.workerId === "string" || typeof workEntry.threadId === "string");

  return (
    <div
      className={cn(
        "rounded-md px-2 py-1",
        workEntry.tone === "thinking"
          ? "border border-transparent"
          : workEntry.tone === "error"
            ? "border border-rose-500/25 bg-rose-500/[0.04]"
            : "border border-border/35 bg-background/30",
        className,
      )}
      data-work-entry-tone={workEntry.tone}
      data-work-entry-label={workEntry.label}
      data-work-entry-tool-name={workEntry.toolName}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "flex size-4 shrink-0 items-center justify-center pt-0.5",
            iconConfig.className,
            workEntry.tone === "error"
              ? "text-rose-400/80"
              : workEntry.tone === "thinking"
                ? "text-muted-foreground/60"
                : "text-foreground/60",
          )}
        >
          <EntryIcon className="size-3" />
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="truncate font-mono text-[11px] leading-5" title={displayText}>
            <span
              className={cn(
                "font-medium",
                workEntry.tone === "error" ? "text-rose-300/85" : "text-foreground/85",
              )}
            >
              {heading}
            </span>
            {preview && (
              <span
                className={cn(
                  "ml-1 font-normal",
                  workToneClass(workEntry.tone),
                  workEntry.tone === "tool"
                    ? "text-muted-foreground/65"
                    : "text-muted-foreground/55",
                )}
              >
                · {preview}
              </span>
            )}
          </p>
        </div>
        {canOpenWorker ? (
          <button
            type="button"
            className="shrink-0 rounded-sm border border-border/40 bg-background/50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/75 transition-colors hover:border-border/60 hover:bg-accent/20 hover:text-foreground"
            onClick={() =>
              onOpenWorkerPanel({
                ...(workEntry.workerId ? { workerId: workEntry.workerId } : {}),
                ...(workEntry.threadId ? { threadId: workEntry.threadId } : {}),
              })
            }
          >
            Open
          </button>
        ) : null}
      </div>
    </div>
  );
});
