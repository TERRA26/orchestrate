import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Regression test for low-contrast text colors. Scans index.css for the
 * `color: color-mix(in srgb, var(--foreground|--muted-foreground) <N>%,
 * transparent)` pattern and asserts N >= 65 unless the surrounding
 * selector targets a decorative pseudo-element (::before, ::after,
 * ::marker, ::placeholder, ::-webkit-scrollbar, ::file-selector-button).
 *
 * 65% is the floor for primary text content; lower percentages cross
 * below WCAG AA 4.5:1 in dark mode against neutral backgrounds.
 *
 * @see ORC-075
 */

const CSS_PATH = path.resolve(__dirname, "index.css");
const MIN_FOREGROUND_PERCENT = 65;
const DECORATIVE_PSEUDO_PATTERN =
  /::(before|after|marker|placeholder|-webkit-scrollbar|file-selector-button)/;

interface ColorMixOffender {
  readonly line: number;
  readonly percentage: number;
  readonly selectorContext: string;
  readonly text: string;
}

function findLowContrastTextColors(css: string): ColorMixOffender[] {
  const lines = css.split("\n");
  const offenders: ColorMixOffender[] = [];

  const matchPattern =
    /^\s*color:\s*color-mix\(\s*in srgb\s*,\s*var\(\s*--(?:foreground|muted-foreground)\s*\)\s*(\d+)%\s*,\s*transparent\s*\)/;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const match = matchPattern.exec(line);
    if (!match) continue;

    const percentage = Number.parseInt(match[1] ?? "0", 10);
    if (Number.isNaN(percentage)) continue;
    if (percentage >= MIN_FOREGROUND_PERCENT) continue;

    // Walk backward to collect the selector(s) that opened this block.
    let selectorContext = "";
    for (let scan = index - 1; scan >= 0 && scan >= index - 60; scan -= 1) {
      const candidate = lines[scan] ?? "";
      selectorContext = `${candidate}\n${selectorContext}`;
      if (candidate.trimEnd().endsWith("{")) break;
    }

    if (DECORATIVE_PSEUDO_PATTERN.test(selectorContext)) continue;

    offenders.push({
      line: index + 1,
      percentage,
      selectorContext: selectorContext.trim().slice(-160),
      text: line.trim(),
    });
  }

  return offenders;
}

describe("index.css text-color contrast (ORC-075)", () => {
  it("does not contain low-percentage foreground/muted-foreground text colors on primary content", () => {
    const css = readFileSync(CSS_PATH, "utf8");
    const offenders = findLowContrastTextColors(css);
    expect(
      offenders,
      `Low-contrast text colors detected. Bump foreground/muted-foreground percentages ` +
        `to >= ${MIN_FOREGROUND_PERCENT}% on primary content. Use ::before/::after/::marker/` +
        `::placeholder selectors for genuinely decorative glyphs.\n` +
        offenders
          .map(
            (o) =>
              `  line ${o.line}: ${o.percentage}% in selector \`${o.selectorContext.replace(/\s+/g, " ")}\``,
          )
          .join("\n"),
    ).toEqual([]);
  });

  it("permits decorative low-contrast colors under ::before / ::marker pseudo-selectors", () => {
    const css = readFileSync(CSS_PATH, "utf8");
    // Sanity-check: the decorative ::before chevron and ::marker should
    // still be present (we did NOT bump them in the fix). If a future
    // refactor removes them, that's fine; this assertion just documents
    // the current decorative set so the maintainer knows what's exempt.
    expect(css).toMatch(/::before[\s\S]{0,400}color: color-mix\([^)]+--foreground\)\s*40%/);
  });
});
