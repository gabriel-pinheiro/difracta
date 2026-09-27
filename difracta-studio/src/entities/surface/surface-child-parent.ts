import type { SurfaceChildTable } from "@difracta/core";

import type { RowParent } from "@/navigator/ancestor-rows";

/** For Regions, Masks or Paths: their row is under their Surface. */
export function surfaceChildParent(table: SurfaceChildTable): RowParent {
  return (document, id) => {
    const surfaceId = document[table][id]?.surfaceId;
    return surfaceId === undefined
      ? undefined
      : { kind: "surface", id: surfaceId };
  };
}
