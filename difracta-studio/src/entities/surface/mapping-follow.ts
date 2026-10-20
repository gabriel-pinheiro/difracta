import type { MappingFollow, Slice, SurfaceMapping } from "@difracta/core";

/** The Position choice of a Surface Mapping on an Output with Slices, as data. */

/** What the Position select holds: free corners, the whole frame, or a Slice's id. */
export type PositionValue = "corners" | "frame" | (string & {});

export function positionValue(mapping: SurfaceMapping): PositionValue {
  const follow = mapping.follow;
  if (follow === undefined) return "corners";
  return "frame" in follow ? "frame" : follow.slice;
}

/** The choices on an Output with these Slices: corners always, the rest only with Slices. */
export function positionOptions(
  slices: readonly Slice[],
): readonly { readonly value: PositionValue; readonly label: string }[] {
  return [
    { value: "corners", label: "Corners" },
    ...(slices.length === 0
      ? []
      : [
          { value: "frame", label: "Whole frame" },
          ...slices.map((slice) => ({
            value: slice.id,
            label: `Slice ${slice.name}`,
          })),
        ]),
  ];
}

/** The `surface.follow` payload a Position choice sends. */
export function followPayload(
  surfaceId: string,
  outputId: string,
  value: PositionValue,
): {
  readonly surfaceId: string;
  readonly output: string;
  readonly follow: string | null;
} {
  return {
    surfaceId,
    output: outputId,
    follow: value === "corners" ? null : value,
  };
}

/** What a following mapping says in place of its corners. */
export function followLabel(
  follow: MappingFollow,
  slices: readonly Slice[],
): string {
  if ("frame" in follow) return "Follows the whole frame";
  const slice = slices.find((candidate) => candidate.id === follow.slice);
  return `Follows Slice ${slice?.name ?? follow.slice}`;
}
