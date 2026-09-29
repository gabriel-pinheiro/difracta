import type { Surface, SurfaceSize } from "@difracta/core";
import { FieldRow } from "@/inspector/fields/field-row";
import { OptionalNumber } from "@/inspector/fields/optional-number";

/**
 * A Surface's real width and height, in any unit. Empty is Automatic: the
 * shape then follows the mapping, which is right whenever the projector
 * faces the Surface and wrong at a steep angle, where a square projects as
 * a tall trapezoid.
 */
export function SizeField({
  surface,
  onCommit,
}: {
  readonly surface: Surface;
  readonly onCommit: (size: SurfaceSize | null) => void;
}) {
  const size = surface.size;
  return (
    <FieldRow
      label="Size"
      description="Real width and height, any unit; empty is automatic"
      onReset={size === null ? undefined : () => onCommit(null)}
    >
      <OptionalNumber
        label="Width of the Surface"
        placeholder="auto"
        value={size?.width}
        onCommit={(width) =>
          onCommit(
            width === undefined
              ? null
              : { width, height: size?.height ?? width },
          )
        }
      />
      <span className="text-[0.6875rem] text-muted-foreground">×</span>
      <OptionalNumber
        label="Height of the Surface"
        placeholder="auto"
        value={size?.height}
        onCommit={(height) =>
          onCommit(
            height === undefined
              ? null
              : { width: size?.width ?? height, height },
          )
        }
      />
    </FieldRow>
  );
}
