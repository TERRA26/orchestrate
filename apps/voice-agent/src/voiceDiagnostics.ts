import type { JobContext } from "@livekit/agents";

import type { VoiceAgentConfig } from "./orchestrateTools.js";

type VoiceDiagnosticLevel = "debug" | "info" | "warn" | "error";

const VOICE_ROOM_PREFIX = "orchestrate-voice-";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function getRoomName(ctx: JobContext): string | undefined {
  const jobRoom = readString(ctx.job.room?.name);
  if (jobRoom) return jobRoom;
  return readString((ctx.room as { name?: string }).name);
}

function getThreadId(ctx: JobContext, explicitThreadId?: string): string | undefined {
  const explicit = readString(explicitThreadId);
  if (explicit) return explicit;

  const metadata = readString((ctx.job as { metadata?: string }).metadata);
  if (metadata) {
    try {
      const parsed = asRecord(JSON.parse(metadata) as unknown);
      const threadId = readString(parsed?.threadId);
      if (threadId) return threadId;
    } catch {
      // Room-name fallback below.
    }
  }

  const roomName = getRoomName(ctx);
  if (roomName?.startsWith(VOICE_ROOM_PREFIX)) {
    return roomName.slice(VOICE_ROOM_PREFIX.length);
  }
  return undefined;
}

function getJobId(ctx: JobContext): string | undefined {
  const job = ctx.job as {
    id?: string;
    jobId?: string;
    dispatchId?: string;
  };
  return readString(job.id) ?? readString(job.jobId) ?? readString(job.dispatchId);
}

function getParticipantIdentity(ctx: JobContext): string | undefined {
  return readString(
    (ctx.room.localParticipant as { identity?: string | undefined } | undefined)?.identity,
  );
}

function writeDiagnosticFailure(message: string, data?: Record<string, unknown>): void {
  // This intentionally goes to the voice-agent process log. Diagnostics are the
  // thing we use when the realtime path misbehaves, so failed diagnostic writes
  // must be visible somewhere local without leaking secrets or payload bodies.
  console.warn("[voice diagnostics]", message, data ?? {});
}

export async function postVoiceDiagnostic(
  config: VoiceAgentConfig,
  ctx: JobContext,
  input: {
    readonly level?: VoiceDiagnosticLevel;
    readonly message: string;
    readonly threadId?: string;
    readonly data?: unknown;
  },
): Promise<void> {
  const url = `${config.orchestrateHttpUrl}/api/voice/orchestrator/log`;
  const payload = {
    source: "agent",
    level: input.level ?? "info",
    message: input.message,
    threadId: getThreadId(ctx, input.threadId),
    roomName: getRoomName(ctx),
    jobId: getJobId(ctx),
    participantIdentity: getParticipantIdentity(ctx),
    ...(input.data !== undefined ? { data: input.data } : {}),
  };
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.sharedSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const responsePreview = await response.text().catch(() => "");
      writeDiagnosticFailure("post returned non-2xx", {
        status: response.status,
        statusText: response.statusText,
        url,
        threadId: payload.threadId,
        roomName: payload.roomName,
        message: input.message,
        responsePreview: responsePreview.slice(0, 500),
      });
    }
  } catch (cause) {
    writeDiagnosticFailure("post threw before reaching Orchestrate", {
      url,
      threadId: payload.threadId,
      roomName: payload.roomName,
      message: input.message,
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }
}
