import { defineShaderVisual } from "@difracta/render/sdk";

import { createCamera } from "./camera.ts";
import { createDirector } from "./director.ts";
import { MAX_BEAMS, MAX_LASERS, packBeams, packLasers } from "./fixtures.ts";
import { CATHEDRAL_CUES, CATHEDRAL_PARAMETERS } from "./parameters.ts";
import { CATHEDRAL_FRAGMENT } from "./scene-shader.ts";

/** The tangent of half the vertical view: about a 70 degree lens. */
const LENS = 0.7;
/** Fog Density 0 and 1 as haze extinction per world unit. */
const HAZE_MIN = 0.012;
const HAZE_MAX = 0.075;

export const cathedral = defineShaderVisual({
  id: "cathedral",
  name: "Cathedral",
  description:
    "A camera glides down an endless hall of stone pillars while a light show plays inside it: moving-head beams through haze, uplights, lasers and a strobe bank, directed by Cues through a track.",
  notes:
    "A whole venue on one Surface, built to run through a track: an endless raymarched hall (Architecture: Gothic clustered pillars under pointed ribs, or Brutalist square columns under a girder grid) with a wet mirror floor, seen by a camera dollying down the nave, lit only by a rig that lives inside it. Moving heads hang in pairs down the nave (Beams, 0 to 12) and cut volumetric shafts through the fog, uplights wash the pillars in Wash Color, a laser fan far ahead sweeps sheets of Laser Color toward the viewer, and a strobe bank hits everything white. It is opaque, a full picture rather than an overlay. Play it with Cues; one Layer carries the whole arc: Kick pulses the uplights and steps their chase a row down the hall, with a little camera jolt; Strobe fires the bank; Build makes the beams converge on the nave ahead, thickens the fog, slows the camera and raises the rig over Build Duration; Drop turns everything on at once, surges the camera forward with a hard shake and sends the beams sweeping wide and crossing, some swinging toward the audience; Breakdown fades the rig to one slow solo beam over dimmed stone; Calm returns to the resting show. Map Kick to the kick drum or the metronome, Strobe to a pad, and Build, Drop and Breakdown to the song's sections. Sections blend over a second or so (Drop in a tenth), so a Cue never cuts. Energy is the fader: it scales how fast the rig moves and how bright it is, on top of whatever section is playing; Camera Speed scales the dolly, which the sections also slow and surge. Fog Density changes how much the beams show: in thin haze they are faint rods and the hall reads far; thick haze makes solid shafts and swallows the far pillars. Shake scales how hard kicks and drops jolt the camera; zero keeps it steady. Beam Color A and B alternate across the rig like a checkerboard; Stone Color and Ambient set how much architecture shows between the lights, so a low Ambient leaves only what the rig lights. Cost is the highest in the Catalog and is set by Quality and Resolution: Low marches 36 steps with no occlusion and a matte floor, Medium 56 steps with occlusion and the rig mirrored in the floor, High 88 steps with the stone mirrored too. Resolution renders the hall at a share of the Surface's pixels and stretches it, redrawn every frame since the camera never stops; the default half resolution keeps Medium within an Output frame on an integrated GPU, and 25% is the setting for a weak machine or several Surfaces. Give it a Surface of its own at the bottom of a Scene; stack Flash Matrix, Blink or Strobe in Additive over it for hits, and avoid Filters that displace, which make the stretched picture look soft.",
  parameters: CATHEDRAL_PARAMETERS,
  cues: CATHEDRAL_CUES,
  fragment: CATHEDRAL_FRAGMENT,
  create({ random }) {
    const director = createDirector();
    const camera = createCamera(random);
    const origins = new Float32Array(MAX_BEAMS * 4);
    const directions = new Float32Array(MAX_BEAMS * 4);
    const lasers = new Float32Array(MAX_LASERS * 4);
    let rigTime = random() * 60;
    let laserTime = random() * 60;
    return {
      cue(key) {
        director.cue(key);
      },
      update({ dt, params }) {
        const look = director.advance(dt, params.buildDuration);
        const energy = params.energy;
        const pose = camera.advance(
          dt,
          params.cameraSpeed * look.travel,
          params.shake * look.shake,
        );
        rigTime += dt * look.sweep * (0.4 + 1.6 * energy);
        laserTime += dt * (0.5 + 1.5 * energy) * (0.5 + look.wild);
        const cameraZ = pose.position[2];
        const beamCount = packBeams(
          { cameraZ, time: rigTime, beams: params.beams, energy, look },
          origins,
          directions,
        );
        const fan = packLasers(
          { cameraZ, time: laserTime, amount: params.lasers, energy, look },
          lasers,
        );
        return {
          changed: true,
          resolution: params.renderResolution,
          uniforms: {
            camera: [...pose.position, LENS],
            camera_turn: pose.turn,
            beam_origins: { size: 4, values: origins },
            beam_dirs: { size: 4, values: directions },
            beam_count: beamCount,
            laser_origin: fan.origin,
            laser_dirs: { size: 4, values: lasers },
            laser_count: fan.count,
            wash: look.wash * (0.4 + 0.6 * energy),
            wash_chase: look.kicks % 4,
            strobe: look.strobe,
            haze:
              (HAZE_MIN + (HAZE_MAX - HAZE_MIN) * params.fogDensity) * look.fog,
            dim: look.dim,
          },
        };
      },
    };
  },
});
