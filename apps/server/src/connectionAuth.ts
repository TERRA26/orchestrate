/**
 * Per-connection authentication state for the WebSocket server.
 *
 * The handshake-only auth gate at upgrade is not enough on its own. If any
 * future code path emits a "connection" event without first running the
 * upgrade auth check, the message handler must still reject the request.
 * This registry tracks which WebSocket instances passed the gate, and the
 * message handler consults it on every dispatch as defense in depth.
 *
 * The registry is a WeakSet keyed by the WS object so closed connections
 * are reclaimed by the GC without an explicit clear.
 */
import type WebSocket from "ws";

const authenticatedConnections = new WeakSet<WebSocket>();

export function markConnectionAuthenticated(ws: WebSocket): void {
  authenticatedConnections.add(ws);
}

export function isConnectionAuthenticated(ws: WebSocket): boolean {
  return authenticatedConnections.has(ws);
}

export function clearConnectionAuthentication(ws: WebSocket): void {
  authenticatedConnections.delete(ws);
}

/**
 * Policy: should a request from `ws` be allowed to proceed past the auth
 * gate? When the server has no auth token configured, all messages are
 * allowed (matches the upgrade-handler behavior). When auth IS configured,
 * the connection must have been registered via `markConnectionAuthenticated`.
 */
export function isMessageAllowed(opts: {
  readonly authRequired: boolean;
  readonly connectionAuthenticated: boolean;
}): boolean {
  if (!opts.authRequired) return true;
  return opts.connectionAuthenticated;
}
