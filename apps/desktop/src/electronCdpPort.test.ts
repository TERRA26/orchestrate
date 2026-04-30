import { describe, expect, it, vi } from "vitest";

import { reserveElectronCdpPort } from "./electronCdpPort";

type Listener = (...args: Array<unknown>) => void;

function makeServer({
  port,
  listenError,
}: {
  readonly port?: number;
  readonly listenError?: Error;
}) {
  const listeners = new Map<string, Listener>();
  const close = vi.fn((callback?: (error?: Error) => void) => callback?.());
  const listen = vi.fn((_port: number, _host: string) => {
    queueMicrotask(() => {
      if (listenError) {
        listeners.get("error")?.(listenError);
        return;
      }
      listeners.get("listening")?.();
    });
    return server;
  });
  const server = {
    address: vi.fn(() =>
      port === undefined ? null : { address: "127.0.0.1", family: "IPv4", port },
    ),
    close,
    listen,
    once: vi.fn((event: "error" | "listening", listener: Listener) => {
      listeners.set(event, listener);
      return server;
    }),
  };
  return server;
}

describe("reserveElectronCdpPort", () => {
  it("reserves a dynamic loopback port and closes the listener", async () => {
    const server = makeServer({ port: 51_234 });

    await expect(reserveElectronCdpPort({ createServer: () => server })).resolves.toBe(51_234);

    expect(server.listen).toHaveBeenCalledWith(0, "127.0.0.1");
    expect(server.close).toHaveBeenCalledTimes(1);
  });

  it("honors an explicit environment override", async () => {
    const server = makeServer({ port: 9_333 });

    await expect(
      reserveElectronCdpPort({ envPort: "9333", createServer: () => server }),
    ).resolves.toBe(9_333);

    expect(server.listen).toHaveBeenCalledWith(9_333, "127.0.0.1");
  });

  it("fails clearly when an explicit override cannot be reserved", async () => {
    const server = makeServer({ listenError: new Error("EADDRINUSE") });

    await expect(
      reserveElectronCdpPort({ envPort: "9333", createServer: () => server }),
    ).rejects.toThrow("Unable to reserve Electron CDP debug port 127.0.0.1:9333");
  });

  it("rejects invalid explicit overrides", async () => {
    await expect(reserveElectronCdpPort({ envPort: "9333abc" })).rejects.toThrow(
      "Invalid ORCHESTRATE_ELECTRON_CDP_PORT value",
    );
  });
});
