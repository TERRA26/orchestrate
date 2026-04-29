import {
  type BrowserCloseSessionInput,
  type BrowserActInput,
  type BrowserAnnotationResolveTargetAtPointInput,
  type BrowserInspectSessionInput,
  type BrowserObserveSessionInput,
  type BrowserOpenSessionInput,
  type BrowserResolveTargetSessionInput,
  type WsPush,
  type WsPushChannel,
  type WsPushMessage,
  WebSocketResponse,
  type WsResponse as WsResponseMessage,
  WsResponse as WsResponseSchema,
  WS_CHANNELS,
  WS_METHODS,
} from "@orchestrate/contracts";
import { decodeUnknownJsonResult, formatSchemaError } from "@orchestrate/shared/schemaJson";
import { Result, Schema } from "effect";

type PushListener<C extends WsPushChannel> = (message: WsPushMessage<C>) => void;

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout> | null;
}

interface SubscribeOptions {
  readonly replayLatest?: boolean;
}

interface RequestOptions {
  readonly timeoutMs?: number | null;
}

type TransportState = "connecting" | "open" | "reconnecting" | "closed" | "disposed";

const REQUEST_TIMEOUT_MS = 60_000;
const RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000];
const decodeWsResponse = decodeUnknownJsonResult(WsResponseSchema);
const isWebSocketResponseEnvelope = Schema.is(WebSocketResponse);

const isWsPushMessage = (value: WsResponseMessage): value is WsPush =>
  "type" in value && value.type === "push";

interface WsRequestEnvelope {
  id: string;
  body: {
    _tag: string;
    [key: string]: unknown;
  };
}

function asError(value: unknown, fallback: string): Error {
  if (value instanceof Error) {
    return value;
  }
  return new Error(fallback);
}

export class WsTransport {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly listeners = new Map<string, Set<(message: WsPush) => void>>();
  private readonly latestPushByChannel = new Map<string, WsPush>();
  private readonly outboundQueue: string[] = [];
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private state: TransportState = "connecting";
  private readonly stateListeners = new Set<(state: TransportState) => void>();
  private readonly url: string;

  private setState(next: TransportState): void {
    if (this.state === next) return;
    this.state = next;
    for (const listener of this.stateListeners) {
      try {
        listener(next);
      } catch {
        // Swallow listener errors so a bad subscriber can't break others.
      }
    }
  }

