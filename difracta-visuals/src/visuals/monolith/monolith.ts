import { defineShaderVisual } from "@difracta/render/sdk";

import { packAssembly, SLABS } from "./assembly.ts";
import { createDirector } from "./director.ts";
import { MONOLITH_CUES, monolithParameters } from "./parameters.ts";
import { MONOLITH_FRAGMENT } from "./scene-shader.ts";

export const monolith = defineShaderVisual({
  id: "monolith",
  name: "Monolith",
  description:
    "A suspended black monument seals around a charging slit, then tears open into a moving assembly of slabs and light. One Energy fader and section Cues carry a whole track.",
  notes:
    "A grand Visual for a wall or pillar: thirteen pairs of bevelled dark slabs float around a luminous spine, with coloured grazing lights revealing their machined faces. It draws an opaque black ground. Energy is the performance fader: it smoothly increases separation, torsion, motion and light within the playing section. Kick sends a compression and seam-light wave up the stack; repeated metronome hits overlap. Strobe and Flash are identical short white hits on the object, with both Cue keys available for existing mappings. Build aligns and seals the slabs around an increasingly bright slit over Build Duration, then holds; repeated Build does not restart it. Drop opens the assembly quickly with a flash, shake and expanding light ring, and the expanded moving show stays until another section Cue. Breakdown closes to a dark silhouette with one travelling light; Calm restores the breathing resting show. Reconfigure blends between Helix, Orbit and Fan arrangements even mid-transition, without changing section. All timing is integrated locally; use Chataigne to fire beat Cues, with no internal beat clock or MTC input required. Link a Number Controller to Energy and Color Controllers to Core Color, Rim Color A and Rim Color B. Separation and Torsion set the movement's reach; Motion Speed changes continuous motion without jumping and zero holds it while Cues and transitions remain active. Shake zero removes camera jolts. Camera Distance sets framing; narrow Surfaces automatically pull back to retain the expanded assembly. The spine, inner faces and recessed panel seams emit Core Color, the two rim lights reveal the silhouette, and Glow sets the escaping haze. Transparent Color Parameters dim their own light source; the ground remains opaque. Cost grows with pixel count: each ray tests slab bounds before tracing visible bevels, Low uses six bevel steps, Medium ten, and High sixteen plus shadows between slabs. Resolution defaults to 65%; reduce it for several Surfaces and use High only with GPU headroom. Give it a Surface of its own near the bottom of a Scene; restrained additive hits can sit above it, while strong displacement Filters obscure the slab detail.",
  parameters: monolithParameters,
  cues: MONOLITH_CUES,
  fragment: MONOLITH_FRAGMENT,
  create({ params: initial }) {
    const director = createDirector(initial);
    const poses = new Float32Array(SLABS * 4);
    const turns = new Float32Array(SLABS * 4);
    let tremor = 0;
    let pending = false;
    let previous: readonly number[] = [];
    return {
      cue(key) {
        if (!MONOLITH_CUES.some((cue) => cue.key === key)) return;
        director.cue(key);
        pending = true;
      },
      update({ dt, params, changed }) {
        const look = director.advance(dt, params);
        packAssembly(look, params, poses, turns);
        tremor = (tremor + dt * 31) % (Math.PI * 2);
        const jolt = look.shake * params.shake * 0.025;
        const yaw = 0.38 + Math.sin(look.phase) * 0.28;
        const pitch = 0.1 + Math.sin(look.phase * 2) * 0.045;
        const light = look.lightPhase;
        const joltVector = [
          Math.sin(tremor) * jolt,
          Math.sin(tremor * 3) * jolt * 0.7,
          Math.cos(tremor * 2) * jolt,
        ] as const;
        const state = [
          look.opening,
          look.tension,
          look.solo,
          look.energy,
          look.flash,
          look.impact,
          look.phase,
          light,
          ...joltVector,
          ...poses,
          ...turns,
        ];
        const moved = state.some((value, index) => value !== previous[index]);
        previous = state;
        const report = {
          changed: changed || pending || moved,
          resolution: params.renderResolution,
          uniforms: {
            poses: { size: 4 as const, values: poses },
            turns: { size: 4 as const, values: turns },
            opening: look.opening,
            tension: look.tension,
            solo: look.solo,
            charge: (0.3 + look.energy * 0.7) * (1 + look.tension * 2),
            flash: look.flash,
            impact: look.impact,
            key_light: [
              Math.cos(light) * 0.848,
              0.53,
              Math.sin(light) * 0.848,
            ] as const,
            fill_light: [-0.6, 0.25, 0.76] as const,
            scan: 0.5 + 0.5 * Math.sin(light),
            view: [Math.sin(yaw), pitch, Math.cos(yaw)] as const,
            jolt: joltVector,
          },
        };
        pending = false;
        return report;
      },
    };
  },
});
