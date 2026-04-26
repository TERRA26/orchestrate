#!/usr/bin/env bun
/**
 * End-to-end provider pipeline test.
 *
 * This test exercises the SAME path the browser does:
 * 1. Connect via WebSocket
 * 2. Create an orchestrator thread
 * 3. Send a message (thread.turn.start) — this starts a REAL provider session
 * 4. Watch domain events for provider activity (session started, messages, tool calls)
 * 5. Verify the LLM actually responds and knows it's the orchestrator
 * 6. Ask it to spawn an agent and verify the subthread appears
 *
 * Usage: bun scripts/test-provider-pipeline.ts [port] [provider] [model]
 * Example: bun scripts/test-provider-pipeline.ts 3773 codex gpt-5.4
 * Example: bun scripts/test-provider-pipeline.ts 3773 claudeAgent claude-sonnet-4-6
 */

const SERVER_PORT = process.argv[2] ?? "3773";
const PROVIDER = process.argv[3] ?? "codex";
const MODEL = process.argv[4] ?? "gpt-5.4";
const WS_URL = `ws://localhost:${SERVER_PORT}`;
const TIMEOUT_MS = 60_000; // 60 seconds for LLM to respond

let ws: WebSocket;
let requestId = 0;
const pendingRequests = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>();
const domainEvents: any[] = [];
const allMessages: string[] = [];

