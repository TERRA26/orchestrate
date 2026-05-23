import { describe, expect, it } from "vitest";

import {
  buildWakeSleepInstructions,
  classifyWakeSleepCommand,
  normalizeVoiceCommandText,
} from "./voiceWakeSleep.js";

describe("voiceWakeSleep", () => {
  it("normalizes spoken command punctuation and spacing", () => {
    expect(normalizeVoiceCommandText("  Okay, Orchestrate -- wake up!  ")).toBe(
      "okay orchestrate wake up",
    );
  });

  it("detects sleep commands while awake", () => {
    expect(classifyWakeSleepCommand("please go to sleep now", "awake")).toMatchObject({
      type: "asleep",
      matchedPhrase: "go to sleep",
      hasTrailingRequest: false,
    });
    expect(classifyWakeSleepCommand("voice agent stop listening", "awake")).toMatchObject({
      type: "asleep",
      matchedPhrase: "stop listening",
      hasTrailingRequest: false,
    });
    expect(classifyWakeSleepCommand("I'm saying to go to sleep.", "awake")).toMatchObject({
      type: "asleep",
      matchedPhrase: "go to sleep",
      hasTrailingRequest: false,
    });
  });

  it("detects wake commands while asleep", () => {
    expect(classifyWakeSleepCommand("wake up", "asleep")).toMatchObject({
      type: "awake",
      matchedPhrase: "wake up",
      hasTrailingRequest: false,
    });
    expect(classifyWakeSleepCommand("hey orchestrate", "asleep")).toMatchObject({
      type: "awake",
      matchedPhrase: "hey orchestrate",
      hasTrailingRequest: false,
    });
  });

  it("keeps trailing requests visible for wake-up follow-through", () => {
    expect(classifyWakeSleepCommand("wake up and tell me the agent status", "asleep")).toEqual({
      type: "awake",
      matchedPhrase: "wake up",
      hasTrailingRequest: true,
    });
  });

  it("ignores normal speech while asleep and non-command speech while awake", () => {
    expect(classifyWakeSleepCommand("what is the current status", "asleep")).toBeNull();
    expect(classifyWakeSleepCommand("the app sleeps sometimes", "awake")).toBeNull();
  });

  it("includes mode-specific runtime guidance", () => {
    expect(buildWakeSleepInstructions("asleep").join("\n")).toContain(
      "Voice wake/sleep mode is currently asleep.",
    );
  });
});
