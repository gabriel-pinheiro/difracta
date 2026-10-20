import type { DisplaySize, Output, SliceRect } from "@difracta/core";

/** One command a gesture sends, as data. */
export interface CommandStep {
  readonly name: string;
  readonly payload: Record<string, unknown>;
}

/**
 * The commands that add a Slice to `output`: its Display size first when it
 * has none (the size Studio offers), then `slice.create`. Without `rect`
 * core picks the place: the whole frame for the first Slice, the largest
 * empty rectangle after, the top-left quarter when the frame is full. The
 * first Slice of an Output is "Panel", made to be split; the rest "Slice".
 */
export function createSliceSteps({
  output,
  sliceCount,
  offered,
  id,
  rect,
}: {
  readonly output: {
    readonly id: string;
    readonly displaySize: Output["displaySize"];
  };
  readonly sliceCount: number;
  readonly offered: DisplaySize;
  readonly id: string;
  readonly rect?: SliceRect | undefined;
}): readonly CommandStep[] {
  return [
    ...(output.displaySize === null
      ? [
          {
            name: "output.update",
            payload: { outputId: output.id, displaySize: offered },
          },
        ]
      : []),
    {
      name: "slice.create",
      payload: {
        id,
        outputId: output.id,
        name: sliceCount === 0 && rect === undefined ? "Panel" : "Slice",
        ...(rect === undefined ? {} : { rect }),
      },
    },
  ];
}
