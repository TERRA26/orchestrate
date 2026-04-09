# Provider architecture

The web app communicates with the server via WebSocket using a simple JSON-RPC-style protocol:

- **Request/Response**: `{ id, method, params }` → `{ id, result }` or `{ id, error }`
- **Push events**: typed envelopes with `channel`, `sequence` (monotonic per connection), and channel-specific `data`

Push channels: `server.welcome`, `server.configUpdated`, `terminal.event`, `orchestration.domainEvent`. Payloads are schema-validated at the transport boundary (`wsTransport.ts`). Decode failures produce structured `WsDecodeDiagnostic` with `code`, `reason`, and path info.

Methods mirror the `NativeApi` interface defined in `@t3tools/contracts`:

- `providers.startSession`, `providers.sendTurn`, `providers.interruptTurn`
- `providers.respondToRequest`, `providers.stopSession`
- `shell.openInEditor`, `server.getConfig`

## Supported providers

Two providers are supported. Provider selection is per-thread via `ModelSelection.provider`.

### Codex (`codex`)

The default provider. The server starts one `codex app-server` process per session (JSON-RPC over stdio) via `codexAppServerManager.ts`. Structured events from the process are streamed to the browser through WebSocket push messages.

### Claude Agent (`claudeAgent`)

A first-class provider adapter backed by `@anthropic-ai/claude-agent-sdk`. Implemented in `ClaudeAdapter.ts`. The adapter wraps SDK query sessions behind the generic provider adapter contract and emits canonical `ProviderRuntimeEvent` shapes — the same ingestion path used by Codex. No separate WebSocket channels or bypass paths.

### Provider selection

`ModelSelection` is a discriminated union:

```ts
CodexModelSelection  { provider: "codex";       model: string }
ClaudeModelSelection { provider: "claudeAgent"; model: string }
```

Provider routing happens in `ProviderService`, which dispatches to the appropriate adapter based on `ModelSelection.provider`. The default provider when none is specified is `codex`.

### Target: per-task model policy (planned)

The planned multi-model orchestrator selects providers and models per task, not per run, using an explicit policy with capability profiles, fallback classes, and telemetry. See the contract spec at `docs/superpowers/specs/2026-04-07-orchestrator-contract-design.md` for the full `ModelPolicy`, `WorkerModelBinding`, `CapabilityProfile`, and `FallbackPolicy` schemas.

## Client transport

`wsTransport.ts` manages connection state: `connecting` → `open` → `reconnecting` → `closed` → `disposed`. Outbound requests are queued while disconnected and flushed on reconnect. Inbound pushes are decoded and validated at the boundary, then cached per channel. Subscribers can opt into `replayLatest` to receive the last push on subscribe.

## Server-side orchestration layers

Provider runtime events flow through queue-based workers:

1. **ProviderRuntimeIngestion** — consumes provider runtime streams, emits orchestration commands
2. **ProviderCommandReactor** — reacts to orchestration intent events, dispatches provider calls
3. **CheckpointReactor** — captures git checkpoints on turn start/complete, publishes runtime receipts

All three use `DrainableWorker` internally and expose `drain()` for deterministic test synchronization.
