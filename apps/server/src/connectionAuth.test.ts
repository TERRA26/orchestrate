import { describe, expect, it } from "vitest";
import type WebSocket from "ws";

import {
  clearConnectionAuthentication,
  isConnectionAuthenticated,
  isMessageAllowed,
  markConnectionAuthenticated,
} from "./connectionAuth.ts";

function makeFakeWs(): WebSocket {
  return {} as WebSocket;
}

describe("connectionAuth", () => {
  it("isConnectionAuthenticated returns false for an unmarked connection", () => {
    const ws = makeFakeWs();
    expect(isConnectionAuthenticated(ws)).toBe(false);
  });

  it("markConnectionAuthenticated flips the flag and clearConnectionAuthentication unsets it", () => {
    const ws = makeFakeWs();
    markConnectionAuthenticated(ws);
    expect(isConnectionAuthenticated(ws)).toBe(true);
    clearConnectionAuthentication(ws);
    expect(isConnectionAuthenticated(ws)).toBe(false);
  });

  it("registry isolates connections (marking one does not affect another)", () => {
    const a = makeFakeWs();
    const b = makeFakeWs();
    markConnectionAuthenticated(a);
    expect(isConnectionAuthenticated(a)).toBe(true);
    expect(isConnectionAuthenticated(b)).toBe(false);
  });

  it("isMessageAllowed: when authRequired is false, all messages pass regardless of connection state", () => {
    expect(isMessageAllowed({ authRequired: false, connectionAuthenticated: false })).toBe(true);
    expect(isMessageAllowed({ authRequired: false, connectionAuthenticated: true })).toBe(true);
  });

  it("isMessageAllowed: when authRequired is true, only authenticated connections pass (ORC-040)", () => {
    expect(isMessageAllowed({ authRequired: true, connectionAuthenticated: false })).toBe(false);
    expect(isMessageAllowed({ authRequired: true, connectionAuthenticated: true })).toBe(true);
  });
});
