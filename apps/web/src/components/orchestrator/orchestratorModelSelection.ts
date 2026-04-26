import type { ModelSelection, ProviderKind, ServerProvider } from "@orchestrate/contracts";

import { getDefaultServerModel, getProviderModels } from "~/providerModels";

const PROVIDER_REQUEST_PATTERNS: Record<ProviderKind, ReadonlyArray<RegExp>> = {
  claudeAgent: [
    /\b(?:use|using|with|via|prefer|choose|pick|select|switch(?:ing)?\s+to)\s+(?:the\s+)?claude\b/i,
    /\b(?:use|using|with|via|prefer|choose|pick|select|switch(?:ing)?\s+to)\s+(?:the\s+)?(?:claude\s+)?(?:opus|sonnet|haiku)\b/i,
    /\bhave\s+(?:the\s+)?(?:agent|worker|assistant|orchestrator)\s+use\s+(?:the\s+)?claude\b/i,
  ],
  codex: [
    /\b(?:use|using|with|via|prefer|choose|pick|select|switch(?:ing)?\s+to)\s+(?:the\s+)?(?:gpt|codex|openai)\b/i,
    /\b(?:use|using|with|via|prefer|choose|pick|select|switch(?:ing)?\s+to)\s+(?:the\s+)?gpt[\s.-]*5\b/i,
    /\bhave\s+(?:the\s+)?(?:agent|worker|assistant|orchestrator)\s+use\s+(?:the\s+)?(?:gpt|codex)\b/i,
  ],
};

const CLAUDE_MODEL_HINTS = ["opus", "sonnet", "haiku"] as const;

export interface RequestedWorkerModelSelection {
  requestedProvider: ProviderKind;
  matchedModel: string;
  selection: ModelSelection;
}

function normalizeMatchText(input: string): string {
  return input
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, " ")
    .trim();
}

function detectRequestedProvider(userRequest: string): ProviderKind | null {
  for (const provider of ["claudeAgent", "codex"] as const) {
    if (PROVIDER_REQUEST_PATTERNS[provider].some((pattern) => pattern.test(userRequest))) {
      return provider;
    }
  }
  return null;
}

function buildModelTokens(provider: ProviderKind, slug: string, name: string): string[] {
  const normalizedSlug = normalizeMatchText(slug);
  const normalizedName = normalizeMatchText(name);
  const tokens = new Set<string>([normalizedSlug, normalizedName]);

  if (provider === "claudeAgent") {
    const family = CLAUDE_MODEL_HINTS.find((hint) => normalizedSlug.includes(hint));
    if (family) {
      tokens.add(family);
      const familyVersion = normalizedName.replace(/^claude\s+/, "");
      if (familyVersion.length > family.length) {
        tokens.add(familyVersion);
      }
    }
  }

  return [...tokens].filter((token) => token.length >= 4);
}

function resolveRequestedModel(
  userRequest: string,
  provider: ProviderKind,
  providers: ReadonlyArray<ServerProvider>,
): string | null {
  const normalizedRequest = normalizeMatchText(userRequest);
  const models = getProviderModels(providers, provider);
  const candidates = models
    .flatMap((model) =>
      buildModelTokens(provider, model.slug, model.name).map((token) => ({
        slug: model.slug,
        token,
      })),
    )
    .toSorted((left, right) => right.token.length - left.token.length);

  return candidates.find((candidate) => normalizedRequest.includes(candidate.token))?.slug ?? null;
}

export function resolveRequestedWorkerModelSelection(input: {
  userRequest: string;
  providers: ReadonlyArray<ServerProvider>;
  fallbackSelection: ModelSelection;
  storedModelSelections?: Partial<Record<ProviderKind, ModelSelection>>;
}): RequestedWorkerModelSelection | null {
  const requestedProvider = detectRequestedProvider(input.userRequest);
  if (!requestedProvider) {
    return null;
  }

  const rememberedSelection =
    input.storedModelSelections?.[requestedProvider] ??
    (input.fallbackSelection.provider === requestedProvider ? input.fallbackSelection : null);
  const matchedModel =
    resolveRequestedModel(input.userRequest, requestedProvider, input.providers) ??
    rememberedSelection?.model ??
    getDefaultServerModel(input.providers, requestedProvider);

  const selection: ModelSelection = {
    provider: requestedProvider,
    model: matchedModel,
    ...(rememberedSelection?.options ? { options: rememberedSelection.options } : {}),
  };

  return {
    requestedProvider,
    matchedModel,
    selection,
  };
}
