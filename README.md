# Orchestrate

A multi-agent orchestrator for coding agents with browser validation, built on an event-sourced runtime.

Orchestrate coordinates multiple coding agents (Codex, Claude, and more) through a web GUI, providing session management, provider health monitoring, and an orchestration layer that decomposes tasks and drives agent execution.

## Installation

> [!WARNING]
> Orchestrate currently supports Codex and Claude providers.
> Install and authenticate at least one provider before use:
>
> - Codex: install [Codex CLI](https://github.com/openai/codex) and run `codex login`
> - Claude: install Claude Code and run `claude auth login`

### Run without installing

```bash
npx t3
```

### Security

By default, Orchestrate binds to `127.0.0.1` (loopback only). To expose the server on the network, set `--host 0.0.0.0` and configure an auth token via `--auth-token` or `ORCHESTRATE_AUTH_TOKEN`.

## Some notes

We are very early in this project. Expect bugs.

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or PR.
