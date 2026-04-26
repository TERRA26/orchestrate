import type { BrowserAction, BrowserObservation, TurnId } from "@orchestrate/contracts";

import type { WorkLogEntry } from "../session-logic";
import type { Thread, TurnDiffSummary } from "../types";
import type { ActiveOrchestratorRun, OrchestratorMessage } from "../orchestratorStateStore";
import type { OrchestratorChecklistItem, OrchestratorChecklistStatus } from "../orchestratorTypes";

// Re-export the canonical orchestrator run constants from the shared
// contracts package so server and UI agree on these values.
export {
  ORCHESTRATOR_MAX_ITERATIONS,
  ORCHESTRATOR_MAX_REVIEW_FILE_SNAPSHOTS,
  ORCHESTRATOR_MAX_REVIEW_DIFF_CHARS,
  ORCHESTRATOR_MAX_REVIEW_FILE_CHARS,
  ORCHESTRATOR_MAX_REVIEW_WORK_LOG_ENTRIES,
  ORCHESTRATOR_MAX_REVIEW_WORK_LOG_DETAIL_CHARS,
} from "@orchestrate/contracts";

export const ORCHESTRATOR_ROUTER_SYSTEM_PROMPT = [
  "You are an ORCHESTRATOR ROUTER for a coding agent working in a local repository.",
  "",
  "Decide whether the newest user message should be answered directly by the orchestrator, converted into a concrete implementation brief for a single coding agent, or decomposed into parallel subtasks for multiple agents.",
  "",
  "Return raw JSON only in one of these shapes:",
  '{"kind":"delegate","title":"Short task title","instruction":"Direct implementation brief for the coding agent","acceptanceCriteria":["Concrete check 1","Concrete check 2"],"requirementsChecklist":["Testable requirement 1","Testable requirement 2"]}',
  "or",
  '{"kind":"answer","response":"Direct answer for the user based on the available orchestrator context","shouldContinueRun":true}',
  "or",
  '{"kind":"decompose","title":"Overall task title","subtasks":[{"title":"Subtask 1","instruction":"...","provider":"codex","model":"gpt-5-codex","acceptanceCriteria":["..."]},{"title":"Subtask 2","instruction":"...","provider":"claudeAgent","model":"claude-sonnet-4-6","acceptanceCriteria":["..."]}]}',
  "",
  "Rules:",
  "- Choose kind=answer when the user is asking about current progress, whether something was tested or validated, why something failed, what the current status is, asking for clarification about existing work, or asking the orchestrator itself to use the browser/computer-use preview.",
  "- Choose kind=delegate only when the user is asking to build, modify, fix, continue, validate, or otherwise perform repository work that a single agent can handle.",
  "- Choose kind=decompose when the request involves distinct subsystems, parallel work, or explicitly mentions multiple agents.",
  "- Each subtask in a decompose response gets a provider/model assignment if the user specifies one.",
  "- Subtask instructions should be independent and non-overlapping.",
  "- Do not delegate a status question, clarification question, or browser-validation question back to the agent.",
  "- For kind=answer, use only the provided context. If the context is insufficient, say that explicitly.",
  "- For kind=answer, set shouldContinueRun=true when there is an active managed run that should keep going after the answer.",
  "- For kind=delegate, keep the instruction actionable and specific to repository work.",
  "- For kind=delegate, do not include markdown fences, code blocks, or example code.",
  "- For kind=delegate, put success conditions in acceptanceCriteria.",
  "- For kind=delegate, break the request into a short requirementsChecklist of concrete, testable outcomes the orchestrator can verify later.",
  "- Prefer user-visible, runtime-verifiable checklist items over vague implementation goals.",
  "- The orchestrator will add report-back requirements separately, so do not include them in delegated instructions.",
].join("\n");

export const ORCHESTRATOR_REVIEW_SYSTEM_PROMPT = [
  "You are an ORCHESTRATOR REVIEWER for a coding agent working in a repository.",
  "",
  "Decide whether the agent's work satisfies the original user request.",
  "You will receive the original request, the delegated instruction, the agent's report, command/runtime evidence for the reviewed turn, a diff for the reviewed turn, current file snapshots, browser validation evidence when applicable, and possible preview targets for an embedded browser.",
  "",
  "Return raw JSON only in this shape:",
  '{"sufficient":true,"summary":"Brief concrete assessment","missingRequirements":[],"followUpInstruction":null,"presentation":null,"requirementsChecklist":[{"requirement":"Requirement 1","status":"passed","notes":"How it was verified"}]}',
  "or",
  '{"sufficient":true,"summary":"Brief concrete assessment","missingRequirements":[],"followUpInstruction":null,"presentation":{"kind":"embedded_browser","url":"http://localhost:3000","title":"Live preview"},"requirementsChecklist":[{"requirement":"Requirement 1","status":"passed","notes":"How it was verified"}]}',
  "or",
  '{"sufficient":false,"summary":"Brief concrete assessment","missingRequirements":["Gap 1","Gap 2"],"followUpInstruction":"Direct instruction for the coding agent to finish the work","presentation":null,"requirementsChecklist":[{"requirement":"Requirement 1","status":"failed","notes":"What is still broken"}]}',
  "or",
  '{"sufficient":false,"summary":"Brief concrete assessment","missingRequirements":[],"followUpInstruction":null,"presentation":null,"requirementsChecklist":[{"requirement":"Requirement 1","status":"pending","notes":"Why evidence is insufficient"}]}',
  "",
  "Rules:",
  "- Judge the work from the changed files, diff, and runtime evidence, not from the agent report alone.",
  "- If browser validation evidence is present for a visual/browser deliverable, do not return sufficient unless that validation says the preview behaved correctly.",
  "- If the work is insufficient, followUpInstruction must be directly sendable to the coding agent.",
  "- When a requirements checklist is provided, assess every item with status passed, failed, or pending.",
  "- Use the exact requirement text from the provided checklist in requirementsChecklist.requirement.",
  "- Keep notes concise and evidence-based.",
  "- Only set presentation when the completed work should be shown to the user in an embedded browser.",
  "- If presentation is non-null, choose one of the provided candidate URLs exactly.",
  "- If the request required running an app or providing a local URL, use the runtime evidence and preview candidates to verify that requirement.",
  "- Keep presentation null for non-visual, backend-only, or incomplete work.",
  "- Keep summary concise and concrete.",
  "- Do not ask the orchestrator to inspect more files; use the material you received.",
  "- Do not ask the coding agent to paste diffs, file snapshots, screenshots, or command/log output for work that has already been done.",
  "- If the provided evidence is insufficient for review, explain that in summary and set followUpInstruction to null.",
].join("\n");

