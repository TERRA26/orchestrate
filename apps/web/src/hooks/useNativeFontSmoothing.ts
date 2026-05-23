// FILE: useNativeFontSmoothing.ts
// Purpose: Apply macOS-native antialiased font smoothing for a sharper text render.
// Layer: Web appearance hook
// Exports: useNativeFontSmoothing

import { useEffect } from "react";
import { isMacPlatform } from "../lib/utils";

export function useNativeFontSmoothing(enabled = true) {
  const shouldApply =
    enabled && isMacPlatform(typeof navigator === "undefined" ? "" : navigator.platform);

  useEffect(() => {
    const rootStyle = document.documentElement.style;
    if (shouldApply) {
      rootStyle.setProperty("-webkit-font-smoothing", "antialiased");
      rootStyle.setProperty("-moz-osx-font-smoothing", "grayscale");
    } else {
      rootStyle.removeProperty("-webkit-font-smoothing");
      rootStyle.removeProperty("-moz-osx-font-smoothing");
    }
  }, [shouldApply]);
}
