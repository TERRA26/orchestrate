/**
 * Binding security policy: refuse to start when the server would accept
 * remote connections without an auth token.
 *
 * Node's `http.Server.listen()` defaults to the unspecified IPv6 address
 * (`::`) when host is omitted, which accepts connections on all interfaces
 * including the LAN/internet. Combined with no auth token, that turns the
 * orchestrator into an open RPC endpoint to anyone on the network.
 *
 * Loopback bindings (`127.0.0.1`, `localhost`, `::1`) are safe without an
 * auth token because only local processes can reach them.
 */
export function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  const trimmed = host.trim().toLowerCase();
  return (
    trimmed === "127.0.0.1" || trimmed === "localhost" || trimmed === "::1" || trimmed === "[::1]"
  );
}

export function isWildcardHost(host: string | undefined): boolean {
  if (!host) return true;
  const trimmed = host.trim();
  return trimmed === "0.0.0.0" || trimmed === "::" || trimmed === "[::]" || trimmed === "";
}

export type BindingSecurityResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

export function validateBindingSecurity(opts: {
  readonly host: string | undefined;
  readonly authToken: string | undefined;
}): BindingSecurityResult {
  const hasToken = typeof opts.authToken === "string" && opts.authToken.trim().length > 0;
  if (hasToken) return { ok: true };

  if (isLoopbackHost(opts.host)) return { ok: true };

  if (isWildcardHost(opts.host)) {
    return {
      ok: false,
      reason: [
        "Refusing to start: server is binding to all interfaces with no auth token.",
        `host=${opts.host ?? "(unset; Node defaults to all interfaces)"}, authToken=(unset).`,
        "Either set ORCHESTRATE_AUTH_TOKEN to a non-empty value, or pass --host 127.0.0.1",
        "to bind to loopback only.",
      ].join(" "),
    };
  }

  return { ok: true };
}
