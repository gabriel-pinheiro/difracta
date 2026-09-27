import type { Catalog, FontDefinition } from "@difracta/core";

export type FontStatus = "loading" | "ready" | "failed";

export interface FontLoaderOptions {
  readonly catalog: Catalog;
  /** Where a Bundled Font's file is fetched from, by file name. */
  readonly fontUrl: (file: string) => string | undefined;
}

/** The family a Bundled Font's file is registered under: its first file the font's own, the rest numbered. */
export function fontFamily(id: string, index = 0): string {
  return index === 0 ? `Difracta ${id}` : `Difracta ${id} ${String(index + 1)}`;
}

/**
 * The CSS font list text in a Bundled Font is drawn with: the font's
 * files, then the first font's of the Catalog for the characters it
 * lacks, then the system's, so only a script none of them covers depends
 * on the machine.
 */
export function fontStack(
  font: FontDefinition,
  fallback: FontDefinition | undefined,
): string {
  const families = [font, ...(fallback === font ? [] : [fallback])].flatMap(
    (entry) =>
      entry === undefined
        ? []
        : entry.files.map((_, index) => `"${fontFamily(entry.id, index)}"`),
  );
  return [...families, "system-ui", "sans-serif"].join(", ");
}

/**
 * The Bundled Fonts of one Output, all loaded when it starts, so a Layer
 * changed to another font mid-set finds it there. A font is ready once
 * its first file is: a further file that fails only costs the characters
 * it held. It is kept outside the GPU resources, so a lost context loads
 * nothing again. Where the page has no `FontFace`, or no URL is given,
 * every font stays loading.
 */
export class FontLoader {
  readonly #catalog: Catalog;
  readonly #status = new Map<string, FontStatus>();
  #version = 0;

  constructor({ catalog, fontUrl }: FontLoaderOptions) {
    this.#catalog = catalog;
    for (const font of catalog.fonts()) {
      this.#status.set(font.id, "loading");
      if (typeof FontFace === "undefined") continue;
      font.files.forEach((file, index) => {
        const url = fontUrl(file);
        if (url === undefined) return;
        const face = new FontFace(
          fontFamily(font.id, index),
          `url(${JSON.stringify(url)})`,
        );
        face.load().then(
          () => {
            document.fonts.add(face);
            if (index === 0) this.#settle(font.id, "ready");
            else this.#version += 1;
          },
          (error: unknown) => {
            console.error(
              `Bundled Font “${font.name}” (${file}) cannot be loaded:`,
              error,
            );
            if (index === 0) this.#settle(font.id, "failed");
          },
        );
      });
    }
  }

  /** Advances whenever a font's file arrives or a font fails. */
  get version(): number {
    return this.#version;
  }

  /**
   * The font list to draw `id` with, or undefined while it, or the font
   * it falls back to, is loading. Throws for an id the Catalog lacks and
   * for a font that failed.
   */
  stack(id: string): string | undefined {
    const font = this.#catalog.font(id);
    if (font === undefined)
      throw new Error(`“${id}” is not a Bundled Font of this Catalog.`);
    const status = this.#status.get(id);
    if (status === "failed")
      throw new Error(`Bundled Font “${font.name}” could not be loaded.`);
    const [fallback] = this.#catalog.fonts();
    if (status !== "ready") return undefined;
    if (fallback !== undefined && this.#status.get(fallback.id) === "loading")
      return undefined;
    return fontStack(
      font,
      fallback !== undefined && this.#status.get(fallback.id) === "ready"
        ? fallback
        : undefined,
    );
  }

  #settle(id: string, status: FontStatus): void {
    this.#status.set(id, status);
    this.#version += 1;
  }
}
