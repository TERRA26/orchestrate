export type VoiceListeningMode = "awake" | "asleep";

export interface WakeSleepCommand {
  readonly type: VoiceListeningMode;
  readonly matchedPhrase: string;
  readonly hasTrailingRequest: boolean;
}

const WAKE_PHRASES = [
  "wake up",
  "start listening",
  "listen in",
  "listen again",
  "you can listen",
  "you can listen now",
  "come back",
  "hey orchestrate",
  "orchestrate wake",
  "voice wake",
  "wake",
] as const;

const SLEEP_PHRASES = [
  "sleep",
  "go to sleep",
  "stop listening",
  "stop listening in",
  "stop listening now",
  "pause listening",
  "mute yourself",
  "go quiet",
  "voice sleep",
  "orchestrate sleep",
] as const;

const COMMAND_PREFIXES = [
  "voice agent",
  "orchestrate",
  "assistant",
  "hey",
  "ok",
  "okay",
  "alright",
  "please",
  "voice",
  "im saying to",
  "i am saying to",
  "im telling you to",
  "i am telling you to",
  "i said to",
  "i told you to",
] as const;

const TRAILING_FILLERS = new Set(["and", "then", "please", "now", "thanks", "thank", "you"]);

export function normalizeVoiceCommandText(text: string): string {
  return text
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function stripCommandPrefixes(text: string): string {
  let normalized = text;
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of COMMAND_PREFIXES) {
      if (normalized === prefix) {
        return "";
      }
      if (normalized.startsWith(`${prefix} `)) {
        normalized = normalized.slice(prefix.length + 1).trim();
        changed = true;
      }
    }
  }
  return normalized;
}

function hasMeaningfulRemainder(text: string): boolean {
  const words = normalizeVoiceCommandText(text)
    .split(" ")
    .filter((word) => word.length > 0 && !TRAILING_FILLERS.has(word));
  return words.length > 0;
}

function findCommand(
  text: string,
  phrases: readonly string[],
  type: VoiceListeningMode,
): WakeSleepCommand | null {
  const normalized = normalizeVoiceCommandText(text);
  const withoutPrefixes = stripCommandPrefixes(normalized);
  const candidates = [withoutPrefixes, normalized].filter((candidate) => candidate.length > 0);

  for (const candidate of candidates) {
    for (const phrase of phrases) {
      if (candidate === phrase) {
        return { type, matchedPhrase: phrase, hasTrailingRequest: false };
      }
      if (candidate.startsWith(`${phrase} `)) {
        return {
          type,
          matchedPhrase: phrase,
          hasTrailingRequest: hasMeaningfulRemainder(candidate.slice(phrase.length + 1)),
        };
      }
    }
  }

  return null;
}

export function classifyWakeSleepCommand(
  text: string,
  currentMode: VoiceListeningMode,
): WakeSleepCommand | null {
  if (currentMode === "asleep") {
    return findCommand(text, WAKE_PHRASES, "awake");
  }

  return findCommand(text, SLEEP_PHRASES, "asleep");
}

export function buildWakeSleepInstructions(mode: VoiceListeningMode): readonly string[] {
  return [
    `Voice wake/sleep mode is currently ${mode}.`,
    "Wake/sleep commands are system controls, not Orchestrate chat messages.",
    "When awake, if the user says sleep, go to sleep, stop listening, pause listening, mute yourself, or go quiet, call set_voice_listening_mode with mode asleep. Do not call any Orchestrate action tool for that utterance.",
    "When asleep, do not answer normal user speech, do not send orchestrator messages, and do not call orchestrator tools. For non-wake input, call ignore_sleeping_input and then produce no spoken reply.",
    "When asleep, only wake phrases such as wake up, start listening, listen in, hey Orchestrate, or come back should resume normal conversation. Call set_voice_listening_mode with mode awake for wake phrases.",
    "After waking, resume normal Orchestrate Voice behavior. If the wake phrase also includes a real request after it, handle that request normally after the wake tool succeeds.",
  ];
}