export const ORCHESTRATOR_BROWSER_VALIDATION_SYSTEM_PROMPT = [
  "You are a BROWSER VALIDATION CONTROLLER for an orchestrator reviewing a web deliverable.",
  "",
  "You receive the original user request, the instruction sent to the coding agent, the agent's report, the preview URL, the requirements checklist, previous browser-validation steps, and the current browser observation.",
  "",
  "The observation includes an ARIA accessibility snapshot (YAML) showing the semantic structure of the page, page metrics, console/network errors, and interactive target IDs. Use the ARIA snapshot as your PRIMARY source of truth about what the page contains — it shows roles, accessible names, and hierarchy without needing to visually interpret screenshots.",
  "",
  "Choose the next browser action or finish the validation.",
  "",
  "Return raw JSON only in one of these shapes:",
  '{"action":{"kind":"click","targetId":"target-1"},"reason":"Why this interaction matters"}',
  '{"action":{"kind":"type","targetId":"target-2","text":"hello","clearFirst":true},"reason":"Why this input matters"}',
  '{"action":{"kind":"press","key":"Enter"},"reason":"Why this keypress matters"}',
  '{"action":{"kind":"scroll","direction":"down","amount":800},"reason":"Why scrolling is needed"}',
  '{"action":{"kind":"wait","ms":750},"reason":"Why waiting is needed"}',
  '{"action":{"kind":"waitFor","text":"Success"},"reason":"Wait for confirmation text to appear"}',
  '{"action":{"kind":"waitFor","textGone":"Loading"},"reason":"Wait for loading indicator to disappear"}',
  '{"action":{"kind":"navigate","url":"http://localhost:3333"},"reason":"Why navigation is needed"}',
  '{"action":{"kind":"resize","width":375,"height":812},"reason":"Test mobile responsive layout"}',
  '{"action":{"kind":"evaluate","expression":"document.querySelectorAll(\\".card\\").length"},"reason":"Count card elements"}',
  '{"action":{"kind":"evaluate","expression":"localStorage.getItem(\\"theme\\")"},"reason":"Check theme persistence"}',
  'or {"action":{"kind":"finish","ready":true,"summary":"What was verified","missingRequirements":[],"checklistUpdates":{"Requirement text":"passed"}}}',
  'or {"action":{"kind":"finish","ready":false,"summary":"What is still broken","missingRequirements":["Gap 1"],"checklistUpdates":{"Requirement text":"failed"}}}',
  "",
  "Strategy — work through the checklist efficiently:",
  "1. Read the ARIA snapshot and page metrics first. The ARIA snapshot shows all semantic elements (headings, buttons, links, inputs, lists, etc.) and their accessible names. Page metrics show total counts. Together, these answer most structural checklist items without any interaction.",
  "2. Prioritize verifying pending checklist items. Skip items already passed.",
  "3. For interactive requirements (forms work, navigation works, etc.), click the relevant target, then check the resulting ARIA snapshot for the expected outcome.",
  "4. Use resize to test responsive layout requirements (e.g., {width:375,height:812} for mobile, {width:768,height:1024} for tablet). Reset to {width:1440,height:900} after.",
  "5. Use waitFor to wait for dynamic content: {text:'Success'} waits for text to appear, {textGone:'Loading'} waits for text to disappear.",
  "6. Use evaluate to check things the ARIA snapshot cannot show: localStorage values, CSS custom properties, specific element counts by selector, computed styles.",
  "7. Console errors and network errors indicate broken functionality — factor them in.",
  "",
  "Rules:",
  "- Use the ARIA snapshot to verify structural requirements (element existence, count, hierarchy) without scrolling or clicking.",
  "- Use page metrics for quantitative checks (total interactive elements, images, links, headings).",
  "- Only interact (click/type/press) when you need to verify behavior, not just structure.",
  "- Only reference target ids that appear in the provided observation targets.",
  "- Use at most one executable action per response.",
  "- For keypresses, use Playwright key names: Space, Enter, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Escape, Tab, a, d, w, s.",
  "- In checklistUpdates, set items to 'passed' or 'failed' based on evidence. Only include items you have verified.",
  "- Finish with ready=false if the preview is broken, has blocking JS errors, or is missing required features.",
  "- NEVER retry the same action that just failed. If a click or type action fails, use evaluate to interact programmatically (e.g., document.querySelector('button').click()) or move on to the next checklist item.",
  "- NEVER try to guess or scan for ports by navigating to different port numbers. If the initial URL does not load the expected app, finish immediately with ready=false and explain the URL mismatch.",
  "- Be concise and practical. Avoid unnecessary scrolling — the ARIA snapshot covers the full page.",
].join("\n");

export interface OrchestratorTaskDraft {
  title: string;
  instruction: string;
  acceptanceCriteria: string[];
  requirementsChecklist: string[];
}

export type OrchestratorRouterDecision =
  | {
      kind: "delegate";
      taskDraft: OrchestratorTaskDraft;
    }
  | {
      kind: "answer";
      response: string;
      shouldContinueRun: boolean;
    };

export interface ReviewFileSnapshot {
  path: string;
  kind?: string | undefined;
  additions?: number | undefined;
  deletions?: number | undefined;
  contents?: string | undefined;
  readError?: string | undefined;
}

export interface TurnReviewContext {
  turnId: TurnId | null;
  agentReport: string;
  turnSummary: TurnDiffSummary | null;
}

export interface ReviewWorkLogSnapshot {
  label: string;
  createdAt: string;
  tone: WorkLogEntry["tone"];
  detail?: string | undefined;
  command?: string | undefined;
  changedFiles?: ReadonlyArray<string> | undefined;
  toolTitle?: string | undefined;
  itemType?: WorkLogEntry["itemType"] | undefined;
}

export interface EmbeddedBrowserPresentationCandidate {
  source: string;
  title: string;
  url: string;
}

export interface OrchestratorReviewPresentation {
  kind: "embedded_browser";
  title: string | null;
  url: string;
}

export interface BrowserValidationStepRecord {
  index: number;
  actionSummary: string;
  url: string;
  title: string;
}

export interface BrowserValidationResult {
  status: "validated" | "blocked";
  url: string;
  ready: boolean | null;
  summary: string;
  missingRequirements: string[];
  steps: BrowserValidationStepRecord[];
}

export interface BrowserValidationRunContext {
  run: ActiveOrchestratorRun;
  summary: string;
}

export interface BrowserValidationChecklistUpdates {
  [requirementLabel: string]: "passed" | "failed";
}

export type BrowserValidationPlannerAction =
  | {
      kind: "execute";
      action: BrowserAction;
      reason: string | null;
    }
  | {
      kind: "finish";
      ready: boolean;
      summary: string;
      missingRequirements: string[];
      checklistUpdates: BrowserValidationChecklistUpdates;
    };

export interface OrchestratorReviewDecision {
  sufficient: boolean;
  summary: string;
  missingRequirements: string[];
  followUpInstruction: string | null;
  presentation: OrchestratorReviewPresentation | null;
  requirementsChecklist: OrchestratorChecklistItem[];
}

export interface RecoveredOrchestratorMessage {
  role: "user" | "thinking" | "orchestrator" | "agent-result";
  content: string;
  timestamp: string;
}

export type ReviewArtifactSource = "checkpoint" | "work-log";

export interface ReviewArtifactsReadiness {
  status: "ready" | "pending" | "failed";
  reason: string;
  source: ReviewArtifactSource | null;
}

export interface ReviewerFollowUpValidation {
  valid: boolean;
  reason: string | null;
}

export function resolveOrchestratorConversationThreadId<T>(input: {
  routeThreadId: T | null;
  pendingCreatedThreadId: T | null;
  preferDraftConversation: boolean;
  draftThreadId: T;
}): T {
  if (input.preferDraftConversation) {
    return input.pendingCreatedThreadId ?? input.draftThreadId;
  }
  return input.routeThreadId ?? input.pendingCreatedThreadId ?? input.draftThreadId;
}

const ORCHESTRATOR_REPORT_MARKER =
  "When you reply, include a detailed implementation report with these exact sections:";
