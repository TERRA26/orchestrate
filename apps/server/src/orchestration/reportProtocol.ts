export const reportProtocolReminder = [
  "",
  "TURN-END PROTOCOL — every turn MUST end with one of two signals:",
  "",
  "1. NON-FINAL TURN (work is ongoing, you'll be working again next turn) →",
  "   Call `orchestrate_send_update_to_orchestrator` with `status` set to:",
  "     - `in-progress` when you'll continue on the next turn (set `nextStep`)",
  "     - `needs-input` when you're waiting on a clarification (set `question`)",
  "     - `blocked` when you cannot proceed (set `blockedReason`)",
  "     - `ready-for-review` when work is done and you're about to emit REPORT",
  "   Without this call, the orchestrator only sees your tool calls and diffs —",
  "   it has no way to know you're waiting on a reply or asking a question.",
  "",
  "2. FINAL TURN (work is complete, you are submitting) →",
  "   End your last assistant message with a REPORT block in this exact format:",
  "",
  "   ## REPORT",
  "   summary: one-sentence account of what you did",
  "   filesWritten:",
  "     - absolute/repo-relative/path/to/file1",
  "     - absolute/repo-relative/path/to/file2",
  "   testsRun:",
  "     - name: test suite or file name",
  "       passed: true",
  "   notes: anything surprising, deferred cleanup, unresolved questions",
  "   hasChanges: true if you wrote files, false if inspection-only",
  "   browserAfterScreenshotRef: evidence artifact id for fresh after screenshot, if browser work changed UI",
  "   browserAfterDomRef: evidence artifact id for fresh after DOM snapshot, if browser work changed UI",
  "",
  "There is NO `task.submit` tool — REPORT is parsed server-side and the",
  "orchestrator reads its fields via `orchestrate_get_agent_status`. Omit",
  "REPORT on the final turn and you will be rejected with a resubmit",
  "instruction.",
].join("\n");

function buildScopeReminder(writeScope: ReadonlyArray<string>): string {
  if (writeScope.length === 0) return "";
  return [
    "",
    "WRITE SCOPE — you MAY write files within these path patterns ONLY:",
    ...writeScope.map((pattern) => `  - ${pattern}`),
    "",
    "Writing outside this scope is a contract violation. The orchestrator's",
    "review will reject any `filesWritten` paths outside the listed patterns.",
    "If a needed write would be outside scope, STOP and call",
    "`orchestrate_send_update_to_orchestrator` with status `needs-input` to",
    "request scope expansion — do NOT silently write to /tmp or anywhere else.",
  ].join("\n");
}

export function workerKickoffMessage(
  objective: string,
  options: { readonly writeScope?: ReadonlyArray<string> } = {},
): string {
  const scopeReminder = options.writeScope ? buildScopeReminder(options.writeScope) : "";
  return (
    (objective.trim() || "Begin working on the assigned task.") +
    scopeReminder +
    reportProtocolReminder
  );
}
