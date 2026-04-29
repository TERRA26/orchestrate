export const reportProtocolReminder = [
  "",
  "When you finish, end your last message with a REPORT block in this format:",
  "",
  "## REPORT",
  "summary: one-sentence account of what you did",
  "filesWritten:",
  "  - absolute/repo-relative/path/to/file1",
  "  - absolute/repo-relative/path/to/file2",
  "testsRun:",
  "  - name: test suite or file name",
  "    passed: true",
  "notes: anything surprising, deferred cleanup, unresolved questions",
  "hasChanges: true if you wrote files, false if inspection-only",
  "",
  "The orchestrator reads this REPORT to decide accept vs reject. Omit it and",
  "you will be rejected with a resubmit instruction.",
].join("\n");

export function workerKickoffMessage(objective: string): string {
  return (objective.trim() || "Begin working on the assigned task.") + reportProtocolReminder;
}