const ORCHESTRATOR_AGENT_REPORT_MARKERS = [
  "1. Completed work",
  "2. Files created, edited, or deleted",
  "3. Validation and commands run",
] as const;
const LOCALHOST_URL_PATTERN =
  /\bhttps?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/[^\s"'`<>)]*)?/gi;
const BARE_LOCALHOST_URL_PATTERN = /\b(?:localhost|127\.0\.0\.1)(?::\d+)(?:\/[^\s"'`<>)]*)?/gi;
const ROOT_PATH_PATTERN = /(^|[\s("'`])((?:\/[A-Za-z0-9._~!$&'*+,;=:@%-]+)+(?:\?[^\s"'`<>)]*)?)/g;
const FILESYSTEM_PATH_PREFIXES = ["/Users/", "/home/", "/tmp/", "/var/", "/private/", "/etc/"];
const NON_PREVIEW_PATH_EXTENSIONS =
  /\.(?:avif|bmp|css|gif|ico|jpeg|jpg|js|json|map|md|mjs|pdf|png|scss|svg|ts|tsx|txt|webp|woff|woff2)$/i;
const FOLLOW_UP_EVIDENCE_REQUEST_PATTERNS = [
  /\b(?:share|show|paste|provide|include|capture|demonstrate|commit or show)\b[^.\n]{0,120}\b(?:git diff|diff|file snapshots?|snapshots?|command outputs?|full outputs?|logs?|screenshots?|actual code changes|code changes|proof|evidence)\b/i,
  /\b(?:rerun|re-run)\b[^.\n]{0,120}\b(?:capture|paste|show|include)\b[^.\n]{0,80}\b(?:output|outputs|logs?)\b/i,
];
const BROWSER_VALIDATION_REQUEST_PATTERN =
  /\b(?:website|web app|webpage|browser|preview|frontend|landing page|microsite|game|interactive|ui|visual|react website|hosted|url)\b/i;
const DIRECT_BROWSER_VALIDATION_REQUEST_PATTERNS = [
  /\b(?:use|open|show|launch|start) (?:the )?(?:browser|preview|computer use)\b/i,
  /\bopen (?:it |this |the (?:page|site|app|preview) )?in (?:the )?(?:browser|preview)\b/i,
  /\b(?:navigate|click around|test|validate|verify|check|inspect|exercise)\b[^.\n]{0,120}\b(?:browser|preview|site|website|web app|webpage|ui)\b/i,
  /\b(?:test|validate|verify|check)\b[^.\n]{0,80}\b(?:it|this)\b[^.\n]{0,80}\b(?:in the browser|with computer use)\b/i,
];

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => toNonEmptyString(entry))
    .filter((entry): entry is string => entry !== null);
}

function extractJsonCandidate(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  const withoutOpeningFence = trimmed.replace(/^```[a-zA-Z0-9_-]*\s*/, "");
  return withoutOpeningFence.replace(/\s*```$/, "").trim();
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const candidate = extractJsonCandidate(raw);
  const firstBraceIndex = candidate.indexOf("{");
  const lastBraceIndex = candidate.lastIndexOf("}");
  const jsonSource =
    firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex
      ? candidate.slice(firstBraceIndex, lastBraceIndex + 1)
      : candidate;

  try {
    const parsed = JSON.parse(jsonSource) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

export function parseOrchestratorTaskDraft(raw: string): OrchestratorTaskDraft {
  const parsed = parseJsonObject(raw);
  const fallbackInstruction = raw.trim();
  if (!parsed) {
    return {
      title: "Implementation task",
      instruction: fallbackInstruction,
      acceptanceCriteria: [],
      requirementsChecklist: [],
    };
  }

  const acceptanceCriteria = toStringArray(parsed.acceptanceCriteria);
  const requirementsChecklist = normalizeRequirementsChecklist(
    toStringArray(parsed.requirementsChecklist),
    acceptanceCriteria,
  );

  return {
    title: toNonEmptyString(parsed.title) ?? "Implementation task",
    instruction: toNonEmptyString(parsed.instruction) ?? fallbackInstruction,
    acceptanceCriteria,
    requirementsChecklist,
  };
}

function slugifyChecklistLabel(label: string): string {
  const compact = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return compact.length > 0 ? compact : "requirement";
}

function normalizeRequirementsChecklist(
  rawChecklist: ReadonlyArray<string>,
  acceptanceCriteria: ReadonlyArray<string>,
): string[] {
  const source = rawChecklist.length > 0 ? rawChecklist : acceptanceCriteria;
  const ordered = new Set<string>();

  for (const item of source) {
    const normalized = item.trim();
    if (normalized.length === 0) {
      continue;
    }
    ordered.add(normalized);
  }

  return [...ordered];
}

export function buildChecklistItemsFromTaskDraft(
  task: Pick<OrchestratorTaskDraft, "requirementsChecklist" | "acceptanceCriteria">,
): OrchestratorChecklistItem[] {
  const labels = normalizeRequirementsChecklist(
    task.requirementsChecklist,
    task.acceptanceCriteria,
  );

  return labels.map((label, index) => ({
    id: `requirement:${index + 1}:${slugifyChecklistLabel(label)}`,
    label,
    status: "pending",
    notes: null,
  }));
}

function formatRouterConversationMessages(
  messages: ReadonlyArray<Pick<OrchestratorMessage, "role" | "content">>,
): string {
  if (messages.length === 0) {
    return "No orchestrator messages are available yet.";
  }

  return messages
    .map((message, index) => {
      const label =
        message.role === "agent-result"
          ? "agent"
          : message.role === "thinking"
            ? "status"
            : message.role;
      return `${index + 1}. ${label}: ${truncateForReview(message.content, 800)}`;
    })
    .join("\n");
}

export function buildRouterUserPrompt(input: {
  userRequest: string;
  activeRun: {
    iteration: number;
    startedAt: string;
    userRequest: string;
  } | null;
  requirementsChecklist?: ReadonlyArray<OrchestratorChecklistItem>;
  managedThreadTitle?: string | null | undefined;
  statusDetail?: string | null | undefined;
  latestAgentReport?: string | null | undefined;
  recentMessages: ReadonlyArray<Pick<OrchestratorMessage, "role" | "content">>;
}): string {
  const sections = [
    `Newest user message:\n${input.userRequest}`,
    input.activeRun
      ? `Active managed run:\nYes. Iteration ${input.activeRun.iteration}. Started at ${input.activeRun.startedAt}. Original task: ${input.activeRun.userRequest}`
      : "Active managed run:\nNo.",
    input.requirementsChecklist && input.requirementsChecklist.length > 0
      ? `Current requirements checklist:\n${input.requirementsChecklist
          .map((item) => `- [${item.status}] ${item.label}${item.notes ? ` — ${item.notes}` : ""}`)
          .join("\n")}`
      : "Current requirements checklist:\nUnavailable.",
    input.managedThreadTitle?.trim()
      ? `Managed thread title:\n${input.managedThreadTitle.trim()}`
      : "Managed thread title:\nUnavailable.",
    input.statusDetail?.trim()
      ? `Current orchestrator status detail:\n${input.statusDetail.trim()}`
      : "Current orchestrator status detail:\nUnavailable.",
    input.latestAgentReport?.trim()
      ? `Latest agent report:\n${truncateForReview(input.latestAgentReport.trim(), 4_000)}`
      : "Latest agent report:\nUnavailable.",
    `Recent orchestrator timeline:\n${formatRouterConversationMessages(input.recentMessages)}`,
  ];

  return sections.join("\n\n");
}

export function shouldHandleAsDirectBrowserValidationRequest(input: {
  userRequest: string;
  hasManagedThread: boolean;
}): boolean {
  // Allow browser opening even without an active managed thread —
  // the user may want to re-open a preview from a completed run.
  return DIRECT_BROWSER_VALIDATION_REQUEST_PATTERNS.some((pattern) =>
    pattern.test(input.userRequest),
  );
}

function resolveLatestDelegatedInstruction(
  messages: ReadonlyArray<Pick<OrchestratorMessage, "role" | "content">>,
): string | null {
  const match = messages
    .toReversed()
    .find(
      (message) =>
        message.role === "orchestrator" && message.content.includes(ORCHESTRATOR_REPORT_MARKER),
    );

  return match?.content.trim() || null;
}

function resolveLatestPrimaryUserRequest(
  messages: ReadonlyArray<Pick<OrchestratorMessage, "role" | "content">>,
): string | null {
  const match = messages
    .toReversed()
    .find(
      (message) =>
        message.role === "user" &&
        !DIRECT_BROWSER_VALIDATION_REQUEST_PATTERNS.some((pattern) =>
          pattern.test(message.content),
        ),
    );

  return match?.content.trim() || null;
}

export function buildAdHocBrowserValidationRun(input: {
  thread: Pick<Thread, "id" | "projectId" | "title" | "createdAt" | "updatedAt" | "latestTurn">;
  messages: ReadonlyArray<Pick<OrchestratorMessage, "role" | "content">>;
  requirementsChecklist: ReadonlyArray<OrchestratorChecklistItem>;
  fallbackUserRequest: string;
}): BrowserValidationRunContext {
  const userRequest =
    resolveLatestPrimaryUserRequest(input.messages) ||
    input.thread.title.trim() ||
    input.fallbackUserRequest.trim();
  const delegatedInstruction = resolveLatestDelegatedInstruction(input.messages) ?? userRequest;
  const startedAt =
    input.thread.latestTurn?.requestedAt ?? input.thread.updatedAt ?? input.thread.createdAt;

  return {
    run: {
      threadId: input.thread.id,
      projectId: input.thread.projectId,
      userRequest,
      delegatedInstruction,
      requirementsChecklist: [...input.requirementsChecklist],
      iteration: 1,
      startedAt,
    },
    summary: `Using the existing managed thread "${input.thread.title}" for direct browser validation.`,
  };
}

function buildFallbackTaskTitle(userRequest: string): string {
  const firstLine = userRequest.trim().split("\n")[0] ?? userRequest.trim();
  return firstLine.length > 72 ? `${firstLine.slice(0, 69)}...` : firstLine;
}

export function buildFallbackOrchestratorRouterDecision(input: {
  userRequest: string;
  hasActiveRun: boolean;
}): OrchestratorRouterDecision {
  const trimmed = input.userRequest.trim();

  if (/^(?:hi|hello|hey|yo|thanks|thank you|ok|okay)\b/i.test(trimmed) && trimmed.length <= 80) {
    return {
      kind: "answer",
      response: input.hasActiveRun
        ? "I'm here. The current managed run is still active."
        : "Hi. Tell me what you want to build, inspect, or validate.",
      shouldContinueRun: input.hasActiveRun,
    };
  }

  if (
    /\b(status|progress|what happened|why did|why is|tested|validated|browser|preview)\b/i.test(
      trimmed,
    )
  ) {
    return {
      kind: "answer",
      response: input.hasActiveRun
        ? "The managed run is still active. I can give a more specific status once the latest turn completes."
        : "There is no active managed run yet.",
      shouldContinueRun: input.hasActiveRun,
    };
  }

  return {
    kind: "delegate",
    taskDraft: {
      title: buildFallbackTaskTitle(trimmed || "Managed task"),
      instruction: trimmed || "Continue the managed task.",
      acceptanceCriteria: ["Implementation matches the user request."],
      requirementsChecklist: ["The requested change is implemented and verified."],
    },
  };
}

export function parseOrchestratorRouterDecision(raw: string): OrchestratorRouterDecision {
  const parsed = parseJsonObject(raw);
  const kind = toNonEmptyString(parsed?.kind);

  if (kind === "answer") {
    const fallbackResponse = toNonEmptyString(raw.trim()) ?? "I could not answer that.";
    return {
      kind: "answer",
      response: toNonEmptyString(parsed?.response) ?? fallbackResponse,
      shouldContinueRun: parsed?.shouldContinueRun !== false,
    };
  }

  // Handle "decompose" by merging subtasks into a single task draft
  if (kind === "decompose" && Array.isArray(parsed?.subtasks) && parsed.subtasks.length > 0) {
    const subtasks = parsed.subtasks as Array<{
      title?: string;
      instruction?: string;
      acceptanceCriteria?: string[];
      provider?: string;
      model?: string;
    }>;
    const title = toNonEmptyString(parsed.title) ?? "Multi-agent task";
    const mergedInstruction = subtasks
      .map((st, i) => {
        const stTitle = toNonEmptyString(st.title) ?? `Part ${i + 1}`;
        const stInstruction = toNonEmptyString(st.instruction) ?? "";
        const provider = toNonEmptyString(st.provider);
        const providerNote = provider ? ` (${provider})` : "";
        return `**${stTitle}**${providerNote}: ${stInstruction}`;
      })
      .join("\n\n");
    const mergedCriteria = subtasks.flatMap((st) => toStringArray(st.acceptanceCriteria));

    return {
      kind: "delegate",
      taskDraft: {
        title,
        instruction: mergedInstruction,
        acceptanceCriteria: mergedCriteria,
        requirementsChecklist: normalizeRequirementsChecklist([], mergedCriteria),
      },
    };
  }

  return {
    kind: "delegate",
    taskDraft: parseOrchestratorTaskDraft(raw),
  };
}

/** Marker prefix so the UI can visually distinguish delegated instructions from direct answers. */
export const DELEGATION_MARKER = "\u200B\u200B\u200B"; // 3 zero-width spaces

export function formatTaskDraftForDisplay(task: OrchestratorTaskDraft): string {
  // Compact display: title + instruction only.
  // Requirements and acceptance criteria are shown in the Quality Gate card,
  // so repeating them here wastes vertical space.
  // Prefixed with DELEGATION_MARKER for visual differentiation in the UI.
  return `${DELEGATION_MARKER}**${task.title}**\n\n${task.instruction}`;
}

export function buildDelegationInstruction(task: {
  instruction: string;
  acceptanceCriteria?: ReadonlyArray<string>;
  requirementsChecklist?: ReadonlyArray<string>;
}): string {
  const acceptanceCriteria =
    task.acceptanceCriteria?.filter((item) => item.trim().length > 0) ?? [];
  const requirementsChecklist = normalizeRequirementsChecklist(
    task.requirementsChecklist ?? [],
    acceptanceCriteria,
  );
  const sections = [task.instruction.trim()];

  if (requirementsChecklist.length > 0) {
    sections.push(
      ["Requirements checklist:", ...requirementsChecklist.map((item) => `- ${item}`)].join("\n"),
    );
  }

  if (acceptanceCriteria.length > 0) {
    sections.push(
      ["Acceptance criteria:", ...acceptanceCriteria.map((item) => `- ${item}`)].join("\n"),
    );
  }

  sections.push(
    [
      "When you reply, include a detailed implementation report with these exact sections:",
      "1. Completed work",
      "2. Files created, edited, or deleted",
      "3. Validation and commands run",
      "4. Remaining issues or risks",
      "5. Next recommended step",
      "6. Preview URL or access path (if applicable)",
    ].join("\n"),
  );
  sections.push(
    "If you are blocked or the repository state prevents completion, say so explicitly in that report.",
  );

  return sections.join("\n\n");
}

export function truncateForReview(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars)).trimEnd()}\n...[truncated]`;
}

export function resolveTurnReviewContext(thread: Thread | undefined): TurnReviewContext {
  if (!thread) {
    return { turnId: null, agentReport: "", turnSummary: null };
  }

  const latestTurnId = thread.latestTurn?.turnId ?? null;
  const assistantMessage =
    thread.messages
      .toReversed()
      .find(
        (message) =>
          message.role === "assistant" &&
          (latestTurnId === null || message.turnId === latestTurnId),
      ) ??
    thread.messages.toReversed().find((message) => message.role === "assistant") ??
    null;

  const turnId = latestTurnId ?? assistantMessage?.turnId ?? null;
  const matchingTurnSummary = turnId
    ? (thread.turnDiffSummaries.find((summary) => summary.turnId === turnId) ?? null)
    : null;
  const turnSummary =
    matchingTurnSummary ?? (turnId ? null : (thread.turnDiffSummaries.at(-1) ?? null));

  return {
    turnId: turnId ?? turnSummary?.turnId ?? null,
    agentReport: assistantMessage?.text.trim() ?? "",
    turnSummary,
  };
}

export function classifyReviewArtifactsReadiness(input: {
  thread: Thread | null;
  projectCwd: string | null;
  runStartedAt: string;
  reviewContext: TurnReviewContext;
  fallbackChangedFileCount: number;
  workLogEntryCount: number;
  allowWorkLogFallback: boolean;
}): ReviewArtifactsReadiness {
  if (!input.thread) {
    return {
      status: "failed",
      reason: "The managed agent thread is no longer available for review.",
      source: null,
    };
  }
  if (!input.projectCwd) {
    return {
      status: "failed",
      reason:
        "The workspace root for the managed thread is unavailable, so changed files cannot be inspected.",
      source: null,
    };
  }

  const latestTurn = input.thread.latestTurn;
  if (!latestTurn?.completedAt || latestTurn.requestedAt < input.runStartedAt) {
    return {
      status: "pending",
      reason: "The reviewed agent turn has not fully completed yet.",
      source: null,
    };
  }
  if (!input.reviewContext.turnId) {
    return {
      status: "pending",
      reason: "The completed turn has not produced a stable turn identifier yet.",
      source: null,
    };
  }
  if (input.reviewContext.turnSummary) {
    return {
      status: "ready",
      reason: "Review artifacts are ready.",
      source: "checkpoint",
    };
  }
  if (
    input.allowWorkLogFallback &&
    (input.fallbackChangedFileCount > 0 || input.workLogEntryCount > 0)
  ) {
    return {
      status: "ready",
      reason:
        "Checkpoint metadata was unavailable, so the orchestrator is falling back to work-log evidence for review.",
      source: "work-log",
    };
  }
  if (!input.reviewContext.turnSummary) {
    return {
      status: "pending",
      reason: `Checkpoint metadata for turn ${input.reviewContext.turnId} has not been captured yet.`,
      source: null,
    };
  }
  return {
    status: "ready",
    reason: "Review artifacts are ready.",
    source: "checkpoint",
  };
}

export function formatReviewArtifactsWaitMessage(reason: string): string {
  if (reason.includes("has not fully completed")) {
    return "Waiting for the managed agent turn to finish before review...";
  }
  if (reason.includes("stable turn identifier")) {
    return "Waiting for the completed turn id before review...";
  }
  if (reason.includes("Checkpoint metadata")) {
    return "Waiting for checkpoint metadata and changed-file summaries before review...";
  }
  return `Waiting for review artifacts: ${reason}`;
}

function isRecoveredOrchestratorThread(thread: Thread): boolean {
  const userMessages = thread.messages.filter((message) => message.role === "user");
  if (userMessages.some((message) => message.text.includes(ORCHESTRATOR_REPORT_MARKER))) {
    return true;
  }

  const assistantMessages = thread.messages.filter((message) => message.role === "assistant");
  return assistantMessages.some((message) =>
    ORCHESTRATOR_AGENT_REPORT_MARKERS.every((marker) => message.text.includes(marker)),
  );
}

function normalizeComparableText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function buildRecoveredOrchestratorMessages(
  thread: Thread | undefined,
): RecoveredOrchestratorMessage[] {
  if (!thread || thread.messages.length === 0 || !isRecoveredOrchestratorThread(thread)) {
    return [];
  }

  const recovered: RecoveredOrchestratorMessage[] = [];
  const firstUserMessage = thread.messages.find((message) => message.role === "user") ?? null;
  const title = toNonEmptyString(thread.title);
  if (
    title &&
    normalizeComparableText(title) !== normalizeComparableText(firstUserMessage?.text ?? "")
  ) {
    recovered.push({
      role: "user",
      content: title,
      timestamp: thread.createdAt,
    });
  }

  recovered.push({
    role: "thinking",
    content:
      "Recovered this orchestrator timeline from the managed agent thread because no saved orchestrator transcript was available for this thread.",
    timestamp: thread.createdAt,
  });

  for (const message of thread.messages) {
    const content = toNonEmptyString(message.text);
    if (!content || message.role === "system") {
      continue;
    }
    recovered.push({
      role: message.role === "assistant" ? "agent-result" : "orchestrator",
      content,
      timestamp: message.createdAt,
    });
  }

  return recovered;
}

export function buildThreadBackedOrchestratorMessages(
  thread: Thread | undefined,
): RecoveredOrchestratorMessage[] {
  if (!thread) {
    return [];
  }

  const recoveredMessages = buildRecoveredOrchestratorMessages(thread);
  if (recoveredMessages.length > 0) {
    return recoveredMessages;
  }

  return thread.messages.flatMap((message) => {
    const content = toNonEmptyString(message.text);
    if (!content || message.role === "system") {
      return [];
    }

    return [
      {
        role: message.role === "user" ? "user" : "orchestrator",
        content,
        timestamp: message.createdAt,
      } satisfies RecoveredOrchestratorMessage,
    ];
  });
}

function formatReviewFileSnapshot(snapshot: ReviewFileSnapshot): string {
  const metadata = [
    `Path: ${snapshot.path}`,
    snapshot.kind ? `Kind: ${snapshot.kind}` : null,
    typeof snapshot.additions === "number" ? `Additions: ${snapshot.additions}` : null,
    typeof snapshot.deletions === "number" ? `Deletions: ${snapshot.deletions}` : null,
  ]
    .filter((entry): entry is string => entry !== null)
    .join("\n");

  if (snapshot.readError) {
    return `${metadata}\nRead error: ${snapshot.readError}`;
  }

  return [
    metadata,
    "Current file contents:",
    truncateForReview(snapshot.contents ?? "", ORCHESTRATOR_MAX_REVIEW_FILE_CHARS),
  ].join("\n");
}

function formatReviewWorkLogEntry(entry: ReviewWorkLogSnapshot): string {
  const metadata = [
    `Created at: ${entry.createdAt}`,
    `Label: ${entry.label}`,
    entry.command ? `Command: ${entry.command}` : null,
    entry.toolTitle ? `Tool: ${entry.toolTitle}` : null,
    entry.itemType ? `Item type: ${entry.itemType}` : null,
    entry.changedFiles && entry.changedFiles.length > 0
      ? `Changed files: ${entry.changedFiles.join(", ")}`
      : null,
  ]
    .filter((value): value is string => value !== null)
    .join("\n");
  const detail = entry.detail
    ? `Detail:\n${truncateForReview(entry.detail, ORCHESTRATOR_MAX_REVIEW_WORK_LOG_DETAIL_CHARS)}`
    : null;

  return [metadata, detail].filter((value): value is string => Boolean(value)).join("\n");
}

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[)"'`,.;:!?]+$/, "");
}

function normalizePreviewUrlCandidate(raw: string): string | null {
  const candidate = trimTrailingPunctuation(raw.trim())
    .replace(/\/?\*+$/g, "")
    .replace(/[*{}[\]]+/g, "");
  if (candidate.length === 0) {
    return null;
  }

  if (/^https?:\/\/(?:localhost|127\.0\.0\.1)/i.test(candidate)) {
    return candidate;
  }

  if (/^(?:localhost|127\.0\.0\.1)(?::\d+)(?:\/.*)?$/i.test(candidate)) {
    return `http://${candidate}`;
  }

  if (!candidate.startsWith("/")) {
    return null;
  }
  if (candidate === "/") {
    return null;
  }
  if (FILESYSTEM_PATH_PREFIXES.some((prefix) => candidate.startsWith(prefix))) {
    return null;
  }

  const pathname = candidate.split("?")[0] ?? candidate;
  if (NON_PREVIEW_PATH_EXTENSIONS.test(pathname)) {
    return null;
  }

  return candidate;
}

function titleizeSegment(segment: string): string {
  const normalized = segment.replace(/[-_]+/g, " ").trim();
  if (normalized.length === 0) {
    return "Preview";
  }
  return normalized
    .split(/\s+/)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function inferPresentationTitle(url: string): string {
  if (url === "/learn-ai" || url === "app://learn-ai") {
    return "Learn AI";
  }
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      const lastSegment = parsed.pathname.split("/").findLast((segment) => segment.length > 0);
      return lastSegment ? `${titleizeSegment(lastSegment)} Preview` : parsed.host;
    } catch {
      return "Live Preview";
    }
  }
  const withoutQuery = url.replace(/^\//, "").split("?")[0] ?? "";
  const lastSegment = withoutQuery.split("/").findLast((segment) => segment.length > 0);
  return lastSegment ? `${titleizeSegment(lastSegment)} Preview` : "Live Preview";
}

function collectPreviewMatches(text: string): string[] {
  const matches: string[] = [];
  const localhostMatches = text.match(LOCALHOST_URL_PATTERN);
  if (localhostMatches) {
    matches.push(...localhostMatches);
  }
  const bareLocalhostMatches = text.match(BARE_LOCALHOST_URL_PATTERN);
  if (bareLocalhostMatches) {
    matches.push(...bareLocalhostMatches);
  }

  let pathMatch: RegExpExecArray | null = null;
  const pathPattern = new RegExp(ROOT_PATH_PATTERN);
  while ((pathMatch = pathPattern.exec(text)) !== null) {
    const path = pathMatch[2];
    if (path) {
      matches.push(path);
    }
  }

  return matches;
}

export function extractEmbeddedBrowserPresentationCandidates(input: {
  agentReport: string;
  diffPatch: string | null;
  fileSnapshots: ReadonlyArray<ReviewFileSnapshot>;
  workLogEntries: ReadonlyArray<ReviewWorkLogSnapshot>;
}): EmbeddedBrowserPresentationCandidate[] {
  const orderedCandidates = new Map<string, EmbeddedBrowserPresentationCandidate>();
  const sources = [
    { label: "agent report", text: input.agentReport },
    { label: "reviewed turn diff", text: input.diffPatch ?? "" },
    ...input.workLogEntries.map((entry, index) => ({
      label: `runtime evidence ${index + 1}`,
      text: [entry.label, entry.command, entry.detail, ...(entry.changedFiles ?? [])]
        .filter((value): value is string => Boolean(value))
        .join("\n"),
    })),
    ...input.fileSnapshots.map((snapshot) => ({
      label: `changed file ${snapshot.path}`,
      text: snapshot.contents ?? "",
    })),
  ];

  for (const source of sources) {
    for (const match of collectPreviewMatches(source.text)) {
      const url = normalizePreviewUrlCandidate(match);
      if (!url || orderedCandidates.has(url)) {
        continue;
      }
      orderedCandidates.set(url, {
        source: source.label,
        title: inferPresentationTitle(url),
        url,
      });
      if (orderedCandidates.size >= 8) {
        return [...orderedCandidates.values()];
      }
    }
  }

  return [...orderedCandidates.values()];
}

export function shouldRequireBrowserValidation(userRequest: string): boolean {
  return BROWSER_VALIDATION_REQUEST_PATTERN.test(userRequest);
}

function browserValidationCandidateScore(candidate: EmbeddedBrowserPresentationCandidate): number {
  let score = 0;
  if (candidate.source === "active browser session") {
    score += 10;
  }
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1)/i.test(candidate.url)) {
    score += 5;
  } else if (candidate.url.startsWith("/")) {
    score += 2;
  }
  if (candidate.source.startsWith("runtime evidence")) {
    score += 3;
  } else if (candidate.source === "agent report") {
    score += 1;
  }
  return score;
}

