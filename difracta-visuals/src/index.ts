import { Catalog } from "@difracta/core";

import { blur } from "./filters/blur.ts";
import { hueShift } from "./filters/hue-shift.ts";
import { pixelate } from "./filters/pixelate.ts";
import { driftingStars } from "./visuals/drifting-stars.ts";
import { gridPulse } from "./visuals/grid-pulse.ts";
import { pathRunner } from "./visuals/path-runner.ts";
import { plasma } from "./visuals/plasma.ts";
import { ribbonField } from "./visuals/ribbon-field.ts";
import { solidColor } from "./visuals/solid-color.ts";

/**
 * The built-in Catalog: every Visual and Filter Difracta ships, one file
 * each. Add a definition by importing it here.
 */
export const builtInCatalog = new Catalog({
  visuals: [
    solidColor,
    driftingStars,
    plasma,
    pathRunner,
    gridPulse,
    ribbonField,
  ],
  filters: [blur, hueShift, pixelate],
});

/** Where the thumbnails live: one `<id>.svg` per definition; a Filter's is a gray checkerboard through that Filter. */
export const thumbnailsRoot = new URL("../thumbnails/", import.meta.url);

export function thumbnailFile(id: string): string {
  return `${id}.svg`;
}
