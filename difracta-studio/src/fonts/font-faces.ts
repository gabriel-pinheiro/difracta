import { settings, type FontDefinition } from "@difracta/core";

/** Studio's own sans stack, `--font-sans` in `index.css`: what a Bundled Font falls back to. */
const STUDIO_SANS = '"Geist Variable", ui-sans-serif, sans-serif';

/** One file of a Bundled Font as the browser loads it: a family of its own, so no unicode-range is needed. */
export interface FontFaceSource {
  readonly family: string;
  readonly url: string;
}

/**
 * The family each file of a Bundled Font loads as: "Difracta <id>" for the
 * first, "Difracta <id> ext" for the second, numbered from the third on.
 */
export function fontFamilies(font: FontDefinition): readonly string[] {
  return font.files.map((_, index) => {
    const family = `Difracta ${font.id}`;
    if (index === 0) return family;
    return index === 1 ? `${family} ext` : `${family} ext ${String(index)}`;
  });
}

/** Where the runtime serves a Bundled Font's file, next to the live socket. */
export function fontUrl(file: string): string {
  return `${settings.runtime.fontsPath}/${encodeURIComponent(file)}`;
}

/** What to load for a Bundled Font: each of its files under its family. */
export function fontFaceSources(
  font: FontDefinition,
): readonly FontFaceSource[] {
  const families = fontFamilies(font);
  return font.files.map((file, index) => ({
    family: families[index] ?? "",
    url: fontUrl(file),
  }));
}

/**
 * The `font-family` that draws text in a Bundled Font: its families in the
 * order of its files, then Studio's sans, which shows until the font has
 * loaded and whenever it fails to.
 */
export function fontStack(font: FontDefinition): string {
  return [
    ...fontFamilies(font).map((family) => `"${family}"`),
    STUDIO_SANS,
  ].join(", ");
}
