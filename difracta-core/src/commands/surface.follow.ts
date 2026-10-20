import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import type { MappingFollow, SurfaceMapping } from "../document/document.ts";
import { pickOutput, resolvedCorners } from "../document/mappings.ts";
import { isSliced } from "../document/slices.ts";

/**
 * Has a Surface's mapping on one Output follow one of its Slices or the
 * whole Projection Frame instead of its corners, which lie dormant; null
 * unlinks it, writing where it was into the corners so it does not jump.
 * Following needs an Output with Slices.
 */
export const surfaceFollow = defineCommand({
  name: "surface.follow",
  kind: "authoring",
  description:
    'Make a Surface\'s mapping follow a Slice (its id or name) or "frame" (the whole Projection Frame) of an Output with Slices; null unlinks it back to corners.',
  payload: z
    .object({
      surfaceId: z.string().min(1),
      /** The Output whose mapping follows; needed once the Surface is on several. */
      output: z.string().min(1).optional(),
      follow: z.union([z.string().min(1), z.null()]),
    })
    .strict(),
  label: ({ follow }) =>
    follow === null ? "Unlink Surface" : "Follow with Surface",
  apply({ document, payload }) {
    const surface = document.surfaces[payload.surfaceId];
    if (surface === undefined)
      return rejected(`Surface “${payload.surfaceId}” does not exist.`);
    const picked = pickOutput(document, surface, payload.output);
    if (!picked.ok) return rejected(picked.error);
    const { outputId } = picked;
    const output = document.outputs[outputId];
    const mapping = surface.mappings[outputId];
    if (output === undefined || mapping === undefined)
      return rejected(
        `Surface “${surface.name}” has no mapping for its Output.`,
      );
    let next: SurfaceMapping;
    if (payload.follow === null) {
      if (mapping.follow === undefined) return accepted([]);
      next = {
        enabled: mapping.enabled,
        corners: resolvedCorners(document, mapping, outputId),
      };
    } else {
      if (!isSliced(document.slices, outputId))
        return rejected(
          `Output “${output.name}” has no Slices; only an Output with Slices can be followed.`,
        );
      let follow: MappingFollow;
      if (payload.follow === "frame") follow = { frame: true };
      else {
        const slice = document.slices[payload.follow];
        if (slice?.outputId !== outputId)
          return rejected(
            `Slice “${payload.follow}” is not a Slice of Output “${output.name}”.`,
          );
        follow = { slice: slice.id };
      }
      if (JSON.stringify(mapping.follow) === JSON.stringify(follow))
        return accepted([]);
      next = { enabled: mapping.enabled, corners: mapping.corners, follow };
    }
    return accepted([
      {
        op: "set",
        path: ["surfaces", surface.id, "mappings", outputId],
        value: next,
      },
    ]);
  },
});