export function selectBrowserValidationCandidate(
  candidates: ReadonlyArray<EmbeddedBrowserPresentationCandidate>,
): EmbeddedBrowserPresentationCandidate | null {
  if (candidates.length === 0) {
    return null;
  }
  return (
    candidates
      .toSorted((left, right) => {
        const scoreDelta =
          browserValidationCandidateScore(right) - browserValidationCandidateScore(left);
        if (scoreDelta !== 0) {
          return scoreDelta;
        }
        return left.url.localeCompare(right.url);
      })
      .at(0) ?? null
  );
}

const PROMPT_MAX_TARGETS = 20;
const PROMPT_MAX_ARIA_SNAPSHOT_CHARS = 8_000;

function formatBrowserObservationForPrompt(observation: BrowserObservation): string {
  const shownTargets = observation.targets.slice(0, PROMPT_MAX_TARGETS);
  const remainingCount = observation.targets.length - shownTargets.length;
  const targets =
    shownTargets.length > 0
      ? shownTargets
          .map((target) =>
            [
              `- ${target.id}`,
              target.role ? `role=${target.role}` : null,
              target.label ? `label="${target.label}"` : null,
              target.text ? `text="${truncateForReview(target.text, 80)}"` : null,
              target.placeholder ? `placeholder="${target.placeholder}"` : null,
              target.disabled ? "disabled" : null,
            ]
              .filter((value): value is string => value !== null)
              .join(" | "),
          )
          .join("\n") + (remainingCount > 0 ? `\n(${remainingCount} more targets not shown)` : "")
      : "No visible interactive targets were detected.";

  const sections = [
    `URL: ${observation.url}`,
    `Title: ${observation.title || "Untitled page"}`,
    `Ready state: ${observation.readyState}`,
  ];

  if (observation.navigationError) {
    sections.push(
      `⚠ Navigation failed: ${observation.navigationError}. The browser is still showing the previous page. Do not retry the same URL.`,
    );
  }

  if (observation.pageMetrics) {
    const m = observation.pageMetrics;
    sections.push(
      `Page metrics: viewport=${m.viewportWidth}x${m.viewportHeight} scrollHeight=${m.scrollHeight}px scrollTop=${m.scrollTop}px | elements=${m.totalInteractiveElements} images=${m.totalImages} links=${m.totalLinks} inputs=${m.totalInputs}`,
      m.headings.length > 0
        ? `Headings: ${m.headings.map((h, i) => `${i + 1}. ${h}`).join(" | ")}`
        : "",
    );
  }

  if (observation.ariaSnapshot) {
    const cappedSnapshot = truncateForReview(
      observation.ariaSnapshot,
      PROMPT_MAX_ARIA_SNAPSHOT_CHARS,
    );
    sections.push(`ARIA snapshot:\n${cappedSnapshot}`);
  }

  sections.push(`Interactive targets (${observation.targets.length} total):\n${targets}`);

  const consoleErrors = observation.consoleErrors;
  if (consoleErrors && consoleErrors.length > 0) {
    sections.push(
      `Console errors/warnings (${consoleErrors.length}):\n${consoleErrors
        .map((entry) => `- [${entry.level}] ${entry.text}`)
        .join("\n")}`,
    );
  }

  const networkErrors = observation.networkErrors;
  if (networkErrors && networkErrors.length > 0) {
    sections.push(
      `Network errors (${networkErrors.length}):\n${networkErrors
        .map((entry) => `- ${entry.method} ${entry.url}: ${entry.failure}`)
        .join("\n")}`,
    );
  }

  if (observation.evaluateResult) {
    sections.push(`Evaluate result:\n${observation.evaluateResult}`);
  }

  return sections.filter((s) => s.length > 0).join("\n\n");
}

