#!/usr/bin/env bun
/**
 * COMPREHENSIVE end-to-end test. Tests EVERYTHING:
 * 1. Data layer (threadType, parentThreadId, snapshot)
 * 2. Codex orchestrator identity (real provider session)
 * 3. Codex spawn agent (orchestrate_spawn_agent tool call)
 * 4. Claude orchestrator identity (real provider session)
 * 5. Sidebar data (child threads in snapshot)
 *
 * This test sends messages through REAL provider sessions and waits for
 * actual LLM responses. It exercises the same path the browser uses.
 *
 * Usage: bun scripts/test-full-pipeline.ts [port]
 */

const PORT = process.argv[2] ?? "3773";
const WS = `ws://localhost:${PORT}`;

let ws: WebSocket;
let rid = 0;
const pending = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>();
const events: any[] = [];
let passed = 0, failed = 0;

function connect(): Promise<void> {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(WS);
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("WS connect failed"));
    ws.onclose = () => {};
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(String(e.data));
        if (m.type === "push") { events.push(m); return; }
        if (m.id !== undefined) {
          const id = String(m.id);
          if (pending.has(id)) {
            const p = pending.get(id)!;
            pending.delete(id);
            m.error ? p.reject(m.error) : p.resolve(m.result);
          }
        }
      } catch {}
    };
  });
}

function req(method: string, fields?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = String(++rid);
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, body: { _tag: method, ...fields } }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`Timeout: ${method}`)); } }, 20000);
  });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function ok(l: string) { passed++; console.log(`  ✅ ${l}`); }
function no(l: string, d?: string) { failed++; console.log(`  ❌ ${l}${d ? `: ${d}` : ""}`); }
function ii(l: string) { console.log(`  ℹ️  ${l}`); }

async function waitFor(fn: () => boolean, ms = 60000): Promise<boolean> {
  const s = Date.now();
  while (Date.now() - s < ms) { if (fn()) return true; await sleep(500); }
  return false;
}

async function sendAndWait(threadId: string, text: string, provider: string, model: string, waitMs = 60000): Promise<{
  assistantText: string | null;
  turnCompleted: boolean;
  sessionError: string | null;
  activities: any[];
}> {
  const beforeCount = events.length;
  await req("orchestration.dispatchCommand", {
    command: {
      type: "thread.turn.start",
      commandId: crypto.randomUUID(),
      threadId,
      message: { messageId: crypto.randomUUID(), role: "user", text, attachments: [] },
      modelSelection: { provider, model },
      runtimeMode: "full-access",
      interactionMode: "default",
      createdAt: new Date().toISOString(),
    },
  });

  // Wait for turn completion or timeout
  await waitFor(() => {
    return events.slice(beforeCount).some(e =>
      e.data?.type === "thread.turn-completed" ||
      (e.data?.type === "thread.session-set" && e.data?.payload?.lastError)
    );
  }, waitMs);

  // Gather results
  const snap = await req("orchestration.getSnapshot");
  const thread = snap.threads?.find((t: any) => t.id === threadId);
  const assistantMsgs = (thread?.messages ?? []).filter((m: any) => m.role === "assistant");
  const lastAssistant = assistantMsgs[assistantMsgs.length - 1];

  return {
    assistantText: lastAssistant ? String(lastAssistant.text ?? "") : null,
    turnCompleted: thread?.latestTurn?.state === "completed",
    sessionError: thread?.session?.lastError ?? null,
    activities: thread?.activities ?? [],
  };
}

