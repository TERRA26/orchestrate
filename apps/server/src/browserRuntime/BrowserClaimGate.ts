import type {
  BrowserClaimGateReport,
  BrowserObservation,
  BrowserRuntimeTruth,
} from "@orchestrate/contracts";

function isLikelyVideoPage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes("youtube.com") && parsed.pathname === "/watch";
  } catch {
    return false;
  }
}

function screenshotEvidenceRef(observation: BrowserObservation): string[] {
  const ref = observation.runtimeTruth?.screenshotArtifactRef ?? observation.screenshotArtifactRef;
  return ref ? [ref] : [];
}

function parseEvaluateResult(value: string | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function hasPlaybackProof(observation: BrowserObservation): boolean {
  const evaluated = parseEvaluateResult(observation.evaluateResult);
  if (!evaluated || typeof evaluated !== "object") {
    return false;
  }
  const record = evaluated as Record<string, unknown>;
  return record.found === true && record.paused === false && typeof record.currentTime === "number";
}

export function browserClaimGateForObservation(input: {
  readonly observation: BrowserObservation;
  readonly runtimeTruth: BrowserRuntimeTruth | undefined;
}): BrowserClaimGateReport[] {
  const { observation, runtimeTruth } = input;
  const evidenceRefs = screenshotEvidenceRef(observation);
  const reports: BrowserClaimGateReport[] = [
    {
      claimKind: "navigated",
      decision:
        runtimeTruth && evidenceRefs.length > 0
          ? { outcome: "allow", evidenceRefs }
          : {
              outcome: "downgrade",
              replacementText:
                "Browser navigation was attempted, but no same-runtime screenshot evidence is available.",
              reason: "Navigation claims require runtime truth and screenshot evidence.",
              evidenceRefs,
            },
    },
  ];

  if (isLikelyVideoPage(observation.url)) {
    reports.push({
      claimKind: "playing",
      decision: hasPlaybackProof(observation)
        ? { outcome: "allow", evidenceRefs }
        : {
            outcome: "block",
            reason:
              "Playback cannot be claimed without same-runtime evidence that a video element is unpaused and advancing.",
            missingEvidence: ["video.paused === false", "currentTime advanced across observations"],
          },
    });
  }

  return reports;
}
