#!/usr/bin/env bun
/**
 * Diagnostic test script for the orchestrator pipeline.
 * Connects to the running dev server via WebSocket and exercises:
 * 1. Get snapshot (verify server is responding)
 * 2. Create a project (if none exists)
 * 3. Create an orchestrator thread (verify threadType flows through)
 * 4. Verify thread appears in snapshot with correct threadType and parentThreadId
 * 5. Start a turn (send a message to the orchestrator thread)
 * 6. Listen for domain events (verify provider session starts)
 *
 * Usage: bun scripts/test-orchestrator.ts [port]
 */

const SERVER_PORT = process.argv[2] ?? "3784";
const WS_URL = `ws://localhost:${SERVER_PORT}`;

let ws: WebSocket;
let requestId = 0;
const pendingRequests = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>();
const domainEvents: any[] = [];

function connect(): Promise<void> {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => resolve();
    ws.onerror = (e) => reject(new Error(`WebSocket error: ${e}`));
    ws.onclose = () => console.log("[ws] closed");
    ws.onmessage = (event) => {
      const raw = String(event.data);
      try {
        const msg = JSON.parse(raw);
        // Push message (has type: "push" and channel)
        if (msg.type === "push" && msg.channel) {
          domainEvents.push(msg);
          return;
        }
        // Response to a request (has id field)
        if (msg.id !== undefined) {
          const id = String(msg.id);
          if (pendingRequests.has(id)) {
            const { resolve, reject } = pendingRequests.get(id)!;
            pendingRequests.delete(id);
            if (msg.error) reject(msg.error);
            else resolve(msg.result);
            return;
          }
        }
        // Unknown message — log it
        console.log(`  [ws] Unmatched message: ${raw.slice(0, 200)}`);
      } catch {
        console.log(`  [ws] Non-JSON: ${raw.slice(0, 200)}`);
      }
    };
  });
}

function request(method: string, fields?: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = String(++requestId);
    pendingRequests.set(id, { resolve, reject });
    // Server expects: { id: "string", body: { _tag: "method.name", ...fields } }
    const body = { _tag: method, ...fields };
    ws.send(JSON.stringify({ id, body }));
    // Timeout after 10s
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`Timeout waiting for ${method}`));
      }
    }, 10000);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function pass(label: string) {
  console.log(`  ✅ ${label}`);
}
function fail(label: string, detail?: string) {
  console.log(`  ❌ ${label}${detail ? `: ${detail}` : ""}`);
}
function info(label: string) {
  console.log(`  ℹ️  ${label}`);
}

