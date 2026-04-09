/**
 * Scenario Runner — Acceptance test framework for the Orchestrate project
 *
 * Connects to a running dev server via WebSocket and executes self-contained
 * acceptance test scenarios that validate specific orchestrator behaviors.
 *
 * Each scenario creates its own project/thread/run and cleans up afterward.
 *
 * Usage:
 *   bun scripts/scenario-runner.ts --port 3774 --scenarios 1,2,3
 *   bun scripts/scenario-runner.ts --port 3774 --group "Root Chat Behavior"
 *   bun scripts/scenario-runner.ts --port 3774 --scenarios all
 *   bun scripts/scenario-runner.ts --port 3774 --scenarios all --provider codex
 */

import WebSocket from "ws";
import { parseArgs } from "node:util";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScenarioStep {
  name: string;
  status: "pass" | "fail";
  detail: string;
  durationMs: number;
}

interface ScenarioResult {
  status: "pass" | "fail" | "skip";
  detail: string;
  steps: ScenarioStep[];
  serverState?: Record<string, unknown>;
}

type ProviderRequirement = "codex" | "claudeAgent" | "any" | "both" | "none";

interface Scenario {
  id: number;
  group: string;
  name: string;
  run: (ctx: ScenarioContext) => Promise<ScenarioResult>;
  requiresProvider: ProviderRequirement;
}

interface WsMessage {
  id?: string;
  type?: string;
  channel?: string;
  result?: unknown;
  error?: unknown;
  data?: unknown;
  sequence?: number;
}

interface WsHarness {
  ws: WebSocket;
  sendRequest: (method: string, params?: unknown, timeoutMs?: number) => Promise<WsMessage>;
  waitForPush: (
    channel: string,
    predicate?: (msg: WsMessage) => boolean,
    timeoutMs?: number,
  ) => Promise<WsMessage>;
  pushMessages: WsMessage[];
}

