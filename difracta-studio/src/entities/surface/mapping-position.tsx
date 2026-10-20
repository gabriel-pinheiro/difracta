import type { DocumentView } from "@difracta/client";
import type { Slice, SurfaceMapping } from "@difracta/core";
import { Link2Off } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SelectField } from "@/inspector/fields/select-field";
import { useCommand } from "@/lib/client";

import {
  followLabel,
  followPayload,
  positionOptions,
  positionValue,
  type PositionValue,
} from "./mapping-follow";

/**
 * Where the mapping puts the Surface on an Output with Slices: its own
 * corners, the whole frame, or one Slice. Following shows what it follows
 * and Unlink, which keeps the Surface where it is as corners.
 */
export function MappingPosition({
  view,
  surfaceId,
  outputId,
  mapping,
  slices,
}: {
  readonly view: DocumentView;
  readonly surfaceId: string;
  readonly outputId: string;
  readonly mapping: SurfaceMapping;
  readonly slices: readonly Slice[];
}) {
  const command = useCommand(view);
  const send = (value: PositionValue) =>
    void command("surface.follow", followPayload(surfaceId, outputId, value));
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
      <SelectField
        label="Position"
        value={positionValue(mapping)}
        options={positionOptions(slices)}
        onValueChange={(value) => {
          if (value !== null) send(value);
        }}
      />
      {mapping.follow !== undefined && (
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-[0.6875rem] text-muted-foreground">
            {followLabel(mapping.follow, slices)}
          </p>
          <Button size="xs" variant="outline" onClick={() => send("corners")}>
            <Link2Off data-icon="inline-start" /> Unlink
          </Button>
        </div>
      )}
    </div>
  );
}
