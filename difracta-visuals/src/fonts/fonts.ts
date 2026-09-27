import type { ChoiceParameter, FontDefinition } from "@difracta/core";

/**
 * The Bundled Fonts: the typefaces Difracta ships, so text looks the same
 * on every Output whatever the machine has installed. Each is one weight,
 * chosen to read from a distance, in two files: Latin, then Latin
 * Extended. Inter comes first, since every other font falls back to it
 * for the characters it lacks. All are under the SIL Open Font License;
 * the licences are in `fonts/licenses/`.
 */
export const bundledFonts: readonly FontDefinition[] = [
  {
    kind: "font",
    id: "inter",
    name: "Inter",
    description: "A neutral sans, semibold: the plain choice for any text.",
    files: ["inter-latin.woff2", "inter-latin-ext.woff2"],
  },
  {
    kind: "font",
    id: "bebas-neue",
    name: "Bebas Neue",
    description:
      "A condensed display face in capitals only, for titles that fill a wall.",
    files: ["bebas-neue-latin.woff2", "bebas-neue-latin-ext.woff2"],
  },
  {
    kind: "font",
    id: "jetbrains-mono",
    name: "JetBrains Mono",
    description: "A bold monospace: terminals, codes, anything in columns.",
    files: ["jetbrains-mono-latin.woff2", "jetbrains-mono-latin-ext.woff2"],
  },
  {
    kind: "font",
    id: "playfair-display",
    name: "Playfair Display",
    description: "A bold serif of high contrast, for an elegant title.",
    files: ["playfair-display-latin.woff2", "playfair-display-latin-ext.woff2"],
  },
  {
    kind: "font",
    id: "fredoka",
    name: "Fredoka",
    description: "A rounded, friendly semibold.",
    files: ["fredoka-latin.woff2", "fredoka-latin-ext.woff2"],
  },
  {
    kind: "font",
    id: "dseg7-classic",
    name: "DSEG7 Classic",
    description:
      "A seven-segment display: digits and the letters seven segments can spell.",
    files: ["dseg7-classic.woff2"],
  },
];

/** Where the fonts' files live. */
export const fontsRoot = new URL("../../fonts/", import.meta.url);

/**
 * The Parameter every text Visual declares to choose its Bundled Font,
 * always with the same label and options, each drawn in its own face.
 */
export function fontParameter(
  overrides: Partial<Pick<ChoiceParameter, "default" | "description">> = {},
): ChoiceParameter {
  return {
    kind: "choice",
    label: "Font",
    default: "inter",
    options: bundledFonts.map((font) => ({
      value: font.id,
      label: font.name,
      font: font.id,
    })),
    ...overrides,
  };
}