function normalizeBrowserPressKeyCandidate(raw: string | null): string | null {
  const candidate = toNonEmptyString(raw);
  if (!candidate) {
    return null;
  }

  const normalized = candidate.trim().toLowerCase();
  const compact = normalized.replace(/[\s_-]+/g, "");
  const tokenMap: Record<string, string> = {
    enter: "Enter",
    return: "Enter",
    space: "Space",
    spacebar: "Space",
    " ": "Space",
    arrowleft: "ArrowLeft",
    leftarrow: "ArrowLeft",
    left: "ArrowLeft",
    arrowright: "ArrowRight",
    rightarrow: "ArrowRight",
    right: "ArrowRight",
    arrowup: "ArrowUp",
    uparrow: "ArrowUp",
    up: "ArrowUp",
    arrowdown: "ArrowDown",
    downarrow: "ArrowDown",
    down: "ArrowDown",
    keya: "a",
    a: "a",
    keyd: "d",
    d: "d",
    keyw: "w",
    w: "w",
    keys: "s",
    s: "s",
    escape: "Escape",
    esc: "Escape",
    tab: "Tab",
  };

  if (tokenMap[compact]) {
    return tokenMap[compact];
  }

  if (compact.includes("+")) {
    const parts = compact.split("+").map((part) => normalizeBrowserPressKeyCandidate(part));
    if (parts.every((part): part is string => part !== null)) {
      return parts.join("+");
    }
  }

  const stripped = normalized.replace(/\b(key|keypress|button|bar)\b/g, "").replace(/\s+/g, "");
  return tokenMap[stripped] ?? candidate.trim();
}

