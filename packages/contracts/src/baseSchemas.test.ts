import assert from "node:assert/strict";
import { it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import { ThreadId } from "./baseSchemas";

const decodeThreadId = Schema.decodeUnknownEffect(ThreadId);

it.effect("decodes entity IDs up to 128 characters", () =>
  Effect.gen(function* () {
    const id = "a".repeat(128);
    const parsed = yield* decodeThreadId(id);
    assert.equal(parsed, id);
  }),
);

it.effect("rejects entity IDs over 128 characters", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(decodeThreadId("a".repeat(129)));
    assert.equal(exit._tag, "Failure");
  }),
);
