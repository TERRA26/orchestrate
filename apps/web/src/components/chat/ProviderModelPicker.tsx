import { type ModelSlug, type ProviderKind, type ServerProvider } from "@orchestrate/contracts";
import { formatModelDisplayName, resolveSelectableModel } from "@orchestrate/shared/model";
import { memo, useState } from "react";
import { type ProviderPickerKind, PROVIDER_OPTIONS } from "../../session-logic";
import {
  Menu,
  MenuGroup,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "../ui/menu";
import { ClaudeAI, Icon, OpenAI } from "../Icons";
import { cn } from "~/lib/utils";
import { PickerTriggerButton } from "./PickerTriggerButton";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

function isAvailableProviderOption(option: (typeof PROVIDER_OPTIONS)[number]): option is {
  value: ProviderKind;
  label: string;
  available: true;
} {
  return option.available;
}

const PROVIDER_ICON_BY_PROVIDER: Record<ProviderPickerKind, Icon> = {
  codex: OpenAI,
  claudeAgent: ClaudeAI,
};

function resolveLiveProviderAvailability(provider: ServerProvider | undefined): {
  /**
   * Short uppercase status badge shown next to the provider label.
   *
   * The picker never hard-disables a provider on a probe failure — the probe
   * can be wrong (stale, run before the user installed/signed in, run against
   * a non-default PATH) and blocking selection traps users on the other
   * provider. The badge gives an actionable hint; the runtime error path
   * gives the authoritative answer if they actually try to use it.
   */
  label: string | null;
} {
  if (!provider) {
    return { label: null };
  }

  if (provider.installed === false) {
    return { label: "Not installed" };
  }

  const authStatus = provider.authStatus ?? provider.auth?.status ?? "unknown";
  if (authStatus === "unauthenticated") {
    return { label: "Sign in" };
  }

  if (provider.available === false) {
    return { label: "Unavailable" };
  }

  return { label: null };
}

export const AVAILABLE_PROVIDER_OPTIONS = PROVIDER_OPTIONS.filter(isAvailableProviderOption);
const UNAVAILABLE_PROVIDER_OPTIONS = PROVIDER_OPTIONS.filter((option) => !option.available);

function providerIconClassName(
  provider: ProviderKind | ProviderPickerKind,
  fallbackClassName: string,
): string {
  return provider === "claudeAgent" ? "orch-prov-claude" : fallbackClassName;
}

export const ProviderModelPicker = memo(function ProviderModelPicker(props: {
  provider: ProviderKind;
  model: ModelSlug;
  lockedProvider: ProviderKind | null;
  providers?: ReadonlyArray<ServerProvider>;
  modelOptionsByProvider: Record<ProviderKind, ReadonlyArray<{ slug: string; name: string }>>;
  activeProviderIconClassName?: string;
  compact?: boolean;
  disabled?: boolean;
  /**
   * Optional shortcut label rendered in a hover tooltip on the trigger so
   * users can discover the keyboard shortcut without having to dig through
   * the keybindings UI. Pass e.g. "⌘M" or "Ctrl+M".
   */
  shortcutLabel?: string | null;
  onProviderModelChange: (provider: ProviderKind, model: ModelSlug) => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const activeProvider = props.lockedProvider ?? props.provider;
  const selectedProviderOptions = props.modelOptionsByProvider[activeProvider];
  // Prefer the provider-supplied option name (covers custom slugs); fall back
  // to the shared display-name table so unknown slugs still render as
  // "GPT-5.5" / "Claude Opus 4.7" instead of raw lowercase identifiers.
  const selectedModelLabel =
    selectedProviderOptions.find((option) => option.slug === props.model)?.name ??
    formatModelDisplayName(props.model) ??
    props.model;
  const ProviderIcon = PROVIDER_ICON_BY_PROVIDER[activeProvider];
  const handleModelChange = (provider: ProviderKind, value: string) => {
    if (props.disabled) return;
    if (!value) return;
    const resolvedModel = resolveSelectableModel(
      provider,
      value,
      props.modelOptionsByProvider[provider],
    );
    if (!resolvedModel) return;
    props.onProviderModelChange(provider, resolvedModel);
    setIsMenuOpen(false);
  };

  return (
    <Menu
      open={isMenuOpen}
      onOpenChange={(open) => {
        if (props.disabled) {
          setIsMenuOpen(false);
          return;
        }
        setIsMenuOpen(open);
      }}
    >
      {props.shortcutLabel ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <MenuTrigger
                render={
                  <PickerTriggerButton
                    disabled={props.disabled ?? false}
                    compact={props.compact ?? false}
                    icon={
                      <ProviderIcon
                        aria-hidden="true"
                        className={cn(
                          "size-3.5 shrink-0",
                          providerIconClassName(activeProvider, "text-muted-foreground/70"),
                          props.activeProviderIconClassName,
                        )}
                      />
                    }
                    label={selectedModelLabel}
                  />
                }
              />
            }
          >
            <span className="sr-only">{selectedModelLabel}</span>
          </TooltipTrigger>
          {!isMenuOpen ? (
            <TooltipPopup side="top" sideOffset={6}>
              <span className="inline-flex items-center gap-2 px-1 py-0.5 text-xs">
                <span>Change model</span>
                <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {props.shortcutLabel}
                </kbd>
              </span>
            </TooltipPopup>
          ) : null}
        </Tooltip>
      ) : (
        <MenuTrigger
          render={
            <PickerTriggerButton
              disabled={props.disabled ?? false}
              compact={props.compact ?? false}
              icon={
                <ProviderIcon
                  aria-hidden="true"
                  className={cn(
                    "size-3.5 shrink-0",
                    providerIconClassName(activeProvider, "text-muted-foreground/70"),
                    props.activeProviderIconClassName,
                  )}
                />
              }
              label={selectedModelLabel}
            />
          }
        >
          <span className="sr-only">{selectedModelLabel}</span>
        </MenuTrigger>
      )}
      <MenuPopup align="start">
        {props.lockedProvider !== null ? (
          <MenuGroup>
            <MenuRadioGroup
              value={props.model}
              onValueChange={(value) => handleModelChange(props.lockedProvider!, value)}
            >
              {props.modelOptionsByProvider[props.lockedProvider].map((modelOption) => (
                <MenuRadioItem
                  key={`${props.lockedProvider}:${modelOption.slug}`}
                  value={modelOption.slug}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {modelOption.name}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuGroup>
        ) : (
          <>
            {AVAILABLE_PROVIDER_OPTIONS.map((option) => {
              const OptionIcon = PROVIDER_ICON_BY_PROVIDER[option.value];
              const liveProvider = props.providers?.find(
                (entry) => entry.provider === option.value,
              );
              const availability = resolveLiveProviderAvailability(liveProvider);
              return (
                <MenuSub key={option.value}>
                  <MenuSubTrigger>
                    <OptionIcon
                      aria-hidden="true"
                      className={cn(
                        "size-4 shrink-0",
                        providerIconClassName(option.value, "text-muted-foreground/85"),
                      )}
                    />
                    <span>{option.label}</span>
                    {availability.label ? (
                      <span className="ms-auto text-[10px] text-muted-foreground/70 uppercase tracking-[0.08em]">
                        {availability.label}
                      </span>
                    ) : null}
                  </MenuSubTrigger>
                  <MenuSubPopup className="[--available-height:min(24rem,70vh)]">
                    <MenuGroup>
                      <MenuRadioGroup
                        value={props.provider === option.value ? props.model : ""}
                        onValueChange={(value) => handleModelChange(option.value, value)}
                      >
                        {props.modelOptionsByProvider[option.value].map((modelOption) => (
                          <MenuRadioItem
                            key={`${option.value}:${modelOption.slug}`}
                            value={modelOption.slug}
                            onClick={() => setIsMenuOpen(false)}
                          >
                            {modelOption.name}
                          </MenuRadioItem>
                        ))}
                      </MenuRadioGroup>
                    </MenuGroup>
                  </MenuSubPopup>
                </MenuSub>
              );
            })}
            {UNAVAILABLE_PROVIDER_OPTIONS.length > 0 && <MenuSeparator />}
            {UNAVAILABLE_PROVIDER_OPTIONS.map((option) => {
              const OptionIcon = PROVIDER_ICON_BY_PROVIDER[option.value];
              return (
                <MenuItem key={option.value} disabled>
                  <OptionIcon
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground/85 opacity-80"
                  />
                  <span>{option.label}</span>
                  <span className="ms-auto text-[11px] text-muted-foreground/80 uppercase tracking-[0.08em]">
                    Coming soon
                  </span>
                </MenuItem>
              );
            })}
          </>
        )}
      </MenuPopup>
    </Menu>
  );
});
