import { defineShaderVisual } from "@difracta/render/sdk";

import { createDirector } from "./director.ts";
import { ENVIRONMENT_SHADER } from "./environment-shader.ts";
import { FORMS_SHADER } from "./forms-shader.ts";
import { liquidChromeParameters } from "./parameters.ts";
import {
  axes,
  DROPLETS,
  droplets,
  SATELLITES,
  satellites,
} from "./sculpture.ts";
import { SHADING_SHADER } from "./shading-shader.ts";

export const liquidChrome = defineShaderVisual({
  id: "liquid-chrome",
  name: "Liquid Chrome",
  description:
    "A floating sculpture of liquid metal morphs between forms, pooling like mercury and reflecting a studio of pulsing light bars; it ripples on a Kick and bursts into droplets on a Shatter.",
  notes:
    "A centrepiece for a big Surface, left running through a track with hits played on top. A camera orbits a chrome sculpture on a dark stage; the metal reflects a studio of six softbox strips alternating Light Colors A and B, an overhead box and a horizon ring, with a halo around the silhouette and a floor that catches a pool of light and, from Medium Quality, the sculpture's reflection. Form is where it starts (Mercury Cluster, Torus, Urchin, Gyroid Orb, Twisted Ring) and choosing another morphs there; Morph goes to the next one in Form Order over Morph Duration, Automatic Rate does that on its own, and a morph asked for mid-morph waits for the running one, so it never jumps. Energy is the fader: it speeds the surface wobble, the rotation and the light drift, deepens the wobble and enlarges what a Kick does. Kick sends a ripple and spikes over the surface (Spikiness sets how far), pulses every light and knocks the camera; Flash burns the lights white; Shatter is the drop, bursting the sculpture into nine droplets that hang, circle and pull back together over about three seconds, and it can be fired again mid-flight. Viscosity is how readily parts pool into each other, Iridescence runs oil-slick colour over the metal, Glow is the halo and the floor pool, Shake how hard hits knock the camera, Camera Distance how much of the Surface it fills. Background alpha below 100% lets the stage show whatever is under the Layer, keeping the metal, halo and floor light. Cost is the point to watch: it raymarches every pixel inside the sculpture's bounding sphere, so Resolution and Quality are the controls. Resolution renders into a smaller buffer stretched over the Surface (60% is soft but clean on a wall); Low marches 36 steps with plain environment reflections, Medium 64 steps with occlusion and a floor reflection, High 96 steps with the metal also reflecting itself. On an Intel Iris Xe at 1920 by 1080 the defaults add about 2 ms a frame to what any full-frame shader costs, about 3 ms during a Shatter or morph; at 100% Resolution a Shatter or morph adds about 8 ms, so keep full Resolution for smaller Surfaces or quiet sections. Give it a Surface of its own rather than stacking several. Stack Strobe or Blink in Additive over it for the drop, or Flash Matrix on the hats while Kick rides the kick drum.",
  parameters: liquidChromeParameters,
  cues: [
    { key: "kick", label: "Kick" },
    { key: "morph", label: "Morph" },
    { key: "shatter", label: "Shatter" },
    { key: "flash", label: "Flash" },
  ],
  fragment: `
uniform float u_time;
uniform float u_orbit;
uniform float u_lights;
uniform float u_form_a;
uniform float u_form_b;
uniform float u_morph;
uniform float u_kick;
uniform float u_ripple;
uniform float u_flash;
uniform float u_shatter;
uniform vec3 u_camera_shake;
const int SATELLITES = ${String(SATELLITES)};
const int DROPLETS = ${String(DROPLETS)};
uniform vec4 u_satellites[SATELLITES];
uniform vec4 u_droplets[DROPLETS];
uniform vec3 u_axis_x;
uniform vec3 u_axis_y;
uniform vec3 u_axis_z;
${FORMS_SHADER}
${ENVIRONMENT_SHADER}
${SHADING_SHADER}`,
  create({ random, params: initial }) {
    const director = createDirector(random, initial);
    return {
      cue(key) {
        director.cue(key);
      },
      update({ dt, params }) {
        const frame = director.advance(dt, params);
        const [axisX, axisY, axisZ] = axes(frame.time);
        return {
          // The surface always wobbles, so every frame is new.
          changed: true,
          blank:
            params.background[3] <= 0 &&
            params.metalColor[3] <= 0 &&
            params.lightColorA[3] <= 0 &&
            params.lightColorB[3] <= 0,
          resolution: params.renderResolution,
          uniforms: {
            time: frame.time,
            orbit: frame.orbit,
            lights: frame.lights,
            form_a: frame.formA,
            form_b: frame.formB,
            morph: frame.morph,
            kick: frame.kick,
            ripple: frame.ripple,
            flash: frame.flash,
            shatter: frame.shatter,
            camera_shake: frame.cameraShake,
            satellites: { size: 4, values: satellites(frame.time) },
            droplets: {
              size: 4,
              values: droplets(frame.shatter, frame.shatterSpin),
            },
            axis_x: axisX,
            axis_y: axisY,
            axis_z: axisZ,
          },
        };
      },
    };
  },
});