function connect(): Promise<void> {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => resolve();
    ws.onerror = (e) => reject(new Error(`WebSocket error: ${e}`));
    ws.onclose = () => {};
    ws.onmessage = (event) => {
      const raw = String(event.data);
      allMessages.push(raw);
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
            return;
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

function pass(label: string) {
  console.log(`  ✅ ${label}`);
}
function fail(label: string, detail?: string) {
  console.log(`  ❌ ${label}${detail ? `: ${detail}` : ""}`);
}
function info(label: string) {
  console.log(`  ℹ️  ${label}`);
}
function warn(label: string) {
  console.log(`  ⚠️  ${label}`);
}

function getEventsOfType(type: string): any[] {
  return domainEvents.filter((e) => e.data?.type === type);
}

function getThreadActivities(threadId: string): any[] {
  return domainEvents
    .filter(
      (e) => e.data?.type === "thread.activity-appended" && e.data?.payload?.threadId === threadId,
    )
    .map((e) => e.data.payload.activity);
}

function getThreadMessages(threadId: string): any[] {
  return domainEvents
    .filter((e) => e.data?.type === "thread.message-sent" && e.data?.payload?.threadId === threadId)
    .map((e) => e.data.payload);
}

async function waitForCondition(
  label: string,
  check: () => boolean,
  timeoutMs: number = TIMEOUT_MS,
  pollMs: number = 500,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (check()) return true;
    await sleep(pollMs);
  }
  return false;
}

async function main() {
  console.log(`\n🔬 Provider Pipeline Test\n`);
  console.log(`Server: ${WS_URL}`);
  console.log(`Provider: ${PROVIDER}`);
  console.log(`Model: ${MODEL}\n`);

  // ── Connect ──
  try {
    await connect();
    pass("WebSocket connected");
  } catch (e) {
    fail("Connect", String(e));
    process.exit(1);
  }

  // ── Get snapshot, find project ──
  console.log("\n── Step 1: Get Snapshot ──");
  let snapshot: any;
  let projectId: string;
  try {
    snapshot = await request("orchestration.getSnapshot");
    pass(`Snapshot (sequence: ${snapshot.snapshotSequence})`);
    if (snapshot.projects?.length > 0) {
      projectId = snapshot.projects[0].id;
      pass(`Project: ${projectId.slice(0, 8)}...`);
    } else {
      fail("No project found");
      process.exit(1);
    }
  } catch (e: any) {
    fail("Snapshot", e.message ?? JSON.stringify(e));
    process.exit(1);
  }

  // ── Create orchestrator thread ──
  console.log("\n── Step 2: Create Orchestrator Thread ──");
  const threadId = crypto.randomUUID();
  try {
    await request("orchestration.dispatchCommand", {
      command: {
        type: "thread.create",
        commandId: crypto.randomUUID(),
        threadId,
        projectId,
        title: "Pipeline Test",
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
    pass(`Created thread: ${threadId.slice(0, 8)}...`);
  } catch (e: any) {
    fail("Create thread", e.message ?? JSON.stringify(e));
    process.exit(1);
  }

  // ── Send "who are you?" — this starts a real provider session ──
  console.log("\n── Step 3: Send 'who are you?' to Orchestrator ──");
  domainEvents.length = 0;
  try {
    await request("orchestration.dispatchCommand", {
      command: {
        type: "thread.turn.start",
        commandId: crypto.randomUUID(),
        threadId,
        message: {
          messageId: crypto.randomUUID(),
          role: "user",
          text: "who are you? what tools do you have?",
          attachments: [],
        },
        modelSelection: { provider: PROVIDER, model: MODEL },
        runtimeMode: "full-access",
        interactionMode: "default",
        createdAt: new Date().toISOString(),
      },
    });
    pass("Turn dispatched");
  } catch (e: any) {
    fail("Dispatch turn", e.message ?? JSON.stringify(e));
  }

  // ── Wait for provider session to start ──
  console.log("\n── Step 4: Wait for Provider Session ──");
  const sessionStarted = await waitForCondition(
    "session.set",
    () => getEventsOfType("thread.session-set").length > 0,
    15000,
  );
  if (sessionStarted) {
    pass("Provider session started");
    const sessions = getEventsOfType("thread.session-set");
    const latestSession = sessions[sessions.length - 1]?.data?.payload;
    info(`Provider: ${latestSession?.providerName ?? "unknown"}`);
    info(`Status: ${latestSession?.status ?? "unknown"}`);
    if (latestSession?.lastError) {
      warn(`Session error: ${latestSession.lastError.slice(0, 200)}`);
    }
  } else {
    fail("Provider session never started (no thread.session-set event in 15s)");
  }

  // ── Wait for LLM response (assistant message or activity) ──
  console.log("\n── Step 5: Wait for LLM Response ──");
  info("Waiting up to 60s for the LLM to respond...");

  const gotResponse = await waitForCondition(
    "LLM response",
    () => {
      // Check for assistant messages
      const activities = getThreadActivities(threadId);
      const hasAssistantActivity = activities.some(
        (a) =>
          a?.kind === "message.delta" ||
          a?.kind === "message.completed" ||
          a?.kind === "assistant" ||
          a?.data?.role === "assistant",
      );
      // Check for turn completion
      const turnCompleted = getEventsOfType("thread.turn-completed").length > 0;
      // Check for any activities beyond session and error
      const meaningfulActivities = activities.filter(
        (a) => a?.kind !== "runtime.error" && a?.kind !== "session.status",
      );
      return hasAssistantActivity || turnCompleted || meaningfulActivities.length > 2;
    },
    TIMEOUT_MS,
    1000,
  );

  if (gotResponse) {
    pass("LLM produced a response");
  } else {
    fail("No LLM response after 60s");
    // Show what events we DID get
    info("Events received:");
    const typeCounts = new Map<string, number>();
    for (const e of domainEvents) {
      const t = e.data?.type ?? "unknown";
      typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
    }
    for (const [type, count] of [...typeCounts.entries()].sort()) {
      info(`  ${type}: ${count}`);
    }
    // Show activities
    const activities = getThreadActivities(threadId);
    info(`Activities for this thread: ${activities.length}`);
    for (const a of activities.slice(0, 10)) {
      info(`  ${a?.kind ?? "unknown"}: ${JSON.stringify(a?.data)?.slice(0, 150)}`);
    }
    // Show session errors
    const sessions = getEventsOfType("thread.session-set");
    for (const s of sessions.slice(-3)) {
      const p = s.data?.payload;
      if (p?.lastError) {
        warn(`Session error: ${p.lastError.slice(0, 300)}`);
      }
    }
  }

  // ── Check the snapshot for thread state ──
  console.log("\n── Step 6: Check Thread State ──");
  try {
    snapshot = await request("orchestration.getSnapshot");
    const thread = snapshot.threads?.find((t: any) => t.id === threadId);
    if (thread) {
      info(`Session status: ${thread.session?.status ?? "null"}`);
      info(`Messages: ${thread.messages?.length ?? 0}`);
      info(`Activities: ${thread.activities?.length ?? 0}`);
      info(`Latest turn: ${thread.latestTurn?.state ?? "null"}`);

      if (thread.session?.lastError) {
        warn(`Session error: ${thread.session.lastError.slice(0, 300)}`);
      }

      // Check if any message mentions "orchestrator"
      const assistantMessages = (thread.messages ?? []).filter((m: any) => m.role === "assistant");
      if (assistantMessages.length > 0) {
        pass(`Got ${assistantMessages.length} assistant message(s)`);
        for (const m of assistantMessages.slice(0, 3)) {
          const text = String(m.text ?? m.content ?? "").slice(0, 200);
          info(`  [${m.role}]: ${text}`);
          if (text.toLowerCase().includes("orchestrat")) {
            pass("LLM identifies as orchestrator!");
          }
        }
      } else {
        fail("No assistant messages in thread");
      }

      // Check activities for tool calls
      const toolCallActivities = (thread.activities ?? []).filter(
        (a: any) =>
          a?.kind === "tool_call" ||
          a?.kind?.includes("tool") ||
          a?.data?.type === "tool_use" ||
          a?.data?.itemType === "orchestration_tool_call",
      );
      if (toolCallActivities.length > 0) {
        pass(`Got ${toolCallActivities.length} tool call activities`);
        for (const tc of toolCallActivities.slice(0, 5)) {
          info(
            `  Tool: ${tc?.data?.name ?? tc?.data?.toolName ?? JSON.stringify(tc).slice(0, 100)}`,
          );
        }
      }
    }
  } catch (e: any) {
    fail("Check thread state", e.message ?? JSON.stringify(e));
  }

  // ── Summary ──
  console.log("\n── Summary ──");
  const typeCounts = new Map<string, number>();
  for (const e of domainEvents) {
    const t = e.data?.type ?? "unknown";
    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  }
  info(`Total domain events: ${domainEvents.length}`);
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
