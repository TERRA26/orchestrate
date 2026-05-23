import path from "node:path";

import { Effect, FileSystem } from "effect";

export const CRYPTO_MICROSITE_ROUTE = "/microsites/crypto";

const CRYPTO_MICROSITE_DIR = path.resolve(import.meta.dirname, "../crypto-microsite");

const isWithinRoot = (root: string, candidate: string): boolean =>
  candidate === root || candidate.startsWith(root.endsWith(path.sep) ? root : `${root}${path.sep}`);

export const resolveCryptoMicrositeFile = Effect.fn(function* (requestPathname: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const routePrefix =
    requestPathname === CRYPTO_MICROSITE_ROUTE ||
    requestPathname.startsWith(`${CRYPTO_MICROSITE_ROUTE}/`);
  if (!routePrefix) {
    return null;
  }

  const relativeRequestPath =
    requestPathname === CRYPTO_MICROSITE_ROUTE
      ? ""
      : requestPathname.slice(`${CRYPTO_MICROSITE_ROUTE}/`.length);
  const decodedPath = yield* Effect.try({
    try: () => decodeURIComponent(relativeRequestPath),
    catch: () => null,
  });
  if (decodedPath === null) {
    return {
      status: 400 as const,
      body: "Invalid microsite file path",
    };
  }

  const resolvedRelativePath =
    decodedPath.length === 0 || decodedPath.endsWith("/")
      ? `${decodedPath}index.html`
      : decodedPath;
  const normalizedPath = path.normalize(resolvedRelativePath).replace(/^[/\\]+/, "");
  if (
    normalizedPath.length === 0 ||
    decodedPath.startsWith("..") ||
    normalizedPath.startsWith("..") ||
    normalizedPath.includes("\0")
  ) {
    return {
      status: 400 as const,
      body: "Invalid microsite file path",
    };
  }

  let filePath = path.resolve(CRYPTO_MICROSITE_DIR, normalizedPath);
  if (!isWithinRoot(CRYPTO_MICROSITE_DIR, filePath)) {
    return {
      status: 400 as const,
      body: "Invalid microsite file path",
    };
  }

  const fileInfo = yield* fileSystem.stat(filePath).pipe(Effect.catch(() => Effect.succeed(null)));
  if (fileInfo?.type === "Directory") {
    filePath = path.resolve(filePath, "index.html");
    if (!isWithinRoot(CRYPTO_MICROSITE_DIR, filePath)) {
      return {
        status: 400 as const,
        body: "Invalid microsite file path",
      };
    }
  }

  const finalInfo = yield* fileSystem.stat(filePath).pipe(Effect.catch(() => Effect.succeed(null)));
  if (!finalInfo || finalInfo.type !== "File") {
    return {
      status: 404 as const,
      body: "Not Found",
    };
  }

  return {
    status: 200 as const,
    filePath,
  };
});
