/**
 * Live Orchestrator Smoke Test
 *
 * This script exercises the real orchestrator flow against a running dev server.
 * It simulates what the UI does when a user types a prompt:
 *
 * 1. Connect to dev server via WebSocket
 * 2. Call orchestratorComplete (LLM routing) with a real prompt
 * 3. Create a run + root task on the server
 * 4. Create a managed thread + spawn a worker
 * 5. Start a real provider turn with the delegated instruction
 * 6. Monitor events until turn completion or timeout
 * 7. Call orchestratorComplete again for review
 * 8. Report exactly what happened at each step
 *
 * Prerequisites:
 *   - Dev server running: bun run dev:server
 *   - Claude CLI or Codex CLI installed and authenticated
 *
 * Usage:
 *   bun scripts/live-orchestrator-smoke.ts [--provider codex|claudeAgent] [--port 4100] [--prompt "..."]
 */

import WebSocket from "ws";
import { parseArgs } from "node:util";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    provider: { type: "string", default: "claudeAgent" },
    port: { type: "string", default: "4100" },
    prompt: {
      type: "string",
      default:
        "Create a simple TypeScript function that calculates fibonacci numbers recursively, with a test file using vitest",
    },
    timeout: { type: "string", default: "120000" },
  },
});

const PORT = parseInt(args.port!, 10);
const PROVIDER = args.provider as "codex" | "claudeAgent";
const USER_PROMPT = args.prompt!;
const TIMEOUT_MS = parseInt(args.timeout!, 10);
const MODEL = PROVIDER === "claudeAgent" ? "claude-sonnet-4-6" : "gpt-5-codex";

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(section: string, message: string, data?: unknown) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [${section}] ${message}`);
  if (data !== undefined) {
    console.log(
      JSON.stringify(data, null, 2)
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n"),
    );
  }
}

function logStep(step: number, total: number, name: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Step ${step}/${total}: ${name}`);
  console.log("=".repeat(60));
}

// ---------------------------------------------------------------------------
// WebSocket helpers
// ---------------------------------------------------------------------------

interface WsMessage {
  id?: string;
  type?: string;
  channel?: string;
  result?: unknown;
  error?: unknown;
  data?: unknown;
  sequence?: number;
}

let messageCounter = 0;
const pendingRequests = new Map<
  string,
  {
    resolve: (value: WsMessage) => void;
    reject: (error: Error) => void;
  }
>();
const pushMessages: WsMessage[] = [];
let ws: WebSocket;

function connectWs(): Promise<void> {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(`ws://127.0.0.1:${PORT}/`);

    ws.on("message", (raw) => {
      const msg: WsMessage = JSON.parse(String(raw));

      if (msg.type === "push") {
        pushMessages.push(msg);
        // Log interesting orchestration events
        if (msg.channel === "orchestration.domainEvent") {
          const eventData = msg.data as { type?: string; payload?: Record<string, unknown> };
          log("EVENT", `${eventData.type}`, eventData.payload);
        }
      } else if (msg.id) {
        // Handle "unknown" id responses (server decode failures)
        if (msg.id === "unknown") {
          log("ERROR", "Server returned error with id=unknown", msg.error);
          // Reject the oldest pending request
          const firstKey = pendingRequests.keys().next().value;
          if (firstKey) {
            const pending = pendingRequests.get(firstKey)!;
            pendingRequests.delete(firstKey);
            pending.reject(new Error(`Server decode error: ${JSON.stringify(msg.error)}`));
          }
        } else {
          const pending = pendingRequests.get(msg.id);
          if (pending) {
            pendingRequests.delete(msg.id);
            if (msg.error) {
              pending.reject(new Error(JSON.stringify(msg.error)));
            } else {
              pending.resolve(msg);
            }
          }
        }
      }
    });

    ws.once("open", () => resolve());
    ws.once("error", (err) => reject(err));
  });
}

