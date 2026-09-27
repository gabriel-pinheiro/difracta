import { catalog } from "@/lib/catalog";

import { fontFaceSources, fontStack } from "./font-faces";

/** The font files asked for and not refused, so each loads once. */
const started = new Set<string>();

/**
 * Loads one Bundled Font into the page, once. Text already styled with its
 * stack redraws in it when it arrives. A file that fails to load leaves
 * that text in Studio's sans and is asked for again the next time.
 */
export function loadBundledFont(id: string): void {
  const font = catalog.font(id);
  if (font === undefined || typeof FontFace === "undefined") return;
  for (const { family, url } of fontFaceSources(font)) {
    if (started.has(url)) continue;
    started.add(url);
    try {
      const face = new FontFace(family, `url("${url}")`);
      document.fonts.add(face);
      face.load().catch(() => {
        document.fonts.delete(face);
        started.delete(url);
      });
    } catch {
      started.delete(url);
    }
  }
}

/** Loads every Bundled Font, for a dropdown that draws each option in its own. */
export function loadBundledFonts(): void {
  for (const font of catalog.fonts()) loadBundledFont(font.id);
}

/** The `font-family` for text drawn in the Bundled Font `id`, or undefined when the Catalog has no such font. */
export function bundledFontStack(id: string | undefined): string | undefined {
  const font = id === undefined ? undefined : catalog.font(id);
  return font === undefined ? undefined : fontStack(font);
}
