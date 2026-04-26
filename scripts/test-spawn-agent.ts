#!/usr/bin/env bun
/**
 * Test: Ask the orchestrator to spawn an agent and verify the subthread appears.
 *
 * Usage: bun scripts/test-spawn-agent.ts [port] [provider] [model]
 */

const SERVER_PORT = process.argv[2] ?? "3774";
const PROVIDER = process.argv[3] ?? "codex";
const MODEL = process.argv[4] ?? "gpt-5.4";
const WS_URL = `ws://localhost:${SERVER_PORT}`;

let ws: WebSocket;
let requestId = 0;
const pendingRequests = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>();
const domainEvents: any[] = [];

function connect(): Promise<void> {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => resolve();
    ws.onerror = (e) => reject(new Error(`WebSocket error`));
    ws.onclose = () => {};
    ws.onmessage = (event) => {
      const raw = String(event.data);
      try {
        const msg = JSON.parse(raw);
        if (msg.type === "push" && msg.channel) {
          domainEvents.push(msg);
          return;
        }
        if (msg.id !== undefined) {
          const id = String(msg.id);
          if (pendingRequests.has(id)) {
            const { resolve, reject } = pendingRequests.get(id)!;
            pendingRequests.delete(id);
            if (msg.error) reject(msg.error);
            else resolve(msg.result);
          }
        }
      } catch {}
    };
  });
}

function request(method: string, fields?: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = String(++requestId);
    pendingRequests.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, body: { _tag: method, ...fields } }));
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`Timeout: ${method}`));
      }
    }, 15000);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
function pass(l: string) {
  console.log(`  ✅ ${l}`);
}
function fail(l: string, d?: string) {
  console.log(`  ❌ ${l}${d ? `: ${d}` : ""}`);
}
function info(l: string) {
  console.log(`  ℹ️  ${l}`);
}
function warn(l: string) {
  console.log(`  ⚠️  ${l}`);
}

async function waitFor(check: () => boolean, ms: number = 60000): Promise<boolean> {
  const s = Date.now();
  while (Date.now() - s < ms) {
    if (check()) return true;
    await sleep(1000);
  }
  return false;
}

