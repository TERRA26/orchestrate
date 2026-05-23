import { Effect, FileSystem, Path, Random, Schema } from "effect";
import * as Crypto from "node:crypto";
import { lstatSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { ServerConfig } from "../config";

const CodexAuthJsonSchema = Schema.Struct({
  tokens: Schema.Struct({
    account_id: Schema.String,
  }),
});

const ClaudeJsonSchema = Schema.Struct({
  userID: Schema.String,
});

class IdentifyUserError extends Schema.TaggedErrorClass<IdentifyUserError>()("IdentifyUserError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}

const hash = (value: string) =>
  Effect.try({
    try: () => Crypto.createHash("sha256").update(value).digest("hex"),
    catch: (error) =>
      new IdentifyUserError({
        message: "Failed to hash identifier",
        cause: error,
      }),
  });

/**
 * ORC-187: harden read-from-config-file before parsing.
 *
 * The telemetry identifier reads ~/.codex/auth.json and
 * ~/.claude.json. These files contain auth tokens. Without an
 * integrity check, a symlink replacement attack or a race condition
 * could redirect the read to an arbitrary file the attacker controls.
 * Reject on:
 *  - non-regular file (symlink, directory, fifo)
 *  - owner uid does not match the running process uid
 *  - mode bits looser than 0o600 (group/world readable)
 *
 * Returns null on any rejection so the caller can fall through to
 * the next identifier source rather than tripping the telemetry path.
 */
export function validateRestrictedConfigFile(absolutePath: string): {
  readonly ok: boolean;
  readonly reason?: string;
} {
  try {
    // lstat first so a symlink replacement is rejected outright.
    const lstat = lstatSync(absolutePath);
    if (!lstat.isFile()) {
      return { ok: false, reason: "not-a-regular-file" };
    }

    const stat = statSync(absolutePath, { throwIfNoEntry: true });
    const processUid = process.getuid?.() ?? null;
    if (processUid !== null && stat.uid !== processUid) {
      return { ok: false, reason: "owner-mismatch" };
    }
    const mode = stat.mode & 0o777;
    if ((mode & 0o077) !== 0) {
      return { ok: false, reason: "mode-too-permissive" };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "stat-failed",
    };
  }
}

class TelemetryFileNotTrustedError extends Schema.TaggedErrorClass<TelemetryFileNotTrustedError>()(
  "TelemetryFileNotTrustedError",
  {
    path: Schema.String,
    reason: Schema.String,
  },
) {}

const getCodexAccountId = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const authJsonPath = path.join(homedir(), ".codex", "auth.json");
  const validation = validateRestrictedConfigFile(authJsonPath);
  if (!validation.ok) {
    return yield* new TelemetryFileNotTrustedError({
      path: authJsonPath,
      reason: validation.reason ?? "unknown",
    });
  }
  const authJson = yield* Effect.flatMap(
    fileSystem.readFileString(authJsonPath),
    Schema.decodeEffect(Schema.fromJsonString(CodexAuthJsonSchema)),
  );

  // ORC-187: copy out only the field we need so the rest of the
  // parsed object (including refresh tokens, oauth state, etc.) is
  // eligible for GC immediately.
  const accountId = authJson.tokens.account_id;
  return accountId;
});

const getClaudeUserId = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const claudeJsonPath = path.join(homedir(), ".claude.json");
  const validation = validateRestrictedConfigFile(claudeJsonPath);
  if (!validation.ok) {
    return yield* new TelemetryFileNotTrustedError({
      path: claudeJsonPath,
      reason: validation.reason ?? "unknown",
    });
  }
  const claudeJson = yield* Effect.flatMap(
    fileSystem.readFileString(claudeJsonPath),
    Schema.decodeEffect(Schema.fromJsonString(ClaudeJsonSchema)),
  );

  const userId = claudeJson.userID;
  return userId;
});

const upsertAnonymousId = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const { anonymousIdPath } = yield* ServerConfig;

  const anonymousId = yield* fileSystem.readFileString(anonymousIdPath).pipe(
    Effect.catch(() =>
      Effect.gen(function* () {
        const randomId = yield* Random.nextUUIDv4;
        yield* fileSystem.writeFileString(anonymousIdPath, randomId);
        return randomId;
      }),
    ),
  );

  return anonymousId;
});

/**
 * getTelemetryIdentifier - Users are "identified" by finding the first match of the following, then hashing the value.
 * 1. ~/.codex/auth.json tokens.account_id
 * 2. ~/.claude.json userID
 * 3. ~/.t3/telemetry/anonymous-id
 */
export const getTelemetryIdentifier = Effect.gen(function* () {
  const codexAccountId = yield* Effect.result(getCodexAccountId);
  if (codexAccountId._tag === "Success") {
    return yield* hash(codexAccountId.success);
  }

  const claudeUserId = yield* Effect.result(getClaudeUserId);
  if (claudeUserId._tag === "Success") {
    return yield* hash(claudeUserId.success);
  }

  const anonymousId = yield* Effect.result(upsertAnonymousId);
  if (anonymousId._tag === "Success") {
    return yield* hash(anonymousId.success);
  }

  return null;
}).pipe(
  Effect.tapError((error) => Effect.logWarning("Failed to get identifier", { cause: error })),
  Effect.orElseSucceed(() => null),
);
