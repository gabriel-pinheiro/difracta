import { Catalog } from "@difracta/core";
import { builtInCatalog } from "@difracta/visuals";

import {
  cssColor,
  defineFilter,
  defineShaderVisual,
  defineVisual,
  renderResolution,
} from "../src/sdk/index.ts";

/**
 * The Catalog the GPU suite renders with: every built-in definition plus a
 * few made for the tests, whose behaviour is exact enough to check by
 * pixel. This module runs on both sides: the tests build documents with
 * it in Node, and the page instantiates it in the browser.
 */
const color = {
  color: { kind: "color", label: "Color", default: [1, 0, 0, 1] },
} as const;

/** A shader Visual painting one flat colour over the whole Surface. */
export const flatShader = defineShaderVisual({
  id: "test-flat-shader",
  name: "Flat shader",
  description: "One flat color from a fragment.",
  parameters: color,
  fragment: `vec4 render_visual(vec2 uv) { return u_color; }`,
});

/** A shader Visual at its Resolution Parameter: the top half in its colour, the bottom half blue. */
export const scaledShader = defineShaderVisual({
  id: "test-scaled-shader",
  name: "Scaled shader",
  description: "Two halves, rendered at a Resolution.",
  parameters: {
    ...color,
    renderResolution: renderResolution({ default: 0.5 }),
  },
  fragment: `vec4 render_visual(vec2 uv) {
  return uv.y < 0.5 ? u_color : vec4(0.0, 0.0, 1.0, 1.0);
}`,
  create: () => ({
    update: ({ params, changed }) => ({
      changed,
      resolution: params.renderResolution,
    }),
  }),
});

/** A canvas Visual that redraws its colour on every frame. */
export const alwaysRedraws = defineVisual({
  id: "test-always-redraws",
  name: "Always redraws",
  description: "A flat color that reports a change every frame.",
  parameters: color,
  create: () => ({
    update: () => ({ changed: true }),
    render({ context, width, height, params }) {
      context.fillStyle = cssColor(params.color);
      context.fillRect(0, 0, width, height);
    },
  }),
});

/** A canvas Visual whose second update throws. */
export const throwsOnSecondFrame = defineVisual({
  id: "test-throws",
  name: "Throws",
  description: "Draws once, then its update throws.",
  parameters: color,
  create: () => {
    let updates = 0;
    return {
      update: () => {
        updates += 1;
        if (updates === 2) throw new Error("Second frame is too much.");
        return { changed: true };
      },
      render({ context, width, height, params }) {
        context.fillStyle = cssColor(params.color);
        context.fillRect(0, 0, width, height);
      },
    };
  },
});

/** Returns the frame as it is: a pass that forces the chain without changing a pixel. */
export const passthrough = defineFilter({
  id: "test-passthrough",
  name: "Passthrough",
  description: "The frame, unchanged.",
  parameters: {},
  fragment: `vec4 filter_image(vec2 uv) { return sample_input(uv); }`,
});

/** Inverts the colour and makes every pixel opaque, so the empty frame turns white. */
export const invert = defineFilter({
  id: "test-invert",
  name: "Invert",
  description: "One minus every channel, opaque.",
  parameters: {},
  fragment: `vec4 filter_image(vec2 uv) {
  return vec4(1.0 - sample_input(uv).rgb, 1.0);
}`,
});

/** Halves every colour channel; does not commute with invert. */
export const halve = defineFilter({
  id: "test-halve",
  name: "Halve",
  description: "Every channel at half.",
  parameters: {},
  fragment: `vec4 filter_image(vec2 uv) {
  vec4 c = sample_input(uv);
  return vec4(c.rgb * 0.5, c.a);
}`,
});

export const testCatalog = new Catalog({
  visuals: [
    ...builtInCatalog.visuals(),
    flatShader,
    scaledShader,
    alwaysRedraws,
    throwsOnSecondFrame,
  ],
  filters: [...builtInCatalog.filters(), passthrough, invert, halve],
});
