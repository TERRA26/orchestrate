import { createHash, randomUUID } from "node:crypto";

import {
  BROWSER_ORCHESTRATION_SCHEMA_VERSION,
  type DevServerInstance,
  EvidenceArtifactId,
  type EvidenceArtifactKind,
  type LaunchConfig,
  LaunchConfigId,
  type PreviewDetectResult,
  type PreviewStartResult,
  type PreviewTarget,
  SessionEventId,
} from "@orchestrate/contracts";
import { Effect, Layer } from "effect";

import { ServerConfig } from "../../config.ts";
import { BrowserOrchestrationEvidenceRepository } from "../../persistence/Services/BrowserOrchestrationEvidence.ts";
import { DevServerSupervisor, type DevServerStopReason } from "../DevServerSupervisor.ts";
import { PreviewService, type PreviewServiceShape } from "../Services/PreviewService.ts";

function now() {
  return new Date().toISOString();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function artifactId(kind: EvidenceArtifactKind, seed: string): EvidenceArtifactId {
  return EvidenceArtifactId.makeUnsafe(`${kind}-${sha256(seed).slice(0, 24)}`);
}

function exactArtifactId(id: EvidenceArtifactId | string): EvidenceArtifactId {
  return EvidenceArtifactId.makeUnsafe(String(id));
}

function truncateLog(value: string): string {
  return value.length > 64_000 ? value.slice(-64_000) : value;
}

type RunningPreviewRecord = {
  readonly config: LaunchConfig;
  instance: DevServerInstance;
  previewTarget?: PreviewTarget;
};

export const PreviewServiceLive = Layer.effect(
  PreviewService,
  Effect.gen(function* () {
    const serverConfig = yield* ServerConfig;
    const repository = yield* BrowserOrchestrationEvidenceRepository;
    const supervisor = new DevServerSupervisor(serverConfig.cwd);
    const configsById = new Map<string, LaunchConfig>();
    const recordsByInstanceId = new Map<string, RunningPreviewRecord>();
    const targetsById = new Map<string, PreviewTarget>();

    const writeTextArtifact = (
      sessionId: string,
      kind: EvidenceArtifactKind,
      content: string,
      metadata: Record<string, unknown> = {},
      id?: EvidenceArtifactId | string,
      contentType = "text/plain",
    ) =>
      Effect.gen(function* () {
        const createdAt = now();
        const artifactRef = id
          ? exactArtifactId(id)
          : artifactId(kind, `${sessionId}:${kind}:${content}:${createdAt}`);
        yield* repository.writeEvidenceArtifact({
          artifactId: artifactRef,
          schemaVersion: BROWSER_ORCHESTRATION_SCHEMA_VERSION,
          kind,
          sha256: sha256(content),
          byteSize: Buffer.byteLength(content),
          contentType,
          storageUri: `sqlite://evidence_artifact_contents/${artifactRef}`,
          sensitivity: "workspace-internal",
          access: "safe-for-user-report",
          redactedArtifactId: null,
          supersededByArtifactId: null,
          metadataJson: JSON.stringify(metadata),
          createdAt,
        });
        yield* repository.writeEvidenceArtifactContent({
          artifactId: artifactRef,
          contentText: content,
          createdAt,
        });
        return artifactRef;
      });

    const writeJsonArtifact = (
      sessionId: string,
      kind: EvidenceArtifactKind,
      payload: unknown,
      metadata: Record<string, unknown> = {},
      id?: EvidenceArtifactId | string,
    ) =>
      Effect.gen(function* () {
        const content = stableJson(payload);
        const artifactRef = yield* writeTextArtifact(
          sessionId,
          kind,
          content,
          metadata,
          id,
          "application/json",
        );
        return artifactRef;
      });

    const appendEvent = (
      sessionId: string,
      type: string,
      artifactRefs: ReadonlyArray<EvidenceArtifactId>,
      payload: unknown,
    ) =>
      repository.appendSessionEvent({
        eventId: SessionEventId.makeUnsafe(`preview-event-${randomUUID()}`),
        sessionId,
        workflowRunId: null,
        type,
        actor: "agent",
        artifactRefsJson: JSON.stringify(artifactRefs),
        payloadJson: JSON.stringify(payload),
        occurredAt: now(),
      });

    const loadConfigs = () =>
      Effect.tryPromise({
        try: async () => {
          try {
            return await supervisor.loadLaunchConfig();
          } catch {
            try {
              return await supervisor.detectLaunchConfigs();
            } catch {
              return [];
            }
          }
        },
        catch: (cause) => cause as Error,
      }).pipe(
        Effect.tap((configs) =>
          Effect.sync(() => {
            for (const config of configs) {
              configsById.set(String(config.id), config);
            }
          }),
        ),
      );

    const resolveConfig = (launchConfigId?: LaunchConfigId) =>
      Effect.gen(function* () {
        const configs = yield* loadConfigs();
        if (launchConfigId) {
          return configs.find((config) => config.id === launchConfigId) ?? null;
        }
        return configs[0] ?? null;
      });

    const recordLogs = (
      sessionId: string,
      instanceId: string,
      logs: { readonly stdout: string; readonly stderr: string } | null,
    ) =>
      Effect.gen(function* () {
        const stdout = logs?.stdout ?? "";
        const stderr = logs?.stderr ?? "";
        const stdoutRef = yield* writeTextArtifact(
          sessionId,
          "dev-server-stdout",
          stdout,
          { instanceId, stream: "stdout" },
          `dev-server-stdout-${instanceId}`,
        );
        const stderrRef = yield* writeTextArtifact(
          sessionId,
          "dev-server-stderr",
          stderr,
          { instanceId, stream: "stderr" },
          `dev-server-stderr-${instanceId}`,
        );
        return { stdoutRef, stderrRef, stdout, stderr };
      });

    const createTarget = (
      sessionId: string,
      config: LaunchConfig,
      ready: Parameters<DevServerSupervisor["createPreviewTarget"]>[0]["ready"],
    ) =>
      Effect.gen(function* () {
        const target = supervisor.createPreviewTarget({ sessionId, ready, config });
        targetsById.set(String(target.id), target);
        yield* writeJsonArtifact(
          sessionId,
          "preview-target-created",
          { target },
          {
            previewTargetId: target.id,
            devServerInstanceId: target.devServerInstanceId,
          },
          `preview-target-created-${target.id}`,
        );
        yield* appendEvent(sessionId, "PreviewTargetCreated", [target.readinessEvidenceRef], {
          previewTargetId: target.id,
          devServerInstanceId: target.devServerInstanceId,
          canonicalUrl: target.canonicalUrl,
        });
        return target;
      });

    const persistReadyEvidence = (
      sessionId: string,
      config: LaunchConfig,
      ready: Parameters<DevServerSupervisor["createPreviewTarget"]>[0]["ready"],
    ) =>
      Effect.gen(function* () {
        yield* writeJsonArtifact(
          sessionId,
          "launch-config-loaded",
          { config },
          { launchConfigId: config.id },
          `launch-config-loaded-${config.id}`,
        );
        yield* writeJsonArtifact(
          sessionId,
          "dev-server-process-spawned",
          {
            instanceId: ready.instance.id,
            pid: ready.instance.pid ?? null,
            command: ready.instance.command,
            cwd: ready.instance.cwd,
          },
          { instanceId: ready.instance.id, launchConfigId: config.id },
          `dev-server-process-spawned-${ready.instance.id}`,
        );
        yield* writeJsonArtifact(
          sessionId,
          "dev-server-health-check",
          {
            status: "healthy",
            instance: ready.instance,
            baseUrl: ready.baseUrl,
            healthEvidenceRef: ready.healthEvidenceRef,
          },
          { instanceId: ready.instance.id, launchConfigId: config.id },
          ready.healthEvidenceRef,
        );
        yield* recordLogs(
          sessionId,
          String(ready.instance.id),
          supervisor.getLogs(ready.instance.id),
        );
      });

    const detect: PreviewServiceShape["detect"] = (input) =>
      Effect.gen(function* () {
        const sessionId = input?.sessionId ?? "preview-detect";
        const configs = yield* loadConfigs();
        const status = configs.length > 0 ? "detected" : "none";
        const result = {
          status,
          configs,
          ...(configs.length === 0 ? { warnings: ["No preview launch config detected."] } : {}),
        } satisfies PreviewDetectResult;
        const artifactRef = yield* writeJsonArtifact(sessionId, "preview-detect", result, {
          configCount: configs.length,
        });
        yield* appendEvent(sessionId, "LaunchConfigDetected", [artifactRef], {
          configCount: configs.length,
          status,
        });
        return result;
      });

    const start: PreviewServiceShape["start"] = (input) =>
      Effect.gen(function* () {
        const sessionId = input?.sessionId ?? `preview-session-${randomUUID()}`;
        const config = yield* resolveConfig(input?.launchConfigId);
        if (!config) {
          return {
            status: "failed",
            error: {
              code: "config-not-found",
              message: "No preview launch config was found.",
            },
          } satisfies PreviewStartResult;
        }

        yield* writeJsonArtifact(
          sessionId,
          "dev-server-start-requested",
          { launchConfigId: config.id, config },
          { launchConfigId: config.id },
        );
        yield* appendEvent(sessionId, "DevServerStartRequested", [], {
          launchConfigId: config.id,
        });

        const result = yield* Effect.tryPromise({
          try: () => supervisor.startServer(sessionId, config),
          catch: (cause) => cause as Error,
        });
        if (!result.ok) {
          const artifactRef = yield* writeJsonArtifact(
            sessionId,
            result.error.reason === "process-crashed"
              ? "dev-server-crash"
              : "dev-server-health-check",
            { error: result.error },
            { launchConfigId: config.id },
          );
          yield* appendEvent(sessionId, "DevServerStartFailed", [artifactRef], {
            reason: result.error.reason,
            message: result.error.message,
          });
          return {
            status: "failed",
            ...(result.error.instance ? { instance: result.error.instance } : {}),
            error: {
              code: result.error.reason,
              message: result.error.message,
              ...(result.error.instance ? { details: result.error.instance } : {}),
            },
          } satisfies PreviewStartResult;
        }

        yield* persistReadyEvidence(sessionId, config, result.ready);
        const target = yield* createTarget(sessionId, config, result.ready);
        const instance = result.ready.instance;
        recordsByInstanceId.set(String(instance.id), {
          config,
          instance,
          previewTarget: target,
        });
        yield* appendEvent(
          sessionId,
          "DevServerHealthCheckPassed",
          [result.ready.healthEvidenceRef],
          {
            instanceId: instance.id,
            baseUrl: result.ready.baseUrl,
          },
        );
        return {
          status: "started",
          instance,
          previewTarget: target,
        } satisfies PreviewStartResult;
      });

    const status: PreviewServiceShape["status"] = (input) =>
      Effect.sync(() => {
        const record = recordsByInstanceId.get(String(input.instanceId));
        const liveInstance = supervisor.getStatus(input.instanceId);
        return {
          ...((liveInstance ?? record?.instance)
            ? { instance: liveInstance ?? record!.instance }
            : {}),
          ...(record?.previewTarget ? { previewTarget: record.previewTarget } : {}),
        };
      });

    const logs: PreviewServiceShape["logs"] = (input) =>
      Effect.gen(function* () {
        const record = recordsByInstanceId.get(String(input.instanceId));
        const instance = supervisor.getStatus(input.instanceId) ?? record?.instance;
        const sessionId = instance?.sessionId ?? "preview-logs";
        const rawLogs = supervisor.getLogs(input.instanceId) ?? { stdout: "", stderr: "" };
        const refs = yield* recordLogs(sessionId, String(input.instanceId), rawLogs);
        return {
          instanceId: input.instanceId,
          stdout: truncateLog(refs.stdout),
          stderr: truncateLog(refs.stderr),
          logRefs: [refs.stdoutRef, refs.stderrRef],
        };
      });

    const stop: PreviewServiceShape["stop"] = (input) =>
      Effect.gen(function* () {
        const record = recordsByInstanceId.get(String(input.instanceId));
        const liveInstance = supervisor.getStatus(input.instanceId) ?? record?.instance;
        const sessionId = liveInstance?.sessionId ?? "preview-stop";
        const rawLogs = supervisor.getLogs(input.instanceId);
        const logRefs = yield* recordLogs(sessionId, String(input.instanceId), rawLogs);
        const stopped = yield* Effect.tryPromise({
          try: () =>
            supervisor.stopServer(
              input.instanceId,
              (input.reason ?? "stopped-by-user") as DevServerStopReason,
            ),
          catch: (cause) => cause as Error,
        });
        const instance = stopped ?? liveInstance;
        if (instance) {
          const config = record?.config ?? configsById.get(String(instance.launchConfigId));
          if (!config) {
            return {
              instance,
              ...(record?.previewTarget ? { previewTarget: record.previewTarget } : {}),
            };
          }
          recordsByInstanceId.set(String(input.instanceId), {
            config,
            instance,
            ...(record?.previewTarget ? { previewTarget: record.previewTarget } : {}),
          });
        }
        const stopRef = yield* writeJsonArtifact(
          sessionId,
          "dev-server-stop",
          { instance, reason: input.reason ?? "stopped-by-user" },
          { instanceId: input.instanceId, logRefs: [logRefs.stdoutRef, logRefs.stderrRef] },
        );
        yield* appendEvent(sessionId, "DevServerStopped", [stopRef], {
          instanceId: input.instanceId,
          reason: input.reason ?? "stopped-by-user",
        });
        return {
          ...(instance ? { instance } : {}),
          ...(record?.previewTarget ? { previewTarget: record.previewTarget } : {}),
        };
      });

    const restart: PreviewServiceShape["restart"] = (input) =>
      Effect.gen(function* () {
        const record = recordsByInstanceId.get(String(input.instanceId));
        const sessionId = record?.instance.sessionId ?? `preview-session-${randomUUID()}`;
        const result = yield* Effect.tryPromise({
          try: () => supervisor.restartServer(sessionId, input.instanceId),
          catch: (cause) => cause as Error,
        });
        if (!result) {
          return {
            status: "failed",
            error: {
              code: "process-start-failed",
              message: `No running preview instance found: ${input.instanceId}`,
            },
          } satisfies PreviewStartResult;
        }
        if (!result.ok) {
          return {
            status: "failed",
            ...(result.error.instance ? { instance: result.error.instance } : {}),
            error: {
              code: result.error.reason,
              message: result.error.message,
              ...(result.error.instance ? { details: result.error.instance } : {}),
            },
          } satisfies PreviewStartResult;
        }
        const config =
          record?.config ?? configsById.get(String(result.ready.instance.launchConfigId));
        if (!config) {
          return {
            status: "failed",
            instance: result.ready.instance,
            error: {
              code: "config-not-found",
              message: `Launch config not found for restarted preview: ${result.ready.instance.launchConfigId}`,
            },
          } satisfies PreviewStartResult;
        }
        yield* persistReadyEvidence(sessionId, config, result.ready);
        const target = yield* createTarget(sessionId, config, result.ready);
        recordsByInstanceId.set(String(result.ready.instance.id), {
          config,
          instance: result.ready.instance,
          previewTarget: target,
        });
        return {
          status: "started",
          instance: result.ready.instance,
          previewTarget: target,
        } satisfies PreviewStartResult;
      });

    const getTarget: PreviewServiceShape["getTarget"] = (input) =>
      Effect.sync(() => targetsById.get(String(input.previewTargetId)) ?? null);

    const listTargets: PreviewServiceShape["listTargets"] = (input) =>
      Effect.sync(() => {
        const targets = [...targetsById.values()].filter(
          (target) => input?.sessionId === undefined || target.sessionId === input.sessionId,
        );
        return { targets };
      });

    return {
      detect,
      start,
      stop,
      restart,
      status,
      logs,
      getTarget,
      listTargets,
      openSessionInputForTarget: ({ previewTarget }) =>
        Effect.succeed({ url: previewTarget.canonicalUrl, previewTarget }),
      getLaunchConfigs: loadConfigs,
    };
  }),
);
