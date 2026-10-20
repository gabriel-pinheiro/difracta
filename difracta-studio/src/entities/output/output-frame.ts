import {
  outputSlices,
  projectionFrame,
  type DisplaySize,
  type Slice,
  type Table,
} from "@difracta/core";

/** What the frame of an Output depends on. */
export interface FramedOutput {
  readonly id: string;
  readonly displaySize: DisplaySize | null;
}

export interface FrameSize {
  readonly width: number;
  readonly height: number;
}

/**
 * The Projection Frame's size as Studio knows it: computed from the
 * Output's Slices when it has some, else what its Output Session reports,
 * else its Display size; undefined when nothing says.
 */
export function knownFrameSize(
  output: FramedOutput | undefined,
  slices: Table<Slice>,
  reported: FrameSize | undefined,
): FrameSize | undefined {
  if (output === undefined) return reported;
  const own = outputSlices(slices, output.id);
  if (own.length > 0) return projectionFrame(output, own);
  return reported ?? output.displaySize ?? undefined;
}

/**
 * The Projection Frame in pixels, for showing corners in pixels: from the
 * Slices, or the Display Frame of an unsliced Output with a Display size;
 * undefined while the Output has neither.
 */
export function pixelFrame(
  output: FramedOutput | undefined,
  slices: Table<Slice>,
): ReturnType<typeof projectionFrame> {
  return output === undefined
    ? undefined
    : projectionFrame(output, outputSlices(slices, output.id));
}