async function main() {
  console.log(`\n🧪 Spawn Agent Test\n`);
  console.log(`Server: ${WS_URL}, Provider: ${PROVIDER}, Model: ${MODEL}\n`);

  await connect();
  pass("Connected");

  // Get project
  const snapshot = await request("orchestration.getSnapshot");
  const projectId = snapshot.projects?.[0]?.id;
  if (!projectId) {
    fail("No project");
    process.exit(1);
  }

  // Create orchestrator thread
  const threadId = crypto.randomUUID();
  await request("orchestration.dispatchCommand", {
    command: {
      type: "thread.create",
      commandId: crypto.randomUUID(),
      threadId,
      projectId,
      title: "Spawn Test",
      modelSelection: { provider: PROVIDER, model: MODEL },
      runtimeMode: "full-access",
      interactionMode: "default",
      threadType: "orchestrator",
      parentThreadId: null,
      branch: null,
      worktreePath: null,
      createdAt: new Date().toISOString(),
    },
  });
  pass(`Orchestrator thread: ${threadId.slice(0, 8)}...`);

  // Send message asking to spawn an agent
  console.log(
    "\n── Sending: 'open an agent window and tell it to list files in the current directory' ──",
  );
  domainEvents.length = 0;
  await request("orchestration.dispatchCommand", {
    command: {
      type: "thread.turn.start",
      commandId: crypto.randomUUID(),
      threadId,
      message: {
        messageId: crypto.randomUUID(),
        role: "user",
        text: "open an agent window using orchestrate_spawn_agent and tell it to list files in the current directory. use the orchestrate_ prefixed tools only.",
        attachments: [],
      },
      modelSelection: { provider: PROVIDER, model: MODEL },
      runtimeMode: "full-access",
      interactionMode: "default",
      createdAt: new Date().toISOString(),
    },
  });
  pass("Turn dispatched");

  // Wait for response with tool calls
  info("Waiting up to 90s for orchestrator to respond and possibly spawn an agent...");

  const gotToolCall = await waitFor(() => {
    // Check for orchestrate_spawn_agent in activities
    const activities = domainEvents
      .filter((e) => e.data?.type === "thread.activity-appended")
      .map((e) => e.data?.payload?.activity);
    const hasSpawn = activities.some((a) => JSON.stringify(a).includes("orchestrate_spawn_agent"));
    // Also check for new thread.created events (child thread)
    const childThreads = domainEvents.filter(
      (e) => e.data?.type === "thread.created" && e.data?.payload?.parentThreadId === threadId,
    );
    // Or check for turn completion
    const turnDone = domainEvents.some((e) => e.data?.type === "thread.turn-completed");
    return hasSpawn || childThreads.length > 0 || turnDone;
  }, 90000);

  console.log("\n── Results ──");

  // Check for tool calls
  const activities = domainEvents
    .filter((e) => e.data?.type === "thread.activity-appended")
    .map((e) => e.data?.payload?.activity);

  const toolCalls = activities.filter(
    (a) => a?.kind?.includes("tool") || JSON.stringify(a).includes("orchestrate_"),
  );

  if (toolCalls.length > 0) {
    pass(`Found ${toolCalls.length} tool-related activities`);
    for (const tc of toolCalls.slice(0, 5)) {
      info(`  ${tc?.kind}: ${JSON.stringify(tc?.data)?.slice(0, 150)}`);
    }
  } else {
    fail("No tool calls detected in activities");
  }

  // Check for child threads
  const childCreated = domainEvents.filter(
    (e) => e.data?.type === "thread.created" && e.data?.payload?.parentThreadId === threadId,
  );
  if (childCreated.length > 0) {
    pass(`${childCreated.length} child thread(s) created!`);
    for (const c of childCreated) {
      info(`  Child: ${c.data.payload.threadId.slice(0, 8)}... type=${c.data.payload.threadType}`);
    }
  } else {
    fail("No child threads created");
  }

  // Check for worker spawns
  const workerSpawns = domainEvents.filter((e) => e.data?.type === "orchestrator.worker.spawned");
  if (workerSpawns.length > 0) {
    pass(`${workerSpawns.length} worker(s) spawned`);
  }

  // Check final snapshot
  console.log("\n── Final Snapshot ──");
  const finalSnapshot = await request("orchestration.getSnapshot");
  const orchThread = finalSnapshot.threads?.find((t: any) => t.id === threadId);
  if (orchThread) {
    info(`Orchestrator messages: ${orchThread.messages?.length ?? 0}`);
    const assistantMsgs = (orchThread.messages ?? []).filter((m: any) => m.role === "assistant");
    for (const m of assistantMsgs.slice(0, 2)) {
      info(`  [assistant]: ${String(m.text ?? "").slice(0, 200)}`);
    }
  }

  const childThreads =
    finalSnapshot.threads?.filter((t: any) => t.parentThreadId === threadId) ?? [];
  if (childThreads.length > 0) {
    pass(`${childThreads.length} child thread(s) in snapshot`);
    for (const ct of childThreads) {
      info(
        `  ${ct.id.slice(0, 8)}... type=${ct.threadType} parent=${ct.parentThreadId?.slice(0, 8)}...`,
      );
    }
  } else {
    fail("No child threads in snapshot");
  }

  const workers = finalSnapshot.orchestratorWorkers ?? [];
  if (workers.length > 0) {
    pass(`${workers.length} worker(s) in snapshot`);
    for (const w of workers) {
      info(
        `  Worker ${w.workerId?.slice(0, 8)}... thread=${w.threadId?.slice(0, 8)}... status=${w.status}`,
      );
    }
  }

  // Event summary
  console.log("\n── Events ──");
  const types = new Map<string, number>();
  for (const e of domainEvents) {
    const t = e.data?.type ?? "unknown";
    types.set(t, (types.get(t) ?? 0) + 1);
  }
  for (const [t, c] of [...types.entries()].sort()) {
    info(`  ${t}: ${c}`);
  }

  ws.close();
  console.log("\nDone.\n");
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
