import type { RowParent } from "@/navigator/ancestor-rows";

/** A Slice's row is under its Output. */
export const sliceParent: RowParent = (document, id) => {
  const outputId = document.slices[id]?.outputId;
  return outputId === undefined ? undefined : { kind: "output", id: outputId };
};
