import { Catalog } from "@difracta/core";

import { blockGlitch } from "./filters/block-glitch.ts";
import { chromaticAberration } from "./filters/chromatic-aberration.ts";
import { dither } from "./filters/dither.ts";
import { impactShake } from "./filters/impact-shake.ts";
import { pixelCrush } from "./filters/pixel-crush.ts";
import { punchZoom } from "./filters/punch-zoom.ts";
import { rollingTvTear } from "./filters/rolling-tv-tear.ts";
import { scanlines } from "./filters/scanlines.ts";
import { signalDistortion } from "./filters/signal-distortion.ts";
import { sliceShift } from "./filters/slice-shift.ts";
import { tileScramble } from "./filters/tile-scramble.ts";
import { waveDistortion } from "./filters/wave-distortion.ts";
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
import { frameEmbers } from "./visuals/frame-embers.ts";
import { frameGarland } from "./visuals/frame-garland.ts";
import { frameIvy } from "./visuals/frame-ivy.ts";
import { frameMarquee } from "./visuals/frame-marquee.ts";
import { frameNeon } from "./visuals/frame-neon.ts";
import { frameOrbit } from "./visuals/frame-orbit.ts";
import { frameStripes } from "./visuals/frame-stripes.ts";
import { pathHalo } from "./visuals/path-halo.ts";
import { pathRibbons } from "./visuals/path-ribbons.ts";
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
import { bladeCross } from "./visuals/blade-cross.ts";
import { lightSweep } from "./visuals/light-sweep.ts";
import { neonLattice } from "./visuals/neon-lattice.ts";
import { noiseField } from "./visuals/noise-field.ts";
import { orbitalArcs } from "./visuals/orbital-arcs.ts";
import { prismInterference } from "./visuals/prism-interference.ts";
import { ribbonCurrent } from "./visuals/ribbon-current.ts";
import { rotor } from "./visuals/rotor.ts";
import { shutter } from "./visuals/shutter.ts";
import { crtGlitch } from "./visuals/crt-glitch.ts";
import { flame } from "./visuals/flame.ts";
import { lavaLamp } from "./visuals/lava-lamp.ts";
import { nebula } from "./visuals/nebula.ts";
import { netherPortal } from "./visuals/nether-portal.ts";
import { plasmaTurbulence } from "./visuals/plasma-turbulence.ts";
import { smoke } from "./visuals/smoke.ts";
import { sunSurface } from "./visuals/sun-surface.ts";
import { synthHorizon } from "./visuals/synth-horizon.ts";
import { checkerFlicker } from "./visuals/checker-flicker.ts";
import { segmentStrobe } from "./visuals/segment-strobe.ts";
import { vortex } from "./visuals/vortex.ts";
import { cathedral } from "./visuals/cathedral/cathedral.ts";
import { zoomRush } from "./visuals/zoom-rush.ts";
import { liquidChrome } from "./visuals/liquid-chrome/liquid-chrome.ts";
import { monolith } from "./visuals/monolith/monolith.ts";

import { confetti } from "./visuals/confetti.ts";
import { glyphRain } from "./visuals/glyph-rain.ts";
import { graph } from "./visuals/graph.ts";
import { lissajous } from "./visuals/lissajous.ts";
import { rain } from "./visuals/rain.ts";
import { repeatingShapes } from "./visuals/repeating-shapes.ts";
import { snowDrift } from "./visuals/snow-drift.ts";

import { colorWipe } from "./visuals/color-wipe.ts";
import { fireworks } from "./visuals/fireworks.ts";
import { noiseBurst } from "./visuals/noise-burst.ts";
import { petalBuild } from "./visuals/petal-build.ts";
import { shockwave } from "./visuals/shockwave.ts";
import { shootingStars } from "./visuals/shooting-stars.ts";
import { silkWisp } from "./visuals/silk-wisp.ts";
import { sparkShower } from "./visuals/spark-shower.ts";
import { tileCascade } from "./visuals/tile-cascade.ts";
import { hyperdrive } from "./visuals/hyperdrive.ts";
import { laserRain } from "./visuals/laser-rain.ts";
import { sirenBeacon } from "./visuals/siren-beacon.ts";

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
    frameMarquee,
    frameStripes,
    frameOrbit,
    frameNeon,
    frameEmbers,
    pathHalo,
    frameGarland,
    frameIvy,
    pathRibbons,
    bladeCross,
    rotor,
    orbitalArcs,
    ribbonCurrent,
    lightSweep,
    shutter,
    noiseField,
    prismInterference,
    neonLattice,
    crtGlitch,
    flame,
    lavaLamp,
    nebula,
    netherPortal,
    plasmaTurbulence,
    smoke,
    sunSurface,
    synthHorizon,
    segmentStrobe,
    checkerFlicker,
    zoomRush,
    liquidChrome,
    monolith,
    vortex,
    cathedral,
    confetti,
    glyphRain,
    graph,
    lissajous,
    rain,
    repeatingShapes,
    snowDrift,
    shockwave,
    tileCascade,
    colorWipe,
    noiseBurst,
    fireworks,
    petalBuild,
    shootingStars,
    silkWisp,
    sparkShower,
    hyperdrive,
    sirenBeacon,
    laserRain,
  ],
  filters: [
    tileScramble,
    impactShake,
    signalDistortion,
    dither,
    scanlines,
    chromaticAberration,
    waveDistortion,
    rollingTvTear,
    blockGlitch,
    punchZoom,
    pixelCrush,
    sliceShift,
  ],
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
