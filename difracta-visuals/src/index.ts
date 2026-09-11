import { Catalog } from "@difracta/core";

import { impactShake } from "./filters/impact-shake.ts";
import { signalDistortion } from "./filters/signal-distortion.ts";
import { tileScramble } from "./filters/tile-scramble.ts";
import { bubbles } from "./visuals/bubbles.ts";
import { koiPond } from "./visuals/koi-pond.ts";
import { solidColor } from "./visuals/solid-color.ts";

/**
 * The built-in Catalog: every Visual and Filter Difracta ships, one file
 * each. Add a definition by importing it here.
 */
export const builtInCatalog = new Catalog({
  visuals: [solidColor, koiPond, bubbles],
  filters: [tileScramble, impactShake, signalDistortion],
});

/**
 * Where the thumbnails live: one `<id>.png` per definition, rendered by
 * `npm run thumbnails` through the compositor itself (a Filter over a gray
 * checkerboard), so a thumbnail is what the definition does.
 */
export const thumbnailsRoot = new URL("../thumbnails/", import.meta.url);

export function thumbnailFile(id: string): string {
  return `${id}.png`;
}
