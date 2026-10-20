import type { Point } from "@difracta/core";

import { NumberField } from "./number-field";
import { fromPercent, toPercent } from "./points";
import type { PixelSpace } from "./polygon-editor";

/**
 * The selected point's X and Y: percentages of the space, or, with
 * `pixels`, whole pixels of it. Commits one axis at a time, normalized.
 */
export function PointFields({
  point,
  pixels,
  onCommit,
}: {
  readonly point: Point;
  readonly pixels: PixelSpace | undefined;
  readonly onCommit: (axis: Partial<Point>) => void;
}) {
  if (pixels === undefined)
    return (
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="X"
          unit="%"
          step={0.1}
          value={toPercent(point.x)}
          onCommit={(value) => onCommit({ x: fromPercent(value) })}
        />
        <NumberField
          label="Y"
          unit="%"
          step={0.1}
          value={toPercent(point.y)}
          onCommit={(value) => onCommit({ y: fromPercent(value) })}
        />
      </div>
    );
  return (
    <div className="grid grid-cols-2 gap-2">
      <NumberField
        label="X"
        unit="px"
        decimals={0}
        step={1}
        value={pixels.x + point.x * pixels.width}
        onCommit={(value) => onCommit({ x: (value - pixels.x) / pixels.width })}
      />
      <NumberField
        label="Y"
        unit="px"
        decimals={0}
        step={1}
        value={pixels.y + point.y * pixels.height}
        onCommit={(value) =>
          onCommit({ y: (value - pixels.y) / pixels.height })
        }
      />
    </div>
  );
}
