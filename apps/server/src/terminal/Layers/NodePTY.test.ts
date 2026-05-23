import { Cause, FileSystem, Path, Effect } from "effect";
import { assert, it } from "@effect/vitest";

import { ensureNodePtySpawnHelperExecutable, makeNodePtyAdapter } from "./NodePTY";
import * as NodeServices from "@effect/platform-node/NodeServices";

it.layer(NodeServices.layer)("ensureNodePtySpawnHelperExecutable", (it) => {
  it.effect("adds executable bits when helper exists but is not executable", () =>
    Effect.gen(function* () {
      if (process.platform === "win32") return;

      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const dir = yield* fs.makeTempDirectoryScoped({ prefix: "pty-helper-test-" });
      const helperPath = path.join(dir, "spawn-helper");
      yield* fs.writeFileString(helperPath, "#!/bin/sh\nexit 0\n");
      yield* fs.chmod(helperPath, 0o644);

      yield* ensureNodePtySpawnHelperExecutable(helperPath);

      const mode = (yield* fs.stat(helperPath)).mode & 0o777;
      assert.equal(mode & 0o111, 0o111);
    }),
  );

  it.effect("keeps executable helper as executable", () =>
    Effect.gen(function* () {
      if (process.platform === "win32") return;

      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const dir = yield* fs.makeTempDirectoryScoped({ prefix: "pty-helper-test-" });
      const helperPath = path.join(dir, "spawn-helper");
      yield* fs.writeFileString(helperPath, "#!/bin/sh\nexit 0\n");
      yield* fs.chmod(helperPath, 0o755);

      yield* ensureNodePtySpawnHelperExecutable(helperPath);

      const mode = (yield* fs.stat(helperPath)).mode & 0o777;
      assert.equal(mode & 0o111, 0o111);
    }),
  );

  // ORC-255: when node-pty cannot load (missing prebuilt + no
  // toolchain), the layer must NOT take down server boot. Instead it
  // resolves to a stub PtyAdapter whose spawn fails with a structured
  // PtySpawnError carrying platform-install hints, so callers see a
  // useful message rather than a Layer.die that kills the process.
  it.effect("makeNodePtyAdapter falls back to failing-spawn when the loader rejects", () =>
    Effect.gen(function* () {
      const adapter = yield* makeNodePtyAdapter(() =>
        Promise.reject(new Error("simulated module load failure")),
      );

      const exit = yield* Effect.exit(
        adapter.spawn({
          shell: "/bin/sh",
          cwd: "/",
          cols: 80,
          rows: 24,
          env: {},
        }),
      );

      assert.equal(exit._tag, "Failure");
      if (exit._tag === "Failure") {
        // Cause.pretty renders human-readable text including the
        // Error subclass's `message` (which Schema.TaggedErrorClass
        // pins to Error.prototype.message). The hint text must
        // appear there for an operator to triage from logs.
        const pretty = Cause.pretty(exit.cause);
        assert.match(pretty, /PtySpawnError/);
        assert.match(pretty, /node-pty/);
        assert.match(pretty, /prebuilt|toolchain|install/i);
      }
    }),
  );
});