  subscribeToState(listener: (state: TransportState) => void): () => void {
    this.stateListeners.add(listener);
    // Fire immediately so callers get the current state.
    try {
      listener(this.state);
    } catch {}
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  getQueuedRequestCount(): number {
    return this.outboundQueue.length + this.pending.size;
  }

  constructor(url?: string) {
    const bridgeUrl = window.desktopBridge?.getWsUrl();
    const envUrl = import.meta.env.VITE_WS_URL as string | undefined;
    this.url =
      url ??
      (bridgeUrl && bridgeUrl.length > 0
        ? bridgeUrl
        : envUrl && envUrl.length > 0
          ? envUrl
          : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:${window.location.port}`);
    this.connect();
  }

  async request<T = unknown>(
    method: string,
    params?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    if (typeof method !== "string" || method.length === 0) {
      throw new Error("Request method is required");
    }

    const id = String(this.nextId++);
    const body = params != null ? { ...params, _tag: method } : { _tag: method };
    const message: WsRequestEnvelope = { id, body };
    const encoded = JSON.stringify(message);

    return new Promise<T>((resolve, reject) => {
      const timeoutMs = options?.timeoutMs === undefined ? REQUEST_TIMEOUT_MS : options.timeoutMs;
      const timeout =
        timeoutMs === null
          ? null
          : setTimeout(() => {
              this.pending.delete(id);
              reject(new Error(`Request timed out: ${method}`));
            }, timeoutMs);

      this.pending.set(id, {
        resolve: resolve as (result: unknown) => void,
        reject,
        timeout,
      });

      this.send(encoded);
    });
  }

  subscribe<C extends WsPushChannel>(
    channel: C,
    listener: PushListener<C>,
    options?: SubscribeOptions,
  ): () => void {
    let channelListeners = this.listeners.get(channel);
    if (!channelListeners) {
      channelListeners = new Set<(message: WsPush) => void>();
      this.listeners.set(channel, channelListeners);
    }

    const wrappedListener = (message: WsPush) => {
      listener(message as WsPushMessage<C>);
    };
    channelListeners.add(wrappedListener);

    if (options?.replayLatest) {
      const latest = this.latestPushByChannel.get(channel);
      if (latest) {
        wrappedListener(latest);
      }
    }

    return () => {
      channelListeners?.delete(wrappedListener);
      if (channelListeners?.size === 0) {
        this.listeners.delete(channel);
      }
    };
  }

  getLatestPush<C extends WsPushChannel>(channel: C): WsPushMessage<C> | null {
    const latest = this.latestPushByChannel.get(channel);
    return latest ? (latest as WsPushMessage<C>) : null;
  }

  getState(): TransportState {
    return this.state;
  }

  dispose() {
    this.disposed = true;
    this.setState("disposed");
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    for (const pending of this.pending.values()) {
      if (pending.timeout !== null) {
        clearTimeout(pending.timeout);
      }
      pending.reject(new Error("Transport disposed"));
    }
    this.pending.clear();
    this.outboundQueue.length = 0;
    this.ws?.close();
    this.ws = null;
  }

  private connect() {
    if (this.disposed) {
      return;
    }

    this.setState(this.reconnectAttempt > 0 ? "reconnecting" : "connecting");
    const ws = new WebSocket(this.url);

    ws.addEventListener("open", () => {
      this.ws = ws;
      this.setState("open");
      this.reconnectAttempt = 0;
      this.flushQueue();
    });

    ws.addEventListener("message", (event) => {
      this.handleMessage(event.data);
    });

    ws.addEventListener("close", () => {
      // Ignore close events from stale WebSocket instances (previous connections
      // that closed after a new one was established). This prevents the
      // "closing and reopening connections too eagerly" bug from upstream.
      if (this.ws !== ws) {
        return;
      }

      this.ws = null;
      this.outboundQueue.length = 0;

      // Reject in-flight requests — they were sent on the now-closed connection
      // and won't receive responses.
      for (const [id, pending] of this.pending.entries()) {
        if (pending.timeout !== null) {
          clearTimeout(pending.timeout);
        }
        this.pending.delete(id);
        pending.reject(new Error("WebSocket connection closed."));
      }

      if (this.disposed) {
        this.setState("disposed");
        return;
      }

      this.setState("closed");
      this.scheduleReconnect();
    });

    ws.addEventListener("error", (event) => {
      // Log WebSocket errors for debugging (close event will follow)
      console.warn("WebSocket connection error", { type: event.type, url: this.url });
    });
  }

  private handleMessage(raw: unknown) {
    const result = decodeWsResponse(raw);
    if (Result.isFailure(result)) {
      console.warn("Dropped inbound WebSocket envelope", formatSchemaError(result.failure));
      return;
    }

    const message = result.success;
    if (isWsPushMessage(message)) {
      this.latestPushByChannel.set(message.channel, message);
      if (message.channel === WS_CHANNELS.desktopBrowserBridgeRequest) {
        void this.handleDesktopBrowserBridgeRequest(message.data);
      }
      const channelListeners = this.listeners.get(message.channel);
      if (channelListeners) {
        for (const listener of channelListeners) {
          try {
            listener(message);
          } catch {
            // Swallow listener errors
          }
        }
      }
      return;
    }

    if (!isWebSocketResponseEnvelope(message)) {
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    if (pending.timeout !== null) {
      clearTimeout(pending.timeout);
    }
    this.pending.delete(message.id);

    if (message.error) {
      pending.reject(new Error(message.error.message));
      return;
    }

    pending.resolve(message.result);
  }

  private send(encodedMessage: string) {
    if (this.disposed) {
      return;
    }

    this.outboundQueue.push(encodedMessage);
    try {
      this.flushQueue();
    } catch {
      // Swallow: flushQueue has queued the message for retry on reconnect
    }
  }

  private async handleDesktopBrowserBridgeRequest(
    request: WsPushMessage<typeof WS_CHANNELS.desktopBrowserBridgeRequest>["data"],
  ) {
    const bridge = window.desktopBridge?.browser;
    if (!bridge) {
      await this.request(WS_METHODS.desktopBrowserBridgeResponse, {
        requestId: request.requestId,
        status: "error",
        error: {
          code: "desktop-bridge-unavailable",
          message: "Desktop browser bridge is unavailable in this client.",
        },
      });
      return;
    }

    try {
      const result =
        request.kind === "openSession"
          ? await bridge.openSession(request.input as BrowserOpenSessionInput)
          : request.kind === "observeSession"
            ? await bridge.observeSession(request.input as BrowserObserveSessionInput)
            : request.kind === "inspectSession"
              ? await bridge.inspectSession(request.input as BrowserInspectSessionInput)
              : request.kind === "resolveTargetSession"
                ? await bridge.resolveTargetSession(
                    request.input as BrowserResolveTargetSessionInput,
                  )
                : request.kind === "resolveAnnotationTargetAtPoint"
                  ? await bridge.resolveAnnotationTargetAtPoint(
                      request.input as BrowserAnnotationResolveTargetAtPointInput,
                    )
                  : request.kind === "actSession"
                    ? await bridge.actSession(request.input as BrowserActInput)
                    : await bridge.closeSession(request.input as BrowserCloseSessionInput);
      await this.request(WS_METHODS.desktopBrowserBridgeResponse, {
        requestId: request.requestId,
        status: "ok",
        ...(result === undefined ? {} : { result }),
      });
    } catch (error) {
      await this.request(WS_METHODS.desktopBrowserBridgeResponse, {
        requestId: request.requestId,
        status: "error",
        error: {
          code:
            typeof (error as { code?: unknown }).code === "string"
              ? (error as { code: string }).code
              : "desktop-bridge-error",
          message: error instanceof Error ? error.message : String(error),
          ...((error as { details?: unknown }).details !== undefined
            ? { details: (error as { details?: unknown }).details }
            : {}),
        },
      });
    }
  }

  private flushQueue() {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return;
    }

    while (this.outboundQueue.length > 0) {
      const message = this.outboundQueue.shift();
      if (!message) {
        continue;
      }
      try {
        this.ws.send(message);
      } catch (error) {
        this.outboundQueue.unshift(message);
        throw asError(error, "Failed to send WebSocket request.");
      }
    }
  }

  private scheduleReconnect() {
    if (this.disposed || this.reconnectTimer !== null) {
      return;
    }

    const delay =
      RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)] ??
      RECONNECT_DELAYS_MS[0]!;

    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
