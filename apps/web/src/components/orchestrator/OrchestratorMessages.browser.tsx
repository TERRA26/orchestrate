import { createRef } from "react";
import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import type { WorkLogEntry } from "~/session-logic";
import type { OrchestratorMessage } from "~/orchestratorStateStore";
import { OrchestratorMessages } from "./OrchestratorMessages";

const BASE_MESSAGES: OrchestratorMessage[] = [
  {
    id: "user-1",
    role: "user",
    content: "Build a landing page",
    timestamp: "2026-04-12T10:00:00.000Z",
  },
  {
    id: "assistant-1",
    role: "orchestrator",
    content: "I’m splitting this into a design and implementation pass.",
    timestamp: "2026-04-12T10:00:03.000Z",
  },
];

const BASE_WORK_LOG: WorkLogEntry[] = [
  {
    id: "work-thinking",
    createdAt: "2026-04-12T10:00:01.000Z",
    label: "Analyzing request",
    detail: "Planning the implementation strategy.",
    tone: "thinking",
  },
  {
    id: "work-tool",
    createdAt: "2026-04-12T10:00:02.000Z",
    label: "orchestrate_spawn_agent",
    toolTitle: "Spawn agent",
    toolName: "orchestrate_spawn_agent",
    threadId: "thread-worker-1",
    workerId: "worker-1",
    changedFiles: ["apps/web/src/routes/index.tsx", "apps/web/src/styles.css"],
    tone: "tool",
  },
];

async function mountTranscript(props?: {
  messages?: ReadonlyArray<OrchestratorMessage>;
  workLogEntries?: ReadonlyArray<WorkLogEntry>;
  onOpenWorkerPanel?: (input: { workerId?: string; threadId?: string }) => void;
}) {
  const host = document.createElement("div");
  host.style.height = "720px";
  document.body.append(host);

  const screen = await render(
    <OrchestratorMessages
      messages={props?.messages ?? BASE_MESSAGES}
      workLogEntries={props?.workLogEntries ?? BASE_WORK_LOG}
      requirementsChecklist={[]}
      threadBrowserSession={null}
      isThreadBrowserSessionVisible={false}
      isBusy={false}
      scrollRef={createRef<HTMLDivElement>()}
      {...(props?.onOpenWorkerPanel ? { onOpenWorkerPanel: props.onOpenWorkerPanel } : {})}
    />,
    { container: host },
  );

  return {
    cleanup: async () => {
      await screen.unmount();
      host.remove();
    },
  };
}

describe("OrchestratorMessages", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders thinking rows, tool activity, and changed-file summaries inline", async () => {
    const mounted = await mountTranscript();

    try {
      await vi.waitFor(() => {
        expect(document.body.textContent ?? "").toContain("Analyzing request");
        expect(document.body.textContent ?? "").toContain("Spawn agent");
        expect(document.body.textContent ?? "").toContain("Files changed");
        expect(document.body.textContent ?? "").toContain("apps/web/src/routes/index.tsx");
      });

      await expect
        .element(page.getByText("Analyzing request", { exact: false }))
        .toBeInTheDocument();
      await expect.element(page.getByText("Open agent")).toBeInTheDocument();
    } finally {
      await mounted.cleanup();
    }
  });

  it("opens the related worker panel from a tool row", async () => {
    const onOpenWorkerPanel = vi.fn();
    const mounted = await mountTranscript({ onOpenWorkerPanel });

    try {
      await page.getByText("Open agent").click();
      expect(onOpenWorkerPanel).toHaveBeenCalledWith({
        workerId: "worker-1",
        threadId: "thread-worker-1",
      });
    } finally {
      await mounted.cleanup();
    }
  });
});
