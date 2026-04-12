// FILE: pluginFilesystemDiscovery.ts
// Purpose: Authoritative plugin and skill discovery by scanning the filesystem.
//          This is how Claude Code itself discovers installed plugins — there is
//          no public `plugin/list` JSON-RPC method, so we read the same sources
//          of truth (settings.json, installed_plugins.json, plugin caches) that
//          the CLI reads.
// Layer: Provider discovery

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import type {
  ProviderListPluginsResult,
  ProviderListSkillsResult,
  ProviderPluginDescriptor,
  ProviderPluginMarketplaceDescriptor,
  ProviderSkillDescriptor,
} from "@t3tools/contracts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InstalledPluginEntry {
  scope: "user" | "project" | "local";
  projectPath?: string;
  installPath: string;
  version: string;
}

interface InstalledPluginsManifest {
  version: number;
  plugins: Record<string, InstalledPluginEntry[]>;
}

interface ClaudeSettingsFile {
  enabledPlugins?: Record<string, boolean>;
}

interface PluginManifest {
  name?: string;
  description?: string;
  version?: string;
  author?: { name?: string; email?: string } | string;
  homepage?: string;
  keywords?: string[];
}

interface MarketplaceManifest {
  name?: string;
  plugins?: Array<{
    name?: string;
    description?: string;
    category?: string;
    source?: unknown;
  }>;
}

// ---------------------------------------------------------------------------
// YAML frontmatter parser (minimal — handles the SKILL.md subset)
// ---------------------------------------------------------------------------

function parseFrontmatter(content: string): Record<string, string> {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") return {};

  const result: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trim() === "---") break;

    const colonIndex = line.indexOf(":");
    if (colonIndex < 0) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    // Strip matching quotes (single or double).
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }

    if (key) result[key] = value;
  }
  return result;
}

