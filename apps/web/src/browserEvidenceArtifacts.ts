import {
  EvidenceArtifactId,
  type EvidenceArtifactContentResult,
  type NativeApi,
  type ReviewerUserVisibleSummary,
} from "@orchestrate/contracts";

export function evidenceArtifactContentDataUrl(
  artifact: EvidenceArtifactContentResult,
): string | null {
  if (!artifact.content) {
    return null;
  }
  if (artifact.encoding === "base64") {
    return `data:${artifact.contentType};base64,${artifact.content}`;
  }
  if (artifact.encoding === "utf8" && artifact.content.startsWith("data:image/")) {
    return artifact.content;
  }
  return null;
}

export async function fetchEvidenceArtifactImageDataUrl(
  api: Pick<NativeApi, "evidence">,
  artifactId: string,
): Promise<string | null> {
  const artifact = await api.evidence.getArtifact({
    artifactId: EvidenceArtifactId.makeUnsafe(artifactId),
  });
  return evidenceArtifactContentDataUrl(artifact);
}

export function reviewerUserVisibleSummaryFromArtifact(
  artifact: EvidenceArtifactContentResult,
): ReviewerUserVisibleSummary | null {
  if (artifact.metadata.kind !== "reviewer-user-visible-summary") {
    return null;
  }
  if (artifact.encoding !== "utf8" || !artifact.content) {
    return null;
  }
  try {
    return JSON.parse(artifact.content) as ReviewerUserVisibleSummary;
  } catch {
    return null;
  }
}

export async function fetchReviewerUserVisibleSummary(
  api: Pick<NativeApi, "evidence">,
  artifactId: string,
): Promise<ReviewerUserVisibleSummary | null> {
  const artifact = await api.evidence.getArtifact({
    artifactId: EvidenceArtifactId.makeUnsafe(artifactId),
  });
  return reviewerUserVisibleSummaryFromArtifact(artifact);
}
