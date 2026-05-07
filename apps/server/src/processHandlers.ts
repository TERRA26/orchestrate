/**
 * Process-level crash handlers (ORC-213).
 *
 * Without these, an async path that throws outside Effect's scope crashes
 * the server with no log line and no clean shutdown of DB / sockets /
 * subprocesses. We log the error structurally, attempt a brief graceful
 * shutdown, and exit. The shutdown is bounded by a timeout so a hung
 * close path cannot delay the exit indefinitely.
 *
 * The factory functions are exported so tests can invoke the handlers
 * directly without polluting the real process global.
 */

export interface CrashLogger {
  error(payload: Record<string, unknown>, message: string): void;
}

export interface CrashHandlerDeps {
  readonly logger: CrashLogger;
  readonly shutdown: () => Promise<void>;
  readonly exit?: (code: number) => void;
  /** Hard timeout for graceful shutdown. Default 500ms. */
  readonly shutdownTimeoutMs?: number;
}

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 500;

function serializeReason(reason: unknown): Record<string, unknown> {
  if (reason instanceof Error) {
    return {
      name: reason.name,
      message: reason.message,
      stack: reason.stack,
    };
  }
  return { value: typeof reason === "object" ? JSON.stringify(reason) : String(reason) };
}

async function runShutdownAndExit(deps: CrashHandlerDeps, code: number): Promise<void> {
  const exit = deps.exit ?? ((c: number) => process.exit(c));
  const timeoutMs = deps.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });

  try {
    const result = await Promise.race([deps.shutdown().then(() => "ok" as const), timeoutPromise]);
    if (result === "timeout") {
      deps.logger.error(
        { event: "process.shutdown-timeout", timeoutMs },
        "Graceful shutdown timed out; exiting hard.",
      );
    }
  } catch (err) {
    deps.logger.error(
      { event: "process.shutdown-failed", err: serializeReason(err) },
      "Graceful shutdown threw; exiting hard.",
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
  exit(code);
}

export function makeUnhandledRejectionHandler(
  deps: CrashHandlerDeps,
): (reason: unknown, promise?: Promise<unknown>) => void {
  return (reason) => {
    deps.logger.error(
      { event: "process.unhandled-rejection", reason: serializeReason(reason) },
      "Unhandled promise rejection; shutting down.",
    );
    void runShutdownAndExit(deps, 1);
  };
}

export function makeUncaughtExceptionHandler(
  deps: CrashHandlerDeps,
): (error: Error, origin?: string) => void {
  return (error) => {
    deps.logger.error(
      { event: "process.uncaught-exception", error: serializeReason(error) },
      "Uncaught exception; shutting down.",
    );
    void runShutdownAndExit(deps, 1);
  };
}

/**
 * Register the handlers on the global `process`. Returns a function that
 * unregisters them; useful for tests that want to scope the registration.
 */
export function installCrashHandlers(deps: CrashHandlerDeps): () => void {
  const onRejection = makeUnhandledRejectionHandler(deps);
  const onException = makeUncaughtExceptionHandler(deps);
  process.on("unhandledRejection", onRejection);
  process.on("uncaughtException", onException);
  return () => {
    process.off("unhandledRejection", onRejection);
    process.off("uncaughtException", onException);
  };
}
