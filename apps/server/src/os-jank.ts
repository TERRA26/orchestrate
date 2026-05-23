import * as OS from "node:os";
import { Effect, Path } from "effect";
import { readPathFromLoginShell } from "@orchestrate/shared/shell";

interface FixPathOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly readPath?: typeof readPathFromLoginShell;
}

export function fixPath(options: FixPathOptions = {}): void {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const readPath = options.readPath ?? readPathFromLoginShell;
  if (platform !== "darwin" && platform !== "linux") return;

  try {
    const shell = env.SHELL ?? "/bin/zsh";
    const result = readPath(shell);
    if (result) {
      env.PATH = result;
    }
  } catch {
    // Silently ignore — keep default PATH
  }
}

export const expandHomePath = Effect.fn(function* (input: string) {
  const { join } = yield* Path.Path;
  if (input === "~") {
    return OS.homedir();
  }
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return join(OS.homedir(), input.slice(2));
  }
  return input;
});

export const resolveBaseDir = Effect.fn(function* (raw: string | undefined) {
  const { join, resolve } = yield* Path.Path;
  if (!raw || raw.trim().length === 0) {
    return join(OS.homedir(), ".t3");
  }
  return resolve(yield* expandHomePath(raw.trim()));
});
