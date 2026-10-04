import { z } from "zod";

import { defineCommand } from "../command/command.ts";
import { MASK_POINTS } from "../document/document.ts";
import { PointSchema } from "../document/geometry.ts";
import {
  pointAdd,
  pointNudge,
  pointRemove,
  pointSet,
  withPoints,
} from "./polygon-points.ts";

/** Set and nudge share one coalesce key per point. */
const Index = z.number().int().nonnegative();
const pointKey = ({
  outputMaskId,
  index,
}: {
  outputMaskId: string;
  index: number;
}) => `output-mask.point:${outputMaskId}:${String(index)}`;
const NOUN = "Output Mask";

export const outputMaskPointSet = defineCommand({
  name: "output-mask.point.set",
  kind: "authoring",
  description: "Place one point of an Output Mask, in its Projection Frame.",
  payload: z
    .object({
      outputMaskId: z.string().min(1),
      index: Index,
      point: PointSchema,
    })
    .strict(),
  label: () => "Move Output Mask point",
  coalesceKey: pointKey,
  apply: ({ document, payload }) =>
    withPoints(document, "outputMasks", NOUN, payload.outputMaskId, (points) =>
      pointSet(NOUN, points, payload.index, payload.point),
    ),
});

/** Relative, so repeated nudges from a held key apply in full whatever order their replies arrive in. */
export const outputMaskPointNudge = defineCommand({
  name: "output-mask.point.nudge",
  kind: "authoring",
  description:
    "Shift one point of an Output Mask by a delta in its Projection Frame.",
  payload: z
    .object({ outputMaskId: z.string().min(1), index: Index, by: PointSchema })
    .strict(),
  label: () => "Move Output Mask point",
  coalesceKey: pointKey,
  apply: ({ document, payload }) =>
    withPoints(document, "outputMasks", NOUN, payload.outputMaskId, (points) =>
      pointNudge(NOUN, points, payload.index, payload.by),
    ),
});

/** Inserts a point halfway along the edge that leaves point `after`. */
export const outputMaskPointAdd = defineCommand({
  name: "output-mask.point.add",
  kind: "authoring",
  description: "Add a point to an Output Mask after an existing one.",
  payload: z.object({ outputMaskId: z.string().min(1), after: Index }).strict(),
  label: () => "Add Output Mask point",
  apply: ({ document, payload }) =>
    withPoints(document, "outputMasks", NOUN, payload.outputMaskId, (points) =>
      pointAdd(NOUN, MASK_POINTS, points, payload.after),
    ),
});

export const outputMaskPointRemove = defineCommand({
  name: "output-mask.point.remove",
  kind: "authoring",
  description: "Remove a point from an Output Mask.",
  payload: z.object({ outputMaskId: z.string().min(1), index: Index }).strict(),
  label: () => "Remove Output Mask point",
  apply: ({ document, payload }) =>
    withPoints(document, "outputMasks", NOUN, payload.outputMaskId, (points) =>
      pointRemove(NOUN, MASK_POINTS, points, payload.index),
    ),
});
