import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import { siblingsOf, tableEntries, type Slice } from "../document/document.ts";
import { uniqueName } from "../document/names.ts";
import { orderKeysAfter } from "../document/order.ts";
import { outputSlices } from "../document/slices.ts";
import { generateId } from "../ids.ts";
import { settings } from "../settings.ts";
import { sliceEditPatches } from "./slice-edits.ts";

const Count = z.number().int().min(1).max(settings.slices.maxSplit);

/**
 * Replaces a Slice with a grid of Slices tiling its Display rectangle, each
 * placed where its part of the parent sat on stage, under the same rotation
 * and scale. The first piece keeps the Slice's id, so what followed or
 * selected it follows the first piece. Names run `<name> 1…n`.
 */
export const sliceSplit = defineCommand({
  name: "slice.split",
  kind: "authoring",
  description:
    "Split a Slice into a grid of columns × rows Slices, each placed where its part sat; the first keeps the Slice's id and followers.",
  payload: z
    .object({ sliceId: z.string().min(1), columns: Count, rows: Count })
    .strict(),
  label: () => "Split Slice",
  apply({ document, payload }) {
    const slice = document.slices[payload.sliceId];
    if (slice === undefined)
      return rejected(`Slice “${payload.sliceId}” does not exist.`);
    const { columns, rows } = payload;
    if (columns * rows === 1) return accepted([]);
    if (columns > slice.rect.width || rows > slice.rect.height)
      return rejected(
        `Slice “${slice.name}” is ${slice.rect.width}×${slice.rect.height} pixels, too small for ${columns}×${rows} pieces.`,
      );
    const xs = cuts(slice.rect.width, columns);
    const ys = cuts(slice.rect.height, rows);
    const ordered = outputSlices(document.slices, slice.outputId);
    const keys =
      orderKeysAfter(ordered, slice.id, columns * rows - 1) ??
      orderKeysAfter(ordered, ordered.at(-1)?.id ?? null, columns * rows - 1) ??
      [];
    const taken = tableEntries(siblingsOf("slices", document.slices, slice))
      .filter((sibling) => sibling.id !== slice.id)
      .map((sibling) => sibling.name);
    const pieces: Slice[] = [];
    for (let row = 0; row < rows; row++)
      for (let column = 0; column < columns; column++) {
        const index = pieces.length;
        const name = uniqueName(taken, `${slice.name} ${index + 1}`);
        taken.push(name);
        pieces.push(
          piece(slice, {
            id: index === 0 ? slice.id : generateId("slice"),
            name,
            order: index === 0 ? slice.order : (keys[index - 1] ?? slice.order),
            left: xs[column] ?? 0,
            right: xs[column + 1] ?? slice.rect.width,
            top: ys[row] ?? 0,
            bottom: ys[row + 1] ?? slice.rect.height,
          }),
        );
      }
    return accepted(
      sliceEditPatches(document, { outputId: slice.outputId, set: pieces }),
    );
  },
});

/** Whole-pixel boundaries splitting `length` into `count` near-equal parts. */
function cuts(length: number, count: number): readonly number[] {
  return Array.from({ length: count + 1 }, (_, index) =>
    Math.round((index * length) / count),
  );
}

/**
 * One piece: the part of the parent's Display rectangle between `left` and
 * `right`, `top` and `bottom` (pixels from its top-left), placed where the
 * parent's rotation and scale put that part.
 */
function piece(
  parent: Slice,
  part: {
    readonly id: string;
    readonly name: string;
    readonly order: string;
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
  },
): Slice {
  const { width, height } = parent.rect;
  const { left, right, top, bottom } = part;
  const offset = {
    0: { x: left, y: top },
    90: { x: height - bottom, y: left },
    180: { x: width - right, y: height - bottom },
    270: { x: top, y: width - right },
  }[parent.rotation];
  return {
    id: part.id as Slice["id"],
    name: part.name,
    outputId: parent.outputId,
    rect: {
      x: parent.rect.x + left,
      y: parent.rect.y + top,
      width: right - left,
      height: bottom - top,
    },
    position: {
      x: parent.position.x + Math.round(offset.x * parent.scale),
      y: parent.position.y + Math.round(offset.y * parent.scale),
    },
    rotation: parent.rotation,
    scale: parent.scale,
    order: part.order,
  };
}
