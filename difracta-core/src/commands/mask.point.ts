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
const pointKey = ({ maskId, index }: { maskId: string; index: number }) =>
  `mask.point:${maskId}:${String(index)}`;
const NOUN = "Mask";

export const maskPointSet = defineCommand({
  name: "mask.point.set",
  kind: "authoring",
  description: "Place one point of a Mask, in Surface Space.",
  payload: z
    .object({ maskId: z.string().min(1), index: Index, point: PointSchema })
    .strict(),
  label: () => "Move Mask point",
  coalesceKey: pointKey,
  apply: ({ document, payload }) =>
    withPoints(document, "masks", NOUN, payload.maskId, (points) =>
      pointSet(NOUN, points, payload.index, payload.point),
    ),
});

/** Relative, so repeated nudges from a held key apply in full whatever order their replies arrive in. */
export const maskPointNudge = defineCommand({
  name: "mask.point.nudge",
  kind: "authoring",
  description: "Shift one point of a Mask by a delta in Surface Space.",
  payload: z
    .object({ maskId: z.string().min(1), index: Index, by: PointSchema })
    .strict(),
  label: () => "Move Mask point",
  coalesceKey: pointKey,
  apply: ({ document, payload }) =>
    withPoints(document, "masks", NOUN, payload.maskId, (points) =>
      pointNudge(NOUN, points, payload.index, payload.by),
    ),
});

/** Inserts a point halfway along the edge that leaves point `after`. */
export const maskPointAdd = defineCommand({
  name: "mask.point.add",
  kind: "authoring",
  description: "Add a point to a Mask after an existing one.",
  payload: z.object({ maskId: z.string().min(1), after: Index }).strict(),
  label: () => "Add Mask point",
  apply: ({ document, payload }) =>
    withPoints(document, "masks", NOUN, payload.maskId, (points) =>
      pointAdd(NOUN, MASK_POINTS, points, payload.after),
    ),
});

export const maskPointRemove = defineCommand({
  name: "mask.point.remove",
  kind: "authoring",
  description: "Remove a point from a Mask.",
  payload: z.object({ maskId: z.string().min(1), index: Index }).strict(),
  label: () => "Remove Mask point",
  apply: ({ document, payload }) =>
    withPoints(document, "masks", NOUN, payload.maskId, (points) =>
      pointRemove(NOUN, MASK_POINTS, points, payload.index),
    ),
});
