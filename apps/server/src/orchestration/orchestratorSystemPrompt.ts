/**
 * OrchestratorSystemPrompt - Builds the full system prompt for the orchestrator LLM.
 *
 * Reads `docs/ORCHESTRATOR.md` fresh from disk on each invocation (no caching)
 * and appends structured tool definitions for all 38 orchestrator tools.
 *
 * @module OrchestratorSystemPrompt
 */
import { Effect } from "effect";
import * as fs from "node:fs/promises";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Tool definition types
// ---------------------------------------------------------------------------

interface ToolParam {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly description: string;
}

interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: ReadonlyArray<ToolParam>;
}

// ---------------------------------------------------------------------------
// Tool catalogue (38 tools)
// ---------------------------------------------------------------------------

const TOOL_DEFINITIONS: ReadonlyArray<ToolDefinition> = [
  // -- Agent lifecycle (8) --------------------------------------------------
  {
    name: "spawn_agent",
    description: "Spawn a new worker agent. Assigns it a task, model, and optional worktree.",
    parameters: [
      {
        name: "task_id",
        type: "string",
        required: true,
        description: "Task to assign to the new agent.",
      },
      {
        name: "model",
        type: "string",
        required: false,
        description: "Model override (default: policy-selected).",
      },
      {
        name: "mode",
        type: '"foreground" | "background"',
        required: false,
        description: 'Panel visibility mode. Default "background".',
      },
      {
        name: "worktree",
        type: "string",
        required: false,
        description: "Git worktree path to isolate writes.",
      },
    ],
  },
  {
    name: "terminate_agent",
    description: "Terminate a running agent and release its resources.",
    parameters: [
      { name: "agent_id", type: "string", required: true, description: "Agent to terminate." },
      { name: "reason", type: "string", required: false, description: "Reason for termination." },
    ],
  },
  {
    name: "restart_agent",
    description: "Restart a failed or stuck agent, optionally with a different model.",
    parameters: [
      { name: "agent_id", type: "string", required: true, description: "Agent to restart." },
      { name: "model", type: "string", required: false, description: "New model override." },
    ],
  },
  {
    name: "clone_agent",
    description: "Clone an agent's context into a new agent for parallel exploration.",
    parameters: [
      {
        name: "source_agent_id",
        type: "string",
        required: true,
        description: "Agent to clone from.",
      },
      { name: "task_id", type: "string", required: true, description: "New task for the clone." },
    ],
  },
  {
    name: "pause_agent",
    description: "Pause a running agent, preserving its state for later resume.",
    parameters: [
      { name: "agent_id", type: "string", required: true, description: "Agent to pause." },
    ],
  },
  {
    name: "resume_agent",
    description: "Resume a previously paused agent.",
    parameters: [
      { name: "agent_id", type: "string", required: true, description: "Agent to resume." },
    ],
  },
  {
    name: "promote_to_foreground",
    description: "Move a background agent to a visible foreground panel.",
    parameters: [
      { name: "agent_id", type: "string", required: true, description: "Agent to promote." },
    ],
  },
  {
    name: "demote_to_background",
    description: "Move a foreground agent to background, freeing panel space.",
    parameters: [
      { name: "agent_id", type: "string", required: true, description: "Agent to demote." },
    ],
  },

  // -- Communication (5) ----------------------------------------------------
  {
    name: "send_to_agent",
    description: "Send a message or instruction to a specific agent.",
    parameters: [
      { name: "agent_id", type: "string", required: true, description: "Target agent." },
      { name: "message", type: "string", required: true, description: "Message content." },
    ],
  },
  {
    name: "broadcast",
    description: "Broadcast a message to all active agents.",
    parameters: [
      { name: "message", type: "string", required: true, description: "Broadcast content." },
      {
        name: "filter_mode",
        type: '"foreground" | "background" | "all"',
        required: false,
        description: 'Limit recipients. Default "all".',
      },
    ],
  },
  {
    name: "transfer_context",
    description:
      "Transfer relevant context (files, conversation excerpt) from one agent to another.",
    parameters: [
      { name: "from_agent_id", type: "string", required: true, description: "Source agent." },
      { name: "to_agent_id", type: "string", required: true, description: "Destination agent." },
      {
        name: "context_keys",
        type: "string[]",
        required: false,
        description: "Specific context keys to transfer.",
      },
    ],
  },
  {
    name: "ask_agent",
    description: "Ask an agent a question and wait for a structured response.",
    parameters: [
      { name: "agent_id", type: "string", required: true, description: "Agent to query." },
      { name: "question", type: "string", required: true, description: "Question to ask." },
      {
        name: "timeout_ms",
        type: "number",
        required: false,
        description: "Max wait time in ms. Default 30000.",
      },
    ],
  },
  {
    name: "share_file",
    description: "Share a file path with an agent, adding it to their read scope.",
    parameters: [
      { name: "agent_id", type: "string", required: true, description: "Target agent." },
      {
        name: "file_path",
        type: "string",
        required: true,
        description: "Absolute file path to share.",
      },
    ],
  },

  // -- Observation (6) ------------------------------------------------------
  {
    name: "get_agent_status",
    description: "Get the current status of a specific agent (state, task, progress).",
    parameters: [
      { name: "agent_id", type: "string", required: true, description: "Agent to query." },
    ],
  },
  {
    name: "get_all_status",
    description: "Get a summary of all active agents with their states and tasks.",
    parameters: [],
  },
  {
    name: "get_agent_diff",
    description: "Get the current working diff produced by an agent.",
    parameters: [
      { name: "agent_id", type: "string", required: true, description: "Agent to query." },
    ],
  },
  {
    name: "get_agent_logs",
    description: "Get recent log output from an agent's session.",
    parameters: [
      { name: "agent_id", type: "string", required: true, description: "Agent to query." },
      {
        name: "tail",
        type: "number",
        required: false,
        description: "Number of recent lines. Default 50.",
      },
    ],
  },
  {
    name: "get_background_results",
    description: "Collect completed results from all background agents.",
    parameters: [
      {
        name: "include_pending",
        type: "boolean",
        required: false,
        description: "Include in-progress agents. Default false.",
      },
    ],
  },
  {
    name: "get_spawn_tree",
    description: "Get the full agent spawn tree showing parent-child relationships.",
    parameters: [],
  },

  // -- Coordination (5) -----------------------------------------------------
  {
    name: "wait_agent",
    description: "Block until a specific agent completes its current task.",
    parameters: [
      { name: "agent_id", type: "string", required: true, description: "Agent to wait for." },
      {
        name: "timeout_ms",
        type: "number",
        required: false,
        description: "Max wait time in ms. Default 300000.",
      },
    ],
  },
  {
    name: "wait_all",
    description: "Block until all specified agents complete.",
    parameters: [
      { name: "agent_ids", type: "string[]", required: true, description: "Agents to wait for." },
      {
        name: "timeout_ms",
        type: "number",
        required: false,
        description: "Max wait time in ms. Default 600000.",
      },
    ],
  },
  {
    name: "set_dependency",
    description: "Declare that one task depends on another, enforcing execution order.",
    parameters: [
      { name: "task_id", type: "string", required: true, description: "Dependent task." },
      { name: "depends_on", type: "string", required: true, description: "Prerequisite task ID." },
    ],
  },
  {
    name: "merge_work",
    description: "Merge the output of one agent's worktree into another's or into main.",
    parameters: [
      {
        name: "source_agent_id",
        type: "string",
        required: true,
        description: "Agent whose work to merge.",
      },
      {
        name: "target",
        type: "string",
        required: false,
        description: 'Target agent ID or "main". Default "main".',
      },
    ],
  },
  {
    name: "set_spawn_budget",
    description: "Update the spawn budget for the current orchestration run.",
    parameters: [
      {
        name: "max_foreground",
        type: "number",
        required: false,
        description: "Max foreground agents.",
      },
      {
        name: "max_background",
        type: "number",
        required: false,
        description: "Max background agents.",
      },
      { name: "max_total", type: "number", required: false, description: "Max total workers." },
    ],
  },

  // -- Review (5) -----------------------------------------------------------
  {
    name: "review_agent_work",
    description:
      "Initiate a structured review of an agent's submitted work against acceptance criteria.",
    parameters: [
      {
        name: "agent_id",
        type: "string",
        required: true,
        description: "Agent whose work to review.",
      },
      {
        name: "criteria",
        type: "string[]",
        required: false,
        description: "Override acceptance criteria.",
      },
    ],
  },
  {
    name: "run_tests",
    description: "Run the project test suite or a subset of tests as a quality gate.",
    parameters: [
      { name: "filter", type: "string", required: false, description: "Test name filter pattern." },
      {
        name: "timeout_ms",
        type: "number",
        required: false,
        description: "Max test run time. Default 120000.",
      },
    ],
  },
  {
    name: "accept_work",
    description: "Accept an agent's submitted work, marking the task as complete.",
    parameters: [
      {
        name: "agent_id",
        type: "string",
        required: true,
        description: "Agent whose work to accept.",
      },
      {
        name: "evidence",
        type: "string[]",
        required: false,
        description: "Evidence references (screenshots, test output).",
      },
    ],
  },
  {
    name: "reject_work",
    description: "Reject an agent's submitted work with specific rework instructions.",
    parameters: [
      {
        name: "agent_id",
        type: "string",
        required: true,
        description: "Agent whose work to reject.",
      },
      {
        name: "reasons",
        type: "string[]",
        required: true,
        description: "Specific failure reasons.",
      },
      {
        name: "instructions",
        type: "string",
        required: false,
        description: "Rework instructions.",
      },
    ],
  },
  {
    name: "request_revision",
    description: "Request targeted revisions without full rejection.",
    parameters: [
      {
        name: "agent_id",
        type: "string",
        required: true,
        description: "Agent to request revisions from.",
      },
      {
        name: "revisions",
        type: "string[]",
        required: true,
        description: "Specific revision requests.",
      },
    ],
  },

  // -- UI / Panel management (6) --------------------------------------------
  {
    name: "focus_agent",
    description: "Bring an agent's panel into focus in the UI.",
    parameters: [
      { name: "agent_id", type: "string", required: true, description: "Agent to focus." },
    ],
  },
  {
    name: "arrange_panels",
    description: "Set the panel layout arrangement in the UI.",
    parameters: [
      {
        name: "layout",
        type: '"split" | "stacked" | "tabs"',
        required: true,
        description: "Layout mode.",
      },
    ],
  },
  {
    name: "promote_panel",
    description: "Expand an agent's panel to full width.",
    parameters: [
      {
        name: "agent_id",
        type: "string",
        required: true,
        description: "Agent whose panel to expand.",
      },
    ],
  },
  {
    name: "collapse_panel",
    description: "Collapse an agent's panel to minimal size.",
    parameters: [
      {
        name: "agent_id",
        type: "string",
        required: true,
        description: "Agent whose panel to collapse.",
      },
    ],
  },
  {
    name: "open_diff_view",
    description: "Open a diff view comparing an agent's changes against the base.",
    parameters: [
      {
        name: "agent_id",
        type: "string",
        required: true,
        description: "Agent whose diff to view.",
      },
    ],
  },
  {
    name: "open_browser_preview",
    description: "Open the embedded browser preview for visual validation.",
    parameters: [
      { name: "url", type: "string", required: true, description: "Preview URL to open." },
    ],
  },

  // -- Configuration (3) ----------------------------------------------------
  {
    name: "assign_worktree",
    description: "Assign a dedicated git worktree to an agent for isolated writes.",
    parameters: [
      {
        name: "agent_id",
        type: "string",
        required: true,
        description: "Agent to assign worktree to.",
      },
      {
        name: "branch",
        type: "string",
        required: false,
        description: "Branch name. Auto-generated if omitted.",
      },
    ],
  },
  {
    name: "set_model",
    description: "Change the model used by a running agent.",
    parameters: [
      { name: "agent_id", type: "string", required: true, description: "Agent to reconfigure." },
      { name: "model", type: "string", required: true, description: "New model identifier." },
    ],
  },
  {
    name: "set_scope",
    description: "Set or update the read/write scope for an agent.",
    parameters: [
      { name: "agent_id", type: "string", required: true, description: "Agent to configure." },
      { name: "read_scope", type: "string[]", required: false, description: "Allowed read paths." },
      {
        name: "write_scope",
        type: "string[]",
        required: false,
        description: "Allowed write paths.",
      },
    ],
  },
  {
    name: "restrict_scope",
    description: "Narrow an agent's existing scope without replacing it entirely.",
    parameters: [
      { name: "agent_id", type: "string", required: true, description: "Agent to restrict." },
      {
        name: "deny_paths",
        type: "string[]",
        required: true,
        description: "Paths to remove from scope.",
      },
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// Prompt rendering helpers
// ---------------------------------------------------------------------------

function renderToolDefinition(tool: ToolDefinition): string {
  const paramLines = tool.parameters.map((p) => {
    const req = p.required ? "required" : "optional";
    return `    - ${p.name} (${p.type}, ${req}): ${p.description}`;
  });

  const paramBlock =
    paramLines.length > 0 ? `  Parameters:\n${paramLines.join("\n")}` : "  Parameters: none";

  return `- **${tool.name}**: ${tool.description}\n${paramBlock}`;
}

function renderAllToolDefinitions(): string {
  const sections: Array<{ heading: string; tools: ReadonlyArray<ToolDefinition> }> = [
    { heading: "Agent Lifecycle", tools: TOOL_DEFINITIONS.slice(0, 8) },
    { heading: "Communication", tools: TOOL_DEFINITIONS.slice(8, 13) },
    { heading: "Observation", tools: TOOL_DEFINITIONS.slice(13, 19) },
    { heading: "Coordination", tools: TOOL_DEFINITIONS.slice(19, 24) },
    { heading: "Review", tools: TOOL_DEFINITIONS.slice(24, 29) },
    { heading: "UI / Panel Management", tools: TOOL_DEFINITIONS.slice(29, 35) },
    { heading: "Configuration", tools: TOOL_DEFINITIONS.slice(35, 38) },
  ];

  const rendered = sections.map(
    (s) => `### ${s.heading}\n\n${s.tools.map(renderToolDefinition).join("\n\n")}`,
  );

  return `## Available Tools (${TOOL_DEFINITIONS.length} total)\n\n${rendered.join("\n\n")}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return the rendered tool definitions block (no disk I/O required).
 *
 * Useful for injecting orchestration tool awareness into developer instructions
 * without needing the full ORCHESTRATOR.md content.
 */
export function renderOrchestratorToolDefinitions(): string {
  return renderAllToolDefinitions();
}

/**
 * Build the full orchestrator system prompt.
 *
 * Reads `docs/ORCHESTRATOR.md` fresh from disk (no caching) and appends
 * structured tool definitions for all 38 orchestrator tools.
 *
 * @param opts.projectRoot - Absolute path to the repository root (where `docs/` lives).
 * @returns An Effect producing the complete system prompt string.
 */
export function buildOrchestratorSystemPrompt({
  projectRoot,
}: {
  readonly projectRoot: string;
}): Effect.Effect<string, Error> {
  return Effect.gen(function* () {
    const mdPath = path.join(projectRoot, "docs", "ORCHESTRATOR.md");

    const orchestratorMd = yield* Effect.tryPromise({
      try: () => fs.readFile(mdPath, "utf-8"),
      catch: (err) =>
        new Error(
          `Failed to read ORCHESTRATOR.md at ${mdPath}: ${err instanceof Error ? err.message : String(err)}`,
        ),
    });

    const toolBlock = renderAllToolDefinitions();

    return [orchestratorMd.trimEnd(), "", toolBlock, ""].join("\n");
  });
}
