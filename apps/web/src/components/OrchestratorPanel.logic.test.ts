import { describe, expect, it } from "vitest";
import { MessageId, ProjectId, ThreadId, TurnId } from "@orchestrate/contracts";

import {
  buildAdHocBrowserValidationRun,
  buildChecklistItemsFromTaskDraft,
  buildRouterUserPrompt,
  buildBrowserValidationUserPrompt,
  buildRecoveredOrchestratorMessages,
  buildDelegationInstruction,
  buildReviewUserPrompt,
  classifyReviewArtifactsReadiness,
  extractEmbeddedBrowserPresentationCandidates,
  formatBrowserValidationActionSummary,
  formatReviewArtifactsWaitMessage,
  mergeChecklistWithReview,
  parseBrowserValidationPlannerAction,
  parseOrchestratorRouterDecision,
  parseOrchestratorReviewDecision,
  parseOrchestratorTaskDraft,
  resolveOrchestratorConversationThreadId,
  resolveTurnReviewContext,
  selectBrowserValidationCandidate,
  shouldHandleAsDirectBrowserValidationRequest,
  shouldRequireBrowserValidation,
  truncateForReview,
  validateReviewerFollowUpInstruction,
} from "./OrchestratorPanel.logic";
import type { Thread } from "../types";

describe("OrchestratorPanel.logic", () => {
  it("parses structured planner output", () => {
    const task = parseOrchestratorTaskDraft(`\`\`\`json
{"title":"Implement orchestrator loop","instruction":"Add the iteration loop to the orchestrator.","acceptanceCriteria":["Always require a detailed report","Review changed files before finishing"]}
\`\`\``);

    expect(task).toEqual({
      title: "Implement orchestrator loop",
      instruction: "Add the iteration loop to the orchestrator.",
      acceptanceCriteria: [
        "Always require a detailed report",
        "Review changed files before finishing",
      ],
      requirementsChecklist: [
        "Always require a detailed report",
        "Review changed files before finishing",
      ],
    });
  });

  it("parses direct-answer router decisions for status questions", () => {
    expect(
      parseOrchestratorRouterDecision(
        '{"kind":"answer","response":"Browser validation has not run yet.","shouldContinueRun":true}',
      ),
    ).toEqual({
      kind: "answer",
      response: "Browser validation has not run yet.",
      shouldContinueRun: true,
    });
  });

  it("falls back to delegate routing when the router returns legacy planner output", () => {
    expect(
      parseOrchestratorRouterDecision(
        '{"title":"Build game","instruction":"Implement the game.","acceptanceCriteria":["Run the server"]}',
      ),
    ).toEqual({
      kind: "delegate",
      taskDraft: {
        title: "Build game",
        instruction: "Implement the game.",
        acceptanceCriteria: ["Run the server"],
        requirementsChecklist: ["Run the server"],
      },
    });
  });

  it("adds mandatory report-back requirements to delegated instructions", () => {
    const instruction = buildDelegationInstruction({
      instruction: "Implement the orchestrator loop.",
      acceptanceCriteria: ["Review changed files"],
    });

    expect(instruction).toContain("When you reply, include a detailed implementation report");
    expect(instruction).toContain("Files created, edited, or deleted");
    expect(instruction).toContain("Validation and commands run");
    expect(instruction).toContain("Preview URL or access path");
    expect(instruction).toContain("Acceptance criteria:");
  });

  it("builds router context with recent orchestrator messages and active run details", () => {
    const prompt = buildRouterUserPrompt({
      userRequest: "Have you tested this in the browser?",
      activeRun: {
        iteration: 2,
        startedAt: "2026-04-02T10:00:00.000Z",
        userRequest: "Build the pinball game.",
      },
      requirementsChecklist: [
        {
          id: "req-1",
          label: "Return a working localhost URL",
          status: "pending",
          notes: null,
        },
      ],
      managedThreadTitle: "Build the pinball game",
      statusDetail: "Opening browser validation preview: http://localhost:3456",
      latestAgentReport: "Implementation Report\n1. Completed work",
      recentMessages: [
        {
          role: "thinking",
          content: "Opening browser validation preview: http://localhost:3456",
        },
        {
          role: "orchestrator",
          content: "Browser validation could not complete because Playwright failed to launch.",
        },
      ],
    });

    expect(prompt).toContain("Have you tested this in the browser?");
    expect(prompt).toContain("Active managed run:\nYes. Iteration 2.");
    expect(prompt).toContain("Current requirements checklist:");
    expect(prompt).toContain("[pending] Return a working localhost URL");
    expect(prompt).toContain("Opening browser validation preview: http://localhost:3456");
    expect(prompt).toContain("Browser validation could not complete");
  });

  it("detects manual browser-validation requests that the orchestrator should own directly", () => {
    expect(
      shouldHandleAsDirectBrowserValidationRequest({
        userRequest: "Use the browser to navigate and test it thoroughly.",
        hasManagedThread: true,
      }),
    ).toBe(true);

    expect(
      shouldHandleAsDirectBrowserValidationRequest({
        userRequest: "Create a well styled interactive website that mimics YouTube thoroughly.",
        hasManagedThread: true,
      }),
    ).toBe(false);
  });

  it("builds an ad hoc browser-validation run from the existing orchestrator history", () => {
    const thread = makeThread({
      id: ThreadId.makeUnsafe("thread-youtube"),
      projectId: ProjectId.makeUnsafe("project-youtube"),
      title: "Build YouTube clone",
      latestTurn: {
        turnId: TurnId.makeUnsafe("turn-youtube"),
        state: "completed",
        requestedAt: "2026-04-02T10:00:00.000Z",
        startedAt: "2026-04-02T10:00:01.000Z",
        completedAt: "2026-04-02T10:00:10.000Z",
        assistantMessageId: MessageId.makeUnsafe("assistant-youtube"),
      },
    });

    expect(
      buildAdHocBrowserValidationRun({
        thread,
        messages: [
          {
            role: "user",
            content: "Create a well styled interactive website that mimics YouTube thoroughly.",
          },
          {
            role: "orchestrator",
            content: [
              "Build interactive YouTube clone website",
              "",
              "When you reply, include a detailed implementation report with these exact sections:",
              "1. Completed work",
            ].join("\n"),
          },
          {
            role: "user",
            content: "Use the browser to navigate and test it.",
          },
        ],
        requirementsChecklist: [
          {
            id: "req-1",
            label: "Search input filters videos by title",
            status: "pending",
            notes: null,
          },
        ],
        fallbackUserRequest: "Use the browser to navigate and test it.",
      }),
    ).toEqual({
      run: {
        threadId: ThreadId.makeUnsafe("thread-youtube"),
        projectId: ProjectId.makeUnsafe("project-youtube"),
        userRequest: "Create a well styled interactive website that mimics YouTube thoroughly.",
        delegatedInstruction: [
          "Build interactive YouTube clone website",
          "",
          "When you reply, include a detailed implementation report with these exact sections:",
          "1. Completed work",
        ].join("\n"),
        requirementsChecklist: [
          {
            id: "req-1",
            label: "Search input filters videos by title",
            status: "pending",
            notes: null,
          },
        ],
        iteration: 1,
        startedAt: "2026-04-02T10:00:00.000Z",
      },
      summary:
        'Using the existing managed thread "Build YouTube clone" for direct browser validation.',
    });
  });

  it("resolves the latest assistant report and turn diff for review", () => {
    const turnId = TurnId.makeUnsafe("turn-2");
    const thread = makeThread({
      latestTurn: {
        turnId,
        state: "completed",
        requestedAt: "2026-04-01T00:00:00.000Z",
        startedAt: "2026-04-01T00:00:01.000Z",
        completedAt: "2026-04-01T00:00:10.000Z",
        assistantMessageId: MessageId.makeUnsafe("assistant-2"),
      },
      messages: [
        makeAssistantMessage("assistant-1", "Old output", TurnId.makeUnsafe("turn-1")),
        makeAssistantMessage("assistant-2", "Latest output", turnId),
      ],
      turnDiffSummaries: [
        {
          turnId,
          completedAt: "2026-04-01T00:00:10.000Z",
          files: [{ path: "src/orchestrator.ts" }],
        },
      ],
    });

    expect(resolveTurnReviewContext(thread)).toEqual({
      turnId,
      agentReport: "Latest output",
      turnSummary: {
        turnId,
        completedAt: "2026-04-01T00:00:10.000Z",
        files: [{ path: "src/orchestrator.ts" }],
      },
    });
  });

  it("does not fall back to an older turn diff when the latest turn summary is missing", () => {
    const latestTurnId = TurnId.makeUnsafe("turn-2");
    const thread = makeThread({
      latestTurn: {
        turnId: latestTurnId,
        state: "completed",
        requestedAt: "2026-04-01T00:00:00.000Z",
        startedAt: "2026-04-01T00:00:01.000Z",
        completedAt: "2026-04-01T00:00:10.000Z",
        assistantMessageId: MessageId.makeUnsafe("assistant-2"),
      },
      messages: [
        makeAssistantMessage("assistant-1", "Old output", TurnId.makeUnsafe("turn-1")),
        makeAssistantMessage("assistant-2", "Latest output", latestTurnId),
      ],
      turnDiffSummaries: [
        {
          turnId: TurnId.makeUnsafe("turn-1"),
          completedAt: "2026-04-01T00:00:05.000Z",
          files: [{ path: "src/old.ts" }],
        },
      ],
    });

    expect(resolveTurnReviewContext(thread)).toEqual({
      turnId: latestTurnId,
      agentReport: "Latest output",
      turnSummary: null,
    });
  });

  it("marks review artifacts as pending while the latest completed turn waits for checkpoint metadata", () => {
    const latestTurnId = TurnId.makeUnsafe("turn-2");
    const thread = makeThread({
      latestTurn: {
        turnId: latestTurnId,
        state: "completed",
        requestedAt: "2026-04-01T00:00:00.000Z",
        startedAt: "2026-04-01T00:00:01.000Z",
        completedAt: "2026-04-01T00:00:10.000Z",
        assistantMessageId: MessageId.makeUnsafe("assistant-2"),
      },
      messages: [makeAssistantMessage("assistant-2", "Latest output", latestTurnId)],
    });

    const reviewContext = resolveTurnReviewContext(thread);
    expect(
      classifyReviewArtifactsReadiness({
        thread,
        projectCwd: "/repo",
        runStartedAt: "2026-04-01T00:00:00.000Z",
        reviewContext,
        fallbackChangedFileCount: 0,
        workLogEntryCount: 0,
        allowWorkLogFallback: false,
      }),
    ).toEqual({
      status: "pending",
      reason: "Checkpoint metadata for turn turn-2 has not been captured yet.",
      source: null,
    });
  });

  it("falls back to work-log review when checkpoint metadata never arrives but file evidence exists", () => {
    const latestTurnId = TurnId.makeUnsafe("turn-2");
    const thread = makeThread({
      latestTurn: {
        turnId: latestTurnId,
        state: "completed",
        requestedAt: "2026-04-01T00:00:00.000Z",
        startedAt: "2026-04-01T00:00:01.000Z",
        completedAt: "2026-04-01T00:00:10.000Z",
        assistantMessageId: MessageId.makeUnsafe("assistant-2"),
      },
      messages: [makeAssistantMessage("assistant-2", "Latest output", latestTurnId)],
    });

    const reviewContext = resolveTurnReviewContext(thread);
    expect(
      classifyReviewArtifactsReadiness({
        thread,
        projectCwd: "/repo",
        runStartedAt: "2026-04-01T00:00:00.000Z",
        reviewContext,
        fallbackChangedFileCount: 2,
        workLogEntryCount: 3,
        allowWorkLogFallback: true,
      }),
    ).toEqual({
      status: "ready",
      reason:
        "Checkpoint metadata was unavailable, so the orchestrator is falling back to work-log evidence for review.",
      source: "work-log",
    });
  });

  it("formats reviewer wait copy for checkpoint metadata delays", () => {
    expect(
      formatReviewArtifactsWaitMessage(
        "Checkpoint metadata for turn turn-2 has not been captured yet.",
      ),
    ).toBe("Waiting for checkpoint metadata and changed-file summaries before review...");
  });

  it("parses reviewer follow-up decisions", () => {
    const decision = parseOrchestratorReviewDecision(
      '{"sufficient":false,"summary":"The loop does not inspect changed files.","missingRequirements":["Read each changed file before approving"],"followUp":"Read the changed files for the reviewed turn, validate them against the request, and then return the required report.","requirementsChecklist":[{"requirement":"Read each changed file before approving","status":"failed","notes":"The latest review lacked file inspection."}]}',
    );

    expect(decision).toEqual({
      sufficient: false,
      summary: "The loop does not inspect changed files.",
      missingRequirements: ["Read each changed file before approving"],
      followUpInstruction:
        "Read the changed files for the reviewed turn, validate them against the request, and then return the required report.",
      presentation: null,
      requirementsChecklist: [
        {
          id: "review:read-each-changed-file-before-approving",
          label: "Read each changed file before approving",
          status: "failed",
          notes: "The latest review lacked file inspection.",
        },
      ],
    });
  });

  it("preserves an explicit null reviewer follow-up for internal review-context failures", () => {
    const decision = parseOrchestratorReviewDecision(
      '{"sufficient":false,"summary":"Checkpoint metadata was missing.","missingRequirements":[],"followUpInstruction":null,"presentation":null}',
    );

    expect(decision.followUpInstruction).toBeNull();
    expect(decision.requirementsChecklist).toEqual([]);
  });

  it("rejects reviewer follow-ups that ask the agent for proof artifacts", () => {
    expect(
      validateReviewerFollowUpInstruction(
        "Share the git diff, show file snapshots, and rerun bun lint capturing the full output.",
      ),
    ).toEqual({
      valid: false,
      reason:
        "the reviewer asked the agent for proof artifacts like diffs, snapshots, or pasted command output instead of concrete implementation work",
    });
  });

  it("parses reviewer preview presentation decisions only when they match a candidate", () => {
    const decision = parseOrchestratorReviewDecision(
      '{"sufficient":true,"summary":"The microsite is complete.","missingRequirements":[],"followUpInstruction":null,"presentation":{"kind":"embedded_browser","url":"/microsites/crypto","title":"Crypto Microsite"}}',
      {
        presentationCandidates: [
          {
            source: "agent report",
            title: "Crypto Microsite",
            url: "/microsites/crypto",
          },
        ],
      },
    );

    expect(decision).toEqual({
      sufficient: true,
      summary: "The microsite is complete.",
      missingRequirements: [],
      followUpInstruction: null,
      presentation: {
        kind: "embedded_browser",
        title: "Crypto Microsite",
        url: "/microsites/crypto",
      },
      requirementsChecklist: [],
    });
  });

  it("builds a reviewer prompt with diff and file snapshots", () => {
    const prompt = buildReviewUserPrompt({
      userRequest: "Build the orchestrator loop.",
      delegatedInstruction: "Implement the loop.",
      agentReport: "Done.",
      requirementsChecklist: [
        {
          id: "req-1",
          label: "Inspect changed files before approving",
          status: "pending",
          notes: null,
        },
      ],
      artifactSource: "checkpoint",
      workLogEntries: [
        {
          label: "Ran command",
          createdAt: "2026-04-01T00:00:01.000Z",
          tone: "tool",
          command: "bun run dev -- --port 5174",
          detail: "Local: http://localhost:5174/learn-ai",
        },
      ],
      diffPatch: "diff --git a/a.ts b/a.ts\n+console.log('x')\n",
      fileSnapshots: [{ path: "a.ts", contents: "console.log('x')\n" }],
      browserValidation: null,
      presentationCandidates: [
        {
          source: "agent report",
          title: "Crypto Preview",
          url: "/microsites/crypto",
        },
      ],
    });

    expect(prompt).toContain("Original user request:");
    expect(prompt).toContain("Review evidence source:");
    expect(prompt).toContain("Checkpoint diff metadata was available for this turn.");
    expect(prompt).toContain("Requirements checklist:");
    expect(prompt).toContain("Inspect changed files before approving");
    expect(prompt).toContain("Command and runtime evidence:");
    expect(prompt).toContain("bun run dev -- --port 5174");
    expect(prompt).toContain("http://localhost:5174/learn-ai");
    expect(prompt).toContain("Reviewed turn diff:");
    expect(prompt).toContain("Changed file snapshots:");
    expect(prompt).toContain("Path: a.ts");
    expect(prompt).toContain("Embedded browser presentation candidates:");
    expect(prompt).toContain("/microsites/crypto");
  });

  it("includes browser validation evidence in the reviewer prompt", () => {
    const prompt = buildReviewUserPrompt({
      userRequest: "Create a browser game and return the URL.",
      delegatedInstruction: "Build the game.",
      agentReport: "Server running at http://localhost:3333.",
      requirementsChecklist: [],
      artifactSource: "work-log",
      workLogEntries: [],
      diffPatch: null,
      fileSnapshots: [],
      browserValidation: {
        status: "validated",
        url: "http://localhost:3333",
        ready: true,
        summary: "The game loaded and accepted several clicks.",
        missingRequirements: [],
        steps: [
          { index: 1, actionSummary: "Click Start", url: "http://localhost:3333", title: "Game" },
        ],
      },
      presentationCandidates: [],
    });

    expect(prompt).toContain("Browser validation evidence:");
    expect(prompt).toContain("The game loaded and accepted several clicks.");
    expect(prompt).toContain("Click Start");
  });

  it("builds pending checklist items from a routed task draft", () => {
    expect(
      buildChecklistItemsFromTaskDraft({
        acceptanceCriteria: ["Run the preview"],
        requirementsChecklist: ["Return a working localhost URL", "Validate the interactive flow"],
      }),
    ).toEqual([
      {
        id: "requirement:1:return-a-working-localhost-url",
        label: "Return a working localhost URL",
        status: "pending",
        notes: null,
      },
      {
        id: "requirement:2:validate-the-interactive-flow",
        label: "Validate the interactive flow",
        status: "pending",
        notes: null,
      },
    ]);
  });

  it("merges reviewer checklist outcomes into the orchestrator quality gate", () => {
    expect(
      mergeChecklistWithReview({
        checklist: [
          {
            id: "req-1",
            label: "Return a working localhost URL",
            status: "pending",
            notes: null,
          },
          {
            id: "req-2",
            label: "Validate the interactive flow",
            status: "pending",
            notes: null,
          },
        ],
        review: {
          sufficient: false,
          summary: "The preview URL works, but the interactive flow still breaks.",
          missingRequirements: ["Validate the interactive flow"],
          requirementsChecklist: [
            {
              id: "review:return-a-working-localhost-url",
              label: "Return a working localhost URL",
              status: "passed",
              notes: "Confirmed in runtime evidence.",
            },
          ],
        },
      }),
    ).toEqual([
      {
        id: "req-1",
        label: "Return a working localhost URL",
        status: "passed",
        notes: "Confirmed in runtime evidence.",
      },
      {
        id: "req-2",
        label: "Validate the interactive flow",
        status: "failed",
        notes: "The preview URL works, but the interactive flow still breaks.",
      },
    ]);
  });

  it("truncates oversized review content", () => {
    expect(truncateForReview("abcdef", 3)).toBe("abc\n...[truncated]");
  });

  it("extracts local preview candidates without surfacing source files or image assets", () => {
    const candidates = extractEmbeddedBrowserPresentationCandidates({
      agentReport:
        "Run the website with bun dev and open http://localhost:4173/ai-explainer or /microsites/ai. Do not use /Users/christophe/project/src/index.tsx.",
      diffPatch: "+++ b/apps/server/src/microsites.ts\n+ route('/microsites/ai')\n",
      workLogEntries: [
        {
          label: "Ran command",
          createdAt: "2026-04-01T00:00:01.000Z",
          tone: "tool",
          detail: "Local: http://localhost:4173/ai-explainer",
        },
      ],
      fileSnapshots: [
        { path: "apps/server/src/microsites.ts", contents: 'app.get("/microsites/ai", fn)' },
        { path: "apps/web/public/logo.png", contents: "" },
      ],
    });

    expect(candidates).toEqual([
      {
        source: "agent report",
        title: "Ai Explainer Preview",
        url: "http://localhost:4173/ai-explainer",
      },
      {
        source: "agent report",
        title: "Ai Preview",
        url: "/microsites/ai",
      },
    ]);
  });

  it("requires browser validation for website and game requests", () => {
    expect(
      shouldRequireBrowserValidation(
        "Create an interactive browser game on a web server and return the local URL.",
      ),
    ).toBe(true);
    expect(shouldRequireBrowserValidation("Refactor the queue service and add tests.")).toBe(false);
  });

  it("prefers localhost runtime evidence as the browser validation candidate", () => {
    expect(
      selectBrowserValidationCandidate([
        {
          source: "agent report",
          title: "Fallback Preview",
          url: "/learn-ai",
        },
        {
          source: "runtime evidence 1",
          title: "Live Preview",
          url: "http://localhost:3333",
        },
      ]),
    ).toEqual({
      source: "runtime evidence 1",
      title: "Live Preview",
      url: "http://localhost:3333",
    });
  });

  it("builds a browser validation prompt with visible targets", () => {
    const prompt = buildBrowserValidationUserPrompt({
      userRequest: "Create an interactive tic tac toe game and return the URL.",
      delegatedInstruction: "Build the game.",
      agentReport: "Server running at http://localhost:3333.",
      previewUrl: "http://localhost:3333",
      requirementsChecklist: [
        {
          id: "req-1",
          label: "The game board is visible",
          status: "pending",
          notes: null,
        },
      ],
      previousSteps: [
        {
          index: 1,
          actionSummary: "Opened the page",
          url: "http://localhost:3333",
          title: "Tic Tac Toe",
        },
      ],
      observation: {
        sessionId: "browser-session-1",
        url: "http://localhost:3333",
        title: "Tic Tac Toe",
        readyState: "complete",
        textSummary: "X's turn. Score 0 0 0.",
        targets: [
          {
            id: "target-1",
            role: "button",
            tagName: "button",
            text: "Play Again",
            disabled: false,
            x: 10,
            y: 10,
            width: 100,
            height: 40,
          },
        ],
        observedAt: "2026-04-01T00:00:00.000Z",
      },
    });

    expect(prompt).toContain("Current browser observation:");
    expect(prompt).toContain("Requirements checklist:");
    expect(prompt).toContain("[pending] The game board is visible");
    expect(prompt).toContain("target-1");
    expect(prompt).toContain('text="Play Again"');
  });

  it("parses browser validation actions using only known target ids", () => {
    expect(
      parseBrowserValidationPlannerAction(
        '{"action":{"kind":"click","targetId":"target-1"},"reason":"Open the main interaction."}',
        { availableTargetIds: ["target-1", "target-2"] },
      ),
    ).toEqual({
      kind: "execute",
      action: { kind: "click", targetId: "target-1" },
      reason: "Open the main interaction.",
    });

    expect(
      parseBrowserValidationPlannerAction(
        '{"action":{"kind":"finish","ready":false,"summary":"The board never appeared.","missingRequirements":["Render the game board."]}}',
        { availableTargetIds: [] },
      ),
    ).toEqual({
      kind: "finish",
      ready: false,
      summary: "The board never appeared.",
      missingRequirements: ["Render the game board."],
      checklistUpdates: {},
    });
  });

  it("normalizes browser validation keypress aliases", () => {
    expect(
      parseBrowserValidationPlannerAction('{"action":{"kind":"press","key":"left arrow"}}', {
        availableTargetIds: [],
      }),
    ).toEqual({
      kind: "execute",
      action: { kind: "press", key: "ArrowLeft" },
      reason: null,
    });

    expect(
      parseBrowserValidationPlannerAction('{"action":{"kind":"press","keyName":"spacebar"}}', {
        availableTargetIds: [],
      }),
    ).toEqual({
      kind: "execute",
      action: { kind: "press", key: "Space" },
      reason: null,
    });

    expect(
      parseBrowserValidationPlannerAction('{"action":{"kind":"press","text":"A key"}}', {
        availableTargetIds: [],
      }),
    ).toEqual({
      kind: "execute",
      action: { kind: "press", key: "a" },
      reason: null,
    });
  });

  it("formats browser validation action labels from the observed targets", () => {
    expect(
      formatBrowserValidationActionSummary({
        action: { kind: "click", targetId: "target-1" },
        reason: "Start the game loop.",
        observation: {
          sessionId: "browser-session-1",
          url: "http://localhost:3333",
          title: "Tic Tac Toe",
          readyState: "complete",
          textSummary: "Ready.",
          targets: [
            {
              id: "target-1",
              role: "button",
              tagName: "button",
              label: "New Game",
              disabled: false,
              x: 0,
              y: 0,
              width: 40,
              height: 40,
            },
          ],
          observedAt: "2026-04-01T00:00:00.000Z",
        },
      }),
    ).toBe("Click New Game. Start the game loop.");
  });

  it("reconstructs orchestrator history from a managed thread when no transcript was saved", () => {
    const thread = makeThread({
      title:
        "Create a sub directory here on a single page website explaining visually how crypto works",
      messages: [
        makeUserMessage(
          "user-1",
          [
            "Add standalone crypto explainer microsite",
            "",
            "When you reply, include a detailed implementation report with these exact sections:",
            "1. Completed work",
            "2. Files created, edited, or deleted",
            "3. Validation and commands run",
          ].join("\n"),
          TurnId.makeUnsafe("turn-1"),
        ),
        makeAssistantMessage(
          "assistant-1",
          [
            "1. Completed work",
            "2. Files created, edited, or deleted",
            "3. Validation and commands run",
          ].join("\n"),
          TurnId.makeUnsafe("turn-1"),
        ),
      ],
    });

    expect(buildRecoveredOrchestratorMessages(thread)).toEqual([
      {
        role: "user",
        content:
          "Create a sub directory here on a single page website explaining visually how crypto works",
        timestamp: "2026-04-01T00:00:00.000Z",
      },
      {
        role: "thinking",
        content:
          "Recovered this orchestrator timeline from the managed agent thread because no saved orchestrator transcript was available for this thread.",
        timestamp: "2026-04-01T00:00:00.000Z",
      },
      {
        role: "orchestrator",
        content: [
          "Add standalone crypto explainer microsite",
          "",
          "When you reply, include a detailed implementation report with these exact sections:",
          "1. Completed work",
          "2. Files created, edited, or deleted",
          "3. Validation and commands run",
        ].join("\n"),
        timestamp: "2026-04-01T00:00:00.000Z",
      },
      {
        role: "agent-result",
        content: [
          "1. Completed work",
          "2. Files created, edited, or deleted",
          "3. Validation and commands run",
        ].join("\n"),
        timestamp: "2026-04-01T00:00:00.000Z",
      },
    ]);
  });

  it("prefers the draft conversation when the user starts a new orchestrator chat", () => {
    expect(
      resolveOrchestratorConversationThreadId({
        routeThreadId: ThreadId.makeUnsafe("thread-open"),
        pendingCreatedThreadId: null,
        preferDraftConversation: true,
        draftThreadId: ThreadId.makeUnsafe("__draft__"),
      }),
    ).toBe("__draft__");
  });

  it("uses the pending created thread once a draft conversation has spawned one", () => {
    expect(
      resolveOrchestratorConversationThreadId({
        routeThreadId: ThreadId.makeUnsafe("thread-open"),
        pendingCreatedThreadId: ThreadId.makeUnsafe("thread-created"),
        preferDraftConversation: true,
        draftThreadId: ThreadId.makeUnsafe("__draft__"),
      }),
    ).toBe("thread-created");
  });
});

function makeThread(overrides: Partial<Thread>): Thread {
  return {
    id: ThreadId.makeUnsafe("thread-1"),
    codexThreadId: null,
    projectId: ProjectId.makeUnsafe("project-1"),
    title: "Thread",
    modelSelection: { provider: "codex", model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    session: null,
    messages: [],
    proposedPlans: [],
    error: null,
    createdAt: "2026-04-01T00:00:00.000Z",
    archivedAt: null,
    updatedAt: "2026-04-01T00:00:00.000Z",
    latestTurn: null,
    branch: null,
    worktreePath: null,
    turnDiffSummaries: [],
    activities: [],
    ...overrides,
  };
}

function makeAssistantMessage(id: string, text: string, turnId: TurnId) {
  return {
    id: MessageId.makeUnsafe(id),
    role: "assistant" as const,
    text,
    turnId,
    createdAt: "2026-04-01T00:00:00.000Z",
    streaming: false,
  };
}

function makeUserMessage(id: string, text: string, turnId: TurnId) {
  return {
    id: MessageId.makeUnsafe(id),
    role: "user" as const,
    text,
    turnId,
    createdAt: "2026-04-01T00:00:00.000Z",
    streaming: false,
  };
}
