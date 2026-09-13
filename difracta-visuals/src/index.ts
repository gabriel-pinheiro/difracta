import { Catalog } from "@difracta/core";

import { impactShake } from "./filters/impact-shake.ts";
import { signalDistortion } from "./filters/signal-distortion.ts";
import { tileScramble } from "./filters/tile-scramble.ts";
import { barcodeRunner } from "./visuals/barcode-runner.ts";
import { beamWeb } from "./visuals/beam-web.ts";
import { blink } from "./visuals/blink.ts";
import { bubbles } from "./visuals/bubbles.ts";
import { chevronFlight } from "./visuals/chevron-flight.ts";
import { contourDrift } from "./visuals/contour-drift.ts";
import { conveyor } from "./visuals/conveyor.ts";
import { flashMatrix } from "./visuals/flash-matrix.ts";
import { frameElectric } from "./visuals/frame-electric.ts";
import { gradient } from "./visuals/gradient.ts";
import { koiPond } from "./visuals/koi-pond.ts";
import { lightningStrikes } from "./visuals/lightning-strikes.ts";
import { movingHeadSpot } from "./visuals/moving-head-spot.ts";
import { pixelBar } from "./visuals/pixel-bar.ts";
import { radialStreaks } from "./visuals/radial-streaks.ts";
import { scannerShot } from "./visuals/scanner-shot.ts";
import { solidColor } from "./visuals/solid-color.ts";
import { spot } from "./visuals/spot.ts";
import { starField } from "./visuals/star-field.ts";
import { strobe } from "./visuals/strobe.ts";
import { tensionLines } from "./visuals/tension-lines.ts";
import { thunder } from "./visuals/thunder.ts";
import { tunnel } from "./visuals/tunnel.ts";
import { waterCaustics } from "./visuals/water-caustics.ts";

/**
 * The built-in Catalog: every Visual and Filter Difracta ships, one file
 * each. Add a definition by importing it here.
 */
export const builtInCatalog = new Catalog({
  visuals: [
    solidColor,
    koiPond,
    bubbles,
    blink,
    strobe,
    thunder,
    beamWeb,
    lightningStrikes,
    frameElectric,
    gradient,
    spot,
    tunnel,
    waterCaustics,
    conveyor,
    chevronFlight,
    contourDrift,
    radialStreaks,
    barcodeRunner,
    starField,
    movingHeadSpot,
    flashMatrix,
    scannerShot,
    pixelBar,
    tensionLines,
  ],
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