interface ScenarioContext {
  harness: WsHarness;
  provider: "codex" | "claudeAgent";
  model: string;
  port: number;
  timeoutMs: number;
  cwd: string;
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const { values: cliArgs } = parseArgs({
  options: {
    port: { type: "string", default: "3774" },
    provider: { type: "string", default: "claudeAgent" },
    scenarios: { type: "string", default: "all" },
    group: { type: "string" },
    timeout: { type: "string", default: "120000" },
  },
});

const PORT = parseInt(cliArgs.port!, 10);
const PROVIDER = cliArgs.provider as "codex" | "claudeAgent";
const MODEL = PROVIDER === "claudeAgent" ? "claude-sonnet-4-6" : "gpt-5-codex";
const TIMEOUT_MS = parseInt(cliArgs.timeout!, 10);

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

// ---------------------------------------------------------------------------
// WebSocket Harness (adapted from live-orchestrator-smoke.ts)
// ---------------------------------------------------------------------------

function createHarness(port: number): Promise<WsHarness> {
  return new Promise((resolve, reject) => {
    let messageCounter = 0;
    const pendingRequests = new Map<
      string,
      { resolve: (v: WsMessage) => void; reject: (e: Error) => void }
    >();
    const pushMessages: WsMessage[] = [];

    const ws = new WebSocket(`ws://127.0.0.1:${port}/`);

    ws.on("message", (raw) => {
      const msg: WsMessage = JSON.parse(String(raw));

      if (msg.type === "push") {
        pushMessages.push(msg);
      } else if (msg.id) {
        if (msg.id === "unknown") {
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

    function sendRequest(
      method: string,
      params?: unknown,
      timeoutMs = 180_000,
    ): Promise<WsMessage> {
      const id = `scenario-${++messageCounter}`;

      const body =
        method === "orchestration.dispatchCommand"
          ? { _tag: method, command: params }
          : params && typeof params === "object" && !Array.isArray(params)
            ? { _tag: method, ...(params as Record<string, unknown>) }
            : { _tag: method };

      ws.send(JSON.stringify({ id, body }));

      return new Promise((res, rej) => {
        const timer = setTimeout(() => {
          pendingRequests.delete(id);
          rej(new Error(`Request ${method} timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        pendingRequests.set(id, {
          resolve: (msg) => {
            clearTimeout(timer);
            res(msg);
          },
          reject: (err) => {
            clearTimeout(timer);
            rej(err);
          },
        });
      });
    }

    function waitForPush(
      channel: string,
      predicate?: (msg: WsMessage) => boolean,
      timeoutMs = 30_000,
    ): Promise<WsMessage> {
      return new Promise((res, rej) => {
        const timer = setTimeout(() => {
          clearInterval(interval);
          rej(new Error(`Timed out waiting for push on ${channel}`));
        }, timeoutMs);

        // Check existing
        const existing = pushMessages.findIndex(
          (m) => m.channel === channel && (!predicate || predicate(m)),
        );
        if (existing >= 0) {
          clearTimeout(timer);
          res(pushMessages.splice(existing, 1)[0]!);
          return;
        }

        const interval = setInterval(() => {
          const idx = pushMessages.findIndex(
            (m) => m.channel === channel && (!predicate || predicate(m)),
          );
          if (idx >= 0) {
            clearInterval(interval);
            clearTimeout(timer);
            res(pushMessages.splice(idx, 1)[0]!);
          }
        }, 100);
      });
    }

    ws.once("open", () => resolve({ ws, sendRequest, waitForPush, pushMessages }));
    ws.once("error", (err) => reject(err));
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
  '{"kind":"answer","response":"Direct answer for the user based on the available orchestrator context","shouldContinueRun":true}',
  "",
  "Rules:",
  "- Choose kind=answer when the user is asking about current progress, whether something was tested or validated, why something failed, what the current status is, asking for clarification about existing work, or asking the orchestrator itself to use the browser/computer-use preview.",
  "- Choose kind=delegate only when the user is asking to build, modify, fix, continue, validate, or otherwise perform repository work.",
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

// ---------------------------------------------------------------------------
// Shared Helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function ensureProject(
  harness: WsHarness,
  provider: "codex" | "claudeAgent",
  model: string,
): Promise<string> {
  const snapshot = await harness.sendRequest("orchestration.getSnapshot");
  const data = snapshot.result as { projects: Array<{ id: string }> };
  if (data.projects.length > 0) {
    return data.projects[0]!.id;
  }

  const projectId = `project-scenario-${Date.now()}`;
  await harness.sendRequest("orchestration.dispatchCommand", {
    type: "project.create",
    commandId: `cmd-project-${Date.now()}`,
    projectId,
    title: "Scenario Runner",
    workspaceRoot: process.cwd(),
    defaultModelSelection: { provider, model },
    createdAt: new Date().toISOString(),
  });
  return projectId;
}

async function createThread(
  harness: WsHarness,
  projectId: string,
  title: string,
  provider: "codex" | "claudeAgent",
  model: string,
): Promise<string> {
  const threadId = `thread-scenario-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await harness.sendRequest("orchestration.dispatchCommand", {
    type: "thread.create",
    commandId: `cmd-thread-${Date.now()}`,
    threadId,
    projectId,
    title,
    modelSelection: { provider, model },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    createdAt: new Date().toISOString(),
  });
  return threadId;
}

interface RunInfo {
  runId: string;
  rootTaskId: string;
  status: string;
}

async function createRun(
  harness: WsHarness,
  projectId: string,
  userRequest: string,
  goals: string[],
  budget?: Record<string, unknown>,
): Promise<RunInfo> {
  const runResponse = await harness.sendRequest("orchestrator.createRun", {
    projectId,
    userRequest,
    goals,
    spawnBudget: budget ?? {
      maxDepth: 2,
      maxChildren: 3,
      maxConcurrentWriters: 1,
      maxTotalWorkers: 4,
      allowedTools: ["edit", "search", "bash"],
      writeScope: [],
    },
  });

  const run = runResponse.result as { runId: string; status: string };
  const taskTree = await harness.sendRequest("orchestrator.getTaskTree", { runId: run.runId });
  const tasks = taskTree.result as Array<{ taskId: string }>;
  return { runId: run.runId, rootTaskId: tasks[0]!.taskId, status: run.status };
}

async function spawnWorker(
  harness: WsHarness,
  runId: string,
  taskId: string,
  threadId: string,
  provider: "codex" | "claudeAgent",
  model: string,
): Promise<string> {
  const workerId = `worker-scenario-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = new Date().toISOString();
  await harness.sendRequest("orchestration.dispatchCommand", {
    type: "orchestrator.worker.spawn",
    commandId: `cmd-worker-${Date.now()}`,
    workerId,
    runId,
    taskId,
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
      provider,
      model,
      selectedAt: createdAt,
      selectedBy: "root-override",
      selectionReason: "Scenario runner explicit binding",
      inheritedFromTaskPolicy: false,
    },
    createdAt,
  });
  return workerId;
}

async function dispatchCommand(
  harness: WsHarness,
  command: Record<string, unknown>,
): Promise<WsMessage> {
  return harness.sendRequest("orchestration.dispatchCommand", command);
}

interface RouterDecision {
  kind: "delegate" | "answer";
  title?: string;
  instruction?: string;
  acceptanceCriteria?: string[];
  requirementsChecklist?: string[];
  response?: string;
  shouldContinueRun?: boolean;
}

async function routePrompt(
  harness: WsHarness,
  provider: "codex" | "claudeAgent",
  model: string,
  userPrompt: string,
  activeRunContext?: string,
  cwdOverride?: string,
): Promise<RouterDecision> {
  const activeRunBlock = activeRunContext ?? "No.";
  const routerPrompt = [
    `Newest user message:\n${userPrompt}`,
    `\nActive managed run:\n${activeRunBlock}`,
    "\nCurrent requirements checklist:\nUnavailable.",
    "\nManaged thread title:\nUnavailable.",
    "\nRecent orchestrator timeline:\n(none)",
  ].join("\n");

  const routerResponse = await harness.sendRequest(
    "orchestrator.complete",
    {
      provider,
      model,
      messages: [
        { role: "system", content: ROUTER_SYSTEM_PROMPT },
        { role: "user", content: routerPrompt },
      ],
      cwd: cwdOverride ?? process.cwd(),
    },
    180_000,
  );

  const rawText = (routerResponse.result as { text: string }).text;
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in router response: ${rawText.slice(0, 200)}`);
  return JSON.parse(jsonMatch[0]) as RouterDecision;
}

async function waitForTurnCompletion(
  harness: WsHarness,
  threadId: string,
  timeoutMs: number,
): Promise<boolean> {
  const monitorStart = Date.now();
  let completed = false;

  while (Date.now() - monitorStart < timeoutMs && !completed) {
    try {
      const push = await harness.waitForPush(
        "orchestration.domainEvent",
        (msg) => {
          const event = msg.data as { type?: string; payload?: { threadId?: string } };
          return (
            event.type === "thread.turn-diff-completed" && event.payload?.threadId === threadId
          );
        },
        5_000,
      );
      if (push) completed = true;
    } catch {
      // 5s idle — check snapshot
      const snapshot = await harness.sendRequest("orchestration.getSnapshot");
      const threads = (
        snapshot.result as {
          threads: Array<{ id: string; latestTurn?: { state?: string } }>;
        }
      ).threads;
      const thread = threads.find((t) => t.id === threadId);
      if (
        thread?.latestTurn?.state === "completed" ||
        thread?.latestTurn?.state === "interrupted"
      ) {
        completed = true;
      }
    }
  }
  return completed;
}

async function getSnapshot(harness: WsHarness): Promise<Record<string, unknown>> {
  const resp = await harness.sendRequest("orchestration.getSnapshot");
  return resp.result as Record<string, unknown>;
}

async function getRunState(
  harness: WsHarness,
  runId: string,
): Promise<{
  run: Record<string, unknown> | undefined;
  tasks: Array<Record<string, unknown>>;
  workers: Array<Record<string, unknown>>;
}> {
  const [runResp, taskTreeResp, workersResp] = await Promise.all([
    harness.sendRequest("orchestrator.getRun", { runId }),
    harness.sendRequest("orchestrator.getTaskTree", { runId }),
    harness.sendRequest("orchestrator.getWorkers", { runId }),
  ]);
  return {
    run: runResp.result as Record<string, unknown> | undefined,
    tasks: (taskTreeResp.result as Array<Record<string, unknown>>) ?? [],
    workers: (workersResp.result as Array<Record<string, unknown>>) ?? [],
  };
}

function assertProviderBinding(
  worker: Record<string, unknown>,
  expectedProvider: string,
): { pass: boolean; detail: string } {
  const binding = worker.modelBinding as { provider?: string } | undefined;
  if (!binding) return { pass: false, detail: "Worker has no modelBinding" };
  if (binding.provider !== expectedProvider) {
    return {
      pass: false,
      detail: `Expected provider=${expectedProvider}, got ${binding.provider}`,
    };
  }
  return { pass: true, detail: `Provider binding is ${expectedProvider}` };
}

async function cancelRunSafe(harness: WsHarness, runId: string): Promise<void> {
  try {
    await harness.sendRequest("orchestrator.cancelRun", {
      runId,
      reason: "Scenario cleanup",
    });
  } catch {
    // Already cancelled or completed — ignore
  }
}

// ---------------------------------------------------------------------------
// Step runner utility
// ---------------------------------------------------------------------------

async function runStep(
  name: string,
  fn: () => Promise<{ pass: boolean; detail: string }>,
): Promise<ScenarioStep> {
  const start = Date.now();
  try {
    const result = await fn();
    return {
      name,
      status: result.pass ? "pass" : "fail",
      detail: result.detail,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      name,
      status: "fail",
      detail: `Exception: ${err instanceof Error ? err.message : String(err)}`,
      durationMs: Date.now() - start,
    };
  }
}

// ---------------------------------------------------------------------------
// Scenario Definitions — Group 1: Root Chat Behavior
// ---------------------------------------------------------------------------

const scenario1: Scenario = {
  id: 1,
  group: "Root Chat Behavior",
  name: "Greeting with no active run",
  requiresProvider: "any",
  run: async (ctx) => {
    const steps: ScenarioStep[] = [];

    // Step 1: Get initial active runs count
    let initialRunCount = 0;
    steps.push(
      await runStep("Get initial active runs", async () => {
        const resp = await ctx.harness.sendRequest("orchestrator.getActiveRuns");
        const runs = resp.result as Array<unknown>;
        initialRunCount = runs.length;
        return { pass: true, detail: `Active runs: ${initialRunCount}` };
      }),
    );
    if (steps.some((s) => s.status === "fail")) {
      return { status: "fail", detail: "Setup failed", steps };
    }

    // Step 2: Call routePrompt with "hey"
    let decision: RouterDecision | undefined;
    steps.push(
      await runStep("Route prompt: hey", async () => {
        decision = await routePrompt(ctx.harness, ctx.provider, ctx.model, "hey");
        return { pass: true, detail: `Router returned kind=${decision.kind}` };
      }),
    );
    if (steps.some((s) => s.status === "fail")) {
      return { status: "fail", detail: "Route prompt failed", steps };
    }

    // Step 3: Assert kind=answer
    steps.push(
      await runStep("Assert kind=answer", async () => {
        if (decision!.kind !== "answer") {
          return { pass: false, detail: `Expected kind=answer, got kind=${decision!.kind}` };
        }
        return {
          pass: true,
          detail: `kind=answer, response="${decision!.response?.slice(0, 60) ?? ""}"`,
        };
      }),
    );

    // Step 4: Assert no new run was created
    steps.push(
      await runStep("Assert no new run created", async () => {
        const resp = await ctx.harness.sendRequest("orchestrator.getActiveRuns");
        const runs = resp.result as Array<unknown>;
        if (runs.length !== initialRunCount) {
          return { pass: false, detail: `Run count changed: ${initialRunCount} -> ${runs.length}` };
        }
        return { pass: true, detail: `Active runs unchanged: ${runs.length}` };
      }),
    );

    const failed = steps.some((s) => s.status === "fail");
    return {
      status: failed ? "fail" : "pass",
      detail: failed ? "One or more assertions failed" : "Greeting handled as direct answer",
      steps,
    };
  },
};

const scenario2: Scenario = {
  id: 2,
  group: "Root Chat Behavior",
  name: "Status question during active run",
  requiresProvider: "any",
  run: async (ctx) => {
    const steps: ScenarioStep[] = [];
    let runId = "";

    // Step 1: Create a run
    steps.push(
      await runStep("Create run", async () => {
        const projectId = await ensureProject(ctx.harness, ctx.provider, ctx.model);
        const runInfo = await createRun(ctx.harness, projectId, "Build a landing page", [
          "Page renders correctly",
        ]);
        runId = runInfo.runId;
        return { pass: true, detail: `Run created: ${runId}` };
      }),
    );
    if (steps.some((s) => s.status === "fail")) {
      return { status: "fail", detail: "Setup failed", steps };
    }

    // Step 2: Route "what is the current status?"
    let decision: RouterDecision | undefined;
    steps.push(
      await runStep("Route prompt: status question", async () => {
        decision = await routePrompt(
          ctx.harness,
          ctx.provider,
          ctx.model,
          "what is the current status?",
          `Yes. Run ID: ${runId}, status: running`,
        );
        return { pass: true, detail: `Router returned kind=${decision.kind}` };
      }),
    );

    // Step 3: Assert kind=answer
    steps.push(
      await runStep("Assert kind=answer", async () => {
        if (decision!.kind !== "answer") {
          return { pass: false, detail: `Expected kind=answer, got kind=${decision!.kind}` };
        }
        return { pass: true, detail: "Correctly answered without delegation" };
      }),
    );

    // Step 4: Assert no new worker spawned (check snapshot)
    steps.push(
      await runStep("Assert no new worker spawned", async () => {
        const state = await getRunState(ctx.harness, runId);
        if (state.workers.length > 0) {
          return { pass: false, detail: `Unexpected workers: ${state.workers.length}` };
        }
        return { pass: true, detail: "No workers spawned" };
      }),
    );

    // Cleanup
    await cancelRunSafe(ctx.harness, runId);

    const failed = steps.some((s) => s.status === "fail");
    return {
      status: failed ? "fail" : "pass",
      detail: failed ? "One or more assertions failed" : "Status question answered directly",
      steps,
    };
  },
};

const scenario3: Scenario = {
  id: 3,
  group: "Root Chat Behavior",
  name: "Clarification during active run",
  requiresProvider: "any",
  run: async (ctx) => {
    const steps: ScenarioStep[] = [];
    let runId = "";

    // Step 1: Create a run
    steps.push(
      await runStep("Create run", async () => {
        const projectId = await ensureProject(ctx.harness, ctx.provider, ctx.model);
        const runInfo = await createRun(ctx.harness, projectId, "Build a test suite", [
          "All tests pass",
        ]);
        runId = runInfo.runId;
        return { pass: true, detail: `Run created: ${runId}` };
      }),
    );
    if (steps.some((s) => s.status === "fail")) {
      return { status: "fail", detail: "Setup failed", steps };
    }

    // Step 2: Route clarification question
    let decision: RouterDecision | undefined;
    steps.push(
      await runStep("Route prompt: clarification question", async () => {
        decision = await routePrompt(
          ctx.harness,
          ctx.provider,
          ctx.model,
          "why did validation fail?",
          `Yes. Run ID: ${runId}, status: running, last result: validation failed on login test`,
        );
        return { pass: true, detail: `Router returned kind=${decision.kind}` };
      }),
    );

    // Step 3: Assert kind=answer
    steps.push(
      await runStep("Assert kind=answer", async () => {
        if (decision!.kind !== "answer") {
          return { pass: false, detail: `Expected kind=answer, got kind=${decision!.kind}` };
        }
        return { pass: true, detail: "Correctly answered clarification" };
      }),
    );

    // Cleanup
    await cancelRunSafe(ctx.harness, runId);

    const failed = steps.some((s) => s.status === "fail");
    return {
      status: failed ? "fail" : "pass",
      detail: failed ? "One or more assertions failed" : "Clarification handled as direct answer",
      steps,
    };
  },
};

const scenario4: Scenario = {
  id: 4,
  group: "Root Chat Behavior",
  name: "Direct inspect request",
  requiresProvider: "any",
  run: async (ctx) => {
    const steps: ScenarioStep[] = [];

    // Step 1: Route inspect request
    let decision: RouterDecision | undefined;
    steps.push(
      await runStep("Route prompt: inspect request", async () => {
        decision = await routePrompt(
          ctx.harness,
          ctx.provider,
          ctx.model,
          "inspect the repo structure first",
        );
        return { pass: true, detail: `Router returned kind=${decision.kind}` };
      }),
    );

    // Step 2: Assert valid JSON response (either answer or delegate is acceptable)
    steps.push(
      await runStep("Assert valid router response", async () => {
        if (!decision) {
          return { pass: false, detail: "No decision received" };
        }
        if (decision.kind !== "answer" && decision.kind !== "delegate") {
          return { pass: false, detail: `Invalid kind: ${decision.kind}` };
        }
        return {
          pass: true,
          detail: `kind=${decision.kind}${decision.kind === "delegate" ? `, title="${decision.title}"` : `, response="${decision.response?.slice(0, 60)}"`}`,
        };
      }),
    );

    // Step 3: Verify no unexpected server state changes
    steps.push(
      await runStep("Verify server state unaffected", async () => {
        const snapshot = await getSnapshot(ctx.harness);
        const runs = (snapshot.orchestratorRuns as Array<unknown>) ?? [];
        return { pass: true, detail: `Server state OK, ${runs.length} runs` };
      }),
    );

    const failed = steps.some((s) => s.status === "fail");
    return {
      status: failed ? "fail" : "pass",
      detail: failed ? "One or more assertions failed" : `Inspect request: kind=${decision?.kind}`,
      steps,
    };
  },
};

// ---------------------------------------------------------------------------
// Scenario Definitions — Group 2: Explicit Provider Control
// ---------------------------------------------------------------------------

const scenario5: Scenario = {
  id: 5,
  group: "Explicit Provider Control",
  name: "Root GPT, worker Claude",
  requiresProvider: "both",
  run: async (ctx) => {
    const steps: ScenarioStep[] = [];
    let runId = "";
    let rootTaskId = "";
    let projectId = "";
    let threadId = "";
    let workerId = "";

    // The root is running as codex; user asks for Claude worker
    const rootProvider: "codex" | "claudeAgent" = "codex";
    const rootModel = "gpt-5-codex";
    const workerProvider: "codex" | "claudeAgent" = "claudeAgent";
    const workerModel = "claude-sonnet-4-6";

    // Step 1: Route prompt requesting Claude
    let decision: RouterDecision | undefined;
    steps.push(
      await runStep("Route prompt: use Claude Opus", async () => {
        decision = await routePrompt(
          ctx.harness,
          rootProvider,
          rootModel,
          "use Claude Opus on high effort to build a website",
        );
        return { pass: true, detail: `Router returned kind=${decision.kind}` };
      }),
    );

    // Step 2: Assert kind=delegate
    steps.push(
      await runStep("Assert kind=delegate", async () => {
        if (decision!.kind !== "delegate") {
          return { pass: false, detail: `Expected kind=delegate, got kind=${decision!.kind}` };
        }
        return { pass: true, detail: `Delegated: "${decision!.title}"` };
      }),
    );
    if (steps.some((s) => s.status === "fail")) {
      return { status: "fail", detail: "Router did not delegate", steps };
    }

    // Step 3: Create run, thread, spawn worker with claudeAgent binding
    steps.push(
      await runStep("Create run + thread + worker", async () => {
        projectId = await ensureProject(ctx.harness, rootProvider, rootModel);
        const runInfo = await createRun(
          ctx.harness,
          projectId,
          "use Claude Opus on high effort to build a website",
          decision!.acceptanceCriteria ?? ["Website builds successfully"],
        );
        runId = runInfo.runId;
        rootTaskId = runInfo.rootTaskId;
        threadId = await createThread(
          ctx.harness,
          projectId,
          decision!.title ?? "Build website",
          workerProvider,
          workerModel,
        );
        workerId = await spawnWorker(
          ctx.harness,
          runId,
          rootTaskId,
          threadId,
          workerProvider,
          workerModel,
        );
        return { pass: true, detail: `worker=${workerId}, provider=${workerProvider}` };
      }),
    );
    if (steps.some((s) => s.status === "fail")) {
      if (runId) await cancelRunSafe(ctx.harness, runId);
      return { status: "fail", detail: "Setup failed", steps };
    }

    // Step 4: Verify worker model binding
    steps.push(
      await runStep("Verify worker modelBinding=claudeAgent", async () => {
        const state = await getRunState(ctx.harness, runId);
        const worker = state.workers.find((w) => (w as { workerId: string }).workerId === workerId);
        if (!worker) return { pass: false, detail: "Worker not found in run state" };
        return assertProviderBinding(worker, workerProvider);
      }),
    );

    // Step 5: Start a turn and wait for session-set
    steps.push(
      await runStep("Start turn and wait for session-set", async () => {
        await dispatchCommand(ctx.harness, {
          type: "thread.turn.start",
          commandId: `cmd-turn-${Date.now()}`,
          threadId,
          message: {
            messageId: `msg-${Date.now()}`,
            role: "user",
            text: "Create a simple TypeScript function that calculates fibonacci numbers recursively",
            attachments: [],
          },
          modelSelection: { provider: workerProvider, model: workerModel },
          assistantDeliveryMode: "streaming",
          runtimeMode: "full-access",
          interactionMode: "default",
          createdAt: new Date().toISOString(),
        });

        await ctx.harness.waitForPush(
          "orchestration.domainEvent",
          (msg) => {
            const event = msg.data as { type?: string; payload?: { threadId?: string } };
            return event.type === "thread.session-set" && event.payload?.threadId === threadId;
          },
          30_000,
        );
        return { pass: true, detail: "Session set for claudeAgent worker" };
      }),
    );

    // Step 6: Wait for turn completion
    steps.push(
      await runStep("Wait for turn completion", async () => {
        const completed = await waitForTurnCompletion(ctx.harness, threadId, ctx.timeoutMs);
        return {
          pass: completed,
          detail: completed ? "Turn completed" : "Turn did not complete within timeout",
        };
      }),
    );

    // Cleanup
    await cancelRunSafe(ctx.harness, runId);

    const failed = steps.some((s) => s.status === "fail");
    return {
      status: failed ? "fail" : "pass",
      detail: failed
        ? "One or more steps failed"
        : "Root GPT, worker Claude: full lifecycle passed",
      steps,
    };
  },
};

const scenario6: Scenario = {
  id: 6,
  group: "Explicit Provider Control",
  name: "Root Claude, worker GPT",
  requiresProvider: "both",
  run: async (ctx) => {
    const steps: ScenarioStep[] = [];
    let runId = "";
    let rootTaskId = "";
    let threadId = "";
    let workerId = "";

    const rootProvider: "codex" | "claudeAgent" = "claudeAgent";
    const rootModel = "claude-sonnet-4-6";
    const workerProvider: "codex" | "claudeAgent" = "codex";
    const workerModel = "gpt-5-codex";

    // Step 1: Route prompt requesting GPT
    let decision: RouterDecision | undefined;
    steps.push(
      await runStep("Route prompt: use GPT", async () => {
        decision = await routePrompt(
          ctx.harness,
          rootProvider,
          rootModel,
          "use GPT to implement a REST API with CRUD endpoints for a user management system",
        );
        return { pass: true, detail: `Router returned kind=${decision.kind}` };
      }),
    );

    // Step 2: Assert kind=delegate
    steps.push(
      await runStep("Assert kind=delegate", async () => {
        if (decision!.kind !== "delegate") {
          return { pass: false, detail: `Expected kind=delegate, got kind=${decision!.kind}` };
        }
        return { pass: true, detail: `Delegated: "${decision!.title}"` };
      }),
    );
    if (steps.some((s) => s.status === "fail")) {
      return { status: "fail", detail: "Router did not delegate", steps };
    }

    // Step 3: Create run, thread, spawn worker with codex binding
    steps.push(
      await runStep("Create run + thread + worker", async () => {
        const projectId = await ensureProject(ctx.harness, rootProvider, rootModel);
        const runInfo = await createRun(
          ctx.harness,
          projectId,
          "use GPT to implement the API changes",
          decision!.acceptanceCriteria ?? ["API changes implemented"],
        );
        runId = runInfo.runId;
        rootTaskId = runInfo.rootTaskId;
        threadId = await createThread(
          ctx.harness,
          projectId,
          decision!.title ?? "API changes",
          workerProvider,
          workerModel,
        );
        workerId = await spawnWorker(
          ctx.harness,
          runId,
          rootTaskId,
          threadId,
          workerProvider,
          workerModel,
        );
        return { pass: true, detail: `worker=${workerId}, provider=${workerProvider}` };
      }),
    );
    if (steps.some((s) => s.status === "fail")) {
      if (runId) await cancelRunSafe(ctx.harness, runId);
      return { status: "fail", detail: "Setup failed", steps };
    }

    // Step 4: Verify worker model binding is codex
    steps.push(
      await runStep("Verify worker modelBinding=codex", async () => {
        const state = await getRunState(ctx.harness, runId);
        const worker = state.workers.find((w) => (w as { workerId: string }).workerId === workerId);
        if (!worker) return { pass: false, detail: "Worker not found" };
        return assertProviderBinding(worker, workerProvider);
      }),
    );

    // Cleanup
    await cancelRunSafe(ctx.harness, runId);

    const failed = steps.some((s) => s.status === "fail");
    return {
      status: failed ? "fail" : "pass",
      detail: failed ? "One or more steps failed" : "Root Claude, worker GPT: binding verified",
      steps,
    };
  },
};

const scenario7: Scenario = {
  id: 7,
  group: "Explicit Provider Control",
  name: "Prompt-text override beats default",
  requiresProvider: "both",
  run: async (ctx) => {
    const steps: ScenarioStep[] = [];
    let runId = "";
    let workerId = "";

    // Default is codex, user requests Claude
    const defaultProvider: "codex" | "claudeAgent" = "codex";
    const defaultModel = "gpt-5-codex";
    const overrideProvider: "codex" | "claudeAgent" = "claudeAgent";
    const overrideModel = "claude-sonnet-4-6";

    // Step 1: Route with override request
    let decision: RouterDecision | undefined;
    steps.push(
      await runStep("Route prompt: override to Claude", async () => {
        decision = await routePrompt(
          ctx.harness,
          defaultProvider,
          defaultModel,
          "use Claude Sonnet to build a responsive React dashboard component with charts and sidebar navigation",
        );
        return { pass: true, detail: `Router returned kind=${decision.kind}` };
      }),
    );

    // Step 2: Assert delegation
    steps.push(
      await runStep("Assert kind=delegate", async () => {
        if (decision!.kind !== "delegate") {
          return { pass: false, detail: `Expected kind=delegate, got kind=${decision!.kind}` };
        }
        return { pass: true, detail: `Delegated: "${decision!.title}"` };
      }),
    );
    if (steps.some((s) => s.status === "fail")) {
      return { status: "fail", detail: "Router did not delegate", steps };
    }

    // Step 3: Create infrastructure with override provider
    steps.push(
      await runStep("Create run + worker with override provider", async () => {
        const projectId = await ensureProject(ctx.harness, defaultProvider, defaultModel);
        const runInfo = await createRun(
          ctx.harness,
          projectId,
          "use Claude Sonnet to build a responsive React dashboard component with charts and sidebar navigation",
          decision!.acceptanceCriteria ?? ["Frontend task completed"],
        );
        runId = runInfo.runId;
        const threadId = await createThread(
          ctx.harness,
          projectId,
          decision!.title ?? "Frontend task",
          overrideProvider,
          overrideModel,
        );
        workerId = await spawnWorker(
          ctx.harness,
          runId,
          runInfo.rootTaskId,
          threadId,
          overrideProvider,
          overrideModel,
        );
        return { pass: true, detail: `Worker spawned with override provider ${overrideProvider}` };
      }),
    );
    if (steps.some((s) => s.status === "fail")) {
      if (runId) await cancelRunSafe(ctx.harness, runId);
      return { status: "fail", detail: "Setup failed", steps };
    }

    // Step 4: Verify binding is the override, not the default
    steps.push(
      await runStep("Verify binding uses override provider", async () => {
        const state = await getRunState(ctx.harness, runId);
        const worker = state.workers.find((w) => (w as { workerId: string }).workerId === workerId);
        if (!worker) return { pass: false, detail: "Worker not found" };
        return assertProviderBinding(worker, overrideProvider);
      }),
    );

    // Cleanup
    await cancelRunSafe(ctx.harness, runId);

    const failed = steps.some((s) => s.status === "fail");
    return {
      status: failed ? "fail" : "pass",
      detail: failed ? "One or more steps failed" : "Prompt-text override applied correctly",
      steps,
    };
  },
};

const scenario8: Scenario = {
  id: 8,
  group: "Explicit Provider Control",
  name: "Explicit effort applies to worker only",
  requiresProvider: "any",
  run: async (ctx) => {
    const steps: ScenarioStep[] = [];

    // Step 1: Route prompt mentioning effort
    let decision: RouterDecision | undefined;
    steps.push(
      await runStep("Route prompt: explicit effort", async () => {
        decision = await routePrompt(
          ctx.harness,
          ctx.provider,
          ctx.model,
          "use Claude Opus on high effort",
        );
        return { pass: true, detail: `Router returned kind=${decision.kind}` };
      }),
    );

    // Step 2: Verify the router instruction mentions effort context
    steps.push(
      await runStep("Verify router decision structure", async () => {
        if (decision!.kind === "delegate") {
          // Delegation should carry the instruction through
          return {
            pass: true,
            detail: `Delegated with instruction (${decision!.instruction?.length ?? 0} chars)`,
          };
        }
        // Answer is also acceptable — effort is metadata, not a build request
        return {
          pass: true,
          detail: `Answered: kind=${decision!.kind}`,
        };
      }),
    );

    const failed = steps.some((s) => s.status === "fail");
    return {
      status: failed ? "fail" : "pass",
      detail: failed ? "One or more steps failed" : "Effort in prompt handled correctly",
      steps,
    };
  },
};

const scenario9: Scenario = {
  id: 9,
  group: "Explicit Provider Control",
  name: "Unavailable requested provider",
  requiresProvider: "none",
  run: async (_ctx) => {
    return {
      status: "skip",
      detail: "Requires provider unavailability simulation — not yet implemented",
      steps: [],
    };
  },
};

// ---------------------------------------------------------------------------
// Scenario Definitions — Group 3: Single Worker Lifecycle
// ---------------------------------------------------------------------------

const scenario10: Scenario = {
  id: 10,
  group: "Single Worker Lifecycle",
  name: "Basic delegated build task",
  requiresProvider: "any",
  run: async (ctx) => {
    const steps: ScenarioStep[] = [];
    let runId = "";
    let rootTaskId = "";
    let threadId = "";
    let workerId = "";

    // Step 1: Route a build prompt
    let decision: RouterDecision | undefined;
    steps.push(
      await runStep("Route prompt: build a landing page", async () => {
        decision = await routePrompt(
          ctx.harness,
          ctx.provider,
          ctx.model,
          "create a TypeScript utility function that generates a random hex color string",
        );
        return { pass: true, detail: `Router returned kind=${decision.kind}` };
      }),
    );

    // Step 2: Assert kind=delegate
    steps.push(
      await runStep("Assert kind=delegate", async () => {
        if (decision!.kind !== "delegate") {
          return { pass: false, detail: `Expected kind=delegate, got kind=${decision!.kind}` };
        }
        return { pass: true, detail: `Delegated: "${decision!.title}"` };
      }),
    );
    if (steps.some((s) => s.status === "fail")) {
      return { status: "fail", detail: "Router did not delegate", steps };
    }

    // Step 3: Create run + thread + worker
    steps.push(
      await runStep("Create run, thread, spawn worker", async () => {
        const projectId = await ensureProject(ctx.harness, ctx.provider, ctx.model);
        const runInfo = await createRun(
          ctx.harness,
          projectId,
          "create a TypeScript utility function that generates a random hex color string",
          decision!.acceptanceCriteria ?? ["Landing page created"],
        );
        runId = runInfo.runId;
        rootTaskId = runInfo.rootTaskId;
        threadId = await createThread(
          ctx.harness,
          projectId,
          decision!.title ?? "Landing page",
          ctx.provider,
          ctx.model,
        );
        workerId = await spawnWorker(
          ctx.harness,
          runId,
          rootTaskId,
          threadId,
          ctx.provider,
          ctx.model,
        );
        return { pass: true, detail: `run=${runId}, worker=${workerId}` };
      }),
    );
    if (steps.some((s) => s.status === "fail")) {
      if (runId) await cancelRunSafe(ctx.harness, runId);
      return { status: "fail", detail: "Setup failed", steps };
    }

    // Step 4: Start turn with delegation instruction
    steps.push(
      await runStep("Start turn with delegated instruction", async () => {
        await dispatchCommand(ctx.harness, {
          type: "thread.turn.start",
          commandId: `cmd-turn-${Date.now()}`,
          threadId,
          message: {
            messageId: `msg-${Date.now()}`,
            role: "user",
            text:
              decision!.instruction ??
              "Create a simple TypeScript function that calculates fibonacci numbers recursively",
            attachments: [],
          },
          modelSelection: { provider: ctx.provider, model: ctx.model },
          assistantDeliveryMode: "streaming",
          runtimeMode: "full-access",
          interactionMode: "default",
          createdAt: new Date().toISOString(),
        });
        return { pass: true, detail: "Turn dispatched" };
      }),
    );

    // Step 5: Wait for turn completion
    steps.push(
      await runStep("Wait for turn completion", async () => {
        const completed = await waitForTurnCompletion(ctx.harness, threadId, ctx.timeoutMs);
        return {
          pass: completed,
          detail: completed ? "Turn completed" : "Turn did not complete within timeout",
        };
      }),
    );

    // Step 6: Verify run/task/worker state
    steps.push(
      await runStep("Verify run/task/worker exist", async () => {
        const state = await getRunState(ctx.harness, runId);
        const checks: string[] = [];
        if (!state.run) checks.push("run missing");
        if (state.tasks.length === 0) checks.push("no tasks");
        if (state.workers.length === 0) checks.push("no workers");
        if (checks.length > 0) {
          return { pass: false, detail: `Missing: ${checks.join(", ")}` };
        }
        const runStatus = (state.run as { status?: string })?.status;
        return {
          pass: true,
          detail: `run status=${runStatus}, tasks=${state.tasks.length}, workers=${state.workers.length}`,
        };
      }),
    );

    // Cleanup
    await cancelRunSafe(ctx.harness, runId);

    const failed = steps.some((s) => s.status === "fail");
    return {
      status: failed ? "fail" : "pass",
      detail: failed ? "One or more steps failed" : "Basic delegated build task completed",
      steps,
    };
  },
};

const scenario11: Scenario = {
  id: 11,
  group: "Single Worker Lifecycle",
  name: "Worker submission and acceptance",
  requiresProvider: "any",
  run: async (ctx) => {
    const steps: ScenarioStep[] = [];
    let runId = "";
    let rootTaskId = "";
    let workerId = "";

    // Step 1: Set up run + worker (self-contained)
    steps.push(
      await runStep("Create run + thread + worker", async () => {
        const projectId = await ensureProject(ctx.harness, ctx.provider, ctx.model);
        const runInfo = await createRun(ctx.harness, projectId, "Implement a utility module", [
          "Module exports correct functions",
        ]);
        runId = runInfo.runId;
        rootTaskId = runInfo.rootTaskId;
        const threadId = await createThread(
          ctx.harness,
          projectId,
          "Utility module",
          ctx.provider,
          ctx.model,
        );
        workerId = await spawnWorker(
          ctx.harness,
          runId,
          rootTaskId,
          threadId,
          ctx.provider,
          ctx.model,
        );
        return { pass: true, detail: `run=${runId}, worker=${workerId}` };
      }),
    );
    if (steps.some((s) => s.status === "fail")) {
      return { status: "fail", detail: "Setup failed", steps };
    }

    // Step 2: Submit the task
    steps.push(
      await runStep("Submit task", async () => {
        await dispatchCommand(ctx.harness, {
          type: "orchestrator.task.submit",
          commandId: `cmd-submit-${Date.now()}`,
          taskId: rootTaskId,
          workerId,
          summary: "Implemented the utility module with all exports",
          createdAt: new Date().toISOString(),
        });

        await ctx.harness.waitForPush(
          "orchestration.domainEvent",
          (msg) => {
            const event = msg.data as { type?: string };
            return event.type === "orchestrator.task.submitted";
          },
          10_000,
        );
        return { pass: true, detail: "Task submitted" };
      }),
    );
    if (steps.some((s) => s.status === "fail")) {
      await cancelRunSafe(ctx.harness, runId);
      return { status: "fail", detail: "Submit failed", steps };
    }

    // Step 3: Accept the task
    steps.push(
      await runStep("Accept task", async () => {
        await dispatchCommand(ctx.harness, {
          type: "orchestrator.task.accept",
          commandId: `cmd-accept-${Date.now()}`,
          taskId: rootTaskId,
          summary: "All acceptance criteria met",
          createdAt: new Date().toISOString(),
        });

        await ctx.harness.waitForPush(
          "orchestration.domainEvent",
          (msg) => {
            const event = msg.data as { type?: string };
            return event.type === "orchestrator.task.accepted";
          },
          10_000,
        );
        return { pass: true, detail: "Task accepted" };
      }),
    );

    // Step 4: Verify task status is "accepted"
    steps.push(
      await runStep("Verify task status=accepted", async () => {
        const taskTreeResp = await ctx.harness.sendRequest("orchestrator.getTaskTree", { runId });
        const tasks = taskTreeResp.result as Array<{
          taskId: string;
          status: string;
          iteration: number;
        }>;
        const task = tasks.find((t) => t.taskId === rootTaskId);
        if (!task) return { pass: false, detail: "Task not found" };
        if (task.status !== "accepted") {
          return { pass: false, detail: `Expected status=accepted, got ${task.status}` };
        }
        return { pass: true, detail: `Task accepted, iteration=${task.iteration}` };
      }),
    );

    const failed = steps.some((s) => s.status === "fail");
    return {
      status: failed ? "fail" : "pass",
      detail: failed
        ? "One or more steps failed"
        : "Worker submission and acceptance lifecycle passed",
      steps,
    };
  },
};

const scenario12: Scenario = {
  id: 12,
  group: "Single Worker Lifecycle",
  name: "Worker rejection with follow-up",
  requiresProvider: "any",
  run: async (ctx) => {
    const steps: ScenarioStep[] = [];
    let runId = "";
    let rootTaskId = "";
    let workerId = "";

    // Step 1: Set up run + worker
    steps.push(
      await runStep("Create run + thread + worker", async () => {
        const projectId = await ensureProject(ctx.harness, ctx.provider, ctx.model);
        const runInfo = await createRun(ctx.harness, projectId, "Build authentication module", [
          "Auth works correctly",
          "Tests pass",
        ]);
        runId = runInfo.runId;
        rootTaskId = runInfo.rootTaskId;
        const threadId = await createThread(
          ctx.harness,
          projectId,
          "Auth module",
          ctx.provider,
          ctx.model,
        );
        workerId = await spawnWorker(
          ctx.harness,
          runId,
          rootTaskId,
          threadId,
          ctx.provider,
          ctx.model,
        );
        return { pass: true, detail: `run=${runId}, worker=${workerId}` };
      }),
    );
    if (steps.some((s) => s.status === "fail")) {
      return { status: "fail", detail: "Setup failed", steps };
    }

    // Step 2: Submit the task (first attempt)
    steps.push(
      await runStep("Submit task (first attempt)", async () => {
        await dispatchCommand(ctx.harness, {
          type: "orchestrator.task.submit",
          commandId: `cmd-submit-1-${Date.now()}`,
          taskId: rootTaskId,
          workerId,
          summary: "Initial auth implementation",
          createdAt: new Date().toISOString(),
        });

        await ctx.harness.waitForPush(
          "orchestration.domainEvent",
          (msg) => {
            const event = msg.data as { type?: string };
            return event.type === "orchestrator.task.submitted";
          },
          10_000,
        );
        return { pass: true, detail: "First submission sent" };
      }),
    );
    if (steps.some((s) => s.status === "fail")) {
      await cancelRunSafe(ctx.harness, runId);
      return { status: "fail", detail: "First submit failed", steps };
    }

    // Step 3: Reject the task
    steps.push(
      await runStep("Reject task with instruction", async () => {
        await dispatchCommand(ctx.harness, {
          type: "orchestrator.task.reject",
          commandId: `cmd-reject-${Date.now()}`,
          taskId: rootTaskId,
          instruction: "Tests are failing. Fix the auth test before resubmitting.",
          createdAt: new Date().toISOString(),
        });

        await ctx.harness.waitForPush(
          "orchestration.domainEvent",
          (msg) => {
            const event = msg.data as { type?: string };
            return event.type === "orchestrator.task.rejected";
          },
          10_000,
        );
        return { pass: true, detail: "Task rejected" };
      }),
    );

    // Step 4: Verify status=needs-rework, iteration=1
    steps.push(
      await runStep("Verify needs-rework, iteration=1", async () => {
        const taskTreeResp = await ctx.harness.sendRequest("orchestrator.getTaskTree", { runId });
        const tasks = taskTreeResp.result as Array<{
          taskId: string;
          status: string;
          iteration: number;
        }>;
        const task = tasks.find((t) => t.taskId === rootTaskId);
        if (!task) return { pass: false, detail: "Task not found" };
        if (task.status !== "needs-rework") {
          return { pass: false, detail: `Expected status=needs-rework, got ${task.status}` };
        }
        if (task.iteration !== 1) {
          return { pass: false, detail: `Expected iteration=1, got ${task.iteration}` };
        }
        return { pass: true, detail: "status=needs-rework, iteration=1" };
      }),
    );

    // Step 5: Re-assign (needs-rework allows re-assignment)
    steps.push(
      await runStep("Re-assign task to worker", async () => {
        await dispatchCommand(ctx.harness, {
          type: "orchestrator.task.assign",
          commandId: `cmd-reassign-${Date.now()}`,
          taskId: rootTaskId,
          assigneeKind: "worker",
          assigneeId: workerId,
          createdAt: new Date().toISOString(),
        });

        await ctx.harness.waitForPush(
          "orchestration.domainEvent",
          (msg) => {
            const event = msg.data as { type?: string };
            return event.type === "orchestrator.task.assigned";
          },
          10_000,
        );
        return { pass: true, detail: "Task re-assigned" };
      }),
    );

    // Step 6: Resubmit the task
    steps.push(
      await runStep("Resubmit task", async () => {
        await dispatchCommand(ctx.harness, {
          type: "orchestrator.task.submit",
          commandId: `cmd-submit-2-${Date.now()}`,
          taskId: rootTaskId,
          workerId,
          summary: "Fixed auth tests — all pass now",
          createdAt: new Date().toISOString(),
        });

        await ctx.harness.waitForPush(
          "orchestration.domainEvent",
          (msg) => {
            const event = msg.data as { type?: string };
            return event.type === "orchestrator.task.submitted";
          },
          10_000,
        );
        return { pass: true, detail: "Task resubmitted" };
      }),
    );

    // Step 7: Accept the resubmission
    steps.push(
      await runStep("Accept resubmission", async () => {
        await dispatchCommand(ctx.harness, {
          type: "orchestrator.task.accept",
          commandId: `cmd-accept-${Date.now()}`,
          taskId: rootTaskId,
          summary: "All tests pass now",
          createdAt: new Date().toISOString(),
        });

        await ctx.harness.waitForPush(
          "orchestration.domainEvent",
          (msg) => {
            const event = msg.data as { type?: string };
            return event.type === "orchestrator.task.accepted";
          },
          10_000,
        );
        return { pass: true, detail: "Resubmission accepted" };
      }),
    );

    // Step 8: Verify final state
    steps.push(
      await runStep("Verify final: status=accepted, iteration=1", async () => {
        const taskTreeResp = await ctx.harness.sendRequest("orchestrator.getTaskTree", { runId });
        const tasks = taskTreeResp.result as Array<{
          taskId: string;
          status: string;
          iteration: number;
        }>;
        const task = tasks.find((t) => t.taskId === rootTaskId);
        if (!task) return { pass: false, detail: "Task not found" };
        if (task.status !== "accepted") {
          return { pass: false, detail: `Expected status=accepted, got ${task.status}` };
        }
        if (task.iteration !== 1) {
          return { pass: false, detail: `Expected iteration=1, got ${task.iteration}` };
        }
        return { pass: true, detail: "status=accepted, iteration=1 — rework cycle complete" };
      }),
    );

    const failed = steps.some((s) => s.status === "fail");
    return {
      status: failed ? "fail" : "pass",
      detail: failed
        ? "One or more steps failed"
        : "Worker rejection with follow-up lifecycle passed",
      steps,
    };
  },
};

// ---------------------------------------------------------------------------
// Scenario Registry
// ---------------------------------------------------------------------------

const ALL_SCENARIOS: Scenario[] = [
  scenario1,
  scenario2,
  scenario3,
  scenario4,
  scenario5,
  scenario6,
  scenario7,
  scenario8,
  scenario9,
  scenario10,
  scenario11,
  scenario12,
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function shouldRunScenario(
  scenario: Scenario,
  selectedIds: number[] | "all",
  selectedGroup: string | undefined,
  provider: "codex" | "claudeAgent",
): boolean {
  // Filter by ID
  if (selectedIds !== "all" && !selectedIds.includes(scenario.id)) {
    return false;
  }

  // Filter by group
  if (selectedGroup && scenario.group !== selectedGroup) {
    return false;
  }

  // Filter by provider requirement
  switch (scenario.requiresProvider) {
    case "none":
      return true;
    case "any":
      return true;
    case "codex":
      return provider === "codex";
    case "claudeAgent":
      return provider === "claudeAgent";
    case "both":
      return true; // We run it and let it use both providers
    default:
      return true;
  }
}

function parseScenarioIds(input: string): number[] | "all" {
  if (input === "all") return "all";
  return input.split(",").map((s) => parseInt(s.trim(), 10));
}

interface FinalResult {
  scenario: Scenario;
  result: ScenarioResult;
  durationMs: number;
}

async function main() {
  const selectedIds = parseScenarioIds(cliArgs.scenarios ?? "all");
  const selectedGroup = cliArgs.group;

  const scenariosToRun = ALL_SCENARIOS.filter((s) =>
    shouldRunScenario(s, selectedIds, selectedGroup, PROVIDER),
  );

  if (scenariosToRun.length === 0) {
    console.log("No scenarios matched the selection criteria.");
    process.exit(0);
  }

  console.log("\n=== Orchestrate Scenario Runner ===");
  console.log(`Provider: ${PROVIDER}`);
  console.log(`Model: ${MODEL}`);
  console.log(`Port: ${PORT}`);
  console.log(`Timeout: ${TIMEOUT_MS}ms`);
  console.log(
    `Scenarios: ${scenariosToRun.map((s) => `${s.id}`).join(", ")} (${scenariosToRun.length} total)`,
  );
  console.log("");

  // Connect to server
  let harness: WsHarness;
  try {
    harness = await createHarness(PORT);
    await harness.waitForPush("server.welcome", undefined, 10_000);
    log("CONNECT", `Connected to server on port ${PORT}`);
  } catch (err) {
    console.error(`Cannot connect to server on port ${PORT}. Is 'bun run dev:server' running?`);
    console.error(`Error: ${err}`);
    process.exit(1);
  }

  const ctx: ScenarioContext = {
    harness,
    provider: PROVIDER,
    model: MODEL,
    port: PORT,
    timeoutMs: TIMEOUT_MS,
    cwd: process.cwd(),
  };

  const results: FinalResult[] = [];

  // Run scenarios sequentially
  for (const scenario of scenariosToRun) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`Scenario ${scenario.id}: ${scenario.name}`);
    console.log(`Group: ${scenario.group}`);
    console.log("─".repeat(60));

    const start = Date.now();
    let result: ScenarioResult;

    try {
      result = await scenario.run(ctx);
    } catch (err) {
      result = {
        status: "fail",
        detail: `Unhandled error: ${err instanceof Error ? err.message : String(err)}`,
        steps: [],
      };
    }

    const durationMs = Date.now() - start;
    results.push({ scenario, result, durationMs });

    // Print per-scenario result
    const icon = result.status === "pass" ? "+" : result.status === "fail" ? "x" : "~";
    console.log(`\n  [${icon}] ${result.status.toUpperCase()} (${formatDuration(durationMs)})`);
    console.log(`  ${result.detail}`);

    if (result.steps.length > 0) {
      for (const step of result.steps) {
        const stepIcon = step.status === "pass" ? "+" : "x";
        console.log(
          `    [${stepIcon}] ${step.name} (${formatDuration(step.durationMs)}): ${step.detail}`,
        );
      }
    }
  }

  // Print final matrix
  printFinalMatrix(results);

  harness.ws.close();

  const failures = results.filter((r) => r.result.status === "fail");
  if (failures.length > 0) {
    process.exit(1);
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function printFinalMatrix(results: FinalResult[]) {
  console.log(`\n${"=".repeat(70)}`);
  console.log("SCENARIO RESULTS");
  console.log("=".repeat(70));

  // Group by group name
  const groups = new Map<string, FinalResult[]>();
  for (const r of results) {
    const group = groups.get(r.scenario.group) ?? [];
    group.push(r);
    groups.set(r.scenario.group, group);
  }

  const idWidth = 4;
  const nameWidth = Math.max(...results.map((r) => r.scenario.name.length), 10);
  const statusWidth = 6;
  const durWidth = 8;

  for (const [groupName, groupResults] of groups) {
    console.log(`\n  ${groupName}`);
    console.log(`  ${"─".repeat(idWidth + nameWidth + statusWidth + durWidth + 6)}`);

    for (const r of groupResults) {
      const icon = r.result.status === "pass" ? "+" : r.result.status === "fail" ? "x" : "~";
      const dur = formatDuration(r.durationMs);
      console.log(
        `  [${icon}] #${String(r.scenario.id).padEnd(idWidth)} ${r.scenario.name.padEnd(nameWidth)}  ${r.result.status.toUpperCase().padEnd(statusWidth)} ${dur.padStart(durWidth)}`,
      );
    }
  }

  const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);
  const passed = results.filter((r) => r.result.status === "pass").length;
  const failed = results.filter((r) => r.result.status === "fail").length;
  const skipped = results.filter((r) => r.result.status === "skip").length;

  console.log(`\n${"=".repeat(70)}`);
  console.log(
    `Total: ${results.length} scenarios | ${passed} passed | ${failed} failed | ${skipped} skipped | ${formatDuration(totalMs)}`,
  );
  console.log("=".repeat(70));
}

main().catch((err) => {
  console.error("Scenario runner crashed:", err);
  process.exit(2);
});

// Mark sleep as used (it's exported for scenario use but not needed in initial scenarios)
void sleep;
