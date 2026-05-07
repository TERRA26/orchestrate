# Research Notes

Keyed by issue id. Captures library version behavior, CVEs, framework idioms, and design decisions consulted while investigating.

## Notes

### ORC-011, ORC-012 (subprocess env forwarding)

Anthropic SDK and Codex CLI both read their own credential paths and configuration env vars (`ANTHROPIC_API_KEY`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, etc.). Best practice is allowlist forwarding: only HOME, PATH, USER, LANG, LC\_\*, TZ, and provider-specific prefixes. Servers with multi-tenant exposure (procfs, ps) should never forward shared-secret env vars to child processes that don't need them.

Reference: OWASP "Process Injection / Environment Inheritance" guidance and Node docs on `child_process.spawn({ env })` — when `env` is omitted the child inherits everything; an explicit allowlist replaces the default.

### ORC-013 (logging redaction)

Pino redact paths (`{ redact: ['req.headers.authorization', 'env.SECRET_*'] }`) are the standard for structured loggers. Plain console.error has no redaction and depends on caller discipline.

### ORC-014 (timing-safe equality)

`crypto.timingSafeEqual(a, b)` requires equal-length Buffers. Standard pattern: convert both to Buffer.from(value, 'utf8'), then `a.length === b.length && timingSafeEqual(a, b)` to avoid the length-difference throw. For HMAC-style tokens with constant length, the length check is itself constant-time after one read.

### ORC-015 (event-store concurrency)

SQLite's WAL mode allows one writer at a time but multiple readers. The COALESCE-then-INSERT pattern is NOT atomic across the read and the insert; the read happens at the start of the statement and the insert at the end. BEGIN IMMEDIATE acquires the write lock at the start of the transaction, preventing other writers from interleaving. Standard pattern: `sql.withTransaction(...)` wraps Effect-sql in the necessary BEGIN/COMMIT and (under sql-bun) defaults to BEGIN DEFERRED; we may need to explicitly issue BEGIN IMMEDIATE for write-write contention safety.

### ORC-016 (SQLite pragmas)

With WAL mode enabled, `synchronous = NORMAL` is the SQLite-recommended default (fsync only at WAL checkpoint, not per commit). FULL is for paranoid durability. busy_timeout=5000 retries up to 5 seconds on lock contention; without it, writes return SQLITE_BUSY immediately. cache_size=-N is in KB (negative); -64000 = 64 MB.

### ORC-017, ORC-024 (transactional projection)

Event-sourcing convention: append-only event log is the source of truth; projections are derived. Two patterns:

1. Strong consistency (single transaction wraps append + project) - simpler but limits projection complexity.
2. Eventual consistency (separate steps with retry) - scales but requires per-event "projected" markers and a recovery loop.
   Orchestrate's read-model-on-startup-replay suggests intended (1), but the current code does (2) without the markers. We pick (1) for the immediate fix (small scope, predictable) and document (2) as a follow-up if hot-path latency requires it.

### ORC-018 (error categorization in reactors)

Effect.catchCause + isInterrupted is a common pattern but blanket-logging-and-continue is dangerous. Better: explicit `Effect.catchTag` per error class (TransientError -> retry, FatalError -> escalate). Use Schema-typed errors so the type system enforces handling.

### ORC-019, ORC-021 (retention + WAL checkpoint)

SQLite WAL files do not auto-truncate; only `wal_checkpoint(TRUNCATE)` shrinks them. For multi-week-running servers, periodic checkpointing every 5-15 min is the standard pattern.

### ORC-022 (indexes)

EXPLAIN QUERY PLAN reveals which indexes are hit. For projection_turns, we want covering indexes on (thread_id, created_at DESC) so range scans by thread + time use the index alone. SQLite unique indexes can also serve as range indexes.

### ORC-023 (snapshotting)

Snapshot interval N=1000 events is a common default. Snapshots are not transactional with the event log; if the process crashes mid-snapshot the next startup falls back to full replay. Acceptable cost for catastrophic recovery.

### ORC-025, ORC-026, ORC-028 (untrusted content framing)

Anthropic's prompt-injection guidance recommends wrapping all attacker-controllable input in clearly demarcated XML-like tags (`<untrusted_input>`, `<user_data>`) and instructing the model in the system prompt to treat tagged content as data, not instruction. Spotlighting (Hines et al. 2024) shows tag-wrapping plus explicit system instructions reduces successful injection rates by 20-50% even without other defenses. Combine with input filtering and output validation for defense in depth.

### ORC-027, ORC-029 (shell command injection)

Standard remediation: never use `bash -c "ls $path"`-style interpolation; always use array form `["ls", "-la", path]`. The Claude Code Bash tool supports both forms; documentation should mandate the array form for any worker-supplied string. Path validation regex: `^[A-Za-z0-9._/+-]+$` is conservatively safe; reject anything containing `;`, `|`, `&`, `$`, backticks, parens, redirects, or newlines.

### ORC-030 (tool description sanitization)

Defense in depth. Lower-priority but cheap to add. The current Orchestrate tool catalog is fully hardcoded so the practical risk is near zero today; the hardening pays off only if external/dynamic MCP integration is added later.