export function buildBrowserValidationUserPrompt(input: {
  userRequest: string;
  delegatedInstruction: string;
  agentReport: string;
  previewUrl: string;
  requirementsChecklist: ReadonlyArray<OrchestratorChecklistItem>;
  previousSteps: ReadonlyArray<BrowserValidationStepRecord>;
  observation: BrowserObservation;
}): string {
  const recentSteps = input.previousSteps.slice(-8);
  const sections = [
    `Original user request:\n${truncateForReview(input.userRequest, 1_000)}`,
    `Preview URL:\n${input.previewUrl}`,
    input.requirementsChecklist.length > 0
      ? `Requirements checklist:\n${input.requirementsChecklist
          .map((item) => `- [${item.status}] ${item.label}`)
          .join("\n")}`
      : "Requirements checklist:\nNone was provided.",
    recentSteps.length > 0
      ? `Previous browser-validation steps (last ${recentSteps.length} of ${input.previousSteps.length}):\n${recentSteps
          .map((step) => `${step.index}. ${step.actionSummary}`)
          .join("\n")}`
      : "Previous browser-validation steps:\nNone yet.",
    `Current browser observation:\n${formatBrowserObservationForPrompt(input.observation)}`,
  ];

  return sections.join("\n\n");
}

export function parseBrowserValidationPlannerAction(
  raw: string,
  options: { availableTargetIds: ReadonlyArray<string> },
): BrowserValidationPlannerAction {
  const parsed = parseJsonObject(raw);
  if (!parsed) {
    throw new Error("Invalid browser validation response.");
  }

  const rawAction =
    parsed.action && typeof parsed.action === "object" && !Array.isArray(parsed.action)
      ? (parsed.action as Record<string, unknown>)
      : parsed;
  const kind = toNonEmptyString(rawAction.kind);
  if (!kind) {
    throw new Error("Browser validation response did not specify an action kind.");
  }

  if (kind === "finish") {
    const checklistUpdates: BrowserValidationChecklistUpdates = {};
    if (rawAction.checklistUpdates && typeof rawAction.checklistUpdates === "object") {
      for (const [key, value] of Object.entries(
        rawAction.checklistUpdates as Record<string, unknown>,
      )) {
        if (value === "passed" || value === "failed") {
          checklistUpdates[key] = value;
        }
      }
    }
    return {
      kind: "finish",
      ready: Boolean(rawAction.ready),
      summary: toNonEmptyString(rawAction.summary) ?? "Browser validation completed.",
      missingRequirements: toStringArray(rawAction.missingRequirements),
      checklistUpdates,
    };
  }

  if (kind === "click") {
    const targetId = toNonEmptyString(rawAction.targetId);
    if (!targetId || !options.availableTargetIds.includes(targetId)) {
      throw new Error("Browser validation selected an unknown click target.");
    }
    return {
      kind: "execute",
      action: { kind: "click", targetId },
      reason: toNonEmptyString(parsed.reason) ?? null,
    };
  }

  if (kind === "type") {
    const targetId = toNonEmptyString(rawAction.targetId);
    if (!targetId || !options.availableTargetIds.includes(targetId)) {
      throw new Error("Browser validation selected an unknown type target.");
    }
    return {
      kind: "execute",
      action: {
        kind: "type",
        targetId,
        text: typeof rawAction.text === "string" ? rawAction.text : "",
        clearFirst: rawAction.clearFirst !== false,
      },
      reason: toNonEmptyString(parsed.reason) ?? null,
    };
  }

  if (kind === "press") {
    const key = normalizeBrowserPressKeyCandidate(
      toNonEmptyString(rawAction.key) ??
        toNonEmptyString(rawAction.keys) ??
        toNonEmptyString(rawAction.keyName) ??
        toNonEmptyString(rawAction.text),
    );
    if (!key) {
      throw new Error("Browser validation selected an invalid keypress action.");
    }
    return {
      kind: "execute",
      action: { kind: "press", key },
      reason: toNonEmptyString(parsed.reason) ?? null,
    };
  }

  if (kind === "scroll") {
    const direction = rawAction.direction === "up" ? "up" : "down";
    const amount =
      typeof rawAction.amount === "number" && Number.isFinite(rawAction.amount)
        ? Math.max(1, Math.round(rawAction.amount))
        : 800;
    return {
      kind: "execute",
      action: { kind: "scroll", direction, amount },
      reason: toNonEmptyString(parsed.reason) ?? null,
    };
  }

  if (kind === "wait") {
    const ms =
      typeof rawAction.ms === "number" && Number.isFinite(rawAction.ms)
        ? Math.max(0, Math.round(rawAction.ms))
        : 750;
    return {
      kind: "execute",
      action: { kind: "wait", ms },
      reason: toNonEmptyString(parsed.reason) ?? null,
    };
  }

  if (kind === "navigate") {
    const url = normalizePreviewUrlCandidate(toNonEmptyString(rawAction.url) ?? "");
    if (!url) {
      throw new Error("Browser validation selected an invalid navigation target.");
    }
    return {
      kind: "execute",
      action: { kind: "navigate", url },
      reason: toNonEmptyString(parsed.reason) ?? null,
    };
  }

  if (kind === "resize") {
    const width =
      typeof rawAction.width === "number" && Number.isFinite(rawAction.width)
        ? Math.max(320, Math.round(rawAction.width))
        : 1440;
    const height =
      typeof rawAction.height === "number" && Number.isFinite(rawAction.height)
        ? Math.max(480, Math.round(rawAction.height))
        : 900;
    return {
      kind: "execute",
      action: { kind: "resize", width, height },
      reason: toNonEmptyString(parsed.reason) ?? null,
    };
  }

  if (kind === "waitFor" || kind === "waitfor" || kind === "wait_for") {
    const text = toNonEmptyString(rawAction.text) ?? undefined;
    const textGone = toNonEmptyString(rawAction.textGone) ?? undefined;
    if (!text && !textGone) {
      throw new Error("Browser validation waitFor action requires either 'text' or 'textGone'.");
    }
    const timeout =
      typeof rawAction.timeout === "number" && Number.isFinite(rawAction.timeout)
        ? Math.max(500, Math.min(Math.round(rawAction.timeout), 10_000))
        : undefined;
    return {
      kind: "execute",
      action: {
        kind: "waitFor" as const,
        ...(text ? { text } : {}),
        ...(textGone ? { textGone } : {}),
        ...(timeout ? { timeout } : {}),
      },
      reason: toNonEmptyString(parsed.reason) ?? null,
    };
  }

  if (kind === "evaluate") {
    const expression = toNonEmptyString(rawAction.expression);
    if (!expression) {
      throw new Error("Browser validation evaluate action requires an 'expression'.");
    }
    return {
      kind: "execute",
      action: { kind: "evaluate" as const, expression },
      reason: toNonEmptyString(parsed.reason) ?? null,
    };
  }

  throw new Error(`Unsupported browser validation action kind '${kind}'.`);
}

