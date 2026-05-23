import { createRequire } from "node:module";

import { Effect, FileSystem, Layer, Path } from "effect";
import {
  PtyAdapter,
  PtyAdapterShape,
  PtyExitEvent,
  PtyProcess,
  PtySpawnError,
} from "../Services/PTY";

// ORC-255: shown when node-pty cannot be loaded at runtime so the
// caller sees a triage-ready message instead of a generic crash.
// node-pty is a native module; on a host without a C++ toolchain
// AND without a prebuilt binary for the platform, importing it
// throws. The fallback adapter below surfaces this to spawn callers
// rather than letting the whole server fail to boot.
const NODE_PTY_INSTALL_HINT =
  "node-pty failed to load. " +
  "This usually means there is no prebuilt binary for your platform " +
  "and the build-from-source toolchain is unavailable. " +
  "Install build prerequisites: " +
  "darwin -> Xcode Command Line Tools (`xcode-select --install`); " +
  "linux -> python3 + build-essential; " +
  "win32 -> Visual Studio Build Tools (Desktop development with C++). " +
  "Then re-run `bun install`. Terminal features are disabled until then.";

export type NodePtyModuleLoader = () => Promise<typeof import("node-pty")>;

let didEnsureSpawnHelperExecutable = false;

const resolveNodePtySpawnHelperPath = Effect.gen(function* () {
  const requireForNodePty = createRequire(import.meta.url);
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;

  const packageJsonPath = requireForNodePty.resolve("node-pty/package.json");
  const packageDir = path.dirname(packageJsonPath);
  const candidates = [
    path.join(packageDir, "build", "Release", "spawn-helper"),
    path.join(packageDir, "build", "Debug", "spawn-helper"),
    path.join(packageDir, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper"),
  ];

  for (const candidate of candidates) {
    if (yield* fs.exists(candidate)) {
      return candidate;
    }
  }
  return null;
}).pipe(Effect.orElseSucceed(() => null));

export const ensureNodePtySpawnHelperExecutable = Effect.fn(function* (explicitPath?: string) {
  const fs = yield* FileSystem.FileSystem;
  if (process.platform === "win32") return;
  if (!explicitPath && didEnsureSpawnHelperExecutable) return;

  const helperPath = explicitPath ?? (yield* resolveNodePtySpawnHelperPath);
  if (!helperPath) return;
  if (!explicitPath) {
    didEnsureSpawnHelperExecutable = true;
  }

  if (!(yield* fs.exists(helperPath))) {
    return;
  }

  // Best-effort: avoid FileSystem.stat in packaged mode where some fs metadata can be missing.
  yield* fs.chmod(helperPath, 0o755).pipe(Effect.orElseSucceed(() => undefined));
});

class NodePtyProcess implements PtyProcess {
  constructor(private readonly process: import("node-pty").IPty) {}

  get pid(): number {
    return this.process.pid;
  }

  write(data: string): void {
    this.process.write(data);
  }

  resize(cols: number, rows: number): void {
    this.process.resize(cols, rows);
  }

  kill(signal?: string): void {
    this.process.kill(signal);
  }

  pause(): void {
    this.process.pause();
  }

  resume(): void {
    this.process.resume();
  }

  onData(callback: (data: string) => void): () => void {
    const disposable = this.process.onData(callback);
    return () => {
      disposable.dispose();
    };
  }

  onExit(callback: (event: PtyExitEvent) => void): () => void {
    const disposable = this.process.onExit((event) => {
      callback({
        exitCode: event.exitCode,
        signal: event.signal ?? null,
      });
    });
    return () => {
      disposable.dispose();
    };
  }
}

export const makeNodePtyAdapter = (loader: NodePtyModuleLoader) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    // ORC-255: recover from a load failure (missing prebuilt + no
    // toolchain) by surfacing a stub adapter whose spawn fails with
    // a structured error. This keeps server boot intact and gives
    // the operator an actionable message instead of a Layer.die.
    const moduleExit = yield* Effect.exit(
      Effect.tryPromise({
        try: loader,
        catch: (cause) => cause,
      }),
    );

    if (moduleExit._tag === "Failure") {
      return {
        spawn: () =>
          Effect.fail(
            new PtySpawnError({
              adapter: "node-pty",
              message: NODE_PTY_INSTALL_HINT,
              cause: moduleExit.cause,
            }),
          ),
      } satisfies PtyAdapterShape;
    }
    const nodePty = moduleExit.value;

    const ensureNodePtySpawnHelperExecutableCached = yield* Effect.cached(
      ensureNodePtySpawnHelperExecutable().pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
        Effect.orElseSucceed(() => undefined),
      ),
    );

    return {
      spawn: Effect.fn(function* (input) {
        yield* ensureNodePtySpawnHelperExecutableCached;
        const ptyProcess = nodePty.spawn(input.shell, input.args ?? [], {
          cwd: input.cwd,
          cols: input.cols,
          rows: input.rows,
          env: input.env,
          name: globalThis.process.platform === "win32" ? "xterm-color" : "xterm-256color",
        });
        return new NodePtyProcess(ptyProcess);
      }),
    } satisfies PtyAdapterShape;
  });

export const layer = Layer.effect(
  PtyAdapter,
  makeNodePtyAdapter(() => import("node-pty")),
);
