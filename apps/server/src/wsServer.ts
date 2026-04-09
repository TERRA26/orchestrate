/**
 * Server - HTTP/WebSocket server service interface.
 *
 * Owns startup and shutdown lifecycle of the HTTP server, static asset serving,
 * and WebSocket request routing.
 *
 * @module Server
 */
import http from "node:http";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import type { Duplex } from "node:stream";

import Mime from "@effect/platform-node/Mime";
import {
  CommandId,
  DEFAULT_TERMINAL_ID,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  type ClientOrchestrationCommand,
  type OrchestrationCommand,
  ORCHESTRATION_WS_CHANNELS,
  ORCHESTRATION_WS_METHODS,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  ProjectId,
  ThreadId,
  WS_CHANNELS,
  WS_METHODS,
  WebSocketRequest,
  type WsResponse as WsResponseMessage,
  WsResponse,
  type WsPushEnvelopeBase,
  type OrchestratorCompleteInput,
  type OrchestratorCompleteResult,
  OrchestratorRunId,
  OrchestratorTaskId,
} from "@t3tools/contracts";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import {
  Cause,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Path,
  Ref,
  Result,
  Schema,
  Scope,
  ServiceMap,
  Stream,
  Struct,
} from "effect";
import { WebSocketServer, type WebSocket } from "ws";

import { createLogger } from "./logger";
import { GitManager } from "./git/Services/GitManager.ts";
import { TerminalManager } from "./terminal/Services/Manager.ts";
import { Keybindings } from "./keybindings";
import { WorkspaceEntries } from "./workspace/Services/WorkspaceEntries.ts";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery";
import { OrchestrationReactor } from "./orchestration/Services/OrchestrationReactor";
import { OrchestratorRuntimeService } from "./orchestration/Services/OrchestratorRuntime";
import { ProviderService } from "./provider/Services/ProviderService";
import { ProviderDiscoveryService } from "./provider/Services/ProviderDiscoveryService";
import { ProviderHealth } from "./provider/Services/ProviderHealth";
import { CheckpointDiffQuery } from "./checkpointing/Services/CheckpointDiffQuery";
import { clamp } from "effect/Number";
import { Open, resolveAvailableEditors } from "./open";
import { ServerConfig } from "./config";
import { GitCore } from "./git/Services/GitCore.ts";
import { tryHandleProjectFaviconRequest } from "./projectFaviconRoute";
import {
  ATTACHMENTS_ROUTE_PREFIX,
  normalizeAttachmentRelativePath,
  resolveAttachmentRelativePath,
} from "./attachmentPaths";

import {
  createAttachmentId,
  resolveAttachmentPath,
  resolveAttachmentPathById,
} from "./attachmentStore.ts";
import { parseBase64DataUrl } from "./imageMime.ts";
import { AnalyticsService } from "./telemetry/Services/AnalyticsService.ts";
import { BrowserAutomation } from "./browser/Services/BrowserAutomation.ts";
import { runProcess } from "./processRunner.ts";
import { expandHomePath } from "./os-jank.ts";
import { makeServerPushBus } from "./wsServer/pushBus.ts";
import { makeServerReadiness } from "./wsServer/readiness.ts";
import { decodeJsonResult, formatSchemaError } from "@t3tools/shared/schemaJson";
import { TerminalThreadTitleTracker } from "./terminal/terminalThreadTitleTracker";
import { ServerSettingsService } from "./serverSettings";

/**
 * ServerShape - Service API for server lifecycle control.
 */
export interface ServerShape {
  /**
   * Start HTTP and WebSocket listeners.
   */
  readonly start: Effect.Effect<
    http.Server,
    ServerLifecycleError,
    Scope.Scope | ServerRuntimeServices | ServerConfig | FileSystem.FileSystem | Path.Path
  >;

  /**
   * Wait for process shutdown signals.
   */
  readonly stopSignal: Effect.Effect<void, never>;
}

/**
 * Server - Service tag for HTTP/WebSocket lifecycle management.
 */
export class Server extends ServiceMap.Service<Server, ServerShape>()("t3/wsServer/Server") {}

const isServerNotRunningError = (error: Error): boolean => {
  const maybeCode = (error as NodeJS.ErrnoException).code;
  return (
    maybeCode === "ERR_SERVER_NOT_RUNNING" || error.message.toLowerCase().includes("not running")
  );
};

function rejectUpgrade(socket: Duplex, statusCode: number, message: string): void {
  socket.end(
    `HTTP/1.1 ${statusCode} ${statusCode === 401 ? "Unauthorized" : "Bad Request"}\r\n` +
      "Connection: close\r\n" +
      "Content-Type: text/plain\r\n" +
      `Content-Length: ${Buffer.byteLength(message)}\r\n` +
      "\r\n" +
      message,
  );
}

function websocketRawToString(raw: unknown): string | null {
  if (typeof raw === "string") {
    return raw;
  }
  if (raw instanceof Uint8Array) {
    return Buffer.from(raw).toString("utf8");
  }
  if (raw instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(raw)).toString("utf8");
  }
  if (Array.isArray(raw)) {
    const chunks: string[] = [];
    for (const chunk of raw) {
      if (typeof chunk === "string") {
        chunks.push(chunk);
        continue;
      }
      if (chunk instanceof Uint8Array) {
        chunks.push(Buffer.from(chunk).toString("utf8"));
        continue;
      }
      if (chunk instanceof ArrayBuffer) {
        chunks.push(Buffer.from(new Uint8Array(chunk)).toString("utf8"));
        continue;
      }
      return null;
    }
    return chunks.join("");
  }
  return null;
}

function toPosixRelativePath(input: string): string {
  return input.replaceAll("\\", "/");
}

function resolveWorkspaceWritePath(params: {
  workspaceRoot: string;
  relativePath: string;
  path: Path.Path;
}): Effect.Effect<{ absolutePath: string; relativePath: string }, RouteRequestError> {
  const normalizedInputPath = params.relativePath.trim();
  if (params.path.isAbsolute(normalizedInputPath)) {
    return Effect.fail(
      new RouteRequestError({
        message: "Workspace file path must be relative to the project root.",
      }),
    );
  }

  const absolutePath = params.path.resolve(params.workspaceRoot, normalizedInputPath);
  const relativeToRoot = toPosixRelativePath(
    params.path.relative(params.workspaceRoot, absolutePath),
  );
  if (
    relativeToRoot.length === 0 ||
    relativeToRoot === "." ||
    relativeToRoot.startsWith("../") ||
    relativeToRoot === ".." ||
    params.path.isAbsolute(relativeToRoot)
  ) {
    return Effect.fail(
      new RouteRequestError({
        message: "Workspace file path must stay within the project root.",
      }),
    );
  }

  return Effect.succeed({
    absolutePath,
    relativePath: relativeToRoot,
  });
}

