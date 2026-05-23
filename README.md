<p align="center">
  <strong>Orchestrate</strong>
</p>

<p align="center">
  Evidence-driven control plane for coding agents.
</p>

<p align="center">
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-111827?style=flat-square"></a>
  <img alt="Runtime: Bun" src="https://img.shields.io/badge/runtime-Bun-111827?style=flat-square">
  <img alt="Providers: Codex and Claude" src="https://img.shields.io/badge/providers-Codex%20%2B%20Claude-111827?style=flat-square">
  <img alt="Status: early" src="https://img.shields.io/badge/status-early-6B7280?style=flat-square">
</p>

Orchestrate coordinates multiple coding agents through a durable orchestration runtime, a web and
desktop UI, and a shared browser validation loop. It is built for people and teams supervising
fleets of coding agents while keeping planning, review, browser evidence, approvals, and focused
rework under human control.

## What It Does

- **Plans before it builds.** Orchestrate asks intake questions, proposes a decision-ready plan, and
  waits for approval before dispatching workers.
- **Runs multiple provider agents.** Codex and Claude workers can be spawned, monitored, steered,
  and reviewed from one control plane.
- **Keeps browser evidence visible.** The desktop path owns the browser surface so validation,
  screenshots, logged-in state, annotations, and user takeover happen in the same browser the user
  can see.
- **Records durable execution state.** Work is projected from structured events into runs, tasks,
  workers, checkpoints, reports, approvals, and evidence bundles.
- **Supports voice-mode steering.** Voice mode can read status, answer intake questions, approve
  plans and provider actions, and send spoken steering instructions to the orchestrator.

## Repository Layout

```text
apps/
  desktop/       Electron shell and desktop-owned browser bridge
  server/        Orchestration runtime, provider adapters, persistence, LiveKit token endpoints
  voice-agent/   LiveKit voice worker that talks to Orchestrate over authenticated HTTP tools
  web/           React/Vite application for chat, plans, agents, and browser surfaces
packages/
  contracts/     Shared schemas and typed protocol contracts
  shared/        Runtime helpers shared by apps and packages
scripts/         Dev, build, smoke, release, and snapshot tooling
docs/            Architecture notes and feature documentation
```

## Requirements

- Bun `1.3.9` or newer
- Node.js `22.16`, `23.11`, or `24.10+`
- Git
- At least one authenticated coding provider:
  - Codex CLI: install and run `codex login`
  - Claude Code: install and run `claude auth login`

Voice mode additionally requires:

- LiveKit Cloud or a self-hosted LiveKit server
- An OpenAI API key for the realtime voice model

## Quick Start

```bash
bun install
bun run dev:desktop
```

The desktop dev command starts the web renderer and the Electron desktop host. In desktop mode,
test the app from the Electron window, not a standalone browser tab, because the Electron window
provides the desktop bridge used by the built-in browser.

For web-only development:

```bash
bun run dev
```

## Environment Setup

Copy the template and fill in local values:

```bash
cp .env.example .env.local
```

PowerShell equivalent:

```powershell
Copy-Item .env.example .env.local
```

The repository intentionally ignores `.env`, `.env.local`, and other `.env.*` files. Only
`.env.example` files should be committed.

Required for voice mode:

```bash
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
OPENAI_API_KEY=
ORCHESTRATE_VOICE_AGENT_SECRET=
```

Run the voice agent alongside the desktop or server process:

```bash
bun run dev:voice-agent
```

Read the full voice-mode guide in [docs/VOICE_MODE.md](./docs/VOICE_MODE.md).

## Common Commands

```bash
bun run dev:desktop          # Electron desktop app plus web renderer
bun run dev                  # Server plus web app
bun run dev:web              # Web renderer only
bun run dev:server           # Server only
bun run dev:voice-agent      # LiveKit voice worker
bun run build                # Build all packages/apps
bun run typecheck            # TypeScript checks
bun run test                 # Test suite
bun run lint                 # Oxlint
```

## Security Notes

- Orchestrate binds to loopback by default.
- If you expose the server on a network interface, set `ORCHESTRATE_AUTH_TOKEN`.
- Never commit real LiveKit, OpenAI, Anthropic, Apple, signing, or provider credentials.
- LiveKit API secrets stay server-side. Browsers receive short-lived participant tokens only.
- Local logs, worktrees, generated plans, `.agents`, `.tmp`, and `.env.*` files are ignored.

## Project Status

Orchestrate is early software. Expect sharp edges, especially around long-running worker sessions,
provider availability, and desktop browser automation. Issues and focused pull requests are welcome.

## Contributing

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or pull request.

## License

MIT. See [LICENSE](./LICENSE).
