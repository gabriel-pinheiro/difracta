import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { BlendModeSchema } from "../document/document.ts";
import type { Patch } from "../document/patch.ts";

/**
 * Settings of a Layer, each optional so one call changes any subset. Fields
 * are checked against the Layer's kind: opacity, blend mode and Target
 * belong to Visual Layers, mix to Filter Layers, enabled to all.
 */
export const layerUpdate = defineCommand({
  name: "layer.update",
  kind: "authoring",
  description:
    "Change a Layer's enabled state, opacity, blend mode, mix or Target.",
  payload: z
    .object({
      layerId: z.string().min(1),
      enabled: z.boolean().optional(),
      opacity: z.number().min(0).max(1).optional(),
      blendMode: BlendModeSchema.optional(),
      mix: z.number().min(0).max(1).optional(),
      /** Surface id, or null for no Target. */
      target: z.string().min(1).nullable().optional(),
    })
    .strict(),
  label: ({ enabled, ...rest }) =>
    enabled !== undefined && Object.keys(rest).length === 1
      ? enabled
        ? "Enable Layer"
        : "Disable Layer"
      : "Change Layer settings",
  coalesceKey: ({ layerId, ...fields }) =>
    `layer.update:${layerId}:${Object.keys(fields).sort().join(",")}`,
  apply({ document, payload }) {
    const layer = document.layers[payload.layerId];
    if (layer === undefined)
      return rejected(`Layer “${payload.layerId}” does not exist.`);
    const patches: Patch[] = [];
    const set = (field: string, value: unknown): void => {
      if ((layer as Record<string, unknown>)[field] === value) return;
      patches.push({ op: "set", path: ["layers", layer.id, field], value });
    };
    if (payload.enabled !== undefined) set("enabled", payload.enabled);
    const visualOnly = ["opacity", "blendMode", "target"] as const;
    for (const field of visualOnly) {
      if (payload[field] === undefined) continue;
      if (layer.kind !== "visual")
        return rejected(`Only Visual Layers have ${field}.`);
      if (
        field === "target" &&
        payload.target !== null &&
        payload.target !== undefined &&
        !(payload.target in document.surfaces)
      )
        return rejected(`Surface “${payload.target}” does not exist.`);
      set(field, payload[field]);
    }
    if (payload.mix !== undefined) {
      if (layer.kind !== "filter")
        return rejected("Only Filter Layers have mix.");
      set("mix", payload.mix);
    }
    return accepted(patches);
  },
});