function stripRequestTag<T extends { _tag: string }>(body: T) {
  return Struct.omit(body, ["_tag"]);
}

const encodeWsResponse = Schema.encodeEffect(Schema.fromJsonString(WsResponse));
const decodeWebSocketRequest = decodeJsonResult(WebSocketRequest);

export type ServerCoreRuntimeServices =
  | OrchestrationEngineService
  | ProjectionSnapshotQuery
  | CheckpointDiffQuery
  | OrchestrationReactor
  | ProviderService
  | ProviderDiscoveryService
  | ProviderHealth;

export type ServerRuntimeServices =
  | ServerCoreRuntimeServices
  | GitManager
  | GitCore
  | TerminalManager
  | Keybindings
  | BrowserAutomation
  | Open
  | AnalyticsService
  | WorkspaceEntries
  | ServerSettingsService
  | OrchestratorRuntimeService;

export class ServerLifecycleError extends Schema.TaggedErrorClass<ServerLifecycleError>()(
  "ServerLifecycleError",
  {
    operation: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

class RouteRequestError extends Schema.TaggedErrorClass<RouteRequestError>()("RouteRequestError", {
  message: Schema.String,
}) {}

class OrchestratorCompletionProcessError extends Schema.TaggedErrorClass<OrchestratorCompletionProcessError>()(
  "OrchestratorCompletionProcessError",
  {
    detail: Schema.String,
  },
) {}

// Summarize noisy websocket pushes so explicit debug logging stays useful
// without dumping ANSI-heavy terminal redraw traffic into the server logs.
function summarizePushForLog(push: WsPushEnvelopeBase): unknown {
  if (push.channel !== WS_CHANNELS.terminalEvent || typeof push.data !== "object" || !push.data) {
    return push.data;
  }

  const event = push.data as Record<string, unknown>;
  const threadId = typeof event.threadId === "string" ? event.threadId : undefined;
  const terminalId = typeof event.terminalId === "string" ? event.terminalId : undefined;
  const createdAt = typeof event.createdAt === "string" ? event.createdAt : undefined;
  const type = typeof event.type === "string" ? event.type : "unknown";

  if (type === "output") {
    const data = typeof event.data === "string" ? event.data : "";
    return {
      type,
      threadId,
      terminalId,
      createdAt,
      outputBytes: Buffer.byteLength(data),
      preview: "redacted",
    };
  }

  const snapshot =
    typeof event.snapshot === "object" && event.snapshot
      ? (event.snapshot as Record<string, unknown>)
      : null;

  if (type === "started" || type === "restarted") {
    const history = typeof snapshot?.history === "string" ? snapshot.history : "";
    return {
      type,
      threadId,
      terminalId,
      createdAt,
      snapshot: {
        cwd: typeof snapshot?.cwd === "string" ? snapshot.cwd : undefined,
        status: typeof snapshot?.status === "string" ? snapshot.status : undefined,
        pid: typeof snapshot?.pid === "number" ? snapshot.pid : null,
        historyBytes: Buffer.byteLength(history),
      },
    };
  }

  return {
    ...event,
    ...(snapshot
      ? {
          snapshot: {
            cwd: typeof snapshot.cwd === "string" ? snapshot.cwd : undefined,
            status: typeof snapshot.status === "string" ? snapshot.status : undefined,
            pid: typeof snapshot.pid === "number" ? snapshot.pid : null,
          },
        }
      : {}),
  };
}

function handleOrchestratorComplete(
  input: OrchestratorCompleteInput,
): Effect.Effect<OrchestratorCompleteResult, RouteRequestError> {
  return Effect.gen(function* () {
    const systemMessage = input.messages.find((m) => m.role === "system")?.content ?? "";
    const userMessage = input.messages.find((m) => m.role === "user")?.content ?? "";
    const prompt = buildOrchestratorCompletionPrompt({
      systemPrompt: systemMessage,
      userPrompt: userMessage,
    });

    const processOptions = input.cwd ? { cwd: input.cwd } : {};

    if (input.provider === "claudeAgent") {
      const claudeArgs = [
        "-p",
        prompt,
        "--model",
        input.model,
        "--output-format",
        "text",
        "--no-session-persistence",
        "--tools",
        "",
      ];
      if (systemMessage) {
        claudeArgs.push("--system-prompt", systemMessage);
      }
      return yield* Effect.tryPromise({
        try: async () => {
          const result = await runProcess("claude", claudeArgs, {
            ...processOptions,
            timeoutMs: 180_000,
            allowNonZeroExit: true,
          });
          return { text: result.stdout.trim() } satisfies OrchestratorCompleteResult;
        },
        catch: (cause) =>
          new OrchestratorCompletionProcessError({
            detail: describeOrchestratorCompletionCause(cause),
          }),
      }).pipe(
        Effect.tapError((cause) =>
          Effect.logWarning("orchestrator completion failed").pipe(
            Effect.annotateLogs({
              provider: input.provider,
              model: input.model,
              detail: describeOrchestratorCompletionCause(cause),
            }),
          ),
        ),
        Effect.mapError(
          () =>
            new RouteRequestError({
              message: "Claude completion request failed.",
            }),
        ),
      );
    }

    return yield* Effect.tryPromise({
      try: () =>
        runCodexOrchestratorCompletion({
          model: input.model,
          reasoningEffort:
            input.modelOptions && "reasoningEffort" in input.modelOptions
              ? (input.modelOptions as any).reasoningEffort
              : null,
          prompt,
          cwd: input.cwd,
        }),
      catch: (cause) =>
        new OrchestratorCompletionProcessError({
          detail: describeOrchestratorCompletionCause(cause),
        }),
    }).pipe(
      Effect.tapError((cause) =>
        Effect.logWarning("orchestrator completion failed").pipe(
          Effect.annotateLogs({
            provider: input.provider,
            model: input.model,
            detail: describeOrchestratorCompletionCause(cause),
          }),
        ),
      ),
      Effect.mapError(
        () =>
          new RouteRequestError({
            message: "Codex completion request failed.",
          }),
      ),
    );
  });
}

function buildOrchestratorCompletionPrompt(input: {
  systemPrompt: string;
  userPrompt: string;
}): string {
  const sections: string[] = [];
  const systemPrompt = input.systemPrompt.trim();
  const userPrompt = input.userPrompt.trim();

  if (systemPrompt.length > 0) {
    sections.push(`System instructions:\n${systemPrompt}`);
  }
  if (userPrompt.length > 0) {
    sections.push(`User request:\n${userPrompt}`);
  }

  return sections.join("\n\n");
}

function resolveCodexCliReasoningEffort(
  effort: string | null | undefined,
): "minimal" | "low" | "medium" | "high" {
  if (effort === "low" || effort === "medium" || effort === "high" || effort === "minimal") {
    return effort;
  }
  if (effort === "xhigh") {
    return "high";
  }
  return "high";
}

function describeOrchestratorCompletionCause(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim().length > 0) {
    return cause.message;
  }
  try {
    return JSON.stringify(cause);
  } catch {
    return String(cause);
  }
}

async function runCodexOrchestratorCompletion(input: {
  model: string;
  reasoningEffort: string | null | undefined;
  prompt: string;
  cwd?: string | undefined;
}): Promise<OrchestratorCompleteResult> {
  const tempDir = await fs.mkdtemp(
    nodePath.join(tmpdir(), `orchestrator-complete-${process.pid}-${randomUUID()}-`),
  );
  const outputPath = nodePath.join(tempDir, "last-message.txt");

  try {
    const effort = resolveCodexCliReasoningEffort(input.reasoningEffort);
    const result = await runProcess(
      "codex",
      [
        "exec",
        "--model",
        input.model,
        "--color",
        "never",
        "--skip-git-repo-check",
        "--config",
        "mcp_servers={}",
        "--config",
        `model_reasoning_effort="${effort}"`,
        "--output-last-message",
        outputPath,
        "-",
      ],
      {
        ...(input.cwd ? { cwd: input.cwd } : {}),
        timeoutMs: 120_000,
        stdin: input.prompt,
        allowNonZeroExit: true,
      },
    );

    const fileOutput = await fs.readFile(outputPath, "utf8").catch(() => "");
    const text = fileOutput.trim() || result.stdout.trim();
    if (!text) {
      const detail = result.stderr.trim() || `Codex CLI exited with code ${result.code ?? "null"}.`;
      throw new Error(detail);
    }
    return {
      text,
    } satisfies OrchestratorCompleteResult;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export const createServer = Effect.fn(function* (): Effect.fn.Return<
  http.Server,
  ServerLifecycleError,
  Scope.Scope | ServerRuntimeServices | ServerConfig | FileSystem.FileSystem | Path.Path
> {
  const serverConfig = yield* ServerConfig;
  const {
    port,
    cwd,
    keybindingsConfigPath,
    staticDir,
    devUrl,
    authToken,
    host,
    logWebSocketEvents,
    autoBootstrapProjectFromCwd,
  } = serverConfig;

  if (!authToken) {
    yield* Effect.log(
      "WARNING: No auth token configured. WebSocket connections are unauthenticated. " +
        "Set T3CODE_AUTH_TOKEN for production use.",
    );
  }

  const availableEditors = resolveAvailableEditors();

  const gitManager = yield* GitManager;
  const terminalManager = yield* TerminalManager;
  const keybindingsManager = yield* Keybindings;
  const providerHealth = yield* ProviderHealth;
  const providerDiscoveryService = yield* ProviderDiscoveryService;
  const git = yield* GitCore;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  yield* keybindingsManager.syncDefaultKeybindingsOnStartup.pipe(
    Effect.catch((error) =>
      Effect.logWarning("failed to sync keybindings defaults on startup", {
        path: error.configPath,
        detail: error.detail,
        cause: error.cause,
      }),
    ),
  );

  const providerStatuses = yield* providerHealth.getStatuses;

  const clients = yield* Ref.make(new Set<WebSocket>());
  const logger = createLogger("ws");
  const readiness = yield* makeServerReadiness;

  function logOutgoingPush(push: WsPushEnvelopeBase, recipients: number) {
    if (!logWebSocketEvents) return;
    logger.event("outgoing push", {
      channel: push.channel,
      sequence: push.sequence,
      recipients,
      payload: summarizePushForLog(push),
    });
  }

  const pushBus = yield* makeServerPushBus({
    clients,
    logOutgoingPush,
  });
  yield* readiness.markPushBusReady;
  yield* keybindingsManager.start.pipe(
    Effect.mapError(
      (cause) => new ServerLifecycleError({ operation: "keybindingsRuntimeStart", cause }),
    ),
  );
  yield* readiness.markKeybindingsReady;

  const normalizeDispatchCommand = Effect.fnUntraced(function* (input: {
    readonly command: ClientOrchestrationCommand;
  }) {
    const normalizeProjectWorkspaceRoot = Effect.fnUntraced(function* (workspaceRoot: string) {
      const normalizedWorkspaceRoot = path.resolve(yield* expandHomePath(workspaceRoot.trim()));
      const workspaceStat = yield* fileSystem
        .stat(normalizedWorkspaceRoot)
        .pipe(Effect.catch(() => Effect.succeed(null)));
      if (!workspaceStat) {
        return yield* new RouteRequestError({
          message: `Project directory does not exist: ${normalizedWorkspaceRoot}`,
        });
      }
      if (workspaceStat.type !== "Directory") {
        return yield* new RouteRequestError({
          message: `Project path is not a directory: ${normalizedWorkspaceRoot}`,
        });
      }
      return normalizedWorkspaceRoot;
    });

    if (input.command.type === "project.create") {
      return {
        ...input.command,
        workspaceRoot: yield* normalizeProjectWorkspaceRoot(input.command.workspaceRoot),
      } satisfies OrchestrationCommand;
    }

    if (input.command.type === "project.meta.update" && input.command.workspaceRoot !== undefined) {
      return {
        ...input.command,
        workspaceRoot: yield* normalizeProjectWorkspaceRoot(input.command.workspaceRoot),
      } satisfies OrchestrationCommand;
    }

    if (input.command.type !== "thread.turn.start") {
      return input.command as OrchestrationCommand;
    }
    const turnStartCommand = input.command;

    const normalizedAttachments = yield* Effect.forEach(
      turnStartCommand.message.attachments,
      (attachment) =>
        Effect.gen(function* () {
          const parsed = parseBase64DataUrl(attachment.dataUrl);
          if (!parsed || !parsed.mimeType.startsWith("image/")) {
            return yield* new RouteRequestError({
              message: `Invalid image attachment payload for '${attachment.name}'.`,
            });
          }

          const bytes = Buffer.from(parsed.base64, "base64");
          if (bytes.byteLength === 0 || bytes.byteLength > PROVIDER_SEND_TURN_MAX_IMAGE_BYTES) {
            return yield* new RouteRequestError({
              message: `Image attachment '${attachment.name}' is empty or too large.`,
            });
          }

          const attachmentId = createAttachmentId(turnStartCommand.threadId);
          if (!attachmentId) {
            return yield* new RouteRequestError({
              message: "Failed to create a safe attachment id.",
            });
          }

          const persistedAttachment = {
            type: "image" as const,
            id: attachmentId,
            name: attachment.name,
            mimeType: parsed.mimeType.toLowerCase(),
            sizeBytes: bytes.byteLength,
          };

          const attachmentPath = resolveAttachmentPath({
            attachmentsDir: serverConfig.attachmentsDir,
            attachment: persistedAttachment,
          });
          if (!attachmentPath) {
            return yield* new RouteRequestError({
              message: `Failed to resolve persisted path for '${attachment.name}'.`,
            });
          }

          yield* fileSystem.makeDirectory(path.dirname(attachmentPath), { recursive: true }).pipe(
            Effect.mapError(
              () =>
                new RouteRequestError({
                  message: `Failed to create attachment directory for '${attachment.name}'.`,
                }),
            ),
          );
          yield* fileSystem.writeFile(attachmentPath, bytes).pipe(
            Effect.mapError(
              () =>
                new RouteRequestError({
                  message: `Failed to persist attachment '${attachment.name}'.`,
                }),
            ),
          );

          return persistedAttachment;
        }),
      { concurrency: 1 },
    );

    return {
      ...turnStartCommand,
      message: {
        ...turnStartCommand.message,
        attachments: normalizedAttachments,
      },
    } satisfies OrchestrationCommand;
  });
  const terminalTitleTracker = new TerminalThreadTitleTracker();
  // Terminal auto-titles are best-effort metadata and must never block terminal writes.
  const maybeAutoRenameTerminalThread = Effect.fnUntraced(function* (input: {
    threadId: string;
    terminalId: string;
    data: string;
  }) {
    const readModel = yield* orchestrationEngine.getReadModel();
    const thread = readModel.threads.find((entry) => entry.id === input.threadId);
    if (!thread) {
      return;
    }
    const nextTitle = terminalTitleTracker.consumeWrite({
      currentTitle: thread.title,
      data: input.data,
      terminalId: input.terminalId,
      threadId: input.threadId,
    });
    if (!nextTitle) {
      return;
    }

    yield* orchestrationEngine.dispatch({
      type: "thread.meta.update",
      commandId: CommandId.makeUnsafe(crypto.randomUUID()),
      threadId: ThreadId.makeUnsafe(input.threadId),
      title: nextTitle,
    });
  });

  // HTTP server — serves static files or redirects to Vite dev server
  const httpServer = http.createServer((req, res) => {
    const respond = (
      statusCode: number,
      headers: Record<string, string>,
      body?: string | Uint8Array,
    ) => {
      res.writeHead(statusCode, headers);
      res.end(body);
    };

    void Effect.runPromise(
      Effect.gen(function* () {
        const url = new URL(req.url ?? "/", `http://localhost:${port}`);
        if (tryHandleProjectFaviconRequest(url, res)) {
          return;
        }

        if (url.pathname.startsWith(ATTACHMENTS_ROUTE_PREFIX)) {
          const rawRelativePath = url.pathname.slice(ATTACHMENTS_ROUTE_PREFIX.length);
          const normalizedRelativePath = normalizeAttachmentRelativePath(rawRelativePath);
          if (!normalizedRelativePath) {
            respond(400, { "Content-Type": "text/plain" }, "Invalid attachment path");
            return;
          }

          const isIdLookup =
            !normalizedRelativePath.includes("/") && !normalizedRelativePath.includes(".");
          const filePath = isIdLookup
            ? resolveAttachmentPathById({
                attachmentsDir: serverConfig.attachmentsDir,
                attachmentId: normalizedRelativePath,
              })
            : resolveAttachmentRelativePath({
                attachmentsDir: serverConfig.attachmentsDir,
                relativePath: normalizedRelativePath,
              });
          if (!filePath) {
            respond(
              isIdLookup ? 404 : 400,
              { "Content-Type": "text/plain" },
              isIdLookup ? "Not Found" : "Invalid attachment path",
            );
            return;
          }

          const fileInfo = yield* fileSystem
            .stat(filePath)
            .pipe(Effect.catch(() => Effect.succeed(null)));
          if (!fileInfo || fileInfo.type !== "File") {
            respond(404, { "Content-Type": "text/plain" }, "Not Found");
            return;
          }

          const contentType = Mime.getType(filePath) ?? "application/octet-stream";
          res.writeHead(200, {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=31536000, immutable",
          });
          const streamExit = yield* Stream.runForEach(fileSystem.stream(filePath), (chunk) =>
            Effect.sync(() => {
              if (!res.destroyed) {
                res.write(chunk);
              }
            }),
          ).pipe(Effect.exit);
          if (Exit.isFailure(streamExit)) {
            if (!res.destroyed) {
              res.destroy();
            }
            return;
          }
          if (!res.writableEnded) {
            res.end();
          }
          return;
        }

        // In dev mode, redirect to Vite dev server
        if (devUrl) {
          respond(302, { Location: devUrl.href });
          return;
        }

        // Serve static files from the web app build
        if (!staticDir) {
          respond(
            503,
            { "Content-Type": "text/plain" },
            "No static directory configured and no dev URL set.",
          );
          return;
        }

        const staticRoot = path.resolve(staticDir);
        const staticRequestPath = url.pathname === "/" ? "/index.html" : url.pathname;
        const rawStaticRelativePath = staticRequestPath.replace(/^[/\\]+/, "");
        const hasRawLeadingParentSegment = rawStaticRelativePath.startsWith("..");
        const staticRelativePath = path.normalize(rawStaticRelativePath).replace(/^[/\\]+/, "");
        const hasPathTraversalSegment = staticRelativePath.startsWith("..");
        if (
          staticRelativePath.length === 0 ||
          hasRawLeadingParentSegment ||
          hasPathTraversalSegment ||
          staticRelativePath.includes("\0")
        ) {
          respond(400, { "Content-Type": "text/plain" }, "Invalid static file path");
          return;
        }

        const isWithinStaticRoot = (candidate: string) =>
          candidate === staticRoot ||
          candidate.startsWith(
            staticRoot.endsWith(path.sep) ? staticRoot : `${staticRoot}${path.sep}`,
          );

        let filePath = path.resolve(staticRoot, staticRelativePath);
        if (!isWithinStaticRoot(filePath)) {
          respond(400, { "Content-Type": "text/plain" }, "Invalid static file path");
          return;
        }

        const ext = path.extname(filePath);
        if (!ext) {
          filePath = path.resolve(filePath, "index.html");
          if (!isWithinStaticRoot(filePath)) {
            respond(400, { "Content-Type": "text/plain" }, "Invalid static file path");
            return;
          }
        }

        const fileInfo = yield* fileSystem
          .stat(filePath)
          .pipe(Effect.catch(() => Effect.succeed(null)));
        if (!fileInfo || fileInfo.type !== "File") {
          const indexPath = path.resolve(staticRoot, "index.html");
          const indexData = yield* fileSystem
            .readFile(indexPath)
            .pipe(Effect.catch(() => Effect.succeed(null)));
          if (!indexData) {
            respond(404, { "Content-Type": "text/plain" }, "Not Found");
            return;
          }
          respond(200, { "Content-Type": "text/html; charset=utf-8" }, indexData);
          return;
        }

        const contentType = Mime.getType(filePath) ?? "application/octet-stream";
        const data = yield* fileSystem
          .readFile(filePath)
          .pipe(Effect.catch(() => Effect.succeed(null)));
        if (!data) {
          respond(500, { "Content-Type": "text/plain" }, "Internal Server Error");
          return;
        }
        respond(200, { "Content-Type": contentType }, data);
      }),
    ).catch(() => {
      if (!res.headersSent) {
        respond(500, { "Content-Type": "text/plain" }, "Internal Server Error");
      }
    });
  });

  // WebSocket server — upgrades from the HTTP server
  const wss = new WebSocketServer({ noServer: true });

  const closeWebSocketServer = Effect.callback<void, ServerLifecycleError>((resume) => {
    wss.close((error) => {
      if (error && !isServerNotRunningError(error)) {
        resume(
          Effect.fail(
            new ServerLifecycleError({ operation: "closeWebSocketServer", cause: error }),
          ),
        );
      } else {
        resume(Effect.void);
      }
    });
  });

  const closeAllClients = Ref.get(clients).pipe(
    Effect.flatMap(Effect.forEach((client) => Effect.sync(() => client.close()))),
    Effect.flatMap(() => Ref.set(clients, new Set())),
  );

  const listenOptions = host ? { host, port } : { port };

  const orchestrationEngine = yield* OrchestrationEngineService;
  const projectionReadModelQuery = yield* ProjectionSnapshotQuery;
  const checkpointDiffQuery = yield* CheckpointDiffQuery;
  const orchestrationReactor = yield* OrchestrationReactor;
  const { openInEditor } = yield* Open;

  const subscriptionsScope = yield* Scope.make("sequential");
  yield* Effect.addFinalizer(() => Scope.close(subscriptionsScope, Exit.void));

  yield* Stream.runForEach(orchestrationEngine.streamDomainEvents, (event) =>
    pushBus.publishAll(ORCHESTRATION_WS_CHANNELS.domainEvent, event),
  ).pipe(Effect.forkIn(subscriptionsScope));

  yield* Stream.runForEach(keybindingsManager.streamChanges, (event) =>
    pushBus.publishAll(WS_CHANNELS.serverConfigUpdated, {
      issues: event.issues,
    }),
  ).pipe(Effect.forkIn(subscriptionsScope));

  yield* Scope.provide(orchestrationReactor.start(), subscriptionsScope);
  yield* readiness.markOrchestrationSubscriptionsReady;

  let welcomeBootstrapProjectId: ProjectId | undefined;
  let welcomeBootstrapThreadId: ThreadId | undefined;

  if (autoBootstrapProjectFromCwd) {
    yield* Effect.gen(function* () {
      const snapshot = yield* projectionReadModelQuery.getSnapshot();
      const existingProject = snapshot.projects.find(
        (project) => project.workspaceRoot === cwd && project.deletedAt === null,
      );
      let bootstrapProjectId: ProjectId;
      let bootstrapProjectDefaultModelSelection;

      if (!existingProject) {
        const createdAt = new Date().toISOString();
        bootstrapProjectId = ProjectId.makeUnsafe(crypto.randomUUID());
        const bootstrapProjectTitle = path.basename(cwd) || "project";
        bootstrapProjectDefaultModelSelection = {
          provider: "codex" as const,
          model: "gpt-5-codex",
        };
        yield* orchestrationEngine.dispatch({
          type: "project.create",
          commandId: CommandId.makeUnsafe(crypto.randomUUID()),
          projectId: bootstrapProjectId,
          title: bootstrapProjectTitle,
          workspaceRoot: cwd,
          defaultModelSelection: bootstrapProjectDefaultModelSelection,
          createdAt,
        });
      } else {
        bootstrapProjectId = existingProject.id;
        bootstrapProjectDefaultModelSelection = existingProject.defaultModelSelection ?? {
          provider: "codex" as const,
          model: "gpt-5-codex",
        };
      }

      const existingThread = snapshot.threads.find(
        (thread) => thread.projectId === bootstrapProjectId && thread.deletedAt === null,
      );
      if (!existingThread) {
        const createdAt = new Date().toISOString();
        const threadId = ThreadId.makeUnsafe(crypto.randomUUID());
        yield* orchestrationEngine.dispatch({
          type: "thread.create",
          commandId: CommandId.makeUnsafe(crypto.randomUUID()),
          threadId,
          projectId: bootstrapProjectId,
          title: "New thread",
          modelSelection: bootstrapProjectDefaultModelSelection,
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          runtimeMode: "full-access",
          envMode: "local",
          branch: null,
          worktreePath: null,
          createdAt,
        });
        welcomeBootstrapProjectId = bootstrapProjectId;
        welcomeBootstrapThreadId = threadId;
      } else {
        welcomeBootstrapProjectId = bootstrapProjectId;
        welcomeBootstrapThreadId = existingThread.id;
      }
    }).pipe(
      Effect.mapError(
        (cause) => new ServerLifecycleError({ operation: "autoBootstrapProject", cause }),
      ),
    );
  }

  const runtimeServices = yield* Effect.services<
    ServerRuntimeServices | ServerConfig | FileSystem.FileSystem | Path.Path
  >();
  const runPromise = Effect.runPromiseWith(runtimeServices);

  const unsubscribeTerminalEvents = yield* terminalManager.subscribe(
    (event) => void Effect.runPromise(pushBus.publishAll(WS_CHANNELS.terminalEvent, event)),
  );
  yield* Effect.addFinalizer(() => Effect.sync(() => unsubscribeTerminalEvents()));
  yield* readiness.markTerminalSubscriptionsReady;

  yield* NodeHttpServer.make(() => httpServer, listenOptions).pipe(
    Effect.mapError((cause) => new ServerLifecycleError({ operation: "httpServerListen", cause })),
  );
  yield* readiness.markHttpListening;

  yield* Effect.addFinalizer(() =>
    Effect.all([closeAllClients, closeWebSocketServer.pipe(Effect.ignoreCause({ log: true }))]),
  );

  const routeRequest = Effect.fnUntraced(function* (ws: WebSocket, request: WebSocketRequest) {
    switch (request.body._tag) {
      case ORCHESTRATION_WS_METHODS.getSnapshot:
        return yield* projectionReadModelQuery.getSnapshot();

      case ORCHESTRATION_WS_METHODS.dispatchCommand: {
        const { command } = request.body;
        const normalizedCommand = yield* normalizeDispatchCommand({ command });
        return yield* orchestrationEngine.dispatch(normalizedCommand);
      }

      case ORCHESTRATION_WS_METHODS.getTurnDiff: {
        const body = stripRequestTag(request.body);
        return yield* checkpointDiffQuery.getTurnDiff(body);
      }

      case ORCHESTRATION_WS_METHODS.getFullThreadDiff: {
        const body = stripRequestTag(request.body);
        return yield* checkpointDiffQuery.getFullThreadDiff(body);
      }

      case ORCHESTRATION_WS_METHODS.replayEvents: {
        const { fromSequenceExclusive } = request.body;
        return yield* Stream.runCollect(
          orchestrationEngine.readEvents(
            clamp(fromSequenceExclusive, {
              maximum: Number.MAX_SAFE_INTEGER,
              minimum: 0,
            }),
          ),
        ).pipe(Effect.map((events) => Array.from(events)));
      }

      case WS_METHODS.projectsSearchEntries: {
        const body = stripRequestTag(request.body);
        const workspaceEntries = yield* WorkspaceEntries;
        return yield* workspaceEntries.search(body).pipe(
          Effect.mapError(
            (cause) =>
              new RouteRequestError({
                message: `Failed to search workspace entries: ${cause.detail}`,
              }),
          ),
        );
      }

      case WS_METHODS.projectsWriteFile: {
        const body = stripRequestTag(request.body);
        const target = yield* resolveWorkspaceWritePath({
          workspaceRoot: body.cwd,
          relativePath: body.relativePath,
          path,
        });
        yield* fileSystem
          .makeDirectory(path.dirname(target.absolutePath), { recursive: true })
          .pipe(
            Effect.mapError(
              (cause) =>
                new RouteRequestError({
                  message: `Failed to prepare workspace path: ${String(cause)}`,
                }),
            ),
          );
        yield* fileSystem.writeFileString(target.absolutePath, body.contents).pipe(
          Effect.mapError(
            (cause) =>
              new RouteRequestError({
                message: `Failed to write workspace file: ${String(cause)}`,
              }),
          ),
        );
        return { relativePath: target.relativePath };
      }

      case WS_METHODS.shellOpenInEditor: {
        const body = stripRequestTag(request.body);
        return yield* openInEditor(body);
      }

      case WS_METHODS.gitStatus: {
        const body = stripRequestTag(request.body);
        return yield* gitManager.status(body);
      }

      case WS_METHODS.gitPull: {
        const body = stripRequestTag(request.body);
        return yield* git.pullCurrentBranch(body.cwd);
      }

      case WS_METHODS.gitRunStackedAction: {
        const body = stripRequestTag(request.body);
        return yield* gitManager.runStackedAction(body, {
          actionId: body.actionId,
          progressReporter: {
            publish: (event) =>
              pushBus.publishClient(ws, WS_CHANNELS.gitActionProgress, event).pipe(Effect.asVoid),
          },
        });
      }

      case WS_METHODS.gitResolvePullRequest: {
        const body = stripRequestTag(request.body);
        return yield* gitManager.resolvePullRequest(body);
      }

      case WS_METHODS.gitPreparePullRequestThread: {
        const body = stripRequestTag(request.body);
        return yield* gitManager.preparePullRequestThread(body);
      }

      case WS_METHODS.gitListBranches: {
        const body = stripRequestTag(request.body);
        return yield* git.listBranches(body);
      }

      case WS_METHODS.gitCreateWorktree: {
        const body = stripRequestTag(request.body);
        return yield* git.createWorktree(body);
      }

      case WS_METHODS.gitCreateDetachedWorktree: {
        const body = stripRequestTag(request.body);
        return yield* git.createDetachedWorktree(body);
      }

      case WS_METHODS.gitRemoveWorktree: {
        const body = stripRequestTag(request.body);
        return yield* git.removeWorktree(body);
      }

      case WS_METHODS.gitCreateBranch: {
        const body = stripRequestTag(request.body);
        return yield* git.createBranch(body);
      }

      case WS_METHODS.gitCheckout: {
        const body = stripRequestTag(request.body);
        return yield* Effect.scoped(git.checkoutBranch(body));
      }

      case WS_METHODS.gitInit: {
        const body = stripRequestTag(request.body);
        return yield* git.initRepo(body);
      }

      case WS_METHODS.gitHandoffThread: {
        const body = stripRequestTag(request.body);
        return yield* gitManager.handoffThread(body);
      }

      case WS_METHODS.terminalOpen: {
        const body = stripRequestTag(request.body);
        terminalTitleTracker.reset(body.threadId, body.terminalId ?? DEFAULT_TERMINAL_ID);
        return yield* terminalManager.open(body);
      }

      case WS_METHODS.terminalWrite: {
        const body = stripRequestTag(request.body);
        yield* terminalManager.write(body);
        yield* maybeAutoRenameTerminalThread({
          threadId: body.threadId,
          terminalId: body.terminalId ?? DEFAULT_TERMINAL_ID,
          data: body.data,
        }).pipe(Effect.catch(() => Effect.void));
        return;
      }

      case WS_METHODS.terminalResize: {
        const body = stripRequestTag(request.body);
        return yield* terminalManager.resize(body);
      }

      case WS_METHODS.terminalClear: {
        const body = stripRequestTag(request.body);
        return yield* terminalManager.clear(body);
      }

      case WS_METHODS.terminalRestart: {
        const body = stripRequestTag(request.body);
        terminalTitleTracker.reset(body.threadId, body.terminalId ?? DEFAULT_TERMINAL_ID);
        return yield* terminalManager.restart(body);
      }

      case WS_METHODS.terminalClose: {
        const body = stripRequestTag(request.body);
        terminalTitleTracker.reset(body.threadId, body.terminalId ?? null);
        return yield* terminalManager.close(body);
      }

      case WS_METHODS.serverGetConfig: {
        const keybindingsConfig = yield* keybindingsManager.loadConfigState;
        const serverSettingsService = yield* ServerSettingsService;
        const currentSettings = yield* serverSettingsService.getSettings;
        return {
          cwd,
          keybindingsConfigPath,
          keybindings: keybindingsConfig.keybindings,
          issues: keybindingsConfig.issues,
          providers: providerStatuses,
          availableEditors,
          settings: currentSettings,
        };
      }

      case WS_METHODS.serverUpsertKeybinding: {
        const body = stripRequestTag(request.body);
        const keybindingsConfig = yield* keybindingsManager.upsertKeybindingRule(body);
        return { keybindings: keybindingsConfig, issues: [] };
      }

      case WS_METHODS.providerGetComposerCapabilities: {
        const body = stripRequestTag(request.body);
        return yield* providerDiscoveryService.getComposerCapabilities(body);
      }

      case WS_METHODS.providerListCommands: {
        const body = stripRequestTag(request.body);
        return yield* providerDiscoveryService.listCommands(body);
      }

      case WS_METHODS.providerListSkills: {
        const body = stripRequestTag(request.body);
        return yield* providerDiscoveryService.listSkills(body);
      }

      case WS_METHODS.providerListPlugins: {
        const body = stripRequestTag(request.body);
        return yield* providerDiscoveryService.listPlugins(body);
      }

      case WS_METHODS.providerReadPlugin: {
        const body = stripRequestTag(request.body);
        return yield* providerDiscoveryService.readPlugin(body);
      }

      case WS_METHODS.providerListModels: {
        const body = stripRequestTag(request.body);
        return yield* providerDiscoveryService.listModels(body);
      }

      case WS_METHODS.projectsReadFile: {
        const body = stripRequestTag(request.body);
        const target = yield* resolveWorkspaceWritePath({
          workspaceRoot: body.cwd,
          relativePath: body.relativePath,
          path,
        });
        const content = yield* fileSystem.readFileString(target.absolutePath);
        return { content };
      }

      case WS_METHODS.serverRefreshProviders: {
        const refreshedStatuses = yield* providerHealth.getStatuses;
        return refreshedStatuses;
      }

      case WS_METHODS.serverGetSettings: {
        const svc = yield* ServerSettingsService;
        return yield* svc.getSettings;
      }

      case WS_METHODS.serverUpdateSettings: {
        const body = stripRequestTag(request.body);
        const svc = yield* ServerSettingsService;
        return yield* svc.updateSettings(body.patch);
      }

      case WS_METHODS.browserOpenSession: {
        const body = stripRequestTag(request.body);
        const browserAutomation = yield* BrowserAutomation;
        return yield* browserAutomation.openSession(body);
      }

      case WS_METHODS.browserAct: {
        const body = stripRequestTag(request.body);
        const browserAutomation = yield* BrowserAutomation;
        return yield* browserAutomation.act(body);
      }

      case WS_METHODS.browserCloseSession: {
        const body = stripRequestTag(request.body);
        const browserAutomation = yield* BrowserAutomation;
        return yield* browserAutomation.closeSession(body);
      }

      case WS_METHODS.orchestratorComplete: {
        // Orchestrator completion: Delegate to the provider adapter for text generation.
        // This is used by OrchestratorPanel to generate plans, instructions, etc.
        const body = stripRequestTag(request.body);
        return yield* handleOrchestratorComplete(body);
      }

      case WS_METHODS.orchestratorCreateRun: {
        const body = stripRequestTag(request.body);
        const orchestratorRuntime = yield* OrchestratorRuntimeService;
        return yield* orchestratorRuntime.createRun({
          userRequest: body.userRequest,
          goals: [...body.goals],
          ...(body.constraints ? { constraints: [...body.constraints] } : {}),
          spawnBudget: body.spawnBudget,
          projectId: body.projectId,
        });
      }

      case WS_METHODS.orchestratorCancelRun: {
        const body = stripRequestTag(request.body);
        const orchestratorRuntime = yield* OrchestratorRuntimeService;
        yield* orchestratorRuntime.cancelRun(OrchestratorRunId.makeUnsafe(body.runId), body.reason);
        return { ok: true };
      }

      case WS_METHODS.orchestratorGetRun: {
        const body = stripRequestTag(request.body);
        const orchestratorRuntime = yield* OrchestratorRuntimeService;
        return yield* orchestratorRuntime.getRun(OrchestratorRunId.makeUnsafe(body.runId));
      }

      case WS_METHODS.orchestratorGetActiveRuns: {
        const orchestratorRuntime = yield* OrchestratorRuntimeService;
        return yield* orchestratorRuntime.getActiveRuns();
      }

      case WS_METHODS.orchestratorGetTaskTree: {
        const body = stripRequestTag(request.body);
        const orchestratorRuntime = yield* OrchestratorRuntimeService;
        return yield* orchestratorRuntime.getTaskTree(OrchestratorRunId.makeUnsafe(body.runId));
      }

      case WS_METHODS.orchestratorGetWorkers: {
        const body = stripRequestTag(request.body);
        const orchestratorRuntime = yield* OrchestratorRuntimeService;
        return yield* orchestratorRuntime.getWorkers(OrchestratorRunId.makeUnsafe(body.runId));
      }

      case WS_METHODS.orchestratorGetEvidence: {
        const body = stripRequestTag(request.body);
        const orchestratorRuntime = yield* OrchestratorRuntimeService;
        return yield* orchestratorRuntime.getEvidence(OrchestratorTaskId.makeUnsafe(body.taskId));
      }

      case WS_METHODS.orchestratorGetDecisions: {
        const body = stripRequestTag(request.body);
        const orchestrationEngine = yield* OrchestrationEngineService;
        const allEvents = yield* Stream.runCollect(orchestrationEngine.readEvents(0));
        return Array.from(allEvents)
          .filter(
            (e): e is Extract<typeof e, { type: "orchestrator.decision.recorded" }> =>
              e.type === "orchestrator.decision.recorded",
          )
          .filter(
            (e) =>
              e.payload.runId === body.runId &&
              (body.taskId ? e.payload.taskId === body.taskId : true),
          )
          .map((e) => ({
            decisionId: e.payload.decisionId,
            runId: e.payload.runId,
            taskId: e.payload.taskId,
            type: e.payload.decisionType,
            reason: e.payload.reason,
            inputs: e.payload.inputs,
            createdAt: e.occurredAt,
          }));
      }

      case WS_METHODS.orchestratorGetRunEvents: {
        const body = stripRequestTag(request.body);
        const orchestrationEngine = yield* OrchestrationEngineService;
        const allEvents = yield* Stream.runCollect(orchestrationEngine.readEvents(0));
        return Array.from(allEvents).filter((e) => e.aggregateId === body.runId);
      }

      case WS_METHODS.providerGetStatuses: {
        const providerHealth = yield* ProviderHealth;
        return yield* providerHealth.getStatuses;
      }

      default: {
        const _exhaustiveCheck: never = request.body;
        return yield* new RouteRequestError({
          message: `Unknown method: ${String(_exhaustiveCheck)}`,
        });
      }
    }
  });

  const handleMessage = Effect.fnUntraced(function* (ws: WebSocket, raw: unknown) {
    const sendWsResponse = (response: WsResponseMessage) =>
      encodeWsResponse(response).pipe(
        Effect.tap((encodedResponse) => Effect.sync(() => ws.send(encodedResponse))),
        Effect.asVoid,
      );

    const messageText = websocketRawToString(raw);
    if (messageText === null) {
      return yield* sendWsResponse({
        id: "unknown",
        error: { message: "Invalid request format: Failed to read message" },
      });
    }

    const request = decodeWebSocketRequest(messageText);
    if (Result.isFailure(request)) {
      return yield* sendWsResponse({
        id: "unknown",
        error: { message: `Invalid request format: ${formatSchemaError(request.failure)}` },
      });
    }

    const result = yield* Effect.exit(routeRequest(ws, request.success));
    if (Exit.isFailure(result)) {
      return yield* sendWsResponse({
        id: request.success.id,
        error: { message: Cause.pretty(result.cause) },
      });
    }

    return yield* sendWsResponse({
      id: request.success.id,
      result: result.value,
    });
  });

  httpServer.on("upgrade", (request, socket, head) => {
    socket.on("error", () => {}); // Prevent unhandled `EPIPE`/`ECONNRESET` from crashing the process if the client disconnects mid-handshake

    if (authToken) {
      let providedToken: string | null = null;
      try {
        const url = new URL(request.url ?? "/", `http://localhost:${port}`);
        providedToken = url.searchParams.get("token");
      } catch {
        rejectUpgrade(socket, 400, "Invalid WebSocket URL");
        return;
      }

      if (providedToken !== authToken) {
        rejectUpgrade(socket, 401, "Unauthorized WebSocket connection");
        return;
      }
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws) => {
    const segments = cwd.split(/[/\\]/).filter(Boolean);
    const projectName = segments[segments.length - 1] ?? "project";

    const welcomeData = {
      cwd,
      projectName,
      ...(welcomeBootstrapProjectId ? { bootstrapProjectId: welcomeBootstrapProjectId } : {}),
      ...(welcomeBootstrapThreadId ? { bootstrapThreadId: welcomeBootstrapThreadId } : {}),
    };
    // Send welcome before adding to broadcast set so publishAll calls
    // cannot reach this client before the welcome arrives.
    void runPromise(
      readiness.awaitServerReady.pipe(
        Effect.flatMap(() => pushBus.publishClient(ws, WS_CHANNELS.serverWelcome, welcomeData)),
        Effect.flatMap((delivered) =>
          delivered ? Ref.update(clients, (clients) => clients.add(ws)) : Effect.void,
        ),
      ),
    );

    ws.on("message", (raw) => {
      void runPromise(handleMessage(ws, raw).pipe(Effect.ignoreCause({ log: true })));
    });

    ws.on("close", () => {
      void runPromise(
        Ref.update(clients, (clients) => {
          clients.delete(ws);
          return clients;
        }),
      );
    });

    ws.on("error", () => {
      void runPromise(
        Ref.update(clients, (clients) => {
          clients.delete(ws);
          return clients;
        }),
      );
    });
  });

  return httpServer;
});

export const ServerLive = Layer.succeed(Server, {
  start: createServer(),
  stopSignal: Effect.never,
} satisfies ServerShape);
