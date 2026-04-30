// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchEvidenceArtifactImageDataUrl } from "~/browserEvidenceArtifacts";
import { BrowserArtifactScreenshotPreview } from "./WorkEntryRow";

vi.mock("~/browserEvidenceArtifacts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/browserEvidenceArtifacts")>();
  return {
    ...actual,
    fetchEvidenceArtifactImageDataUrl: vi.fn(),
  };
});

vi.mock("~/nativeApi", () => ({
  ensureNativeApi: vi.fn(() => ({ evidence: { getArtifact: vi.fn() } })),
}));

const fetchEvidenceArtifactImageDataUrlMock = vi.mocked(fetchEvidenceArtifactImageDataUrl);

describe("BrowserArtifactScreenshotPreview", () => {
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it("shows the loading state while the artifact image fetch is pending", () => {
    fetchEvidenceArtifactImageDataUrlMock.mockReturnValue(new Promise(() => {}));

    render(<BrowserArtifactScreenshotPreview artifactRef="screenshot-pending" />);

    expect(screen.getByText("Loading preview...")).toBeInTheDocument();
  });

  it("renders the screenshot image after the artifact image fetch resolves", async () => {
    const dataUrl = "data:image/png;base64,ZmFrZS1pbWFnZQ==";
    fetchEvidenceArtifactImageDataUrlMock.mockResolvedValue(dataUrl);

    render(<BrowserArtifactScreenshotPreview artifactRef="screenshot-loaded" />);

    const image = await screen.findByRole("img", { name: "Captured browser screenshot" });
    expect(image).toHaveAttribute("src", dataUrl);
    expect(screen.queryByText("Loading preview...")).not.toBeInTheDocument();
  });

  it("shows the failed state after the artifact image fetch resolves without image data", async () => {
    fetchEvidenceArtifactImageDataUrlMock.mockResolvedValue(null);

    render(<BrowserArtifactScreenshotPreview artifactRef="screenshot-missing" />);

    await waitFor(() => {
      expect(screen.getByText("Preview unavailable")).toBeInTheDocument();
    });
  });

  it("ignores a stale pending fetch after rendering a different artifact ref", async () => {
    let resolveFirstFetch: ((dataUrl: string | null) => void) | undefined;
    const firstFetch = new Promise<string | null>((resolve) => {
      resolveFirstFetch = resolve;
    });
    const nextDataUrl = "data:image/png;base64,bmV4dC1pbWFnZQ==";
    fetchEvidenceArtifactImageDataUrlMock
      .mockReturnValueOnce(firstFetch)
      .mockResolvedValueOnce(nextDataUrl);

    const { rerender } = render(
      <BrowserArtifactScreenshotPreview artifactRef="screenshot-stale" />,
    );
    rerender(<BrowserArtifactScreenshotPreview artifactRef="screenshot-current" />);

    const image = await screen.findByRole("img", { name: "Captured browser screenshot" });
    expect(image).toHaveAttribute("src", nextDataUrl);

    if (!resolveFirstFetch) {
      throw new Error("first fetch resolver was not assigned");
    }
    resolveFirstFetch("data:image/png;base64,c3RhbGUtaW1hZ2U=");
    await Promise.resolve();

    expect(image).toHaveAttribute("src", nextDataUrl);
  });
});
