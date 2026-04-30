import * as Net from "node:net";

interface NetServer {
  address: () => Net.AddressInfo | string | null;
  close: (callback?: (error?: Error) => void) => unknown;
  listen: (port: number, host: string) => unknown;
  once(event: "error", listener: (error: Error) => void): unknown;
  once(event: "listening", listener: () => void): unknown;
}

export interface ReserveElectronCdpPortInput {
  readonly envPort?: string | undefined;
  readonly createServer?: () => NetServer;
}

function parsePortOverride(value: string | undefined): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const port = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535 || String(port) !== trimmed) {
    throw new Error(
      `Invalid ORCHESTRATE_ELECTRON_CDP_PORT value "${trimmed}". Expected an integer from 1 to 65535.`,
    );
  }
  return port;
}

function closeServer(server: NetServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export async function reserveElectronCdpPort({
  envPort,
  createServer = () => Net.createServer(),
}: ReserveElectronCdpPortInput = {}): Promise<number> {
  const requestedPort = parsePortOverride(envPort);
  const server = createServer();
  const host = "127.0.0.1";

  await new Promise<void>((resolve, reject) => {
    server.once("error", (error) => {
      const target = requestedPort ? `${host}:${requestedPort}` : `${host}:0`;
      reject(
        new Error(
          `Unable to reserve Electron CDP debug port ${target}: ${error.message}. Set ORCHESTRATE_ELECTRON_CDP_PORT to a different port or unset it for dynamic allocation.`,
          { cause: error },
        ),
      );
    });
    server.once("listening", () => resolve());
    server.listen(requestedPort ?? 0, host);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("Unable to reserve Electron CDP debug port: listener did not report a port.");
  }

  const port = address.port;
  await closeServer(server);
  return port;
}
