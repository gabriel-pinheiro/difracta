import type { RowParent } from "@/navigator/ancestor-rows";

/** An Output Mask's row is under its Output. */
export const outputMaskParent: RowParent = (document, id) => {
  const outputId = document.outputMasks[id]?.outputId;
  return outputId === undefined ? undefined : { kind: "output", id: outputId };
};
