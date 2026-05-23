import {
  EvidenceArtifactId,
  LaunchConfigId,
  PreviewTargetId,
  type PreviewTarget,
} from "@orchestrate/contracts";

export function makePreviewTarget(overrides: Partial<PreviewTarget> = {}): PreviewTarget {
  return {
    id: PreviewTargetId.makeUnsafe("preview-target-1"),
    version: 1,
    sessionId: "session-1",
    kind: "local-dev-server",
    canonicalUrl: "http://127.0.0.1:5173/",
    baseUrl: "http://127.0.0.1:5173",
    initialRoute: "/",
    devServerInstanceId: "server-1",
    launchConfigId: LaunchConfigId.makeUnsafe("web"),
    allowedOrigins: ["http://127.0.0.1:5173"],
    deniedOrigins: [],
    authMode: "none",
    permissionTier: "isolated-local-preview",
    viewports: [
      {
        id: "desktop",
        label: "Desktop",
        width: 1440,
        height: 900,
        deviceScaleFactor: 1,
      },
    ],
    readinessEvidenceRef: EvidenceArtifactId.makeUnsafe("artifact-health"),
    serverLogRefs: [EvidenceArtifactId.makeUnsafe("artifact-logs")],
    createdAt: "2026-04-27T00:00:00.000Z",
    ...overrides,
  };
}
