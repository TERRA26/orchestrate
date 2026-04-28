import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { EvidenceArtifactId } from "@orchestrate/contracts";

import {
  evidenceArtifactContentDataUrl,
  fetchEvidenceArtifactImageDataUrl,
} from "./browserEvidenceArtifacts";

const metadata = {
  artifactId: EvidenceArtifactId.makeUnsafe("artifact-1"),
  kind: "browser-screenshot" as const,
  contentType: "image/png",
  byteSize: 12,
  sha256: "hash",
  sensitivity: "workspace-internal" as const,
  access: "safe-for-user-report" as const,
  createdAt: "2026-04-28T00:00:00.000Z",
};

describe("browserEvidenceArtifacts", () => {
  it("builds an image data URL from base64 artifact content", () => {
    assert.equal(
      evidenceArtifactContentDataUrl({
        artifactId: EvidenceArtifactId.makeUnsafe("artifact-1"),
        contentType: "image/png",
        encoding: "base64",
        content: "aGVsbG8=",
        metadata,
      }),
      "data:image/png;base64,aGVsbG8=",
    );
  });

  it("passes legacy data URLs through when returned as utf8 content", () => {
    assert.equal(
      evidenceArtifactContentDataUrl({
        artifactId: EvidenceArtifactId.makeUnsafe("artifact-1"),
        contentType: "image/png",
        encoding: "utf8",
        content: "data:image/png;base64,aGVsbG8=",
        metadata,
      }),
      "data:image/png;base64,aGVsbG8=",
    );
  });

  it("fetches artifact content through the native evidence API", async () => {
    const dataUrl = await fetchEvidenceArtifactImageDataUrl(
      {
        evidence: {
          getArtifact: async () => ({
            artifactId: EvidenceArtifactId.makeUnsafe("artifact-1"),
            contentType: "image/png",
            encoding: "base64",
            content: "aGVsbG8=",
            metadata,
          }),
        },
      },
      "artifact-1",
    );

    assert.equal(dataUrl, "data:image/png;base64,aGVsbG8=");
  });
});