function sendRequest(method: string, params?: unknown, timeoutMs = 180_000): Promise<WsMessage> {
  const id = `smoke-${++messageCounter}`;

  const body =
    method === "orchestration.dispatchCommand"
      ? { _tag: method, command: params }
      : params && typeof params === "object" && !Array.isArray(params)
        ? { _tag: method, ...(params as Record<string, unknown>) }
        : { _tag: method };

  ws.send(JSON.stringify({ id, body }));

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Request ${method} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    pendingRequests.set(id, {
      resolve: (msg) => {
        clearTimeout(timer);
        resolve(msg);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });
  });
}

function waitForPush(
  channel: string,
  predicate?: (msg: WsMessage) => boolean,
  timeoutMs = 30_000,
): Promise<WsMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for push on ${channel}`)),
      timeoutMs,
    );

    // Check existing messages first
    const existing = pushMessages.findIndex(
      (m) => m.channel === channel && (!predicate || predicate(m)),
    );
    if (existing >= 0) {
      clearTimeout(timer);
      resolve(pushMessages.splice(existing, 1)[0]!);
      return;
    }

    // Poll for new messages
    const interval = setInterval(() => {
      const idx = pushMessages.findIndex(
        (m) => m.channel === channel && (!predicate || predicate(m)),
      );
      if (idx >= 0) {
        clearInterval(interval);
        clearTimeout(timer);
        resolve(pushMessages.splice(idx, 1)[0]!);
      }
    }, 100);

    // Clean up on timeout
    setTimeout(() => clearInterval(interval), timeoutMs);
  });
}

// ---------------------------------------------------------------------------
// Router system prompt (matches OrchestratorPanel.logic.ts)
// ---------------------------------------------------------------------------

const ROUTER_SYSTEM_PROMPT = [
  "You are an ORCHESTRATOR ROUTER for a coding agent working in a local repository.",
  "",
  "Decide whether the newest user message should be answered directly by the orchestrator or converted into a concrete implementation brief for the coding agent.",
  "",
  "Return raw JSON only in this shape:",
  '{"kind":"delegate","title":"Short task title","instruction":"Direct implementation brief for the coding agent","acceptanceCriteria":["Concrete check 1","Concrete check 2"],"requirementsChecklist":["Testable requirement 1","Testable requirement 2"]}',
  "or",
  '{"kind":"answer","response":"Direct answer for the user","shouldContinueRun":true}',
  "",
  "Rules:",
  "- Choose kind=delegate when the user is asking to build, modify, fix, continue, validate, or perform repository work.",
  "- For kind=delegate, keep the instruction actionable and specific.",
  "- For kind=delegate, put success conditions in acceptanceCriteria.",
  "- For kind=delegate, break into a short requirementsChecklist of concrete testable outcomes.",
].join("\n");

// ---------------------------------------------------------------------------
// Main flow
// ---------------------------------------------------------------------------

async function main() {
  const totalSteps = 8;
  const startTime = Date.now();
  const results: Array<{
    step: string;
    status: "pass" | "fail" | "skip";
    detail: string;
    durationMs: number;
  }> = [];

  function recordResult(
    step: string,
    status: "pass" | "fail" | "skip",
    detail: string,
    stepStart: number,
  ) {
    const durationMs = Date.now() - stepStart;
    results.push({ step, status, detail, durationMs });
    log(
      status === "pass" ? "PASS" : status === "fail" ? "FAIL" : "SKIP",
      `${step}: ${detail} (${durationMs}ms)`,
    );
  }

  console.log("\n=== Live Orchestrator Smoke Test ===");
  console.log(`Provider: ${PROVIDER}`);
  console.log(`Model: ${MODEL}`);
  console.log(`Port: ${PORT}`);
  console.log(`Prompt: ${USER_PROMPT.slice(0, 80)}...`);
  console.log(`Timeout: ${TIMEOUT_MS}ms`);
  console.log("");

  // -------------------------------------------------------------------------
  // Step 1: Connect to dev server
  // -------------------------------------------------------------------------
  logStep(1, totalSteps, "Connect to dev server");
  let stepStart = Date.now();
  try {
    await connectWs();
    await waitForPush("server.welcome", undefined, 10_000);
    recordResult("Connect", "pass", "Connected and received welcome", stepStart);
  } catch (err) {
    recordResult(
      "Connect",
      "fail",
      `Cannot connect to server on port ${PORT}. Is 'bun run dev:server' running? Error: ${err}`,
      stepStart,
    );
    printSummary(results, startTime);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // Step 2: Ensure project exists
  // -------------------------------------------------------------------------
  logStep(2, totalSteps, "Ensure project exists");
  stepStart = Date.now();
  let projectId: string;
  try {
    const snapshot = await sendRequest("orchestration.getSnapshot");
    const data = snapshot.result as {
      projects: Array<{ id: string; workspaceRoot: string }>;
    };
    if (data.projects.length > 0) {
      projectId = data.projects[0]!.id;
      log("INFO", `Using existing project: ${projectId}`);
    } else {
      projectId = `project-smoke-${Date.now()}`;
      await sendRequest("orchestration.dispatchCommand", {
        type: "project.create",
        commandId: `cmd-smoke-project-${Date.now()}`,
        projectId,
        title: "Live Smoke Test",
        workspaceRoot: process.cwd(),
        defaultModelSelection: { provider: PROVIDER, model: MODEL },
        createdAt: new Date().toISOString(),
      });
      log("INFO", `Created project: ${projectId}`);
    }
    recordResult("Project", "pass", `Project: ${projectId}`, stepStart);
  } catch (err) {
    recordResult("Project", "fail", `${err}`, stepStart);
    printSummary(results, startTime);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // Step 3: LLM Routing — call orchestratorComplete with the user prompt
  // -------------------------------------------------------------------------
  logStep(3, totalSteps, "LLM Routing (orchestratorComplete)");
  stepStart = Date.now();
  let routerDecision: {
    kind: string;
    title?: string;
    instruction?: string;
    acceptanceCriteria?: string[];
    requirementsChecklist?: string[];
    response?: string;
  };
  try {
    const routerPrompt = `Newest user message:\n${USER_PROMPT}\n\nActive managed run:\nNo.\nCurrent requirements checklist:\nUnavailable.\nManaged thread title:\nUnavailable.\nRecent orchestrator timeline:\n(none)`;

    const routerResponse = await sendRequest(
      "orchestrator.complete",
      {
        provider: PROVIDER,
        model: MODEL,
        messages: [
          { role: "system", content: ROUTER_SYSTEM_PROMPT },
          { role: "user", content: routerPrompt },
        ],
        cwd: process.cwd(),
      },
      180_000,
    );

    const rawText = (routerResponse.result as { text: string }).text;
    log("RAW", `Router response (${rawText.length} chars):\n${rawText}`);

    // Parse JSON from response (may have markdown fences)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in router response");
    routerDecision = JSON.parse(jsonMatch[0]);

    log("PARSED", "Router decision:", routerDecision);
    recordResult(
      "LLM Routing",
      "pass",
      `kind=${routerDecision.kind}, title="${routerDecision.title ?? routerDecision.response?.slice(0, 40) ?? "?"}"`,
      stepStart,
    );
  } catch (err) {
    recordResult("LLM Routing", "fail", `${err}`, stepStart);
    printSummary(results, startTime);
    process.exit(1);
  }

  if (routerDecision.kind !== "delegate") {
    log("INFO", "Router chose 'answer' — not delegating. Skipping worker flow.");
    recordResult(
      "LLM Routing",
      "pass",
      `Answered: ${routerDecision.response?.slice(0, 80)}`,
      stepStart,
    );
    printSummary(results, startTime);
    process.exit(0);
  }

  // -------------------------------------------------------------------------
  // Step 4: Create server run
  // -------------------------------------------------------------------------
  logStep(4, totalSteps, "Create server run");
  stepStart = Date.now();
  let runId: string;
  let rootTaskId: string;
  try {
    const runResponse = await sendRequest("orchestrator.createRun", {
      projectId,
      userRequest: USER_PROMPT,
      goals: routerDecision.acceptanceCriteria ?? [],
      spawnBudget: {
        maxDepth: 2,
        maxChildren: 3,
        maxConcurrentWriters: 1,
        maxTotalWorkers: 4,
        allowedTools: ["edit", "search", "bash"],
        writeScope: [],
      },
    });

    const run = runResponse.result as { runId: string; status: string };
    runId = run.runId;
    log("INFO", `Run created: ${runId}, status: ${run.status}`);

    const taskTree = await sendRequest("orchestrator.getTaskTree", { runId });
    const tasks = taskTree.result as Array<{ taskId: string; title: string }>;
    rootTaskId = tasks[0]!.taskId;
    log("INFO", `Root task: ${rootTaskId} — "${tasks[0]!.title}"`);

    recordResult("Create Run", "pass", `runId=${runId}, rootTask=${rootTaskId}`, stepStart);
  } catch (err) {
    recordResult("Create Run", "fail", `${err}`, stepStart);
    printSummary(results, startTime);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // Step 5: Create managed thread + spawn worker
  // -------------------------------------------------------------------------
  logStep(5, totalSteps, "Create thread + spawn worker");
  stepStart = Date.now();
  const threadId = `thread-smoke-${Date.now()}`;
  const workerId = `worker-smoke-${Date.now()}`;
  const createdAt = new Date().toISOString();
  try {
    await sendRequest("orchestration.dispatchCommand", {
      type: "thread.create",
      commandId: `cmd-smoke-thread-${Date.now()}`,
      threadId,
      projectId,
      title: routerDecision.title ?? "Smoke test",
      modelSelection: { provider: PROVIDER, model: MODEL },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdAt,
    });

    await sendRequest("orchestration.dispatchCommand", {
      type: "orchestrator.worker.spawn",
      commandId: `cmd-smoke-worker-${Date.now()}`,
      workerId,
      runId,
      taskId: rootTaskId,
      threadId,
      spawnBudget: {
        maxDepth: 0,
        maxChildren: 0,
        maxConcurrentWriters: 1,
        maxTotalWorkers: 1,
        allowedTools: ["edit", "search", "bash"],
        writeScope: [],
      },
      workspace: {
        mode: "local",
        cwd: process.cwd(),
        terminalIds: [],
      },
      modelBinding: {
        workerId,
        provider: PROVIDER,
        model: MODEL,
        selectedAt: createdAt,
        selectedBy: "root-override",
        selectionReason: "Live smoke test explicit override",
        inheritedFromTaskPolicy: false,
      },
      createdAt,
    });

    log("INFO", `Thread: ${threadId}, Worker: ${workerId}`);
    recordResult("Spawn Worker", "pass", `thread=${threadId}, worker=${workerId}`, stepStart);
  } catch (err) {
    recordResult("Spawn Worker", "fail", `${err}`, stepStart);
    printSummary(results, startTime);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // Step 6: Start a real provider turn with the delegated instruction
  // -------------------------------------------------------------------------
  logStep(6, totalSteps, "Start provider turn");
  stepStart = Date.now();
  const delegatedInstruction = buildDelegationInstruction(routerDecision);
  try {
    log(
      "INFO",
      `Delegated instruction (${delegatedInstruction.length} chars):\n${delegatedInstruction.slice(0, 500)}...`,
    );

    await sendRequest("orchestration.dispatchCommand", {
      type: "thread.turn.start",
      commandId: `cmd-smoke-turn-${Date.now()}`,
      threadId,
      message: {
        messageId: `msg-smoke-${Date.now()}`,
        role: "user",
        text: delegatedInstruction,
        attachments: [],
      },
      modelSelection: { provider: PROVIDER, model: MODEL },
      assistantDeliveryMode: "streaming",
      runtimeMode: "full-access",
      interactionMode: "default",
      createdAt: new Date().toISOString(),
    });

    recordResult("Start Turn", "pass", "Turn dispatched to provider", stepStart);
  } catch (err) {
    recordResult("Start Turn", "fail", `${err}`, stepStart);
    printSummary(results, startTime);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // Step 7: Monitor events until turn completion or timeout
  // -------------------------------------------------------------------------
  logStep(7, totalSteps, "Monitor provider execution");
  stepStart = Date.now();
  try {
    // Wait for session to start
    log("INFO", "Waiting for provider session...");
    await waitForPush(
      "orchestration.domainEvent",
      (msg) => {
        const event = msg.data as { type?: string; payload?: { threadId?: string } };
        return event.type === "thread.session-set" && event.payload?.threadId === threadId;
      },
      30_000,
    );
    log("INFO", "Provider session started");

    // Monitor for turn completion, messages, or timeout
    log("INFO", `Monitoring for up to ${TIMEOUT_MS / 1000}s...`);
    let turnCompleted = false;
    let lastActivityText = "";
    const monitorStart = Date.now();

    while (Date.now() - monitorStart < TIMEOUT_MS && !turnCompleted) {
      try {
        const push = await waitForPush("orchestration.domainEvent", undefined, 5_000);
        const event = push.data as {
          type?: string;
          payload?: Record<string, unknown>;
        };

        if (event.type === "thread.turn-diff-completed") {
          turnCompleted = true;
          log("TURN", "Turn completed", event.payload);
        } else if (event.type === "thread.message-sent") {
          const text = (event.payload as { text?: string })?.text ?? "";
          if (text.length > 0 && text !== lastActivityText) {
            lastActivityText = text;
            log("MSG", `(${text.length} chars) ${text.slice(0, 120)}...`);
          }
        } else if (event.type === "thread.activity-appended") {
          const kind = (event.payload as { kind?: string })?.kind;
          const detail = (event.payload as { detail?: string })?.detail;
          log("ACTIVITY", `${kind}: ${detail ?? "(no detail)"}`);
        }
      } catch {
        // 5s idle timeout — check if turn completed elsewhere
        const snapshot = await sendRequest("orchestration.getSnapshot");
        const threads = (
          snapshot.result as {
            threads: Array<{
              id: string;
              latestTurn?: { state?: string };
            }>;
          }
        ).threads;
        const thread = threads.find((t) => t.id === threadId);
        if (
          thread?.latestTurn?.state === "completed" ||
          thread?.latestTurn?.state === "interrupted"
        ) {
          turnCompleted = true;
          log("TURN", `Turn ${thread.latestTurn.state} (detected via snapshot)`);
        }
      }
    }

    if (turnCompleted) {
      recordResult(
        "Provider Execution",
        "pass",
        `Turn completed in ${Date.now() - monitorStart}ms`,
        stepStart,
      );
    } else {
      recordResult(
        "Provider Execution",
        "fail",
        `Turn did not complete within ${TIMEOUT_MS}ms`,
        stepStart,
      );
    }
  } catch (err) {
    recordResult("Provider Execution", "fail", `${err}`, stepStart);
  }

  // -------------------------------------------------------------------------
  // Step 8: Check final state
  // -------------------------------------------------------------------------
  logStep(8, totalSteps, "Final state verification");
  stepStart = Date.now();
  try {
    const snapshot = await sendRequest("orchestration.getSnapshot");
    const data = snapshot.result as {
      threads: Array<{
        id: string;
        messages: Array<{ role: string; text?: string }>;
        latestTurn?: { state?: string; turnId?: string };
        session?: { status?: string };
      }>;
      orchestratorRuns: Array<{ runId: string; status: string }>;
      orchestratorTasks: Array<{
        taskId: string;
        status: string;
        iteration: number;
      }>;
      orchestratorWorkers: Array<{
        workerId: string;
        status: string;
        modelBinding?: { provider: string; model: string };
      }>;
    };

    const thread = data.threads.find((t) => t.id === threadId);
    const run = data.orchestratorRuns.find((r) => r.runId === runId);
    const task = data.orchestratorTasks.find((t) => t.taskId === rootTaskId);
    const worker = data.orchestratorWorkers.find((w) => w.workerId === workerId);

    log("STATE", "Thread:", {
      turnState: thread?.latestTurn?.state,
      sessionStatus: thread?.session?.status,
      messageCount: thread?.messages.length,
    });
    log("STATE", "Run:", run);
    log("STATE", "Task:", task);
    log("STATE", "Worker:", {
      status: worker?.status,
      provider: worker?.modelBinding?.provider,
      model: worker?.modelBinding?.model,
    });

    // Get the last assistant message as the "agent report"
    const assistantMessages = thread?.messages.filter((m) => m.role === "assistant") ?? [];
    const lastAssistant = assistantMessages[assistantMessages.length - 1];
    if (lastAssistant?.text) {
      log(
        "REPORT",
        `Agent report (${lastAssistant.text.length} chars):\n${lastAssistant.text.slice(0, 500)}...`,
      );
    }

    const checks = [
      thread ? "thread exists" : "MISSING thread",
      run ? `run status=${run.status}` : "MISSING run",
      task ? `task status=${task.status}` : "MISSING task",
      worker ? `worker provider=${worker.modelBinding?.provider}` : "MISSING worker",
      thread?.latestTurn?.state === "completed"
        ? "turn completed"
        : `turn ${thread?.latestTurn?.state ?? "unknown"}`,
    ];

    recordResult("Final State", "pass", checks.join(", "), stepStart);
  } catch (err) {
    recordResult("Final State", "fail", `${err}`, stepStart);
  }

  printSummary(results, startTime);
  ws.close();
}

function buildDelegationInstruction(task: {
  instruction?: string;
  acceptanceCriteria?: string[];
  requirementsChecklist?: string[];
}): string {
  const sections = [(task.instruction ?? "").trim()];

  if (task.requirementsChecklist && task.requirementsChecklist.length > 0) {
    sections.push(
      ["Requirements checklist:", ...task.requirementsChecklist.map((item) => `- ${item}`)].join(
        "\n",
      ),
    );
  }

  if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
    sections.push(
      ["Acceptance criteria:", ...task.acceptanceCriteria.map((item) => `- ${item}`)].join("\n"),
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
    ].join("\n"),
  );

  return sections.join("\n\n");
}

function printSummary(
  results: Array<{
    step: string;
    status: string;
    detail: string;
    durationMs: number;
  }>,
  startTime: number,
) {
  console.log(`\n${"=".repeat(60)}`);
  console.log("LIVE ORCHESTRATOR SMOKE RESULTS");
  console.log("=".repeat(60));

  const nameWidth = Math.max(...results.map((r) => r.step.length));
  for (const r of results) {
    const icon = r.status === "pass" ? "+" : r.status === "fail" ? "x" : "~";
    const dur = r.durationMs < 1000 ? `${r.durationMs}ms` : `${(r.durationMs / 1000).toFixed(1)}s`;
    console.log(`  [${icon}] ${r.step.padEnd(nameWidth)}  ${dur.padStart(8)}  ${r.detail}`);
  }

  const totalMs = Date.now() - startTime;
  const failures = results.filter((r) => r.status === "fail");
  console.log(`\nTotal time: ${(totalMs / 1000).toFixed(1)}s`);

  if (failures.length > 0) {
    console.log(`\n${failures.length} step(s) failed.`);
    process.exit(1);
  } else {
    console.log("\nAll steps passed.");
  }
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(2);
});
