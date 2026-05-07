import { describe, expect, it } from "vitest";
import { Cause } from "effect";

import {
  classifyReactorCause,
  classifyReactorErrorTag,
} from "./reactorErrorClassification.ts";

describe("classifyReactorErrorTag (ORC-018)", () => {
  it("classifies validation-error tags as 'validation'", () => {
    expect(classifyReactorErrorTag("CheckpointInvariantError")).toBe("validation");
    expect(classifyReactorErrorTag("OrchestrationCommandInvariantError")).toBe("validation");
    expect(classifyReactorErrorTag("OrchestrationCommandPreviouslyRejectedError")).toBe(
      "validation",
    );
    expect(classifyReactorErrorTag("OrchestrationCommandDecodeError")).toBe("validation");
    expect(classifyReactorErrorTag("OrchestrationCommandJsonParseError")).toBe("validation");
    expect(classifyReactorErrorTag("OrchestrationProjectorDecodeError")).toBe("validation");
  });

  it("classifies known transient tags as 'transient'", () => {
    expect(classifyReactorErrorTag("CheckpointUnavailableError")).toBe("transient");
    expect(classifyReactorErrorTag("ProjectionRepositoryError")).toBe("transient");
  });

  it("classifies unknown tags as 'unexpected'", () => {
    expect(classifyReactorErrorTag("WhateverCustomError")).toBe("unexpected");
    expect(classifyReactorErrorTag("RandomError")).toBe("unexpected");
    expect(classifyReactorErrorTag("")).toBe("unexpected");
  });
});

describe("classifyReactorCause (ORC-018)", () => {
  it("classifies a fail with a known validation tag as 'validation'", () => {
    const cause = Cause.fail({ _tag: "CheckpointInvariantError", message: "bad checkpoint" });
    expect(classifyReactorCause(cause)).toBe("validation");
  });

  it("classifies a fail with a known transient tag as 'transient'", () => {
    const cause = Cause.fail({ _tag: "ProjectionRepositoryError", message: "db locked" });
    expect(classifyReactorCause(cause)).toBe("transient");
  });

  it("classifies a fail with an unknown tag as 'unexpected'", () => {
    const cause = Cause.fail({ _tag: "MysteryError", message: "boom" });
    expect(classifyReactorCause(cause)).toBe("unexpected");
  });

  it("classifies a non-tagged fail as 'unexpected'", () => {
    const cause = Cause.fail("plain string error");
    expect(classifyReactorCause(cause)).toBe("unexpected");
  });

  it("classifies a defect (die) as 'unexpected'", () => {
    const cause = Cause.die(new Error("programming defect"));
    expect(classifyReactorCause(cause)).toBe("unexpected");
  });

});
