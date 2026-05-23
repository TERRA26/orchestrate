import type { JobContext } from "@livekit/agents";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  answerOrchestratorQuestion,
  getOrchestratorPlan,
  readVoiceAgentConfig,
  sendOrchestratorMessage,
} from "./orchestrateTools.js";

function ctxForRoom(roomName: string): JobContext {
  return {
    job: { room: { name: roomName } },
    room: { name: roomName },
  } as unknown as JobContext;
}

function ctxForRoomWithMetadata(roomName: string, metadata: Record<string, unknown>): JobContext {
  return {
    job: { metadata: JSON.stringify(metadata), room: { name: roomName } },
    room: { name: roomName },
  } as unknown as JobContext;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("orchestrateTools", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults voice-agent API calls to the Orchestrate HTTP server port", () => {
    expect(
      readVoiceAgentConfig({
        ORCHESTRATE_VOICE_AGENT_SECRET: "secret",
      }).orchestrateHttpUrl,
    ).toBe("http://localhost:3773");
  });

  it("prefers the per-room Orchestrate HTTP URL from LiveKit dispatch metadata", () => {
    expect(
      readVoiceAgentConfig(
        {
          ORCHESTRATE_HTTP_URL: "http://localhost:3773",
          ORCHESTRATE_VOICE_AGENT_SECRET: "secret",
        },
        ctxForRoomWithMetadata("orchestrate-voice-thread-1", {
          orchestrateHttpUrl: "http://127.0.0.1:50094/",
        }),
      ).orchestrateHttpUrl,
    ).toBe("http://127.0.0.1:50094");
  });

  it("ignores non-local Orchestrate URLs from LiveKit dispatch metadata", () => {
    expect(
      readVoiceAgentConfig(
        {
          ORCHESTRATE_HTTP_URL: "http://localhost:3773",
          ORCHESTRATE_VOICE_AGENT_SECRET: "secret",
        },
        ctxForRoomWithMetadata("orchestrate-voice-thread-1", {
          orchestrateHttpUrl: "https://example.com",
        }),
      ).orchestrateHttpUrl,
    ).toBe("http://localhost:3773");
  });

  it("sends actionable speech into the orchestrator with bearer auth", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({ accepted: true }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendOrchestratorMessage(
      { orchestrateHttpUrl: "http://orchestrate.test", sharedSecret: "secret" },
      ctxForRoom("orchestrate-voice-thread-1"),
      { text: "Fix the failing build", dispatchMode: "steer" },
    );

    const messageCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/api/voice/orchestrator/message"),
    );
    if (!messageCall) throw new Error("expected message fetch call");
    const [url, init] = messageCall;
    const requestInit = init ?? {};
    expect(url).toBe("http://orchestrate.test/api/voice/orchestrator/message");
    expect(requestInit).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer secret" }),
    });
    expect(JSON.parse(String(requestInit.body))).toEqual({
      dispatchMode: "steer",
      text: "Fix the failing build",
      threadId: "thread-1",
    });
  });

  it("fetches persisted plan details for spoken readback", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({
        id: "plan-1",
        title: "Portfolio plan",
        voiceSummary: "Title: Portfolio plan\n\nTask outline: Build it.",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getOrchestratorPlan(
      { orchestrateHttpUrl: "http://orchestrate.test", sharedSecret: "secret" },
      ctxForRoom("orchestrate-voice-thread-1"),
      { planId: "plan-1" },
    );

    expect(result).toMatchObject({ id: "plan-1", title: "Portfolio plan" });
    const planCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/api/voice/orchestrator/plan?"),
    );
    if (!planCall) throw new Error("expected plan fetch call");
    const [url, init] = planCall;
    expect(url).toBe(
      "http://orchestrate.test/api/voice/orchestrator/plan?threadId=thread-1&planId=plan-1",
    );
    expect(init).toMatchObject({
      method: "GET",
      headers: expect.objectContaining({ Authorization: "Bearer secret" }),
    });
  });

  it("collects spoken intake answers and submits them when complete", async () => {
    const status = {
      pendingUserInputs: [
        {
          requestId: "req-1",
          questions: [
            {
              id: "scope",
              header: "Scope",
              question: "How deep?",
              options: [
                {
                  label: "Frontend-only",
                  description: "Mock data.",
                  recommended: true,
                },
              ],
            },
            {
              id: "style",
              header: "Style",
              question: "Which style?",
              options: [{ label: "Dark", description: "Dark UI." }],
            },
          ],
        },
      ],
    };
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlText = String(url);
      if (urlText.includes("/api/voice/orchestrator/status")) {
        return jsonResponse(status);
      }
      if (urlText.endsWith("/api/voice/orchestrator/user-input-response")) {
        return jsonResponse({ accepted: true, body: init?.body });
      }
      return jsonResponse({ error: "unexpected" }, 500);
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await answerOrchestratorQuestion(
      { orchestrateHttpUrl: "http://orchestrate.test", sharedSecret: "secret" },
      ctxForRoom("orchestrate-voice-thread-2"),
      { option: "recommended" },
    );
    expect(first).toMatchObject({
      submitted: false,
      requestId: "req-1",
      answeredQuestionId: "scope",
      nextQuestion: { id: "style" },
    });

    const second = await answerOrchestratorQuestion(
      { orchestrateHttpUrl: "http://orchestrate.test", sharedSecret: "secret" },
      ctxForRoom("orchestrate-voice-thread-2"),
      { option: "Dark" },
    );
    expect(second).toMatchObject({ submitted: true, requestId: "req-1" });

    const postCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/api/voice/orchestrator/user-input-response"),
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse(String((postCall?.[1] as RequestInit | undefined)?.body));
    expect(body).toEqual({
      threadId: "thread-2",
      requestId: "req-1",
      answers: {
        scope: "Frontend-only",
        style: "Dark",
      },
    });
  });
});