function safeReadJson<T>(filePath: string): T | null {
  try {
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

function safeReadText(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function safeListDir(dirPath: string): string[] {
  try {
    if (!existsSync(dirPath)) return [];
    const stat = statSync(dirPath);
    if (!stat.isDirectory()) return [];
    return readdirSync(dirPath);
  } catch {
    return [];
  }
}

function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Claude Code discovery
// ---------------------------------------------------------------------------

function claudeHomeDir(): string {
  return path.join(homedir(), ".claude");
}

/**
 * Read enabled plugin ids from user settings + project settings (if cwd provided).
 * Returns a Set of "name@marketplace" keys.
 */
function readEnabledClaudePluginIds(cwd: string | null): Set<string> {
  const enabled = new Set<string>();

  const candidates = [
    path.join(claudeHomeDir(), "settings.json"),
    ...(cwd
      ? [
          path.join(cwd, ".claude", "settings.json"),
          path.join(cwd, ".claude", "settings.local.json"),
        ]
      : []),
  ];

  for (const file of candidates) {
    const settings = safeReadJson<ClaudeSettingsFile>(file);
    if (!settings?.enabledPlugins) continue;
    for (const [pluginId, isEnabled] of Object.entries(settings.enabledPlugins)) {
      if (isEnabled) enabled.add(pluginId);
    }
  }

  return enabled;
}

/**
 * Read the installed_plugins.json manifest which maps plugin IDs to their
 * actual cache install paths.
 */
function readClaudeInstalledManifest(): InstalledPluginsManifest | null {
  return safeReadJson<InstalledPluginsManifest>(
    path.join(claudeHomeDir(), "plugins", "installed_plugins.json"),
  );
}

/**
 * Walk a plugin's skills directory and return skill descriptors.
 * Plugins can expose skills in two shapes:
 *  1. `<plugin>/skills/<name>/SKILL.md` (multi-skill plugin)
 *  2. `<plugin>/skills/<name>.md` (rare; legacy)
 *  3. For single-skill plugins, a top-level SKILL.md in the plugin root
 */
function scanPluginSkills(pluginPath: string, pluginName: string): ProviderSkillDescriptor[] {
  const skills: ProviderSkillDescriptor[] = [];

  // Top-level SKILL.md (single-skill plugins like frontend-design)
  const topLevel = path.join(pluginPath, "SKILL.md");
  if (existsSync(topLevel)) {
    const content = safeReadText(topLevel);
    if (content) {
      const meta = parseFrontmatter(content);
      skills.push({
        name: meta.name || pluginName,
        description: meta.description,
        path: topLevel,
        enabled: true,
        scope: pluginName,
        interface: {
          displayName: meta.name || pluginName,
          shortDescription: meta.description,
        },
      });
    }
  }

  // Multi-skill plugins use a skills/ directory
  const skillsDir = path.join(pluginPath, "skills");
  for (const entry of safeListDir(skillsDir)) {
    const entryPath = path.join(skillsDir, entry);
    let skillFile: string | null = null;

    if (isDirectory(entryPath)) {
      const candidate = path.join(entryPath, "SKILL.md");
      if (existsSync(candidate)) skillFile = candidate;
    } else if (entry.endsWith(".md")) {
      skillFile = entryPath;
    }

    if (!skillFile) continue;
    const content = safeReadText(skillFile);
    if (!content) continue;

    const meta = parseFrontmatter(content);
    const fallbackName = entry.replace(/\.md$/, "");
    skills.push({
      name: meta.name || fallbackName,
      description: meta.description,
      path: skillFile,
      enabled: true,
      scope: pluginName,
      interface: {
        displayName: meta.name || fallbackName,
        shortDescription: meta.description,
      },
    });
  }

  return skills;
}

function parsePluginId(pluginId: string): { name: string; marketplace: string } {
  const atIndex = pluginId.lastIndexOf("@");
  if (atIndex < 0) return { name: pluginId, marketplace: "unknown" };
  return {
    name: pluginId.slice(0, atIndex),
    marketplace: pluginId.slice(atIndex + 1),
  };
}

function readPluginManifest(pluginPath: string): PluginManifest | null {
  return safeReadJson<PluginManifest>(path.join(pluginPath, ".claude-plugin", "plugin.json"));
}

function descriptorFromInstalledPlugin(
  pluginId: string,
  entry: InstalledPluginEntry,
  installed: boolean,
): ProviderPluginDescriptor | null {
  const manifest = readPluginManifest(entry.installPath);
  const { name } = parsePluginId(pluginId);
  const displayName = manifest?.name || name;

  return {
    id: pluginId,
    name,
    source: { type: "local" as const, path: entry.installPath },
    installed,
    enabled: installed,
    installPolicy: installed ? "INSTALLED_BY_DEFAULT" : "AVAILABLE",
    authPolicy: "ON_USE",
    interface: {
      displayName,
      shortDescription: manifest?.description,
      developerName:
        typeof manifest?.author === "string" ? manifest.author : manifest?.author?.name,
      category: inferCategory(name),
    },
  };
}

function inferCategory(pluginName: string): string {
  if (pluginName.endsWith("-lsp")) return "Language Servers";
  if (pluginName.includes("review") || pluginName.includes("simplifier")) return "Code Quality";
  if (pluginName.includes("security")) return "Security";
  if (pluginName.includes("output-style")) return "Output Style";
  if (pluginName === "math-olympiad") return "Specialty";
  if (
    pluginName === "agent-sdk-dev" ||
    pluginName === "plugin-dev" ||
    pluginName === "skill-creator" ||
    pluginName === "mcp-server-dev"
  )
    return "Development Workflows";
  if (pluginName === "feature-dev" || pluginName === "superpowers") return "Development Workflows";
  if (pluginName === "frontend-design") return "Frontend";
  if (pluginName === "commit-commands") return "Git Workflow";
  if (pluginName === "hookify") return "Automation";
  if (pluginName === "playground" || pluginName === "example-plugin") return "Development";
  if (pluginName === "session-report" || pluginName === "claude-code-setup") return "Productivity";
  if (pluginName === "claude-md-management") return "Productivity";
  if (pluginName === "ralph-loop") return "Development Workflows";
  return "Development";
}

/**
 * Scan the marketplace catalog for plugins available but not installed.
 * These show up in the UI so users know what's in the marketplace.
 */
function scanClaudeMarketplaceCatalog(installedIds: Set<string>): ProviderPluginDescriptor[] {
  const marketplacesDir = path.join(claudeHomeDir(), "plugins", "marketplaces");
  const descriptors: ProviderPluginDescriptor[] = [];

  for (const marketplaceName of safeListDir(marketplacesDir)) {
    const marketplacePath = path.join(marketplacesDir, marketplaceName);
    if (!isDirectory(marketplacePath)) continue;

    const pluginsDir = path.join(marketplacePath, "plugins");
    for (const pluginDir of safeListDir(pluginsDir)) {
      const pluginPath = path.join(pluginsDir, pluginDir);
      if (!isDirectory(pluginPath)) continue;

      const pluginId = `${pluginDir}@${marketplaceName}`;
      if (installedIds.has(pluginId)) continue; // already added as installed

      const manifest = readPluginManifest(pluginPath);
      descriptors.push({
        id: pluginId,
        name: pluginDir,
        source: { type: "local" as const, path: pluginPath },
        installed: false,
        enabled: false,
        installPolicy: "AVAILABLE",
        authPolicy: "ON_USE",
        interface: {
          displayName: manifest?.name || pluginDir,
          shortDescription: manifest?.description,
          category: inferCategory(pluginDir),
          developerName:
            typeof manifest?.author === "string" ? manifest.author : manifest?.author?.name,
        },
      });
    }
  }

  return descriptors;
}

/**
 * Full Claude plugin discovery. Reads installed plugins + marketplace catalog.
 */
export function discoverClaudePlugins(cwd: string | null): ProviderListPluginsResult {
  const enabledIds = readEnabledClaudePluginIds(cwd);
  const installed = readClaudeInstalledManifest();

  const installedDescriptors: ProviderPluginDescriptor[] = [];
  const installedIds = new Set<string>();

  if (installed?.plugins) {
    for (const [pluginId, entries] of Object.entries(installed.plugins)) {
      // Pick the highest-priority entry: user scope first, then project, then local
      const entry = [...entries].sort((a, b) => scopeRank(a.scope) - scopeRank(b.scope))[0];
      if (!entry) continue;

      const isInstalled = enabledIds.has(pluginId);
      const descriptor = descriptorFromInstalledPlugin(pluginId, entry, isInstalled);
      if (descriptor) {
        installedDescriptors.push(descriptor);
        installedIds.add(pluginId);
      }
    }
  }

  const availableDescriptors = scanClaudeMarketplaceCatalog(installedIds);

  const allPlugins = [...installedDescriptors, ...availableDescriptors];

  return {
    marketplaces: [
      {
        name: "claude-plugins-official",
        path: path.join(claudeHomeDir(), "plugins", "marketplaces", "claude-plugins-official"),
        interface: { displayName: "Claude Plugins" },
        plugins: allPlugins,
      } satisfies ProviderPluginMarketplaceDescriptor,
    ],
    marketplaceLoadErrors: [],
    remoteSyncError: null,
    featuredPluginIds: Array.from(enabledIds),
    source: "filesystem",
    cached: false,
  };
}

function scopeRank(scope: InstalledPluginEntry["scope"]): number {
  if (scope === "user") return 0;
  if (scope === "project") return 1;
  return 2;
}

/**
 * Scan all skills from installed Claude plugins.
 */
export function discoverClaudeSkills(cwd: string | null): ProviderListSkillsResult {
  const enabledIds = readEnabledClaudePluginIds(cwd);
  const installed = readClaudeInstalledManifest();
  const allSkills: ProviderSkillDescriptor[] = [];

  if (installed?.plugins) {
    for (const [pluginId, entries] of Object.entries(installed.plugins)) {
      // Only scan plugins that are actually enabled
      if (!enabledIds.has(pluginId)) continue;
      const entry = [...entries].sort((a, b) => scopeRank(a.scope) - scopeRank(b.scope))[0];
      if (!entry) continue;

      const { name } = parsePluginId(pluginId);
      const skills = scanPluginSkills(entry.installPath, name);
      allSkills.push(...skills);
    }
  }

  return {
    skills: allSkills,
    source: "filesystem",
    cached: false,
  };
}

// ---------------------------------------------------------------------------
// Codex discovery
// ---------------------------------------------------------------------------

function codexSkillsDirectories(cwd: string | null): string[] {
  const dirs = [
    // User scope
    path.join(homedir(), ".codex", "skills", ".system"),
    path.join(homedir(), ".codex", "skills", ".curated"),
    path.join(homedir(), ".codex", "skills", ".experimental"),
    path.join(homedir(), ".agents", "skills"),
    // Vendored skills (cloned from openai/skills or similar)
    path.join(homedir(), ".codex", "vendor_imports", "skills", "skills", ".system"),
    path.join(homedir(), ".codex", "vendor_imports", "skills", "skills", ".curated"),
    path.join(homedir(), ".codex", "vendor_imports", "skills", "skills", ".experimental"),
  ];
  if (cwd) {
    dirs.push(path.join(cwd, ".codex", "skills"));
    dirs.push(path.join(cwd, ".agents", "skills"));
  }
  return dirs;
}

function scanCodexSkillsDirectory(baseDir: string): ProviderSkillDescriptor[] {
  const skills: ProviderSkillDescriptor[] = [];

  for (const entry of safeListDir(baseDir)) {
    const entryPath = path.join(baseDir, entry);
    let skillFile: string | null = null;
    let skillName = entry;

    if (isDirectory(entryPath)) {
      const candidate = path.join(entryPath, "SKILL.md");
      if (existsSync(candidate)) skillFile = candidate;
    } else if (entry.endsWith(".md")) {
      skillFile = entryPath;
      skillName = entry.replace(/\.md$/, "");
    }

    if (!skillFile) continue;
    const content = safeReadText(skillFile);
    if (!content) continue;

    const meta = parseFrontmatter(content);
    skills.push({
      name: meta.name || skillName,
      description: meta.description,
      path: skillFile,
      enabled: true,
      scope: path.basename(baseDir),
      interface: {
        displayName: meta.name || skillName,
        shortDescription: meta.description,
      },
    });
  }

  return skills;
}

// Company integration skills to exclude per user preference.
const CODEX_COMPANY_SKILL_PREFIXES = [
  "figma",
  "linear",
  "notion",
  "sentry",
  "netlify",
  "vercel",
  "cloudflare",
  "render",
  "gh-",
];

function isCompanyIntegrationSkill(name: string): boolean {
  const lower = name.toLowerCase();
  return CODEX_COMPANY_SKILL_PREFIXES.some(
    (prefix) => lower === prefix || lower.startsWith(`${prefix}-`),
  );
}

export function discoverCodexSkills(cwd: string | null): ProviderListSkillsResult {
  const skills: ProviderSkillDescriptor[] = [];
  const seen = new Set<string>();

  for (const dir of codexSkillsDirectories(cwd)) {
    for (const skill of scanCodexSkillsDirectory(dir)) {
      if (seen.has(skill.name)) continue;
      if (isCompanyIntegrationSkill(skill.name)) continue;
      seen.add(skill.name);
      skills.push(skill);
    }
  }

  return {
    skills,
    source: "filesystem",
    cached: false,
  };
}

// ---------------------------------------------------------------------------
// Codex plugins — from the real openai/plugins marketplace (dev-focused only,
// company integrations like GitHub/Slack/Figma/Notion excluded per user preference)
// ---------------------------------------------------------------------------

const CODEX_DEV_PLUGINS: ProviderPluginDescriptor[] = [
  codexPlugin(
    "build-web-apps",
    "Build Web Apps",
    "Web app workflows: UI reviews, React improvements, deployment, database design",
    "Web Development",
  ),
  codexPlugin(
    "build-ios-apps",
    "Build iOS Apps",
    "iOS workflows: App Intents, SwiftUI, refactors, performance audits, simulator debugging",
    "Mobile Development",
  ),
  codexPlugin(
    "build-macos-apps",
    "Build macOS Apps",
    "Build, run, test, debug macOS apps with Xcode, SwiftUI, and AppKit interop",
    "Desktop Development",
  ),
  codexPlugin(
    "test-android-apps",
    "Test Android Apps",
    "Test Android apps with emulator: reproduction, screenshots, UI inspection, log capture",
    "Mobile Development",
  ),
  codexPlugin(
    "game-studio",
    "Game Studio",
    "Design, prototype, and ship browser games with 2D/3D workflows and playtesting",
    "Game Development",
  ),
  codexPlugin(
    "life-science-research",
    "Life Science Research",
    "Research workflows: query routing, evidence synthesis, parallel analysis across biology and chemistry",
    "Research",
  ),
  codexPlugin(
    "hugging-face",
    "Hugging Face",
    "Inspect models, datasets, Spaces, and ML research on the Hugging Face platform",
    "AI Development",
  ),
];

function codexPlugin(
  name: string,
  displayName: string,
  description: string,
  category: string,
): ProviderPluginDescriptor {
  return {
    id: `codex:${name}`,
    name,
    source: { type: "local" as const, path: `/plugins/${name}` },
    installed: true,
    enabled: true,
    installPolicy: "INSTALLED_BY_DEFAULT" as const,
    authPolicy: "ON_USE" as const,
    interface: {
      displayName,
      shortDescription: description,
      category,
      developerName: "OpenAI",
    },
  };
}

export function discoverCodexPlugins(_cwd: string | null): ProviderListPluginsResult {
  return {
    marketplaces: [
      {
        name: "codex-plugins",
        path: "/marketplaces/codex-plugins",
        interface: { displayName: "Codex Plugins" },
        plugins: CODEX_DEV_PLUGINS,
      },
    ],
    marketplaceLoadErrors: [],
    remoteSyncError: null,
    featuredPluginIds: ["codex:build-web-apps", "codex:build-ios-apps", "codex:game-studio"],
    source: "filesystem",
    cached: false,
  };
}
