import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface Gate {
  name: string;
  command: string;
  blocking: boolean;
}

interface GateResult {
  gate: Gate;
  passed: boolean;
  durationMs: number;
  output: string;
}

const gates: Gate[] = [
  // Blocking gates
  {
    name: "Contracts typecheck",
    command: "cd packages/contracts && bun run typecheck",
    blocking: true,
  },
  { name: "Server typecheck", command: "cd apps/server && bun run typecheck", blocking: true },
  { name: "Web typecheck", command: "cd apps/web && bun run typecheck", blocking: true },
  { name: "Lint", command: "bun lint", blocking: true },
  {
    name: "Contract schema tests",
    command: "cd packages/contracts && bun run test",
    blocking: true,
  },
  {
    name: "Decider tests",
    command: "cd apps/server && vitest run src/orchestration/decider.orchestrator.test.ts",
    blocking: true,
  },
  {
    name: "Projector tests",
    command: "cd apps/server && vitest run src/orchestration/projector.orchestrator.test.ts",
    blocking: true,
  },
  { name: "Full unit/integration suites", command: "turbo run test", blocking: true },
  {
    name: "Server orchestrator smoke",
    command:
      'cd apps/server && vitest run src/wsServer.test.ts -t "supports a server-driven orchestrator smoke flow with explicit provider override"',
    blocking: true,
  },
  // Advisory gates
  { name: "UI browser e2e", command: "cd apps/web && bun run test:browser", blocking: false },
];

async function runGate(gate: Gate): Promise<GateResult> {
  const tag = gate.blocking ? "[BLOCKING]" : "[ADVISORY]";
  process.stdout.write(`${tag} ${gate.name} ... `);

  const start = performance.now();
  const proc = Bun.spawn(["bash", "-c", gate.command], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  const durationMs = performance.now() - start;
  const passed = exitCode === 0;

  const durationStr = formatDuration(durationMs);
  if (passed) {
    console.log(`PASS (${durationStr})`);
  } else {
    console.log(`FAIL (${durationStr})`);
    console.log("--- stdout ---");
    console.log(stdout);
    console.log("--- stderr ---");
    console.log(stderr);
    console.log("--------------");
  }

  return { gate, passed, durationMs, output: stdout + stderr };
}

function formatDuration(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = ((ms % 60_000) / 1_000).toFixed(0);
  return `${minutes}m${seconds}s`;
}

async function main(): Promise<void> {
  console.log("=== Release Gate ===\n");

  const results: GateResult[] = [];
  for (const gate of gates) {
    results.push(await runGate(gate));
  }

  // Summary matrix
  const nameWidth = Math.max(...results.map((r) => r.gate.name.length));
  console.log("\n=== Summary ===\n");
  for (const r of results) {
    const status = r.passed ? "PASS" : "FAIL";
    const tag = r.gate.blocking ? "BLOCKING" : "ADVISORY";
    const name = r.gate.name.padEnd(nameWidth);
    const duration = formatDuration(r.durationMs).padStart(8);
    console.log(
      `  ${status === "PASS" ? "\u2705" : "\u274C"} ${name}  ${status}  ${duration}  (${tag})`,
    );
  }

  const blockingFailures = results.filter((r) => r.gate.blocking && !r.passed);
  const advisoryFailures = results.filter((r) => !r.gate.blocking && !r.passed);
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);

  console.log(`\nTotal time: ${formatDuration(totalDuration)}`);

  if (blockingFailures.length > 0) {
    console.log(`\n${blockingFailures.length} blocking gate(s) failed. Cannot ship.`);
    process.exit(1);
  }

  if (advisoryFailures.length > 0) {
    console.log(`\n${advisoryFailures.length} advisory gate(s) failed (non-blocking).`);
  }

  console.log("\nAll blocking gates passed. Ship it!");
}

main();