async function main() {
  console.log(`\n🔧 Orchestrator Pipeline Test\n`);
  console.log(`Connecting to ${WS_URL}...`);

  try {
    await connect();
    pass("WebSocket connected");
  } catch (e) {
    fail("WebSocket connection", String(e));
    process.exit(1);
  }

  // ── Test 1: Get snapshot ──
  console.log("\n── Test 1: Get Snapshot ──");
  let snapshot: any;
  try {
    snapshot = await request("orchestration.getSnapshot");
    pass(`Snapshot received (sequence: ${snapshot.snapshotSequence})`);
    info(`Projects: ${snapshot.projects?.length ?? 0}`);
    info(`Threads: ${snapshot.threads?.length ?? 0}`);
  } catch (e: any) {
    fail("Get snapshot", e.message ?? JSON.stringify(e));
    process.exit(1);
  }

  // ── Test 2: Ensure a project exists ──
  console.log("\n── Test 2: Ensure Project ──");
  let projectId: string;
  if (snapshot.projects?.length > 0) {
    projectId = snapshot.projects[0].id;
    pass(`Using existing project: ${projectId}`);
  } else {
    projectId = crypto.randomUUID();
    try {
      await request("orchestration.dispatchCommand", {
        command: {
          type: "project.create",
          commandId: crypto.randomUUID(),
          projectId,
          title: "test-project",
          workspaceRoot: process.cwd(),
          createdAt: new Date().toISOString(),
        },
      });
      pass(`Created project: ${projectId}`);
    } catch (e: any) {
      fail("Create project", e.message ?? JSON.stringify(e));
      process.exit(1);
    }
  }

  // ── Test 3: Create orchestrator thread ──
  console.log("\n── Test 3: Create Orchestrator Thread ──");
  const orchestratorThreadId = crypto.randomUUID();
  try {
    await request("orchestration.dispatchCommand", {
      command: {
        type: "thread.create",
        commandId: crypto.randomUUID(),
        threadId: orchestratorThreadId,
        projectId,
        title: "Test Orchestrator",
        modelSelection: { provider: "codex", model: "o4-mini" },
        runtimeMode: "full-access",
        interactionMode: "default",
        threadType: "orchestrator",
        parentThreadId: null,
        branch: null,
        worktreePath: null,
        createdAt: new Date().toISOString(),
      },
    });
    pass(`Created orchestrator thread: ${orchestratorThreadId.slice(0, 8)}...`);
  } catch (e: any) {
    fail("Create orchestrator thread", e.message ?? JSON.stringify(e));
    // Don't exit — try to diagnose
  }

  // ── Test 4: Verify thread in snapshot ──
  console.log("\n── Test 4: Verify Thread in Snapshot ──");
  try {
    snapshot = await request("orchestration.getSnapshot");
    const thread = snapshot.threads?.find((t: any) => t.id === orchestratorThreadId);
    if (!thread) {
      fail("Thread not found in snapshot");
    } else {
      pass(`Thread found in snapshot`);
      if (thread.threadType === "orchestrator") {
        pass(`threadType is "orchestrator"`);
      } else {
        fail(`threadType is "${thread.threadType}", expected "orchestrator"`);
      }
      if (thread.parentThreadId === null || thread.parentThreadId === undefined) {
        pass(`parentThreadId is null (top-level thread)`);
      } else {
        fail(`parentThreadId is "${thread.parentThreadId}", expected null`);
      }
      info(`modelSelection: ${JSON.stringify(thread.modelSelection)}`);
    }
  } catch (e: any) {
    fail("Get snapshot after thread creation", e.message ?? JSON.stringify(e));
  }

  // ── Test 5: Create agent (child) thread ──
  console.log("\n── Test 5: Create Agent Thread (Child) ──");
  const agentThreadId = crypto.randomUUID();
  try {
    await request("orchestration.dispatchCommand", {
      command: {
        type: "thread.create",
        commandId: crypto.randomUUID(),
        threadId: agentThreadId,
        projectId,
        title: "Test Agent",
        modelSelection: { provider: "codex", model: "o4-mini" },
        runtimeMode: "full-access",
        interactionMode: "default",
        threadType: "agent",
        parentThreadId: orchestratorThreadId,
        branch: null,
        worktreePath: null,
        createdAt: new Date().toISOString(),
      },
    });
    pass(
      `Created agent thread: ${agentThreadId.slice(0, 8)}... (child of ${orchestratorThreadId.slice(0, 8)}...)`,
    );
  } catch (e: any) {
    fail("Create agent thread", e.message ?? JSON.stringify(e));
  }

  // ── Test 6: Verify parent-child relationship ──
  console.log("\n── Test 6: Verify Parent-Child Relationship ──");
  try {
    snapshot = await request("orchestration.getSnapshot");
    const agentThread = snapshot.threads?.find((t: any) => t.id === agentThreadId);
    if (!agentThread) {
      fail("Agent thread not found in snapshot");
    } else {
      pass("Agent thread found in snapshot");
      if (agentThread.threadType === "agent") {
        pass(`threadType is "agent"`);
      } else {
        fail(`threadType is "${agentThread.threadType}", expected "agent"`);
      }
      if (agentThread.parentThreadId === orchestratorThreadId) {
        pass(`parentThreadId correctly points to orchestrator thread`);
      } else {
        fail(
          `parentThreadId is "${agentThread.parentThreadId}", expected "${orchestratorThreadId}"`,
        );
      }
    }
  } catch (e: any) {
    fail("Verify parent-child", e.message ?? JSON.stringify(e));
  }

  // ── Test 7: Send a turn to the orchestrator thread ──
  console.log("\n── Test 7: Send Turn to Orchestrator ──");
  domainEvents.length = 0; // Clear events
  try {
    await request("orchestration.dispatchCommand", {
      command: {
        type: "thread.turn.start",
        commandId: crypto.randomUUID(),
        threadId: orchestratorThreadId,
        message: {
          messageId: crypto.randomUUID(),
          role: "user",
          text: "who are you?",
          attachments: [],
        },
        modelSelection: { provider: "codex", model: "o4-mini" },
        runtimeMode: "full-access",
        interactionMode: "default",
        createdAt: new Date().toISOString(),
      },
    });
    pass("Turn dispatched successfully");
  } catch (e: any) {
    fail("Dispatch turn", e.message ?? JSON.stringify(e));
  }

  // Wait for events
  info("Waiting 8 seconds for domain events...");
  await sleep(8000);

  console.log("\n── Test 8: Analyze Domain Events ──");
  info(`Received ${domainEvents.length} domain events`);

  const eventTypes = domainEvents.map((e) => e.data?.type ?? e.channel ?? "unknown");
  for (const type of eventTypes.slice(0, 20)) {
    info(`  Event: ${type}`);
  }

  // Check for turn-related events
  const turnEvents = domainEvents.filter((e) => {
    const t = e.data?.type ?? "";
    return (
      t.includes("turn") || t.includes("message") || t.includes("session") || t.includes("activity")
    );
  });
  if (turnEvents.length > 0) {
    pass(`Got ${turnEvents.length} turn/session events`);
  } else {
    fail("No turn/session events received — provider may not have started");
  }

  // Check for thread activities (provider runtime events)
  const activities = domainEvents.filter((e) => e.data?.type === "thread.activity-appended");
  if (activities.length > 0) {
    pass(`Got ${activities.length} activity events (provider is streaming)`);
    // Show first few activity details
    for (const a of activities.slice(0, 5)) {
      const payload = a.data?.payload;
      info(
        `  Activity: ${payload?.activity?.kind ?? "unknown"} - ${JSON.stringify(payload?.activity?.data)?.slice(0, 100)}`,
      );
    }
  } else {
    fail("No activity events — provider session may not have started");
    info("This means the turn was dispatched but no provider picked it up");
  }

  // ── Test 9: Check snapshot for turn state ──
  console.log("\n── Test 9: Final Snapshot ──");
  try {
    snapshot = await request("orchestration.getSnapshot");
    const thread = snapshot.threads?.find((t: any) => t.id === orchestratorThreadId);
    if (thread) {
      info(`Thread session: ${JSON.stringify(thread.session)}`);
      info(`Latest turn: ${JSON.stringify(thread.latestTurn)}`);
      info(`Messages count: ${thread.messages?.length ?? 0}`);
      info(`Activities count: ${thread.activities?.length ?? 0}`);
      if (thread.messages?.length > 0) {
        pass("Thread has messages");
        for (const msg of thread.messages.slice(0, 3)) {
          info(`  Message [${msg.role}]: ${String(msg.text ?? msg.content ?? "").slice(0, 100)}`);
        }
      }
    }
  } catch (e: any) {
    fail("Final snapshot", e.message ?? JSON.stringify(e));
  }

  // ── Test 10: Spawn a worker via orchestration commands (simulates spawn_agent) ──
  console.log("\n── Test 10: Spawn Worker via Orchestration Commands ──");
  const workerThreadId = crypto.randomUUID();
  const workerId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  try {
    // 10a: Create orchestration run
    await request("orchestration.dispatchCommand", {
      command: {
        type: "orchestrator.run.create",
        commandId: crypto.randomUUID(),
        runId,
        projectId,
        userRequest: "Test worker spawn",
        goals: ["Verify worker thread creation"],
        spawnBudget: {
          maxDepth: 3,
          maxChildren: 5,
          maxConcurrentWriters: 2,
          maxTotalWorkers: 10,
          allowedTools: [],
          writeScope: [],
        },
        createdAt: new Date().toISOString(),
      },
    });
    pass("Created orchestration run");

    // 10b: Create orchestration task
    await request("orchestration.dispatchCommand", {
      command: {
        type: "orchestrator.task.create",
        commandId: crypto.randomUUID(),
        taskId,
        runId,
        title: "Test worker task",
        objective: "Verify the spawn_agent flow",
        acceptanceCriteria: ["Worker thread appears in snapshot"],
        maxIterations: 3,
        createdAt: new Date().toISOString(),
      },
    });
    pass("Created orchestration task");

    // 10c: Create worker thread (as spawn_agent would)
    await request("orchestration.dispatchCommand", {
      command: {
        type: "thread.create",
        commandId: crypto.randomUUID(),
        threadId: workerThreadId,
        projectId,
        title: "Test Worker Agent",
        modelSelection: { provider: "codex", model: "o4-mini" },
        runtimeMode: "full-access",
        interactionMode: "default",
        threadType: "agent",
        parentThreadId: orchestratorThreadId,
        branch: null,
        worktreePath: null,
        createdAt: new Date().toISOString(),
      },
    });
    pass("Created worker thread");

    // 10d: Spawn the worker
    await request("orchestration.dispatchCommand", {
      command: {
        type: "orchestrator.worker.spawn",
        commandId: crypto.randomUUID(),
        workerId,
        runId,
        taskId,
        threadId: workerThreadId,
        spawnBudget: {
          maxDepth: 3,
          maxChildren: 5,
          maxConcurrentWriters: 2,
          maxTotalWorkers: 10,
          allowedTools: [],
          writeScope: [],
        },
        workspace: {
          mode: "local",
          cwd: process.cwd(),
          terminalIds: [],
        },
        createdAt: new Date().toISOString(),
      },
    });
    pass("Dispatched orchestrator.worker.spawn");
  } catch (e: any) {
    fail("Spawn worker commands", e.message ?? JSON.stringify(e));
  }

  // ── Test 11: Verify worker in snapshot ──
  console.log("\n── Test 11: Verify Worker Thread and Run in Snapshot ──");
  try {
    snapshot = await request("orchestration.getSnapshot");

    // Check worker thread
    const workerThread = snapshot.threads?.find((t: any) => t.id === workerThreadId);
    if (!workerThread) {
      fail("Worker thread not found in snapshot");
    } else {
      pass("Worker thread found in snapshot");
      if (workerThread.threadType === "agent") {
        pass('Worker threadType is "agent"');
      } else {
        fail(`Worker threadType is "${workerThread.threadType}", expected "agent"`);
      }
      if (workerThread.parentThreadId === orchestratorThreadId) {
        pass("Worker parentThreadId points to orchestrator");
      } else {
        fail(
          `Worker parentThreadId is "${workerThread.parentThreadId}", expected "${orchestratorThreadId}"`,
        );
      }
    }

    // Check orchestrator workers
    const workers = snapshot.orchestratorWorkers ?? [];
    const spawnedWorker = workers.find((w: any) => w.workerId === workerId);
    if (spawnedWorker) {
      pass(`Worker ${workerId.slice(0, 8)}... found in orchestratorWorkers`);
      if (spawnedWorker.threadId === workerThreadId) {
        pass("Worker threadId matches the created thread");
      } else {
        fail(`Worker threadId mismatch: ${spawnedWorker.threadId} vs ${workerThreadId}`);
      }
      info(`Worker status: ${spawnedWorker.status}`);
    } else {
      fail("Worker not found in orchestratorWorkers");
      info(
        `Available workers: ${workers.map((w: any) => w.workerId?.slice(0, 8)).join(", ") || "none"}`,
      );
    }

    // Check orchestrator runs
    const runs = snapshot.orchestratorRuns ?? [];
    const createdRun = runs.find((r: any) => r.runId === runId);
    if (createdRun) {
      pass(`Run ${runId.slice(0, 8)}... found in orchestratorRuns`);
      info(`Run status: ${createdRun.status}`);
    } else {
      fail("Run not found in orchestratorRuns");
    }

    // Check orchestrator tasks
    const tasks = snapshot.orchestratorTasks ?? [];
    const createdTask = tasks.find((t: any) => t.taskId === taskId);
    if (createdTask) {
      pass(`Task ${taskId.slice(0, 8)}... found in orchestratorTasks`);
      info(`Task status: ${createdTask.status}`);
    } else {
      fail("Task not found in orchestratorTasks");
    }
  } catch (e: any) {
    fail("Verify worker in snapshot", e.message ?? JSON.stringify(e));
  }

  // ── Test 12: Verify orchestrator system prompt effect ──
  console.log("\n── Test 12: Check Orchestrator Thread Messages ──");
  try {
    snapshot = await request("orchestration.getSnapshot");
    const thread = snapshot.threads?.find((t: any) => t.id === orchestratorThreadId);
    if (thread && thread.messages?.length > 1) {
      const assistantMessages = thread.messages.filter((m: any) => m.role === "assistant");
      if (assistantMessages.length > 0) {
        const firstAssistant = assistantMessages[0];
        const text = String(firstAssistant.text ?? firstAssistant.content ?? "").toLowerCase();
        // The orchestrator system prompt tells it to identify as the Orchestrator.
        // If the response mentions orchestrator/coordinator/meta-agent, the prompt was injected.
        const hasOrchestratorIdentity =
          text.includes("orchestrat") ||
          text.includes("coordinator") ||
          text.includes("meta-agent") ||
          text.includes("worker") ||
          text.includes("delegate");
        if (hasOrchestratorIdentity) {
          pass("Assistant response suggests orchestrator identity (system prompt likely injected)");
        } else {
          info("Assistant response does not clearly show orchestrator identity");
          info(`First 200 chars: ${text.slice(0, 200)}`);
        }
      } else {
        info("No assistant messages yet (turn may still be in progress)");
      }
    } else {
      info("Orchestrator thread has no messages or only 1 (turn may not have completed)");
    }
  } catch (e: any) {
    fail("Check orchestrator messages", e.message ?? JSON.stringify(e));
  }

  // ── Summary ──
  console.log("\n── Summary ──");
  info("Domain events breakdown:");
  const typeCounts = new Map<string, number>();
  for (const e of domainEvents) {
    const t = e.data?.type ?? e.channel ?? "unknown";
    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  }
  for (const [type, count] of [...typeCounts.entries()].sort()) {
    info(`  ${type}: ${count}`);
  }

  ws.close();
  console.log("\nDone.\n");
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});

export type TestOrchestratorModule = never;
