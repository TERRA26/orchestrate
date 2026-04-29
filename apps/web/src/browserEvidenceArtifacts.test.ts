import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { EvidenceArtifactId } from "@orchestrate/contracts";

import {
  evidenceArtifactContentDataUrl,
  fetchEvidenceArtifactImageDataUrl,
  fetchReviewerUserVisibleSummary,
  reviewerUserVisibleSummaryFromArtifact,
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

const summaryMetadata = {
  ...metadata,
  artifactId: EvidenceArtifactId.makeUnsafe("summary-1"),
  kind: "reviewer-user-visible-summary" as const,
  contentType: "application/json",
};

const summaryContent = {
  decisionId: "decision-1",
  outcome: "accepted",
  confidence: "high",
  purpose: "browser-smoke",
  checked: {
    routes: ["/"],
    viewports: [],
    previewTargetId: "preview-1",
    workflowRunId: "workflow-1",
  },
  gates: [],
  findings: [],
  criterionResults: [],
  evidence: {
    screenshotArtifactRefs: ["screenshot-1"],
    observationRefs: ["observation-1"],
    workflowRunRef: "workflow-1",
    evidenceBundleId: "bundle-1",
  },
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
          bundle: {
            create: async () => {
              throw new Error("Not used by artifact image fetch test.");
            },
            get: async () => ({ evidenceBundle: undefined }),
          },
        },
      },
      "artifact-1",
    );

    assert.equal(dataUrl, "data:image/png;base64,aGVsbG8=");
  });

  it("parses reviewer user-visible summary artifacts", () => {
    const summary = reviewerUserVisibleSummaryFromArtifact({
      artifactId: EvidenceArtifactId.makeUnsafe("summary-1"),
      contentType: "application/json",
      encoding: "utf8",
      content: JSON.stringify(summaryContent),
      metadata: summaryMetadata,
    });

    assert.equal(summary?.decisionId, "decision-1");
    assert.equal(summary?.evidence.evidenceBundleId, "bundle-1");
  });

  it("fetches reviewer user-visible summaries through the native evidence API", async () => {
    const summary = await fetchReviewerUserVisibleSummary(
      {
        evidence: {
          getArtifact: async () => ({
            artifactId: EvidenceArtifactId.makeUnsafe("summary-1"),
            contentType: "application/json",
            encoding: "utf8",
            content: JSON.stringify(summaryContent),
            metadata: summaryMetadata,
          }),
          bundle: {
            create: async () => {
              throw new Error("Not used by summary fetch test.");
            },
            get: async () => ({ evidenceBundle: undefined }),
          },
        },
      },
      "summary-1",
    );

    assert.equal(summary?.outcome, "accepted");
    assert.equal(summary?.purpose, "browser-smoke");
  });
});