export function formatBrowserValidationActionSummary(input: {
  action: BrowserAction;
  observation: BrowserObservation;
  reason: string | null;
}): string {
  const targetId =
    input.action.kind === "click" ||
    input.action.kind === "clickTargetOrAt" ||
    input.action.kind === "type"
      ? input.action.targetId
      : null;
  const target = targetId
    ? (input.observation.targets.find((candidate) => candidate.id === targetId) ?? null)
    : null;

  const actionLabel =
    input.action.kind === "click"
      ? `Click ${target?.label || target?.text || input.action.targetId}`
      : input.action.kind === "clickAt"
        ? `Click at ${input.action.x},${input.action.y}`
        : input.action.kind === "clickTargetOrAt"
          ? `Click ${target?.label || target?.text || input.action.targetId}`
          : input.action.kind === "type"
            ? `Type into ${target?.label || target?.text || input.action.targetId}`
            : input.action.kind === "typeFocused"
              ? "Type into focused element"
              : input.action.kind === "press"
                ? `Press ${input.action.key}`
                : input.action.kind === "scroll"
                  ? `Scroll ${input.action.direction}`
                  : input.action.kind === "wait"
                    ? `Wait ${input.action.ms}ms`
                    : input.action.kind === "resize"
                      ? `Resize viewport to ${input.action.width}x${input.action.height}`
                      : input.action.kind === "waitFor"
                        ? input.action.text
                          ? `Wait for "${input.action.text}" to appear`
                          : `Wait for "${input.action.textGone}" to disappear`
                        : input.action.kind === "evaluate"
                          ? `Evaluate: ${input.action.expression.length > 60 ? input.action.expression.slice(0, 60) + "..." : input.action.expression}`
                          : `Navigate to ${input.action.url}`;

  return input.reason ? `${actionLabel}. ${input.reason}` : actionLabel;
}

