# Orchestrate Voice Mode

Voice mode connects the Orchestrate composer to a LiveKit room. The browser joins as the
user; `apps/voice-agent` joins the same room as a LiveKit Agent and exposes tools for:

- reading Orchestrate thread/run/task/worker status
- reading plans, pending clarifying questions, pending approvals, child agent panels, and recent activity
- answering native Orchestrate follow-up questions without creating a chat message
- approving native plans through the persisted-plan flow without pasting the plan into chat
- responding to provider approvals such as command approvals
- sending an actionable spoken request into the current orchestrator chat

The voice agent decides whether a spoken request is status-only, a structured UI response
(question/approval/plan approval), or a new orchestrator chat message. Status-only requests and
structured responses do not post extra user messages to chat. Action requests are sent through the
server's voice-agent endpoint and appear in the orchestrator chat as user messages.

## Required Credentials

Create a LiveKit Cloud project or point to a self-hosted LiveKit server, then set:

```powershell
$env:LIVEKIT_URL = "wss://your-project.livekit.cloud"
$env:LIVEKIT_API_KEY = "..."
$env:LIVEKIT_API_SECRET = "..."
$env:OPENAI_API_KEY = "..."
$env:ORCHESTRATE_VOICE_AGENT_SECRET = "a-long-random-shared-secret"
```

Optional:

```powershell
$env:ORCHESTRATE_HTTP_URL = "http://localhost:3773"
$env:LIVEKIT_VOICE_AGENT_NAME = "orchestrate-voice-agent"
$env:ORCHESTRATE_VOICE_OPENAI_REALTIME_MODEL = "gpt-realtime-mini"
$env:ORCHESTRATE_VOICE_OPENAI_VOICE = "alloy"
$env:ORCHESTRATE_VOICE_MAX_RESPONSE_OUTPUT_TOKENS = "1536"
$env:ORCHESTRATE_VOICE_MAX_SESSION_DURATION_MS = "600000"
$env:ORCHESTRATE_VOICE_TURN_EAGERNESS = "high"
$env:ORCHESTRATE_VOICE_MAX_TOOL_STEPS = "24"
$env:ORCHESTRATE_VOICE_IDLE_JOB_PROCESSES = "1"
$env:ORCHESTRATE_VOICE_INITIALIZE_PROCESS_TIMEOUT_MS = "30000"
```

Use the same `ORCHESTRATE_VOICE_AGENT_SECRET` for both the Orchestrate server and the voice agent.
The browser never receives the LiveKit API secret; it requests a short-lived room token from
`/api/livekit/orchestrator-token`.

## Local Run

Terminal 1:

```powershell
bun dev
```

Terminal 2:

```powershell
bun run dev:voice-agent
```

Open an orchestrator thread and click the `Voice` button in the composer. The browser requests
microphone permission, joins a per-thread LiveKit room, and the voice agent is dispatched under
`LIVEKIT_VOICE_AGENT_NAME`.

## HTTP Integration Points

- `POST /api/livekit/orchestrator-token`
  - browser endpoint
  - request: `{ "threadId": "..." }`
  - response: LiveKit URL, room name, and short-lived participant token

- `GET /api/voice/orchestrator/status?threadId=...`
  - voice-agent endpoint
  - requires `Authorization: Bearer $ORCHESTRATE_VOICE_AGENT_SECRET`
  - returns thread, project, active run, tasks, workers, child agent threads, recent messages,
    recent activity, actionable plans, pending clarifying questions, and pending approvals

- `POST /api/voice/orchestrator/user-input-response`
  - voice-agent endpoint
  - requires `Authorization: Bearer $ORCHESTRATE_VOICE_AGENT_SECRET`
  - request: `{ "threadId": "...", "requestId": "...", "answers": { "questionId": "answer" } }`

- `POST /api/voice/orchestrator/approval-response`
  - voice-agent endpoint
  - requires `Authorization: Bearer $ORCHESTRATE_VOICE_AGENT_SECRET`
  - request: `{ "threadId": "...", "requestId": "...", "decision": "accept" | "acceptForSession" | "decline" | "cancel" }`

- `POST /api/voice/orchestrator/plan-approval`
  - voice-agent endpoint
  - requires `Authorization: Bearer $ORCHESTRATE_VOICE_AGENT_SECRET`
  - request: `{ "threadId": "...", "planId": "optional", "text": "optional short approval" }`
  - dispatches a plan-sourced turn so workers read the persisted `.orchestrate/plans/**` file

- `POST /api/voice/orchestrator/message`
  - voice-agent endpoint
  - requires `Authorization: Bearer $ORCHESTRATE_VOICE_AGENT_SECRET`
  - request: `{ "threadId": "...", "text": "...", "dispatchMode": "queue" | "steer" }`

## Diagnostics

Voice mode emits redacted diagnostics from all three moving pieces:

- `browser`: the Orchestrate UI requesting a token, joining LiveKit, publishing microphone audio,
  assistant state transitions, and disconnect/errors
- `server`: token issuance and Orchestrate tool endpoint requests/results
- `agent`: LiveKit job acceptance, room connection, Realtime session startup, and every
  Orchestrate API tool call

Diagnostics are kept in an in-memory ring buffer and appended to:

```text
.logs/voice-diagnostics.jsonl
```

Useful local endpoints:

- `GET /api/voice/orchestrator/logs?limit=100`
  - returns recent events and the JSONL path
  - localhost requests are allowed; remote agent requests require
    `Authorization: Bearer $ORCHESTRATE_VOICE_AGENT_SECRET`
- `GET /api/voice/orchestrator/logs?threadId=<thread>&limit=100`
  - filters diagnostics for one thread
- `GET /api/voice/orchestrator/logs/stream?threadId=<thread>`
  - Server-Sent Events stream for live debugging while reproducing voice bugs
- `POST /api/voice/orchestrator/log`
  - diagnostic ingestion endpoint used by the browser and the LiveKit agent

Example:

```powershell
curl.exe -N "http://localhost:3773/api/voice/orchestrator/logs/stream?limit=20"
```

If the browser shows a LiveKit room such as `orchestrate-voice-__orchestrator_draft__`, the user
joined LiveKit before a real Orchestrate server thread existed. The diagnostics stream will now
make that explicit by showing token issuance for a missing thread and any follow-up status/tool
calls that fail with `Thread not found`.

## Notes

- The default realtime model is `gpt-realtime-mini` through LiveKit's OpenAI plugin to keep
  baseline sessions cost-efficient. Use `gpt-realtime` when tool calling or instruction following
  quality matters more than cost.
- Voice replies are capped by `ORCHESTRATE_VOICE_MAX_RESPONSE_OUTPUT_TOKENS`, the session is
  recycled after `ORCHESTRATE_VOICE_MAX_SESSION_DURATION_MS`, and tool loops are bounded by
  `ORCHESTRATE_VOICE_MAX_TOOL_STEPS`.
- `ORCHESTRATE_VOICE_IDLE_JOB_PROCESSES=1` keeps one LiveKit job runner warm in development so the
  first voice connection does not wait on a cold process import. The initialize timeout is extended
  by `ORCHESTRATE_VOICE_INITIALIZE_PROCESS_TIMEOUT_MS`.
- `ORCHESTRATE_VOICE_TURN_EAGERNESS=high` makes semantic VAD respond quickly; set it to `medium`
  if it cuts users off too aggressively.
- Use `dispatchMode: "steer"` for spoken corrections to active work; use `queue` for normal new
  requests.
- If the voice button says LiveKit is not configured, check the three `LIVEKIT_*` variables on the
  Orchestrate server process.
