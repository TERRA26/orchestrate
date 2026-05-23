<h1 align="center">Orchestrate</h1>

<p align="center">
  <strong>Evidence-driven control plane for coding agents.</strong>
</p>

<p align="center">
  Coordinate Codex, Claude, and future provider agents through durable planning,
  visible delegation, shared browser validation, and human-approved rework.
</p>

<p align="center">
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-111827?style=for-the-badge"></a>
  <img alt="Runtime: Bun" src="https://img.shields.io/badge/runtime-Bun-111827?style=for-the-badge">
  <img alt="Providers: Codex and Claude" src="https://img.shields.io/badge/providers-Codex%20%2B%20Claude-111827?style=for-the-badge">
  <img alt="Status: early" src="https://img.shields.io/badge/status-early%20WIP-6B7280?style=for-the-badge">
</p>

---

## Overview

Orchestrate is a multi-agent orchestration runtime and desktop/web interface for supervising coding
agents. It is designed around a simple operating principle: agents should not just claim work is
done. They should plan, delegate, verify in a visible browser, and leave durable evidence behind.

The project is early, but the shape is already clear:

| Capability            | What Orchestrate Provides                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Planning and approval | Native intake, proposed plans, checkpoints, and approval gates before implementation starts.                      |
| Multi-agent execution | Visible Codex and Claude worker sessions coordinated through a shared orchestration runtime.                      |
| Browser validation    | Desktop-owned browser surfaces for screenshots, navigation, logged-in state, annotations, and user takeover.      |
| Durable evidence      | Structured events for runs, tasks, workers, reports, browser checks, and acceptance decisions.                    |
| Human control         | Review, focused rework, plan approval, provider action approval, and voice-mode steering stay under user control. |

## Demo Workflow

Orchestrate is built to make the workflow itself visible:

```text
User request
  -> native intake questions
  -> decision-ready plan
  -> user approval
  -> parallel provider workers
  -> browser validation
  -> evidence-backed acceptance or focused rework
```

This makes it a good fit for teams that want the speed of coding agents without losing planning,
review, or operational confidence.

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

The desktop dev command starts the web renderer and the Electron desktop host. For browser
validation work, use the Electron window. The standalone web tab does not provide the same
desktop-owned browser bridge.

For web-only development:

```bash
bun run dev
```

## Environment Setup

Copy the checked-in template and fill in local values:

```bash
cp .env.example .env.local
```

PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Only `.env.example` files should be committed. `.env`, `.env.local`, and `.env.*` are ignored.

Minimum voice-mode values:

```bash
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
OPENAI_API_KEY=
ORCHESTRATE_VOICE_AGENT_SECRET=
```

Run the voice worker alongside the desktop or server process:

```bash
bun run dev:voice-agent
```

See [docs/VOICE_MODE.md](./docs/VOICE_MODE.md) for the complete voice-mode setup.

## Common Commands

| Command                   | Purpose                                       |
| ------------------------- | --------------------------------------------- |
| `bun run dev:desktop`     | Start Electron desktop plus the web renderer. |
| `bun run dev`             | Start the server plus web app.                |
| `bun run dev:web`         | Start the web renderer only.                  |
| `bun run dev:server`      | Start the server only.                        |
| `bun run dev:voice-agent` | Start the LiveKit voice worker.               |
| `bun run build`           | Build all packages and apps.                  |
| `bun run typecheck`       | Run TypeScript checks.                        |
| `bun run test`            | Run the Vitest suite through Turbo.           |
| `bun run lint`            | Run Oxlint.                                   |
| `bun fmt`                 | Format the workspace.                         |

## Security Notes

- Orchestrate binds to loopback by default.
- If you expose the server on a network interface, set `ORCHESTRATE_AUTH_TOKEN`.
- Never commit real LiveKit, OpenAI, Anthropic, Apple, signing, or provider credentials.
- LiveKit API secrets stay server-side. Browsers receive short-lived participant tokens only.
- Local logs, worktrees, generated plans, `.agents`, `.tmp`, `scratch`, and `.env.*` files are ignored.

## Project Status

Orchestrate is early WIP software. Expect sharp edges around long-running sessions, provider
availability, desktop browser automation, and voice-mode orchestration. Focused issues and pull
requests are welcome.

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or pull request.

## License

MIT. See [LICENSE](./LICENSE).