async function main() {
  console.log(`\n🔬 FULL PIPELINE TEST\n`);
  console.log(`Server: ${WS}\n`);

  await connect();
  ok("WebSocket connected");

  // Get snapshot
  const snap = await req("orchestration.getSnapshot");
  const projectId = snap.projects?.[0]?.id;
  if (!projectId) { no("No project"); process.exit(1); }
  ok(`Project: ${projectId.slice(0, 8)}...`);

  // ════════════════════════════════════════════════════════════════
  console.log("\n═══ TEST A: Data Layer ═══");
  // ════════════════════════════════════════════════════════════════

  const orchId = crypto.randomUUID();
  const agentId = crypto.randomUUID();

  await req("orchestration.dispatchCommand", { command: {
    type: "thread.create", commandId: crypto.randomUUID(), threadId: orchId, projectId,
    title: "Data Test Orch", modelSelection: { provider: "codex", model: "gpt-5.4" },
    runtimeMode: "full-access", interactionMode: "default", threadType: "orchestrator",
    parentThreadId: null, branch: null, worktreePath: null, createdAt: new Date().toISOString(),
  }});
  ok("Created orchestrator thread");

  await req("orchestration.dispatchCommand", { command: {
    type: "thread.create", commandId: crypto.randomUUID(), threadId: agentId, projectId,
    title: "Data Test Agent", modelSelection: { provider: "codex", model: "gpt-5.4" },
    runtimeMode: "full-access", interactionMode: "default", threadType: "agent",
    parentThreadId: orchId, branch: null, worktreePath: null, createdAt: new Date().toISOString(),
  }});
  ok("Created agent child thread");

  const snap2 = await req("orchestration.getSnapshot");
  const orchThread = snap2.threads?.find((t: any) => t.id === orchId);
  const agentThread = snap2.threads?.find((t: any) => t.id === agentId);

  orchThread?.threadType === "orchestrator" ? ok("Orch threadType=orchestrator") : no(`Orch threadType=${orchThread?.threadType}`);
  agentThread?.threadType === "agent" ? ok("Agent threadType=agent") : no(`Agent threadType=${agentThread?.threadType}`);
  agentThread?.parentThreadId === orchId ? ok("Agent parentThreadId correct") : no(`Agent parentThreadId=${agentThread?.parentThreadId}`);

  // ════════════════════════════════════════════════════════════════
  console.log("\n═══ TEST B: Codex Orchestrator Identity ═══");
  // ════════════════════════════════════════════════════════════════

  const codexThreadId = crypto.randomUUID();
  await req("orchestration.dispatchCommand", { command: {
    type: "thread.create", commandId: crypto.randomUUID(), threadId: codexThreadId, projectId,
    title: "Codex Identity Test", modelSelection: { provider: "codex", model: "gpt-5.4" },
    runtimeMode: "full-access", interactionMode: "default", threadType: "orchestrator",
    parentThreadId: null, branch: null, worktreePath: null, createdAt: new Date().toISOString(),
  }});

  ii("Sending 'who are you?' to Codex orchestrator...");
  const codexResult = await sendAndWait(codexThreadId, "who are you? answer in one sentence.", "codex", "gpt-5.4", 45000);

  if (codexResult.sessionError) {
    no(`Codex session error: ${codexResult.sessionError.slice(0, 150)}`);
  } else if (!codexResult.assistantText) {
    no("No Codex assistant response");
  } else {
    ok(`Codex responded: "${codexResult.assistantText.slice(0, 150)}"`);
    if (codexResult.assistantText.toLowerCase().includes("orchestrat")) {
      ok("Codex identifies as orchestrator");
    } else {
      no("Codex did NOT identify as orchestrator");
    }
  }

  // ════════════════════════════════════════════════════════════════
  console.log("\n═══ TEST C: Codex Spawn Agent ═══");
  // ════════════════════════════════════════════════════════════════

  if (codexResult.sessionError) {
    ii("Skipping spawn test — Codex session errored");
  } else {
    ii("Asking Codex to call orchestrate_spawn_agent...");
    const beforeEvents = events.length;
    const spawnResult = await sendAndWait(
      codexThreadId,
      "Call the orchestrate_spawn_agent tool right now. Pass these exact parameters: {\"task\": \"List files in the current directory\", \"provider\": \"codex\", \"model\": \"gpt-5.4\", \"mode\": \"foreground\"}. Do not explain, just call the tool.",
      "codex", "gpt-5.4", 60000,
    );

    if (spawnResult.sessionError) {
      no(`Spawn session error: ${spawnResult.sessionError.slice(0, 150)}`);
    } else {
      ii(`Assistant: ${(spawnResult.assistantText ?? "").slice(0, 200)}`);

      // Check for child thread creation
      const newChildThreads = events.slice(beforeEvents).filter(
        e => e.data?.type === "thread.created" && e.data?.payload?.parentThreadId === codexThreadId,
      );
      if (newChildThreads.length > 0) {
        ok(`Child thread created by spawn! ID: ${newChildThreads[0].data.payload.threadId.slice(0, 8)}...`);
      } else {
        // Check if tool was called
        const toolCallActivity = events.slice(beforeEvents).find(
          e => JSON.stringify(e).includes("orchestrate_spawn_agent"),
        );
        if (toolCallActivity) {
          ok("orchestrate_spawn_agent tool was called");
          no("But no child thread was created (tool may have errored)");
        } else {
          no("orchestrate_spawn_agent was NOT called by the LLM");
          ii("The LLM may have used its built-in agent tools instead");
        }
      }

      // Check snapshot for workers
      const snap3 = await req("orchestration.getSnapshot");
      const workers = snap3.orchestratorWorkers ?? [];
      if (workers.length > 0) {
        ok(`${workers.length} worker(s) in snapshot`);
        for (const w of workers) {
          ii(`  Worker: ${w.workerId?.slice(0, 8)}... thread=${w.threadId?.slice(0, 8)}... status=${w.status}`);
        }
      }

      const childThreads = (snap3.threads ?? []).filter((t: any) => t.parentThreadId === codexThreadId);
      if (childThreads.length > 0) {
        ok(`${childThreads.length} child thread(s) in snapshot`);
      }
    }
  }

  // ════════════════════════════════════════════════════════════════
  console.log("\n═══ TEST D: Claude Orchestrator Identity ═══");
  // ════════════════════════════════════════════════════════════════

  const claudeThreadId = crypto.randomUUID();
  await req("orchestration.dispatchCommand", { command: {
    type: "thread.create", commandId: crypto.randomUUID(), threadId: claudeThreadId, projectId,
    title: "Claude Identity Test", modelSelection: { provider: "claudeAgent", model: "claude-sonnet-4-6" },
    runtimeMode: "full-access", interactionMode: "default", threadType: "orchestrator",
    parentThreadId: null, branch: null, worktreePath: null, createdAt: new Date().toISOString(),
  }});

  ii("Sending 'who are you?' to Claude orchestrator...");
  const claudeResult = await sendAndWait(claudeThreadId, "who are you? answer in one sentence.", "claudeAgent", "claude-sonnet-4-6", 45000);

  if (claudeResult.sessionError) {
    no(`Claude session error: ${claudeResult.sessionError.slice(0, 200)}`);
  } else if (!claudeResult.assistantText) {
    no("No Claude assistant response");
  } else {
    ok(`Claude responded: "${claudeResult.assistantText.slice(0, 150)}"`);
    if (claudeResult.assistantText.toLowerCase().includes("orchestrat")) {
      ok("Claude identifies as orchestrator");
    } else {
      no("Claude did NOT identify as orchestrator");
    }
  }

  // ════════════════════════════════════════════════════════════════
  console.log("\n═══ RESULTS ═══");
  // ════════════════════════════════════════════════════════════════
  console.log(`\n  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total:  ${passed + failed}\n`);

  ws.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