function formatBrowserValidationResult(result: BrowserValidationResult): string {
  const steps =
    result.steps.length > 0
      ? result.steps.map((step) => `${step.index}. ${step.actionSummary}`).join("\n")
      : "No browser actions were executed.";
  const readiness = result.ready === null ? "unknown" : result.ready ? "ready" : "not ready";

  return [
    `Status: ${result.status}`,
    `Preview URL: ${result.url}`,
    `Ready: ${readiness}`,
    `Summary: ${result.summary}`,
    result.missingRequirements.length > 0
      ? `Missing requirements:\n${result.missingRequirements.map((item) => `- ${item}`).join("\n")}`
      : "Missing requirements:\nNone.",
    `Executed browser steps:\n${steps}`,
  ].join("\n\n");
}

export function buildReviewUserPrompt(input: {
  userRequest: string;
  delegatedInstruction: string;
  agentReport: string;
  requirementsChecklist: ReadonlyArray<OrchestratorChecklistItem>;
  artifactSource: ReviewArtifactSource;
  workLogEntries: ReadonlyArray<ReviewWorkLogSnapshot>;
  diffPatch: string | null;
  fileSnapshots: ReadonlyArray<ReviewFileSnapshot>;
  presentationCandidates: ReadonlyArray<EmbeddedBrowserPresentationCandidate>;
  browserValidation: BrowserValidationResult | null;
}): string {
  const sections = [
    `Original user request:\n${input.userRequest}`,
    `Instruction sent to the coding agent:\n${input.delegatedInstruction}`,
    `Review evidence source:\n${
      input.artifactSource === "checkpoint"
        ? "Checkpoint diff metadata was available for this turn."
        : "Checkpoint diff metadata was unavailable for this turn, so the orchestrator is reviewing from work-log evidence and current snapshots of changed files."
    }`,
    input.requirementsChecklist.length > 0
      ? `Requirements checklist:\n${input.requirementsChecklist
          .map((item) => `- ${item.label}`)
          .join("\n")}`
      : "Requirements checklist:\nNone was provided for this run.",
    `Agent report:\n${input.agentReport || "No assistant report was captured."}`,
    input.workLogEntries.length > 0
      ? `Command and runtime evidence:\n${input.workLogEntries
          .map((entry) => formatReviewWorkLogEntry(entry))
          .join("\n\n---\n\n")}`
      : "Command and runtime evidence:\nNo command or runtime evidence was available for this turn.",
    `Reviewed turn diff:\n${input.diffPatch ? truncateForReview(input.diffPatch, ORCHESTRATOR_MAX_REVIEW_DIFF_CHARS) : "No diff was available for this turn."}`,
    input.fileSnapshots.length > 0
      ? `Changed file snapshots:\n${input.fileSnapshots.map((snapshot) => formatReviewFileSnapshot(snapshot)).join("\n\n---\n\n")}`
      : "Changed file snapshots:\nNo changed file snapshots were available.",
    input.browserValidation
      ? `Browser validation evidence:\n${formatBrowserValidationResult(input.browserValidation)}`
      : "Browser validation evidence:\nNo browser validation was run for this review.",
    input.presentationCandidates.length > 0
      ? `Embedded browser presentation candidates:\n${input.presentationCandidates
          .map((candidate) => `- ${candidate.url} (${candidate.source})`)
          .join("\n")}`
      : "Embedded browser presentation candidates:\nNone detected. Keep presentation null unless the output should clearly be shown in-browser.",
  ];

  return sections.join("\n\n");
}

function toChecklistStatus(value: unknown): OrchestratorChecklistStatus | null {
  if (value !== "passed" && value !== "failed" && value !== "pending") {
    return null;
  }
  return value;
}

function parseChecklistReviewItems(value: unknown): OrchestratorChecklistItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: OrchestratorChecklistItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const label =
      toNonEmptyString(record.requirement) ??
      toNonEmptyString(record.label) ??
      toNonEmptyString(record.item);
    const status = toChecklistStatus(record.status);
    if (!label || !status) {
      continue;
    }
    items.push({
      id: `review:${slugifyChecklistLabel(label)}`,
      label,
      status,
      notes: toNonEmptyString(record.notes),
    });
  }

  return items;
}

export function parseOrchestratorReviewDecision(
  raw: string,
  options?: { presentationCandidates?: ReadonlyArray<EmbeddedBrowserPresentationCandidate> },
): OrchestratorReviewDecision {
  const parsed = parseJsonObject(raw);
  if (!parsed) {
    throw new Error("Invalid reviewer response.");
  }

  const sufficient = Boolean(parsed.sufficient);
  const summary = toNonEmptyString(parsed.summary) ?? "Review completed.";
  const missingRequirements = toStringArray(parsed.missingRequirements);
  const hasExplicitNullFollowUp =
    ("followUpInstruction" in parsed && parsed.followUpInstruction === null) ||
    ("followUp" in parsed && parsed.followUp === null);
  const followUpInstruction =
    toNonEmptyString(parsed.followUpInstruction) ??
    toNonEmptyString(parsed.followUp) ??
    (sufficient || hasExplicitNullFollowUp
      ? null
      : "Continue the task, close the remaining gaps, and return the required detailed report.");
  const allowedPresentationUrls = new Set(
    options?.presentationCandidates?.map((candidate) => candidate.url) ?? [],
  );
  const rawPresentation =
    parsed.presentation &&
    typeof parsed.presentation === "object" &&
    !Array.isArray(parsed.presentation)
      ? (parsed.presentation as Record<string, unknown>)
      : null;
  const presentationUrl =
    normalizePreviewUrlCandidate(toNonEmptyString(rawPresentation?.url) ?? "") ??
    normalizePreviewUrlCandidate(toNonEmptyString(rawPresentation?.target) ?? "");
  const presentation =
    sufficient &&
    rawPresentation &&
    presentationUrl &&
    (allowedPresentationUrls.size === 0 || allowedPresentationUrls.has(presentationUrl))
      ? ({
          kind: "embedded_browser",
          title: toNonEmptyString(rawPresentation.title) ?? inferPresentationTitle(presentationUrl),
          url: presentationUrl,
        } satisfies OrchestratorReviewPresentation)
      : null;
  const requirementsChecklist = parseChecklistReviewItems(
    parsed.requirementsChecklist ?? parsed.checklist,
  );

  return {
    sufficient,
    summary,
    missingRequirements,
    followUpInstruction,
    presentation,
    requirementsChecklist,
  };
}

function normalizeChecklistLookupKey(label: string): string {
  return label.replace(/\s+/g, " ").trim().toLowerCase();
}

export function mergeChecklistWithReview(input: {
  checklist: ReadonlyArray<OrchestratorChecklistItem>;
  review: Pick<
    OrchestratorReviewDecision,
    "sufficient" | "summary" | "missingRequirements" | "requirementsChecklist"
  >;
}): OrchestratorChecklistItem[] {
  if (input.checklist.length === 0) {
    return [];
  }

  const explicitUpdates = new Map(
    input.review.requirementsChecklist.map((item) => [
      normalizeChecklistLookupKey(item.label),
      item,
    ]),
  );
  const missingKeys = new Set(
    input.review.missingRequirements.map((item) => normalizeChecklistLookupKey(item)),
  );

  return input.checklist.map((item) => {
    const explicit = explicitUpdates.get(normalizeChecklistLookupKey(item.label));
    if (explicit) {
      return {
        ...item,
        status: explicit.status,
        notes: explicit.notes,
      };
    }

    if (input.review.sufficient) {
      return {
        ...item,
        status: "passed",
        notes: item.notes ?? "Verified during orchestrator review.",
      };
    }

    if (missingKeys.has(normalizeChecklistLookupKey(item.label))) {
      return {
        ...item,
        status: "failed",
        notes: input.review.summary,
      };
    }

    return {
      ...item,
      status: item.status === "passed" ? "passed" : "pending",
      notes: item.status === "passed" ? item.notes : null,
    };
  });
}

export function validateReviewerFollowUpInstruction(
  instruction: string | null,
): ReviewerFollowUpValidation {
  if (!instruction) {
    return { valid: true, reason: null };
  }

  for (const pattern of FOLLOW_UP_EVIDENCE_REQUEST_PATTERNS) {
    if (pattern.test(instruction)) {
      return {
        valid: false,
        reason:
          "the reviewer asked the agent for proof artifacts like diffs, snapshots, or pasted command output instead of concrete implementation work",
      };
    }
  }

  return { valid: true, reason: null };
}
