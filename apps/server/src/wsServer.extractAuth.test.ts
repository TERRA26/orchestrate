import { describe, expect, it } from "vitest";

import { extractWsAuthTokenFromUpgrade } from "./wsServer";

const BASE = "http://localhost:5555";

describe("extractWsAuthTokenFromUpgrade (ORC-042)", () => {
  it("reads token from Authorization: Bearer header (preferred)", () => {
    const token = extractWsAuthTokenFromUpgrade(
      {
        url: "/",
        headers: { authorization: "Bearer secret-from-header" },
      },
      BASE,
    );
    expect(token).toBe("secret-from-header");
  });

  it("trims whitespace from the bearer token", () => {
    const token = extractWsAuthTokenFromUpgrade(
      {
        url: "/",
        headers: { authorization: "Bearer    spaced-token   " },
      },
      BASE,
    );
    expect(token).toBe("spaced-token");
  });

  it("is case-insensitive on the Bearer scheme", () => {
    expect(
      extractWsAuthTokenFromUpgrade(
        { url: "/", headers: { authorization: "bearer lowercase-scheme-token" } },
        BASE,
      ),
    ).toBe("lowercase-scheme-token");
    expect(
      extractWsAuthTokenFromUpgrade(
        { url: "/", headers: { authorization: "BEARER UPPER-token" } },
        BASE,
      ),
    ).toBe("UPPER-token");
  });

  it("reads from Sec-WebSocket-Protocol when Authorization is missing", () => {
    const token = extractWsAuthTokenFromUpgrade(
      {
        url: "/",
        headers: {
          "sec-websocket-protocol": "orchestrate-auth.subproto-token",
        },
      },
      BASE,
    );
    expect(token).toBe("subproto-token");
  });

  it("handles a Sec-WebSocket-Protocol with multiple subprotocols", () => {
    const token = extractWsAuthTokenFromUpgrade(
      {
        url: "/",
        headers: {
          "sec-websocket-protocol": "v1, orchestrate-auth.multi-token, x-other",
        },
      },
      BASE,
    );
    expect(token).toBe("multi-token");
  });

  it("falls back to query string ?token= when no headers (backward compat)", () => {
    const token = extractWsAuthTokenFromUpgrade(
      { url: "/?token=legacy-query-token", headers: {} },
      BASE,
    );
    expect(token).toBe("legacy-query-token");
  });

  it("Authorization header wins over Sec-WebSocket-Protocol and query", () => {
    const token = extractWsAuthTokenFromUpgrade(
      {
        url: "/?token=loser-query",
        headers: {
          authorization: "Bearer winner-header",
          "sec-websocket-protocol": "orchestrate-auth.loser-subproto",
        },
      },
      BASE,
    );
    expect(token).toBe("winner-header");
  });

  it("Sec-WebSocket-Protocol wins over query when no Authorization", () => {
    const token = extractWsAuthTokenFromUpgrade(
      {
        url: "/?token=loser-query",
        headers: {
          "sec-websocket-protocol": "orchestrate-auth.winner-subproto",
        },
      },
      BASE,
    );
    expect(token).toBe("winner-subproto");
  });

  it("returns null when no source provides a token", () => {
    expect(extractWsAuthTokenFromUpgrade({ url: "/", headers: {} }, BASE)).toBeNull();
    expect(
      extractWsAuthTokenFromUpgrade({ url: "/anything?other=foo", headers: {} }, BASE),
    ).toBeNull();
  });

  it("returns null on malformed URL with no header fallback", () => {
    expect(
      extractWsAuthTokenFromUpgrade({ url: "://malformed", headers: {} }, BASE),
    ).toBeNull();
  });

  it("ignores Authorization without a Bearer prefix", () => {
    expect(
      extractWsAuthTokenFromUpgrade(
        { url: "/", headers: { authorization: "Basic dXNlcjpwYXNz" } },
        BASE,
      ),
    ).toBeNull();
    expect(
      extractWsAuthTokenFromUpgrade(
        { url: "/", headers: { authorization: "just-a-bare-token" } },
        BASE,
      ),
    ).toBeNull();
  });

  it("ignores Sec-WebSocket-Protocol entries that do not match the orchestrate-auth prefix", () => {
    expect(
      extractWsAuthTokenFromUpgrade(
        { url: "/", headers: { "sec-websocket-protocol": "v1, x-custom" } },
        BASE,
      ),
    ).toBeNull();
  });
});
